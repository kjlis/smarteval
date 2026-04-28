import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { DatasetRow, ImageArtifact } from "./schemas.js";

export const judgeOutputSchema = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  raw_response: z.string().optional()
});

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export interface JudgeInput {
  example: DatasetRow;
  output: string;
  rubric: string;
  reference?: unknown;
  image_artifact?: ImageArtifact & { absolute_path: string };
  reference_image_artifact?: Partial<ImageArtifact> & { image_path: string; absolute_path: string };
}

export interface JudgeResult extends JudgeOutput {
  provider: string;
}

export interface JudgeProvider {
  readonly name: string;
  score(input: JudgeInput): Promise<JudgeResult>;
}

type ModuleLoader = () => Promise<Record<string, unknown>>;
type CodexInput = string | Array<{ type: "text"; text: string } | { type: "local_image"; path: string }>;

const optionalImport = (specifier: string): Promise<Record<string, unknown>> =>
  new Function("specifier", "return import(specifier);")(specifier) as Promise<Record<string, unknown>>;

function imagePathLines(input: JudgeInput): string[] {
  return [
    input.image_artifact ? `Generated image path: ${input.image_artifact.absolute_path}` : undefined,
    input.reference_image_artifact ? `Reference image path: ${input.reference_image_artifact.absolute_path}` : undefined
  ].filter(Boolean) as string[];
}

function buildJudgePrompt(input: JudgeInput): string {
  return [
    "You are evaluating one target output.",
    "Return only JSON with this shape: {\"score\": number, \"passed\": boolean, \"rationale\": string, \"confidence\": number, \"metadata\": object}.",
    ...imagePathLines(input),
    `Rubric:\n${input.rubric}`,
    `Example:\n${JSON.stringify(input.example)}`,
    `Reference:\n${JSON.stringify(input.reference ?? null)}`,
    `Target output:\n${input.output}`
  ].join("\n\n");
}

function codexJudgeInput(input: JudgeInput): CodexInput {
  const images = [
    input.image_artifact?.absolute_path,
    input.reference_image_artifact?.absolute_path
  ].filter(Boolean) as string[];
  if (images.length === 0) return buildJudgePrompt(input);
  return [
    { type: "text", text: buildJudgePrompt(input) },
    ...images.map((path) => ({ type: "local_image" as const, path }))
  ];
}

function textFromSdkResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("SDK judge returned an unsupported result shape.");
  }
  const record = result as Record<string, unknown>;
  if (typeof record.result === "string") return record.result;
  if (typeof record.finalResponse === "string") return record.finalResponse;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    return record.content
      .map((item) =>
        item && typeof item === "object" && "text" in item
          ? String((item as Record<string, unknown>).text ?? "")
          : ""
      )
      .join("\n");
  }
  throw new Error("SDK judge returned no text result.");
}

async function runClaudeQuery(sdk: Record<string, unknown>, promptText: string, model?: string, allowedTools: string[] = []): Promise<string> {
  const query = sdk.query;
  if (typeof query !== "function") {
    throw new Error("Claude Agent SDK module did not export unstable_v2_prompt or query.");
  }
  const messages = query({
    prompt: promptText,
    options: {
      model,
      allowedTools
    }
  }) as AsyncIterable<unknown>;
  let lastText = "";
  for await (const message of messages) {
    if (typeof message === "string") lastText = message;
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.subtype && record.subtype !== "success") {
      throw new Error(`Claude Agent SDK judge failed with subtype ${String(record.subtype)}.`);
    }
    if (typeof record.result === "string") lastText = record.result;
    else if (typeof record.text === "string") lastText = record.text;
    else if (typeof record.content === "string") lastText = record.content;
  }
  if (!lastText) throw new Error("Claude Agent SDK query returned no text result.");
  return lastText;
}

export function parseJudgeOutput(raw: string): JudgeOutput {
  const candidates = [
    raw.trim(),
    raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    raw.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = judgeOutputSchema.parse(JSON.parse(candidate));
      return { ...parsed, raw_response: raw };
    } catch {
      // Try the next repair candidate.
    }
  }

  throw new Error("Judge response did not contain valid structured JSON.");
}

export class CommandJudgeProvider implements JudgeProvider {
  readonly name = "command";

  constructor(private readonly command: string[], private readonly cwd = process.cwd()) {
    if (command.length === 0) throw new Error("Command judge requires a command.");
  }

  async score(input: JudgeInput): Promise<JudgeResult> {
    const [command, ...args] = this.command;
    const raw = await new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `Command judge exited with status ${code}.`));
      });
      child.stdin.end(JSON.stringify(input));
    });

    return { ...parseJudgeOutput(raw), provider: this.name };
  }
}

export class OpenRouterJudgeProvider implements JudgeProvider {
  readonly name = "openrouter_api";

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
    }
  ) {}

  async score(input: JudgeInput): Promise<JudgeResult> {
    const userContent = await openRouterUserContent(input);
    const response = await fetch(`${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          {
            role: "system",
            content:
              "You are an evaluation judge. Return only JSON with score, passed, rationale, confidence, and optional metadata."
          },
          {
            role: "user",
            content: userContent
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter judge failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter judge response did not include message content.");
    return { ...parseJudgeOutput(content), provider: this.name };
  }
}

async function imageContentPart(artifact: { absolute_path: string; mime_type?: string } | undefined): Promise<unknown[]> {
  if (!artifact) return [];
  const bytes = await readFile(artifact.absolute_path);
  const mimeType = artifact.mime_type ?? "image/png";
  return [
    {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${bytes.toString("base64")}`
      }
    }
  ];
}

async function openRouterUserContent(input: JudgeInput): Promise<unknown> {
  if (!input.image_artifact && !input.reference_image_artifact) return JSON.stringify(input);
  return [
    {
      type: "text",
      text: JSON.stringify({
        example: input.example,
        output: input.output,
        rubric: input.rubric,
        reference: input.reference,
        image_artifact: input.image_artifact
          ? { ...input.image_artifact, absolute_path: undefined }
          : undefined,
        reference_image_artifact: input.reference_image_artifact
          ? { ...input.reference_image_artifact, absolute_path: undefined }
          : undefined
      })
    },
    ...(await imageContentPart(input.image_artifact)),
    ...(await imageContentPart(input.reference_image_artifact))
  ];
}

export class CodexSdkJudgeProvider implements JudgeProvider {
  readonly name = "codex_sdk";

  constructor(
    private readonly options: { model?: string } = {},
    private readonly loadModule: ModuleLoader = () => optionalImport("@openai/codex-sdk")
  ) {}

  async score(input: JudgeInput): Promise<JudgeResult> {
    let sdk: Record<string, unknown>;
    try {
      sdk = await this.loadModule();
    } catch (error) {
      throw new Error(`Codex SDK is not available. Install @openai/codex-sdk before using codex_sdk judges. ${(error as Error).message}`);
    }
    const Codex = sdk.Codex as (new (options: { model?: string }) => {
      startThread(): Promise<{ run(prompt: CodexInput): Promise<unknown> }>;
    }) | undefined;
    if (typeof Codex !== "function") {
      throw new Error("Codex SDK module did not export Codex.");
    }

    const agent = new Codex(this.options);
    const thread = await agent.startThread();
    const raw = textFromSdkResult(await thread.run(codexJudgeInput(input)));
    return { ...parseJudgeOutput(raw), provider: this.name };
  }
}

export class ClaudeAgentSdkJudgeProvider implements JudgeProvider {
  readonly name = "claude_agent_sdk";

  readonly sdk_interface = "v2";

  constructor(
    private readonly options: { model?: string } = {},
    private readonly loadModule: ModuleLoader = () => optionalImport("@anthropic-ai/claude-agent-sdk")
  ) {}

  async score(input: JudgeInput): Promise<JudgeResult> {
    let sdk: Record<string, unknown>;
    try {
      sdk = await this.loadModule();
    } catch (error) {
      throw new Error(`Claude Agent SDK is not available. Install @anthropic-ai/claude-agent-sdk before using claude_agent_sdk judges. ${(error as Error).message}`);
    }
    const promptText = buildJudgePrompt(input);
    const prompt = sdk.unstable_v2_prompt;
    if (typeof prompt === "function") {
      const rawResult = await prompt(promptText, {
        model: this.options.model ?? "claude-sonnet-4-5"
      });
      const result = rawResult as Record<string, unknown>;
      if (result.subtype && result.subtype !== "success") {
        throw new Error(`Claude Agent SDK judge failed with subtype ${String(result.subtype)}.`);
      }
      const raw = textFromSdkResult(rawResult);
      return { ...parseJudgeOutput(raw), provider: this.name };
    }
    const raw = await runClaudeQuery(
      sdk,
      promptText,
      this.options.model ?? "claude-sonnet-4-5",
      imagePathLines(input).length > 0 ? ["Read"] : []
    );
    return { ...parseJudgeOutput(raw), provider: this.name };
  }
}

export function providerReproducibilityWarning(provider: string): string {
  if (provider === "codex_sdk" || provider === "claude_agent_sdk") {
    return "This is a subscription-backed local agent judge; record raw responses because reproducing results in CI may be harder than with API-backed judging.";
  }
  if (provider === "openrouter_api") {
    return "This is API-backed judging; record provider, model, rubric, parameters, raw response, and usage metadata.";
  }
  return "Record judge command, rubric, raw response, and environment metadata.";
}

import { spawn } from "node:child_process";
import { z } from "zod";
import type { DatasetRow } from "./schemas.js";

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
}

export interface JudgeResult extends JudgeOutput {
  provider: string;
}

export interface JudgeProvider {
  readonly name: string;
  score(input: JudgeInput): Promise<JudgeResult>;
}

type ModuleLoader = () => Promise<Record<string, unknown>>;

const optionalImport = (specifier: string): Promise<Record<string, unknown>> =>
  new Function("specifier", "return import(specifier);")(specifier) as Promise<Record<string, unknown>>;

function buildJudgePrompt(input: JudgeInput): string {
  return [
    "You are evaluating one target output.",
    "Return only JSON with this shape: {\"score\": number, \"passed\": boolean, \"rationale\": string, \"confidence\": number, \"metadata\": object}.",
    `Rubric:\n${input.rubric}`,
    `Example:\n${JSON.stringify(input.example)}`,
    `Reference:\n${JSON.stringify(input.reference ?? null)}`,
    `Target output:\n${input.output}`
  ].join("\n\n");
}

function textFromSdkResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("SDK judge returned an unsupported result shape.");
  }
  const record = result as Record<string, unknown>;
  if (typeof record.result === "string") return record.result;
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
            content: JSON.stringify(input)
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
      startThread(): Promise<{ run(prompt: string): Promise<unknown> }>;
    }) | undefined;
    if (typeof Codex !== "function") {
      throw new Error("Codex SDK module did not export Codex.");
    }

    const agent = new Codex(this.options);
    const thread = await agent.startThread();
    const raw = textFromSdkResult(await thread.run(buildJudgePrompt(input)));
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
    const prompt = sdk.unstable_v2_prompt;
    if (typeof prompt !== "function") {
      throw new Error("Claude Agent SDK module did not export unstable_v2_prompt.");
    }

    const rawResult = await prompt(buildJudgePrompt(input), {
      model: this.options.model ?? "claude-sonnet-4-5"
    });
    const result = rawResult as Record<string, unknown>;
    if (result.subtype && result.subtype !== "success") {
      throw new Error(`Claude Agent SDK judge failed with subtype ${String(result.subtype)}.`);
    }
    const raw = textFromSdkResult(rawResult);
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

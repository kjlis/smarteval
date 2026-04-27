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

  async score(): Promise<JudgeResult> {
    throw new Error(
      "Codex SDK judge provider is reserved behind the JudgeProvider interface. Install and wire the Codex SDK adapter before use."
    );
  }
}

export class ClaudeAgentSdkJudgeProvider implements JudgeProvider {
  readonly name = "claude_agent_sdk";

  readonly sdk_interface = "v2";

  async score(): Promise<JudgeResult> {
    throw new Error(
      "Claude Agent SDK V2 judge provider is reserved behind the JudgeProvider interface. Install and wire the Claude Agent SDK adapter before use."
    );
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

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { z } from "zod";
import {
  candidateSchema,
  datasetRowSchema,
  evalConfigSchema,
  type Candidate,
  type DatasetRow,
  type EvalConfig
} from "./schemas.js";

export const plannerOutputSchema = z.object({
  eval: evalConfigSchema,
  dataset: z.array(datasetRowSchema).min(1),
  candidates: z.array(candidateSchema).min(1),
  rubrics: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string()
      })
    )
    .default([]),
  questions: z.array(z.string()).default([])
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

type ModuleLoader = () => Promise<Record<string, unknown>>;

const optionalImport = (specifier: string): Promise<Record<string, unknown>> =>
  new Function("specifier", "return import(specifier);")(specifier) as Promise<Record<string, unknown>>;

export interface PlannerRequest {
  root: string;
  name: string;
  targetCommand?: string[];
}

export interface PlannerProvider {
  readonly name: string;
  plan(request: PlannerRequest): Promise<PlannerOutput>;
}

export interface CommandPlannerOptions {
  root: string;
  name: string;
  providerCommand: string[];
  targetCommand?: string[];
}

function extractTextResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("Planner provider returned an unsupported result shape.");
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
  throw new Error("Planner provider returned no text result.");
}

function parsePlannerOutput(raw: string): PlannerOutput {
  const candidates = [
    raw.trim(),
    raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    raw.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return plannerOutputSchema.parse(JSON.parse(candidate));
    } catch {
      // Try the next repair candidate.
    }
  }

  throw new Error("Planner response did not contain valid structured JSON.");
}

function buildPlannerPrompt(request: PlannerRequest): string {
  return [
    "You are Smarteval's assisted planner for repo-local AI behavior evaluation.",
    "Analyze the repository context and propose a reviewable eval plan. Do not modify files.",
    "Return only JSON with keys: eval, dataset, candidates, rubrics, questions.",
    "The eval must match Smarteval eval.yaml schema. Prefer deterministic scoring vectors before judge metrics.",
    "Keep generated candidates human-editable and include questions the engineer should confirm before running candidates.",
    `Eval name: ${request.name}`,
    `Repository root: ${request.root}`,
    `Optional target command: ${JSON.stringify(request.targetCommand ?? null)}`
  ].join("\n\n");
}

export function manualPlannerOutput(name: string, targetCommand?: string[]): PlannerOutput {
  const command = targetCommand?.length ? targetCommand : ["node", "scripts/eval-target.js"];
  return plannerOutputSchema.parse({
    eval: {
      schema_version: "1",
      name,
      objective: {
        description: "Describe the AI behavior this eval should improve."
      },
      target: {
        type: "command",
        command,
        timeout_ms: 30000
      },
      inputs: {
        dataset: `.smarteval/evals/${name}/dataset.jsonl`
      },
      allowed_levers: ["prompt"],
      fixed_constraints: [],
      scoring_vectors: {
        valid_json: { type: "json_validity", weight: 0.5 },
        error_rate: { type: "error_rate", weight: 0.5 }
      },
      experiment_budget: {
        iterations: 1,
        candidates_per_iteration: 1,
        max_cost_usd: 0
      }
    },
    dataset: [
      {
        id: "case_001",
        input: { prompt: "Replace this with a real example." },
        reference: {},
        tags: ["smoke"],
        notes: "Starter example; replace before trusting results."
      }
    ],
    candidates: [
      {
        id: "baseline",
        name: "Current behavior",
        strategy: "baseline",
        hypothesis: "Current system behavior before changes.",
        changes: ["No changes."],
        expected_improvement: [],
        risk: []
      }
    ],
    questions: []
  });
}

export async function runCommandPlanner(options: CommandPlannerOptions): Promise<PlannerOutput> {
  const [command, ...args] = options.providerCommand;
  if (!command) throw new Error("Command planner requires a provider command.");

  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.root,
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
      else reject(new Error(stderr.trim() || `Command planner exited with status ${code}.`));
    });
    child.stdin.end(
      JSON.stringify({
        name: options.name,
        root: options.root,
        target_command: options.targetCommand
      })
    );
  });

  return parsePlannerOutput(raw);
}

export class CodexSdkPlannerProvider implements PlannerProvider {
  readonly name = "codex_sdk";

  constructor(
    private readonly options: { model?: string } = {},
    private readonly loadModule: ModuleLoader = () => optionalImport("@openai/codex-sdk")
  ) {}

  async plan(request: PlannerRequest): Promise<PlannerOutput> {
    let sdk: Record<string, unknown>;
    try {
      sdk = await this.loadModule();
    } catch (error) {
      throw new Error(`Codex SDK is not available. Install @openai/codex-sdk before using codex_sdk planners. ${(error as Error).message}`);
    }
    const Codex = sdk.Codex as (new (options: { model?: string }) => {
      startThread(): Promise<{ run(prompt: string): Promise<unknown> }>;
    }) | undefined;
    if (typeof Codex !== "function") {
      throw new Error("Codex SDK module did not export Codex.");
    }

    const agent = new Codex(this.options);
    const thread = await agent.startThread();
    return parsePlannerOutput(extractTextResult(await thread.run(buildPlannerPrompt(request))));
  }
}

export class ClaudeAgentSdkPlannerProvider implements PlannerProvider {
  readonly name = "claude_agent_sdk";

  readonly sdk_interface = "v2";

  constructor(
    private readonly options: { model?: string } = {},
    private readonly loadModule: ModuleLoader = () => optionalImport("@anthropic-ai/claude-agent-sdk")
  ) {}

  async plan(request: PlannerRequest): Promise<PlannerOutput> {
    let sdk: Record<string, unknown>;
    try {
      sdk = await this.loadModule();
    } catch (error) {
      throw new Error(`Claude Agent SDK is not available. Install @anthropic-ai/claude-agent-sdk before using claude_agent_sdk planners. ${(error as Error).message}`);
    }
    const prompt = sdk.unstable_v2_prompt;
    if (typeof prompt !== "function") {
      throw new Error("Claude Agent SDK module did not export unstable_v2_prompt.");
    }

    const result = await prompt(buildPlannerPrompt(request), {
      model: this.options.model ?? "claude-sonnet-4-5"
    });
    const record = result as Record<string, unknown>;
    if (record.subtype && record.subtype !== "success") {
      throw new Error(`Claude Agent SDK planner failed with subtype ${String(record.subtype)}.`);
    }
    return parsePlannerOutput(extractTextResult(result));
  }
}

export class OpenRouterPlannerProvider implements PlannerProvider {
  readonly name = "openrouter_api";

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
    }
  ) {}

  async plan(request: PlannerRequest): Promise<PlannerOutput> {
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
            content: "You are Smarteval's planner. Return only valid structured JSON."
          },
          {
            role: "user",
            content: buildPlannerPrompt(request)
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter planner failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter planner response did not include message content.");
    return parsePlannerOutput(content);
  }
}

export async function writePlanArtifacts(root: string, output: PlannerOutput): Promise<void> {
  const evalName = output.eval.name;
  const evalDir = join(root, ".smarteval", "evals", evalName);
  await mkdir(join(evalDir, "candidates"), { recursive: true });

  await writeFile(join(evalDir, "eval.yaml"), stringify(output.eval));
  await writeFile(
    join(evalDir, "dataset.jsonl"),
    output.dataset.map((row) => JSON.stringify(row)).join("\n") + "\n"
  );

  for (const candidate of output.candidates as Candidate[]) {
    await writeFile(join(evalDir, "candidates", `${candidate.id}.yaml`), stringify(candidate));
  }

  for (const rubric of output.rubrics) {
    const rubricPath = join(root, rubric.path);
    await mkdir(dirname(rubricPath), { recursive: true });
    await writeFile(rubricPath, rubric.content);
  }
}

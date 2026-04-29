import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SmartevalConfig } from "./config.js";
import type { EvalConfig } from "./schemas.js";

export interface AgentTaskOptions {
  name: string;
  goal: string;
  iterations: number;
  provider: "codex" | "claude" | "generic";
  evalConfig?: EvalConfig;
  defaults: SmartevalConfig["defaults"];
}

function providerName(provider: AgentTaskOptions["provider"]): string {
  if (provider === "codex") return "Codex";
  if (provider === "claude") return "Claude Code";
  return "the coding agent";
}

function targetSummary(evalConfig: EvalConfig | undefined): string {
  if (!evalConfig) return "No eval.yaml exists yet; create or update it during planning.";
  if (evalConfig.target.type === "command") return `Command target: ${evalConfig.target.command.join(" ")}`;
  return `${evalConfig.target.type} target: ${evalConfig.target.entrypoint}`;
}

export function buildAgentTask(options: AgentTaskOptions): string {
  const agent = providerName(options.provider);
  const planner = options.defaults.planner;
  const judge = options.defaults.judge;
  const evalConfig = options.evalConfig;
  const allowedLevers = evalConfig?.allowed_levers?.length ? evalConfig.allowed_levers : ["Identify during repo exploration."];
  const fixedConstraints = evalConfig?.fixed_constraints?.length ? evalConfig.fixed_constraints : ["Identify during repo exploration."];
  const scoringVectors = evalConfig ? Object.keys(evalConfig.scoring_vectors) : ["Identify during planning."];

  return [
    `# Smarteval Agent Task: ${options.name}`,
    "",
    `Goal: ${options.goal}`,
    "",
    `Owner: ${agent}`,
    `Iterations requested: ${options.iterations}`,
    `Planner default: ${planner?.provider ?? "not configured"}${planner?.model ? ` / ${planner.model}` : ""}`,
    `Judge default: ${judge?.provider ?? "not configured"}${judge?.model ? ` / ${judge.model}` : ""}`,
    `Target: ${targetSummary(evalConfig)}`,
    "",
    "## Operating Rules",
    "",
    "- Use Smarteval artifacts as the durable source of truth.",
    "- Explore the repository before editing prompts, model config, retrieval config, or agent instructions.",
    "- If no harness exists, build the smallest command target that exercises the real behavior and prints normalized output.",
    "- Ask the engineer to confirm target, dataset shape, allowed levers, fixed constraints, scoring vectors, judge provider, and iteration budget before running candidates.",
    "- Keep production behavior unchanged until a baseline run exists.",
    "- Change only approved levers during iteration.",
    "- Preserve candidate files, run IDs, scores, reports, and any human review artifacts.",
    "- Stop early if failures indicate the harness or dataset is invalid rather than optimizing against bad measurements.",
    "",
    "## Current Plan Inputs",
    "",
    "Allowed levers:",
    ...allowedLevers.map((lever) => `- ${lever}`),
    "",
    "Fixed constraints:",
    ...fixedConstraints.map((constraint) => `- ${constraint}`),
    "",
    "Scoring vectors:",
    ...scoringVectors.map((metric) => `- ${metric}`),
    "",
    "## Workflow",
    "",
    "1. Run `smarteval doctor` and fix setup issues that block planning or judging.",
    `2. If needed, run \`smarteval plan --name ${options.name} --goal ${JSON.stringify(options.goal)} --iterations ${options.iterations}\`; otherwise inspect \`.smarteval/evals/${options.name}/eval.yaml\`.`,
    "3. Inspect the target code path and identify the real inputs, outputs, dependencies, and side effects.",
    "4. Build or repair the command harness so each dataset row can run independently and print normalized stdout.",
    "5. Validate the eval with `smarteval validate`.",
    "6. Run a baseline with `smarteval run --baseline` and record the run ID.",
    `7. For up to ${options.iterations} iterations, create one candidate hypothesis, edit only approved levers, run \`smarteval run --candidate <id>\`, compare against baseline and the current best run, and keep notes in the candidate file.`,
    "8. Generate `smarteval report` for the best candidate and include known regressions, judge limitations, dataset weakness, and cost/latency movement.",
    "9. Recommend apply, revise, collect more examples, or stop. Do not apply a candidate with unexplained regressions.",
    "",
    "## Commands",
    "",
    "```bash",
    "smarteval doctor",
    `smarteval validate --eval ${options.name}`,
    `smarteval run --eval ${options.name} --baseline --concurrency 1`,
    `smarteval run --eval ${options.name} --candidate candidate_001 --concurrency 1`,
    `smarteval compare --eval ${options.name} --baseline <baseline_run_id> --candidate <candidate_run_id>`,
    `smarteval report --eval ${options.name} --baseline <baseline_run_id> --candidate <candidate_run_id>`,
    "```",
    ""
  ].join("\n");
}

export async function writeAgentTask(root: string, task: string, outPath: string): Promise<string> {
  const resolved = join(root, outPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, task);
  return resolved;
}

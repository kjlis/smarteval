import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { evaluateExample, scoreAggregate } from "./evaluators.js";
import {
  type AggregateScore,
  type CommandTarget,
  type DatasetRow,
  datasetRowSchema,
  type EvalConfig,
  parseJsonl,
  type RunManifest,
  type RunResultRow,
  type Target
} from "./schemas.js";

export interface CommandRunResult {
  stdout: string;
  stderr: string;
  status: "passed" | "failed" | "timeout";
  latency_ms: number;
  error?: string;
}

export interface RunEvaluationOptions {
  root: string;
  config: EvalConfig;
  candidateId: string;
  runId?: string;
}

export interface RunEvaluationResult {
  runId: string;
  runDir: string;
  manifest: RunManifest;
  results: RunResultRow[];
  scores: AggregateScore;
}

export function resolveFromRoot(root: string, path: string): string {
  return isAbsolute(path) ? path : join(root, path);
}

export async function loadDataset(root: string, config: EvalConfig): Promise<DatasetRow[]> {
  const datasetPath = resolveFromRoot(root, config.inputs.dataset);
  return parseJsonl(await readFile(datasetPath, "utf8"), datasetRowSchema);
}

export async function runCommandTarget(
  target: CommandTarget,
  row: DatasetRow,
  cwd: string
): Promise<CommandRunResult> {
  const [command, ...args] = target.command;
  const started = performance.now();

  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = target.timeout_ms
      ? setTimeout(() => {
          settled = true;
          child.kill("SIGTERM");
          resolve({
            stdout,
            stderr,
            status: "timeout",
            latency_ms: Math.max(0, performance.now() - started),
            error: `Command timed out after ${target.timeout_ms}ms.`
          });
        }, target.timeout_ms)
      : undefined;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        status: "failed",
        latency_ms: Math.max(0, performance.now() - started),
        error: error.message
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        status: code === 0 ? "passed" : "failed",
        latency_ms: Math.max(0, performance.now() - started),
        error: code === 0 ? undefined : `Command exited with status ${code}.`
      });
    });
    child.stdin.end(JSON.stringify(row));
  });
}

export async function runTarget(target: Target, row: DatasetRow, cwd: string): Promise<CommandRunResult> {
  if (target.type !== "command") {
    return {
      stdout: "",
      stderr: "",
      status: "failed",
      latency_ms: 0,
      error: `${target.type} targets are schema-supported but not executable in this MVP. Use a command target wrapper.`
    };
  }
  return runCommandTarget(target, row, cwd);
}

export async function datasetHash(root: string, config: EvalConfig): Promise<string> {
  const content = await readFile(resolveFromRoot(root, config.inputs.dataset));
  return createHash("sha256").update(content).digest("hex");
}

function gitMetadata(root: string): RunManifest["git"] {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return { commit, dirty: status.length > 0 };
  } catch {
    return { commit: "unknown", dirty: true };
  }
}

function warningsFor(config: EvalConfig, rows: DatasetRow[]): string[] {
  const warnings: string[] = [];
  if (rows.length < 5) warnings.push("Dataset has fewer than 5 examples.");
  if (rows.every((row) => !row.reference)) warnings.push("Dataset has no reference outputs.");
  if (
    Object.values(config.scoring_vectors).length > 0 &&
    Object.values(config.scoring_vectors).every((metric) => metric.type === "llm_judge")
  ) {
    warnings.push("Scoring is judge-only; add deterministic checks where possible.");
  }
  return warnings;
}

export async function runEvaluation(options: RunEvaluationOptions): Promise<RunEvaluationResult> {
  const rows = await loadDataset(options.root, options.config);
  const runId =
    options.runId ??
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = join(
    options.root,
    ".smarteval",
    "evals",
    options.config.name,
    "runs",
    runId
  );
  await mkdir(runDir, { recursive: true });

  const results: RunResultRow[] = [];
  for (const row of rows) {
    const targetResult = await runTarget(options.config.target, row, options.root);
    const result: RunResultRow = {
      example_id: row.id,
      input: row.input,
      reference: row.reference,
      output: targetResult.stdout.trim(),
      stdout: targetResult.stdout.trim(),
      stderr: targetResult.stderr.trim(),
      status: targetResult.status,
      latency_ms: targetResult.latency_ms,
      error: targetResult.error,
      metrics: {}
    };
    results.push(evaluateExample(options.config, result));
  }

  const scores = scoreAggregate(options.config, results);
  const manifest: RunManifest = {
    smarteval_version: "0.1.0",
    eval_schema_version: options.config.schema_version,
    eval_name: options.config.name,
    run_id: runId,
    candidate_id: options.candidateId,
    created_at: new Date().toISOString(),
    target: options.config.target,
    dataset_path: options.config.inputs.dataset,
    dataset_hash: await datasetHash(options.root, options.config),
    git: gitMetadata(options.root),
    warnings: warningsFor(options.config, rows)
  };

  await writeFile(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    join(runDir, "results.jsonl"),
    results.map((result) => JSON.stringify(result)).join("\n") + "\n"
  );
  await writeFile(join(runDir, "scores.json"), JSON.stringify(scores, null, 2) + "\n");
  await writeFile(join(runDir, "failures.jsonl"), failureRows(results));
  await writeFile(join(runDir, "costs.json"), JSON.stringify({ total_cost_usd: null, currency: "USD", note: "No direct provider costs captured by deterministic command runner." }, null, 2) + "\n");

  return { runId, runDir, manifest, results, scores };
}

function failureRows(results: RunResultRow[]): string {
  const failed = results.filter(
    (row) => row.status !== "passed" || Object.values(row.metrics).some((metric) => !metric.passed)
  );
  return failed.map((row) => JSON.stringify(row)).join("\n") + (failed.length ? "\n" : "");
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

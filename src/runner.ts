import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { evaluateExample, scoreAggregate } from "./evaluators.js";
import {
  ClaudeAgentSdkJudgeProvider,
  CodexSdkJudgeProvider,
  CommandJudgeProvider,
  OpenRouterJudgeProvider,
  providerReproducibilityWarning
} from "./judges.js";
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
  maxCostUsd?: number;
  concurrency?: number;
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
    Object.values(config.scoring_vectors).every((metric) => isJudgeMetric(metric.type))
  ) {
    warnings.push("Scoring is judge-only; add deterministic checks where possible.");
  }
  return warnings;
}

export function estimateJudgeCost(config: EvalConfig, exampleCount: number): number {
  return Object.values(config.scoring_vectors).reduce((sum, metric) => {
    if (metric.type !== "llm_judge" && metric.type !== "command_judge") return sum;
    return sum + (metric.estimated_cost_usd ?? 0) * exampleCount;
  }, 0);
}

function isJudgeMetric(type: string): boolean {
  return type === "llm_judge" || type === "command_judge";
}

function judgeMetadata(config: EvalConfig): NonNullable<RunManifest["judges"]> {
  const judges: NonNullable<RunManifest["judges"]> = [];
  for (const [metric, metricConfig] of Object.entries(config.scoring_vectors)) {
    if (metricConfig.type === "command_judge") {
      judges.push({
        metric,
        provider: "command",
        rubric: metricConfig.rubric,
        reproducibility: providerReproducibilityWarning("command")
      });
    } else if (metricConfig.type === "llm_judge") {
      const provider = metricConfig.provider ?? "openrouter_api";
      judges.push({
        metric,
        provider,
        model: metricConfig.model,
        rubric: metricConfig.rubric,
        reproducibility: providerReproducibilityWarning(provider)
      });
    }
  }
  return judges;
}

async function applyJudgeMetrics(
  config: EvalConfig,
  datasetRow: DatasetRow,
  result: RunResultRow,
  root: string
): Promise<RunResultRow> {
  const metrics = { ...result.metrics };

  for (const [name, metric] of Object.entries(config.scoring_vectors)) {
    if (metric.type === "command_judge") {
      try {
        const provider = new CommandJudgeProvider(metric.command, root);
        const judged = await provider.score({
          example: datasetRow,
          output: result.output,
          rubric: metric.rubric,
          reference: datasetRow.reference
        });
        metrics[name] = {
          score: judged.score,
          passed: judged.passed,
          rationale: judged.rationale,
          provider: judged.provider,
          confidence: judged.confidence,
          raw_response: judged.raw_response,
          metadata: judged.metadata
        };
      } catch (error) {
        metrics[name] = {
          score: 0,
          passed: false,
          rationale: `Command judge failed: ${(error as Error).message}`,
          provider: "command"
        };
      }
    }

    if (metric.type === "llm_judge") {
      const providerName = metric.provider ?? "openrouter_api";
      try {
        if (providerName === "openrouter_api") {
          const apiKey = process.env.OPENROUTER_API_KEY;
          if (!apiKey) {
            throw new Error("OPENROUTER_API_KEY is required for openrouter_api judge metrics.");
          }
          const provider = new OpenRouterJudgeProvider({
            apiKey,
            model: metric.model ?? "openai/gpt-4.1-mini"
          });
          const judged = await provider.score({
            example: datasetRow,
            output: result.output,
            rubric: metric.rubric,
            reference: datasetRow.reference
          });
          metrics[name] = {
            score: judged.score,
            passed: judged.passed,
            rationale: judged.rationale,
            provider: judged.provider,
            model: metric.model,
            confidence: judged.confidence,
            raw_response: judged.raw_response,
            metadata: judged.metadata
          };
        } else if (providerName === "codex_sdk") {
          const judged = await new CodexSdkJudgeProvider({ model: metric.model }).score({
            example: datasetRow,
            output: result.output,
            rubric: metric.rubric,
            reference: datasetRow.reference
          });
          metrics[name] = {
            score: judged.score,
            passed: judged.passed,
            rationale: judged.rationale,
            provider: judged.provider,
            model: metric.model,
            confidence: judged.confidence,
            raw_response: judged.raw_response,
            metadata: judged.metadata
          };
        } else if (providerName === "claude_agent_sdk") {
          const judged = await new ClaudeAgentSdkJudgeProvider({ model: metric.model }).score({
            example: datasetRow,
            output: result.output,
            rubric: metric.rubric,
            reference: datasetRow.reference
          });
          metrics[name] = {
            score: judged.score,
            passed: judged.passed,
            rationale: judged.rationale,
            provider: judged.provider,
            model: metric.model,
            confidence: judged.confidence,
            raw_response: judged.raw_response,
            metadata: judged.metadata
          };
        } else {
          throw new Error(`Unsupported LLM judge provider: ${providerName}.`);
        }
      } catch (error) {
        metrics[name] = {
          score: 0,
          passed: false,
          rationale: `LLM judge failed: ${(error as Error).message}`,
          provider: providerName,
          model: metric.model
        };
      }
    }
  }

  return { ...result, metrics };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      }
    })
  );

  return results;
}

export interface FailureSummary {
  total_failed_examples: number;
  by_metric: Record<string, { count: number; examples: string[]; tags: Record<string, number> }>;
  by_tag: Record<string, { count: number; examples: string[]; metrics: Record<string, number> }>;
}

export function summarizeFailures(results: RunResultRow[]): FailureSummary {
  const summary: FailureSummary = {
    total_failed_examples: 0,
    by_metric: {},
    by_tag: {}
  };
  const failedExamples = new Set<string>();

  for (const result of results) {
    const failedMetrics = Object.entries(result.metrics)
      .filter(([, metric]) => !metric.passed)
      .map(([name]) => name);
    if (result.status !== "passed") failedMetrics.push("target_execution");
    if (failedMetrics.length === 0) continue;

    failedExamples.add(result.example_id);
    const tags = result.tags.length > 0 ? result.tags : ["untagged"];
    for (const metric of failedMetrics) {
      const metricBucket = (summary.by_metric[metric] ??= {
        count: 0,
        examples: [],
        tags: {}
      });
      metricBucket.count += 1;
      if (!metricBucket.examples.includes(result.example_id)) {
        metricBucket.examples.push(result.example_id);
      }
      for (const tag of tags) {
        metricBucket.tags[tag] = (metricBucket.tags[tag] ?? 0) + 1;
      }
    }

    for (const tag of tags) {
      const tagBucket = (summary.by_tag[tag] ??= {
        count: 0,
        examples: [],
        metrics: {}
      });
      tagBucket.count += 1;
      if (!tagBucket.examples.includes(result.example_id)) {
        tagBucket.examples.push(result.example_id);
      }
      for (const metric of failedMetrics) {
        tagBucket.metrics[metric] = (tagBucket.metrics[metric] ?? 0) + 1;
      }
    }
  }

  summary.total_failed_examples = failedExamples.size;
  return summary;
}

export async function runEvaluation(options: RunEvaluationOptions): Promise<RunEvaluationResult> {
  const rows = await loadDataset(options.root, options.config);
  const estimatedCostUsd = estimateJudgeCost(options.config, rows.length);
  if (options.maxCostUsd !== undefined && estimatedCostUsd > options.maxCostUsd) {
    throw new Error(
      `Estimated judge cost $${estimatedCostUsd.toFixed(4)} exceeds max cost $${options.maxCostUsd.toFixed(4)}.`
    );
  }
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

  const results = await mapWithConcurrency(rows, options.concurrency ?? 1, async (row) => {
    const targetResult = await runTarget(options.config.target, row, options.root);
    const result: RunResultRow = {
      example_id: row.id,
      input: row.input,
      reference: row.reference,
      tags: row.tags,
      output: targetResult.stdout.trim(),
      stdout: targetResult.stdout.trim(),
      stderr: targetResult.stderr.trim(),
      status: targetResult.status,
      latency_ms: targetResult.latency_ms,
      error: targetResult.error,
      metrics: {}
    };
    return applyJudgeMetrics(
      options.config,
      row,
      evaluateExample(options.config, result),
      options.root
    );
  });

  const scores = scoreAggregate(options.config, results);
  const judges = judgeMetadata(options.config);
  const failuresSummary = summarizeFailures(results);
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
    judges,
    estimated_cost_usd: estimatedCostUsd,
    failures_summary: failuresSummary,
    warnings: warningsFor(options.config, rows)
  };

  await writeFile(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    join(runDir, "results.jsonl"),
    results.map((result) => JSON.stringify(result)).join("\n") + "\n"
  );
  await writeFile(join(runDir, "scores.json"), JSON.stringify(scores, null, 2) + "\n");
  await writeFile(join(runDir, "failures.jsonl"), failureRows(results));
  await writeFile(join(runDir, "failures-summary.json"), JSON.stringify(failuresSummary, null, 2) + "\n");
  await writeFile(join(runDir, "costs.json"), JSON.stringify({ estimated_cost_usd: estimatedCostUsd, total_cost_usd: null, currency: "USD", note: "Direct provider costs are recorded when providers return usage metadata." }, null, 2) + "\n");

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

import type { AggregateScore, ReportInput } from "./schemas.js";

export interface Comparison {
  overall_delta: number;
  metrics: Record<string, { baseline: number; candidate: number; delta: number }>;
  regressions: string[];
}

export function compareAggregates(baseline: AggregateScore, candidate: AggregateScore): Comparison {
  const metrics: Comparison["metrics"] = {};
  const regressions: string[] = [];
  const names = new Set([
    ...Object.keys(baseline.metrics),
    ...Object.keys(candidate.metrics)
  ]);

  for (const name of names) {
    const baselineScore = baseline.metrics[name]?.score ?? 0;
    const candidateScore = candidate.metrics[name]?.score ?? 0;
    const delta = candidateScore - baselineScore;
    metrics[name] = { baseline: baselineScore, candidate: candidateScore, delta };
    if (delta < 0) regressions.push(name);
  }

  if (candidate.runtime.average_latency_ms > baseline.runtime.average_latency_ms * 1.1) {
    if (!regressions.includes("latency")) regressions.push("latency");
  }
  if (candidate.runtime.error_rate > baseline.runtime.error_rate) {
    if (!regressions.includes("error_rate")) regressions.push("error_rate");
  }
  if (candidate.runtime.timeout_count > baseline.runtime.timeout_count) {
    if (!regressions.includes("timeout_count")) regressions.push("timeout_count");
  }

  return {
    overall_delta: candidate.overall_score - baseline.overall_score,
    metrics,
    regressions
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${pct(value)}`;
}

function isJudgeHeavyWin(input: ReportInput): boolean {
  if (!input.comparison || input.comparison.overall_delta <= 0) return false;
  const judges = input.manifest.judges ?? [];
  if (judges.length === 0) return false;

  let positiveContribution = 0;
  let judgeContribution = 0;
  const judgeMetrics = new Set(judges.map((judge) => judge.metric));
  for (const [name, movement] of Object.entries(input.comparison.metrics)) {
    if (movement.delta <= 0) continue;
    const weight = input.candidate.metrics[name]?.weight ?? 0;
    const contribution = movement.delta * weight;
    positiveContribution += contribution;
    if (judgeMetrics.has(name)) judgeContribution += contribution;
  }

  return positiveContribution > 0 && judgeContribution / positiveContribution >= 0.5;
}

export function generateMarkdownReport(input: ReportInput): string {
  const score = input.candidate;
  const comparison = input.comparison;
  const derivedWarnings = isJudgeHeavyWin(input)
    ? ["Winning candidate is supported mainly by judge metrics."]
    : [];
  const lines: string[] = [];

  lines.push(`# Smarteval Report: ${input.manifest.eval_name}`);
  lines.push("");
  lines.push("## Run Metadata");
  lines.push(`- Run: ${input.manifest.run_id}`);
  lines.push(`- Candidate: ${input.manifest.candidate_id}`);
  lines.push(`- Target: ${input.manifest.target.type}`);
  lines.push(`- Created: ${input.manifest.created_at}`);
  lines.push(`- Dataset: ${input.manifest.dataset_path}`);
  lines.push(`- Dataset hash: ${input.manifest.dataset_hash}`);
  lines.push(`- Git commit: ${input.manifest.git.commit}`);
  lines.push(`- Dirty worktree: ${input.manifest.git.dirty ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Scores");
  if (input.baseline) lines.push(`- Baseline overall: ${pct(input.baseline.overall_score)}`);
  lines.push(`- Candidate overall: ${pct(score.overall_score)}`);
  if (comparison) lines.push(`- Overall movement: ${signed(comparison.overall_delta)}`);
  lines.push("");
  lines.push("| Metric | Score | Weight | Passed | Failed | Movement |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const [name, metric] of Object.entries(score.metrics)) {
    const movement = comparison?.metrics[name]?.delta;
    lines.push(
      `| ${name} | ${pct(metric.score)} | ${metric.weight.toFixed(2)} | ${metric.passed} | ${metric.failed} | ${movement === undefined ? "n/a" : signed(movement)} |`
    );
  }
  lines.push("");
  lines.push("## Runtime");
  lines.push(`- Average latency: ${score.runtime.average_latency_ms.toFixed(0)}ms`);
  lines.push(`- Error rate: ${pct(score.runtime.error_rate)}`);
  lines.push(`- Timeouts: ${score.runtime.timeout_count}`);
  lines.push("");
  if ((input.manifest.judges ?? []).length > 0) {
    lines.push("## Judge Metadata");
    lines.push("| Metric | Provider | Model | Reproducibility |");
    lines.push("| --- | --- | --- | --- |");
    for (const judge of input.manifest.judges ?? []) {
      lines.push(
        `| ${judge.metric} | ${judge.provider} | ${judge.model ?? "n/a"} | ${judge.reproducibility} |`
      );
    }
    lines.push("");
  }
  lines.push("## Regressions");
  if (comparison && comparison.regressions.length > 0) {
    for (const regression of comparison.regressions) lines.push(`- ${regression}`);
  } else {
    lines.push("- None detected by configured metrics.");
  }
  lines.push("");
  if (input.manifest.failures_summary && input.manifest.failures_summary.total_failed_examples > 0) {
    lines.push("## Failure Clusters");
    lines.push(`- Failed examples: ${input.manifest.failures_summary.total_failed_examples}`);
    lines.push("");
    lines.push("| Failed metric | Count | Top tags |");
    lines.push("| --- | ---: | --- |");
    for (const [metric, bucket] of Object.entries(input.manifest.failures_summary.by_metric)) {
      const tags = Object.entries(bucket.tags)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => `${tag} (${count})`)
        .join(", ");
      lines.push(`| ${metric} | ${bucket.count} | ${tags || "n/a"} |`);
    }
    lines.push("");
  }
  lines.push("## Limitations");
  const warnings = [...input.manifest.warnings, ...derivedWarnings];
  const uniqueWarnings = [...new Set(warnings)];
  const visibleWarnings = uniqueWarnings.length
    ? uniqueWarnings
    : ["No run warnings were recorded."];
  for (const warning of visibleWarnings) lines.push(`- ${warning}`);
  lines.push("");
  lines.push("## Recommended next action");
  if (comparison && comparison.regressions.length > 0) {
    lines.push("Review regressions before applying this candidate.");
  } else if (comparison && comparison.overall_delta > 0) {
    lines.push("Candidate improved configured metrics; review examples and consider applying the candidate.");
  } else {
    lines.push("Collect more examples or revise the candidate before applying changes.");
  }
  lines.push("");

  return lines.join("\n");
}

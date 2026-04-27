import { describe, expect, test } from "vitest";
import { compareAggregates, generateMarkdownReport } from "../src/report.js";
import type { AggregateScore, RunManifest } from "../src/schemas.js";

const manifest: RunManifest = {
  smarteval_version: "0.1.0",
  eval_schema_version: "1",
  eval_name: "demo",
  run_id: "run_candidate",
  candidate_id: "candidate_001",
  created_at: "2026-04-27T00:00:00.000Z",
  target: { type: "command", command: ["demo"] },
  dataset_path: ".smarteval/evals/demo/dataset.jsonl",
  dataset_hash: "abc",
  git: { commit: "unknown", dirty: true },
  warnings: ["Dataset has fewer than 5 examples."]
};

const baseline: AggregateScore = {
  overall_score: 0.6,
  example_count: 2,
  metrics: {
    valid_json: { score: 0.5, weight: 0.5, passed: 1, failed: 1 },
    latency: { score: 0.7, weight: 0.5, passed: 2, failed: 0 }
  },
  runtime: { average_latency_ms: 100, error_rate: 0, timeout_count: 0 }
};

const candidate: AggregateScore = {
  overall_score: 0.8,
  example_count: 2,
  metrics: {
    valid_json: { score: 1, weight: 0.5, passed: 2, failed: 0 },
    latency: { score: 0.6, weight: 0.5, passed: 2, failed: 0 }
  },
  runtime: { average_latency_ms: 140, error_rate: 0, timeout_count: 0 }
};

describe("reports", () => {
  test("compares per-metric movement and regressions", () => {
    const comparison = compareAggregates(baseline, candidate);

    expect(comparison.overall_delta).toBeCloseTo(0.2);
    expect(comparison.metrics.valid_json.delta).toBeCloseTo(0.5);
    expect(comparison.regressions).toContain("latency");
  });

  test("generates markdown with metadata, movement, warnings, and next action", () => {
    const markdown = generateMarkdownReport({
      manifest,
      baseline,
      candidate,
      comparison: compareAggregates(baseline, candidate)
    });

    expect(markdown).toContain("# Smarteval Report: demo");
    expect(markdown).toContain("Target: command");
    expect(markdown).toContain("candidate_001");
    expect(markdown).toContain("valid_json");
    expect(markdown).toContain("Regressions");
    expect(markdown).toContain("Recommended next action");
  });
});

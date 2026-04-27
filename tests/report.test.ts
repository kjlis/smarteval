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
  failures_summary: {
    total_failed_examples: 2,
    by_metric: {
      valid_json: { count: 1, examples: ["case_001"], tags: { refund: 1 } }
    },
    by_tag: {
      refund: { count: 1, examples: ["case_001"], metrics: { valid_json: 1 } }
    }
  },
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
    expect(markdown).toContain("Failure Clusters");
    expect(markdown).toContain("valid_json");
    expect(markdown).toContain("Recommended next action");
  });

  test("warns when candidate wins are judge-heavy", () => {
    const markdown = generateMarkdownReport({
      manifest: {
        ...manifest,
        judges: [
          {
            metric: "quality",
            provider: "command",
            rubric: "Pass if high quality.",
            reproducibility: "Record judge command, rubric, raw response, and environment metadata."
          }
        ]
      },
      baseline: {
        ...baseline,
        overall_score: 0.4,
        metrics: {
          quality: { score: 0.2, weight: 0.8, passed: 0, failed: 2 },
          valid_json: { score: 1, weight: 0.2, passed: 2, failed: 0 }
        }
      },
      candidate: {
        ...candidate,
        overall_score: 0.8,
        metrics: {
          quality: { score: 0.7, weight: 0.8, passed: 1, failed: 1 },
          valid_json: { score: 1, weight: 0.2, passed: 2, failed: 0 }
        }
      },
      comparison: {
        overall_delta: 0.4,
        metrics: {
          quality: { baseline: 0.2, candidate: 0.7, delta: 0.5 },
          valid_json: { baseline: 1, candidate: 1, delta: 0 }
        },
        regressions: []
      }
    });

    expect(markdown).toContain("Winning candidate is supported mainly by judge metrics.");
    expect(markdown).toContain("## Judge Metadata");
    expect(markdown).toContain("command");
    expect(markdown).toContain("Record judge command");
  });
});

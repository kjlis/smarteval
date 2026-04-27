import { describe, expect, test } from "vitest";
import { evaluateExample, scoreAggregate } from "../src/evaluators.js";
import type { EvalConfig, RunResultRow } from "../src/schemas.js";

const baseConfig: EvalConfig = {
  schema_version: "1",
  name: "demo",
  objective: { description: "Demo eval." },
  target: { type: "command", command: ["noop"] },
  inputs: { dataset: "dataset.jsonl" },
  scoring_vectors: {
    valid_json: { type: "json_validity", weight: 0.2 },
    has_answer: { type: "json_required_fields", fields: ["answer"], weight: 0.2 },
    contains_ok: { type: "contains", value: "ok", weight: 0.2 },
    not_danger: { type: "not_contains", value: "danger", weight: 0.2 },
    word_limit: { type: "max_words", max: 4, weight: 0.2 }
  }
};

describe("deterministic evaluators", () => {
  test("scores deterministic checks with per-metric detail", () => {
    const row: RunResultRow = {
      example_id: "case_001",
      input: {},
      reference: {},
      output: "{\"answer\":\"ok now\"}",
      stdout: "{\"answer\":\"ok now\"}",
      stderr: "",
      status: "passed",
      latency_ms: 25,
      metrics: {}
    };

    const evaluated = evaluateExample(baseConfig, row);

    expect(evaluated.metrics.valid_json.score).toBe(1);
    expect(evaluated.metrics.has_answer.score).toBe(1);
    expect(evaluated.metrics.contains_ok.score).toBe(1);
    expect(evaluated.metrics.not_danger.score).toBe(1);
    expect(evaluated.metrics.word_limit.score).toBe(1);
  });

  test("handles regex, field match, exact match, and runtime metrics", () => {
    const config: EvalConfig = {
      ...baseConfig,
      scoring_vectors: {
        regex: { type: "regex", pattern: "^A-[0-9]+$", weight: 0.2 },
        exact: { type: "exact_match", weight: 0.2 },
        field: { type: "field_match", field: "label", weight: 0.2 },
        latency: { type: "latency", max_ms: 100, weight: 0.2 },
        errors: { type: "error_rate", weight: 0.2 }
      }
    };

    const evaluated = evaluateExample(config, {
      example_id: "case_002",
      input: {},
      reference: { output: "A-123", label: "refund" },
      output: "{\"label\":\"refund\",\"code\":\"A-123\"}",
      stdout: "A-123",
      stderr: "",
      status: "passed",
      latency_ms: 50,
      metrics: {}
    });

    expect(evaluated.metrics.regex.score).toBe(1);
    expect(evaluated.metrics.exact.score).toBe(1);
    expect(evaluated.metrics.field.score).toBe(1);
    expect(evaluated.metrics.latency.score).toBe(1);
    expect(evaluated.metrics.errors.score).toBe(1);
  });

  test("aggregates weighted scores and preserves metric details", () => {
    const aggregate = scoreAggregate(baseConfig, [
      evaluateExample(baseConfig, {
        example_id: "case_001",
        input: {},
        reference: {},
        output: "{\"answer\":\"ok\"}",
        stdout: "{\"answer\":\"ok\"}",
        stderr: "",
        status: "passed",
        latency_ms: 10,
        metrics: {}
      }),
      evaluateExample(baseConfig, {
        example_id: "case_002",
        input: {},
        reference: {},
        output: "danger",
        stdout: "danger",
        stderr: "",
        status: "passed",
        latency_ms: 10,
        metrics: {}
      })
    ]);

    expect(aggregate.example_count).toBe(2);
    expect(aggregate.metrics.valid_json.score).toBe(0.5);
    expect(aggregate.overall_score).toBeGreaterThan(0);
    expect(aggregate.overall_score).toBeLessThan(1);
  });
});

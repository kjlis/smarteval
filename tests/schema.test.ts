import { describe, expect, test } from "vitest";
import {
  candidateSchema,
  datasetRowSchema,
  evalConfigSchema,
  parseJsonl
} from "../src/schemas.js";

describe("artifact schemas", () => {
  test("accepts a minimal command-target eval", () => {
    const parsed = evalConfigSchema.parse({
      name: "support_summary",
      objective: {
        description: "Improve factual support ticket summaries."
      },
      target: {
        type: "command",
        command: ["bun", "run", "scripts/eval-target.ts"],
        timeout_ms: 5000
      },
      inputs: {
        dataset: ".smarteval/evals/support_summary/dataset.jsonl"
      },
      scoring_vectors: {
        valid_json: { type: "json_validity", weight: 0.3 },
        has_summary: {
          type: "json_required_fields",
          fields: ["summary"],
          weight: 0.3
        },
        latency: { type: "latency", weight: 0.1 }
      }
    });

    expect(parsed.name).toBe("support_summary");
    expect(parsed.scoring_vectors.valid_json.weight).toBe(0.3);
  });

  test("rejects scoring vectors without usable weights", () => {
    expect(() =>
      evalConfigSchema.parse({
        name: "bad",
        objective: { description: "Bad eval." },
        target: { type: "command", command: ["node", "target.js"] },
        inputs: { dataset: "dataset.jsonl" },
        scoring_vectors: {
          valid_json: { type: "json_validity", weight: 0 }
        }
      })
    ).toThrow();
  });

  test("validates dataset rows and parses jsonl", () => {
    const rows = parseJsonl(
      [
        JSON.stringify({
          id: "case_001",
          input: { text: "hello" },
          reference: { label: "greeting" },
          tags: ["smoke"]
        }),
        "",
        JSON.stringify({ id: "case_002", input: { text: "bye" } })
      ].join("\n"),
      datasetRowSchema
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("case_001");
  });

  test("accepts auditable candidate metadata", () => {
    const parsed = candidateSchema.parse({
      id: "candidate_001",
      name: "Stricter JSON instructions",
      strategy: "constraint_first_prompt",
      hypothesis: "Explicit JSON constraints should improve format adherence.",
      changes: ["Add explicit JSON-only instruction."],
      expected_improvement: ["valid_json"],
      risk: ["May reduce natural language detail."]
    });

    expect(parsed.expected_improvement).toEqual(["valid_json"]);
  });

  test("accepts command judge rubric and judge metric metadata", () => {
    const config = evalConfigSchema.parse({
      name: "judge_eval",
      objective: { description: "Judge an output." },
      target: { type: "command", command: ["node", "target.js"] },
      inputs: { dataset: "dataset.jsonl" },
      scoring_vectors: {
        quality: {
          type: "command_judge",
          command: ["node", "judge.js"],
          rubric: "Pass if useful.",
          weight: 1
        }
      }
    });

    expect(config.scoring_vectors.quality.type).toBe("command_judge");
  });
});

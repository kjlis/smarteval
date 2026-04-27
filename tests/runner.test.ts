import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCommandTarget, runEvaluation } from "../src/runner.js";
import type { EvalConfig } from "../src/schemas.js";

describe("command runner", () => {
  test("passes dataset input on stdin and captures stdout", async () => {
    const result = await runCommandTarget(
      {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const row = JSON.parse(data); console.log(JSON.stringify({answer: row.input.text.toUpperCase()})); });"
        ]
      },
      { id: "case_001", input: { text: "hello" } },
      process.cwd()
    );

    expect(result.status).toBe("passed");
    expect(result.stdout).toContain("HELLO");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("marks timed out commands", async () => {
    const result = await runCommandTarget(
      {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "setTimeout(() => {}, 100);"
        ],
        timeout_ms: 10
      },
      { id: "case_001", input: {} },
      process.cwd()
    );

    expect(result.status).toBe("timeout");
  });

  test("writes auditable run artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-run-"));
    const evalDir = join(root, ".smarteval", "evals", "demo");
    await writeFile(join(root, "target.js"), "placeholder");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { text: "ok" } }) + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "demo",
      objective: { description: "Demo eval." },
      target: {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const row = JSON.parse(data); console.log(JSON.stringify({answer: row.input.text})); });"
        ]
      },
      inputs: { dataset: ".smarteval/evals/demo/dataset.jsonl" },
      scoring_vectors: {
        valid_json: { type: "json_validity", weight: 0.5 },
        answer: { type: "json_required_fields", fields: ["answer"], weight: 0.5 }
      }
    };

    const run = await runEvaluation({
      root,
      config,
      candidateId: "baseline"
    });

    const manifest = JSON.parse(
      await readFile(join(run.runDir, "manifest.json"), "utf8")
    );
    const scores = JSON.parse(await readFile(join(run.runDir, "scores.json"), "utf8"));
    const results = await readFile(join(run.runDir, "results.jsonl"), "utf8");

    expect(manifest.candidate_id).toBe("baseline");
    expect(scores.overall_score).toBe(1);
    expect(results).toContain("case_001");
  });
});

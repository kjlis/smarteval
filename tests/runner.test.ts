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

  test("executes command judges and persists judge metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-judge-run-"));
    const evalDir = join(root, ".smarteval", "evals", "judge_demo");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({
        id: "case_001",
        input: { text: "ok" },
        reference: { expected: "ok" },
        tags: ["judge"]
      }) + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "judge_demo",
      objective: { description: "Demo judge eval." },
      target: {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const row = JSON.parse(data); console.log(row.input.text); });"
        ]
      },
      inputs: { dataset: ".smarteval/evals/judge_demo/dataset.jsonl" },
      scoring_vectors: {
        quality: {
          type: "command_judge",
          command: [
            process.execPath,
            "-e",
            "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const input = JSON.parse(data); console.log(JSON.stringify({score: input.output === 'ok' ? 1 : 0, passed: input.output === 'ok', rationale: 'checked output', confidence: 0.95, metadata: {rubric: input.rubric}})); });"
          ],
          rubric: "Pass when the output is ok.",
          weight: 1
        }
      }
    };

    const run = await runEvaluation({
      root,
      config,
      candidateId: "candidate_001",
      runId: "judge-run"
    });

    const manifest = JSON.parse(await readFile(join(run.runDir, "manifest.json"), "utf8"));
    const result = JSON.parse(
      (await readFile(join(run.runDir, "results.jsonl"), "utf8")).trim()
    );

    expect(run.scores.overall_score).toBe(1);
    expect(result.metrics.quality.provider).toBe("command");
    expect(result.metrics.quality.raw_response).toContain("checked output");
    expect(result.metrics.quality.metadata.rubric).toBe("Pass when the output is ok.");
    expect(manifest.judges).toEqual([
      {
        metric: "quality",
        provider: "command",
        rubric: "Pass when the output is ok.",
        reproducibility: expect.stringContaining("Record judge command")
      }
    ]);
  });

  test("writes failure summaries grouped by metric and tag", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-failures-"));
    const evalDir = join(root, ".smarteval", "evals", "failure_demo");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      [
        JSON.stringify({ id: "case_001", input: { text: "bad" }, tags: ["refund"] }),
        JSON.stringify({ id: "case_002", input: { text: "bad" }, tags: ["billing"] })
      ].join("\n") + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "failure_demo",
      objective: { description: "Failure clustering demo." },
      target: {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "process.stdin.resume(); process.stdin.on('end', () => console.log('not json'));"
        ]
      },
      inputs: { dataset: ".smarteval/evals/failure_demo/dataset.jsonl" },
      scoring_vectors: {
        valid_json: { type: "json_validity", weight: 1 }
      }
    };

    const run = await runEvaluation({
      root,
      config,
      candidateId: "baseline",
      runId: "failure-run"
    });
    const summary = JSON.parse(
      await readFile(join(run.runDir, "failures-summary.json"), "utf8")
    );

    expect(summary.total_failed_examples).toBe(2);
    expect(summary.by_metric.valid_json.count).toBe(2);
    expect(summary.by_tag.refund.count).toBe(1);
    expect(summary.by_tag.billing.count).toBe(1);
  });

  test("enforces judge cost caps before running expensive judges", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-cost-cap-"));
    const evalDir = join(root, ".smarteval", "evals", "cost_demo");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { text: "ok" }, tags: [] }) + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "cost_demo",
      objective: { description: "Cost cap demo." },
      target: {
        type: "command",
        command: [process.execPath, "-e", "process.stdin.resume(); process.stdin.on('end', () => console.log('ok'));"]
      },
      inputs: { dataset: ".smarteval/evals/cost_demo/dataset.jsonl" },
      scoring_vectors: {
        quality: {
          type: "command_judge",
          command: [process.execPath, "-e", "console.log('{}')"],
          rubric: "Pass if ok.",
          estimated_cost_usd: 0.05,
          weight: 1
        }
      }
    };

    await expect(
      runEvaluation({ root, config, candidateId: "baseline", maxCostUsd: 0.01 })
    ).rejects.toThrow("Estimated judge cost");
  });

  test("runs examples with bounded concurrency", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-concurrency-"));
    const evalDir = join(root, ".smarteval", "evals", "concurrency_demo");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      [1, 2, 3]
        .map((id) => JSON.stringify({ id: `case_${id}`, input: { text: String(id) }, tags: [] }))
        .join("\n") + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "concurrency_demo",
      objective: { description: "Concurrency demo." },
      target: {
        type: "command",
        command: [
          process.execPath,
          "-e",
          "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => setTimeout(() => { const row = JSON.parse(data); console.log(row.id); }, 120));"
        ]
      },
      inputs: { dataset: ".smarteval/evals/concurrency_demo/dataset.jsonl" },
      scoring_vectors: {
        error_rate: { type: "error_rate", weight: 1 }
      }
    };

    const started = performance.now();
    const run = await runEvaluation({
      root,
      config,
      candidateId: "baseline",
      runId: "concurrent-run",
      concurrency: 3
    });
    const elapsed = performance.now() - started;

    expect(run.results.map((result) => result.example_id)).toEqual([
      "case_1",
      "case_2",
      "case_3"
    ]);
    expect(elapsed).toBeLessThan(320);
  });
});

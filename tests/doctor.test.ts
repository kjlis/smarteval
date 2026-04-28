import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runDoctor } from "../src/doctor.js";

describe("doctor", () => {
  test("reports missing dataset and unsupported target adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-doctor-"));
    const evalDir = join(root, ".smarteval", "evals", "bad_eval");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "eval.yaml"),
      [
        'schema_version: "1"',
        "name: bad_eval",
        "objective:",
        "  description: Bad eval.",
        "target:",
        "  type: python_function",
        "  entrypoint: app:run",
        "inputs:",
        "  dataset: .smarteval/evals/bad_eval/missing.jsonl",
        "scoring_vectors:",
        "  quality:",
        "    type: llm_judge",
        "    provider: openrouter_api",
        "    model: openai/gpt-4.1-mini",
        "    rubric: Pass if useful.",
        "    weight: 1"
      ].join("\n") + "\n"
    );

    const result = await runDoctor(root, { env: {} });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("Dataset file is missing")
      })
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "warning",
        message: expect.stringContaining("python_function targets are schema-supported")
      })
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("OPENROUTER_API_KEY")
      })
    );
  });

  test("reports empty datasets and missing command executables", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-doctor-empty-"));
    const evalDir = join(root, ".smarteval", "evals", "empty_eval");
    await mkdir(evalDir, { recursive: true });
    await writeFile(join(evalDir, "dataset.jsonl"), "");
    await writeFile(
      join(evalDir, "eval.yaml"),
      [
        'schema_version: "1"',
        "name: empty_eval",
        "objective:",
        "  description: Empty eval.",
        "target:",
        "  type: command",
        "  command:",
        "    - definitely-not-a-smareval-command",
        "inputs:",
        "  dataset: .smarteval/evals/empty_eval/dataset.jsonl",
        "scoring_vectors:",
        "  error_rate:",
        "    type: error_rate",
        "    weight: 1"
      ].join("\n") + "\n"
    );

    const result = await runDoctor(root);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "warning",
        message: expect.stringContaining("Dataset has no examples")
      })
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("Target command is not available")
      })
    );
  });

  test("checks configured Codex and Claude SDK package availability", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-doctor-sdk-"));
    await mkdir(join(root, ".smarteval"), { recursive: true });
    await writeFile(
      join(root, ".smarteval", "config.yaml"),
      [
        'schema_version: "1"',
        "defaults:",
        "  planner:",
        "    provider: codex_sdk",
        "    model: gpt-5.5",
        "  judge:",
        "    provider: claude_agent_sdk",
        "    model: claude-sonnet-4-5"
      ].join("\n") + "\n"
    );

    const result = await runDoctor(root, { env: { PATH: "" } });

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "warning",
        message: expect.stringContaining("@openai/codex-sdk")
      })
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        status: "warning",
        message: expect.stringContaining("@anthropic-ai/claude-agent-sdk")
      })
    );
  });
});

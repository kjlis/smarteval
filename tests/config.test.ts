import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readSmartevalConfig } from "../src/config.js";

describe("smarteval config", () => {
  test("reads repo defaults for planner, judge, cost, and concurrency", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-config-"));
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
        "    provider: openrouter_api",
        "    model: openai/gpt-5.4-mini",
        "  max_cost_usd: 1.5",
        "  concurrency: 3"
      ].join("\n") + "\n"
    );

    const config = await readSmartevalConfig(root);

    expect(config.defaults.planner?.provider).toBe("codex_sdk");
    expect(config.defaults.planner?.model).toBe("gpt-5.5");
    expect(config.defaults.judge?.provider).toBe("openrouter_api");
    expect(config.defaults.max_cost_usd).toBe(1.5);
    expect(config.defaults.concurrency).toBe(3);
  });

  test("returns empty defaults when config is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-no-config-"));

    const config = await readSmartevalConfig(root);

    expect(config.defaults).toEqual({});
  });
});

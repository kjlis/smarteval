import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ClaudeAgentSdkPlannerProvider,
  CodexSdkPlannerProvider,
  OpenRouterPlannerProvider,
  runCommandPlanner,
  writePlanArtifacts
} from "../src/planner.js";

describe("planner providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("runs a command planner and writes returned artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-planner-"));
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts", "target.js"), "console.log('target');\n");

    const planner = [
      process.execPath,
      "-e",
      [
        "let data='';",
        "process.stdin.on('data', c => data += c);",
        "process.stdin.on('end', () => {",
        " const request = JSON.parse(data);",
        " console.log(JSON.stringify({",
        "   eval: {",
        "     schema_version: '1',",
        "     name: request.name,",
        "     objective: { description: 'Assisted eval.' },",
        "     target: { type: 'command', command: ['node', 'scripts/target.js'] },",
        "     inputs: { dataset: `.smarteval/evals/${request.name}/dataset.jsonl` },",
        "     allowed_levers: ['prompt'],",
        "     scoring_vectors: { valid_json: { type: 'json_validity', weight: 1 } }",
        "   },",
        "   dataset: [{ id: 'case_001', input: { text: 'hello' }, tags: ['smoke'] }],",
        "   candidates: [{ id: 'baseline', name: 'Current behavior', strategy: 'baseline', hypothesis: 'Current behavior.', changes: ['No changes.'] }],",
        "   questions: ['Confirm allowed levers before running candidates.']",
        " }));",
        "});"
      ].join(" ")
    ];

    const output = await runCommandPlanner({
      root,
      name: "assisted_demo",
      providerCommand: planner,
      targetCommand: ["node", "scripts/target.js"]
    });
    await writePlanArtifacts(root, output);

    const evalYaml = await readFile(
      join(root, ".smarteval", "evals", "assisted_demo", "eval.yaml"),
      "utf8"
    );
    const dataset = await readFile(
      join(root, ".smarteval", "evals", "assisted_demo", "dataset.jsonl"),
      "utf8"
    );

    expect(evalYaml).toContain("Assisted eval");
    expect(dataset).toContain("case_001");
    expect(output.questions).toContain("Confirm allowed levers before running candidates.");
  });

  test("plans with Codex SDK through an optional dynamic adapter", async () => {
    const provider = new CodexSdkPlannerProvider(
      { model: "gpt-5.3-codex" },
      async () => ({
        Codex: class {
          async startThread() {
            return {
              async run() {
                return {
                  result: JSON.stringify(samplePlannerOutput("codex_demo"))
                };
              }
            };
          }
        }
      })
    );

    const output = await provider.plan({
      root: "/tmp/repo",
      name: "codex_demo",
      targetCommand: ["node", "target.js"]
    });

    expect(output.eval.name).toBe("codex_demo");
    expect(output.questions).toContain("Review generated plan before running.");
  });

  test("plans with Claude Agent SDK V2 through an optional dynamic adapter", async () => {
    const provider = new ClaudeAgentSdkPlannerProvider(
      { model: "claude-sonnet-4-5" },
      async () => ({
        unstable_v2_prompt: async () => ({
          subtype: "success",
          result: JSON.stringify(samplePlannerOutput("claude_demo"))
        })
      })
    );

    const output = await provider.plan({
      root: "/tmp/repo",
      name: "claude_demo",
      targetCommand: ["node", "target.js"]
    });

    expect(output.eval.name).toBe("claude_demo");
  });

  test("plans with OpenRouter using structured output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(samplePlannerOutput("openrouter_demo"))
              }
            }
          ]
        })
      }))
    );

    const provider = new OpenRouterPlannerProvider({
      apiKey: "test-key",
      model: "openai/gpt-5.4-mini"
    });

    const output = await provider.plan({
      root: "/tmp/repo",
      name: "openrouter_demo",
      targetCommand: ["node", "target.js"]
    });

    expect(output.eval.name).toBe("openrouter_demo");
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function samplePlannerOutput(name: string) {
  return {
    eval: {
      schema_version: "1",
      name,
      objective: { description: "Assisted eval." },
      target: { type: "command", command: ["node", "target.js"] },
      inputs: { dataset: `.smarteval/evals/${name}/dataset.jsonl` },
      allowed_levers: ["prompt"],
      scoring_vectors: {
        valid_json: { type: "json_validity", weight: 1 }
      }
    },
    dataset: [{ id: "case_001", input: { text: "hello" }, tags: ["smoke"] }],
    candidates: [
      {
        id: "baseline",
        name: "Current behavior",
        strategy: "baseline",
        hypothesis: "Current behavior.",
        changes: ["No changes."]
      }
    ],
    questions: ["Review generated plan before running."]
  };
}

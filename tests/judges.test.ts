import { describe, expect, test } from "vitest";
import {
  ClaudeAgentSdkJudgeProvider,
  CodexSdkJudgeProvider,
  CommandJudgeProvider,
  parseJudgeOutput,
  providerReproducibilityWarning
} from "../src/judges.js";

describe("judge providers", () => {
  test("parses structured judge output from raw JSON", () => {
    const parsed = parseJudgeOutput(
      JSON.stringify({
        score: 0.75,
        passed: true,
        rationale: "The answer is mostly correct.",
        confidence: 0.8
      })
    );

    expect(parsed.score).toBe(0.75);
    expect(parsed.passed).toBe(true);
    expect(parsed.confidence).toBe(0.8);
  });

  test("repairs wrapped JSON responses", () => {
    const parsed = parseJudgeOutput(
      "Result:\n```json\n{\"score\":1,\"passed\":true,\"rationale\":\"ok\"}\n```"
    );

    expect(parsed.score).toBe(1);
    expect(parsed.rationale).toBe("ok");
  });

  test("runs a command judge with structured metadata", async () => {
    const provider = new CommandJudgeProvider([
      process.execPath,
      "-e",
      "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => console.log(JSON.stringify({score:1,passed:true,rationale:'accepted',confidence:0.9,metadata:{seen:JSON.parse(data).example.id}})));"
    ]);

    const result = await provider.score({
      example: { id: "case_001", input: {} },
      output: "ok",
      rubric: "Pass if ok."
    });

    expect(result.provider).toBe("command");
    expect(result.score).toBe(1);
    expect(result.metadata.seen).toBe("case_001");
  });

  test("documents local-agent reproducibility limits", () => {
    expect(providerReproducibilityWarning("codex_sdk")).toContain("local agent");
    expect(providerReproducibilityWarning("claude_agent_sdk")).toContain("local agent");
    expect(providerReproducibilityWarning("openrouter_api")).toContain("API-backed");
  });

  test("scores with Codex SDK provider through an optional dynamic adapter", async () => {
    const provider = new CodexSdkJudgeProvider(
      { model: "gpt-5.3-codex" },
      async () => ({
        Codex: class {
          async startThread() {
            return {
              async run() {
                return {
                  result:
                    '{"score":0.8,"passed":true,"rationale":"codex accepted","confidence":0.7}'
                };
              }
            };
          }
        }
      })
    );

    const result = await provider.score({
      example: { id: "case_001", input: {}, tags: [] },
      output: "ok",
      rubric: "Pass if ok."
    });

    expect(result.provider).toBe("codex_sdk");
    expect(result.score).toBe(0.8);
    expect(result.rationale).toBe("codex accepted");
  });

  test("scores with Claude Agent SDK V2 provider through an optional dynamic adapter", async () => {
    const provider = new ClaudeAgentSdkJudgeProvider(
      { model: "claude-sonnet-4-5" },
      async () => ({
        unstable_v2_prompt: async () => ({
          subtype: "success",
          result:
            '{"score":0.9,"passed":true,"rationale":"claude accepted","confidence":0.8}'
        })
      })
    );

    const result = await provider.score({
      example: { id: "case_001", input: {}, tags: [] },
      output: "ok",
      rubric: "Pass if ok."
    });

    expect(result.provider).toBe("claude_agent_sdk");
    expect(result.score).toBe(0.9);
    expect(result.rationale).toBe("claude accepted");
  });
});

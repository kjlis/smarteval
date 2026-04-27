import { describe, expect, test } from "vitest";
import {
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
});

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  ClaudeAgentSdkJudgeProvider,
  CodexSdkJudgeProvider,
  CommandJudgeProvider,
  OpenRouterJudgeProvider,
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

  test("sends image artifacts to OpenRouter as multimodal content parts", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-openrouter-image-"));
    const imagePath = join(root, "image.png");
    await writeFile(imagePath, Buffer.from("fake-image"));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"score":1,"passed":true,"rationale":"image accepted"}'
            }
          }
        ]
      })
    })) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const provider = new OpenRouterJudgeProvider({
        apiKey: "test-key",
        model: "openai/gpt-5.4-mini",
        baseUrl: "https://openrouter.test"
      });

      const result = await provider.score({
        example: { id: "case_001", input: {}, tags: [] },
        output: "",
        rubric: "Judge the image.",
        image_artifact: {
          image_path: "image.png",
          absolute_path: imagePath,
          mime_type: "image/png"
        }
      });

      const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(result.score).toBe(1);
      expect(request.messages[1].content[0]).toMatchObject({ type: "text" });
      expect(request.messages[1].content[1]).toMatchObject({
        type: "image_url",
        image_url: { url: expect.stringContaining("data:image/png;base64,") }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  test("scores with Codex SDK finalResponse output", async () => {
    const provider = new CodexSdkJudgeProvider(
      { model: "gpt-5.5" },
      async () => ({
        Codex: class {
          startThread() {
            return {
              async run() {
                return {
                  finalResponse:
                    '{"score":0.85,"passed":true,"rationale":"codex final response accepted","confidence":0.7}'
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

    expect(result.score).toBe(0.85);
    expect(result.rationale).toBe("codex final response accepted");
  });

  test("scores Codex multimodal judges with local_image input entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-codex-image-"));
    const imagePath = join(root, "generated.png");
    const referencePath = join(root, "reference.png");
    await writeFile(imagePath, Buffer.from("generated"));
    await writeFile(referencePath, Buffer.from("reference"));
    let receivedPrompt: unknown;
    const provider = new CodexSdkJudgeProvider(
      { model: "gpt-5.5" },
      async () => ({
        Codex: class {
          startThread() {
            return {
              async run(prompt: unknown) {
                receivedPrompt = prompt;
                return {
                  finalResponse:
                    '{"score":0.9,"passed":true,"rationale":"codex saw images","confidence":0.7}'
                };
              }
            };
          }
        }
      })
    );

    const result = await provider.score({
      example: { id: "case_001", input: {}, tags: [] },
      output: "",
      rubric: "Judge generated and reference images.",
      image_artifact: {
        image_path: "generated.png",
        absolute_path: imagePath,
        mime_type: "image/png"
      },
      reference_image_artifact: {
        image_path: "reference.png",
        absolute_path: referencePath,
        mime_type: "image/png"
      }
    });

    expect(result.score).toBe(0.9);
    expect(receivedPrompt).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("generated.png") }),
      { type: "local_image", path: imagePath },
      { type: "local_image", path: referencePath }
    ]);
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

  test("scores with Claude Agent SDK query fallback", async () => {
    const provider = new ClaudeAgentSdkJudgeProvider(
      { model: "claude-sonnet-4-5" },
      async () => ({
        query: async function* () {
          yield {
            type: "result",
            subtype: "success",
            result:
              '{"score":0.95,"passed":true,"rationale":"claude query accepted","confidence":0.8}'
          };
        }
      })
    );

    const result = await provider.score({
      example: { id: "case_001", input: {}, tags: [] },
      output: "ok",
      rubric: "Pass if ok."
    });

    expect(result.provider).toBe("claude_agent_sdk");
    expect(result.score).toBe(0.95);
    expect(result.rationale).toBe("claude query accepted");
  });

  test("scores Claude multimodal judges through Read tool-mediated image paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-claude-image-"));
    const imagePath = join(root, "generated.png");
    const referencePath = join(root, "reference.png");
    await writeFile(imagePath, Buffer.from("generated"));
    await writeFile(referencePath, Buffer.from("reference"));
    let receivedRequest: unknown;
    const provider = new ClaudeAgentSdkJudgeProvider(
      { model: "claude-sonnet-4-5" },
      async () => ({
        query: async function* (request: unknown) {
          receivedRequest = request;
          yield {
            type: "result",
            subtype: "success",
            result:
              '{"score":0.92,"passed":true,"rationale":"claude read images","confidence":0.8}'
          };
        }
      })
    );

    const result = await provider.score({
      example: { id: "case_001", input: {}, tags: [] },
      output: "",
      rubric: "Judge generated and reference images.",
      image_artifact: {
        image_path: "generated.png",
        absolute_path: imagePath,
        mime_type: "image/png"
      },
      reference_image_artifact: {
        image_path: "reference.png",
        absolute_path: referencePath,
        mime_type: "image/png"
      }
    });

    expect(result.score).toBe(0.92);
    expect(receivedRequest).toMatchObject({
      prompt: expect.stringContaining(imagePath),
      options: {
        allowedTools: ["Read"]
      }
    });
    expect(JSON.stringify(receivedRequest)).toContain(referencePath);
  });
});

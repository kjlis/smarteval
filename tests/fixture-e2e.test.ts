import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "dist", "cli.js");

async function runCli(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd
  });
  return result.stdout;
}

async function runCliFailure(cwd: string, args: string[]): Promise<string> {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args], { cwd });
    throw new Error("Expected command to fail.");
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
  }
}

describe("fixture e2e", () => {
  test("initializes subscription-backed Codex defaults", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-init-e2e-"));

    await expect(runCli(workspace, ["init"])).resolves.toContain("Created .smarteval/config.yaml");
    const configYaml = await readFile(join(workspace, ".smarteval", "config.yaml"), "utf8");

    expect(configYaml).toContain("provider: codex_sdk");
    expect(configYaml).toContain("model: gpt-5.5");
  });

  test("requires assisted planning or explicit manual mode", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-plan-e2e-"));

    await expect(runCliFailure(workspace, ["plan", "--name", "demo"])).resolves.toContain(
      "No planner provider configured"
    );

    await expect(
      runCli(workspace, [
        "plan",
        "--manual",
        "--name",
        "demo",
        "--target",
        "node",
        "scripts/eval-target.js"
      ])
    ).resolves.toContain("Created .smarteval/evals/demo/");
  });

  test("uses configured planner defaults when plan flags are omitted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-plan-defaults-"));
    await mkdir(join(workspace, ".smarteval"), { recursive: true });
    await writeFile(
      join(workspace, ".smarteval", "config.yaml"),
      [
        'schema_version: "1"',
        "defaults:",
        "  planner:",
        "    provider: command",
        "    command:",
        `      - ${JSON.stringify(process.execPath)}`,
        "      - -e",
        "      - \"let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const request = JSON.parse(data); console.log(JSON.stringify({ eval: { schema_version: '1', name: request.name, objective: { description: 'Configured planner.' }, target: { type: 'command', command: ['node', 'target.js'] }, inputs: { dataset: '.smarteval/evals/' + request.name + '/dataset.jsonl' }, scoring_vectors: { valid_json: { type: 'json_validity', weight: 1 } } }, dataset: [{ id: 'case_001', input: { text: 'hello' }, tags: ['smoke'] }], candidates: [{ id: 'baseline', name: 'Current behavior', strategy: 'baseline', hypothesis: 'Current behavior.', changes: ['No changes.'] }] })); });\""
      ].join("\n") + "\n"
    );

    await expect(runCli(workspace, ["plan", "--name", "configured_demo"])).resolves.toContain(
      "Created .smarteval/evals/configured_demo/"
    );
    const evalYaml = await readFile(
      join(workspace, ".smarteval", "evals", "configured_demo", "eval.yaml"),
      "utf8"
    );
    expect(evalYaml).toContain("Configured planner");
  });

  test("configures Codex and Claude provider defaults from the CLI", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-config-defaults-e2e-"));

    await expect(
      runCli(workspace, [
        "config",
        "defaults",
        "--planner-provider",
        "claude_agent_sdk",
        "--planner-model",
        "claude-sonnet-4-5",
        "--judge-provider",
        "codex_sdk",
        "--judge-model",
        "gpt-5.5",
        "--max-cost-usd",
        "2.5",
        "--concurrency",
        "4"
      ])
    ).resolves.toContain("Updated .smarteval/config.yaml");

    const configYaml = await readFile(join(workspace, ".smarteval", "config.yaml"), "utf8");
    expect(configYaml).toContain("provider: claude_agent_sdk");
    expect(configYaml).toContain("provider: codex_sdk");
    expect(configYaml).toContain("model: gpt-5.5");
    expect(configYaml).toContain("max_cost_usd: 2.5");
    expect(configYaml).toContain("concurrency: 4");
  });

  test("configures subscription-backed provider presets", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-config-preset-e2e-"));

    await expect(runCli(workspace, ["config", "defaults", "--preset", "claude"])).resolves.toContain(
      "Updated .smarteval/config.yaml"
    );
    const claudeConfig = await readFile(join(workspace, ".smarteval", "config.yaml"), "utf8");
    expect(claudeConfig).toContain("provider: claude_agent_sdk");
    expect(claudeConfig).toContain("claude-sonnet-4-5");

    await expect(runCli(workspace, ["config", "defaults", "--preset", "codex"])).resolves.toContain(
      "Updated .smarteval/config.yaml"
    );
    const codexConfig = await readFile(join(workspace, ".smarteval", "config.yaml"), "utf8");
    expect(codexConfig).toContain("provider: codex_sdk");
    expect(codexConfig).toContain("gpt-5.5");
  });

  test("validates, runs, and reports against the demo fixture", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-fixture-e2e-"));
    const fixtureRoot = join(workspace, "demo");
    await cp(join(repoRoot, "fixtures", "demo"), fixtureRoot, {
      recursive: true
    });

    await expect(runCli(fixtureRoot, ["validate", "--eval", "demo"])).resolves.toContain(
      "Validated demo"
    );
    const runOutput = await runCli(fixtureRoot, ["run", "--eval", "demo", "--baseline"]);
    const runId = runOutput.match(/runs\/([^\s]+)\n/)?.[1];

    expect(runOutput).toContain("Overall score: 100.0%");
    expect(runId).toBeTruthy();

    const reportOutput = await runCli(fixtureRoot, [
      "report",
      "--eval",
      "demo",
      "--candidate",
      runId ?? ""
    ]);
    const report = await readFile(
      join(fixtureRoot, ".smarteval", "evals", "demo", "reports", "latest.md"),
      "utf8"
    );

    expect(reportOutput).toContain("# Smarteval Report: demo");
    expect(report).toContain("Candidate overall: 100.0%");
    expect(report).toContain("Dataset has fewer than 5 examples.");
  });

  test("imports human review ratings and includes them in reports", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-review-e2e-"));
    const fixtureRoot = join(workspace, "demo");
    await cp(join(repoRoot, "fixtures", "demo"), fixtureRoot, { recursive: true });

    const runOutput = await runCli(fixtureRoot, ["run", "--eval", "demo", "--baseline"]);
    const runId = runOutput.match(/runs\/([^\s]+)\n/)?.[1] ?? "";
    const ratingsPath = join(fixtureRoot, "ratings.csv");
    await writeFile(
      ratingsPath,
      [
        "example_id,winner,quality_score,content_score,notes",
        "case_001,candidate,5,4,Good"
      ].join("\n")
    );

    await expect(
      runCli(fixtureRoot, [
        "review",
        "import",
        "--eval",
        "demo",
        "--run",
        runId,
        "--file",
        ratingsPath
      ])
    ).resolves.toContain("Imported 1 human review rating");

    const report = await runCli(fixtureRoot, ["report", "--eval", "demo", "--candidate", runId]);
    expect(report).toContain("Human Review");
    expect(report).toContain("Candidate wins: 1");

    const baselineOutput = await runCli(fixtureRoot, ["run", "--eval", "demo", "--baseline"]);
    const baselineRunId = baselineOutput.match(/runs\/([^\s]+)\n/)?.[1] ?? "";
    const comparison = JSON.parse(
      await runCli(fixtureRoot, [
        "compare",
        "--eval",
        "demo",
        "--baseline",
        baselineRunId,
        "--candidate",
        runId
      ])
    );
    expect(comparison.human_review.candidate_win_rate).toBe(1);
    expect(comparison.human_review.net_candidate_wins).toBe(1);
  });

  test("runs the image fixture and reports image artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-image-fixture-e2e-"));
    const fixtureRoot = join(workspace, "image");
    await cp(join(repoRoot, "fixtures", "image"), fixtureRoot, { recursive: true });

    await expect(runCli(fixtureRoot, ["validate", "--eval", "image_demo"])).resolves.toContain(
      "Validated image_demo"
    );
    const runOutput = await runCli(fixtureRoot, ["run", "--eval", "image_demo", "--baseline"]);
    const runId = runOutput.match(/runs\/([^\s]+)\n/)?.[1] ?? "";
    const candidateOutput = await runCli(fixtureRoot, ["run", "--eval", "image_demo", "--candidate", "candidate"]);
    const candidateRunId = candidateOutput.match(/runs\/([^\s]+)\n/)?.[1] ?? "";

    expect(runOutput).toContain("Overall score: 100.0%");
    const judgeScript = [
      "let data='';",
      "process.stdin.on('data', c => data += c);",
      "process.stdin.on('end', () => {",
      "const input = JSON.parse(data);",
      "console.log(JSON.stringify({ winner: input.candidate_image_artifact ? 'candidate' : 'baseline', rationale: 'Candidate preferred.', criteria: { composition: 'candidate' } }));",
      "});"
    ].join(" ");
    await expect(
      runCli(fixtureRoot, [
        "review",
        "pairwise-command",
        "--eval",
        "image_demo",
        "--baseline",
        runId,
        "--candidate",
        candidateRunId,
        "--rubric",
        "Prefer stronger composition.",
        "--",
        process.execPath,
        "-e",
        judgeScript
      ])
    ).resolves.toContain("Pairwise image comparisons: 1");

    const report = await runCli(fixtureRoot, ["report", "--eval", "image_demo", "--candidate", candidateRunId]);
    const gallery = await readFile(
      join(fixtureRoot, ".smarteval", "evals", "image_demo", "runs", candidateRunId, "human-review", "gallery.md"),
      "utf8"
    );
    expect(report).toContain("Image Artifacts");
    expect(report).toContain("![case_001](artifacts/images/case_001.png)");
    expect(report).toContain("Pairwise Image Review");
    expect(report).toContain("Candidate wins: 1");
    expect(gallery).toContain("![case_001](../artifacts/images/case_001.png)");
  });

  test("installs Codex and Claude Code agent-pack templates", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "smarteval-agent-pack-e2e-"));

    await expect(runCli(repoRoot, ["agent-pack", "install", "--target", workspace])).resolves.toContain(
      "Installed agent pack templates"
    );

    const codexSkill = await readFile(join(workspace, ".codex", "skills", "smarteval", "SKILL.md"), "utf8");
    const claudeSkill = await readFile(join(workspace, ".claude", "skills", "smarteval", "SKILL.md"), "utf8");
    const claudePlanCommand = await readFile(join(workspace, ".claude", "commands", "smarteval-plan.md"), "utf8");
    const imageRubric = await readFile(
      join(workspace, ".codex", "skills", "smarteval", "references", "image-judge-rubric-template.md"),
      "utf8"
    );

    expect(codexSkill).toContain("Smarteval Workflow");
    expect(claudeSkill).toContain("Smarteval Workflow");
    expect(claudePlanCommand).toContain("smarteval plan");
    expect(imageRubric).toContain("Image Judge Rubric Template");
  });
});

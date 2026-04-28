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
});

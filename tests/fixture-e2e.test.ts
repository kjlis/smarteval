import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile } from "node:fs/promises";
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

describe("fixture e2e", () => {
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

#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { parse, stringify } from "yaml";
import { buildAgentTask, writeAgentTask } from "./agentTask.js";
import { findRepoRoot, pathExists, readEvalConfig, readSmartevalConfig, resolveEvalFile, writeYaml } from "./config.js";
import { runDoctor } from "./doctor.js";
import {
  ClaudeAgentSdkPlannerProvider,
  CodexSdkPlannerProvider,
  manualPlannerOutput,
  OpenRouterPlannerProvider,
  runCommandPlanner,
  writePlanArtifacts
} from "./planner.js";
import { compareAggregates, compareHumanReview, generateMarkdownReport } from "./report.js";
import { importHumanReviewCsv, runPairwiseImageCommandReview } from "./review.js";
import { runEvaluation } from "./runner.js";
import {
  aggregateScoreSchema,
  candidateSchema,
  datasetRowSchema,
  evalConfigSchema,
  parseJsonl,
  runManifestSchema
} from "./schemas.js";

const program = new Command();
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readHumanReviewSummary(runDir: string): Promise<ReturnType<typeof compareHumanReview> | undefined> {
  const reviewSummaryPath = join(runDir, "human-review", "summary.json");
  if (!(await pathExists(reviewSummaryPath))) return undefined;
  return compareHumanReview(JSON.parse(await readFile(reviewSummaryPath, "utf8")));
}

async function readPairwiseImageReviewSummary(runDir: string): Promise<unknown | undefined> {
  const reviewSummaryPath = join(runDir, "pairwise-image-review", "summary.json");
  if (!(await pathExists(reviewSummaryPath))) return undefined;
  return JSON.parse(await readFile(reviewSummaryPath, "utf8"));
}

program
  .name("smarteval")
  .description("Repo-local eval loop for controlled AI behavior changes.")
  .version("0.1.0");

program.command("init").description("Create the repo-local Smarteval directory.").action(async () => {
  const root = await findRepoRoot();
  await mkdir(join(root, ".smarteval", "evals"), { recursive: true });
  await writeYaml(join(root, ".smarteval", "config.yaml"), {
    schema_version: "1",
    created_by: "smarteval",
    defaults: {
      planner: {
        provider: "codex_sdk",
        model: "gpt-5.5"
      },
      judge: {
        provider: "codex_sdk",
        model: "gpt-5.5"
      },
      max_cost_usd: 0,
      concurrency: 1
    }
  });
  console.log("Created .smarteval/config.yaml");
});

program
  .command("config")
  .description("Manage repo-local Smarteval defaults.")
  .command("defaults")
  .description("Set default planner, judge, budget, and concurrency values.")
  .option("--preset <name>", "provider preset: codex, claude, api")
  .option("--planner-provider <provider>", "planner provider: command, codex_sdk, claude_agent_sdk, openrouter_api")
  .option("--planner-model <model>", "planner model")
  .option("--planner-command <command...>", "default command planner")
  .option("--judge-provider <provider>", "judge provider: command, codex_sdk, claude_agent_sdk, openrouter_api")
  .option("--judge-model <model>", "judge model")
  .option("--max-cost-usd <amount>", "default maximum estimated judge cost")
  .option("--concurrency <count>", "default run concurrency")
  .action(async (options: {
    preset?: "codex" | "claude" | "api";
    plannerProvider?: "command" | "codex_sdk" | "claude_agent_sdk" | "openrouter_api";
    plannerModel?: string;
    plannerCommand?: string[];
    judgeProvider?: "command" | "codex_sdk" | "claude_agent_sdk" | "openrouter_api";
    judgeModel?: string;
    maxCostUsd?: string;
    concurrency?: string;
  }) => {
    const root = await findRepoRoot();
    const current = await readSmartevalConfig(root);
    const preset =
      options.preset === "codex"
        ? {
            plannerProvider: "codex_sdk" as const,
            plannerModel: "gpt-5.5",
            judgeProvider: "codex_sdk" as const,
            judgeModel: "gpt-5.5"
          }
        : options.preset === "claude"
          ? {
              plannerProvider: "claude_agent_sdk" as const,
              plannerModel: "claude-sonnet-4-5",
              judgeProvider: "claude_agent_sdk" as const,
              judgeModel: "claude-sonnet-4-5"
            }
          : options.preset === "api"
            ? {
                plannerProvider: "openrouter_api" as const,
                plannerModel: "openai/gpt-5.4-mini",
                judgeProvider: "openrouter_api" as const,
                judgeModel: "openai/gpt-5.4-mini"
              }
            : {};
    const plannerProvider = options.plannerProvider ?? preset.plannerProvider ?? current.defaults.planner?.provider;
    const plannerModel = options.plannerModel ?? preset.plannerModel ?? current.defaults.planner?.model;
    const judgeProvider = options.judgeProvider ?? preset.judgeProvider ?? current.defaults.judge?.provider;
    const judgeModel = options.judgeModel ?? preset.judgeModel ?? current.defaults.judge?.model;
    if ((options.plannerModel || options.plannerCommand) && !plannerProvider) {
      throw new Error("--planner-provider is required when setting planner model or command without an existing planner default.");
    }
    if (options.judgeModel && !judgeProvider) {
      throw new Error("--judge-provider is required when setting judge model without an existing judge default.");
    }
    const next = {
      schema_version: current.schema_version,
      created_by: current.created_by ?? "smarteval",
      defaults: {
        ...current.defaults,
        planner:
          options.preset || options.plannerProvider || options.plannerModel || options.plannerCommand
            ? {
                ...current.defaults.planner,
                provider: plannerProvider,
                model: plannerModel,
                command: options.plannerCommand ?? current.defaults.planner?.command
              }
            : current.defaults.planner,
        judge:
          options.preset || options.judgeProvider || options.judgeModel
            ? {
                ...current.defaults.judge,
                provider: judgeProvider,
                model: judgeModel
              }
            : current.defaults.judge,
        max_cost_usd: options.maxCostUsd === undefined ? current.defaults.max_cost_usd : Number.parseFloat(options.maxCostUsd),
        concurrency: options.concurrency === undefined ? current.defaults.concurrency : Number.parseInt(options.concurrency, 10)
      }
    };
    await writeYaml(join(root, ".smarteval", "config.yaml"), next);
    console.log("Updated .smarteval/config.yaml");
  });

program
  .command("plan")
  .description("Create a human-editable eval plan and starter dataset.")
  .option("--name <name>", "eval name", "example_eval")
  .option("--goal <text>", "plain-language behavior goal for the eval")
  .option("--iterations <count>", "candidate iterations the agent should plan for")
  .option("--target <command...>", "command target to run for each dataset row")
  .option("--manual", "create deterministic manual scaffold without an assisted planner", false)
  .option("--planner-provider <provider>", "planner provider: command, codex_sdk, claude_agent_sdk, openrouter_api")
  .option("--planner-command <command...>", "command planner to run when --planner-provider command is used")
  .option("--planner-model <model>", "model to use for sdk/api planner providers")
  .action(async (options: { name: string; goal?: string; iterations?: string; target?: string[]; manual?: boolean; plannerProvider?: string; plannerCommand?: string[]; plannerModel?: string }) => {
    const root = await findRepoRoot();
    const smartevalConfig = await readSmartevalConfig(root);
    const provider = options.plannerProvider ?? smartevalConfig.defaults.planner?.provider;
    const plannerModel = options.plannerModel ?? smartevalConfig.defaults.planner?.model;
    const plannerCommand = options.plannerCommand ?? smartevalConfig.defaults.planner?.command;
    const iterations = options.iterations ? Number.parseInt(options.iterations, 10) : undefined;
    if (iterations !== undefined && (!Number.isInteger(iterations) || iterations < 1)) {
      throw new Error("--iterations must be a positive integer.");
    }

    if (!options.manual && !provider) {
      throw new Error(
        [
          "No planner provider configured.",
          "",
          "Choose one:",
          "- smarteval plan --planner-provider command --planner-command <cmd...>",
          "- smarteval plan --planner-provider codex_sdk",
          "- smarteval plan --planner-provider claude_agent_sdk",
          "- smarteval plan --planner-provider openrouter_api",
          "- smarteval plan --manual"
        ].join("\n")
      );
    }

    if (options.manual) {
      await writePlanArtifacts(root, manualPlannerOutput(options.name, options.target, options.goal, iterations ?? 1));
      console.log(`Created .smarteval/evals/${options.name}/`);
      return;
    }

    if (provider === "command") {
      if (!plannerCommand?.length) {
        throw new Error("--planner-command is required when --planner-provider command is used.");
      }
      const output = await runCommandPlanner({
        root,
        name: options.name,
        goal: options.goal,
        iterations,
        providerCommand: plannerCommand,
        targetCommand: options.target
      });
      await writePlanArtifacts(root, output);
      console.log(`Created .smarteval/evals/${output.eval.name}/`);
      for (const question of output.questions) {
        console.log(`Question: ${question}`);
      }
      return;
    }

    if (provider === "codex_sdk") {
      const output = await new CodexSdkPlannerProvider({
        model: plannerModel
      }).plan({
        root,
        name: options.name,
        goal: options.goal,
        iterations,
        targetCommand: options.target
      });
      await writePlanArtifacts(root, output);
      console.log(`Created .smarteval/evals/${output.eval.name}/`);
      for (const question of output.questions) {
        console.log(`Question: ${question}`);
      }
      return;
    }

    if (provider === "claude_agent_sdk") {
      const output = await new ClaudeAgentSdkPlannerProvider({
        model: plannerModel
      }).plan({
        root,
        name: options.name,
        goal: options.goal,
        iterations,
        targetCommand: options.target
      });
      await writePlanArtifacts(root, output);
      console.log(`Created .smarteval/evals/${output.eval.name}/`);
      for (const question of output.questions) {
        console.log(`Question: ${question}`);
      }
      return;
    }

    if (provider === "openrouter_api") {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is required when --planner-provider openrouter_api is used.");
      }
      const output = await new OpenRouterPlannerProvider({
        apiKey,
        model: plannerModel ?? "openai/gpt-5.4-mini"
      }).plan({
        root,
        name: options.name,
        goal: options.goal,
        iterations,
        targetCommand: options.target
      });
      await writePlanArtifacts(root, output);
      console.log(`Created .smarteval/evals/${output.eval.name}/`);
      for (const question of output.questions) {
        console.log(`Question: ${question}`);
      }
      return;
    }

    throw new Error(
      `Unsupported planner provider: ${provider}. Use command, codex_sdk, claude_agent_sdk, openrouter_api, or --manual.`
    );
  });

program
  .command("agent-task")
  .description("Write a coding-agent runbook for creating, running, and iterating an eval.")
  .requiredOption("--name <name>", "eval name")
  .requiredOption("--goal <text>", "plain-language behavior goal for the agent-led eval loop")
  .option("--iterations <count>", "candidate iterations to request", "3")
  .option("--provider <name>", "agent provider label: codex, claude, generic", "generic")
  .option("--out <path>", "output markdown path")
  .action(async (options: { name: string; goal: string; iterations: string; provider: string; out?: string }) => {
    const root = await findRepoRoot();
    const smartevalConfig = await readSmartevalConfig(root);
    const iterations = Number.parseInt(options.iterations, 10);
    if (!Number.isInteger(iterations) || iterations < 1) {
      throw new Error("--iterations must be a positive integer.");
    }
    if (!["codex", "claude", "generic"].includes(options.provider)) {
      throw new Error("--provider must be codex, claude, or generic.");
    }

    let evalConfig;
    const evalPath = join(root, ".smarteval", "evals", options.name, "eval.yaml");
    if (await pathExists(evalPath)) {
      evalConfig = await readEvalConfig(evalPath);
    }

    const task = buildAgentTask({
      name: options.name,
      goal: options.goal,
      iterations,
      provider: options.provider as "codex" | "claude" | "generic",
      evalConfig,
      defaults: smartevalConfig.defaults
    });
    const outPath = options.out ?? join(".smarteval", "agent-tasks", `${options.name}.md`);
    const written = await writeAgentTask(root, task, outPath);
    console.log(`Wrote ${written}`);
  });

program
  .command("dataset")
  .description("Dataset utilities.")
  .command("add")
  .option("--eval <name>", "eval name")
  .requiredOption("--id <id>", "example id")
  .requiredOption("--input <json>", "input JSON")
  .option("--reference <json>", "reference JSON")
  .option("--tags <tags>", "comma-separated tags")
  .action(async (options: { eval?: string; id: string; input: string; reference?: string; tags?: string }) => {
    const root = await findRepoRoot();
    const evalPath = await resolveEvalFile(root, options.eval);
    const config = await readEvalConfig(evalPath);
    const row = datasetRowSchema.parse({
      id: options.id,
      input: JSON.parse(options.input),
      reference: options.reference ? JSON.parse(options.reference) : undefined,
      tags: options.tags ? options.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : []
    });
    const datasetPath = join(root, config.inputs.dataset);
    await writeFile(datasetPath, JSON.stringify(row) + "\n", { flag: "a" });
    console.log(`Added ${row.id} to ${config.inputs.dataset}`);
  });

program
  .command("validate")
  .description("Validate eval plans, datasets, and candidates.")
  .option("--eval <name>", "eval name")
  .action(async (options: { eval?: string }) => {
    const root = await findRepoRoot();
    const evalPath = await resolveEvalFile(root, options.eval);
    const config = evalConfigSchema.parse(parse(await readFile(evalPath, "utf8")));
    const dataset = await readFile(join(root, config.inputs.dataset), "utf8");
    parseJsonl(dataset, datasetRowSchema);
    const candidateDir = join(dirname(evalPath), "candidates");
    if (await pathExists(candidateDir)) {
      for (const file of await readdir(candidateDir)) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          candidateSchema.parse(parse(await readFile(join(candidateDir, file), "utf8")));
        }
      }
    }
    console.log(`Validated ${config.name}`);
  });

program
  .command("run")
  .description("Run a baseline or candidate against the configured dataset.")
  .option("--eval <name>", "eval name")
  .option("--baseline", "run baseline")
  .option("--candidate <id>", "candidate id")
  .option("--max-cost-usd <amount>", "maximum estimated judge cost in USD")
  .option("--concurrency <count>", "number of examples to run at once")
  .action(async (options: { eval?: string; baseline?: boolean; candidate?: string; maxCostUsd?: string; concurrency: string }) => {
    const root = await findRepoRoot();
    const smartevalConfig = await readSmartevalConfig(root);
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const candidateId = options.candidate ?? (options.baseline ? "baseline" : "current");
    const run = await runEvaluation({
      root,
      config,
      candidateId,
      maxCostUsd: options.maxCostUsd === undefined ? smartevalConfig.defaults.max_cost_usd : Number.parseFloat(options.maxCostUsd),
      concurrency: options.concurrency === undefined ? smartevalConfig.defaults.concurrency : Number.parseInt(options.concurrency, 10),
      defaultJudgeProvider: smartevalConfig.defaults.judge?.provider === "command" ? undefined : smartevalConfig.defaults.judge?.provider,
      defaultJudgeModel: smartevalConfig.defaults.judge?.model
    });
    console.log(`Wrote ${run.runDir}`);
    console.log(`Overall score: ${(run.scores.overall_score * 100).toFixed(1)}%`);
  });

program
  .command("compare")
  .description("Compare two run score files.")
  .requiredOption("--baseline <run_id>", "baseline run id")
  .requiredOption("--candidate <run_id>", "candidate run id")
  .option("--eval <name>", "eval name")
  .action(async (options: { eval?: string; baseline: string; candidate: string }) => {
    const root = await findRepoRoot();
    const evalPath = await resolveEvalFile(root, options.eval);
    const config = await readEvalConfig(evalPath);
    const runRoot = join(root, ".smarteval", "evals", config.name, "runs");
    const baseline = aggregateScoreSchema.parse(JSON.parse(await readFile(join(runRoot, options.baseline, "scores.json"), "utf8")));
    const candidate = aggregateScoreSchema.parse(JSON.parse(await readFile(join(runRoot, options.candidate, "scores.json"), "utf8")));
    const comparison = compareAggregates(baseline, candidate);
    const humanReview = await readHumanReviewSummary(join(runRoot, options.candidate));
    if (humanReview) comparison.human_review = humanReview;
    console.log(JSON.stringify(comparison, null, 2));
  });

program
  .command("report")
  .description("Generate a markdown report for a candidate run.")
  .requiredOption("--candidate <run_id>", "candidate run id")
  .option("--baseline <run_id>", "baseline run id")
  .option("--eval <name>", "eval name")
  .action(async (options: { eval?: string; baseline?: string; candidate: string }) => {
    const root = await findRepoRoot();
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const runRoot = join(root, ".smarteval", "evals", config.name, "runs");
    const candidateDir = join(runRoot, options.candidate);
    const rawManifest = JSON.parse(await readFile(join(candidateDir, "manifest.json"), "utf8"));
    const reviewSummaryPath = join(candidateDir, "human-review", "summary.json");
    if (await pathExists(reviewSummaryPath)) {
      rawManifest.human_review = JSON.parse(await readFile(reviewSummaryPath, "utf8"));
    }
    const pairwiseSummary = await readPairwiseImageReviewSummary(candidateDir);
    if (pairwiseSummary) rawManifest.pairwise_image_review = pairwiseSummary;
    const manifest = runManifestSchema.parse(rawManifest);
    const candidate = aggregateScoreSchema.parse(JSON.parse(await readFile(join(candidateDir, "scores.json"), "utf8")));
    const baseline = options.baseline
      ? aggregateScoreSchema.parse(JSON.parse(await readFile(join(runRoot, options.baseline, "scores.json"), "utf8")))
      : undefined;
    const comparison = baseline ? compareAggregates(baseline, candidate) : undefined;
    const humanReview = await readHumanReviewSummary(candidateDir);
    if (comparison && humanReview) comparison.human_review = humanReview;
    const markdown = generateMarkdownReport({ manifest, baseline, candidate, comparison });
    const reportDir = join(root, ".smarteval", "evals", config.name, "reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(join(reportDir, "latest.md"), markdown);
    console.log(markdown);
  });

const reviewCommand = program
  .command("review")
  .description("Human review utilities.");

reviewCommand
  .command("import")
  .description("Import human image review ratings.")
  .option("--eval <name>", "eval name")
  .requiredOption("--run <run_id>", "run id")
  .requiredOption("--file <path>", "ratings CSV file")
  .action(async (options: { eval?: string; run: string; file: string }) => {
    const root = await findRepoRoot();
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const runDir = join(root, ".smarteval", "evals", config.name, "runs", options.run);
    const summary = await importHumanReviewCsv(options.file);
    const reviewDir = join(runDir, "human-review");
    await mkdir(reviewDir, { recursive: true });
    await writeFile(join(reviewDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(`Imported ${summary.total_ratings} human review rating(s).`);
  });

reviewCommand
  .command("pairwise-command")
  .description("Run a local command judge over matched baseline/candidate image artifacts.")
  .argument("<command...>", "command judge to run")
  .option("--eval <name>", "eval name")
  .requiredOption("--baseline <run_id>", "baseline run id")
  .requiredOption("--candidate <run_id>", "candidate run id")
  .requiredOption("--rubric <text>", "pairwise image comparison rubric")
  .action(async (command: string[], options: { eval?: string; baseline: string; candidate: string; rubric: string }) => {
    const root = await findRepoRoot();
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const runRoot = join(root, ".smarteval", "evals", config.name, "runs");
    const summary = await runPairwiseImageCommandReview({
      baselineRunDir: join(runRoot, options.baseline),
      candidateRunDir: join(runRoot, options.candidate),
      command,
      rubric: options.rubric
    });
    console.log(`Pairwise image comparisons: ${summary.total_comparisons}`);
    console.log(`Candidate wins: ${summary.wins.candidate}`);
    console.log(`Baseline wins: ${summary.wins.baseline}`);
    console.log(`Ties: ${summary.wins.tie}`);
  });

program
  .command("propose")
  .description("Create human-editable candidate hypothesis files.")
  .option("--eval <name>", "eval name")
  .option("--count <count>", "number of candidates", "1")
  .action(async (options: { eval?: string; count: string }) => {
    const root = await findRepoRoot();
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const candidateDir = join(root, ".smarteval", "evals", config.name, "candidates");
    await mkdir(candidateDir, { recursive: true });
    const count = Number.parseInt(options.count, 10);
    for (let index = 1; index <= count; index += 1) {
      const id = `candidate_${String(index).padStart(3, "0")}`;
      await writeFile(
        join(candidateDir, `${id}.yaml`),
        stringify({
          id,
          name: "Human-edited candidate",
          strategy: "hypothesis_placeholder",
          hypothesis: "Describe why this change should improve specific metrics.",
          changes: ["Describe exact allowed-lever changes here."],
          expected_improvement: Object.keys(config.scoring_vectors).slice(0, 1),
          risk: ["Describe possible regressions before running."]
        })
      );
    }
    console.log(`Wrote ${count} candidate file(s).`);
  });

program
  .command("apply")
  .argument("<candidate>", "candidate id")
  .option("--eval <name>", "eval name")
  .option("--dry-run", "print candidate changes without applying", false)
  .action(async (candidateId: string, options: { eval?: string; dryRun?: boolean }) => {
    const root = await findRepoRoot();
    const config = await readEvalConfig(await resolveEvalFile(root, options.eval));
    const candidatePath = join(root, ".smarteval", "evals", config.name, "candidates", `${candidateId}.yaml`);
    const candidate = candidateSchema.parse(parse(await readFile(candidatePath, "utf8")));
    if (!options.dryRun) {
      throw new Error("Only --dry-run is supported in the MVP. Apply changes manually after reviewing reports.");
    }
    console.log(stringify(candidate));
  });

program.command("doctor").description("Check local Smarteval setup.").action(async () => {
  const root = await findRepoRoot();
  const result = await runDoctor(root);
  console.log(`repo_root: ${result.root}`);
  for (const entry of result.checks) {
    console.log(`${entry.status}: ${entry.message}`);
  }
  if (!result.ok) process.exitCode = 1;
});

program
  .command("agent-pack")
  .description("Agent integration templates.")
  .command("install")
  .option("--target <dir>", "target repo directory", ".")
  .action(async (options: { target: string }) => {
    const target = options.target;
    const templateRoot = join(packageRoot, "templates", "agent-pack");
    await mkdir(join(target, ".codex", "skills"), { recursive: true });
    await mkdir(join(target, ".claude", "skills"), { recursive: true });
    await mkdir(join(target, ".claude", "commands"), { recursive: true });
    await cp(join(templateRoot, "codex-skill"), join(target, ".codex", "skills", "smarteval"), { recursive: true });
    await cp(join(templateRoot, "claude-skill"), join(target, ".claude", "skills", "smarteval"), { recursive: true });
    await cp(join(templateRoot, "references"), join(target, ".codex", "skills", "smarteval", "references"), { recursive: true });
    await cp(join(templateRoot, "references"), join(target, ".claude", "skills", "smarteval", "references"), { recursive: true });
    await cp(join(templateRoot, "claude-commands"), join(target, ".claude", "commands"), { recursive: true });
    await cp(join(templateRoot, "AGENTS.md"), join(target, "AGENTS.md"));
    await cp(join(templateRoot, "CLAUDE.md"), join(target, "CLAUDE.md"));
    console.log(`Installed agent pack templates into ${target}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

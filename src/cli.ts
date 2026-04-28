#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { parse, stringify } from "yaml";
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
import { compareAggregates, generateMarkdownReport } from "./report.js";
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
        provider: "openrouter_api",
        model: "openai/gpt-5.4-mini"
      },
      max_cost_usd: 0,
      concurrency: 1
    }
  });
  console.log("Created .smarteval/config.yaml");
});

program
  .command("plan")
  .description("Create a human-editable eval plan and starter dataset.")
  .option("--name <name>", "eval name", "example_eval")
  .option("--target <command...>", "command target to run for each dataset row")
  .option("--manual", "create deterministic manual scaffold without an assisted planner", false)
  .option("--planner-provider <provider>", "planner provider: command, codex_sdk, claude_agent_sdk, openrouter_api")
  .option("--planner-command <command...>", "command planner to run when --planner-provider command is used")
  .option("--planner-model <model>", "model to use for sdk/api planner providers")
  .action(async (options: { name: string; target?: string[]; manual?: boolean; plannerProvider?: string; plannerCommand?: string[]; plannerModel?: string }) => {
    const root = await findRepoRoot();
    const smartevalConfig = await readSmartevalConfig(root);
    const provider = options.plannerProvider ?? smartevalConfig.defaults.planner?.provider;
    const plannerModel = options.plannerModel ?? smartevalConfig.defaults.planner?.model;
    const plannerCommand = options.plannerCommand ?? smartevalConfig.defaults.planner?.command;

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
      await writePlanArtifacts(root, manualPlannerOutput(options.name, options.target));
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
      concurrency: options.concurrency === undefined ? smartevalConfig.defaults.concurrency : Number.parseInt(options.concurrency, 10)
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
    console.log(JSON.stringify(compareAggregates(baseline, candidate), null, 2));
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
    const manifest = runManifestSchema.parse(JSON.parse(await readFile(join(candidateDir, "manifest.json"), "utf8")));
    const candidate = aggregateScoreSchema.parse(JSON.parse(await readFile(join(candidateDir, "scores.json"), "utf8")));
    const baseline = options.baseline
      ? aggregateScoreSchema.parse(JSON.parse(await readFile(join(runRoot, options.baseline, "scores.json"), "utf8")))
      : undefined;
    const comparison = baseline ? compareAggregates(baseline, candidate) : undefined;
    const markdown = generateMarkdownReport({ manifest, baseline, candidate, comparison });
    const reportDir = join(root, ".smarteval", "evals", config.name, "reports");
    await mkdir(reportDir, { recursive: true });
    await writeFile(join(reportDir, "latest.md"), markdown);
    console.log(markdown);
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
    await mkdir(join(target, ".codex", "skills", "smarteval", "references"), { recursive: true });
    await mkdir(join(target, ".claude", "skills", "smarteval", "references"), { recursive: true });
    const skill = `---\nname: smarteval\ndescription: Use when evaluating or improving LLM prompts, RAG answers, structured outputs, image prompts, or agent workflows with a repo-local Smarteval eval loop.\n---\n\n# Smarteval workflow\n\n1. Run \`smarteval doctor\` if .smarteval exists.\n2. Run \`smarteval plan\` before changing AI behavior.\n3. Confirm target, allowed levers, scoring vectors, and budget.\n4. Run \`smarteval run --baseline\`.\n5. Propose and run only approved candidates.\n6. Use \`smarteval compare\` and \`smarteval report\` before applying changes.\n\nAlways report regressions, latency, cost, limitations, and dataset weakness.\n`;
    await writeFile(join(target, ".codex", "skills", "smarteval", "SKILL.md"), skill);
    await writeFile(join(target, ".claude", "skills", "smarteval", "SKILL.md"), skill);
    await writeFile(
      join(target, "AGENTS.md"),
      "## Smarteval workflow\n\nUse Smarteval before changing prompts, model configs, retrieval settings, structured-output instructions, or agent workflows unless explicitly told otherwise. Establish a baseline, run approved candidates, compare metric-level movement, and report regressions before applying changes.\n"
    );
    await writeFile(
      join(target, "CLAUDE.md"),
      "## Smarteval\n\nUse the Smarteval skill or CLI for controlled evaluation of probabilistic AI behavior. Prefer `smarteval plan`, `smarteval run --baseline`, `smarteval propose`, `smarteval compare`, and `smarteval report`.\n"
    );
    console.log(`Installed agent pack templates into ${target}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

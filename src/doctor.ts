import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { parse } from "yaml";
import { discoverEvalFiles, pathExists, readSmartevalConfig } from "./config.js";
import { datasetRowSchema, evalConfigSchema, parseJsonl, type EvalConfig } from "./schemas.js";

export type DoctorStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
  status: DoctorStatus;
  message: string;
}

export interface DoctorResult {
  ok: boolean;
  root: string;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  env?: Record<string, string | undefined>;
}

function check(status: DoctorStatus, message: string): DoctorCheck {
  return { status, message };
}

async function executableExists(command: string, env: Record<string, string | undefined>): Promise<boolean> {
  if (command.includes("/") || isAbsolute(command)) return pathExists(command);
  const paths = (env.PATH ?? process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const path of paths) {
    try {
      await access(join(path, command));
      return true;
    } catch {
      // Try the next PATH entry.
    }
  }
  return false;
}

function usesOpenRouter(config: EvalConfig): boolean {
  return Object.values(config.scoring_vectors).some(
    (metric) => metric.type === "llm_judge" && (metric.provider ?? "openrouter_api") === "openrouter_api"
  );
}

function providerPackage(provider: string): string | undefined {
  if (provider === "codex_sdk") return "@openai/codex-sdk";
  if (provider === "claude_agent_sdk") return "@anthropic-ai/claude-agent-sdk";
  return undefined;
}

function packageAvailable(root: string, packageName: string): boolean {
  try {
    createRequire(join(root, "package.json")).resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function sdkJudgeProviders(config: EvalConfig): string[] {
  return Object.values(config.scoring_vectors)
    .filter((metric) => metric.type === "llm_judge")
    .map((metric) => metric.provider ?? "openrouter_api")
    .filter((provider) => provider === "codex_sdk" || provider === "claude_agent_sdk");
}

export async function runDoctor(root: string, options: DoctorOptions = {}): Promise<DoctorResult> {
  const env = options.env ?? process.env;
  const checks: DoctorCheck[] = [];
  const hasConfig = await pathExists(join(root, ".smarteval", "config.yaml"));
  const smartevalConfig = await readSmartevalConfig(root);
  const evalFiles = await discoverEvalFiles(root);

  checks.push(check(hasConfig ? "ok" : "warning", hasConfig ? "Config file is present." : "Config file is missing; run `smarteval init`."));
  checks.push(check(evalFiles.length > 0 ? "ok" : "warning", evalFiles.length > 0 ? `Found ${evalFiles.length} eval(s).` : "No evals found."));

  for (const [label, provider] of [
    ["default planner", smartevalConfig.defaults.planner?.provider],
    ["default judge", smartevalConfig.defaults.judge?.provider]
  ] as const) {
    const packageName = provider ? providerPackage(provider) : undefined;
    if (packageName && !packageAvailable(root, packageName)) {
      checks.push(check("warning", `${packageName} is not installed; ${label} provider ${provider} will fail until it is added.`));
    }
  }

  for (const evalFile of evalFiles) {
    let config: EvalConfig;
    try {
      config = evalConfigSchema.parse(parse(await readFile(evalFile, "utf8")));
      checks.push(check("ok", `Eval ${config.name} schema is valid.`));
    } catch (error) {
      checks.push(check("error", `Eval file ${evalFile} is invalid: ${(error as Error).message}`));
      continue;
    }

    const datasetPath = isAbsolute(config.inputs.dataset)
      ? config.inputs.dataset
      : join(root, config.inputs.dataset);
    if (!(await pathExists(datasetPath))) {
      checks.push(check("error", `Dataset file is missing for ${config.name}: ${config.inputs.dataset}`));
    } else {
      try {
        const rows = parseJsonl(await readFile(datasetPath, "utf8"), datasetRowSchema);
        checks.push(
          check(
            rows.length === 0 ? "warning" : "ok",
            rows.length === 0
              ? `Dataset has no examples for ${config.name}.`
              : `Dataset has ${rows.length} example(s) for ${config.name}.`
          )
        );
      } catch (error) {
        checks.push(check("error", `Dataset is invalid for ${config.name}: ${(error as Error).message}`));
      }
    }

    if (config.target.type === "command") {
      const command = config.target.command[0]!;
      if (!(await executableExists(command, env))) {
        checks.push(check("error", `Target command is not available for ${config.name}: ${command}`));
      } else {
        checks.push(check("ok", `Target command is available for ${config.name}.`));
      }
    } else {
      checks.push(
        check(
          "warning",
          `${config.target.type} targets are schema-supported but require a command wrapper in the current runner.`
        )
      );
    }

    if (usesOpenRouter(config) && !env.OPENROUTER_API_KEY) {
      checks.push(check("error", `OPENROUTER_API_KEY is required for OpenRouter judge metrics in ${config.name}.`));
    }
    for (const provider of sdkJudgeProviders(config)) {
      const packageName = providerPackage(provider);
      if (packageName && !packageAvailable(root, packageName)) {
        checks.push(check("error", `${packageName} is required for ${provider} judge metrics in ${config.name}.`));
      }
    }
  }

  return {
    ok: !checks.some((entry) => entry.status === "error"),
    root,
    checks
  };
}

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { candidateSchema, evalConfigSchema, type Candidate, type EvalConfig } from "./schemas.js";

export const smartevalConfigSchema = z.object({
  schema_version: z.string().default("1"),
  created_by: z.string().optional(),
  defaults: z
    .object({
      planner: z
        .object({
          provider: z.enum(["command", "codex_sdk", "claude_agent_sdk", "openrouter_api"]),
          model: z.string().optional(),
          command: z.array(z.string()).min(1).optional()
        })
        .optional(),
      judge: z
        .object({
          provider: z.enum(["command", "codex_sdk", "claude_agent_sdk", "openrouter_api"]),
          model: z.string().optional()
        })
        .optional(),
      max_cost_usd: z.number().nonnegative().optional(),
      concurrency: z.number().int().positive().optional()
    })
    .default({})
});

export type SmartevalConfig = z.infer<typeof smartevalConfigSchema>;

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(start = process.cwd()): Promise<string> {
  let current = resolve(start);
  while (true) {
    if (
      (await pathExists(join(current, ".smarteval"))) ||
      (await pathExists(join(current, ".git"))) ||
      (await pathExists(join(current, "package.json")))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

export async function readEvalConfig(path: string): Promise<EvalConfig> {
  const raw = parse(await readFile(path, "utf8"));
  return evalConfigSchema.parse(raw);
}

export async function readSmartevalConfig(root: string): Promise<SmartevalConfig> {
  const path = join(root, ".smarteval", "config.yaml");
  if (!(await pathExists(path))) return smartevalConfigSchema.parse({});
  return smartevalConfigSchema.parse(parse(await readFile(path, "utf8")));
}

export async function writeYaml(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringify(value));
}

export async function readCandidate(path: string): Promise<Candidate> {
  return candidateSchema.parse(parse(await readFile(path, "utf8")));
}

export async function discoverEvalFiles(root: string): Promise<string[]> {
  const evalsDir = join(root, ".smarteval", "evals");
  if (!(await pathExists(evalsDir))) return [];
  const entries = await readdir(evalsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(evalsDir, entry.name, "eval.yaml"));
}

export async function resolveEvalFile(root: string, evalName?: string): Promise<string> {
  if (evalName) return join(root, ".smarteval", "evals", evalName, "eval.yaml");
  const files = await discoverEvalFiles(root);
  if (files.length === 1) return files[0]!;
  if (files.length === 0) throw new Error("No evals found. Run `smarteval plan --name <name> --target <command>` first.");
  throw new Error("Multiple evals found. Pass --eval <name>.");
}

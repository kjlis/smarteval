import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { runManifestSchema, type ImageArtifact } from "./schemas.js";

export interface HumanReviewRating {
  example_id: string;
  winner: "baseline" | "candidate" | "tie";
  quality_score: number;
  content_score: number;
  notes?: string;
}

export interface HumanReviewSummary {
  total_ratings: number;
  wins: { baseline: number; candidate: number; tie: number };
  average_quality_score: number;
  average_content_score: number;
  ratings: HumanReviewRating[];
}

type ReviewableImageArtifact = ImageArtifact & { example_id: string };

export interface PairwiseImageReviewResult {
  example_id: string;
  winner: "baseline" | "candidate" | "tie";
  rationale: string;
  criteria: Record<string, unknown>;
}

export interface PairwiseImageReviewSummary {
  total_comparisons: number;
  wins: { baseline: number; candidate: number; tie: number };
  results: PairwiseImageReviewResult[];
}

const pairwiseImageJudgeOutputSchema = z.object({
  winner: z.enum(["baseline", "candidate", "tie"]),
  rationale: z.string().min(1),
  criteria: z.record(z.string(), z.unknown()).default({})
});

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export async function importHumanReviewCsv(path: string): Promise<HumanReviewSummary> {
  const lines = (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? "");
  for (const required of ["example_id", "winner", "quality_score", "content_score"]) {
    if (!header.includes(required)) throw new Error(`Human review CSV missing required column: ${required}`);
  }
  const ratings = lines.map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    const winner = record.winner;
    if (winner !== "baseline" && winner !== "candidate" && winner !== "tie") {
      throw new Error(`Invalid human review winner: ${winner}`);
    }
    const qualityScore = Number(record.quality_score);
    const contentScore = Number(record.content_score);
    if (!record.example_id) throw new Error("Human review row is missing example_id.");
    if (!Number.isFinite(qualityScore)) throw new Error(`Invalid quality_score for ${record.example_id}.`);
    if (!Number.isFinite(contentScore)) throw new Error(`Invalid content_score for ${record.example_id}.`);
    return {
      example_id: record.example_id ?? "",
      winner: winner as HumanReviewRating["winner"],
      quality_score: qualityScore,
      content_score: contentScore,
      notes: record.notes
    };
  });

  const wins = {
    baseline: ratings.filter((rating) => rating.winner === "baseline").length,
    candidate: ratings.filter((rating) => rating.winner === "candidate").length,
    tie: ratings.filter((rating) => rating.winner === "tie").length
  };
  return {
    total_ratings: ratings.length,
    wins,
    average_quality_score:
      ratings.length === 0 ? 0 : ratings.reduce((sum, rating) => sum + rating.quality_score, 0) / ratings.length,
    average_content_score:
      ratings.length === 0 ? 0 : ratings.reduce((sum, rating) => sum + rating.content_score, 0) / ratings.length,
    ratings
  };
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export async function writeHumanReviewGallery(runDir: string, artifacts: ReviewableImageArtifact[]): Promise<void> {
  if (artifacts.length === 0) return;
  const reviewDir = join(runDir, "human-review");
  await mkdir(reviewDir, { recursive: true });

  const gallery = [
    "# Human Image Review",
    "",
    "Use `ratings-template.csv` as the import format with winner values of `baseline`, `candidate`, or `tie` and numeric quality/content scores.",
    ""
  ];
  for (const artifact of artifacts) {
    gallery.push(`## ${artifact.example_id}`);
    gallery.push(`![${artifact.example_id}](../${artifact.image_path})`);
    gallery.push("");
    gallery.push(`- MIME: ${artifact.mime_type ?? "unknown"}`);
    gallery.push(`- Dimensions: ${artifact.width ?? "?"}x${artifact.height ?? "?"}`);
    gallery.push(`- Size: ${artifact.file_size_bytes ?? "unknown"} bytes`);
    gallery.push("");
  }

  const rows = [
    "example_id,winner,quality_score,content_score,notes",
    ...artifacts.map((artifact) => [artifact.example_id, "", "", "", ""].map(csvCell).join(","))
  ];
  await writeFile(join(reviewDir, "gallery.md"), gallery.join("\n"));
  await writeFile(join(reviewDir, "ratings-template.csv"), rows.join("\n") + "\n");
}

async function runJsonCommand(commandParts: string[], input: unknown, cwd: string): Promise<unknown> {
  const [command, ...args] = commandParts;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Pairwise image judge exited with status ${code}.`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Pairwise image judge returned invalid JSON: ${(error as Error).message}`));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function runPairwiseImageCommandReview(options: {
  baselineRunDir: string;
  candidateRunDir: string;
  command: string[];
  rubric: string;
}): Promise<PairwiseImageReviewSummary> {
  if (options.command.length === 0) throw new Error("Pairwise image review requires a command.");
  const baselineManifest = runManifestSchema.parse(
    JSON.parse(await readFile(join(options.baselineRunDir, "manifest.json"), "utf8"))
  );
  const candidateManifest = runManifestSchema.parse(
    JSON.parse(await readFile(join(options.candidateRunDir, "manifest.json"), "utf8"))
  );
  const baselineByExample = new Map(
    baselineManifest.image_artifacts.map((artifact) => [artifact.example_id, artifact])
  );
  const results: PairwiseImageReviewResult[] = [];

  for (const candidateArtifact of candidateManifest.image_artifacts) {
    const baselineArtifact = baselineByExample.get(candidateArtifact.example_id);
    if (!baselineArtifact) continue;
    const raw = await runJsonCommand(
      options.command,
      {
        example_id: candidateArtifact.example_id,
        rubric: options.rubric,
        baseline_image_artifact: {
          ...baselineArtifact,
          absolute_path: join(options.baselineRunDir, baselineArtifact.image_path)
        },
        candidate_image_artifact: {
          ...candidateArtifact,
          absolute_path: join(options.candidateRunDir, candidateArtifact.image_path)
        }
      },
      options.candidateRunDir
    );
    const parsed = pairwiseImageJudgeOutputSchema.parse(raw);
    results.push({
      example_id: candidateArtifact.example_id,
      winner: parsed.winner,
      rationale: parsed.rationale,
      criteria: parsed.criteria
    });
  }

  const summary: PairwiseImageReviewSummary = {
    total_comparisons: results.length,
    wins: {
      baseline: results.filter((result) => result.winner === "baseline").length,
      candidate: results.filter((result) => result.winner === "candidate").length,
      tie: results.filter((result) => result.winner === "tie").length
    },
    results
  };
  const outDir = join(options.candidateRunDir, "pairwise-image-review");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

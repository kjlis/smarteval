import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { runEvaluation } from "../src/runner.js";
import { generateMarkdownReport } from "../src/report.js";
import { importHumanReviewCsv, runPairwiseImageCommandReview } from "../src/review.js";
import type { EvalConfig } from "../src/schemas.js";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePngBase64(width: number, height: number, pixels: number[][]): string {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const scanlines: number[] = [];
  for (let row = 0; row < height; row += 1) {
    scanlines.push(0);
    for (let column = 0; column < width; column += 1) {
      scanlines.push(...(pixels[row * width + column] ?? [255, 255, 255, 255]));
    }
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from(scanlines))),
    pngChunk("IEND", Buffer.alloc(0))
  ]).toString("base64");
}

const variedPngBase64 = makePngBase64(2, 1, [
  [255, 0, 0, 255],
  [0, 255, 0, 255]
]);

const blankPngBase64 = makePngBase64(2, 1, [
  [255, 255, 255, 255],
  [255, 255, 255, 255]
]);

describe("image evals", () => {
  test("captures image artifacts and scores deterministic image checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-"));
    const evalDir = join(root, ".smarteval", "evals", "image_demo");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "red pixel" }, tags: ["smoke"] }) + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('generated.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'generated.png', metadata: { model: 'fixture' } }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_demo",
      objective: { description: "Evaluate image artifacts." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_demo/dataset.jsonl" },
      scoring_vectors: {
        exists: { type: "image_exists", weight: 0.25 },
        mime: { type: "image_mime_type", allowed: ["image/png"], weight: 0.25 },
        dims: { type: "image_dimensions", width: 2, height: 1, min_aspect_ratio: 1.9, max_aspect_ratio: 2.1, weight: 0.2 },
        size: { type: "image_file_size", max_bytes: 200, weight: 0.15 },
        nonblank: { type: "image_not_blank", weight: 0.15 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "image-run" });
    const result = JSON.parse((await readFile(join(run.runDir, "results.jsonl"), "utf8")).trim());

    expect(run.scores.overall_score).toBe(1);
    expect(result.image_artifact.mime_type).toBe("image/png");
    expect(result.image_artifact.width).toBe(2);
    expect(result.image_artifact.height).toBe(1);
    expect(result.metrics.nonblank.passed).toBe(true);
    expect(result.image_artifact.metadata.image_stats.appears_blank).toBe(false);
    expect(result.image_artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(join(run.runDir, result.image_artifact.image_path))).toBeInstanceOf(Buffer);
    const gallery = await readFile(join(run.runDir, "human-review", "gallery.md"), "utf8");
    const template = await readFile(join(run.runDir, "human-review", "ratings-template.csv"), "utf8");
    expect(gallery).toContain("Human Image Review");
    expect(gallery).toContain("![case_001](../artifacts/images/case_001.png)");
    expect(template).toContain("example_id,winner,quality_score,content_score,notes");
    expect(template).toContain("case_001,,,,");
  });

  test("fails image_not_blank for blank PNG artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-blank-"));
    const evalDir = join(root, ".smarteval", "evals", "image_blank");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "blank image" }, tags: [] }) + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('blank.png', Buffer.from('${blankPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'blank.png' }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_blank",
      objective: { description: "Reject blank image artifacts." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_blank/dataset.jsonl" },
      scoring_vectors: {
        nonblank: { type: "image_not_blank", weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "blank-run" });
    const result = JSON.parse((await readFile(join(run.runDir, "results.jsonl"), "utf8")).trim());

    expect(run.scores.overall_score).toBe(0);
    expect(result.metrics.nonblank.passed).toBe(false);
    expect(result.image_artifact.metadata.image_stats.appears_blank).toBe(true);
  });

  test("fails image_unique for duplicate generated artifacts in one run", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-duplicate-"));
    const evalDir = join(root, ".smarteval", "evals", "image_duplicate");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      [
        JSON.stringify({ id: "case_001", input: { prompt: "first" }, tags: [] }),
        JSON.stringify({ id: "case_002", input: { prompt: "second" }, tags: [] })
      ].join("\n") + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('duplicate.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'duplicate.png' }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_duplicate",
      objective: { description: "Detect duplicate generated image artifacts." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_duplicate/dataset.jsonl" },
      scoring_vectors: {
        unique: { type: "image_unique", weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "duplicate-run" });

    expect(run.scores.overall_score).toBe(0);
    expect(run.results.map((result) => result.metrics.unique.passed)).toEqual([false, false]);
    expect(run.results[0]?.metrics.unique.rationale).toContain("Duplicate image hash");
  });

  test("fails image_exists when target references a missing image artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-missing-"));
    const evalDir = join(root, ".smarteval", "evals", "image_missing");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "missing" }, tags: [] }) + "\n"
    );

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_missing",
      objective: { description: "Fail missing image artifacts." },
      target: {
        type: "command",
        command: [process.execPath, "-e", "console.log(JSON.stringify({ image_path: 'missing.png' }));"],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_missing/dataset.jsonl" },
      scoring_vectors: {
        exists: { type: "image_exists", weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "missing-run" });

    expect(run.scores.overall_score).toBe(0);
    expect(run.results[0]?.status).toBe("failed");
    expect(run.results[0]?.metrics.exists.passed).toBe(false);
  });

  test("fails image_not_blank for invalid PNG bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-invalid-"));
    const evalDir = join(root, ".smarteval", "evals", "image_invalid");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "invalid" }, tags: [] }) + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      "fs.writeFileSync('invalid.png', 'not actually an image');",
      "console.log(JSON.stringify({ image_path: 'invalid.png' }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_invalid",
      objective: { description: "Fail invalid image artifacts." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_invalid/dataset.jsonl" },
      scoring_vectors: {
        nonblank: { type: "image_not_blank", weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "invalid-run" });

    expect(run.scores.overall_score).toBe(0);
    expect(run.results[0]?.metrics.nonblank.rationale).toContain("blankness stats are missing");
  });

  test("fails image_dimensions when dimensions do not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-wrong-dimensions-"));
    const evalDir = join(root, ".smarteval", "evals", "image_wrong_dimensions");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "wrong dimensions" }, tags: [] }) + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('small.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'small.png' }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_wrong_dimensions",
      objective: { description: "Fail wrong image dimensions." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_wrong_dimensions/dataset.jsonl" },
      scoring_vectors: {
        dimensions: { type: "image_dimensions", width: 1024, height: 1024, weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "wrong-dimensions-run" });

    expect(run.scores.overall_score).toBe(0);
    expect(run.results[0]?.metrics.dimensions.passed).toBe(false);
    expect(run.results[0]?.metrics.dimensions.rationale).toContain("2x1");
  });

  test("warns when image evals have no reference images and judge-only visual scoring", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-warnings-"));
    const evalDir = join(root, ".smarteval", "evals", "image_warnings");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "warn" }, tags: [] }) + "\n"
    );

    const script = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('generated.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'generated.png' }));"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_warnings",
      objective: { description: "Warn about weak image eval setup." },
      target: {
        type: "command",
        command: [process.execPath, "-e", script],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_warnings/dataset.jsonl" },
      scoring_vectors: {
        visual_quality: { type: "llm_judge", rubric: "Score visual quality.", weight: 1 }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "warnings-run" });

    expect(run.manifest.warnings).toContain("Image eval has no reference image artifacts.");
    expect(run.manifest.warnings).toContain("Image scoring is judge-only; add deterministic image checks where possible.");
  });

  test("passes generated and reference image artifact paths to command judges", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-command-judge-"));
    const evalDir = join(root, ".smarteval", "evals", "image_command_judge");
    await mkdir(evalDir, { recursive: true });
    await writeFile(join(root, "reference.png"), Buffer.from(variedPngBase64, "base64"));
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({
        id: "case_001",
        input: { prompt: "judge image" },
        reference: { image_path: "reference.png" },
        tags: []
      }) + "\n"
    );

    const targetScript = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('generated.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'generated.png' }));"
    ].join(" ");
    const judgeScript = [
      "const fs = require('node:fs');",
      "let data='';",
      "process.stdin.on('data', c => data += c);",
      "process.stdin.on('end', () => {",
      "const input = JSON.parse(data);",
      "const ok = Boolean(input.image_artifact?.absolute_path && fs.existsSync(input.image_artifact.absolute_path) && input.reference_image_artifact?.absolute_path && fs.existsSync(input.reference_image_artifact.absolute_path));",
      "console.log(JSON.stringify({ score: ok ? 1 : 0, passed: ok, rationale: ok ? 'Saw image paths.' : 'Missing image paths.', metadata: { image_path: input.image_artifact?.image_path, reference_image_path: input.reference_image_artifact?.image_path } }));",
      "});"
    ].join(" ");

    const config: EvalConfig = {
      schema_version: "1",
      name: "image_command_judge",
      objective: { description: "Pass image artifacts to command judges." },
      target: {
        type: "command",
        command: [process.execPath, "-e", targetScript],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_command_judge/dataset.jsonl" },
      scoring_vectors: {
        visual_quality: {
          type: "command_judge",
          command: [process.execPath, "-e", judgeScript],
          rubric: "Check generated image against reference image.",
          weight: 1
        }
      }
    };

    const run = await runEvaluation({ root, config, candidateId: "baseline", runId: "command-judge-run" });

    expect(run.scores.overall_score).toBe(1);
    expect(run.results[0]?.metrics.visual_quality.metadata?.image_path).toBe("artifacts/images/case_001.png");
    expect(run.results[0]?.metrics.visual_quality.metadata?.reference_image_path).toBe("reference.png");
  });

  test("runs pairwise image command review across baseline and candidate runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-image-pairwise-"));
    const evalDir = join(root, ".smarteval", "evals", "image_pairwise");
    await mkdir(evalDir, { recursive: true });
    await writeFile(
      join(evalDir, "dataset.jsonl"),
      JSON.stringify({ id: "case_001", input: { prompt: "pairwise" }, tags: [] }) + "\n"
    );

    const targetScript = [
      "const fs = require('node:fs');",
      `fs.writeFileSync('generated.png', Buffer.from('${variedPngBase64}', 'base64'));`,
      "console.log(JSON.stringify({ image_path: 'generated.png' }));"
    ].join(" ");
    const config: EvalConfig = {
      schema_version: "1",
      name: "image_pairwise",
      objective: { description: "Pairwise image comparison." },
      target: {
        type: "command",
        command: [process.execPath, "-e", targetScript],
        output_mode: "image_artifact"
      },
      inputs: { dataset: ".smarteval/evals/image_pairwise/dataset.jsonl" },
      scoring_vectors: {
        exists: { type: "image_exists", weight: 1 }
      }
    };
    const baseline = await runEvaluation({ root, config, candidateId: "baseline", runId: "baseline-run" });
    const candidate = await runEvaluation({ root, config, candidateId: "candidate", runId: "candidate-run" });
    const judgeScript = [
      "const fs = require('node:fs');",
      "let data='';",
      "process.stdin.on('data', c => data += c);",
      "process.stdin.on('end', () => {",
      "const input = JSON.parse(data);",
      "const ok = fs.existsSync(input.baseline_image_artifact.absolute_path) && fs.existsSync(input.candidate_image_artifact.absolute_path);",
      "console.log(JSON.stringify({ winner: ok ? 'candidate' : 'baseline', rationale: ok ? 'Candidate is sharper.' : 'Missing image.', criteria: { prompt_adherence: 'candidate' } }));",
      "});"
    ].join(" ");

    const summary = await runPairwiseImageCommandReview({
      baselineRunDir: baseline.runDir,
      candidateRunDir: candidate.runDir,
      command: [process.execPath, "-e", judgeScript],
      rubric: "Prefer sharper image."
    });

    expect(summary.total_comparisons).toBe(1);
    expect(summary.wins.candidate).toBe(1);
    expect(summary.results[0]?.criteria.prompt_adherence).toBe("candidate");
    expect(JSON.parse(await readFile(join(candidate.runDir, "pairwise-image-review", "summary.json"), "utf8")).wins.candidate).toBe(1);
  });

  test("includes image artifact links in markdown reports", () => {
    const markdown = generateMarkdownReport({
      manifest: {
        smarteval_version: "0.1.0",
        eval_schema_version: "1",
        eval_name: "image_demo",
        run_id: "image-run",
        candidate_id: "baseline",
        created_at: "2026-04-28T00:00:00.000Z",
        target: { type: "command", command: ["node", "target.js"], output_mode: "image_artifact" },
        dataset_path: ".smarteval/evals/image_demo/dataset.jsonl",
        dataset_hash: "abc",
        git: { commit: "unknown", dirty: true },
        judges: [],
        estimated_cost_usd: 0,
        image_artifacts: [
          {
            example_id: "case_001",
            image_path: "artifacts/images/case_001.png",
            mime_type: "image/png",
            width: 1,
            height: 1,
            file_size_bytes: 70,
            sha256: "a".repeat(64)
          }
        ],
        warnings: []
      },
      candidate: {
        overall_score: 1,
        example_count: 1,
        metrics: {
          exists: { score: 1, weight: 1, passed: 1, failed: 0 }
        },
        runtime: { average_latency_ms: 1, error_rate: 0, timeout_count: 0 }
      }
    });

    expect(markdown).toContain("Image Artifacts");
    expect(markdown).toContain("![case_001](artifacts/images/case_001.png)");
    expect(markdown).toContain("MIME: image/png");
    expect(markdown).toContain("Dimensions: 1x1");
    expect(markdown).toContain("Size: 70 bytes");
  });

  test("imports human image review ratings", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-review-"));
    const file = join(root, "ratings.csv");
    await writeFile(
      file,
      [
        "example_id,winner,quality_score,content_score,notes",
        "case_001,candidate,5,4,Better prompt adherence",
        "case_002,baseline,2,3,Candidate distorted subject",
        "case_003,tie,4,4,Both acceptable"
      ].join("\n")
    );

    const review = await importHumanReviewCsv(file);

    expect(review.total_ratings).toBe(3);
    expect(review.wins.candidate).toBe(1);
    expect(review.wins.baseline).toBe(1);
    expect(review.wins.tie).toBe(1);
    expect(review.average_quality_score).toBeCloseTo(11 / 3);
  });

  test("rejects invalid human image review ratings", async () => {
    const root = await mkdtemp(join(tmpdir(), "smarteval-review-invalid-"));
    const file = join(root, "ratings.csv");
    await writeFile(file, ["example_id,winner,quality_score,content_score", "case_001,other,5,4"].join("\n"));

    await expect(importHumanReviewCsv(file)).rejects.toThrow("Invalid human review winner");
  });

  test("includes imported human review summaries in reports", () => {
    const markdown = generateMarkdownReport({
      manifest: {
        smarteval_version: "0.1.0",
        eval_schema_version: "1",
        eval_name: "image_demo",
        run_id: "image-run",
        candidate_id: "candidate",
        created_at: "2026-04-28T00:00:00.000Z",
        target: { type: "command", command: ["node", "target.js"], output_mode: "image_artifact" },
        dataset_path: ".smarteval/evals/image_demo/dataset.jsonl",
        dataset_hash: "abc",
        git: { commit: "unknown", dirty: true },
        judges: [],
        estimated_cost_usd: 0,
        image_artifacts: [],
        human_review: {
          total_ratings: 3,
          wins: { baseline: 1, candidate: 1, tie: 1 },
          average_quality_score: 3.7,
          average_content_score: 3.7
        },
        warnings: []
      },
      candidate: {
        overall_score: 1,
        example_count: 1,
        metrics: {
          exists: { score: 1, weight: 1, passed: 1, failed: 0 }
        },
        runtime: { average_latency_ms: 1, error_rate: 0, timeout_count: 0 }
      }
    });

    expect(markdown).toContain("Human Review");
    expect(markdown).toContain("Candidate wins: 1");
    expect(markdown).toContain("Average quality score: 3.70");
  });
});

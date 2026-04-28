import { z } from "zod";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue)
  ])
);

export const commandTargetSchema = z.object({
  type: z.literal("command"),
  command: z.array(z.string()).min(1),
  output_mode: z.enum(["text", "json", "image_artifact"]).default("text"),
  timeout_ms: z.number().int().positive().optional()
});

export const pythonFunctionTargetSchema = z.object({
  type: z.literal("python_function"),
  entrypoint: z.string().min(1),
  timeout_ms: z.number().int().positive().optional()
});

export const nodeFunctionTargetSchema = z.object({
  type: z.literal("node_function"),
  entrypoint: z.string().min(1),
  timeout_ms: z.number().int().positive().optional()
});

export const targetSchema = z.discriminatedUnion("type", [
  commandTargetSchema,
  pythonFunctionTargetSchema,
  nodeFunctionTargetSchema
]);

const weighted = {
  weight: z.number().positive()
};

export const evaluatorConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("json_validity"), ...weighted }),
  z.object({
    type: z.literal("json_required_fields"),
    fields: z.array(z.string()).min(1),
    ...weighted
  }),
  z.object({ type: z.literal("contains"), value: z.string().min(1), ...weighted }),
  z.object({
    type: z.literal("not_contains"),
    value: z.string().min(1),
    ...weighted
  }),
  z.object({ type: z.literal("regex"), pattern: z.string().min(1), ...weighted }),
  z.object({ type: z.literal("max_words"), max: z.number().int().nonnegative(), ...weighted }),
  z.object({ type: z.literal("max_chars"), max: z.number().int().nonnegative(), ...weighted }),
  z.object({ type: z.literal("min_words"), min: z.number().int().nonnegative(), ...weighted }),
  z.object({ type: z.literal("exact_match"), ...weighted }),
  z.object({ type: z.literal("field_match"), field: z.string().min(1), ...weighted }),
  z.object({ type: z.literal("latency"), max_ms: z.number().int().positive().optional(), ...weighted }),
  z.object({ type: z.literal("error_rate"), ...weighted }),
  z.object({ type: z.literal("timeout_count"), ...weighted }),
  z.object({ type: z.literal("image_exists"), ...weighted }),
  z.object({
    type: z.literal("image_mime_type"),
    allowed: z.array(z.string()).min(1),
    ...weighted
  }),
  z.object({
    type: z.literal("image_dimensions"),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    min_width: z.number().int().positive().optional(),
    min_height: z.number().int().positive().optional(),
    max_width: z.number().int().positive().optional(),
    max_height: z.number().int().positive().optional(),
    min_aspect_ratio: z.number().positive().optional(),
    max_aspect_ratio: z.number().positive().optional(),
    ...weighted
  }),
  z.object({
    type: z.literal("image_file_size"),
    min_bytes: z.number().int().nonnegative().optional(),
    max_bytes: z.number().int().nonnegative().optional(),
    ...weighted
  }),
  z.object({ type: z.literal("image_not_blank"), ...weighted }),
  z.object({ type: z.literal("image_unique"), ...weighted }),
  z.object({
    type: z.literal("llm_judge"),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    rubric: z.string().min(1),
    estimated_cost_usd: z.number().nonnegative().optional(),
    ...weighted
  }),
  z.object({
    type: z.literal("command_judge"),
    command: z.array(z.string()).min(1),
    rubric: z.string().min(1),
    estimated_cost_usd: z.number().nonnegative().optional(),
    ...weighted
  })
]);

export const evalConfigSchema = z.object({
  schema_version: z.string().default("1"),
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  objective: z.object({
    description: z.string().min(1)
  }),
  target: targetSchema,
  inputs: z.object({
    dataset: z.string().min(1)
  }),
  allowed_levers: z.array(z.string()).default([]),
  fixed_constraints: z.array(z.string()).default([]),
  scoring_vectors: z.record(z.string(), evaluatorConfigSchema).refine(
    (vectors) => Object.keys(vectors).length > 0,
    "At least one scoring vector is required."
  ),
  experiment_budget: z
    .object({
      iterations: z.number().int().positive().optional(),
      candidates_per_iteration: z.number().int().positive().optional(),
      max_cost_usd: z.number().nonnegative().optional()
    })
    .default({})
});

export const datasetRowSchema = z.object({
  id: z.string().min(1),
  input: jsonValue,
  reference: jsonValue.optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  split: z.enum(["dev", "validation", "holdout"]).optional()
});

export const candidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  strategy: z.string().min(1),
  hypothesis: z.string().min(1),
  changes: z.array(z.string()).min(1),
  expected_improvement: z.array(z.string()).default([]),
  risk: z.array(z.string()).default([])
});

export const metricResultSchema = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  rationale: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  raw_response: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const imageArtifactSchema = z.object({
  example_id: z.string().optional(),
  image_path: z.string().min(1),
  mime_type: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  file_size_bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const runResultRowSchema = z.object({
  example_id: z.string().min(1),
  input: jsonValue,
  reference: jsonValue.optional(),
  tags: z.array(z.string()).default([]),
  output: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  status: z.enum(["passed", "failed", "timeout"]),
  latency_ms: z.number().nonnegative(),
  error: z.string().optional(),
  image_artifact: imageArtifactSchema.optional(),
  metrics: z.record(z.string(), metricResultSchema)
});

export const aggregateMetricSchema = z.object({
  score: z.number().min(0).max(1),
  weight: z.number().positive(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});

export const aggregateScoreSchema = z.object({
  overall_score: z.number().min(0).max(1),
  example_count: z.number().int().nonnegative(),
  metrics: z.record(z.string(), aggregateMetricSchema),
  runtime: z.object({
    average_latency_ms: z.number().nonnegative(),
    error_rate: z.number().min(0).max(1),
    timeout_count: z.number().int().nonnegative()
  })
});

export const runManifestSchema = z.object({
  smarteval_version: z.string(),
  eval_schema_version: z.string(),
  eval_name: z.string(),
  run_id: z.string(),
  candidate_id: z.string(),
  created_at: z.string(),
  target: targetSchema,
  dataset_path: z.string(),
  dataset_hash: z.string(),
  git: z.object({
    commit: z.string(),
    dirty: z.boolean()
  }),
  judge: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      reproducibility: z.string().optional()
    })
    .optional(),
  judges: z
    .array(
      z.object({
        metric: z.string(),
        provider: z.string(),
        model: z.string().optional(),
        rubric: z.string().optional(),
        reproducibility: z.string()
      })
    )
    .default([]),
  estimated_cost_usd: z.number().nonnegative().default(0),
  image_artifacts: z.array(imageArtifactSchema.extend({ example_id: z.string() })).default([]),
  human_review: z
    .object({
      total_ratings: z.number().int().nonnegative(),
      wins: z.object({
        baseline: z.number().int().nonnegative(),
        candidate: z.number().int().nonnegative(),
        tie: z.number().int().nonnegative()
      }),
      average_quality_score: z.number().nonnegative(),
      average_content_score: z.number().nonnegative()
    })
    .optional(),
  pairwise_image_review: z
    .object({
      total_comparisons: z.number().int().nonnegative(),
      wins: z.object({
        baseline: z.number().int().nonnegative(),
        candidate: z.number().int().nonnegative(),
        tie: z.number().int().nonnegative()
      }),
      results: z.array(
        z.object({
          example_id: z.string(),
          winner: z.enum(["baseline", "candidate", "tie"]),
          rationale: z.string(),
          criteria: z.record(z.string(), z.unknown()).default({})
        })
      )
    })
    .optional(),
  failures_summary: z
    .object({
      total_failed_examples: z.number().int().nonnegative(),
      by_metric: z.record(
        z.string(),
        z.object({
          count: z.number().int().nonnegative(),
          examples: z.array(z.string()),
          tags: z.record(z.string(), z.number().int().nonnegative())
        })
      ),
      by_tag: z.record(
        z.string(),
        z.object({
          count: z.number().int().nonnegative(),
          examples: z.array(z.string()),
          metrics: z.record(z.string(), z.number().int().nonnegative())
        })
      )
    })
    .optional(),
  warnings: z.array(z.string()).default([])
});

export const reportInputSchema = z.object({
  manifest: runManifestSchema,
  baseline: aggregateScoreSchema.optional(),
  candidate: aggregateScoreSchema,
  comparison: z
    .object({
      overall_delta: z.number(),
      metrics: z.record(
        z.string(),
        z.object({
          baseline: z.number(),
          candidate: z.number(),
          delta: z.number()
        })
      ),
      regressions: z.array(z.string()),
      human_review: z
        .object({
          candidate_win_rate: z.number().min(0).max(1),
          baseline_win_rate: z.number().min(0).max(1),
          tie_rate: z.number().min(0).max(1),
          net_candidate_wins: z.number()
        })
        .optional()
    })
    .optional()
});

export type CommandTarget = z.infer<typeof commandTargetSchema>;
export type Target = z.infer<typeof targetSchema>;
export type EvalConfig = z.infer<typeof evalConfigSchema>;
export type DatasetRow = z.infer<typeof datasetRowSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type EvaluatorConfig = z.infer<typeof evaluatorConfigSchema>;
export type MetricResult = z.infer<typeof metricResultSchema>;
export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type RunResultRow = z.infer<typeof runResultRowSchema>;
export type AggregateScore = z.infer<typeof aggregateScoreSchema>;
export type RunManifest = z.infer<typeof runManifestSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;

export function parseJsonl<T>(content: string, schema: z.ZodType<T>): T[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL on line ${index + 1}: ${(error as Error).message}`);
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid JSONL row on line ${index + 1}: ${result.error.message}`);
      }
      return result.data;
    });
}

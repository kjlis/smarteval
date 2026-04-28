import type {
  AggregateScore,
  EvalConfig,
  EvaluatorConfig,
  MetricResult,
  RunResultRow
} from "./schemas.js";

function parseOutputJson(output: string): unknown {
  return JSON.parse(output);
}

function getText(row: RunResultRow): string {
  return row.stdout.trim() || row.output.trim();
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function referenceOutput(row: RunResultRow): unknown {
  if (
    row.reference &&
    typeof row.reference === "object" &&
    !Array.isArray(row.reference) &&
    "output" in row.reference
  ) {
    return (row.reference as Record<string, unknown>).output;
  }
  return row.reference;
}

function pass(score: number, rationale: string): MetricResult {
  return { score, passed: score >= 1, rationale };
}

function scoreMetric(config: EvaluatorConfig, row: RunResultRow): MetricResult {
  const text = getText(row);

  switch (config.type) {
    case "json_validity": {
      try {
        parseOutputJson(row.output);
        return pass(1, "Output is valid JSON.");
      } catch {
        return pass(0, "Output is not valid JSON.");
      }
    }
    case "json_required_fields": {
      try {
        const parsed = parseOutputJson(row.output);
        const missing = config.fields.filter(
          (field) =>
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed) ||
            !(field in parsed)
        );
        return pass(missing.length === 0 ? 1 : 0, missing.length === 0 ? "Required fields are present." : `Missing fields: ${missing.join(", ")}.`);
      } catch {
        return pass(0, "Output is not JSON, so fields cannot be checked.");
      }
    }
    case "contains":
      return pass(text.includes(config.value) ? 1 : 0, `Output ${text.includes(config.value) ? "contains" : "does not contain"} ${config.value}.`);
    case "not_contains":
      return pass(!text.includes(config.value) ? 1 : 0, `Output ${text.includes(config.value) ? "contains forbidden" : "does not contain forbidden"} value ${config.value}.`);
    case "regex": {
      const matched = new RegExp(config.pattern).test(text);
      return pass(matched ? 1 : 0, `Output ${matched ? "matches" : "does not match"} /${config.pattern}/.`);
    }
    case "max_words": {
      const words = countWords(text);
      return pass(words <= config.max ? 1 : 0, `Output has ${words} words; maximum is ${config.max}.`);
    }
    case "min_words": {
      const words = countWords(text);
      return pass(words >= config.min ? 1 : 0, `Output has ${words} words; minimum is ${config.min}.`);
    }
    case "max_chars":
      return pass(text.length <= config.max ? 1 : 0, `Output has ${text.length} characters; maximum is ${config.max}.`);
    case "exact_match": {
      const expected = referenceOutput(row);
      const actual = text;
      return pass(String(expected ?? "") === actual ? 1 : 0, "Output exact-match comparison completed.");
    }
    case "field_match": {
      try {
        const parsed = parseOutputJson(row.output);
        const expected =
          row.reference &&
          typeof row.reference === "object" &&
          !Array.isArray(row.reference)
            ? (row.reference as Record<string, unknown>)[config.field]
            : undefined;
        const actual =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)[config.field]
            : undefined;
        return pass(Object.is(actual, expected) ? 1 : 0, `Field ${config.field} comparison completed.`);
      } catch {
        return pass(0, "Output is not JSON, so field match cannot be checked.");
      }
    }
    case "latency":
      return pass(!config.max_ms || row.latency_ms <= config.max_ms ? 1 : 0, `Latency was ${row.latency_ms}ms.`);
    case "error_rate":
      return pass(row.status === "passed" ? 1 : 0, `Execution status was ${row.status}.`);
    case "timeout_count":
      return pass(row.status === "timeout" ? 0 : 1, `Execution status was ${row.status}.`);
    case "image_exists":
      return pass(row.image_artifact ? 1 : 0, row.image_artifact ? "Image artifact is present." : "Image artifact is missing.");
    case "image_mime_type": {
      const actual = row.image_artifact?.mime_type;
      const ok = actual ? config.allowed.includes(actual) : false;
      return pass(ok ? 1 : 0, `Image MIME type is ${actual ?? "missing"}.`);
    }
    case "image_dimensions": {
      const width = row.image_artifact?.width;
      const height = row.image_artifact?.height;
      const ok =
        width !== undefined &&
        height !== undefined &&
        (config.width === undefined || width === config.width) &&
        (config.height === undefined || height === config.height) &&
        (config.min_width === undefined || width >= config.min_width) &&
        (config.min_height === undefined || height >= config.min_height) &&
        (config.max_width === undefined || width <= config.max_width) &&
        (config.max_height === undefined || height <= config.max_height) &&
        (config.min_aspect_ratio === undefined || width / height >= config.min_aspect_ratio) &&
        (config.max_aspect_ratio === undefined || width / height <= config.max_aspect_ratio);
      return pass(ok ? 1 : 0, `Image dimensions are ${width ?? "?"}x${height ?? "?"}.`);
    }
    case "image_file_size": {
      const size = row.image_artifact?.file_size_bytes;
      const ok =
        size !== undefined &&
        (config.min_bytes === undefined || size >= config.min_bytes) &&
        (config.max_bytes === undefined || size <= config.max_bytes);
      return pass(ok ? 1 : 0, `Image file size is ${size ?? "missing"} bytes.`);
    }
    case "image_not_blank": {
      const stats = row.image_artifact?.metadata.image_stats;
      if (!stats || typeof stats !== "object" || !("appears_blank" in stats)) {
        return pass(0, "Image blankness stats are missing.");
      }
      const appearsBlank = Boolean((stats as { appears_blank: unknown }).appears_blank);
      return pass(appearsBlank ? 0 : 1, appearsBlank ? "Image appears blank." : "Image has non-blank pixel content.");
    }
    case "image_unique":
      return pass(row.image_artifact?.sha256 ? 1 : 0, row.image_artifact?.sha256 ? "Image hash is present for uniqueness analysis." : "Image hash is missing.");
    case "llm_judge":
      return pass(0, "LLM judge providers are schema-supported but not executed by the deterministic runner yet.");
    case "command_judge":
      return pass(0, "Command judge providers are schema-supported but not executed by the deterministic runner yet.");
  }
}

export function evaluateExample(config: EvalConfig, row: RunResultRow): RunResultRow {
  const metrics: Record<string, MetricResult> = {};
  for (const [name, metricConfig] of Object.entries(config.scoring_vectors)) {
    metrics[name] = scoreMetric(metricConfig, row);
  }
  return { ...row, metrics };
}

export function scoreAggregate(config: EvalConfig, rows: RunResultRow[]): AggregateScore {
  const metricEntries = Object.entries(config.scoring_vectors);
  const metrics: AggregateScore["metrics"] = {};
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [name, metricConfig] of metricEntries) {
    const results = rows.map((row) => row.metrics[name]).filter(Boolean);
    const score =
      results.length === 0
        ? 0
        : results.reduce((sum, result) => sum + result.score, 0) / results.length;
    metrics[name] = {
      score,
      weight: metricConfig.weight,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length
    };
    weightedTotal += score * metricConfig.weight;
    totalWeight += metricConfig.weight;
  }

  const averageLatency =
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.latency_ms, 0) / rows.length;
  const errorCount = rows.filter((row) => row.status === "failed").length;
  const timeoutCount = rows.filter((row) => row.status === "timeout").length;

  return {
    overall_score: totalWeight === 0 ? 0 : weightedTotal / totalWeight,
    example_count: rows.length,
    metrics,
    runtime: {
      average_latency_ms: averageLatency,
      error_rate: rows.length === 0 ? 0 : errorCount / rows.length,
      timeout_count: timeoutCount
    }
  };
}

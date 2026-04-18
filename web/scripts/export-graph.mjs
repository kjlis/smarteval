#!/usr/bin/env node
/*
 * Generates web/public/data/graph.json from a .smarteval/ directory.
 * See web/PLAN.md for the schema contract (v1).
 *
 * Default source: ../examples/asr_manifest/.smarteval (resolved relative to web/)
 * Override with: SMARTEVAL_DATA_DIR=/abs/path/.smarteval
 * Output default: web/public/data/graph.json
 * Override with:  SMARTEVAL_GRAPH_OUT=/abs/path/graph.json
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '..');

const DATA_DIR = process.env.SMARTEVAL_DATA_DIR
  ? resolve(process.env.SMARTEVAL_DATA_DIR)
  : resolve(repoRoot, 'examples/asr_manifest/.smarteval');

const OUT_PATH = process.env.SMARTEVAL_GRAPH_OUT
  ? resolve(process.env.SMARTEVAL_GRAPH_OUT)
  : resolve(webRoot, 'public/data/graph.json');

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .map((name) => ({ name, full: join(path, name) }))
    .filter((entry) => statSync(entry.full).isDirectory());
}

function humanBakeoffLabel(id, round) {
  if (round != null) return `Round ${round} · ${id}`;
  return id;
}

function deriveBaselineId(summaries, variants) {
  for (const s of summaries) {
    if (s?.baseline) return s.baseline;
  }
  const baselineVariant = variants.find((v) => v.parent_id == null);
  return baselineVariant ? baselineVariant.id : null;
}

function main() {
  if (!existsSync(DATA_DIR)) {
    throw new Error(`SMARTEVAL_DATA_DIR does not exist: ${DATA_DIR}`);
  }

  const ledgerDir = join(DATA_DIR, 'ledger');
  const variantsRaw = readJsonl(join(ledgerDir, 'variants.jsonl'));
  const proposalsRaw = readJsonl(join(ledgerDir, 'proposals.jsonl'));

  const runsDir = join(DATA_DIR, 'runs');
  const runDirs = listDirs(runsDir).sort((a, b) => a.name.localeCompare(b.name));
  const summaries = runDirs
    .map((r) => ({ dir: r.full, name: r.name, summary: readJson(join(r.full, 'summary.json')) }))
    .filter((r) => r.summary != null);

  const optimizationRunsDir = join(DATA_DIR, 'optimization-runs');
  const optimizationRuns = [];
  if (existsSync(optimizationRunsDir)) {
    for (const file of readdirSync(optimizationRunsDir)) {
      if (!file.endsWith('.json')) continue;
      const body = readJson(join(optimizationRunsDir, file));
      if (!body) continue;
      optimizationRuns.push({
        id: file.replace(/\.json$/, ''),
        initialRunDir: body.initial_run_dir ?? null,
        finalRunDir: body.rounds?.at(-1)?.queued_run_dir ?? body.initial_run_dir ?? null,
        initialBestVariantId: body.initial_best_variant_id ?? null,
        initialBestMeanScore: body.initial_best_mean_score ?? null,
        roundsCompleted: body.rounds_completed ?? (body.rounds?.length ?? 0),
        rounds: (body.rounds ?? []).map((r) => ({
          round: r.round,
          sourceRunDir: r.source_run_dir,
          queuedRunDir: r.queued_run_dir ?? null,
          status: r.status ?? 'unknown',
          proposalCount: r.proposal_count ?? 0,
          rejectedProposalCount: r.rejected_proposal_count ?? 0,
          proposalParentIds: r.proposal_parent_ids ?? [],
          queuedVariantIds: r.queued_variant_ids ?? [],
          bestVariantId: r.best_variant_id ?? null,
          bestMeanScore: r.best_mean_score ?? null,
        })),
      });
    }
  }

  // Map bakeoff runDir -> optimization round meta (round number, optimizationRunId).
  const bakeoffRoundByRunDir = new Map();
  for (const opt of optimizationRuns) {
    for (const round of opt.rounds) {
      if (round.queuedRunDir) {
        bakeoffRoundByRunDir.set(round.queuedRunDir, {
          round: round.round,
          optimizationRunId: opt.id,
        });
      }
    }
    if (opt.initialRunDir) {
      bakeoffRoundByRunDir.set(opt.initialRunDir, {
        round: 0,
        optimizationRunId: opt.id,
      });
    }
  }

  // Build bakeoffs list + per-variant stats.
  const bakeoffs = [];
  const perBakeoffByVariant = new Map(); // variantId -> { [bakeoffId]: stats }

  for (const { dir, name, summary } of summaries) {
    const bakeoffId = name;
    const roundMeta = bakeoffRoundByRunDir.get(dir) ?? { round: null, optimizationRunId: null };
    bakeoffs.push({
      id: bakeoffId,
      label: humanBakeoffLabel(bakeoffId, roundMeta.round),
      generatedAt: summary.generated_at ?? null,
      round: roundMeta.round,
      optimizationRunId: roundMeta.optimizationRunId,
      evaluatorFingerprint: summary.evaluator_fingerprint ?? '',
      goldenHash: summary.golden_hash ?? '',
    });

    // Determine winner for this bakeoff.
    const vs = summary.variants ?? [];
    let winnerId = null;
    let winnerScore = -Infinity;
    let winnerCreatedAt = null;
    const createdAtLookup = new Map(variantsRaw.map((v) => [v.id, v.created_at ?? '']));
    for (const v of vs) {
      const score = v.mean_score;
      if (score == null || Number.isNaN(score)) continue;
      const createdAt = createdAtLookup.get(v.variant_id) ?? '';
      if (
        score > winnerScore ||
        (score === winnerScore && (winnerCreatedAt == null || createdAt < winnerCreatedAt))
      ) {
        winnerScore = score;
        winnerId = v.variant_id;
        winnerCreatedAt = createdAt;
      }
    }

    const inTrace = new Set();
    for (const trace of summary.improvement_traces ?? []) {
      if (trace.variant_id) inTrace.add(trace.variant_id);
      for (const step of trace.steps ?? []) {
        if (step.variant_id) inTrace.add(step.variant_id);
        if (step.parent_variant_id) inTrace.add(step.parent_variant_id);
      }
    }

    for (const v of vs) {
      const id = v.variant_id;
      if (!perBakeoffByVariant.has(id)) perBakeoffByVariant.set(id, {});
      perBakeoffByVariant.get(id)[bakeoffId] = {
        runCount: v.run_count ?? 0,
        passRate: v.pass_rate ?? 0,
        meanScore: v.mean_score ?? 0,
        meanScoreCiLow: v.mean_score_ci_low ?? v.mean_score ?? 0,
        meanScoreCiHigh: v.mean_score_ci_high ?? v.mean_score ?? 0,
        deltaVsBaseline: v.delta_vs_baseline ?? null,
        deltaCiLow: v.delta_ci_low ?? null,
        deltaCiHigh: v.delta_ci_high ?? null,
        failedRunCount: v.failed_run_count ?? 0,
        sampleErrors: v.sample_errors ?? [],
        meanDurationMs: v.mean_duration_ms ?? 0,
        meanCostUsd: v.mean_cost_usd ?? 0,
        inImprovementTrace: inTrace.has(id),
        isWinner: id === winnerId,
      };
    }
  }

  const variants = variantsRaw.map((v) => ({
    id: v.id,
    parentId: v.parent_id ?? null,
    author: v.author ?? 'framework',
    hypothesis: v.hypothesis ?? null,
    rationale: v.rationale ?? null,
    diff: v.diff ?? {},
    createdAt: v.created_at ?? '',
    perBakeoff: perBakeoffByVariant.get(v.id) ?? {},
  }));

  const proposals = proposalsRaw.map((p) => ({
    proposalId: p.proposal_id,
    parentVariantId: p.parent_variant_id,
    status: p.status,
    materializedVariantId: p.materialized_variant_id ?? null,
    rationale: p.rationale ?? '',
    expectedSlice: p.expected_slice ?? null,
    diff: p.diff ?? {},
    duplicateOfVariantId: p.duplicate_of_variant_id ?? null,
    similarity: p.similarity ?? null,
    sourceRunDir: p.source_run_dir ?? '',
    createdAt: p.created_at ?? '',
  }));

  // Helper: compute accepted-edge aggregates in a parent→child pair.
  function acceptedEdgeAggregates(parentId, childId, proposalDiff) {
    const deltaByBakeoff = {};
    const childStats = perBakeoffByVariant.get(childId) ?? {};
    const parentStats = perBakeoffByVariant.get(parentId) ?? {};
    for (const [bId, cs] of Object.entries(childStats)) {
      const ps = parentStats[bId];
      if (ps && cs.meanScore != null && ps.meanScore != null) {
        deltaByBakeoff[bId] = Number((cs.meanScore - ps.meanScore).toFixed(6));
      }
    }
    // Flat scalar deltaVsParent: pick the most recent bakeoff that scored both.
    let deltaVsParent = null;
    const sortedBakeoffs = [...bakeoffs].sort((a, b) => {
      const ta = a.generatedAt ?? a.id;
      const tb = b.generatedAt ?? b.id;
      return ta < tb ? 1 : ta > tb ? -1 : 0; // newest first
    });
    for (const b of sortedBakeoffs) {
      if (deltaByBakeoff[b.id] != null) {
        deltaVsParent = deltaByBakeoff[b.id];
        break;
      }
    }
    // changedFields: prefer diff from the proposal (canonical), else walk the
    // child variant's ledger diff keys.
    const diffSource = proposalDiff ?? variantById.get(childId)?.diff ?? {};
    const changedFields = Object.keys(diffSource).filter((k) => k !== 'description');
    return { deltaByBakeoff, deltaVsParent, changedFields };
  }

  // variantById needed by acceptedEdgeAggregates; build it up-front.
  const variantById = new Map(variants.map((v) => [v.id, v]));

  // Build edges.
  const edges = [];
  for (const p of proposals) {
    if (p.status === 'accepted' && p.materializedVariantId) {
      const { deltaByBakeoff, deltaVsParent, changedFields } = acceptedEdgeAggregates(
        p.parentVariantId,
        p.materializedVariantId,
        p.diff,
      );
      edges.push({
        kind: 'accepted',
        from: p.parentVariantId,
        to: p.materializedVariantId,
        proposalId: p.proposalId,
        rationale: p.rationale,
        deltaVsParent,
        deltaVsParentByBakeoff: deltaByBakeoff,
        changedFields,
      });
    } else if (p.status.startsWith('rejected')) {
      edges.push({
        kind: 'rejected',
        from: p.parentVariantId,
        to: `proposal:${p.proposalId}`,
        proposalId: p.proposalId,
        reason: p.status,
      });
    }
  }
  // Also cover variants that have parent_id but no proposal trail (e.g. hand-authored).
  const coveredChildIds = new Set(
    edges.filter((e) => e.kind === 'accepted').map((e) => e.to),
  );
  for (const v of variants) {
    if (v.parentId && !coveredChildIds.has(v.id)) {
      const { deltaByBakeoff, deltaVsParent, changedFields } = acceptedEdgeAggregates(
        v.parentId,
        v.id,
        null,
      );
      edges.push({
        kind: 'accepted',
        from: v.parentId,
        to: v.id,
        proposalId: null,
        rationale: v.rationale,
        deltaVsParent,
        deltaVsParentByBakeoff: deltaByBakeoff,
        changedFields,
      });
    }
  }

  // Improvement traces keyed by bakeoffId.
  const improvementTraces = {};
  for (const { name, summary } of summaries) {
    const steps = [];
    for (const trace of summary.improvement_traces ?? []) {
      for (const step of trace.steps ?? []) {
        steps.push({
          parentVariantId: step.parent_variant_id,
          variantId: step.variant_id,
          rationale: step.rationale ?? '',
          hypothesis: step.hypothesis ?? null,
          judgeJustification: step.judge_justification ?? null,
          deltaVsParent: step.delta_vs_parent ?? null,
          deltaVsBaseline: step.delta_vs_baseline ?? null,
          changes: (step.changes ?? []).map((c) => ({
            fieldPath: c.field_path,
            before: c.before,
            after: c.after,
            summary: c.summary ?? '',
          })),
        });
      }
    }
    improvementTraces[name] = steps;
  }

  const baselineVariantId = deriveBaselineId(
    summaries.map((s) => s.summary),
    variantsRaw,
  );

  // ------------------------------------------------------------
  // Unified (cross-round) aggregates
  // ------------------------------------------------------------
  // Bakeoff ordering: by generatedAt ascending (stable), so "latest" = last wins.
  const bakeoffOrder = [...bakeoffs].sort((a, b) => {
    const ta = a.generatedAt ?? a.id;
    const tb = b.generatedAt ?? b.id;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Latest score per variant: pick the most recent bakeoff that scored the variant.
  const latestScoreByVariant = {}; // variantId -> { bakeoffId, ...VariantBakeoffStats }
  for (const v of variants) {
    let picked = null;
    for (const b of bakeoffOrder) {
      const s = v.perBakeoff[b.id];
      if (s && s.meanScore != null) {
        picked = { bakeoffId: b.id, ...s };
      }
    }
    if (picked) latestScoreByVariant[v.id] = picked;
  }

  // Overall winner: max meanScore across all (variant, bakeoff) pairs.
  // Tie-break: earliest createdAt from ledger (stable).
  let overallWinnerVariantId = null;
  let overallWinnerBakeoffId = null;
  let overallWinnerScore = -Infinity;
  let overallWinnerCreatedAt = null;
  const createdAtById = new Map(variants.map((v) => [v.id, v.createdAt ?? '']));
  for (const v of variants) {
    for (const [bId, s] of Object.entries(v.perBakeoff)) {
      if (s.meanScore == null) continue;
      const created = createdAtById.get(v.id) ?? '';
      if (
        s.meanScore > overallWinnerScore ||
        (s.meanScore === overallWinnerScore &&
          (overallWinnerCreatedAt == null || created < overallWinnerCreatedAt))
      ) {
        overallWinnerScore = s.meanScore;
        overallWinnerVariantId = v.id;
        overallWinnerBakeoffId = bId;
        overallWinnerCreatedAt = created;
      }
    }
  }

  // Overall best path: baseline → ... → overall winner, walking parent_id.
  const bestPathVariantIds = [];
  const bestPathEdgeKeys = []; // "from->to"
  if (overallWinnerVariantId) {
    const chain = [];
    let cur = overallWinnerVariantId;
    const guard = new Set();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      chain.push(cur);
      const v = variantById.get(cur);
      cur = v?.parentId ?? null;
    }
    chain.reverse(); // baseline-ish → winner
    for (const id of chain) bestPathVariantIds.push(id);
    for (let i = 1; i < chain.length; i++) {
      bestPathEdgeKeys.push(`${chain[i - 1]}->${chain[i]}`);
    }
  }

  const overallBestPath = {
    variantIds: bestPathVariantIds,
    edgeKeys: bestPathEdgeKeys,
    winnerVariantId: overallWinnerVariantId,
    winnerBakeoffId: overallWinnerBakeoffId,
    winnerMeanScore: Number.isFinite(overallWinnerScore) ? overallWinnerScore : null,
    baselineVariantId,
  };

  const out = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projectName: basename(dirname(DATA_DIR)),
    baselineVariantId,
    bakeoffs,
    variants,
    proposals,
    edges,
    improvementTraces,
    optimizationRuns,
    // Cross-round unified view (for the default "whole graph" rendering):
    latestScoreByVariant,
    overallWinnerVariantId,
    overallBestPath,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(
    `graph.json: ${bakeoffs.length} bakeoffs, ${variants.length} variants, ${proposals.length} proposals, ${edges.length} edges → ${OUT_PATH}`,
  );
}

main();

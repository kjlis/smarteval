import type {
  AcceptedEdge,
  AnyEdge,
  AnyNode,
  BakeoffMeta,
  GraphData,
  GraphExport,
  GraphFilters,
  ProposalNode,
  ProposalRecord,
  RejectedEdge,
  VariantBakeoffStats,
  VariantNode,
  VariantOutcome,
  VariantRecord,
} from "./types";
import { classifyVariant } from "./status/classify";

export function shortLabel(id: string): string {
  const parts = id.split("-proposal-");
  return parts[parts.length - 1] || id;
}

export function pickBakeoff(
  graph: GraphExport,
  selectedBakeoffId: string | null,
): BakeoffMeta | null {
  if (graph.bakeoffs.length === 0) return null;
  if (selectedBakeoffId) {
    const found = graph.bakeoffs.find((b) => b.id === selectedBakeoffId);
    if (found) return found;
  }
  return latestBakeoff(graph);
}

function latestBakeoff(graph: GraphExport): BakeoffMeta | null {
  if (graph.bakeoffs.length === 0) return null;
  return graph.bakeoffs
    .slice()
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

/**
 * Pick the most recent bakeoff that scored this variant. Returns the stats
 * plus the bakeoff id so the caller can surface which bakeoff the numbers
 * came from. Falls back to null when no bakeoff ever scored the variant.
 */
function latestStatsFor(
  variant: VariantRecord,
  graph: GraphExport,
): { stats: VariantBakeoffStats; bakeoffId: string } | null {
  const scored: Array<{ bakeoffId: string; stats: VariantBakeoffStats; generatedAt: string }> = [];
  for (const [bakeoffId, stats] of Object.entries(variant.perBakeoff)) {
    if (stats.meanScore === null) continue;
    const meta = graph.bakeoffs.find((b) => b.id === bakeoffId);
    if (!meta) continue;
    scored.push({ bakeoffId, stats, generatedAt: meta.generatedAt });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return { stats: scored[0].stats, bakeoffId: scored[0].bakeoffId };
}

function computeOutcome(
  stats: VariantBakeoffStats | null,
  isBaseline: boolean,
  isOverallWinner: boolean,
): VariantOutcome {
  if (stats === null) {
    return isBaseline ? "baseline" : "unscored";
  }
  return classifyVariant({
    isBaseline,
    isWinner: isOverallWinner,
    meanScore: stats.meanScore,
    deltaVsBaseline: stats.deltaVsBaseline,
    failedRunCount: stats.failedRunCount,
    runCount: stats.runCount,
  });
}

function roundBadgeForVariant(
  graph: GraphExport,
  variantId: string,
): number | null {
  for (const run of graph.optimizationRuns) {
    for (const round of run.rounds) {
      if (round.bestVariantId === variantId) return round.round;
    }
  }
  return null;
}

/**
 * Find the variant with the highest mean score across ALL bakeoffs.
 * Ties broken deterministically by variant id ascending.
 */
function findOverallWinner(graph: GraphExport): string | null {
  let bestScore = -Infinity;
  let bestId: string | null = null;
  for (const v of graph.variants) {
    const latest = latestStatsFor(v, graph);
    if (!latest) continue;
    const score = latest.stats.meanScore ?? -Infinity;
    if (score > bestScore || (score === bestScore && bestId && v.id < bestId)) {
      bestScore = score;
      bestId = v.id;
    }
  }
  return bestId;
}

/**
 * Walk parent links from the overall winner up to baseline. Prefer edges
 * declared in improvementTraces (any bakeoff) when they exist; fall back to
 * variant.parentId.
 */
function computeOverallBestPath(
  graph: GraphExport,
  winnerId: string | null,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!winnerId) return { nodes, edges };

  const variantsById = new Map(graph.variants.map((v) => [v.id, v]));

  // Collect all (parent, child) steps that appeared in any improvement trace.
  const traceSteps = new Set<string>();
  for (const traces of Object.values(graph.improvementTraces ?? {})) {
    for (const step of traces) {
      traceSteps.add(`${step.parentVariantId}->${step.variantId}`);
    }
  }

  let cursor: string | null = winnerId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) break; // cycle guard
    seen.add(cursor);
    nodes.add(cursor);
    const variant = variantsById.get(cursor);
    if (!variant || !variant.parentId) break;
    const parent = variant.parentId;
    nodes.add(parent);
    const stepKey = `${parent}->${cursor}`;
    // Either a real improvement-trace step OR a parent-link fallback.
    if (traceSteps.has(stepKey) || true) {
      edges.add(`e-accepted:${parent}->${cursor}`);
    }
    cursor = parent;
  }
  return { nodes, edges };
}

export function buildRunRootNode(
  graph: GraphExport,
  bakeoff: BakeoffMeta,
): AnyNode {
  const baselineStats =
    graph.variants.find((v) => v.id === graph.baselineVariantId)?.perBakeoff[
      bakeoff.id
    ] ?? null;
  const variantCount = graph.variants.filter(
    (v) => v.perBakeoff[bakeoff.id],
  ).length;
  let winnerVariantId: string | null = null;
  for (const v of graph.variants) {
    const s = v.perBakeoff[bakeoff.id];
    if (s?.isWinner) {
      winnerVariantId = v.id;
      break;
    }
  }
  return {
    kind: "run_root",
    id: `run-root:${bakeoff.id}`,
    bakeoffId: bakeoff.id,
    label: bakeoff.label,
    generatedAt: bakeoff.generatedAt,
    evaluatorFingerprint: bakeoff.evaluatorFingerprint,
    goldenHash: bakeoff.goldenHash,
    round: bakeoff.round,
    optimizationRunId: bakeoff.optimizationRunId,
    variantCount,
    winnerVariantId,
    baselineMeanScore: baselineStats?.meanScore ?? null,
  };
}

function buildVariantNode(
  variant: VariantRecord,
  graph: GraphExport,
  overallWinnerId: string | null,
  bestPathNodes: Set<string>,
): VariantNode {
  const latest = latestStatsFor(variant, graph);
  const stats = latest?.stats ?? null;
  const isBaseline = variant.id === graph.baselineVariantId;
  const isOverallWinner = variant.id === overallWinnerId;
  const outcome = computeOutcome(stats, isBaseline, isOverallWinner);
  return {
    kind: "variant",
    id: variant.id,
    parentId: variant.parentId,
    label: shortLabel(variant.id),
    fullId: variant.id,
    rationale: variant.rationale,
    hypothesis: variant.hypothesis,
    author: variant.author,
    diff: variant.diff,
    createdAt: variant.createdAt,
    stats,
    outcome,
    isBaseline,
    isWinner: isOverallWinner,
    isOnBestPath: bestPathNodes.has(variant.id),
    roundBadge: roundBadgeForVariant(graph, variant.id),
    isGhost: stats === null && !isBaseline,
    isAcceptedUnmaterialized: false,
  };
}

function buildProposalNode(proposal: ProposalRecord): ProposalNode | null {
  if (proposal.status === "accepted") return null;
  return {
    kind: "proposal_rejected",
    id: `proposal:${proposal.proposalId}`,
    proposalId: proposal.proposalId,
    parentVariantId: proposal.parentVariantId,
    label: shortLabel(proposal.proposalId),
    status: proposal.status,
    rationale: proposal.rationale,
    diff: proposal.diff,
    duplicateOfVariantId: proposal.duplicateOfVariantId,
    similarity: proposal.similarity,
    createdAt: proposal.createdAt,
  };
}

function changedFieldsFromDiff(diff: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const visit = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const nextPrefix = prefix ? `${prefix}.${k}` : k;
        visit(v, nextPrefix);
      }
    } else if (prefix) {
      fields.push(prefix);
    }
  };
  for (const [k, v] of Object.entries(diff)) {
    if (k === "description") continue;
    visit(v, k);
  }
  return fields;
}

/**
 * For the unified view, pick the most recent bakeoff that observed this
 * parent→child delta (across all bakeoffs the edge appeared in). Returns
 * null if no bakeoff scored both sides of the edge.
 */
function latestDeltaVsParent(
  graph: GraphExport,
  deltaMap: Record<string, number> | undefined,
): number | null {
  if (!deltaMap) return null;
  const entries = Object.entries(deltaMap);
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const am = graph.bakeoffs.find((bk) => bk.id === a[0])?.generatedAt ?? "";
    const bm = graph.bakeoffs.find((bk) => bk.id === b[0])?.generatedAt ?? "";
    return bm.localeCompare(am);
  });
  return entries[0][1];
}

function buildEdges(
  graph: GraphExport,
  bestPathEdges: Set<string>,
  variantsById: Map<string, VariantRecord>,
): AnyEdge[] {
  const edges: AnyEdge[] = [];
  for (const e of graph.edges) {
    if (e.kind === "accepted") {
      const id = `e-accepted:${e.from}->${e.to}`;
      const childVariant = variantsById.get(e.to);
      const changedFields = childVariant ? changedFieldsFromDiff(childVariant.diff) : [];
      const deltaVsParent = latestDeltaVsParent(graph, e.deltaVsParentByBakeoff);
      edges.push({
        kind: "accepted",
        id,
        source: e.from,
        target: e.to,
        proposalId: e.proposalId,
        rationale: e.rationale,
        changedFields,
        deltaVsParent,
        isOnBestPath: bestPathEdges.has(id),
      });
    } else {
      const id = `e-rejected:${e.from}->${e.to}`;
      const reason = e.reason as ProposalNode["status"] | undefined;
      const rejected: RejectedEdge = {
        kind: "rejected",
        id,
        source: e.from,
        target: e.to,
        status:
          reason === "rejected_exact_duplicate" ||
          reason === "rejected_semantic_duplicate"
            ? reason
            : "rejected_semantic_duplicate",
      };
      edges.push(rejected);
    }
  }
  return edges;
}

/**
 * Variants that were touched by a given optimization round — i.e. were queued
 * or sourced from that round. Used for the "focus a round" secondary filter.
 */
function variantsTouchedByRound(
  graph: GraphExport,
  round: number,
): Set<string> {
  const out = new Set<string>();
  for (const run of graph.optimizationRuns) {
    for (const r of run.rounds) {
      if (r.round !== round) continue;
      for (const id of r.queuedVariantIds) out.add(id);
      for (const id of r.proposalParentIds) out.add(id);
      if (r.bestVariantId) out.add(r.bestVariantId);
    }
  }
  return out;
}

export interface BuildGraphOptions {
  graph: GraphExport;
  filters: GraphFilters;
}

export function buildGraphData({ graph, filters }: BuildGraphOptions): GraphData {
  const overallWinnerId =
    graph.overallWinnerVariantId ?? findOverallWinner(graph);
  const bestPath = graph.overallBestPath
    ? {
        nodes: new Set(graph.overallBestPath.variantIds),
        edges: new Set(
          graph.overallBestPath.edgeKeys.map((k) => `e-accepted:${k}`),
        ),
      }
    : computeOverallBestPath(graph, overallWinnerId);

  const variantNodes: VariantNode[] = graph.variants.map((v) =>
    buildVariantNode(v, graph, overallWinnerId, bestPath.nodes),
  );

  const roundTouched =
    filters.focusedRound !== null
      ? variantsTouchedByRound(graph, filters.focusedRound)
      : null;

  const filteredVariants = variantNodes.filter((v) => {
    if (filters.authorFilter !== "all" && v.author !== filters.authorFilter) {
      return false;
    }
    if (filters.showFailedOnly && v.outcome !== "failed") return false;
    if (filters.showBestPathOnly && !v.isOnBestPath && !v.isBaseline) {
      return false;
    }
    if (!filters.showFutureVariants && v.isGhost) {
      // "Show unscored" toggle controls ghost ancestors (never-scored variants).
      return false;
    }
    if (roundTouched && !roundTouched.has(v.id) && !v.isOnBestPath && !v.isBaseline) {
      return false;
    }
    return true;
  });

  const variantIds = new Set(filteredVariants.map((v) => v.id));

  const proposalNodes: ProposalNode[] = filters.showRejected
    ? graph.proposals
        .map(buildProposalNode)
        .filter((n): n is ProposalNode => n !== null)
        .filter((p) => variantIds.has(p.parentVariantId))
    : [];

  const nodes: AnyNode[] = [...filteredVariants, ...proposalNodes];

  const proposalIds = new Set(proposalNodes.map((p) => p.id));
  const variantsById = new Map(graph.variants.map((v) => [v.id, v]));
  const edges = buildEdges(graph, bestPath.edges, variantsById).filter((e) => {
    if (e.kind === "accepted") {
      return variantIds.has(e.source) && variantIds.has(e.target);
    }
    return variantIds.has(e.source) && proposalIds.has(e.target);
  });

  return {
    nodes,
    edges,
    bestPathNodeIds: bestPath.nodes,
    bestPathEdgeIds: bestPath.edges,
  };
}

// Graph export schema v1 — contract with the Python `smarteval graph export` CLI.

export interface GraphExport {
  schemaVersion: 1;
  exportedAt: string;
  projectName?: string;
  baselineVariantId: string;
  bakeoffs: BakeoffMeta[];
  variants: VariantRecord[];
  proposals: ProposalRecord[];
  edges: GraphEdgeRaw[];
  improvementTraces: Record<string, ImprovementTrace[]>;
  optimizationRuns: OptimizationRun[];
  overallWinnerVariantId?: string | null;
  overallBestPath?: OverallBestPath | null;
}

export interface OverallBestPath {
  variantIds: string[];
  edgeKeys: string[];
  winnerVariantId: string;
  winnerBakeoffId: string;
  winnerMeanScore: number;
  baselineVariantId: string;
}

export interface BakeoffMeta {
  id: string;
  label: string;
  generatedAt: string;
  round: number | null;
  optimizationRunId: string | null;
  evaluatorFingerprint: string;
  goldenHash: string;
}

export interface VariantRecord {
  id: string;
  parentId: string | null;
  author: "framework" | "proposer" | "human" | string;
  hypothesis: string | null;
  rationale: string | null;
  diff: Record<string, unknown>;
  createdAt: string;
  perBakeoff: Record<string, VariantBakeoffStats>;
}

export interface VariantBakeoffStats {
  runCount: number;
  passRate: number;
  meanScore: number | null;
  meanScoreCiLow: number | null;
  meanScoreCiHigh: number | null;
  deltaVsBaseline: number | null;
  deltaCiLow: number | null;
  deltaCiHigh: number | null;
  failedRunCount: number;
  sampleErrors: string[];
  meanDurationMs: number;
  meanCostUsd: number;
  inImprovementTrace: boolean;
  isWinner: boolean;
}

export type ProposalStatus =
  | "accepted"
  | "rejected_exact_duplicate"
  | "rejected_semantic_duplicate";

export interface ProposalRecord {
  proposalId: string;
  parentVariantId: string;
  status: ProposalStatus;
  materializedVariantId: string | null;
  rationale: string;
  expectedSlice: string | null;
  diff: Record<string, unknown>;
  duplicateOfVariantId: string | null;
  similarity: number | null;
  sourceRunDir: string;
  createdAt: string;
}

export interface GraphEdgeRaw {
  kind: "accepted" | "rejected";
  from: string;
  to: string;
  proposalId: string | null;
  rationale: string | null;
  reason?: string;
  deltaVsParentByBakeoff?: Record<string, number>;
}

export interface ImprovementTrace {
  parentVariantId: string;
  variantId: string;
  rationale: string;
  hypothesis: string | null;
  judgeJustification: string | null;
  deltaVsParent: number | null;
  deltaVsBaseline: number | null;
  changes: FieldChange[];
}

export interface FieldChange {
  fieldPath: string;
  before: unknown;
  after: unknown;
  summary: string;
}

export interface OptimizationRun {
  id: string;
  initialRunDir: string;
  finalRunDir: string;
  initialBestVariantId: string;
  initialBestMeanScore: number;
  roundsCompleted: number;
  rounds: OptimizationRound[];
}

export interface OptimizationRound {
  round: number;
  sourceRunDir: string;
  queuedRunDir: string | null;
  status: string;
  proposalCount: number;
  rejectedProposalCount: number;
  proposalParentIds: string[];
  queuedVariantIds: string[];
  bestVariantId: string | null;
  bestMeanScore: number | null;
}

// Derived client-side model ----------------------------------------------------

export interface GraphData {
  nodes: AnyNode[];
  edges: AnyEdge[];
  bestPathNodeIds: Set<string>;
  bestPathEdgeIds: Set<string>;
}

export type AnyNode = VariantNode | ProposalNode | RunRootNode;

export interface VariantNode {
  kind: "variant";
  id: string;
  parentId: string | null;
  label: string;
  fullId: string;
  rationale: string | null;
  hypothesis: string | null;
  author: string;
  diff: Record<string, unknown>;
  createdAt: string;
  stats: VariantBakeoffStats | null;
  outcome: VariantOutcome;
  isBaseline: boolean;
  isWinner: boolean;
  isOnBestPath: boolean;
  roundBadge: number | null;
  isGhost: boolean;
  isAcceptedUnmaterialized: boolean;
}

// Kebab-case to match ui-expert's NodeStatus in src/lib/status/classify.ts.
export type VariantOutcome =
  | "baseline"
  | "winner"
  | "improved"
  | "improved-mild"
  | "regressed"
  | "regressed-mild"
  | "failed"
  | "unscored"
  | "unknown";

export interface ProposalNode {
  kind: "proposal_rejected";
  id: string;
  proposalId: string;
  parentVariantId: string;
  label: string;
  status: Exclude<ProposalStatus, "accepted">;
  rationale: string;
  diff: Record<string, unknown>;
  duplicateOfVariantId: string | null;
  similarity: number | null;
  createdAt: string;
}

export interface RunRootNode {
  kind: "run_root";
  id: string;
  bakeoffId: string;
  label: string;
  generatedAt: string;
  evaluatorFingerprint: string;
  goldenHash: string;
  round: number | null;
  optimizationRunId: string | null;
  variantCount: number;
  winnerVariantId: string | null;
  baselineMeanScore: number | null;
}

export type AnyEdge = AcceptedEdge | RejectedEdge;

export interface AcceptedEdge {
  kind: "accepted";
  id: string;
  source: string;
  target: string;
  proposalId: string | null;
  rationale: string | null;
  changedFields: string[];
  deltaVsParent: number | null;
  isOnBestPath: boolean;
}

export interface RejectedEdge {
  kind: "rejected";
  id: string;
  source: string;
  target: string;
  status: ProposalNode["status"];
}

export interface GraphFilters {
  selectedBakeoffId: string | null;
  showRejected: boolean;
  showBestPathOnly: boolean;
  authorFilter: "all" | "framework" | "proposer" | "human";
  sliceFilter: string | null;
  focusedRound: number | null;
  showFailedOnly: boolean;
  showFutureVariants: boolean;
}

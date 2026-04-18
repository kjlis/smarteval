import dagre from "@dagrejs/dagre";
import type { AnyEdge, AnyNode, GraphData } from "./types";

const VARIANT_WIDTH = 220;
const VARIANT_BASE_HEIGHT = 84;
const VARIANT_LINE_HEIGHT = 16;
const VARIANT_CHARS_PER_LINE = 24;
const PROPOSAL_SIZE = 44;
const RUN_ROOT_WIDTH = 260;
const RUN_ROOT_HEIGHT = 72;
// Rejected proposals float to the right of their parent variant. The offset
// sets clearance between parent card and the first diamond; the inter-item
// gap controls how tight siblings pack. Tuned for the unified cross-round
// layout where a single parent can accumulate many proposals.
const REJECTED_OFFSET = 56;
const REJECTED_INTER_GAP = 10;
// Rank + node separation. Wider than default for the unified cross-round
// graph so (a) gold best-path halo has breathing room above/below,
// (b) dense lineage chains don't feel cramped, and (c) rejected-proposal
// diamonds clustered to the right of parents don't visually bleed into
// siblings in the next rank. Tuned against the ASR fixture (5 rounds,
// 16 variants, ~15 rejected proposals).
const RANK_SEP = 140;
const NODE_SEP = 60;

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<string, PositionedNode>;
}

function nodeSize(node: AnyNode): { width: number; height: number } {
  if (node.kind === "run_root") {
    return { width: RUN_ROOT_WIDTH, height: RUN_ROOT_HEIGHT };
  }
  if (node.kind === "proposal_rejected") {
    return { width: PROPOSAL_SIZE, height: PROPOSAL_SIZE };
  }
  return { width: VARIANT_WIDTH, height: variantHeightFor(node) };
}

function variantHeightFor(node: Extract<AnyNode, { kind: "variant" }>): number {
  const label = node.isBaseline
    ? "baseline"
    : (node.hypothesis ?? "").trim() || node.label;
  const lines = Math.max(
    1,
    Math.ceil(label.length / VARIANT_CHARS_PER_LINE),
  );
  return VARIANT_BASE_HEIGHT + lines * VARIANT_LINE_HEIGHT;
}

export function layoutGraph(
  data: GraphData,
  direction: "TB" | "LR" = "TB",
): LayoutResult {
  const g = new dagre.graphlib.Graph({ directed: true });
  g.setGraph({
    rankdir: direction,
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Dagre handles variants + run_root; rejected proposals are placed manually.
  const variantsInLayout = data.nodes.filter(
    (n) => n.kind === "variant" || n.kind === "run_root",
  );
  for (const node of variantsInLayout) {
    g.setNode(node.id, nodeSize(node));
  }
  // Edge: run root → baseline (if present).
  const runRoot = data.nodes.find((n) => n.kind === "run_root");
  const baseline = data.nodes.find(
    (n) => n.kind === "variant" && n.isBaseline,
  );
  if (runRoot && baseline) {
    g.setEdge(runRoot.id, baseline.id);
  }
  for (const edge of data.edges) {
    if (edge.kind === "accepted") {
      if (g.node(edge.source) && g.node(edge.target)) {
        g.setEdge(edge.source, edge.target);
      }
    }
  }

  dagre.layout(g);

  const positions = new Map<string, PositionedNode>();
  for (const node of variantsInLayout) {
    const p = g.node(node.id);
    if (!p) continue;
    const size = nodeSize(node);
    positions.set(node.id, {
      id: node.id,
      x: p.x - size.width / 2,
      y: p.y - size.height / 2,
      width: size.width,
      height: size.height,
    });
  }

  // Place rejected proposals to the right of their parent, at parent's y.
  // Collect by parent and spread horizontally.
  const rejectedByParent = new Map<string, string[]>();
  for (const node of data.nodes) {
    if (node.kind !== "proposal_rejected") continue;
    const list = rejectedByParent.get(node.parentVariantId) ?? [];
    list.push(node.id);
    rejectedByParent.set(node.parentVariantId, list);
  }
  for (const [parentId, children] of rejectedByParent.entries()) {
    const parentPos = positions.get(parentId);
    if (!parentPos) continue;
    const startX = parentPos.x + parentPos.width + REJECTED_OFFSET;
    children.forEach((childId, idx) => {
      positions.set(childId, {
        id: childId,
        x: startX + idx * (PROPOSAL_SIZE + REJECTED_INTER_GAP),
        y:
          parentPos.y +
          parentPos.height / 2 -
          PROPOSAL_SIZE / 2,
        width: PROPOSAL_SIZE,
        height: PROPOSAL_SIZE,
      });
    });
  }

  return { positions };
}

export function applyLayoutToReactFlow(
  data: GraphData,
  layout: LayoutResult,
) {
  const nodes = data.nodes.map((n) => {
    const pos = layout.positions.get(n.id);
    return {
      id: n.id,
      type: reactFlowTypeFor(n),
      position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data: n,
      draggable: false,
      selectable: true,
      width: pos?.width,
      height: pos?.height,
    };
  });
  const edges = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.kind,
    data: e,
  }));
  return { nodes, edges };
}

function reactFlowTypeFor(node: AnyNode): string {
  if (node.kind === "variant") return "variant";
  if (node.kind === "proposal_rejected") return "proposal_rejected";
  return "run_root";
}

export type EdgeKind = AnyEdge["kind"];

import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type { AnyEdge, AnyNode, GraphData } from '../../lib/types';
import { layoutGraph } from '../../lib/layout';
import { nodeTypes, edgeTypes } from './nodeTypes';
import type { VariantNodeData } from './VariantNode';
import type { RejectedProposalNodeData } from './RejectedProposalNode';

interface Props {
  data: GraphData;
  direction: 'TB' | 'LR';
  onSelectNode: (id: string | null) => void;
  selectedNodeId: string | null;
}

function toFlowNode(n: AnyNode): Node {
  if (n.kind === 'variant') {
    const variantData: VariantNodeData = {
      variantId: n.id,
      hypothesis: n.hypothesis ?? null,
      status: n.outcome as VariantNodeData['status'],
      meanScore: n.stats?.meanScore ?? null,
      deltaVsBaseline: n.stats?.deltaVsBaseline ?? null,
      failedRunCount: n.stats?.failedRunCount ?? 0,
      runCount: n.stats?.runCount ?? 0,
      isBaseline: n.isBaseline,
      isWinner: n.isWinner,
      round: n.roundBadge,
      inImprovementTrace: n.isOnBestPath,
    };
    return {
      id: n.id,
      type: 'variant',
      position: { x: 0, y: 0 },
      data: variantData as unknown as Record<string, unknown>,
      draggable: false,
    };
  }
  if (n.kind === 'proposal_rejected') {
    const pData: RejectedProposalNodeData = {
      proposalId: n.proposalId,
      status:
        n.status === 'rejected_exact_duplicate'
          ? 'rejected-exact-duplicate'
          : 'rejected-semantic-duplicate',
      rationale: n.rationale,
      similarity: n.similarity,
      duplicateOfVariantId: n.duplicateOfVariantId,
    };
    return {
      id: n.id,
      type: 'rejectedProposal',
      position: { x: 0, y: 0 },
      data: pData as unknown as Record<string, unknown>,
      draggable: false,
    };
  }
  // run_root
  return {
    id: n.id,
    type: 'runRoot',
    position: { x: 0, y: 0 },
    data: n as unknown as Record<string, unknown>,
    draggable: false,
  };
}

function toFlowEdge(e: AnyEdge): Edge {
  if (e.kind === 'accepted') {
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.isOnBestPath ? 'bestPath' : 'accepted',
      data: {
        rationale: e.rationale ?? undefined,
        deltaVsParent: e.deltaVsParent,
      },
    };
  }
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'rejected',
    data: { reason: e.status },
  };
}

export function GraphCanvas({ data, direction, onSelectNode, selectedNodeId }: Props) {
  const layout = useMemo(() => layoutGraph(data, direction), [data, direction]);

  const flowNodes: Node[] = useMemo(() => {
    return data.nodes.map((n) => {
      const pos = layout.positions.get(n.id);
      const base = toFlowNode(n);
      return {
        ...base,
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        selected: selectedNodeId === n.id,
      };
    });
  }, [data, layout, selectedNodeId]);

  const flowEdges: Edge[] = useMemo(() => data.edges.map(toFlowEdge), [data]);

  return (
    <div className="rgv-graph h-full w-full" data-testid="graph-canvas">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.35 }}
        onNodeClick={(_e, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--grid-dot)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ background: 'var(--bg-elevated)' }} />
      </ReactFlow>
    </div>
  );
}

import { VariantNode } from './VariantNode';
import { RejectedProposalNode } from './RejectedProposalNode';
import { RunRootNode } from './RunRootNode';
import { AcceptedEdge } from './AcceptedEdge';
import { RejectedEdge } from './RejectedEdge';
import { BestPathEdge } from './BestPathEdge';

export const nodeTypes = {
  variant: VariantNode,
  rejectedProposal: RejectedProposalNode,
  runRoot: RunRootNode,
};

export const edgeTypes = {
  accepted: AcceptedEdge,
  rejected: RejectedEdge,
  bestPath: BestPathEdge,
};

export const NODE_DIMENSIONS = {
  variant: { width: 220, height: 100 },
  rejectedProposal: { width: 44, height: 44 },
  runRoot: { width: 260, height: 48 },
} as const;

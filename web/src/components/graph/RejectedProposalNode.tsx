import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { proposalStatusVar, type ProposalStatus } from '../../lib/status/classify';

export interface RejectedProposalNodeData {
  readonly proposalId: string;
  readonly status: Extract<
    ProposalStatus,
    'rejected-exact-duplicate' | 'rejected-semantic-duplicate'
  >;
  readonly rationale: string;
  readonly similarity: number | null;
  readonly duplicateOfVariantId: string | null;
}

interface Props {
  data: RejectedProposalNodeData;
  selected?: boolean;
}

export const RejectedProposalNode = memo(function RejectedProposalNode({
  data,
  selected,
}: Props) {
  const color = proposalStatusVar(data.status);
  const glyph = data.status === 'rejected-exact-duplicate' ? '=' : '≈';
  const title =
    data.similarity !== null
      ? `${labelFor(data.status)} · similarity ${data.similarity.toFixed(2)}${
          data.duplicateOfVariantId ? ` · of ${data.duplicateOfVariantId}` : ''
        }`
      : labelFor(data.status);

  return (
    <div
      role="group"
      aria-label={title}
      data-testid="proposal-node"
      data-proposal-id={data.proposalId}
      data-proposal-status={data.status}
      title={title}
      className="relative"
      style={{ width: 44, height: 44 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div
        aria-hidden
        className={['absolute left-1/2 top-1/2 border', selected ? 'ring-2 ring-[var(--focus-ring)]' : ''].join(' ')}
        style={{
          width: 30,
          height: 30,
          transform: 'translate(-50%, -50%) rotate(45deg)',
          borderColor: color,
          background: 'var(--bg-surface)',
          borderStyle: 'dashed',
        }}
      />

      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-mono"
        style={{
          color,
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {glyph}
      </span>
    </div>
  );
});

function labelFor(status: RejectedProposalNodeData['status']): string {
  return status === 'rejected-exact-duplicate'
    ? 'Rejected — exact duplicate'
    : 'Rejected — semantic duplicate';
}

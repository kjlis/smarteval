import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Crown, AlertTriangle, Info } from 'lucide-react';
import {
  formatDelta,
  formatScore,
  shortId,
  statusVar,
  type NodeStatus,
} from '../../lib/status/classify';

export interface VariantNodeData {
  readonly variantId: string;
  readonly hypothesis: string | null;
  readonly status: NodeStatus;
  readonly meanScore: number | null;
  readonly deltaVsBaseline: number | null;
  readonly failedRunCount: number;
  readonly runCount: number;
  readonly isBaseline: boolean;
  readonly isWinner: boolean;
  readonly round: number | null;
  readonly inImprovementTrace: boolean;
}

interface Props {
  data: VariantNodeData;
  selected?: boolean;
}

export const VariantNode = memo(function VariantNode({ data, selected }: Props) {
  const isGhost = data.status === 'unscored';
  const isBaseline = data.isBaseline;
  const hasFailed = data.failedRunCount > 0 && data.status !== 'failed';

  const fillPct =
    data.meanScore === null ? 0 : Math.max(0, Math.min(1, data.meanScore)) * 100;
  const stripeColor = isGhost ? 'transparent' : statusVar(data.status);
  const stripeWidth = isBaseline ? 8 : 4;

  return (
    <div
      role="group"
      aria-label={`Variant ${data.variantId}, ${data.status}`}
      data-testid="variant-node"
      data-variant-id={data.variantId}
      data-outcome={data.status}
      data-status={data.status}
      data-is-winner={String(data.isWinner)}
      data-is-ghost={String(isGhost)}
      data-on-best-path={String(data.inImprovementTrace)}
      className={[
        'relative flex flex-col overflow-hidden rounded-md bg-[var(--bg-surface)]',
        'transition-[box-shadow,transform] duration-150',
        isGhost ? 'border border-dashed' : 'border',
        selected ? 'ring-2 ring-[var(--focus-ring)]' : '',
      ].join(' ')}
      style={{
        width: 220,
        minHeight: 100,
        height: '100%',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: stripeWidth, background: stripeColor }}
      />

      {data.isWinner && (
        <div
          aria-hidden
          className="absolute right-0 top-0"
          style={{
            width: 0,
            height: 0,
            borderTop: '12px solid var(--bg-canvas)',
            borderLeft: '12px solid transparent',
          }}
        />
      )}

      <div
        className="flex h-full flex-col gap-1 py-2"
        style={{ paddingLeft: stripeWidth + 10, paddingRight: 10 }}
      >
        <header className="flex items-start justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            {isBaseline ? 'Baseline' : data.round !== null ? `R${data.round}` : ''}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {data.isWinner && (
              <span
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  borderColor: 'var(--status-winner)',
                  background: 'var(--winner-pill-bg)',
                  color: 'var(--status-winner)',
                }}
                aria-label="Winner of this bakeoff"
              >
                <Crown size={10} strokeWidth={2.5} />
                Winner
              </span>
            )}
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[11px]"
              style={{
                background: isGhost ? 'transparent' : 'var(--bg-elevated)',
                color: deltaColor(data.status, data.deltaVsBaseline),
              }}
              data-testid={`node-variant-${data.variantId}-delta`}
              aria-label={`Delta vs baseline ${formatDelta(data.deltaVsBaseline)}`}
            >
              {formatDelta(data.deltaVsBaseline)}
            </span>
          </div>
        </header>

        <div
          className="flex-1 text-[12px] font-semibold leading-tight break-words"
          style={{ color: 'var(--text-primary)' }}
          title={data.variantId}
        >
          {displayLabel(data)}
        </div>

        <footer className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-[20px] font-semibold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
              data-testid={`node-variant-${data.variantId}-score`}
            >
              {formatScore(data.meanScore)}
            </span>
            {hasFailed && (
              <span
                className="flex items-center gap-0.5 font-mono text-[11px]"
                style={{ color: 'var(--status-failed)' }}
                title={`${data.failedRunCount} of ${data.runCount} runs failed`}
              >
                <AlertTriangle size={11} strokeWidth={2.5} />
                {data.failedRunCount}/{data.runCount}
              </span>
            )}
          </div>
          {isGhost && (
            <span style={{ color: 'var(--text-tertiary)' }} title="Not rerun in this bakeoff">
              <Info size={12} />
            </span>
          )}
        </footer>

        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <div
            className="h-full"
            style={{
              width: `${fillPct}%`,
              background: stripeColor,
              transition: 'width 180ms ease-out',
            }}
          />
        </div>

        {data.status === 'failed' && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-45deg, transparent 0 3px, var(--status-failed) 3px 4px)',
              opacity: 0.12,
            }}
          />
        )}
      </div>
    </div>
  );
});

function displayLabel(data: VariantNodeData): string {
  if (data.isBaseline) return 'baseline';
  if (data.hypothesis && data.hypothesis.trim().length > 0) return data.hypothesis;
  return shortId(data.variantId, 24);
}

function deltaColor(status: NodeStatus, delta: number | null): string {
  if (delta === null) return 'var(--text-tertiary)';
  if (status === 'baseline' || status === 'unscored') return 'var(--text-secondary)';
  return statusVar(status);
}

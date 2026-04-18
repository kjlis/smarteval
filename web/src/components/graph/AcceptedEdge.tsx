import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { formatDelta } from '../../lib/status/classify';

export const AcceptedEdge = memo(function AcceptedEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const delta = asNumberOrNull(data?.deltaVsParent);
  const badgeColor = deltaColor(delta);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: 'var(--edge-accepted)', strokeWidth: 1.5 }}
      />
      {delta !== null && (
        <EdgeLabelRenderer>
          <div
            data-testid="edge-delta-badge"
            className="pointer-events-none absolute rounded-full px-1.5 py-0.5 text-node-badge tabular-nums"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              color: badgeColor,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            {formatDelta(delta)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

function asNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function deltaColor(delta: number | null): string {
  if (delta === null) return 'var(--text-secondary)';
  if (delta > 0.05) return 'var(--status-improved)';
  if (delta > 0) return 'var(--status-improved-mild)';
  if (delta < -0.05) return 'var(--status-regressed)';
  if (delta < 0) return 'var(--status-regressed-mild)';
  return 'var(--text-secondary)';
}

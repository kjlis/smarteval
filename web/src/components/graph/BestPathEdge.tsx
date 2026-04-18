import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { formatDelta } from '../../lib/status/classify';

/**
 * Gold 2.5px stroke + drop-shadow halo. One-shot stroke-dashoffset animation
 * on mount via .rgv-best-path class — disabled under prefers-reduced-motion
 * via CSS.
 */
export const BestPathEdge = memo(function BestPathEdge(props: EdgeProps) {
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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className="rgv-best-path"
        style={{
          stroke: 'var(--edge-best-path)',
          strokeWidth: 2.5,
          fill: 'none',
        }}
      />
      {delta !== null && (
        <EdgeLabelRenderer>
          <div
            data-testid="best-path-delta-badge"
            className="pointer-events-none absolute rounded-full px-1.5 py-0.5 text-node-badge tabular-nums"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'var(--bg-canvas)',
              border: '1px solid var(--status-winner)',
              color: 'var(--status-winner)',
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

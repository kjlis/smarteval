import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * 1px dashed, low-contrast. Intentionally not red — rejection is noise,
 * not failure.
 */
export const RejectedEdge = memo(function RejectedEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: 'var(--edge-rejected)',
        strokeWidth: 1,
        strokeDasharray: '4 2',
      }}
    />
  );
});

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { RunRootNode as RunRootNodeType } from '../../lib/types';

interface Props {
  data: RunRootNodeType;
  selected?: boolean;
}

/**
 * Virtual "run root" node — one per bakeoff, sits above the baseline variant.
 * 260×48 rounded capsule. Shows the short bakeoff id + optional round badge.
 */
export const RunRootNode = memo(function RunRootNode({ data, selected }: Props) {
  const short = shortBakeoffId(data.bakeoffId);
  return (
    <div
      role="group"
      aria-label={`Run root ${short}`}
      data-testid="run-root-node"
      data-bakeoff-id={data.bakeoffId}
      className={[
        'flex items-center gap-3 rounded-full border px-4',
        'transition-[box-shadow] duration-150',
        selected ? 'ring-2 ring-[var(--focus-ring)]' : '',
      ].join(' ')}
      style={{
        width: 260,
        height: 48,
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {data.round !== null && (
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          R{data.round}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate font-mono text-[12px] font-medium"
          style={{ color: 'var(--text-primary)' }}
          title={data.bakeoffId}
        >
          {short}
        </span>
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {data.variantCount} variants
          {data.winnerVariantId ? ' · has winner' : ''}
        </span>
      </div>
    </div>
  );
});

/**
 * Bakeoff ids look like `2026-04-18T13-34-21__2026-0`. Trim the suffix after
 * `__` and normalize the T separator for readability.
 */
function shortBakeoffId(id: string): string {
  const head = id.split('__')[0];
  return head.replace(/T/, ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2');
}

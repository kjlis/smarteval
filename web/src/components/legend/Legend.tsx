import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { statusLabel, statusVar, type NodeStatus } from '../../lib/status/classify';

const COACH_STORAGE_KEY = 'rgv:legend-coached';

interface Props {
  /**
   * Optional dimming handler — when the user hovers or focuses a status
   * row, the GraphCanvas can fade non-matching nodes to 0.25 opacity. If
   * omitted, rows still highlight but the canvas doesn't react.
   */
  onHoverStatus?: (status: NodeStatus | null) => void;
}

const STATUS_ROWS: readonly NodeStatus[] = [
  'baseline',
  'winner',
  'failed',
  'regressed',
  'regressed-mild',
  'improved-mild',
  'improved',
  'unscored',
];

export function Legend({ onHoverStatus }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [activeStatus, setActiveStatus] = useState<NodeStatus | null>(null);

  // Keyboard shortcut: L to toggle. Skip when focus is in an input/textarea.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // First-time coach mark — shows once, on first open, then persists dismissal.
  useEffect(() => {
    if (collapsed) return;
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(COACH_STORAGE_KEY);
    if (!seen) setShowCoach(true);
  }, [collapsed]);

  function dismissCoach() {
    setShowCoach(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COACH_STORAGE_KEY, '1');
    }
  }

  function onRowEnter(status: NodeStatus) {
    setActiveStatus(status);
    onHoverStatus?.(status);
  }
  function onRowLeave() {
    setActiveStatus(null);
    onHoverStatus?.(null);
  }

  if (collapsed) {
    return (
      // The outer wrapper is pointer-events:none so the bottom-left corner
      // of the canvas stays clickable; only the button itself picks up
      // events. Without this, collapsed legend still blocked node clicks.
      <div className="pointer-events-none fixed bottom-4 left-4 z-10">
        <button
          type="button"
          data-testid="legend-toggle"
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium cursor-pointer"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          aria-label="Show legend (L)"
          title="Show legend (L)"
        >
          <Info size={14} />
          Legend
        </button>
      </div>
    );
  }

  return (
    // Same pointer-events:none / auto split: the aside itself receives
    // events for legend rows + close button, but any surrounding space
    // inside the fixed wrapper passes clicks through to the canvas.
    <div className="pointer-events-none fixed bottom-4 left-4 z-10">
      <aside
        role="complementary"
        aria-label="Legend"
        data-testid="legend"
        className="pointer-events-auto flex flex-col gap-3 rounded-md border p-3 text-[12px] font-medium"
        style={{
          width: 220,
          maxHeight: '60vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
      <header className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Legend
        </span>
        <button
          type="button"
          data-testid="legend-close"
          onClick={() => setCollapsed(true)}
          className="rounded px-1 text-[14px] leading-none cursor-pointer"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Collapse legend (L)"
          title="Collapse (L)"
        >
          ×
        </button>
      </header>

      {showCoach && (
        <div
          role="note"
          data-testid="legend-coach-mark"
          className="rounded-md border px-2.5 py-2 text-[11px] leading-snug"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--status-winner)',
            color: 'var(--text-primary)',
          }}
        >
          Hover a row to dim unrelated nodes. Press{' '}
          <kbd
            className="rounded border px-1 font-mono"
            style={{
              borderColor: 'var(--border-strong)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            L
          </kbd>{' '}
          to collapse.
          <button
            type="button"
            onClick={dismissCoach}
            className="mt-2 block text-[11px] underline cursor-pointer"
            style={{ color: 'var(--status-winner)' }}
          >
            Got it
          </button>
        </div>
      )}

      <section className="flex flex-col gap-1" aria-label="Status">
        {STATUS_ROWS.map((status) => (
          <LegendRow
            key={status}
            status={status}
            active={activeStatus === status}
            onEnter={() => onRowEnter(status)}
            onLeave={onRowLeave}
          />
        ))}
      </section>

      <section
        className="flex flex-col gap-1.5 border-t pt-3"
        style={{ borderColor: 'var(--border-subtle)' }}
        aria-label="Rejection"
      >
        <DiamondRow kind="exact" label="Rejected — exact duplicate" />
        <DiamondRow kind="semantic" label="Rejected — semantic duplicate" />
      </section>

      <section
        className="flex flex-col gap-1.5 border-t pt-3"
        style={{ borderColor: 'var(--border-subtle)' }}
        aria-label="Edges"
      >
        <EdgeRow kind="accepted" label="Accepted" />
        <EdgeRow kind="rejected" label="Rejected" />
        <EdgeRow kind="best-path" label="Best path" />
      </section>

      <p
        className="text-[11px] leading-snug"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Gold edge = current best lineage from baseline.
      </p>
      </aside>
    </div>
  );
}

interface LegendRowProps {
  status: NodeStatus;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}

function LegendRow({ status, active, onEnter, onLeave }: LegendRowProps) {
  return (
    <button
      type="button"
      data-testid={`legend-row-${status}`}
      data-outcome={status}
      data-active={active || undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={[
        'flex items-center gap-2 rounded px-1 py-0.5 text-left cursor-pointer',
        'transition-[background-color,color] duration-[120ms] ease-out-std',
        'motion-reduce:transition-none',
        'focus:outline-none focus-visible:ring-2',
      ].join(' ')}
      style={{
        background: active ? 'var(--bg-elevated)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        textDecoration: active ? 'underline' : 'none',
        textUnderlineOffset: '2px',
      }}
      aria-pressed={active}
    >
      <span
        aria-hidden
        className="inline-block"
        style={{
          width: 18,
          height: 10,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderLeft: `4px solid ${statusVar(status)}`,
          borderRadius: 2,
        }}
      />
      <span>{statusLabel(status)}</span>
    </button>
  );
}

function DiamondRow({ kind, label }: { kind: 'exact' | 'semantic'; label: string }) {
  const color =
    kind === 'exact'
      ? 'var(--status-rejected-exact)'
      : 'var(--status-rejected-semantic)';
  const glyph = kind === 'exact' ? '=' : '≈';
  return (
    <div
      className="flex items-center gap-2 px-1"
      data-testid={`legend-row-rejected-${kind}`}
    >
      <span
        aria-hidden
        className="relative inline-block"
        style={{ width: 18, height: 18 }}
      >
        <span
          className="absolute left-1/2 top-1/2"
          style={{
            width: 12,
            height: 12,
            transform: 'translate(-50%, -50%) rotate(45deg)',
            border: `1.5px dashed ${color}`,
            background: 'var(--bg-surface)',
            borderRadius: 2,
          }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center font-mono"
          style={{ color, fontSize: 11, fontWeight: 600 }}
        >
          {glyph}
        </span>
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function EdgeRow({
  kind,
  label,
}: {
  kind: 'accepted' | 'rejected' | 'best-path';
  label: string;
}) {
  let stroke: string;
  let width = 1.5;
  let dash: string | undefined;
  if (kind === 'accepted') {
    stroke = 'var(--edge-accepted)';
  } else if (kind === 'rejected') {
    stroke = 'var(--edge-rejected)';
    width = 1;
    dash = '4 2';
  } else {
    stroke = 'var(--edge-best-path)';
    width = 2.5;
  }
  return (
    <div
      className="flex items-center gap-2 px-1"
      data-testid={`legend-row-edge-${kind}`}
    >
      <svg width={28} height={12} aria-hidden>
        <line
          x1={2}
          x2={26}
          y1={6}
          y2={6}
          stroke={stroke}
          strokeWidth={width}
          strokeDasharray={dash}
          style={
            kind === 'best-path'
              ? { filter: 'drop-shadow(0 0 2px var(--path-halo-strong))' }
              : undefined
          }
        />
      </svg>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

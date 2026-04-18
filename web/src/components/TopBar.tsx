import type { GraphExport } from '../lib/types';
import { useViewStore } from '../state/store';

interface Props {
  graph: GraphExport;
}

export function TopBar({ graph }: Props) {
  const showRejected = useViewStore((s) => s.showRejected);
  const setShowRejected = useViewStore((s) => s.setShowRejected);
  const showBestPathOnly = useViewStore((s) => s.showBestPathOnly);
  const setShowBestPathOnly = useViewStore((s) => s.setShowBestPathOnly);
  const showFailedOnly = useViewStore((s) => s.showFailedOnly);
  const setShowFailedOnly = useViewStore((s) => s.setShowFailedOnly);
  const authorFilter = useViewStore((s) => s.authorFilter);
  const setAuthorFilter = useViewStore((s) => s.setAuthorFilter);
  const focusedRound = useViewStore((s) => s.focusedRound);
  const setFocusedRound = useViewStore((s) => s.setFocusedRound);
  const showFutureVariants = useViewStore((s) => s.showFutureVariants);
  const setShowFutureVariants = useViewStore((s) => s.setShowFutureVariants);

  return (
    <header
      data-testid="top-bar"
      className="flex flex-wrap items-center gap-4 border-b px-4 py-2"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          View
        </span>
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Unified lineage
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          · {graph.variants.length} variants · {graph.bakeoffs.length} bakeoffs
        </span>
      </div>

      <Toggle
        label="Rejected"
        testId="toggle-rejected"
        checked={showRejected}
        onChange={setShowRejected}
      />
      <Toggle
        label="Best path only"
        testId="toggle-best-path"
        checked={showBestPathOnly}
        onChange={setShowBestPathOnly}
      />
      <Toggle
        label="Failed only"
        testId="toggle-failed-only"
        checked={showFailedOnly}
        onChange={setShowFailedOnly}
      />
      <Toggle
        label="Show ghost ancestors"
        testId="toggle-unscored"
        checked={showFutureVariants}
        onChange={setShowFutureVariants}
      />

      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Author
        </span>
        <select
          data-testid="filter-author"
          value={authorFilter}
          onChange={(e) => setAuthorFilter(e.target.value as typeof authorFilter)}
          className="rounded border px-2 py-1 text-[12px]"
          style={{
            background: 'var(--bg-canvas)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <option value="all">All</option>
          <option value="framework">Framework</option>
          <option value="proposer">Proposer</option>
          <option value="human">Human</option>
        </select>
      </div>

      {graph.optimizationRuns.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Round
          </span>
          <select
            data-testid="filter-focused-round"
            value={focusedRound ?? ''}
            onChange={(e) =>
              setFocusedRound(e.target.value === '' ? null : Number(e.target.value))
            }
            className="rounded border px-2 py-1 text-[12px]"
            style={{
              background: 'var(--bg-canvas)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <option value="">All</option>
            {graph.optimizationRuns[0].rounds.map((r) => (
              <option key={r.round} value={r.round}>
                R{r.round}
              </option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}

function Toggle({
  label,
  testId,
  checked,
  onChange,
}: {
  label: string;
  testId: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      data-testid={testId}
      className="inline-flex items-center gap-1.5 cursor-pointer text-[12px]"
      style={{ color: 'var(--text-secondary)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

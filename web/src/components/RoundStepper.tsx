import { useEffect, useMemo } from 'react';
import type { GraphExport } from '../lib/types';
import { useViewStore } from '../state/store';

interface Props {
  graph: GraphExport;
}

export function RoundStepper({ graph }: Props) {
  const focusedRound = useViewStore((s) => s.focusedRound);
  const setFocusedRound = useViewStore((s) => s.setFocusedRound);

  const rounds = useMemo(() => {
    const all = new Set<number>();
    for (const run of graph.optimizationRuns) {
      for (const r of run.rounds) all.add(r.round);
    }
    return Array.from(all).sort((a, b) => a - b);
  }, [graph]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (rounds.length === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (focusedRound === null) {
          setFocusedRound(rounds[rounds.length - 1]);
          return;
        }
        const idx = rounds.indexOf(focusedRound);
        if (idx > 0) setFocusedRound(rounds[idx - 1]);
        else setFocusedRound(null);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (focusedRound === null) {
          setFocusedRound(rounds[0]);
          return;
        }
        const idx = rounds.indexOf(focusedRound);
        if (idx < rounds.length - 1) setFocusedRound(rounds[idx + 1]);
        else setFocusedRound(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rounds, focusedRound, setFocusedRound]);

  if (rounds.length === 0) return null;

  const label =
    focusedRound === null
      ? `All rounds · ${rounds.length} steps`
      : `Focus: Round ${focusedRound}`;

  return (
    <div
      data-testid="round-stepper"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border px-4 py-2"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-panel, 0 2px 12px rgba(0,0,0,0.3))',
        zIndex: 10,
      }}
    >
      <button
        onClick={() => setFocusedRound(null)}
        className="rounded px-2 py-0.5 text-[11px] uppercase tracking-wider"
        style={{
          color: focusedRound === null ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: focusedRound === null ? 600 : 400,
        }}
      >
        All
      </button>
      {rounds.map((r) => (
        <button
          key={r}
          onClick={() => setFocusedRound(r)}
          className="rounded px-2 py-0.5 text-[11px]"
          style={{
            color: focusedRound === r ? 'var(--status-winner)' : 'var(--text-secondary)',
            fontWeight: focusedRound === r ? 600 : 400,
          }}
        >
          R{r}
        </button>
      ))}
      <span
        data-testid="round-stepper-label"
        className="text-[11px]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
    </div>
  );
}

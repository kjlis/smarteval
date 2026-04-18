import { X } from 'lucide-react';
import type { AnyNode, GraphExport } from '../../lib/types';
import {
  formatDelta,
  formatScore,
  statusLabel,
  statusVar,
} from '../../lib/status/classify';

interface Props {
  node: AnyNode | null;
  graph: GraphExport;
  onClose: () => void;
}

export function Inspector({ node, graph, onClose }: Props) {
  const kind = node ? inspectorKind(node) : 'empty';
  return (
    <aside
      data-testid="inspector"
      data-inspector-kind={kind}
      className="rgv-scroll flex h-full w-[380px] flex-col border-l overflow-y-auto"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Node inspector"
    >
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <h2
          data-testid="inspector-title"
          className="truncate font-mono text-[13px] font-semibold"
          style={{ color: 'var(--text-primary)' }}
          title={node ? inspectorTitle(node) : 'Nothing selected'}
        >
          {node ? inspectorTitle(node) : 'Nothing selected'}
        </h2>
        {node ? (
          <div className="flex items-center gap-1">
            <button
              data-testid="inspector-copy-id"
              onClick={() => navigator.clipboard?.writeText(inspectorTitle(node))}
              className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
              }}
              aria-label="Copy id"
            >
              Copy id
            </button>
            <button
              data-testid="inspector-close"
              onClick={onClose}
              className="rounded p-1 hover:bg-[var(--bg-elevated)]"
              aria-label="Close inspector"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
      </header>
      <div className="flex flex-col gap-4 p-4">
        {node === null && (
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            Select a node to see details.
          </p>
        )}
        {node?.kind === 'variant' && <VariantBody node={node} />}
        {node?.kind === 'proposal_rejected' && <ProposalBody node={node} />}
        {node?.kind === 'run_root' && <RunRootBody node={node} graph={graph} />}
      </div>
    </aside>
  );
}

function inspectorTitle(node: AnyNode): string {
  if (node.kind === 'variant') return node.fullId;
  if (node.kind === 'proposal_rejected') return node.proposalId;
  return node.label;
}

function inspectorKind(node: AnyNode): 'variant' | 'proposal' | 'run-root' {
  if (node.kind === 'variant') return 'variant';
  if (node.kind === 'proposal_rejected') return 'proposal';
  return 'run-root';
}

function VariantBody({ node }: { node: Extract<AnyNode, { kind: 'variant' }> }) {
  const s = node.stats;
  return (
    <>
      <Row label="Status">
        <span
          className="rounded px-2 py-0.5 text-[11px]"
          style={{
            color: statusVar(node.outcome as any),
            background: 'var(--bg-elevated)',
          }}
        >
          {statusLabel(node.outcome as any)}
        </span>
      </Row>
      {node.isOnBestPath ? (
        <Row label="Winning path">
          <span
            className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
            style={{
              color: 'var(--status-winner)',
              background: 'var(--winner-pill-bg)',
            }}
          >
            On best path{node.isWinner ? ' · terminus' : ''}
          </span>
        </Row>
      ) : null}
      <Row label="Mean score">
        <span data-testid="inspector-mean-score" className="font-mono">
          {formatScore(s?.meanScore ?? null)}
        </span>
      </Row>
      <Row label="Δ vs baseline">
        <span data-testid="inspector-delta" className="font-mono">
          {formatDelta(s?.deltaVsBaseline ?? null)}
        </span>
      </Row>
      {s ? (
        <>
          <Row label="Runs">
            <span className="font-mono">
              {s.runCount} ({s.failedRunCount} failed)
            </span>
          </Row>
          <Row label="Pass rate">
            <span className="font-mono">{(s.passRate * 100).toFixed(0)}%</span>
          </Row>
          <Row label="Duration">
            <span className="font-mono">{(s.meanDurationMs / 1000).toFixed(1)}s</span>
          </Row>
        </>
      ) : null}
      {node.hypothesis ? (
        <Row label="Hypothesis">
          <span style={{ color: 'var(--text-secondary)' }}>{node.hypothesis}</span>
        </Row>
      ) : null}
      {node.rationale ? (
        <section>
          <h3 className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Rationale
          </h3>
          <p
            data-testid="inspector-rationale"
            className="text-[12px] leading-relaxed"
            style={{ color: 'var(--text-primary)' }}
          >
            {node.rationale}
          </p>
        </section>
      ) : null}
      {s && s.sampleErrors.length > 0 ? (
        <section data-testid="inspector-sample-errors">
          <h3 className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--status-regressed)' }}>
            Errors
          </h3>
          <ul className="flex flex-col gap-1 text-[11px]">
            {s.sampleErrors.map((err, i) => (
              <li key={i} className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                {err}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DiffViewer diff={node.diff} />
    </>
  );
}

function ProposalBody({ node }: { node: Extract<AnyNode, { kind: 'proposal_rejected' }> }) {
  return (
    <>
      <Row label="Status">
        <span className="font-mono text-[11px]">{node.status}</span>
      </Row>
      {node.similarity !== null ? (
        <Row label="Similarity">
          <span className="font-mono">{node.similarity.toFixed(2)}</span>
        </Row>
      ) : null}
      {node.duplicateOfVariantId ? (
        <Row label="Duplicate of">
          <span className="font-mono text-[11px]">{node.duplicateOfVariantId}</span>
        </Row>
      ) : null}
      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Rationale
        </h3>
        <p
          data-testid="inspector-rationale"
          className="text-[12px] leading-relaxed"
          style={{ color: 'var(--text-primary)' }}
        >
          {node.rationale}
        </p>
      </section>
      <DiffViewer diff={node.diff} />
    </>
  );
}

function RunRootBody({
  node,
  graph,
}: {
  node: Extract<AnyNode, { kind: 'run_root' }>;
  graph: GraphExport;
}) {
  const optRun = graph.optimizationRuns.find((r) => r.id === node.optimizationRunId);
  return (
    <>
      <Row label="Generated">
        <span className="font-mono text-[11px]">{node.generatedAt}</span>
      </Row>
      <Row label="Evaluator">
        <span className="font-mono text-[11px]">{node.evaluatorFingerprint}</span>
      </Row>
      <Row label="Golden hash">
        <span className="font-mono text-[11px]">{node.goldenHash}</span>
      </Row>
      <Row label="Variants in bakeoff">
        <span className="font-mono">{node.variantCount}</span>
      </Row>
      {node.winnerVariantId ? (
        <Row label="Winner">
          <span className="font-mono text-[11px]">{node.winnerVariantId}</span>
        </Row>
      ) : null}
      {optRun ? (
        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Optimization trajectory
          </h3>
          <Sparkline
            points={[
              optRun.initialBestMeanScore,
              ...optRun.rounds.map((r) => r.bestMeanScore ?? 0),
            ]}
          />
        </section>
      ) : null}
    </>
  );
}

function DiffViewer({ diff }: { diff: Record<string, unknown> }) {
  const flat = flattenDiff(diff);
  if (flat.length === 0) return null;
  const commonPrefix = longestCommonPathPrefix(flat.map(([p]) => p));
  const stripLen = commonPrefix ? commonPrefix.length + 1 : 0;
  return (
    <section data-testid="inspector-diff">
      <h3 className="mb-1 flex items-baseline gap-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        <span>Diff</span>
        {commonPrefix ? (
          <span className="font-mono normal-case tracking-normal" style={{ color: 'var(--text-tertiary)' }}>
            under <span style={{ color: 'var(--text-secondary)' }}>{commonPrefix}</span>
          </span>
        ) : null}
      </h3>
      <dl className="flex flex-col gap-1 text-[11px]">
        {flat.map(([path, value]) => {
          const shown = stripLen > 0 ? path.slice(stripLen) : path;
          return (
            <div
              key={path}
              data-testid={`inspector-diff-field-${path}`}
              className="flex gap-2 font-mono"
            >
              <dt
                className="shrink-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {shown}:
              </dt>
              <dd className="min-w-0 break-all" style={{ color: 'var(--text-primary)' }}>
                {JSON.stringify(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function longestCommonPathPrefix(paths: string[]): string {
  if (paths.length < 2) return '';
  const split = paths.map((p) => p.split('.'));
  const first = split[0];
  let i = 0;
  outer: for (; i < first.length - 1; i++) {
    for (let j = 1; j < split.length; j++) {
      if (split[j][i] !== first[i]) break outer;
    }
  }
  return first.slice(0, i).join('.');
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  );
}

function flattenDiff(diff: Record<string, unknown>, prefix = ''): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(diff)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenDiff(v as Record<string, unknown>, path));
    } else {
      out.push([path, v]);
    }
  }
  return out;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const w = 320;
  const h = 48;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / Math.max(points.length - 1, 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden>
      <path d={path} fill="none" stroke="var(--status-winner)" strokeWidth={1.5} />
    </svg>
  );
}

import { useEffect, useMemo } from 'react';
import { buildGraphData } from '../lib/graph';
import type { AnyNode, GraphExport } from '../lib/types';
import { hydrateFromUrl, subscribeUrlSync, useViewStore } from '../state/store';
import { GraphCanvas } from './graph/GraphCanvas';
import { Inspector } from './inspector/Inspector';
import { Legend } from './legend/Legend';
import { RoundStepper } from './RoundStepper';
import { TopBar } from './TopBar';

interface Props {
  graph: GraphExport;
}

export function GraphApp({ graph }: Props) {
  const setGraph = useViewStore((s) => s.setGraph);
  const selectedNodeId = useViewStore((s) => s.selectedNodeId);
  const selectNode = useViewStore((s) => s.selectNode);
  const layoutDirection = useViewStore((s) => s.layoutDirection);
  const showRejected = useViewStore((s) => s.showRejected);
  const showBestPathOnly = useViewStore((s) => s.showBestPathOnly);
  const authorFilter = useViewStore((s) => s.authorFilter);
  const sliceFilter = useViewStore((s) => s.sliceFilter);
  const focusedRound = useViewStore((s) => s.focusedRound);
  const showFailedOnly = useViewStore((s) => s.showFailedOnly);
  const showFutureVariants = useViewStore((s) => s.showFutureVariants);

  useEffect(() => {
    setGraph(graph);
    hydrateFromUrl();
    return subscribeUrlSync();
  }, [graph, setGraph]);

  // Global keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const store = useViewStore.getState();
      if (e.key === '/') {
        e.preventDefault();
        const sel = document.querySelector<HTMLElement>('[data-testid="run-selector"]');
        sel?.focus();
      } else if (e.key === 'Escape') {
        store.selectNode(null);
      } else if (e.key === 'b') {
        store.setShowBestPathOnly(!store.showBestPathOnly);
      } else if (e.key === 'r') {
        store.setShowRejected(!store.showRejected);
      } else if (e.key === 'f') {
        store.setShowFailedOnly(!store.showFailedOnly);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const graphData = useMemo(
    () =>
      buildGraphData({
        graph,
        filters: {
          selectedBakeoffId: null,
          showRejected,
          showBestPathOnly,
          authorFilter,
          sliceFilter,
          focusedRound,
          showFailedOnly,
          showFutureVariants,
        },
      }),
    [
      graph,
      showRejected,
      showBestPathOnly,
      authorFilter,
      sliceFilter,
      focusedRound,
      showFailedOnly,
      showFutureVariants,
    ],
  );

  const selectedNode: AnyNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [graphData, selectedNodeId]);

  if (graph.bakeoffs.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className="flex h-[80vh] flex-col items-center justify-center gap-2 rgv-empty-grid"
      >
        <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          No bakeoffs yet
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          Run <code>smarteval run</code> to produce a bakeoff summary.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="app-root"
      className="flex h-[calc(100vh-5rem)] flex-col"
      style={{ background: 'var(--bg-canvas)' }}
    >
      <TopBar graph={graph} />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1" style={{ paddingLeft: 260 }}>
          <GraphCanvas
            data={graphData}
            direction={layoutDirection}
            onSelectNode={selectNode}
            selectedNodeId={selectedNodeId}
          />
        </div>
        {selectedNode ? (
          <Inspector
            node={selectedNode}
            graph={graph}
            onClose={() => selectNode(null)}
          />
        ) : null}
        <Legend />
        <RoundStepper graph={graph} />
      </div>
    </div>
  );
}

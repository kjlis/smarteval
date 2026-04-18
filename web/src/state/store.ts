import { create } from "zustand";
import type { GraphExport, GraphFilters } from "../lib/types";

export interface ViewState extends GraphFilters {
  graph: GraphExport | null;
  selectedNodeId: string | null;
  layoutDirection: "TB" | "LR";

  setGraph(graph: GraphExport): void;
  selectBakeoff(id: string | null): void;
  selectNode(id: string | null): void;
  setShowRejected(v: boolean): void;
  setShowBestPathOnly(v: boolean): void;
  setAuthorFilter(v: ViewState["authorFilter"]): void;
  setSliceFilter(v: string | null): void;
  setFocusedRound(v: number | null): void;
  setShowFailedOnly(v: boolean): void;
  setShowFutureVariants(v: boolean): void;
  setLayoutDirection(v: "TB" | "LR"): void;
}

const DEFAULTS: Omit<ViewState, keyof Actions> = {
  graph: null,
  selectedBakeoffId: null,
  selectedNodeId: null,
  showRejected: true,
  showBestPathOnly: false,
  authorFilter: "all",
  sliceFilter: null,
  focusedRound: null,
  showFailedOnly: false,
  showFutureVariants: false,
  layoutDirection: "TB",
};

type Actions = Pick<
  ViewState,
  | "setGraph"
  | "selectBakeoff"
  | "selectNode"
  | "setShowRejected"
  | "setShowBestPathOnly"
  | "setAuthorFilter"
  | "setSliceFilter"
  | "setFocusedRound"
  | "setShowFailedOnly"
  | "setShowFutureVariants"
  | "setLayoutDirection"
>;

export const useViewStore = create<ViewState>((set) => ({
  ...DEFAULTS,
  setGraph: (graph) => set({ graph }),
  selectBakeoff: (id) => set({ selectedBakeoffId: id, selectedNodeId: null }),
  selectNode: (id) => set({ selectedNodeId: id }),
  setShowRejected: (v) => set({ showRejected: v }),
  setShowBestPathOnly: (v) => set({ showBestPathOnly: v }),
  setAuthorFilter: (v) => set({ authorFilter: v }),
  setSliceFilter: (v) => set({ sliceFilter: v }),
  setFocusedRound: (v) => set({ focusedRound: v }),
  setShowFailedOnly: (v) => set({ showFailedOnly: v }),
  setShowFutureVariants: (v) => set({ showFutureVariants: v }),
  setLayoutDirection: (v) => set({ layoutDirection: v }),
}));

// URL sync ------------------------------------------------------------------

const URL_KEYS = [
  "bakeoff",
  "node",
  "rejected",
  "bestPath",
  "author",
  "slice",
  "round",
] as const;

export function hydrateFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const store = useViewStore.getState();
  const bakeoff = params.get("bakeoff");
  if (bakeoff) store.selectBakeoff(bakeoff);
  const node = params.get("node");
  if (node) store.selectNode(node);
  const rejected = params.get("rejected");
  if (rejected !== null) store.setShowRejected(rejected === "1");
  const bestPath = params.get("bestPath");
  if (bestPath !== null) store.setShowBestPathOnly(bestPath === "1");
  const author = params.get("author") as ViewState["authorFilter"] | null;
  if (author) store.setAuthorFilter(author);
  const slice = params.get("slice");
  if (slice) store.setSliceFilter(slice);
  const round = params.get("round");
  if (round) store.setFocusedRound(Number(round));
  const unscored = params.get("unscored") ?? params.get("future");
  if (unscored !== null) store.setShowFutureVariants(unscored === "1");
}

export function subscribeUrlSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const write = (state: ViewState) => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (k: string, v: string | null | undefined) => {
      if (v === null || v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    };
    setOrDelete("bakeoff", state.selectedBakeoffId);
    setOrDelete("node", state.selectedNodeId);
    setOrDelete("rejected", state.showRejected ? "1" : "0");
    setOrDelete("bestPath", state.showBestPathOnly ? "1" : "0");
    setOrDelete(
      "author",
      state.authorFilter === "all" ? null : state.authorFilter,
    );
    setOrDelete("slice", state.sliceFilter);
    setOrDelete(
      "round",
      state.focusedRound === null ? null : String(state.focusedRound),
    );
    setOrDelete("unscored", state.showFutureVariants ? "1" : null);
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? "?" + qs : ""}`;
    window.history.replaceState({}, "", newUrl);
  };
  return useViewStore.subscribe(write);
}

// Keep URL_KEYS referenced for dev clarity even though this list is not currently
// used at runtime (hydrateFromUrl reads by name directly).
void URL_KEYS;

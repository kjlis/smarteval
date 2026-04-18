# Runs Graph Viz — Phase 1 Plan

Collaborative plan for a React/Astro graph visualization of smarteval eval runs. Each agent owns a section below.

---

## Dev-Ops

Owner: `dev-ops`

### Project location & layout

- New Astro project at repo-root `web/` (sibling of `src/`, `docs/`, `examples/`). Keeps Python package untouched; all Node tooling lives under `web/`.
- Proposed tree:
  ```
  web/
  ├── package.json
  ├── package-lock.json
  ├── .nvmrc                     # pin Node version
  ├── .gitignore                 # web-local ignores
  ├── astro.config.mjs
  ├── tsconfig.json
  ├── playwright.config.ts
  ├── public/
  │   └── data/                  # gitignored, populated by `smarteval graph export`
  ├── src/
  │   ├── components/            # React islands (graph, inspector, legend, filters)
  │   ├── pages/                 # Astro pages
  │   ├── lib/                   # data loaders, types, transformers
  │   └── styles/
  ├── tests/
  │   └── e2e/                   # playwright specs
  ├── PLAN.md
  └── README.md
  ```

### Tooling choices

- **Package manager:** `npm` (ubiquitous, no extra install step for contributors; lockfile is committed).
- **Node version:** pin `20.x` via `web/.nvmrc` (Astro 4+ requires >=18.17; 20 LTS is the safe default). `engines` in `package.json` mirrors this.
- **TypeScript:** strict. `tsconfig.json` extends `astro/tsconfigs/strict`.
- **Formatting/linting:** rely on Astro defaults + Prettier via `prettier` + `prettier-plugin-astro`. No ESLint in v1 (keeps dep count low; revisit if we grow).

### Data-access strategy

**Recommendation: Python CLI `smarteval graph export` that emits a single `graph.json`**, consumed at Astro build time via a TypeScript loader.

Rationale:
- `.smarteval/` contains heterogeneous JSONL + nested run directories. Doing that parsing in TypeScript duplicates logic that already lives (or should live) in the Python package — better to do it once, in Python, and ship a stable typed JSON contract.
- Decouples the web app from the on-disk ledger layout so future changes to `.smarteval/` structure only touch the exporter.
- Works in both dev (watch exporter) and CI / deploy (run exporter once, build static site).
- Astro + `import graph from '../../public/data/graph.json'` at build time → zero runtime fetch, fully static output.

Fallback (if the Python CLI can't ship in time): a Node-side loader under `web/src/lib/data/` that reads `../examples/asr_manifest/.smarteval/**` at build time via `fs` inside an Astro endpoint or content collection. Acceptable for MVP demo pointed at the ASR example, but the CLI path is strongly preferred.

Default data source path (configurable): `../examples/asr_manifest/.smarteval/` resolved relative to `web/`, overridable via `SMARTEVAL_DATA_DIR` env var for the exporter and via a build-time constant for the fallback loader.

### `graph.json` schema (proposed, for react-principal to refine)

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-18T...",
  "bakeoffs": [
    {
      "id": "2026-04-18T13-34-21__2026-0",
      "label": "round 5 rerun",
      "round": 5,
      "optimizationRunId": "2026-04-18T13-24-37",
      "evaluatorFingerprint": "7a2f91e3c8b4",
      "goldenHash": "d1e9f2..."
    }
  ],
  "variants": [
    {
      "id": "baseline",
      "parentId": null,
      "rationale": "...",
      "diff": { /* ... */ },
      "perBakeoff": {
        "<bakeoffId>": {
          "runCount": 10,
          "passRate": 0.7,
          "meanScore": 0.36,
          "meanScoreCi": [0.30, 0.42],
          "deltaVsBaseline": 0.0,
          "deltaVsBaselineCi": [-0.04, 0.04],
          "failedRunCount": 0,
          "sampleErrors": [],
          "meanDurationMs": 2100,
          "meanCostUsd": 0.02,
          "inImprovementTrace": true,
          "isWinner": false
        }
      }
    }
  ],
  "proposals": [
    {
      "proposalId": "...",
      "parentVariantId": "baseline",
      "status": "rejected_semantic_duplicate",
      "rationale": "...",
      "diff": {},
      "similarity": 0.91,
      "duplicateOfVariantId": "..."
    }
  ],
  "edges": [
    { "kind": "accepted", "from": "baseline", "to": "baseline-proposal-...-1", "proposalId": "...", "rationale": "...", "deltaVsParentByBakeoff": { "<bakeoffId>": 0.16 } },
    { "kind": "rejected", "from": "baseline", "to": "proposal:<proposalId>", "proposalId": "...", "reason": "semantic_duplicate" }
  ],
  "improvementTraces": {
    "<bakeoffId>": [
      {
        "parentVariantId": "baseline",
        "variantId": "...",
        "rationale": "...",
        "hypothesis": "...",
        "judgeJustification": "...",
        "changes": [
          { "fieldPath": "params.prompt", "before": "...", "after": "...", "summary": "tightened system preamble" }
        ],
        "deltaVsParent": 0.16,
        "deltaVsBaseline": 0.16
      }
    ]
  },
  "optimizationRuns": [
    { "id": "2026-04-18T13-24-37", "rounds": [ /* passthrough of optimization-runs/<id>.json contents */ ] }
  ]
}
```

Notes on react-principal's ask-backs (all accepted and folded in above):
- BakeoffMeta now carries `evaluatorFingerprint`, `goldenHash`, `round`, `optimizationRunId`.
- Rejected edges are pre-materialized with `kind:"rejected"` and target `proposal:<proposalId>`.
- `perBakeoff` stats block expanded to full `VariantBakeoffStats` including CIs, duration, cost.
- `improvementTraces` keyed by bakeoffId; each step carries `hypothesis`, `judgeJustification`, and `changes[]` with `fieldPath/before/after/summary`.
- `optimizationRuns[]` is a passthrough of `optimization-runs/*.json` with filename stem as `id`.
- No per-variant `shortLabel` — client-side derivation as requested.
- Accepted edges now carry `deltaVsParentByBakeoff: { <bakeoffId>: number }` so ui-expert's mid-edge Δ badge renders without a cross-ref to `improvementTraces`.
- `perBakeoff[<bakeoffId>].isWinner: boolean` — exporter picks `max(meanScore)` per bakeoff; ties broken by earliest `created_at` from `ledger/variants.jsonl`.
- Proposal `status` values in `graph.json` are verbatim strings from `ledger/proposals.jsonl` (`accepted`, `rejected_exact_duplicate`, `rejected_semantic_duplicate`).

### Dependencies to install during scaffold

Consolidated from all sections:
- Runtime: `astro`, `@astrojs/react`, `@astrojs/tailwind`, `react`, `react-dom`, `@xyflow/react` (v12), `@dagrejs/dagre`, `dagre`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`, `lucide-react`, `tailwindcss`, `postcss`, `autoprefixer`, `typescript`.
- Dev: `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/dagre`, `prettier`, `prettier-plugin-astro`, `@astrojs/check`.

Additions from ux-expert get appended before `npm install` in Phase 2.

### Scaffold responsibilities (who creates which files)

Dev-ops creates (empty or stub) during scaffold so other agents can fill in:
- `web/src/styles/tokens.css` (ui-expert owns contents — dark/light CSS var blocks)
- `web/src/styles/global.css` (ui-expert owns — imports tokens.css + tailwind directives)
- `web/tailwind.config.ts` (ui-expert owns — theme tokens referencing CSS vars)
- `web/postcss.config.mjs`
- `web/src/layouts/` — base Astro layout with hardcoded `<html data-theme="dark">` (ui-expert's theme toggle rewrites + persists).

Astro integration config: `integrations: [react(), tailwind({ applyBaseStyles: false })]` so ui-expert's `tokens.css` is the first layer in the cascade.

Python side: add `src/smarteval/cli/graph_export.py` (wired into `smarteval.cli.main`) that walks `.smarteval/` relative to `smarteval.yaml` and writes `<out>/graph.json`. Default `<out>` is `web/public/data/graph.json` when run from repo root; overridable with `--output`.

### Scripts (`web/package.json`)

```jsonc
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "export-data": "cd .. && python -m smarteval graph export --config examples/asr_manifest/smarteval.yaml --output web/public/data/graph.json",
    "prebuild": "npm run export-data",
    "predev": "npm run export-data",
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:install": "playwright install --with-deps chromium"
  }
}
```

Design goals:
- **Single command to run:** `cd web && npm install && npm run dev` — `predev` regenerates `graph.json`.
- **Single command to test:** `cd web && npm run test:install && npm run build && npm run test` (playwright runs against `astro preview` via `webServer` config).

### Live-optimization watch mode (ux-expert ask)

Plan: ship an opt-in `npm run dev:watch` in Phase 2 if cheap. Approach: add a small Python `smarteval graph watch` that polls `.smarteval/**` mtimes (or uses `watchdog` if available) and re-emits `graph.json` on change; Astro's dev server already triggers HMR when `public/data/graph.json` changes, so no client changes needed.

Tradeoff: adding `watchdog` pulls in a runtime dep. If we want to avoid that, polling every 1s is fine for a dev-only command. Default mode stays one-shot `export`; `--watch` is explicit.

I will not block Phase 2 on this — plain `predev` ships first, `--watch` is a follow-up within Phase 2 if the core graph is stable early.

### shortLabel (ux-expert ask)

Client-side derivation confirmed (react-principal's call too). Exporter stays lean.

### Playwright setup

- `@playwright/test` as dev dep; `playwright.config.ts` pins chromium-only for v1 (faster CI, good enough for SPA).
- `webServer` in config runs `npm run preview -- --port 4321 --host` so tests hit a built bundle, matching prod behavior.
- Browsers installed via `npx playwright install --with-deps chromium` (documented; not auto-run on `npm install` to avoid slowing first-time installs).
- Tests live under `web/tests/e2e/`. Shared fixtures in `web/tests/fixtures.ts`.
- Baseline test list (to be fleshed out by ui-expert / react-principal):
  - app loads, graph SVG/canvas renders >0 variant nodes
  - run selector changes URL + updates node score labels
  - clicking a variant node opens the inspector panel with the right id
  - best-path toggle highlights the correct edges
  - filter (e.g. hide rejected proposals) removes the rejected nodes from the DOM
  - dark theme applied: `document.documentElement.dataset.theme === "dark"`, computed `--bg-canvas === #0D1117`
  - light theme applied: same assertion with `"light"` and `#FAFAF7`
  - Δ badge text content format matches `/^[+−]0\.\d{2}$/` or `—`

### `.gitignore` additions

Repo-root `.gitignore` gains:
```
web/node_modules/
web/dist/
web/.astro/
web/public/data/         # generated graph.json — do not commit
web/playwright-report/
web/test-results/
web/.env
```

`web/.gitignore` (local to the web project) mirrors the above scoped to its directory for clarity.

### CI-like verification flow

Locally-runnable script that mirrors what CI would do (no CI config committed in v1 — leave to follow-up):

```bash
cd web
nvm use                                 # pin Node
npm ci
npm run export-data                     # requires Python env w/ smarteval installed
npm run build
npm run test:install
npm run test
```

If the user requests a CI workflow later, this is ready to drop into a GitHub Actions job.

### Open infra questions for the team

1. **Exporter ownership:** I'll stub `smarteval graph export` so the web side has a stable contract to code against. react-principal — tell me now if you need additional fields in `graph.json` beyond what's sketched above.
2. **Default data target:** examples/asr_manifest is the only example with real proposal/ledger data. Confirm we point the default build at it. If the user has a preferred demo dataset, swap here.
3. **Astro output mode:** `static` (recommended — deploys as plain files, fastest, matches "no server" posture of smarteval). Switch to `server` only if we later need runtime file watching. ui-expert — flag any feature that'd need SSR.
4. **Graph library install:** I'll install whichever library react-principal picks. No preference from infra side beyond "must bundle cleanly in Astro islands" — React Flow, Cytoscape, Sigma all do.

---

## React / Data (react-principal)

Owner: `react-principal`

Aligned with `dev-ops`'s choices: Astro + React islands at `web/`, npm, Node 20, TypeScript strict, Playwright e2e, and **Python CLI `smarteval graph export` writes `web/public/data/graph.json`**. This section fills in everything that lives inside React.

### Stack inside the islands

- **React 18** (not 19) — aligned with `@xyflow/react` v12 peer range.
- **Zustand** for client state. Light, no provider tree, easy to sync to URL.
- **Vitest + @testing-library/react** for unit/component tests alongside dev-ops's Playwright e2e.
- No CSS-in-JS; plain CSS Modules (Astro-friendly, zero runtime). `ui-expert` owns tokens.

### Graph library choice

**Pick: React Flow (`@xyflow/react` v12) + `@dagrejs/dagre` for static layout.**

Why:
- JSON-first node/edge model that maps 1:1 onto dev-ops's `graph.json` `edges` array.
- First-class React component nodes — our variant nodes are rich cards (id, score, delta bar, status chip, round badge) and rejected-proposal nodes are visually distinct. React Flow lets `ui-expert` style them as plain React components. Cytoscape forces us through canvas stylesheets; Sigma is WebGL-first and hostile to rich node UIs.
- Built-in pan/zoom/minimap/controls — zero-work wins.
- Dagre computes hierarchical top-down layout (baseline at top, generations flowing down), matching the "best path from baseline to winner" mental model in `docs/graph.md`.
- Bundles cleanly in Astro islands (`client:only="react"` on the app component).

Scale: the `asr_manifest` example has ~16 variants + ~15 proposals. React Flow handles thousands before we need to worry. If a project ever exceeds ~5k nodes, we swap the renderer to Sigma without touching the data model (graph-building is pure, decoupled from rendering).

Rejected alternatives: Cytoscape (rich-node UI pain), Sigma (WebGL-first, custom nodes expensive), vanilla D3 (we'd build half of React Flow ourselves), elkjs only (great layout, still need a renderer).

Layout: dagre `TB`, initial `nodesep=80 / ranksep=120`, tuned with `ui-expert`. Positions computed once per graph-build; cached across filter toggles.

### TS types (web/src/lib/types.ts)

Contract types (mirror dev-ops's `graph.json`):

```ts
export interface GraphExport {
  schemaVersion: 1;
  exportedAt: string;
  projectName?: string;
  baselineVariantId: string;               // from config.baseline
  bakeoffs: BakeoffMeta[];
  variants: VariantRecord[];
  proposals: ProposalRecord[];
  edges: GraphEdgeRaw[];
  improvementTraces: Record<string, ImprovementTrace[]>;  // by bakeoffId
  optimizationRuns: OptimizationRun[];
}

export interface BakeoffMeta {
  id: string;                              // e.g. "2026-04-18T13-34-21__2026-0"
  label: string;                           // human-friendly, built by exporter
  generatedAt: string;
  round: number | null;                    // from optimization-run membership if any
  optimizationRunId: string | null;
  evaluatorFingerprint: string;
  goldenHash: string;
}

export interface VariantRecord {
  id: string;
  parentId: string | null;
  author: "framework" | "proposer" | "human" | string;
  hypothesis: string | null;
  rationale: string | null;
  diff: Record<string, unknown>;
  createdAt: string;
  perBakeoff: Record<string, VariantBakeoffStats>;
}

export interface VariantBakeoffStats {
  runCount: number;
  passRate: number;
  meanScore: number;
  meanScoreCiLow: number;
  meanScoreCiHigh: number;
  deltaVsBaseline: number | null;
  deltaCiLow: number | null;
  deltaCiHigh: number | null;
  failedRunCount: number;
  sampleErrors: string[];
  meanDurationMs: number;
  meanCostUsd: number;
  inImprovementTrace: boolean;
}

export interface ProposalRecord {
  proposalId: string;
  parentVariantId: string;
  status:
    | "accepted"
    | "rejected_exact_duplicate"
    | "rejected_semantic_duplicate";
  materializedVariantId: string | null;
  rationale: string;
  expectedSlice: string | null;
  diff: Record<string, unknown>;
  duplicateOfVariantId: string | null;
  similarity: number | null;
  sourceRunDir: string;
  createdAt: string;
}

export interface GraphEdgeRaw {
  kind: "accepted" | "rejected";
  from: string;                            // parentVariantId
  to: string;                              // variantId | "proposal:<proposalId>"
  proposalId: string | null;
  rationale: string | null;
  reason?: string;                         // for rejected
}

export interface ImprovementTrace {
  parentVariantId: string;
  variantId: string;
  rationale: string;
  hypothesis: string | null;
  judgeJustification: string | null;
  deltaVsParent: number | null;
  deltaVsBaseline: number | null;
  changes: FieldChange[];
}

export interface FieldChange {
  fieldPath: string;
  before: unknown;
  after: unknown;
  summary: string;
}

export interface OptimizationRun {
  id: string;                              // filename stem
  initialRunDir: string;
  finalRunDir: string;
  initialBestVariantId: string;
  initialBestMeanScore: number;
  roundsCompleted: number;
  rounds: OptimizationRound[];
}

export interface OptimizationRound {
  round: number;
  sourceRunDir: string;
  queuedRunDir: string | null;
  status: string;
  proposalCount: number;
  rejectedProposalCount: number;
  proposalParentIds: string[];
  queuedVariantIds: string[];
  bestVariantId: string | null;
  bestMeanScore: number | null;
}
```

Derived client-side graph model (what the renderer consumes):

```ts
export interface GraphData {
  nodes: AnyNode[];
  edges: AnyEdge[];
  bestPathNodeIds: Set<string>;
  bestPathEdgeIds: Set<string>;
}

export type AnyNode = VariantNode | ProposalNode | RunRootNode;

export interface RunRootNode {
  kind: "run_root";
  id: string;                    // "run-root:<bakeoffId>"
  bakeoffId: string;
  label: string;                 // BakeoffMeta.label
  generatedAt: string;
  evaluatorFingerprint: string;
  goldenHash: string;
  round: number | null;
  optimizationRunId: string | null;
  variantCount: number;
  winnerVariantId: string | null;
  baselineMeanScore: number | null;
}

export interface VariantNode {
  kind: "variant";
  id: string;
  parentId: string | null;
  label: string;                 // short label derived from id
  fullId: string;
  rationale: string | null;
  hypothesis: string | null;
  author: string;
  diff: Record<string, unknown>;
  createdAt: string;

  // enriched from the selected bakeoff:
  stats: VariantBakeoffStats | null;
  outcome: VariantOutcome;
  isBaseline: boolean;
  isWinner: boolean;             // best meanScore in current bakeoff
  isOnBestPath: boolean;
  roundBadge: number | null;     // "R3 winner" if this variant was the winner of a round
}

export type VariantOutcome =
  | "baseline"
  | "winner"
  | "improved"         // deltaVsBaseline > 0.05
  | "improved_mild"    // 0 < deltaVsBaseline <= 0.05
  | "regressed"        // deltaVsBaseline < -0.05
  | "regressed_mild"   // -0.05 <= deltaVsBaseline < 0
  | "failed"           // failedRunCount > 0
  | "unscored"         // meanScore is null
  | "unknown";         // variant not present in selected bakeoff (ghost ancestor)

export interface ProposalNode {
  kind: "proposal_rejected";
  id: string;                    // "proposal:<proposalId>"
  proposalId: string;
  parentVariantId: string;
  label: string;
  status: Exclude<ProposalRecord["status"], "accepted">;
  rationale: string;
  diff: Record<string, unknown>;
  duplicateOfVariantId: string | null;
  similarity: number | null;
  createdAt: string;
}

export type AnyEdge = AcceptedEdge | RejectedEdge;

export interface AcceptedEdge {
  kind: "accepted";
  id: string;
  source: string;
  target: string;
  proposalId: string | null;
  rationale: string | null;
  changedFields: string[];
  deltaVsParent: number | null;
  isOnBestPath: boolean;
}

export interface RejectedEdge {
  kind: "rejected";
  id: string;
  source: string;
  target: string;                // proposal node id
  status: ProposalNode["status"];
}
```

### Graph-building pipeline (pure)

```
GraphExport + selectedBakeoffId
  → buildVariantBackbone(export)              // nodes from variants[], edges from accepted edges[]
  → enrichWithBakeoffStats(backbone, bakeoff) // fill perBakeoff stats into each VariantNode
  → addRejectedProposals(graph, export)       // add ProposalNodes + rejected edges, respecting filters
  → markBestPath(graph, improvementTraces)    // flag nodes+edges for overlay
  → annotateRoundBadges(graph, optRun)        // tag variants that were a round's winner
  → layoutGraph(graph)                        // dagre positions
  → GraphData (React Flow ready)
```

Each function is pure, typed, and unit-tested against fixtures copied verbatim from `examples/asr_manifest/.smarteval/`.

### Component tree

```
src/pages/index.astro
└── <GraphApp />                        (React island, client:only="react")
    ├── <TopBar>
    │   ├── <RunSelector />             (UX owned by ux-expert)
    │   ├── <FilterControls />          (show/hide rejected, author filter, layout dir)
    │   └── <BestPathToggle />
    ├── <GraphCanvas>                   (React Flow wrapper)
    │   ├── nodeTypes.variant = <VariantNodeCard />
    │   ├── nodeTypes.proposal_rejected = <ProposalNodeCard />
    │   ├── edgeTypes.accepted = <AcceptedEdge />
    │   ├── edgeTypes.rejected = <RejectedEdge />
    │   ├── <BestPathOverlay />         (applies style to flagged edges)
    │   ├── <Minimap />
    │   ├── <ZoomControls />
    │   └── <Legend />                  (floating bottom-left)
    └── <NodeInspector />               (right side panel, slides in)
        ├── <VariantInspector />
        ├── <ProposalInspector />
        └── <DiffViewer />              (pretty-prints the diff object)
```

Ownership split:
- `react-principal`: all component shells, data wiring, state, graph building, perf.
- `ui-expert`: visual styling, tokens, typography, animation, iconography, legend graphics.
- `ux-expert`: inspector content spec, selector spec, interaction spec (hover / click / keyboard / a11y).

### State management

Zustand store, URL-synced:

```ts
// web/src/state/store.ts
interface ViewState {
  graph: GraphExport | null;            // set once on mount

  selectedBakeoffId: string | null;     // null = latest
  selectedNodeId: string | null;

  showRejected: boolean;                // default true
  showBestPathOnly: boolean;            // default false
  authorFilter: "all" | "framework" | "proposer" | "human";
  layoutDirection: "TB" | "LR";

  sliceFilter: string | null;           // URL-backed, per-slice score overlay
  focusedRound: number | null;          // URL-backed, filter to one optimization round
  showFailedOnly: boolean;              // session-local
  showFutureVariants: boolean;          // default false; greys-out variants newer than selected bakeoff

  // actions
  selectBakeoff(id: string | null): void;
  selectNode(id: string | null): void;
  setShowRejected(v: boolean): void;
  setShowBestPathOnly(v: boolean): void;
  setAuthorFilter(v: ViewState["authorFilter"]): void;
  setSliceFilter(v: string | null): void;
  setFocusedRound(v: number | null): void;
  setShowFailedOnly(v: boolean): void;
  setShowFutureVariants(v: boolean): void;
}
```

URL is the source of truth for shareable state:
- `/?bakeoff=<id>&node=<id>&rejected=1&bestPath=0&author=all&slice=<name>&round=<n>`
- `useUrlSync()` hook: parse on mount, write-through on every store action, back/forward works.

Derived state (memoized selectors):
- `selectBakeoff(state)` → `BakeoffMeta`
- `selectGraphData(state)` → `GraphData` (memo on graph export version + bakeoff id + filters)
- `selectInspectedNode(state)` → `AnyNode | null`

### Data loading

Agree with dev-ops:
1. `smarteval graph export` writes `web/public/data/graph.json` (dev-ops's `predev`/`prebuild` hook).
2. Astro page imports it at build time: `import graph from "../../public/data/graph.json"` → passed into `<GraphApp graph={graph} />` as a prop.
3. Multi-project support (deferred): if the exporter writes `web/public/data/<project>/graph.json`, the index page lists projects from a generated manifest. Not blocking for v1.

First paint: Astro ships a static page with a loading shell; React island hydrates with the embedded graph, builds the derived model (<10ms for expected sizes), renders React Flow. No runtime fetch on the happy path.

### Performance

- Graph-build memoized on `(exportIdentity, selectedBakeoffId, showRejected, authorFilter)`.
- Node positions cached per graph-build hash — filter toggles do not re-layout if the node set is unchanged (we reapply CSS-only overlays).
- Custom node/edge components wrapped in `React.memo` with stable prop equality.
- React Flow configured with `nodesDraggable={false}`, `elementsSelectable={true}`, `panOnScroll`, `zoomOnPinch`.
- Inspector content is lazy — diff viewer only renders when the panel is open.
- Avoid unnecessary re-renders by selecting minimal slices of Zustand state per component.

### Testing (React side)

- **Unit (Vitest):** each graph-build function against fixture files in `web/tests/fixtures/asr_manifest/graph.json` (copied from a real exporter run).
- **Component (@testing-library/react):** inspector panels, run selector, filter controls.
- **E2E (Playwright, dev-ops owns config):** flows listed in dev-ops's section + a "select earlier bakeoff ⇒ node count shrinks" flow and a "keyboard select node ⇒ inspector focuses" flow.

### Open questions / asks to teammates

- `dev-ops`: confirm the exporter emits the `perBakeoff` map keyed by `BakeoffMeta.id`, and includes `evaluatorFingerprint` / `goldenHash` per bakeoff. Also confirm rejected-proposal edges are pre-materialized in `edges[]` (saves us a client-side join).
- `dev-ops`: short-label derivation — do you want the exporter to emit a `shortLabel` per variant (last segment of the id), or should we derive client-side? Either works; client-side keeps the schema smaller.
- `ux-expert`: default-selected bakeoff — latest by `generatedAt`, final from the most recent optimization run, or initial baseline? My tentative default: latest by `generatedAt`.
- `ux-expert`: when an earlier bakeoff is selected, hide variants that didn't exist yet or show them greyed out? Tentative: hide (keeps the graph readable), with a toggle to "show future variants" in filters.
- `ui-expert`: initial node sizes I'll code to — variant ~220x100, proposal ~180x64. Override freely.
- All: visualize optimization-runs as a separate timeline, or suffice with a round badge on variant nodes + inspector detail? My proposal: round badge in v1; separate timeline view is Phase-2+.

---

## UX (ux-expert)

Owner: `ux-expert`. Defines who the viewer is, what questions they're answering, and what the
app must make easy vs deep.

### Target user and primary questions

The only user in v1 is an ML/eval researcher inspecting their own runs — the repo owner or a
collaborator. Technically fluent, already understands the smarteval mental model (variant,
proposal, bakeoff, optimization round), working on their own laptop against a local
`.smarteval/` directory.

They open the app to answer, in descending frequency:

1. **"What's my current best variant and how did we get there?"** — winner + best path from baseline.
2. **"Which proposals improved over baseline, which regressed, which failed?"** — outcome distribution.
3. **"What got rejected and why?"** — duplicate detection is working / not; am I in a semantic loop?
4. **"How did a multi-round optimization evolve?"** — per-round best, when did it plateau or regress.
5. **"What exactly changed between parent and child?"** — diff-level inspection.
6. **"Where did failures happen?"** — variants with `failed_run_count > 0` and their sample errors.

If a v1 feature doesn't serve one of those six questions, cut it.

### User stories (MVP)

- **US-1 Winner at a glance.** Opening a bakeoff, I immediately see baseline, the current winner,
  and the best path between them highlighted.
- **US-2 Outcome scan.** I can visually distinguish improved / regressed / failed / rejected
  variants without reading labels.
- **US-3 Inspect variant.** Click any variant, see id, rationale, parent, diff vs parent, mean
  score, delta vs baseline, failed run count, and (if applicable) sample errors.
- **US-4 Inspect rejected proposal.** Click a rejected proposal, see rejection reason, similarity
  score, duplicate target, the diff, and the parent it would have branched from.
- **US-5 Multi-round walk.** For an optimization session, step through rounds, see which variants
  were queued, which won, and how the best score moved.
- **US-6 Switch runs.** Switch between bakeoffs / optimization sessions from a persistent selector
  without losing layout context.
- **US-7 Link to a node.** Deep-link to run + selected node via URL so I can share what I'm looking at.

Non-goals v1: editing, re-running, promoting, annotating, auth, collaboration, uploads,
cross-config comparisons.

### Core flows

**Flow A — Open app, understand the latest run.** Lands on root URL. App auto-selects the most
recent run (optimization session if any exists, otherwise latest bakeoff). Graph centered on
baseline, best path highlighted by default, inspector closed, legend visible.

**Flow B — Inspect a specific branch.** Click a non-winning variant. Inspector opens on the right
with full metadata + diff vs parent. Graph dims non-ancestor nodes to ~25%. `Esc` closes.

**Flow C — Understand rejections.** "Show rejected proposals" default on. Each parent variant
shows rejected attempts branching off. Click a rejected node → inspector shows "rejected:
semantic duplicate of X (similarity 0.87)" — duplicate target id is clickable, centers/selects
that node.

**Flow D — Walk an optimization session.** Selecting an `optimization-runs/*.json` session
switches layout to column-per-round. A round stepper appears (`← Round 1 of 5 →`). Stepping
focuses that round's queued variants and highlights the round winner. A sparkline at the top
shows best-score-over-rounds.

**Flow E — Dig into a failure.** Red failed node → inspector shows `failed_run_count` and first 3
`sample_errors` (monospace, truncated, expandable). User copies an error string.

### Information architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Header: run selector | view mode | filters | keyboard help   │
├───────────────────────────────────────────┬──────────────────┤
│                                           │                  │
│            Graph canvas                   │   Inspector      │
│         (dagre top-down by default)       │   (collapsible)  │
│                                           │                  │
│  Legend (bottom-left, collapsible)        │                  │
└───────────────────────────────────────────┴──────────────────┘
```

- **Header (always visible):** run selector, view-mode toggle (Bakeoff / Optimization), best-path
  toggle, show-rejected toggle, slice filter, `?` opens keyboard-shortcuts overlay.
- **Graph canvas:** fills remaining space. Pan/zoom.
- **Inspector:** right side, ~360–480 px wide, collapsible. Closed on initial load.
- **Legend:** bottom-left corner, collapsible.
- **Status bar (optional):** "12 variants · 4 rejected · winner: baseline-...-2 (+0.40)".

### Run selector spec

Header, left-aligned. Single combobox with grouping (strongly preferred over two widgets given
the shared timestamp convention):

```
[ Run ▼ ]
├── Optimization Sessions
│    └── 2026-04-18T13-24-37  (5 rounds, best 0.76, baseline 0.36)      [OPT]
├── Bakeoffs
│    ├── 2026-04-18T13-34-21  (4 variants, winner +0.40)                [BAK]
│    ├── 2026-04-18T13-32-04  (4 variants, winner +0.10)
│    └── 2026-04-18T13-30-04  ...
```

Requirements:
- Grouped by type; optimization sessions listed first (richer context).
- Each entry shows timestamp, quick-summary (variant count, winner delta), type badge.
- Sorted newest first within each group.
- Selecting an optimization session auto-switches view mode to Optimization; bakeoff → Bakeoff.
- Keyboard: `/` focuses selector; arrows navigate; Enter selects.
- If only one bakeoff and no optimization sessions exist, collapse to a read-only label (no
  dropdown UI) — don't make users click to confirm the only option.

**Reply to react-principal Q (default run):** most recent optimization session if one exists,
otherwise latest bakeoff by `generatedAt`. The researcher's most common "what just happened?"
context is an optimization loop.

**Reply to react-principal Q (earlier bakeoff selected):** **hide** variants that didn't exist
yet by default — keeps the graph readable and matches "what did I know at the time". Offer a
"show future variants" filter toggle that reveals them as ghosted.

### Node-inspector spec

The inspector is the density hotspot. Content varies by node type. All layouts use a vertical
scroll column with sticky header (id + close + copy-id).

**Variant node (baseline, winner, improved, regressed, failed):**
1. **Header:** variant id (monospace, click to copy), outcome badge (Baseline / Winner /
   Improved +0.10 / Regressed −0.05 / Failed), close button.
2. **Score block:** mean_score (large), delta_vs_baseline, delta_vs_parent, pass_rate, CI
   bounds (small), run_count. `—` for null fields.
3. **Rationale:** `rationale` verbatim (italic, wrapped). If `hypothesis` exists, pill above.
4. **Diff vs parent:** table of `field_path | before | after`, from
   `improvement_traces.steps[*].changes` when available, otherwise from raw `diff`. Long values
   truncate with "show full" expander. Copy-diff-as-json button at top-right.
5. **Parent:** clickable parent id → selects parent node.
6. **Children:** compact list of child variant ids + their delta_vs_parent. Click to select.
7. **Failures** (only if `failed_run_count > 0`): count + first 3 `sample_errors` (monospace,
   truncated, expandable). Show `by_case` JSONL path as copyable text (no file reader v1).
8. **Per-slice scores** (collapsed by default): `slice | mean_score | delta_vs_baseline` from
   `summary.per_slice` filtered to this variant.

**Rejected proposal node:**
1. **Header:** proposal_id, rejection badge (`Exact duplicate` / `Semantic duplicate`), close.
2. **Rejection reason:** "Rejected as semantic duplicate of [variant-id] (similarity 0.87)" —
   duplicate target is clickable and centers that node.
3. **Would-be parent:** clickable `parent_variant_id`.
4. **Rationale.** 5. **Diff proposed.** 6. **Expected slice.** 7. **Source run dir** as copyable
   text (no link v1).

**Bakeoff / optimization session root (virtual node — react-principal: please emit one so the
inspector treats it uniformly with variants/proposals):**
1. Header: run id, type badge.
2. Summary stats: total variants, accepted, rejected, failed, winner id, winner delta.
3. If optimization: rounds completed/requested, initial best, final best, per-round best-score
   sparkline.
4. Config fingerprint: `evaluator_fingerprint`, `golden_hash` (monospace, copyable).
5. Link to `summary.md` if dev-ops makes it cheap; else omit.

Inspector is read-only v1.

### Interaction model

Mouse:
- **Hover node:** subtle highlight + tooltip `id + mean_score + delta_vs_baseline` after ~300 ms.
  Tooltip never replaces the inspector.
- **Click node:** select; open inspector; dim non-ancestor/non-descendant nodes to ~25%.
- **Click background:** clear selection; close inspector; undim.
- **Drag:** pan. **Wheel / pinch:** zoom.
- **Shift-click node:** add to selection (placeholder for future compare; v1 uses last-clicked
  for inspector).
- **Click edge:** transient card at edge midpoint with proposal rationale.

Keyboard (all required):
- `/` — focus run selector
- `b` — toggle best-path overlay
- `r` — toggle rejected-proposals visibility
- `f` — fit graph to viewport
- `Esc` — close inspector / clear selection
- `?` — keyboard-shortcuts overlay
- Arrow keys with node selected: `↑` parent, `↓` first child (creation order), `←`/`→` sibling.
  In optimization view with nothing selected, `←`/`→` step rounds.
- `Cmd/Ctrl+C` with node selected copies its id.

Selection + URL (URL is source of truth, per react-principal): `selectedRunId`, `selectedNodeId`,
`showBestPath`, `showRejected`, `sliceFilter`, `focusedRound` all URL-backed. Reload preserves.
Sharing a URL lands a peer on the same view.

### Empty states and edge cases

- **No `.smarteval/` data at all.** "No smarteval runs found. Run `smarteval bakeoff` (or
  `python scripts/optimize_loop.py`) to generate data, then reload." If `?example=asr` is
  supported (dev-ops call), mention as a hint.
- **Single baseline run, zero proposals, zero rejections.** Baseline alone, centered. Inspector
  auto-opens with banner: "No proposals yet. Run `smarteval propose` to generate candidates."
  Best-path toggle disabled with tooltip explaining why.
- **Bakeoff with no winners (all deltas ≤ 0).** Winner badge becomes "No winner — baseline
  still best". Best-path toggle hidden.
- **All-rejected round.** No accepted variants; rejected nodes are that round's output. Round
  stepper reads "0 accepted · 3 rejected".
- **Historical ancestor missing from current bakeoff scores** (per `docs/graph.md`): muted /
  ghost style (`outcome: "unknown"` in react-principal's types) + "score not recomputed in this
  bakeoff" note in inspector.
- **Deep chains (5+ rounds).** Vertical overflow via scroll/pan; auto-fit on load shows baseline
  + current tip when possible, otherwise snaps to best-path bounding box.
- **Wide fan-out (many proposals from same parent).** Cap visible siblings at ~12 per parent
  per viewport; overflow collapses into `+N more` pseudo-node that expands on click. Acceptable
  to punt to Phase 2 with README note if pressure is high.
- **Proposal with `materialized_variant_id: null` but `status == "accepted"`.** Render as
  "accepted but not materialized" (ui-expert owns visual treatment); inspector explains.

### Filters

All header filters optional and additive:
- **Slice filter** — changes score context in inspector + tooltips to a single slice from
  `summary.per_slice`. Does NOT remove nodes.
- **Show rejected** — hide/show rejected proposal nodes.
- **Show failed only** — dims everything except `failed_run_count > 0`.
- **Best-path toggle** — overlay on/off.
- **Show future variants** (only meaningful when viewing an earlier bakeoff) — ghosted nodes
  for variants that didn't exist yet; default off.

No free-text search v1 (ids are long but trees are small).

### Accessibility minimums

- Color is never the only outcome signal — every outcome also encodes via shape OR icon OR text
  badge. Winner = crown/star glyph; failed = warning glyph. Coordinate with ui-expert.
- All interactive elements keyboard-reachable; visible focus ring.
- Inspector = `<aside role="complementary">` landmark; canvas has an accessible name describing
  the run.
- `prefers-reduced-motion`: disable animated edge tracing on best-path overlay; apply style
  instantly.
- WCAG AA contrast on all text + node labels. Outcome palette must survive deuteranopia sim
  (ui-expert owns that check).
- Tooltips reachable via keyboard focus, not hover-only.

### Component-state needs (additions to react-principal's Zustand store)

Agrees with react-principal's store. Additional fields needed:
- `sliceFilter: string | null` — for Flow A/E score context.
- `focusedRound: number | null` — for optimization view stepper (`←`/`→`).
- `showFailedOnly: boolean` — local-only, transient investigation tool; not URL-backed.
- `showFutureVariants: boolean` — covers the "earlier bakeoff" edge case; default false.

### Out of scope for v1 (explicit)

- Editing any data. Nothing writes back to `.smarteval/`.
- Auth, sharing beyond copy-paste URL, PNG/SVG export.
- Side-by-side run compare.
- Historical timeline across all runs.
- Remote/cloud runs.

### Open questions back to the team

- **dev-ops:** build-time `graph.json` matches your recommendation. Can `predev` watch
  `.smarteval/` and regenerate on change? Makes live-optimization observation delightful; if
  cheap, add — else punt to Phase 2.
- **react-principal:** please emit a "virtual run root" node in the data layer so the inspector
  component is uniform across variant / proposal / run-root. Please thread `sliceFilter` and
  `focusedRound` into the Zustand store (both URL-backed). Also: your "round badge in v1,
  separate timeline Phase-2" proposal is fine — the sparkline in the run-root inspector covers
  the timeline need for v1.
- **ui-expert:** please propose visual treatments for (a) "accepted but not materialized",
  (b) "ghost ancestor" (unknown outcome), (c) winner crown/star + failed warning glyph,
  (d) colorblind-safe palette for baseline / winner / improved / regressed / failed / rejected.

### Sign-off and answers to ui-expert's three asks (Phase 1 close)

Reviewed ui-expert's section against the six primary user questions (see `### Target user and
primary questions`) and the canonical feature list in `docs/graph.md` — sections "What To
Visualize", "Suggested Mapping", "Best Path", "Current Limits". Signing off on the overall
visual system. Three specific answers:

**A. Status taxonomy — adopt `improved-mild` / `regressed-mild` for |Δ| ≤ 0.05.** Approved.
- The ASR example has multiple variants at Δ = +0.10 alongside Δ = +0.40 — binary green hides
  the difference and produces the "everything is winning" illusion ui-expert flagged. Mild
  tiers directly answer the researcher's question "which proposals *really* improved" (US-2)
  vs the noise floor.
- Inspector outcome badge copy: `improved-mild` → `Improved +0.03 (mild)`; `regressed-mild` →
  `Regressed −0.02 (mild)`. The literal word "mild" is the signal that Δ is inside the noise
  band.
- Tooltips always show raw Δ to 2 decimals, regardless of tier — users never lose the real
  number.
- The ±0.05 threshold is a v1 heuristic. Expose it as a constant in one place
  (`web/src/lib/constants.ts` — react-principal, please own). Phase 2 can make it
  configurable per-config.
- Precedence when multiple tiers apply:
  `baseline > winner > failed > regressed > regressed-mild > improved-mild > improved > unknown`.
  Notes: `winner` is an identity, not a magnitude — a winner with Δ = +0.03 still renders as
  `winner`, not `improved-mild`. `failed` (any `failed_run_count > 0`) outranks magnitude
  tiers because a partially-failing variant cannot be trusted as a win.

**B. Legend-hover-dim affordance — ship it, with two mitigations for discoverability.**
Approved in principle; the concern is real. Mitigations:
- **Visual hint on legend swatches:** each row gets `cursor: help` (or pointer) and a 1px
  underline on row-hover so swatches visibly invite interaction. Without that, users won't
  know rows are hoverable.
- **First-open coach mark:** one-time inline tooltip anchored to the legend on first visit
  ("Hover a status to dim everything else"); dismissed by any click; persisted in
  `localStorage` under `smarteval.graph.coachmarks.legend=v1`. ui-expert owns visual;
  react-principal owns persistence (trivial — no store changes needed). OK to skip if scope
  balloons; the cursor hint alone is acceptable for v1.
- **Keyboard parity:** legend rows are `tabindex=0`; focus applies the same dim-others
  highlight. Required by `### Accessibility minimums` — hover-only would violate it anyway.
- **`prefers-reduced-motion`:** dim transition is instant (0 ms), no easing.

**C. Grey-out vs hide for variants absent from an earlier bakeoff — switch the default to
grey-out (`unknown`/`unscored`).** Accepting ui-expert's counter-proposal; overriding my
original "hide" default. Reasons (aligned with `docs/graph.md` "Current Limits"):
- `docs/graph.md` explicitly notes "Historical ancestor variants may not have score metadata
  in the latest bakeoff summary if they were not rerun in that bakeoff." The tree shape (who
  branched from whom, which proposals were rejected from a now-ancient parent) is itself
  load-bearing context; hiding makes earlier runs look artificially sparse and breaks the
  rejected-proposals thread.
- `outcome: "unknown"` in react-principal's `VariantOutcome` union maps cleanly to "unscored"
  — one code path, no special-case filter.
- Spec of the grey-out state (coordinates with ui-expert's "ghost ancestor" treatment):
  - Node: muted foreground, dashed border, no score digits (render `—` where score would
    appear), no delta pill.
  - Inspector when selected: id, parent, rationale, diff vs parent (still useful) + banner
    *"Not scored in the currently selected bakeoff. Open a bakeoff where this variant ran to
    see its scores."* with a quick-pick of bakeoffs that contain it (derived from `perBakeoff`
    key set).
  - Edges from/to an unscored node: desaturated + dashed so they read as structural rather
    than scored.
- Rename the filter: original "Show future variants" → **"Show unscored variants"**, default
  **on** (was off). Toggling off collapses the ghost nodes for a scored-only view.
- Edge case: the **baseline** is never `unknown` in its own tree — if a bakeoff has no
  baseline row, that's a data bug. Show a canvas banner: "Baseline missing from this bakeoff
  summary (fingerprint mismatch?)".

### `docs/graph.md` coverage check (for team-lead)

Walking `docs/graph.md` against the UX spec above, section by section:

- **"What To Visualize" — variant + proposal-attempt nodes; parent→accepted-child and
  parent→rejected-proposal edges.** Covered by node-inspector spec (three node types),
  `showRejected` state, and the interaction model.
- **"What To Visualize" — recommended node labels (id, rationale, mean score, Δ vs baseline,
  failed run count).** All present in variant inspector Header + Score block + Rationale +
  Failures.
- **"What To Visualize" — recommended edge labels (changed fields, proposal rationale, Δ vs
  parent, rejection reason).** Click-edge shows proposal rationale; mid-edge Δ badge shows Δ
  vs parent (ui-expert spec); rejection reason is in the rejected-proposal inspector.
  Changed-field summary goes in the edge tooltip and the variant diff table.
- **"Suggested Mapping" — variant node fields.** All covered.
- **"Suggested Mapping" — rejected proposal fields and `status` styling
  (`rejected_exact_duplicate` / `rejected_semantic_duplicate`).** Covered — rejection badge
  and ui-expert palette differentiate the two.
- **"Suggested Mapping" — accepted proposal edges use rationale + diff summary as edge
  label.** Covered by the edge click-card and mid-edge Δ badge.
- **"Suggested Mapping" — failed branches highlighted via `failed_run_count` and
  `sample_errors`.** Covered: Flow E, `failed` outcome in taxonomy, inspector Failures
  section.
- **"Best Path" — highlight `improvement_traces` path from baseline to winner.** Covered:
  `showBestPath` URL-backed toggle (default on), overlay on best-path nodes+edges, arrow-key
  navigation that treats the best path as the default forward/backward traversal, and
  per-round best-score sparkline in the run-root inspector for optimization sessions.
  `judge_justification` surfaces in the variant inspector's Rationale block when present.
- **"Minimal Rendering Plan" — node color by outcome (baseline / winner / improved /
  regressed / failed / rejected).** Covered by ui-expert's palette + the mild-tier extension
  in Answer A.
- **"Current Limits" — historical ancestor variants may lack scores.** Covered by Answer C
  (grey-out + "Show unscored variants" filter + inspector banner with bakeoff quick-pick).
- **"Current Limits" — rejected proposals only tracked once they reach dedup/review.**
  Covered: we never promise to show upstream proposer misses. Inspector help text can note
  it if we ever persist pre-dedup rejects (Phase 2).
- **"Current Limits" — no built-in `graph.json` export yet.** Being resolved by dev-ops's
  `smarteval graph export` CLI; UX is blind to the loader path.

### Updates to UX spec items, reconciled with ui-expert

- **Filters list:** rename **"Show future variants"** → **"Show unscored variants"**; default
  **on** (was off). Behavior = toggle grey-out visibility (Answer C).
- **Component-state needs:** rename `showFutureVariants: boolean` → `showUnscoredVariants:
  boolean`, default `true`, URL-backed (`&unscored=0` hides). react-principal, please adjust
  the Zustand store.
- **Variant outcome taxonomy:** extend react-principal's `VariantOutcome` from `{baseline,
  winner, improved, regressed, failed, unknown}` to `{baseline, winner, improved,
  improved-mild, regressed, regressed-mild, failed, unknown}`. `unknown` remains the grey-out
  state. Precedence as in Answer A.
- **Legend interaction:** hover-dim is a published affordance with a one-time coach mark
  (Answer B). Keyboard focus on legend rows triggers the same dim.

With Answers A/B/C and the reconciled filter naming, Phase 1 is signed off from the UX side.

---

## UI / Visual Design (ui-expert)

Owner: `ui-expert`

### Design intent

`smarteval` is a disciplined, slightly academic tool — closer to an engineering
notebook than a marketing dashboard. The graph is the one visual artifact this
otherwise-text-first framework produces, so it needs to feel **precise,
information-dense, and calm**, not decorative. The right reference is a
well-designed code diff viewer or a scientific plotting library, not a flashy
data-viz product. No gradients-as-decoration, no neon, no emoji in the UI,
no superfluous motion.

The user is a researcher scanning a tree of 10–100 variants trying to answer
four questions in sequence: *where did we start? what got tried? what was
rejected and why? which path won?* Every visual choice below follows from
making that scan fast.

### Palette

Dark mode is the default (matches terminal-adjacent tooling and reduces eye
strain when glancing between this and logs). Light mode is a supported
first-class theme — same semantics, same contrast ratios, just swapped
surfaces. Both target **WCAG AA** for text (4.5:1) and **3:1** for graphical
status indicators against the graph background. Status is never encoded by
color alone — shape + badge back it up so deuteranopia / protanopia users,
and anyone printing grayscale, still read the graph.

**Neutrals (surfaces & text)**

| Token             | Dark      | Light     | Use |
|-------------------|-----------|-----------|-----|
| `--bg-canvas`     | `#0D1117` | `#FAFAF7` | Graph background |
| `--bg-surface`    | `#161B22` | `#FFFFFF` | Inspector, legend, top bar |
| `--bg-elevated`   | `#1F2630` | `#F3F3EE` | Hover surface, selected row |
| `--border-subtle` | `#262E3A` | `#E5E4DE` | Panel borders, default node stroke |
| `--border-strong` | `#3B4656` | `#C9C7BF` | Hover stroke, focus ring on panels |
| `--text-primary`  | `#E6EDF3` | `#1A1A1A` | Node labels, panel body |
| `--text-secondary`| `#9BA6B2` | `#5A5A55` | Metadata, rationale preview |
| `--text-tertiary` | `#6B7685` | `#8A8A82` | Muted captions, timestamps |

**Status (node fill / accent)**

| Status                          | Dark      | Light     | Notes |
|---------------------------------|-----------|-----------|-------|
| `baseline`                      | `#7D8590` | `#4A4F57` | Neutral gray — intentionally unloaded |
| `winner`                        | `#F2C94C` | `#C08A00` | Gold; current best on selected run |
| `improved` (Δ > +0.05)          | `#3FB950` | `#1F7A3A` | Green |
| `improved-mild` (0 < Δ ≤ 0.05)  | `#56B672` | `#2E8B4F` | Desaturated green (near-flat wins) |
| `regressed` (Δ < −0.05)         | `#F85149` | `#B92519` | Red |
| `regressed-mild` (−0.05 ≤ Δ <0) | `#D65C5C` | `#9A3B32` | Desaturated red |
| `failed` (`failed_run_count>0`) | `#A371F7` | `#6F42C1` | Purple; orthogonal to score axis |
| `rejected-exact-duplicate`      | `#58636F` | `#7A7970` | Dim — noise |
| `rejected-semantic-duplicate`   | `#8B6F4E` | `#886641` | Warm brown — "tried something similar" |
| `unscored` (no run data)        | `#3B4656` | `#BFBDB4` | Outline-only (see "Sparse data") |

**Best-path accent**

| Token         | Dark       | Light      | Use |
|---------------|------------|------------|-----|
| `--path-glow` | `#F2C94C`  | `#C08A00`  | Best-path edge stroke + outer glow |
| `--path-halo` | `rgba(242,201,76,0.18)` | `rgba(192,138,0,0.14)` | 4-8px halo behind best-path nodes |

These hex values are authoritative; they map 1:1 to Tailwind theme tokens
(see "CSS approach").

### Typography

- **UI chrome:** `Inter` variable, fallback `-apple-system, "SF Pro Text",
  system-ui, sans-serif`. Weight 400 body, 500 labels, 600 headings.
- **Node labels & numeric deltas:** same Inter, **tabular-nums** on
  (`font-variant-numeric: tabular-nums`) so `+0.12` and `−0.07` align
  vertically across a column of sibling nodes.
- **IDs, diffs, rationale code fragments:** `JetBrains Mono`, fallback
  `ui-monospace, "SF Mono", Menlo, monospace`. 13px in the inspector.
- **Sizes:**
  - Node title (short id): 12px / 500
  - Node score: 14px / 600 tabular
  - Δ badge: 11px / 600 tabular
  - Panel body: 13px / 400, line-height 1.55
  - Inspector heading: 15px / 600
  - Legend item: 12px / 500
  - Run selector (top bar): 13px / 500
- **No italics** except for rationale quotations in the inspector (signals
  "this is human/LLM prose, not system metadata").

### Node shapes, sizes, status language

Variant nodes and proposal nodes are visually distinct **by shape** so the
user can parse tree structure before reading any labels.

- **Variant node** — rounded rectangle. Default 220×100 (react-principal's
  sizing; accepting the override). My earlier 180×64 baseline was too tight
  once the score bar + badges land together, so 220×100 is the number.
  - **Top-left:** short id (middle-truncated with `…`; full id on hover).
    ASR ids get very long — middle truncation is required.
  - **Top-right:** Δ badge. Pill, tabular font. `+0.12`, `−0.07`, or `—`
    when no run in this bakeoff (tooltip explains).
  - **Middle:** mean score (`0.76`) tabular, large.
  - **Just below score:** 4px horizontal bar, 0→1 scale, filled to
    `mean_score` in status color — glanceable magnitude independent of the
    label.
  - **Left edge:** 4px vertical stripe in the status color. The rest of the
    card is the neutral surface so a page full of green nodes doesn't wash
    out as a solid wall of green — color is the accent, not the background.
  - **Baseline variant:** same rect, doubled (8px) left stripe,
    `--border-strong` border, tiny `BASELINE` caption above the id in 10px
    uppercase tracking-wide.
  - **Winner variant:** gold left stripe + top-right corner notch (cut at
    12px) + gold `WINNER` badge. Glow lives on the best-path edge, not on
    the node.
  - **Failed (`failed_run_count > 0`):** diagonal hatched overlay (4px, 20%
    opacity) + purple `AlertTriangle` badge with the failed count next to
    the Δ.
  - **Unscored:** dashed border, no fill-bar, Δ shown as `—`.
- **Rejected proposal node** — diamond / rotated-square, 44×44 px (matches
  react-principal's proposal node size spec scaled for the diamond shape).
  Content is one glyph:
  - `=` for `rejected_exact_duplicate`
  - `≈` for `rejected_semantic_duplicate`

  Never carries score data. Click opens the inspector with rationale,
  similarity score, and the variant it duplicated. Small on purpose:
  visible for auditability but not outcompeting variants for attention.

Status encoding is **redundant**: shape + badge + color. Colorblind users
and grayscale printouts stay readable.

### Edge styles

- **Accepted variant edge:** 1.5px solid, `--border-strong`, arrowhead at
  child. When both parent and child have scores, a tiny mid-edge Δ badge
  (`+0.12` / `−0.04`) floats in the edge's status color. Hover expands to
  2px and reveals full `proposal.rationale` in the tooltip.
- **Rejected proposal edge:** 1px dashed (4 2 pattern), `--text-tertiary`
  color, open caret at the child, no filled arrow. Low contrast because
  these branches are noise; the eye slides past unless inspecting.
- **Best-path edge:** 2.5px solid `--path-glow` with a 6px gold halo
  (`drop-shadow(0 0 6px --path-halo)`). Arrowhead filled gold. Hover tooltip
  shows `judge_justification` from `improvement_trace` (when present) plus
  `delta_vs_parent`. Entrance animation: 350 ms path-draw on initial load
  and when switching run; skipped under `prefers-reduced-motion`.

### Layout

**Primary: Dagre top-to-bottom** (DAG layered).

Reasons:
- Optimization lineage reads naturally top→bottom; matches the "round N"
  progression users think in.
- 220-wide variant nodes are readable in vertical ranks; radial would
  compress deltas.
- Scales to the densities we have (16 variants + 15 proposals in the ASR
  example, ~200 nodes worst case) with virtualization.

Config: `rankdir: TB`, `ranksep: 80`, `nodesep: 28`. Rejected-proposal
diamonds nudge right of their parent (small horizontal offset) so they
don't disrupt variant ranks. Viewport padding 24px. `fitView` on initial
load, max zoom 1.0 (don't blow up tiny trees).

Alternative considered: **radial**. Rejected — deltas read better in
rank-aligned columns, and the tree is deep rather than bushy.

**Per-bakeoff subgrouping:** when a run is selected, nodes not in that
bakeoff render as `unscored` outline nodes (matches ux-expert's likely
"show greyed out" affordance). Single graph, not cluster layout — the
reader should always see the whole lineage.

### Legend

Fixed bottom-left, 240px wide, collapsible (keyboard `L`):

1. **Status** — one row per status (baseline, winner, improved, regressed,
   failed, unscored). 16×16 miniature node swatch + label.
2. **Rejection** — exact (`=`) and semantic (`≈`) diamonds.
3. **Edges** — accepted, rejected, best-path stroke samples.
4. **Best path** — "Gold edge = current best lineage from baseline."

Hovering a legend row dims non-matching graph elements to 0.25 opacity —
useful for "just show me the regressions". This is a power-user affordance;
UX should confirm discoverability is acceptable (tooltip hint on first
hover).

### Dark / light mode

Both ship. Default dark. Toggle in top bar, persisted in `localStorage`,
first-load from `prefers-color-scheme`. Palette is token-based; theme
switch is swapping CSS custom-property values at `<html data-theme="…">`.
No component-level conditionals.

### Responsive behavior

- **≥1280px:** full layout — graph fills main area, inspector is a fixed
  420px right rail, legend bottom-left, top bar with run selector + search.
- **768–1279px:** inspector becomes a slide-over panel on node click;
  legend collapses to a "Legend" button.
- **<768px:** simpler **list view fallback** grouped by rank with winner
  pinned top. Primary user is desktop; mobile is read-only triage.

The canvas scales via the graph library's own viewport — we don't re-layout
on resize.

### Hover, selected, focused states

- **Hover (node):** border → `--border-strong`, 2px status-colored halo at
  30%, cursor `pointer`, 120 ms ease-out.
- **Selected (node):** 2px `--text-primary` outer ring. Lineage (all
  ancestors to baseline + direct descendants) highlighted; siblings dim to
  0.35 opacity. Click empty canvas to deselect.
- **Keyboard focus (node):** 2px *dashed* `--text-primary` ring with 2px
  offset — visually distinct from mouse selection for accessibility.
- **Hover (edge):** weight +0.5px, status-colored tooltip.
- **Inspector rows:** row hover `--bg-elevated`, selected row gets a 3px
  left accent stripe in the row's status color.

### Iconography

Minimal, all Lucide icons (matches Inter's geometric feel):

- `Crown` — winner badge
- `AlertTriangle` — failed indicator (16px, filled purple)
- `GitBranch` — proposal rejection row in inspector
- `ExternalLink` — open run directory / source file
- `Search` — top-bar search
- `ChevronDown` — run selector
- `Info` — legend toggle, tooltip triggers
- `Sun` / `Moon` — theme toggle

No emoji anywhere in the UI.

### Sparse-data and empty states (visual treatment; UX owns copy)

- **Single baseline, no proposals yet:** centered baseline node with a
  greyed caption. Canvas shows a faint dotted grid (4% opacity) so it
  doesn't look broken.
- **All-rejected round:** a rank of diamonds with no variant children;
  explicit "Round N produced 0 accepted variants" rank label in
  `--text-tertiary`.
- **Unscored ancestors:** outline-only node with Δ `—` and a tiny `Info`
  affordance explaining "not rerun in this bakeoff".

### Animation minimums

All animation is subtractive — never decorative. Respect
`prefers-reduced-motion: reduce` by disabling every item below except the
pan/zoom transform.

- Initial entrance: 250 ms fade-in, nodes staggered by rank (30 ms stagger,
  capped at 600 ms total).
- Best-path edge draw: 350 ms stroke-dashoffset, once.
- Hover: 120 ms ease-out.
- Selection lineage dim: 180 ms opacity transition.
- Inspector slide-in (narrow widths): 200 ms ease-out.
- Theme toggle: 150 ms cross-fade on background tokens.
- No spinners on the graph itself — loading state is a centered skeleton
  tree (3 placeholder rect nodes) using `--bg-elevated`, no shimmer.

### CSS approach — recommendation

**Tailwind CSS + CSS custom properties for theme tokens.** Aligns with
`react-principal`'s "Tailwind for design-system scaffolding" call.

- Palette and spacing tokens become Tailwind theme entries. We do **not**
  use Tailwind's `dark:` variant — theme switches via
  `<html data-theme="dark|light">` swapping CSS variables. This matters
  because the graph library's inline styles don't see a Tailwind `dark:`
  class but they *do* pick up `var(--…)`.
- Custom node renderers (React Flow accepts React components as nodes)
  write Tailwind classes for layout/typography and
  `style={{ borderColor: 'var(--status-improved)' }}` for status-driven
  colors. Tailwind's arbitrary-value escape (`border-[color:var(--status-improved)]`)
  works too.
- **No CSS-in-JS runtime** (no Emotion, no styled-components). Astro +
  React islands + Tailwind → zero-JS styling for the non-interactive chrome
  and small bundles.
- `web/src/styles/tokens.css` holds the `:root[data-theme=dark]` and
  `:root[data-theme=light]` blocks. `tailwind.config.ts` references them:
  ```ts
  colors: {
    bg: {
      canvas: 'var(--bg-canvas)',
      surface: 'var(--bg-surface)',
      elevated: 'var(--bg-elevated)',
    },
    status: {
      baseline: 'var(--status-baseline)',
      winner: 'var(--status-winner)',
      improved: 'var(--status-improved)',
      regressed: 'var(--status-regressed)',
      failed: 'var(--status-failed)',
      rejectedExact: 'var(--status-rejected-exact)',
      rejectedSemantic: 'var(--status-rejected-semantic)',
      unscored: 'var(--status-unscored)',
    },
    path: { glow: 'var(--path-glow)' },
  }
  ```
- React Flow ships a small base stylesheet; we'll import it first and layer
  Tailwind + our overrides after, scoped under a `.rgv-graph` wrapper so
  they don't leak.

### Polish checklist — enforced during Phase 2 review

I'll push back on any PR that misses these:

- [ ] Every status has a node swatch in the legend matching the graph.
- [ ] Δ badges and score numbers use tabular numerals (vertical alignment).
- [ ] Rejected-proposal diamonds never exceed 44×44 px, even zoomed.
- [ ] Best-path gold appears nowhere else in the palette.
- [ ] All interactive elements have a visible `:focus-visible` ring.
- [ ] `prefers-reduced-motion` disables every animation listed above.
- [ ] Dark/light both pass Lighthouse contrast (AA text, 3:1 graphical).
- [ ] Inspector scrollbar is styled (not default chrome gray).
- [ ] Long variant ids truncate *middle* (`baseline-…-132745-2`), not end.
- [ ] Empty canvas never looks broken — always dotted grid + caption.

### Open coordination points

- **`react-principal`:** I'm adopting your 220×100 variant node size. I'll
  use 44×44 for the rejected-proposal diamond (smaller than your 180×64 for
  proposal nodes) because the diamond's visual weight is larger than its
  bounding box and I want these to read as "noise, auditable on click" not
  as "peer of a variant". If you need them to coexist with HTML-content
  variants in the same React Flow node type, we can do a node-type
  (`variant` / `proposal`) dispatch.
- **`react-principal`:** if the exporter can inline the best-path
  `deltaVsParent` onto each accepted edge, the mid-edge Δ badge avoids a
  cross-ref against `improvementTraces`. Not blocking — just nicer.
- **`ux-expert`:** please sanity-check the status taxonomy — I added
  `improved-mild` / `regressed-mild` for Δ ∈ (−0.05, +0.05) because many
  bakeoffs produce tiny, probably-noise deltas and a binary green/red can
  create a false "all-green" illusion. Happy to collapse back to
  improved/regressed if you'd rather keep it binary. Also please weigh in
  on the legend-hover-dim affordance; it's aggressive and may surprise
  users who don't discover it.
- **`ux-expert`:** on your "hide vs grey-out future variants" question — I
  recommend **grey-out (unscored)** as the default because the tree shape
  and rejected-proposal history is still informative for older runs; hiding
  them makes earlier bakeoffs look artificially sparse. The "show future
  variants" toggle can flip them back to full visual weight.
- **`dev-ops`:** Tailwind + PostCSS in Astro needs `@astrojs/tailwind` in
  the scaffold. Please also install `@fontsource-variable/inter` and
  `@fontsource/jetbrains-mono` so we don't fetch from Google Fonts at
  runtime. `lucide-react` for icons.

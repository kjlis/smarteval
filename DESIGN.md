# smarteval — v1 Design Document

**Status:** Draft for architect review
**Date:** 2026-04-17
**Product owner:** Krzysztof Zabłocki
**Source materials:**
- `reference/eval-loops-for-llm-features.md` — philosophy article
- `reference/nano-banana/` — prior-art eval harness (TypeScript; informs but does not constrain)
- `reference/nano-banana/EVALUATION.md` — real-world experiment ledger (R93 → R323) with hard-won methodology lessons

---

## 1. Purpose

smarteval is a Python-first, public-OSS framework for building, running, and optimizing evaluations of non-deterministic or partially non-deterministic algorithms — starting with LLM features but not limited to them.

It exists because:
- Models change every few weeks; prompt techniques are model-coupled; the eval loop is the only durable investment.
- Hand-maintained discovery ledgers scale to one researcher, not a team.
- Single-grader evaluation is unsafe: swapping graders can invert conclusions (documented 21pp inflation in `EVALUATION.md` R314).
- Per-case specialist findings (nano-banana R317/R318/R323) need a first-class routing artifact, not narrative notes.
- A small, opinionated toolkit unlocks optimization loops that would never happen without measurement.

Out of scope as a "thing": an opinionated science-of-evals platform, a dashboard product, a managed service.

---

## 2. Design principles (non-negotiable)

1. **The evaluator is a pinned, fingerprinted, load-bearing artifact**, not a knob. Cross-fingerprint A/B is refused by default; rotation requires an explicit re-baselining ritual.
2. **Contract and semantic scoring are composable pipeline stages**, not a fixed two-layer. Earlier stages gate later stages and pass machine analysis forward as context.
3. **Baseline is a first-class variant.** No run is meaningful without it; the framework enforces its existence.
4. **Slice-level stratification is default.** Any tagged-slice regression fails a bakeoff unless explicitly acknowledged.
5. **Paired bootstrap over per-case deltas** is the default A/B statistic — not pooled means.
6. **Dual output (markdown + JSON), incremental writes, resumable runs.** The nano-banana incremental-write model is kept exactly.
7. **Plugin seams are code-level Python entry points; parameters are YAML-level.** Plugins are capability; config is choice.
8. **No HTML dashboards, no TUI browsers, no database in v1.** The tool follows the habit, not the other way.
9. **Human-in-the-loop at every promotion boundary.** The framework surfaces data; humans assign verdicts.
10. **Text-only modalities in v1.** Image, search-with-NDCG, code-exec ship as reference docs only.

---

## 3. In scope for v1

- Cases, GoldenSets, Variants, Rubrics, Generators, Scorers, Runs, Bakeoffs
- Contract + deterministic-metric + LLM-judge scoring pipeline
- Evaluator policy (pin, fingerprint, rate-limit pacing)
- Baseline enforcement
- Slice-level stratification and regression gating
- Paired bootstrap A/B statistics
- Router / specialist artifact (RouterSpec)
- Discovery ledger (plain JSONL + markdown)
- LLM proposer (single-call, context-packet driven)
- Pluggable autonomy tiers (`propose`, `run`, `promote`)
- Rubric evolution with `rescore` (always re-score history)
- Per-run budget caps with pre-flight estimate
- Non-LLM Generators as first-class (classical algorithms, rule engines)
- External pipeline Generators as first-class (manifest-backed runs that emit one selected primary artifact plus references to sibling outputs)
- Dual output: `summary.md` + `summary.json` per run
- Resumable runs on API failure
- CLI: `init`, `run`, `estimate`, `resume`, `rescore`, `log`, `diff`, `propose`, `verdict`, `try-new-model`, `doctor`
- YAML + pydantic config with schema validation
- Plugin entry points: Generator, Scorer, ContractValidator, Reporter

## 4. Out of scope for v1 (explicit deferrals)

- Native audio / video scoring modalities and joint multi-output aggregation in a single bakeoff (use external pipelines that emit text / JSON, and separate eval configs per optimized surface)
- Search/retrieval plugins with NDCG/MRR (shipped only as example)
- Code-execution sandboxed scorers
- SQLite / Postgres / any database backend
- HTML reports, TUI browsers, web UI
- Held-out case discipline (train/holdout split)
- Adversarial / auto-generated case creation
- Evolutionary / MIPRO / DSPy-compile proposers
- Multi-run "campaign" budget aggregation
- Shared-bucket run storage / `smarteval share`
- Cross-project variant library
- Watch mode, live dashboards
- Workspace concept (multiple surfaces per repo — use multiple config files)

---

## 5. Core abstractions

All live in `smarteval.core.models` as pydantic v2 models.

### 5.1 `Case`

```python
class Case(BaseModel):
    id: str                              # stable, human-meaningful
    input: dict[str, Any]                # task-specific payload
    expected: dict[str, Any] | None = None  # optional ground truth
    tags: list[str] = []                 # for stratification
    difficulty: Literal["easy", "medium", "hard"] | None = None
    notes: str | None = None
    added_at: date
    added_by: str | None = None          # e.g. "bug-R315"
```

### 5.2 `GoldenSet`

An on-disk collection of Cases in JSONL, hashed at load time to a `golden_hash`. Runs record their `golden_hash`; comparisons across different hashes are flagged (not refused — the user set strictness to configurable).

### 5.3 `Variant`

```python
class Variant(BaseModel):
    id: str
    description: str | None = None
    generator: GeneratorRef              # which generator plugin + params
    params: dict[str, Any] = {}          # plugin-specific (prompt path, temperature, etc.)
    parent_id: str | None = None         # for mutation chains in ledger
```

For complex systems, a Variant may represent a full external pipeline configuration (for example: preprocessing + ASR + note generation) rather than a single model call.

### 5.4 `Generator` (plugin)

```python
class Generator(Protocol):
    name: str
    def generate(self, case: Case, params: dict) -> Artifact: ...
```

Ships in v1: `openai`, `anthropic`, `gemini`, `script` (calls arbitrary Python callable for non-LLM), `pipeline` (executes an external pipeline and selects one output artifact from its manifest).

### 5.5 `Artifact`

```python
class ArtifactRef(BaseModel):
    kind: Literal["text", "json", "path"]
    uri: str                             # absolute path or project-relative path
    metadata: dict[str, Any] = {}

class Artifact(BaseModel):
    kind: Literal["text", "json", "path"]
    payload: Any
    attachments: dict[str, ArtifactRef] = {}   # sibling outputs kept as context, not scored by default
    source_manifest: str | None = None         # manifest-backed generators point to the originating manifest
    source_run_dir: str | None = None          # stable reference to the external pipeline run directory
    metadata: dict[str, Any] = {}        # cost, latency, tokens, raw API response hash
```

v1 scoring operates on exactly one primary Artifact per Run. Additional outputs are retained as attachments for auditability and optional scorer context. Optimizing a different surface uses a different eval config, not multi-output joint scoring.

### 5.6 `ContractValidator` (plugin)

Runs before scoring. Produces `ContractResult` which is passed forward to scorers as context.

```python
class ContractResult(BaseModel):
    passed: bool
    violations: list[str]
    warnings: list[str]                  # non-fatal, still passed to judge as context
```

Ships in v1: `json_schema`, `pydantic_model`, `regex_match`, `length_bounds`, `custom_predicate`.

### 5.7 `Scorer` (plugin)

Two shapes, same output type:

```python
class DeterministicScorer(Protocol):
    kind: str                            # "exact_match", "bleu", "embedding_sim", etc.
    def score(self, case: Case, artifact: Artifact, contract: ContractResult) -> Score: ...

class JudgeScorer(Protocol):
    kind: str                            # "llm_rubric", always LLM-backed
    rubric: Rubric
    evaluator: EvaluatorPolicy
    def score(self, case: Case, artifact: Artifact, contract: ContractResult) -> Score: ...

class Score(BaseModel):
    value: float                         # 0..1 normalized
    raw: dict[str, Any]                  # per-dimension scores, citations, failure_modes
    confidence: float | None = None
    passed: bool                         # derived from threshold
```

Pipeline semantics: contract runs first; if it fails, downstream scorers may skip (`gated_by` setting). All scorers see the full contract result as context.

### 5.8 `Rubric`

```python
class RubricDimension(BaseModel):
    id: str
    weight: float
    prompt: str                          # per-dimension evaluator prompt
    evidence_required: bool = True
    failure_mode_enum: list[str] = []

class Rubric(BaseModel):
    id: str
    version: str                         # semver
    scale: Literal[5] = 5                # enforce 1-5 (article lesson)
    dimensions: list[RubricDimension]
    pass_threshold: float = 3.5
    weight_sum_check: Literal["strict", "warn"] = "strict"
```

On load: weight sum is validated. Hash of the rubric enters the `evaluator_fingerprint`.

### 5.9 `EvaluatorPolicy`

```python
class EvaluatorPolicy(BaseModel):
    model: str                           # "gemini-3.1-pro-preview"
    version_hint: str | None = None      # optional API version pin
    temperature: float = 0.0
    top_p: float = 0.1
    rpm: int | None = None               # per-project rate-limit ceiling
    n_averaging: int = 3                 # run judge N times per case, average
    canonical: bool = True               # true for locked per-project evaluator
    fingerprint: str                     # computed: hash(model, temp, topP, rubric_hash, system_prompt_hash)
```

A run records the full `EvaluatorPolicy` snapshot. A/B across different fingerprints triggers a warning by default (per user's strictness preference); strict mode refuses.

### 5.10 `Run`

One atomic (generator × case × variant × iteration) execution.

```python
class Run(BaseModel):
    run_id: str                          # <bakeoff_id>/<case_id>/<variant_id>/<iter>
    case_id: str
    variant_id: str
    generator: str
    iteration: int
    artifact: Artifact
    contract: ContractResult
    scores: list[Score]
    cost_usd: float
    duration_ms: int
    timestamp: datetime
    evaluator_fingerprint: str
    golden_hash: str
```

### 5.11 `Baseline`

Not a new type — a string `variant_id` marked in the config:

```yaml
baseline: production-v3
```

Framework refuses to start a bakeoff if `baseline` is absent or does not reference a declared variant. Reports always compute deltas against baseline.

### 5.12 `RouterSpec`

```python
class RouterRule(BaseModel):
    when: dict[str, Any]                 # match condition on case.tags / case.input
    variant_id: str
    validation: RouterValidation

class RouterValidation(BaseModel):
    run_id: str                          # bakeoff that validated this specialist
    lift_vs_default: float               # delta on the scoped slice
    scope: str                           # human-readable: "cluttered_console only"
    n_runs: int                          # sample size of validation

class RouterSpec(BaseModel):
    default_variant_id: str
    rules: list[RouterRule]              # ordered; first match wins
    max_specialists: int = 10            # complexity cap
```

A RouterSpec is itself a Variant the bakeoff can validate end-to-end against flat baselines — "is the router worth the added complexity?" becomes a measurable question.

### 5.13 `Verdict`

Written by a human after a bakeoff completes.

```python
class Verdict(BaseModel):
    run_id: str
    status: Literal["win", "loss", "specialist", "noisy", "pending"]
    promotion_level: Literal["dead", "specialist", "broad_default", "pending"]
    rationale: str                       # human prose, required for non-pending
    killed_by: Literal["human", "canonical_eval", "slice_regression", "noise"] | None = None
    follow_up_variant_id: str | None = None
    author: str
    timestamp: datetime
```

### 5.14 `DiscoveryLedger`

Append-only JSONL files on disk. Two streams: `variants.jsonl` and `verdicts.jsonl`. Paired with freeform human notes under `ledger/notes/`.

### 5.15 `Bakeoff`

The top-level verb. A `Bakeoff` is a cartesian product executor:

```python
class BakeoffConfig(BaseModel):
    id: str                              # auto: timestamp + short hash
    golden_set: Path
    baseline: str
    variants: list[Variant]
    pipeline: ScoringPipeline
    execution: ExecutionPolicy
    reporting: ReportingPolicy
    evaluator: EvaluatorPolicy
```

### 5.16 `ExecutionPolicy`

```python
class ExecutionPolicy(BaseModel):
    runs_per_variant: int = 3            # article default
    concurrency: int = 12                # nano-banana default
    evaluator_rpm: int | None = None     # overrides EvaluatorPolicy.rpm if set
    budget_usd: float | None = None      # per-run cap (user's choice)
    max_duration_min: int | None = None
    on_budget_exceeded: Literal["abort", "warn"] = "warn"
```

### 5.17 `ReportingPolicy`

```python
class ReportingPolicy(BaseModel):
    formats: list[Literal["markdown", "json"]] = ["markdown", "json"]
    slice_by: list[str] = ["tags", "difficulty"]
    diff_against_baseline: bool = True
    ci_summary: bool = False             # writes a separate ci.json for CI gates
```

### 5.18 Gates (all configurable)

```python
class Gates(BaseModel):
    min_runs_per_variant: int = 10       # hard minimum for promotion
    min_runs_warning: int = 5            # below this, results flagged "provisional"
    slice_regression_threshold: float = 0.10   # 10pp default
    slice_regression_action: Literal["fail", "warn"] = "warn"  # user's configurable default
    require_baseline: bool = True
    evaluator_fingerprint_change: Literal["refuse", "warn"] = "warn"  # user's choice
    cross_evaluator_verification: bool = False  # opt-in
```

---

## 6. Config schema (YAML)

End-user authoring surface. Validated on load by pydantic.

```yaml
# smarteval.yaml
version: 1                                # schema version

golden_set: ./golden.jsonl
baseline: production-v3

artifact_selection:
  primary_output: response_text          # logical output key every variant must expose
  copy_attachments: false                # if true, retain referenced sibling outputs under the smarteval run dir

evaluator:
  model: gemini-3.1-pro-preview
  temperature: 0.0
  top_p: 0.1
  rpm: 25
  n_averaging: 3
  canonical: true

variants:
  - id: production-v3
    description: Current production prompt
    generator: { kind: gemini, model: gemini-2.5-flash, temperature: 0.4 }
    params:
      prompt: ./prompts/baseline-v3.txt

  - id: hidden-cot
    description: Same base + hidden chain-of-thought preamble
    generator: { kind: gemini, model: gemini-2.5-flash, temperature: 0.4 }
    params:
      prompt: ./prompts/hidden-cot.txt

  - id: classic-keyword
    description: Non-LLM keyword ranker for comparison
    generator: { kind: script, callable: my_app.search:keyword_rank }
    params: {}

pipeline:
  - id: contract
    kind: json_schema
    schema: ./schemas/recipe.schema.json
    gates_downstream: true

  - id: exact-fields
    kind: exact_match
    fields: ["dietary_preference"]

  - id: quality
    kind: llm_rubric
    rubric: ./rubrics/default.yaml
    gated_by: [contract]

execution:
  runs_per_variant: 10
  concurrency: 12
  budget_usd: 5.00
  on_budget_exceeded: abort

reporting:
  formats: [markdown, json]
  slice_by: [tags, difficulty]
  diff_against_baseline: true

gates:
  min_runs_per_variant: 10
  slice_regression_threshold: 0.10
  slice_regression_action: warn
  evaluator_fingerprint_change: refuse

router: ./router.yaml                     # optional

autonomy:
  propose: suggest_only                   # suggest_only | auto_queue
  run: manual                             # manual | auto_queue
  promote: manual                         # always manual in v1, reserved knob
  budget_per_campaign_usd: null           # per-run caps win in v1
```

If `artifact_selection` is omitted, the default is:

```yaml
artifact_selection:
  primary_output: response_text
  copy_attachments: false
```

### 6.1 Golden set format (JSONL)

```jsonl
{"id": "speed",      "input": {"query": "quick weeknight chicken"},        "tags": ["search", "speed"],     "difficulty": "easy", "expected": {...}, "added_at": "2026-01-10"}
{"id": "restriction","input": {"query": "gluten-free birthday cake"},      "tags": ["search", "dietary"],  "difficulty": "hard", "expected": {...}, "added_at": "2026-01-12"}
```

`Case.input` may contain paths or structured references for non-text systems (for example `{"audio_path": "./fixtures/visit-01.wav"}`), and `expected` may be omitted entirely for rubric-only evaluations.

### 6.2 Rubric YAML

```yaml
id: recipe-adaptation
version: 3.2.0
scale: 5
pass_threshold: 3.5
weight_sum_check: strict

dimensions:
  - id: taste_accuracy
    weight: 0.20
    prompt: |
      Score this adaptation on Taste Accuracy (1-5):
      - Does each substitution preserve the flavor role of the original?
      - Are ratios adjusted for the substitute's intensity?
      Cite the specific substitution(s) that informed your score.
      Respond with: score, one-sentence justification, failure_mode (if < 3).
    evidence_required: true
    failure_mode_enum: [flavor_mismatch, ratio_error, ingredient_ungrounded, other]

  - id: technique_correctness
    weight: 0.15
    prompt: |
      Are cooking methods adjusted for new ingredients? Would the technique still work?
    evidence_required: true
    failure_mode_enum: [wrong_method, timing_off, missing_adjustment, other]
  # ... remaining dimensions sum to 1.0
```

### 6.3 Router YAML

```yaml
default_variant_id: production-v3
max_specialists: 5

rules:
  - when:
      tag: cluttered_console
      generator: gemini-2.5-flash-image
    variant_id: console-no-marker-anchored
    validation:
      run_id: 2026-04-16T08-57-49.959Z
      lift_vs_default: 0.90            # 10/10 vs 1/10
      scope: cluttered_console only
      n_runs: 10

  - when:
      tag: left_bed
    variant_id: left-bed-bbox-no-role
    validation:
      run_id: 2026-04-16T12-34-22.001Z
      lift_vs_default: 0.30
      scope: left_bed only
      n_runs: 10
```

### 6.4 Pipeline-backed variant example

Used when the thing under evaluation is an external system that persists a manifest and multiple outputs, but the eval config scores only one selected output surface.

```yaml
version: 1

golden_set: ./golden.jsonl
baseline: parakeet-v3-notes

artifact_selection:
  primary_output: note_txt
  copy_attachments: false

variants:
  - id: parakeet-v3-notes
    generator:
      kind: pipeline
      callable: demo_pipeline.runner:run_pipeline
    params:
      pipeline_config: ./configs/pipelines/parakeet_v3_default.yaml
      retain_outputs: [transcript_json, transcript_txt, note_json]

  - id: whisper-small-notes
    generator:
      kind: pipeline
      callable: demo_pipeline.runner:run_pipeline
    params:
      pipeline_config: ./configs/pipelines/whisper_small_default.yaml
      retain_outputs: [transcript_json, transcript_txt, note_json]
```

The external runner receives `case.input` at execution time (for example `audio_path`) and must return a manifest whose `outputs` map contains the configured `artifact_selection.primary_output`.

---

## 7. Scoring pipeline

Stages are executed in declared order per `(case, variant, iteration)`:

```
Generator → Primary Artifact (+ attachments, optional manifest refs)
          ↓
    ContractValidator → ContractResult (context forward)
          ↓
    [DeterministicScorer...] (optional, run in parallel if independent)
          ↓
    JudgeScorer (sees Artifact + ContractResult + prior deterministic Scores as context)
          ↓
    Aggregated Run record
```

**Primary artifact selection:** Every eval config chooses one logical output surface to score. All Variants in the bakeoff must expose that output key. If a manifest-backed generator omits it, the Run fails before contract/scoring. Other outputs may be retained as attachments.

**Gating:** A stage marked `gates_downstream: true` stops the pipeline if `passed=False`. Downstream stages still produce a `Score` with `value=None` and `passed=False` so the Run record is uniform.

**Context forwarding:** Each stage receives the original Case + primary Artifact + attachments + all prior stage outputs. The judge's prompt template can reference `{{contract_analysis}}` to inject machine analysis (nano-banana's pattern).

**Multiple surfaces:** If a team wants to optimize transcript quality and note quality separately, that is modeled as two eval configs with different `artifact_selection.primary_output` values, not as one run with joint aggregation.

**Parallelism:** Deterministic scorers run in parallel per Run. Judge is serialized per Run due to RPM caps.

---

## 8. Evaluator policy and fingerprinting

### 8.1 Fingerprint computation

```
evaluator_fingerprint = sha256(
    model_id || temperature || top_p ||
    rubric_hash || system_prompt_hash || n_averaging
)[:12]
```

Stored on every Run. A Bakeoff writes the fingerprint at the top of `summary.md` and `summary.json`.

### 8.2 Change behavior (configurable)

- `refuse`: bakeoff will not run if fingerprint differs from the project's pinned canonical (stored in `.smarteval/lock.json`).
- `warn`: runs, but prints a loud warning and tags the run as "non-canonical."

Default: `warn` (per user's "no baked-in opinion" choice; OSS ships with conservative `refuse` option in docs).

### 8.3 Re-baselining ritual

When rotating the canonical evaluator:

```bash
smarteval rebaseline \
  --from gemini-3.1-pro-preview \
  --to   gemini-4.0-pro \
  --on   ./golden.jsonl
```

Produces a calibration delta report (per-dimension, per-slice) comparing the same Artifacts scored under both evaluators. Requires explicit `--approve` to overwrite `.smarteval/lock.json`.

### 8.4 Rate-limit pacing

Generator and evaluator concurrency are decoupled (nano-banana pattern: gen concurrency 12, eval paced separately to 25 RPM). The executor maintains a token bucket per evaluator policy.

---

## 9. Router and specialists

### 9.1 Specialist detection (auto-surfaced in reports)

After a Bakeoff, the executor computes per-slice delta-vs-baseline for every variant. A Variant is flagged as a **specialist candidate** when:

- One slice has `delta >= specialist_lift_threshold` (default 0.30)
- All other slices have `delta >= -slice_regression_threshold` (default -0.10)
- `n_runs` on the winning slice >= `specialist_min_n` (default 10)

The report recommends adding the specialist to `router.yaml`. Promotion remains human-in-the-loop.

### 9.2 Router validation

A Bakeoff can include the RouterSpec as its own Variant. The executor dispatches each case according to matching rules and scores the resulting Artifact exactly like any other Variant. This keeps "the thing your app uses in prod" identical to "the thing eval validates."

### 9.3 Complexity budget

`max_specialists` caps the router's rule count. Adding a specialist that breaches the cap requires removing or merging another — forces the tradeoff into view.

---

## 10. LLM proposer

Single-call per invocation. No agent framework. No autonomous loop.

### 10.1 Context packet

Constructed from the last Bakeoff results + ledger:

```python
class ProposerContext(BaseModel):
    current_best_variant: Variant
    failure_cases: list[CaseFailure]     # case_id, tags, artifact, failure_modes, low-dim scores
    lowest_scoring_dimensions: list[DimensionSummary]
    rejected_variants: list[RejectedVariant]  # id, diff from baseline, why_killed — nearest-N by embedding
    constraints: dict[str, Any]          # max prompt length, frozen knobs
    hypothesis: str | None = None        # optional human steer
```

### 10.2 Output contract

The proposer returns **diffs over the search space**, not free prose:

```python
class VariantProposal(BaseModel):
    parent_variant_id: str
    rationale: str                       # why this diff should help — for ledger
    diff: dict[str, Any]                 # typed patch: {"params.prompt": ..., "generator.temperature": 0.2}
    expected_slice: str | None           # "hypothesis: helps cluttered_console"
```

### 10.3 Autonomy tiers

```yaml
autonomy:
  propose: suggest_only                  # default. Proposals printed, never auto-queued.
  propose: auto_queue                    # Opt-in. Top-K queued under budget; still needs verdict.
  run: manual                            # default. User runs `smarteval run --variant <id>`.
  run: auto_queue                        # Opt-in. Bakeoff runs proposed variants immediately.
  promote: manual                        # ALWAYS manual in v1. Reserved for v2.
```

### 10.4 Dedup against ledger

Before returning a proposal, the framework computes a similarity score (structural + embedding) against `verdicts.jsonl`. If nearest-neighbor is marked `dead`, the proposal is dropped and the proposer is re-prompted with the rejection in context.

### 10.5 Proposer model

Default: same family as the generator (cheap, creative). Not the canonical evaluator. Configurable.

---

## 11. Discovery ledger

### 11.1 File layout

```
ledger/
├── variants.jsonl                       # append-only, one variant per line
├── verdicts.jsonl                       # append-only, one verdict per line
└── notes/
    ├── R093-production-baseline.md      # human prose — the EVALUATION.md equivalent
    ├── R317-console-seg-mask-specialist.md
    └── R323-console-no-marker-anchored.md
```

### 11.2 `variants.jsonl` record

```jsonl
{"id":"hidden-cot-v2","parent_id":"production-v3","author":"human","hypothesis":"CoT preamble fixes ungrounded subs","diff":{"params.prompt":"./prompts/hidden-cot-v2.txt"},"created_at":"2026-04-17T11:02:00Z"}
```

### 11.3 `verdicts.jsonl` record

```jsonl
{"variant_id":"hidden-cot-v2","run_id":"2026-04-17T11-45-33","status":"specialist","promotion_level":"specialist","rationale":"+30pp on 'ungrounded' slice, noisy elsewhere at n=10. Specialist only.","killed_by":null,"follow_up_variant_id":null,"author":"Krzysztof","timestamp":"2026-04-17T12:30:00Z"}
```

### 11.4 CLI access

- `smarteval log` — chronological table: variant_id, parent, status, delta vs. baseline, cost, author.
- `smarteval log --tail 20`
- `smarteval log --status specialist`
- `smarteval verdict <run_id>` — interactive prompt writing the verdict record. User supplies `status`, `promotion_level`, `rationale`.

Human prose lives in `ledger/notes/` and is completely freeform. The framework never writes to those files; it only lists them in reports.

---

## 12. CLI surface

```
smarteval init [--name NAME] [--template text]
smarteval run   [--config PATH] [--tag TAG]... [--variant ID]... [--case-pattern GLOB] [--dry-run]
smarteval estimate [--config PATH]
smarteval resume  <run_id>
smarteval rescore [--since DATE] [--rubric PATH]
smarteval log     [--tail N] [--status STATUS]
smarteval diff    <run_id_a> <run_id_b>
smarteval propose [--context <run_id>] [--n 5]
smarteval verdict <run_id>                         # interactive
smarteval try-new-model <model_id> [--variants all|broad|specialists]
smarteval rebaseline --from MODEL --to MODEL --on GOLDEN --approve
smarteval doctor                                   # env + key + connectivity check
```

All commands read `smarteval.yaml` from CWD by default. Every command that makes network calls first writes a preflight line to stdout: calls, estimated cost, estimated duration, proceed prompt unless `--yes`.

---

## 13. End-user directory layout

What `smarteval init` produces:

```
my-eval/
├── smarteval.yaml                       # primary config
├── golden.jsonl                         # cases
├── prompts/
│   └── baseline.txt
├── rubrics/
│   └── default.yaml
├── schemas/                             # optional JSON schemas for contract stage
├── fixtures/                            # optional reference assets
├── router.yaml                          # optional
├── ledger/
│   ├── variants.jsonl
│   ├── verdicts.jsonl
│   └── notes/
│       └── .gitkeep
├── runs/                                # gitignored
├── .smarteval/
│   └── lock.json                        # pinned evaluator + golden hash
├── .env.example
├── .gitignore                           # runs/, .env
└── README.md
```

---

## 14. Framework source layout

```
smarteval/
├── pyproject.toml
├── README.md
├── LICENSE                              # Apache 2.0 recommended
├── src/smarteval/
│   ├── __init__.py
│   ├── cli/
│   │   ├── __init__.py
│   │   ├── main.py                      # click/typer entrypoint
│   │   ├── init.py
│   │   ├── run.py
│   │   ├── estimate.py
│   │   ├── rescore.py
│   │   ├── log.py
│   │   ├── diff.py
│   │   ├── propose.py
│   │   ├── verdict.py
│   │   ├── try_new_model.py
│   │   ├── rebaseline.py
│   │   └── doctor.py
│   ├── core/
│   │   ├── models.py                    # pydantic models (§5)
│   │   ├── config.py                    # YAML loader + validation
│   │   ├── pipeline.py                  # scoring pipeline executor
│   │   ├── runner.py                    # bakeoff executor, concurrency
│   │   ├── fingerprint.py               # evaluator fingerprint
│   │   ├── stats.py                     # paired bootstrap, CI
│   │   ├── slicing.py                   # per-tag aggregation
│   │   ├── specialists.py               # specialist detection
│   │   ├── budget.py                    # cost estimation + enforcement
│   │   └── rate_limit.py                # token bucket per evaluator
│   ├── plugins/
│   │   ├── generators/
│   │   │   ├── openai.py
│   │   │   ├── anthropic.py
│   │   │   ├── gemini.py
│   │   │   ├── script.py                # non-LLM callable
│   │   │   └── pipeline.py              # external pipeline + manifest-backed artifact selector
│   │   ├── scorers/
│   │   │   ├── exact_match.py
│   │   │   ├── regex_match.py
│   │   │   ├── embedding_sim.py
│   │   │   └── llm_rubric.py
│   │   ├── contracts/
│   │   │   ├── json_schema.py
│   │   │   ├── pydantic_model.py
│   │   │   └── regex.py
│   │   └── reporters/
│   │       ├── markdown.py
│   │       └── json_report.py
│   ├── proposer/
│   │   ├── context.py                   # packet builder
│   │   ├── dedup.py                     # similarity + ledger check
│   │   └── prompter.py                  # single-call LLM
│   ├── router/
│   │   ├── spec.py                      # RouterSpec model
│   │   └── dispatcher.py                # runtime dispatch
│   ├── ledger/
│   │   ├── reader.py
│   │   └── writer.py
│   └── reporting/
│       ├── markdown.py                  # summary.md template
│       ├── json_report.py               # summary.json + ci.json
│       └── diff.py                      # run-to-run diff
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── examples/
│   ├── text-exact-match/                # hello world
│   ├── recipe-adaptation/               # rubric + router example
│   └── non-llm-ranker/                  # classical algorithm example
└── docs/
    ├── getting-started.md
    ├── concepts.md
    ├── plugins.md
    ├── optimization.md                  # LLM proposer + ledger
    └── methodology.md                   # why these defaults
```

Plugin entry points declared in `pyproject.toml`:

```toml
[project.entry-points."smarteval.generators"]
openai = "smarteval.plugins.generators.openai:OpenAIGenerator"
anthropic = "smarteval.plugins.generators.anthropic:AnthropicGenerator"
gemini = "smarteval.plugins.generators.gemini:GeminiGenerator"
script = "smarteval.plugins.generators.script:ScriptGenerator"
pipeline = "smarteval.plugins.generators.pipeline:PipelineGenerator"

[project.entry-points."smarteval.scorers"]
exact_match = "smarteval.plugins.scorers.exact_match:ExactMatchScorer"
regex_match = "smarteval.plugins.scorers.regex_match:RegexMatchScorer"
embedding_sim = "smarteval.plugins.scorers.embedding_sim:EmbeddingSimScorer"
llm_rubric = "smarteval.plugins.scorers.llm_rubric:LLMRubricScorer"

[project.entry-points."smarteval.contracts"]
json_schema = "smarteval.plugins.contracts.json_schema:JSONSchemaValidator"
pydantic_model = "smarteval.plugins.contracts.pydantic_model:PydanticValidator"
regex = "smarteval.plugins.contracts.regex:RegexValidator"

[project.entry-points."smarteval.reporters"]
markdown = "smarteval.plugins.reporters.markdown:MarkdownReporter"
json = "smarteval.plugins.reporters.json_report:JSONReporter"
```

Third-party plugins install as separate packages; the framework discovers them via the same entry-point groups.

---

## 15. Run artifacts

Directory: `runs/<timestamp>__<bakeoff_id>/`.

```
runs/2026-04-17T14-32-08__ab12cd/
├── summary.md
├── summary.json
├── ci.json                              # optional, one-line pass/fail
├── lock.json                            # snapshot: evaluator_fingerprint, golden_hash, config_hash
├── by_case/
│   └── case-<id>__variant-<id>__iter-<n>.jsonl
├── artifacts/
│   └── case-<id>__variant-<id>__iter-<n>.<ext>
├── attachments/                         # optional copied sibling outputs when enabled
│   └── case-<id>__variant-<id>__iter-<n>__<name>.<ext>
└── logs/
    └── run.log
```

**Incremental writes:** every completed Run is flushed to `by_case/` before the next one starts. `summary.md` and `summary.json` are re-rendered after every N runs (default N=5) or on signal.

**Resume:** `smarteval resume <bakeoff_id>` reads `by_case/`, identifies the missing (case × variant × iteration) cells, and only runs those.

For manifest-backed generators, the per-case record stores the selected primary artifact plus `source_manifest` / `source_run_dir` references. `rescore` must reuse those stored references instead of rerunning the external pipeline.

---

## 16. Reporting

### 16.1 `summary.md` structure

```markdown
# Bakeoff 2026-04-17T14-32-08 (ab12cd)

Baseline: `production-v3` · Evaluator fingerprint: `7a2f91e3c8b4` · Golden hash: `d1e9f2...`
Runs per variant: 10 · Total cost: $3.42 · Duration: 18m 22s

## Aggregate

| Variant          | Pass rate    | Weighted score | Δ vs baseline | Latency p50 | $/case |
|------------------|--------------|----------------|---------------|-------------|--------|
| production-v3 ★  | 72% (65-79)  | 3.87           |    ref        | 2.1s        | $0.02  |
| hidden-cot       | 81% (75-88)  | 4.12           | +9pp ✓        | 2.3s        | $0.02  |
| classic-keyword  | 58% (51-65)  | n/a            | −14pp ✗       | 0.1s        | $0.00  |

★ = baseline. Ranges are 95% paired-bootstrap CI.

## Per-slice (tag: dietary)

[table]

## Specialist candidates

- `hidden-cot` → +22pp on slice `ungrounded` (n=10). Consider adding to router.yaml.

## Regressions

- None at p<0.1 for slice_regression_threshold=0.10.

## Artifacts
- `runs/.../by_case/` — per-run JSONL
- `summary.json` — machine-readable
- `ci.json` — CI gate result: PASS
```

### 16.2 `summary.json` structure

One object. Fields mirror the markdown but typed. Preserves every per-run detail. Machine-parseable.

### 16.3 `ci.json` (optional)

```json
{"status": "pass", "reason": null, "regressions": [], "specialists": [...]}
```

---

## 17. Gate semantics

All gates are defined in `smarteval.yaml` under `gates:`. The framework evaluates them after the Bakeoff completes and before writing `ci.json`.

| Gate | Default | Failure writes |
|---|---|---|
| `min_runs_per_variant` | 10 | `ci.json.status = "provisional"` |
| `slice_regression_threshold` | 0.10 | per-slice warning in `ci.json.regressions` |
| `slice_regression_action` | warn | `warn`: status=pass; `fail`: status=fail |
| `require_baseline` | true | refuses to run |
| `evaluator_fingerprint_change` | warn | `warn`: status=pass with warning; `refuse`: refuses to run |

The user's choice was per-project configurable with no baked-in opinion, so defaults lean permissive but documented; the getting-started doc walks through tightening them.

---

## 18. Plugin seams — authoring

A custom Generator:

```python
from smarteval.plugins import Generator
from smarteval.core.models import Case, Artifact

class MyGenerator(Generator):
    name = "my_generator"

    def __init__(self, **params):
        self.client = ...

    def generate(self, case: Case, params: dict) -> Artifact:
        result = self.client.run(case.input)
        return Artifact(kind="text", payload=result, metadata={"cost_usd": 0.001})
```

Register via entry point in the consuming package's `pyproject.toml`:

```toml
[project.entry-points."smarteval.generators"]
my_generator = "my_package.smarteval:MyGenerator"
```

Same pattern for Scorer, ContractValidator, Reporter. In v1, a Generator may return a text / JSON / path Artifact and may include attachment refs plus `source_manifest` when the result came from an external pipeline run.

---

## 19. Hello-world walkthrough

```bash
pip install smarteval
smarteval init my-eval --template text
cd my-eval
cp .env.example .env    # paste your API key
smarteval doctor        # validates keys + connectivity + .gitignore
smarteval estimate      # "6 calls, ~$0.04, ~15s. Proceed? [y/N]"
smarteval run           # runs, writes runs/<timestamp>/summary.md
cat runs/*/summary.md   # read the markdown
```

`smarteval.yaml` generated by `init`:

```yaml
version: 1
golden_set: ./golden.jsonl
baseline: baseline

evaluator:
  model: gpt-4o-mini
  temperature: 0.0
  n_averaging: 1        # low for hello-world

variants:
  - id: baseline
    generator: { kind: openai, model: gpt-4o-mini }
    params:
      prompt: ./prompts/baseline.txt

  - id: candidate
    generator: { kind: openai, model: gpt-4o }
    params:
      prompt: ./prompts/baseline.txt

pipeline:
  - id: match
    kind: exact_match
    field: answer

execution:
  runs_per_variant: 1
  concurrency: 3
  budget_usd: 0.10

reporting:
  formats: [markdown, json]

gates:
  min_runs_per_variant: 1    # lax for hello-world
```

`golden.jsonl`:

```jsonl
{"id":"q1","input":{"question":"What is 2+2?"},"expected":{"answer":"4"},"tags":["arithmetic"],"added_at":"2026-04-17"}
{"id":"q2","input":{"question":"Capital of France?"},"expected":{"answer":"Paris"},"tags":["geography"],"added_at":"2026-04-17"}
{"id":"q3","input":{"question":"Largest planet?"},"expected":{"answer":"Jupiter"},"tags":["astronomy"],"added_at":"2026-04-17"}
```

Total lines of user-authored config: ~35. Run in under 30 seconds. Output: one markdown table comparing two models on three cases. That's the whole thing.

---

## 20. Build sequence (milestones)

Approximate; architect re-estimates.

### Phase 0 — skeleton & core loop (1–2 weeks)
- `pyproject.toml`, package layout, `typer`/`click` CLI scaffold
- Pydantic models for Case, Variant, Run, Bakeoff, EvaluatorPolicy, Gates
- YAML config loader with validation
- `smarteval init` with text template
- `smarteval run` with `openai` + `anthropic` generators and `exact_match` scorer
- Dual output reporter (markdown + JSON), incremental writes, resume
- Unit tests for config, models, reporter
- `smarteval doctor`

**Exit criterion:** hello-world runs end-to-end; two generators, one scorer, two cases, markdown+JSON output.

### Phase 1 — scoring pipeline & methodology (2 weeks)
- Contract layer (json_schema, pydantic_model, regex)
- `gemini` generator, `script` generator (non-LLM), `pipeline` generator (manifest-backed external runner)
- LLM rubric scorer with evidence-required schema, n-averaging, dimension prompts
- Rubric YAML parsing + weight-sum enforcement
- Evaluator fingerprint computation + lock.json
- Paired bootstrap stats + Wilson CI
- Slice-level aggregation (`slice_by`)
- Specialist detection heuristic
- Rate-limit pacing (token bucket per evaluator)
- `smarteval estimate`, `smarteval diff`

**Exit criterion:** recipe-adaptation example runs with 3 variants × 10 cases × 3 iterations; per-slice report; evaluator fingerprint enforced.

### Phase 2 — router & ledger (2 weeks)
- RouterSpec model, router.yaml loader
- Runtime dispatcher (router as a Variant)
- Router end-to-end validation in bakeoff
- Ledger writer (variants.jsonl, verdicts.jsonl append-only)
- `smarteval log` + filters
- `smarteval verdict` interactive CLI
- Specialist candidate surfacing in reports

**Exit criterion:** an example project with 2 specialists in router.yaml; router bakeoff wins on per-slice averages; verdicts visible via `smarteval log`.

### Phase 3 — LLM proposer (2 weeks)
- ProposerContext builder
- Dedup against ledger (similarity + embedding)
- Proposer prompt template
- Autonomy tiers (`suggest_only`, `auto_queue`)
- `smarteval propose` CLI
- Integration: proposer reads last run, writes `variants.jsonl` entries

**Exit criterion:** `smarteval propose --context <run_id>` returns 5 typed diffs; running those diffs increases pass rate on at least one failure slice in a curated example.

### Phase 4 — migration & polish (1–2 weeks)
- `smarteval rescore` (re-run judge only, reuses cached Artifacts)
- `smarteval try-new-model` (run new model against router + broad default; produce candidate report)
- `smarteval rebaseline` (explicit evaluator rotation)
- Expanded docs: concepts, plugins, optimization, methodology
- `examples/` polish
- OSS readiness: license, CONTRIBUTING.md, issue templates, first release

**Exit criterion:** public 0.1.0 release tag; docs cover the three reference patterns (text only, with reference examples for image/search/code).

**Total:** 8–11 weeks for an OSS-quality v1.

---

## 21. Open design questions for architect

These surfaced during the team discussion and need an architect's call.

1. **Cached Artifact reuse for `rescore`.** Do we content-address Artifacts (hash of generator + prompt + case.input) and cache them in `runs/.artifacts-cache/` by default, or is cache opt-in? For manifest-backed generators, does the cache own copied artifacts or only stable references to external manifests? Impacts cost of `rescore` substantially.

2. **Parallelism model.** `asyncio` throughout, or `concurrent.futures` for generators and `asyncio` for evaluators, or `anyio` for portability? Rate limiting is easier in asyncio but most LLM SDKs have sync-friendly async clients now.

3. **Plugin discovery failure mode.** If a config references a plugin that isn't installed, do we (a) fail at `config.parse` time with install instructions, (b) fail at `bakeoff.start`, or (c) warn and skip? (a) is most helpful, (c) is OSS-friendly.

4. **Evaluator RPM bucket shape.** Per-process token bucket is obvious. Do we need a file-based lock for users running multiple bakeoffs in parallel from different shells? nano-banana hit 429s mid-run (R316); this is a real edge case.

5. **Proposer model as a config field vs. separate section.** Currently I'm assuming it's under `autonomy:` but it might belong under its own top-level `proposer:` block with its own model/temperature.

6. **Router rule ordering for overlapping matches.** First-match-wins is simple but silently hides bugs. Should we require `when` clauses to be mutually exclusive (validated at load), or emit a warning on ambiguity?

7. **Score normalization across plugins.** Every Scorer should emit `value: float ∈ [0, 1]` for uniform aggregation. NDCG and pass-rate are natively in that range; BLEU and embedding-sim need to be rescaled. Do we require the Scorer author to normalize, or provide a normalization utility, or both?

8. **Where does `try-new-model` draw the line between "generator swap" and "full re-baseline"?** If the new model is a candidate generator, keep baseline. If it's a candidate evaluator, force `rebaseline`. What if it's a new version of the current evaluator (e.g. `-v2` suffix) — warn vs. refuse?

9. **Ledger notes as a committed artifact.** Notes live under `ledger/notes/` and are freeform. Do we ship a `smarteval note new <run_id>` that scaffolds a markdown file with metadata frontmatter, or is file creation purely manual?

10. **`ci.json` schema stability.** This is the machine-readable contract CI gates will bind to. We need to commit to a schema version early because third-party CI actions will depend on it. Propose `schemaVersion: 1` with strict additive evolution.

11. **Failure-mode enum: shared registry or per-project?** Methodologist flagged this. Shared costs upfront design; free-form costs comparability across projects. Ship free-form in v1 with a linter that flags enum churn?

12. **Cost telemetry.** Should the framework aggregate cost at the Run, Bakeoff, and Ledger levels and expose via `smarteval log --costs`? Or is per-run enough for v1?

13. **Manifest contract strictness.** For external pipeline generators, do we require a framework-owned manifest schema with stable logical output keys, or allow generator-specific adapters to map arbitrary manifests into the canonical Artifact + attachments shape?

---

## 22. Glossary

| Term | Meaning |
|------|---------|
| **Artifact** | Raw output produced by a Generator (text, JSON, file path) |
| **Bakeoff** | One invocation of `smarteval run` — a cartesian product of cases × variants × iterations |
| **Baseline** | A Variant ID explicitly pinned in config as the comparison reference |
| **Canonical evaluator** | The project-pinned evaluator locked in `.smarteval/lock.json` |
| **Case** | One frozen input with tags, optional expected output, and metadata |
| **Contract** | Fast deterministic validation of Artifact structure (first pipeline stage) |
| **Discovery ledger** | Append-only JSONL record of every variant tried and its verdict |
| **Evaluator fingerprint** | Hash of (model, temp, top_p, rubric, system prompt) used to detect grader drift |
| **Generator** | The algorithm under evaluation: LLM call, classical ranker, pipeline, anything `Case → Artifact` |
| **Golden set** | Curated, versioned collection of Cases (the "frozen inputs" in article) |
| **Router** | Map from Case characteristics to Variant (the specialist routing policy) |
| **Rubric** | Weighted dimension definition used by a JudgeScorer |
| **Run** | One atomic `(case, variant, iteration)` execution with Artifact + Contract + Scores |
| **Scorer** | Deterministic or LLM-judge component that produces a Score from an Artifact |
| **Specialist** | A Variant that beats baseline on one slice but not broadly — routed selectively |
| **Variant** | One candidate configuration being compared in a Bakeoff |
| **Verdict** | Human-authored classification of a Variant's Bakeoff outcome |

---

*Prepared by the smarteval-design team (framework-architect, eval-methodologist, optimization-engineer, devex-lead) in consultation with Krzysztof Zabłocki. Architect review pending; engineering hand-off gated on architect sign-off.*

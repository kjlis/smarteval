# Codex Proposer And Multi-Round Optimizer

## Goal

Add two related capabilities to `smarteval`:

1. Make the proposer use local Codex by default instead of the OpenAI Responses API.
2. Add a script that starts from a config file, runs an initial bakeoff, then performs `N`
   propose-and-rerun rounds, defaulting to `5`, while persisting proposed variants into the ledger.

This work must reuse the existing bakeoff, proposer, and ledger flow instead of introducing a
second orchestration model.

## Current State

Today:

- `llm_rubric` already defaults to local Codex.
- `propose_variants(...)` still uses the OpenAI Responses client directly.
- `smarteval propose` can already:
  - build proposer context from a run
  - generate proposals
  - materialize proposals into child variants
  - persist them into the ledger
  - optionally run a focused bakeoff with baseline plus proposed variants

The missing piece is a default local Codex proposer backend and a loop runner that chains these
rounds together from a config file.

## Recommended Approach

Use the existing proposer and ledger flow as the system of record.

This means:

- keep proposal generation in `src/smarteval/proposer/prompter.py`
- keep proposal materialization in `src/smarteval/proposer/materialize.py`
- keep ledger persistence in `src/smarteval/ledger/writer.py`
- keep focused reruns using `run_bakeoff(...)`
- add only a thin orchestration layer for multi-round execution

This avoids duplicating run semantics, variant persistence, and proposal deduplication.

## Design

### 1. Proposer Backend

Refactor the proposer so it supports two backends:

- `codex_local`: default
- `openai`: explicit fallback

The proposer will mirror the scorer backend pattern already used by `llm_rubric`:

- accept `backend`, defaulting to `codex_local`
- accept optional `codex_bin`
- keep `model`
- preserve test injection via a passed client object

Behavior by backend:

- `codex_local`
  - build a client with `build_codex_client(...)`
  - start a Codex thread with the requested model
  - run the prompt
  - parse `result.final_response` as JSON
- `openai`
  - preserve the current Responses API call path

The prompt contract remains unchanged:

- valid JSON
- top-level key `proposals`
- each item shaped like `VariantProposal`

### 2. Proposer Settings Source

The proposer currently receives its model from `config.evaluator.model`. For this pass, keep that
behavior to avoid adding a second top-level policy block.

The new proposer backend selection will come from:

- a `backend` parameter on `propose_variants(...)`
- the new loop script using `codex_local` by default

The existing CLI `propose` command should also switch to `codex_local` by default, with optional
override support for `openai`.

### 3. Proposal Diff Shape For Pipeline Search

To keep materialization deterministic and simple, proposals for pipeline variants must update the
whole pipeline config value rather than attempting nested patch syntax.

Supported proposal diff for this use case:

```json
{
  "parent_variant_id": "asr-fast",
  "rationale": "Switch to whisper and improve preprocessing alignment",
  "diff": {
    "params.pipeline_config": {
      "preprocessing": {
        "denoise": "mild",
        "voice_enhancement": "on",
        "silence_trimming": "conservative",
        "vad": "basic"
      },
      "asr": {"model": "whisper"},
      "note_generation": {"model": "gpt-5-mini", "prompt_style": "soap"}
    }
  },
  "expected_slice": "asr-demo"
}
```

No deep dot-path patching under `params.pipeline_config.*` will be added in this pass.

### 4. Multi-Round Optimization Script

Add a script that starts from a config path and executes:

1. initial bakeoff from the provided config
2. round loop:
   - read previous run summary and records
   - build proposer context
   - generate up to `n` proposals
   - deduplicate against ledger rejections
   - materialize proposals into child variants
   - persist materialized variants into the ledger
   - run a focused bakeoff containing baseline plus proposed variants
   - use the resulting run dir as input to the next round

Parameters:

- `--path`: required config path
- `--rounds`: default `5`
- `--proposals-per-round`: default `3`
- `--output-root`: default `runs`
- `--model`: optional override for proposer model
- `--backend`: optional override, default `codex_local`
- `--codex-bin`: optional explicit Codex binary path

Outputs:

- normal run directories under the chosen output root
- persisted proposal variants in `ledger/variants.jsonl`
- normal verdict compatibility with existing ledger conventions
- a loop trace JSON file under `.smarteval/optimization-runs/`

### 5. Loop Trace Format

Write one machine-readable trace file per optimization session with:

- config path
- rounds requested
- rounds completed
- proposer backend
- proposer model
- initial run dir
- per-round entries:
  - source run dir
  - proposed variant ids
  - queued run dir
  - best variant id after the round
  - best mean score after the round

This provides a stable artifact for inspection without replacing the ledger or run summaries.

## Data Flow

### Initial Run

`config` -> `run_bakeoff(...)` -> `run_dir_0`

### Each Optimization Round

`run_dir_i` -> `read_summary(...)` + `load_run_records(...)` -> `build_proposer_context(...)`
-> `propose_variants(...)`
-> `materialize_proposals(...)`
-> `append_materialized_proposals(...)`
-> focused `run_bakeoff(...)`
-> `run_dir_(i+1)`

### Scoring Path

Generated pipeline artifact -> scoring pipeline -> local Codex `llm_rubric` by default

### Proposal Path

Prior run summary + failures + rejected ledger history -> local Codex proposer by default

## Error Handling

### Missing Codex SDK

If the proposer backend is `codex_local` and the SDK is missing, raise a direct runtime error using
the same style as the existing Codex client helper.

### Codex Session Access Problems

If the environment cannot access `~/.codex/sessions`, surface the underlying Codex error directly.
Do not silently fall back to OpenAI.

### Empty Proposal Result

If a round returns zero accepted proposals:

- record the round in the optimization trace
- stop the loop early
- return success with `rounds_completed < rounds_requested`

### Proposal Materialization Failures

If Codex returns unsupported diff keys:

- fail that round explicitly
- preserve the raw proposal payload in the trace if practical
- do not write partial child variants

## Testing

Add tests for:

1. proposer defaults to local Codex backend
2. proposer still supports explicit `backend="openai"`
3. Codex proposer parses JSON proposals correctly
4. Codex proposer respects client injection in tests
5. loop script:
   - runs an initial bakeoff from config
   - persists proposed child variants into the ledger
   - chains queued run dirs across multiple rounds
   - stops early when no proposals are produced

The loop tests should stub the proposer and reuse deterministic local generators so they remain fast
and do not depend on live model calls.

## Scope Boundaries

Included:

- default local Codex proposer
- explicit OpenAI proposer fallback
- multi-round loop script starting from config
- ledger persistence for inspection

Not included:

- autonomous promotion or verdict writing
- deep nested diff patch semantics
- asynchronous orchestration
- replacing the existing `propose` CLI with a new optimization command
- live integration tests that require external Codex access

## Risks And Mitigations

### Risk: Pipeline config diffs become inconsistent

Mitigation:
- require full `params.pipeline_config` replacements in proposals

### Risk: Optimization loop becomes a second orchestration model

Mitigation:
- make the loop script a thin wrapper over existing proposer and run functions

### Risk: Codex and scorer backends drift in behavior

Mitigation:
- reuse the same Codex client helper style and explicit backend selection pattern

## Implementation Order

1. Refactor proposer backend handling
2. Add proposer tests for Codex default and OpenAI override
3. Add optimization loop script
4. Add loop tests with stub proposer responses
5. Update README and CLI docs with optimizer usage

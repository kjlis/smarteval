# Scoring And Gates

The scoring pipeline is ordered. Each stage is either:

- a contract validator
- a scorer

## Built-In Validators

- `json_schema`
- `pydantic_model`
- `regex`
- `length_bounds`
- `custom_predicate`

## Built-In Scorers

- `exact_match`
- `regex_match`
- `embedding_sim`
- `llm_rubric`

## Gating

Stages support:

- `gates_downstream: true`
- `gated_by: [stage_id]`

If a required prior stage fails, the blocked stage is recorded as skipped instead of executing.

## LLM Rubric

`llm_rubric` uses the OpenAI Responses API and the evaluator policy from config.

Typical stage:

```yaml
- id: note_quality
  kind: llm_rubric
  rubric: rubrics/note_quality.yaml
```

The scorer normalizes the rubric output into `[0, 1]`.

## Embedding Similarity

`embedding_sim` is a lightweight semantic similarity scorer. The current implementation uses a local hashed-text similarity approximation, not an external embedding API.

```yaml
- id: semantic_match
  kind: embedding_sim
  threshold: 0.80
```

## Summaries

Per run directory:

- `summary.md`: human-readable aggregate summary
- `summary.json`: machine-readable summary
- `ci.json`: optional CI-oriented status file
- `lock.json`: config and evaluator snapshot for that bakeoff

The aggregate summary includes:

- pass rate
- mean score
- bootstrap confidence intervals
- delta vs baseline
- paired delta confidence intervals
- per-slice summaries
- specialist candidates
- regression warnings

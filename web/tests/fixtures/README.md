# e2e test fixtures

- `asr-graph.json` — snapshot of `web/public/data/graph.json` generated from
  `examples/asr_manifest/.smarteval/` by `scripts/export-graph.mjs`. Used as the realistic
  happy-path fixture: 6 bakeoffs, 16 variants, 15 accepted proposals, 1 optimization session
  with 5 rounds.
- `synthetic-graph.json` — hand-written export covering edge cases the ASR data does not
  exercise: rejected proposals (both exact and semantic), a variant with `failed_run_count > 0`,
  a historical ancestor missing from the latest bakeoff (ghost/unscored), a
  no-winner bakeoff, and an all-rejected round.

Regenerate `asr-graph.json` with:

```sh
npm run export-data
cp public/data/graph.json tests/fixtures/asr-graph.json
```

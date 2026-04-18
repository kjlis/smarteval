# Bakeoff 2026-04-18T13-27-45

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 113927ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.360 | ref | 30321.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-1 | 0.00% (0.00%-0.00%) | 0.460 | +0.100 | 33969.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2 | 100.00% (100.00%-100.00%) | 0.760 | +0.400 | 27454.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-3 | 0.00% (0.00%-0.00%) | 0.460 | +0.100 | 22183.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-1` on `asr-demo`: score=+0.460 delta=+0.100 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2` on `asr-demo`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-3` on `asr-demo`: score=+0.460 delta=+0.100 n=1
- `baseline` on `note`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-1` on `note`: score=+0.460 delta=+0.100 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2` on `note`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-3` on `note`: score=+0.460 delta=+0.100 n=1
- `baseline` on `optimization-path`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-1` on `optimization-path`: score=+0.460 delta=+0.100 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2` on `optimization-path`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-3` on `optimization-path`: score=+0.460 delta=+0.100 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418132531-1-proposal-20260418132745-2` score=0.760 delta=+0.400

- Step 1: `baseline` -> `baseline-proposal-20260418132531-1` (delta vs parent=n/a, total delta=n/a)
  Justification: Switch to a more robust ASR path and a SOAP-style stronger note model to recover missed clinical details and produce cleaner chart structure on choppy audio.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Whisper plus SOAP note generation with balanced cleanup for fragmented recordings.`; params -> pipeline config -> asr -> model changed from `parakeet` to `whisper`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `soap`; ... (+4 more)
- Step 2: `baseline-proposal-20260418132531-1` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2` (delta vs parent=n/a, total delta=+0.400)
  Justification: Keep the stronger Whisper baseline but shift generation toward fuller chart-ready capture by preserving more quiet context and using a more complete note style.
  Evaluator note: This is a strong, mostly accurate clinical note that captures the key encounter facts and presents them in a clean SOAP format. Its main weaknesses are modest omissions in assessment/plan nuance and an inappropriate meta-evaluative closing sentence that breaks clinical tone and polish.
  Changes: params -> pipeline config -> note generation -> prompt style changed from `soap` to `detailed`; params -> pipeline config -> preprocessing -> silence trimming changed from `moderate` to `conservative`; params -> pipeline config -> preprocessing -> vad changed from `balanced` to `moderate`

## Regressions

- None

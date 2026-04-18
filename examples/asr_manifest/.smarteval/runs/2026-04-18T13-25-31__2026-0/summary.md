# Bakeoff 2026-04-18T13-25-31

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 100421ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.380 | ref | 24744.0 | $0.0000 |
| baseline-proposal-20260418132531-1 | 0.00% (0.00%-0.00%) | 0.520 | +0.140 | 22967.0 | $0.0000 |
| baseline-proposal-20260418132531-2 | 0.00% (0.00%-0.00%) | 0.360 | -0.020 | 31795.0 | $0.0000 |
| baseline-proposal-20260418132531-3 | 0.00% (0.00%-0.00%) | 0.460 | +0.080 | 20915.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418132531-1` on `asr-demo`: score=+0.520 delta=+0.140 n=1
- `baseline-proposal-20260418132531-2` on `asr-demo`: score=+0.360 delta=-0.020 n=1
- `baseline-proposal-20260418132531-3` on `asr-demo`: score=+0.460 delta=+0.080 n=1
- `baseline` on `note`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418132531-1` on `note`: score=+0.520 delta=+0.140 n=1
- `baseline-proposal-20260418132531-2` on `note`: score=+0.360 delta=-0.020 n=1
- `baseline-proposal-20260418132531-3` on `note`: score=+0.460 delta=+0.080 n=1
- `baseline` on `optimization-path`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418132531-1` on `optimization-path`: score=+0.520 delta=+0.140 n=1
- `baseline-proposal-20260418132531-2` on `optimization-path`: score=+0.360 delta=-0.020 n=1
- `baseline-proposal-20260418132531-3` on `optimization-path`: score=+0.460 delta=+0.080 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418132531-1` score=0.520 delta=+0.140

- Step 1: `baseline` -> `baseline-proposal-20260418132531-1` (delta vs parent=+0.140, total delta=+0.140)
  Justification: Switch to a more robust ASR path and a SOAP-style stronger note model to recover missed clinical details and produce cleaner chart structure on choppy audio.
  Evaluator note: The artifact preserves many core history and exam facts and maintains a basic clinical-note structure, but it falls short of the expected standard. Its main problems are missing key clinical details such as allergy and full vitals, a generic and incomplete plan without explicit return precautions, and obvious meta/evaluation leakage that makes the note feel less professional and less chart-ready.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Whisper plus SOAP note generation with balanced cleanup for fragmented recordings.`; params -> pipeline config -> asr -> model changed from `parakeet` to `whisper`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `soap`; ... (+4 more)

## Regressions

- None

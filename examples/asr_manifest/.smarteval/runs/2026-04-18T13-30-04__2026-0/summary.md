# Bakeoff 2026-04-18T13-30-04

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 98487ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.300 | ref | 32137.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-1 | 0.00% (0.00%-0.00%) | 0.420 | +0.120 | 21776.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2 | 0.00% (0.00%-0.00%) | 0.520 | +0.220 | 20297.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-3 | 0.00% (0.00%-0.00%) | 0.460 | +0.160 | 24277.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-1` on `asr-demo`: score=+0.420 delta=+0.120 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` on `asr-demo`: score=+0.520 delta=+0.220 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-3` on `asr-demo`: score=+0.460 delta=+0.160 n=1
- `baseline` on `note`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-1` on `note`: score=+0.420 delta=+0.120 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` on `note`: score=+0.520 delta=+0.220 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-3` on `note`: score=+0.460 delta=+0.160 n=1
- `baseline` on `optimization-path`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-1` on `optimization-path`: score=+0.420 delta=+0.120 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` on `optimization-path`: score=+0.520 delta=+0.220 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-3` on `optimization-path`: score=+0.460 delta=+0.160 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` score=0.520 delta=+0.220

- Step 1: `baseline` -> `baseline-proposal-20260418132531-1` (delta vs parent=n/a, total delta=n/a)
  Justification: Switch to a more robust ASR path and a SOAP-style stronger note model to recover missed clinical details and produce cleaner chart structure on choppy audio.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Whisper plus SOAP note generation with balanced cleanup for fragmented recordings.`; params -> pipeline config -> asr -> model changed from `parakeet` to `whisper`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `soap`; ... (+4 more)
- Step 2: `baseline-proposal-20260418132531-1` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2` (delta vs parent=n/a, total delta=n/a)
  Justification: Keep the stronger Whisper baseline but shift generation toward fuller chart-ready capture by preserving more quiet context and using a more complete note style.
  Changes: params -> pipeline config -> note generation -> prompt style changed from `soap` to `detailed`; params -> pipeline config -> preprocessing -> silence trimming changed from `moderate` to `conservative`; params -> pipeline config -> preprocessing -> vad changed from `balanced` to `moderate`
- Step 3: `baseline-proposal-20260418132531-1-proposal-20260418132745-2` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` (delta vs parent=n/a, total delta=+0.220)
  Justification: Keeping whisper but shifting the generator toward a stricter SOAP structure with stronger preprocessing should test whether the main issue is formatting discipline and cleanup rather than the ASR backbone.
  Evaluator note: The artifact preserves the main clinical picture and core assessment, but it falls short of the expected note in several clinically important areas. Key omissions include the penicillin allergy, several vitals, and the explicit return precautions; the plan is also noticeably more generic. In addition, awkward phrasing and meta-commentary about transcript drift and comparison to a golden note make the document less professional and less chart-ready.
  Changes: params -> pipeline config -> note generation -> prompt style changed from `detailed` to `soap`; params -> pipeline config -> preprocessing -> denoise changed from `mild` to `aggressive`; params -> pipeline config -> preprocessing -> silence trimming changed from `conservative` to `moderate`; params -> pipeline config -> preprocessing -> vad changed from `moderate` to `balanced`; ... (+1 more)

## Regressions

- None

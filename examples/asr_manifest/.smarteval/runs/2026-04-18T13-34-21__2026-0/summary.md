# Bakeoff 2026-04-18T13-34-21

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 105472ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.360 | ref | 29567.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1 | 100.00% (100.00%-100.00%) | 0.760 | +0.400 | 26792.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-2 | 0.00% (0.00%-0.00%) | 0.320 | -0.040 | 25507.0 | $0.0000 |
| baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-3 | 0.00% (0.00%-0.00%) | 0.460 | +0.100 | 23606.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1` on `asr-demo`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-2` on `asr-demo`: score=+0.320 delta=-0.040 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-3` on `asr-demo`: score=+0.460 delta=+0.100 n=1
- `baseline` on `note`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1` on `note`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-2` on `note`: score=+0.320 delta=-0.040 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-3` on `note`: score=+0.460 delta=+0.100 n=1
- `baseline` on `optimization-path`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1` on `optimization-path`: score=+0.760 delta=+0.400 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-2` on `optimization-path`: score=+0.320 delta=-0.040 n=1
- `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-3` on `optimization-path`: score=+0.460 delta=+0.100 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1` score=0.760 delta=+0.400

- Step 1: `baseline` -> `baseline-proposal-20260418132531-1` (delta vs parent=n/a, total delta=n/a)
  Justification: Switch to a more robust ASR path and a SOAP-style stronger note model to recover missed clinical details and produce cleaner chart structure on choppy audio.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Whisper plus SOAP note generation with balanced cleanup for fragmented recordings.`; params -> pipeline config -> asr -> model changed from `parakeet` to `whisper`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `soap`; ... (+4 more)
- Step 2: `baseline-proposal-20260418132531-1` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2` (delta vs parent=n/a, total delta=n/a)
  Justification: Keep the stronger Whisper baseline but shift generation toward fuller chart-ready capture by preserving more quiet context and using a more complete note style.
  Changes: params -> pipeline config -> note generation -> prompt style changed from `soap` to `detailed`; params -> pipeline config -> preprocessing -> silence trimming changed from `moderate` to `conservative`; params -> pipeline config -> preprocessing -> vad changed from `balanced` to `moderate`
- Step 3: `baseline-proposal-20260418132531-1-proposal-20260418132745-2` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` (delta vs parent=n/a, total delta=n/a)
  Justification: Keeping whisper but shifting the generator toward a stricter SOAP structure with stronger preprocessing should test whether the main issue is formatting discipline and cleanup rather than the ASR backbone.
  Changes: params -> pipeline config -> note generation -> prompt style changed from `detailed` to `soap`; params -> pipeline config -> preprocessing -> denoise changed from `mild` to `aggressive`; params -> pipeline config -> preprocessing -> silence trimming changed from `conservative` to `moderate`; params -> pipeline config -> preprocessing -> vad changed from `moderate` to `balanced`; ... (+1 more)
- Step 4: `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1` (delta vs parent=n/a, total delta=n/a)
  Justification: Swap to the alternate ASR path and ease preprocessing slightly to reduce transcript-artifact leakage while preserving low-volume clinical details such as meds, allergies, and return precautions.
  Changes: params -> pipeline config -> asr -> model changed from `whisper` to `parakeet`; params -> pipeline config -> preprocessing -> denoise changed from `aggressive` to `mild`; params -> pipeline config -> preprocessing -> silence trimming changed from `moderate` to `conservative`; params -> pipeline config -> preprocessing -> vad changed from `balanced` to `moderate`
- Step 5: `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1` -> `baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-1` (delta vs parent=n/a, total delta=+0.400)
  Justification: Switch to whisper for potentially cleaner medical transcription and pair it with a more complete note prompt to improve factual capture, return precautions, and removal of transcript leakage.
  Evaluator note: This is a strong artifact with good factual fidelity, solid SOAP organization, and appropriate core plan/precautions. It falls short of the expected note mainly through small omissions in assessment and counseling detail and, more importantly, a clear meta-evaluation sentence that breaks clinical style and presentation.
  Changes: description changed from `Whisper plus SOAP note generation with balanced cleanup for fragmented recordings.` to `Whisper transcription with a detailed clinical note prompt to improve completeness and reduce transcript leakage.`; params -> pipeline config -> asr -> model changed from `parakeet` to `whisper`; params -> pipeline config -> note generation -> model changed from `gpt-5` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `soap` to `detailed`

## Regressions

- None

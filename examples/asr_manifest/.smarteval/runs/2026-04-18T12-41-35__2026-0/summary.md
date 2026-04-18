# Bakeoff 2026-04-18T12-41-35

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 85510ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.300 | ref | 23356.0 | $0.0000 |
| baseline-proposal-20260418124135-1 | 0.00% (0.00%-0.00%) | 0.200 | -0.100 | 14791.0 | $0.0000 |
| baseline-proposal-20260418124135-2 | 0.00% (0.00%-0.00%) | 0.220 | -0.080 | 25018.0 | $0.0000 |
| baseline-proposal-20260418124135-3 | 0.00% (0.00%-0.00%) | 0.220 | -0.080 | 22345.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418124135-1` on `asr-demo`: score=+0.200 delta=-0.100 n=1
- `baseline-proposal-20260418124135-2` on `asr-demo`: score=+0.220 delta=-0.080 n=1
- `baseline-proposal-20260418124135-3` on `asr-demo`: score=+0.220 delta=-0.080 n=1
- `baseline` on `note`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418124135-1` on `note`: score=+0.200 delta=-0.100 n=1
- `baseline-proposal-20260418124135-2` on `note`: score=+0.220 delta=-0.080 n=1
- `baseline-proposal-20260418124135-3` on `note`: score=+0.220 delta=-0.080 n=1
- `baseline` on `optimization-path`: score=+0.300 delta=n/a n=1
- `baseline-proposal-20260418124135-1` on `optimization-path`: score=+0.200 delta=-0.100 n=1
- `baseline-proposal-20260418124135-2` on `optimization-path`: score=+0.220 delta=-0.080 n=1
- `baseline-proposal-20260418124135-3` on `optimization-path`: score=+0.220 delta=-0.080 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418124135-3` score=0.220 delta=-0.080

- Step 1: `baseline` -> `baseline-proposal-20260418124135-3` (delta vs parent=-0.080, total delta=-0.080)
  Justification: The strongest candidate is a combined variant that improves both transcript fidelity and note synthesis. This directly targets the observed failures in factual capture, completeness, clinical style, and precautions.
  Evaluator note: The artifact is far below the expected note. It preserves only the patient name and main complaint, while omitting nearly all clinically relevant details and failing to provide any usable assessment, plan, or precautions. It is also harmed by obvious nonclinical leakage, so despite being readable at a sentence level, it is not an acceptable clinical follow-up note.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Higher-fidelity preprocessing plus structured clinical note generation for fuller, cleaner outpatient notes.`; params -> pipeline config -> asr -> model changed from `parakeet` to `parakeet`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `structured_clinical`; ... (+4 more)

## Regressions

- None

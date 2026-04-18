# Bakeoff 2026-04-18T12-43-22

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 74125ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.380 | ref | 23573.0 | $0.0000 |
| baseline-proposal-20260418124322-1 | 0.00% (0.00%-0.00%) | 0.220 | -0.160 | 13873.0 | $0.0000 |
| baseline-proposal-20260418124322-2 | 0.00% (0.00%-0.00%) | 0.220 | -0.160 | 17558.0 | $0.0000 |
| baseline-proposal-20260418124322-3 | 0.00% (0.00%-0.00%) | 0.220 | -0.160 | 19121.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124322-1` on `asr-demo`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-2` on `asr-demo`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-3` on `asr-demo`: score=+0.220 delta=-0.160 n=1
- `baseline` on `note`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124322-1` on `note`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-2` on `note`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-3` on `note`: score=+0.220 delta=-0.160 n=1
- `baseline` on `optimization-path`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124322-1` on `optimization-path`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-2` on `optimization-path`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124322-3` on `optimization-path`: score=+0.220 delta=-0.160 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418124322-3` score=0.220 delta=-0.160

- Step 1: `baseline` -> `baseline-proposal-20260418124322-3` (delta vs parent=-0.160, total delta=-0.160)
  Justification: The strongest combined bet is to improve both factual retention and final note quality: preserve more source detail upstream and use a more capable note generator with a structured clinical style downstream.
  Evaluator note: The artifact fails as a clinical note. It captures only the chief complaint at a very high level, omits nearly all required clinical content, provides no assessment or plan, and includes obvious non-clinical leakage about pipeline settings and demo profiles. Overall, it is far from the expected note in both substance and presentation.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Higher-fidelity pipeline for chart-ready follow-up notes with better retention and stronger generation.`; params -> pipeline config -> asr -> model changed from `parakeet` to `parakeet`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `clinical_structured`; ... (+4 more)

## Regressions

- baseline-proposal-20260418124322-1 regressed vs baseline by -0.160
- baseline-proposal-20260418124322-2 regressed vs baseline by -0.160
- baseline-proposal-20260418124322-3 regressed vs baseline by -0.160

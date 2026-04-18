# Bakeoff 2026-04-18T12-40-07

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 66182ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.380 | ref | 21370.0 | $0.0000 |
| baseline-proposal-20260418124007-1 | 0.00% (0.00%-0.00%) | 0.220 | -0.160 | 14710.0 | $0.0000 |
| baseline-proposal-20260418124007-2 | 0.00% (0.00%-0.00%) | 0.220 | -0.160 | 13899.0 | $0.0000 |
| baseline-proposal-20260418124007-3 | 0.00% (0.00%-0.00%) | 0.200 | -0.180 | 16203.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124007-1` on `asr-demo`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-2` on `asr-demo`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-3` on `asr-demo`: score=+0.200 delta=-0.180 n=1
- `baseline` on `note`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124007-1` on `note`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-2` on `note`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-3` on `note`: score=+0.200 delta=-0.180 n=1
- `baseline` on `optimization-path`: score=+0.380 delta=n/a n=1
- `baseline-proposal-20260418124007-1` on `optimization-path`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-2` on `optimization-path`: score=+0.220 delta=-0.160 n=1
- `baseline-proposal-20260418124007-3` on `optimization-path`: score=+0.200 delta=-0.180 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418124007-2` score=0.220 delta=-0.160

- Step 1: `baseline` -> `baseline-proposal-20260418124007-2` (delta vs parent=-0.160, total delta=-0.160)
  Justification: Some rubric misses look like dropped or weakened source facts, especially timeline, medications, allergy, and precautions. Relaxing overly aggressive preprocessing should preserve more usable transcript detail for the downstream note writer.
  Evaluator note: The artifact fails as a clinical evaluation note despite the contract passing. It omits nearly all medically relevant content from the case and expected note, adds irrelevant meta-level statements, and provides no usable assessment, plan, or return precautions. Overall quality is very poor across the rubric.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Reduce information loss in preprocessing to preserve more clinical detail for note generation.`; params -> pipeline config set to `None`

## Regressions

- baseline-proposal-20260418124007-1 regressed vs baseline by -0.160
- baseline-proposal-20260418124007-2 regressed vs baseline by -0.160
- baseline-proposal-20260418124007-3 regressed vs baseline by -0.180

# Bakeoff 2026-04-18T12-44-59

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 74537ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.320 | ref | 21727.0 | $0.0000 |
| baseline-proposal-20260418124459-1 | 0.00% (0.00%-0.00%) | 0.220 | -0.100 | 22257.0 | $0.0000 |
| baseline-proposal-20260418124459-2 | 0.00% (0.00%-0.00%) | 0.220 | -0.100 | 15542.0 | $0.0000 |
| baseline-proposal-20260418124459-3 | 0.00% (0.00%-0.00%) | 0.220 | -0.100 | 15011.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.320 delta=n/a n=1
- `baseline-proposal-20260418124459-1` on `asr-demo`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-2` on `asr-demo`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-3` on `asr-demo`: score=+0.220 delta=-0.100 n=1
- `baseline` on `note`: score=+0.320 delta=n/a n=1
- `baseline-proposal-20260418124459-1` on `note`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-2` on `note`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-3` on `note`: score=+0.220 delta=-0.100 n=1
- `baseline` on `optimization-path`: score=+0.320 delta=n/a n=1
- `baseline-proposal-20260418124459-1` on `optimization-path`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-2` on `optimization-path`: score=+0.220 delta=-0.100 n=1
- `baseline-proposal-20260418124459-3` on `optimization-path`: score=+0.220 delta=-0.100 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418124459-3` score=0.220 delta=-0.100

- Step 1: `baseline` -> `baseline-proposal-20260418124459-3` (delta vs parent=-0.100, total delta=-0.100)
  Justification: If the task is to turn noisy transcript output into a polished outpatient note, model capacity is likely part of the bottleneck. A stronger note-generation model paired with a more explicit clinical style should improve fidelity, plan specificity, and presentation.
  Evaluator note: The artifact fails as an evaluation note despite passing the contract mechanically. It omits nearly all clinically relevant content from the case and expected note, replaces it with irrelevant meta commentary, and provides no usable structure, assessment detail, plan, or return precautions. Overall, this is far below the expected standard for a clinical follow-up note.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Upgrade note generation model and prompt for fuller clinical synthesis and cleaner plan/precautions.`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `structured_clinical`

## Regressions

- baseline-proposal-20260418124459-1 regressed vs baseline by -0.100
- baseline-proposal-20260418124459-2 regressed vs baseline by -0.100
- baseline-proposal-20260418124459-3 regressed vs baseline by -0.100

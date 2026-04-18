# Bakeoff 2026-04-18T12-38-18

Baseline: `baseline` · Evaluator fingerprint: `68a006d5a756` · Golden hash: `29006320a251`
Total cost: $0.0000 · Duration: 78868ms

## Aggregate

| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |
|---|---:|---:|---:|---:|---:|
| baseline | 0.00% (0.00%-0.00%) | 0.360 | ref | 23864.0 | $0.0000 |
| baseline-proposal-20260418123818-1 | 0.00% (0.00%-0.00%) | 0.220 | -0.140 | 17989.0 | $0.0000 |
| baseline-proposal-20260418123818-2 | 0.00% (0.00%-0.00%) | 0.220 | -0.140 | 17154.0 | $0.0000 |
| baseline-proposal-20260418123818-3 | 0.00% (0.00%-0.00%) | 0.220 | -0.140 | 19861.0 | $0.0000 |

## Per-slice

- `baseline` on `asr-demo`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418123818-1` on `asr-demo`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-2` on `asr-demo`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-3` on `asr-demo`: score=+0.220 delta=-0.140 n=1
- `baseline` on `note`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418123818-1` on `note`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-2` on `note`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-3` on `note`: score=+0.220 delta=-0.140 n=1
- `baseline` on `optimization-path`: score=+0.360 delta=n/a n=1
- `baseline-proposal-20260418123818-1` on `optimization-path`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-2` on `optimization-path`: score=+0.220 delta=-0.140 n=1
- `baseline-proposal-20260418123818-3` on `optimization-path`: score=+0.220 delta=-0.140 n=1

## Specialist candidates

- None

## Best Improvement Path

Winner: `baseline-proposal-20260418123818-3` score=0.220 delta=-0.140

- Step 1: `baseline` -> `baseline-proposal-20260418123818-3` (delta vs parent=-0.140, total delta=-0.140)
  Justification: This case needs both better transcript preservation and stricter note formatting. Combining less lossy preprocessing with a stronger structured generator is the highest-upside variant for factual capture and clinical polish.
  Evaluator note: The artifact fails as a clinical evaluation note. It preserves only minimal identifying context and the chief complaint, omits nearly all expected clinical content, and adds irrelevant non-clinical commentary. Compared with the expected note, it is severely incomplete, not actionable, and not suitable for clinical documentation.
  Changes: description changed from `Weak baseline deterministic demo with rough language and vague planning.` to `Joint upgrade for noisy ASR inputs and chart-ready note output.`; params -> pipeline config -> note generation -> model changed from `gpt-5-mini` to `gpt-5`; params -> pipeline config -> note generation -> prompt style changed from `brief` to `structured`; params -> pipeline config -> preprocessing -> denoise changed from `off` to `on`; ... (+3 more)

## Regressions

- baseline-proposal-20260418123818-1 regressed vs baseline by -0.140
- baseline-proposal-20260418123818-2 regressed vs baseline by -0.140
- baseline-proposal-20260418123818-3 regressed vs baseline by -0.140

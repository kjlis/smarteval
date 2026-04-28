---
description: Summarize Smarteval run results and recommend whether to apply a candidate.
---

# Smarteval Report

Use this workflow after a baseline and candidate run exist.

1. Run `smarteval compare $ARGUMENTS` if baseline and candidate run IDs are provided.
2. Run `smarteval report $ARGUMENTS`.
3. Read `.smarteval/evals/<name>/reports/latest.md`.
4. Summarize metric-level movement, regressions, cost, latency, dataset weakness, judge limitations, and human/image review findings.
5. Recommend apply, revise, collect more examples, or stop. Do not apply a candidate when regressions are unexplained.

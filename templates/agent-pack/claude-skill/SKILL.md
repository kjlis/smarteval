---
name: smarteval
description: Use when evaluating or improving LLM prompts, RAG answers, structured outputs, image prompts, or agent workflows with a repo-local Smarteval eval loop.
---

# Smarteval Workflow

Use Smarteval before changing probabilistic AI behavior unless the user explicitly asks you to skip evaluation.

Prefer subscription-backed Claude Code evals before API-backed judging:

```bash
smarteval config defaults --preset claude
smarteval doctor
```

1. Run `smarteval doctor` if `.smarteval/` exists.
2. Run `smarteval plan` or inspect the existing `.smarteval/evals/<name>/eval.yaml`.
3. Confirm target, allowed levers, scoring vectors, and budget.
4. Run `smarteval run --baseline`.
5. Inspect baseline failures.
6. Propose candidate hypotheses using `smarteval propose` or manual candidate files.
7. Run only approved candidates.
8. Compare baseline and candidate runs.
9. Generate a markdown report.
10. Do not apply a candidate unless metric-level movement and regressions are understood.

Always report cost, latency, safety, format adherence, limitations, and dataset weakness.

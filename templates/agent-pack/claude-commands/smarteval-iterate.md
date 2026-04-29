---
description: Run an agent-led Smarteval improvement loop for an approved eval.
---

# Smarteval Iterate

Use this workflow after the engineer approves the eval target, dataset, scoring vectors, allowed levers, fixed constraints, and iteration budget.

1. Run `smarteval agent-task $ARGUMENTS` if no `.smarteval/agent-tasks/<eval_name>.md` runbook exists.
2. Read the generated runbook and `.smarteval/evals/<eval_name>/eval.yaml`.
3. Run `smarteval doctor` and `smarteval validate --eval <eval_name>`.
4. Run `smarteval run --eval <eval_name> --baseline --concurrency 1` and record the baseline run ID.
5. Inspect per-example failures before changing code. Fix the harness or dataset first if the baseline output is invalid.
6. For each requested iteration:
   - Create or update one candidate file describing the hypothesis.
   - Edit only approved levers.
   - Run `smarteval run --eval <eval_name> --candidate <candidate_id> --concurrency 1`.
   - Compare against the baseline and current best run with `smarteval compare`.
   - Keep notes on wins, regressions, cost, latency, and judge limitations.
7. Generate `smarteval report` for the best candidate.
8. Recommend apply, revise, collect more examples, or stop. Do not apply a candidate with unexplained regressions.

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
2. Explore the repository target before writing eval files: find the AI entrypoint, inputs, outputs, prompt/model levers, existing tests, mocks, and side effects.
3. Run `smarteval plan --name <eval_name> --goal "<behavior goal>" --iterations <n>` or inspect the existing `.smarteval/evals/<name>/eval.yaml`.
4. Build the smallest command harness needed to exercise the real behavior for one dataset row and print normalized stdout. For image evals, emit `{"image_path":"...","metadata":{...}}`.
5. Confirm target, dataset shape, allowed levers, fixed constraints, scoring vectors, judge provider, and budget with the engineer before running candidates.
6. Run `smarteval validate --eval <name>`.
7. Run `smarteval run --eval <name> --baseline`.
8. Inspect baseline failures and decide whether the eval is measuring valid behavior before changing levers.
9. For each approved iteration, create or update a candidate file, change only approved levers, run `smarteval run --candidate <id>`, compare against baseline and current best, then keep or revert that candidate's edits based on evidence.
10. Generate a markdown report for the best candidate.
11. Do not apply a candidate unless metric-level movement and regressions are understood.

Always report cost, latency, safety, format adherence, limitations, and dataset weakness.

For agent-led loops, generate a durable runbook first:

```bash
smarteval agent-task --name <eval_name> --goal "<behavior goal>" --iterations <n> --provider claude
```

Use `.smarteval/agent-tasks/<eval_name>.md` as the checklist for repo exploration, harness creation, baseline, candidate runs, comparison, and winner selection.

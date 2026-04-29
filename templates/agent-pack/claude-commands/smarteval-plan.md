---
description: Create or review a Smarteval plan before changing AI behavior.
---

# Smarteval Plan

Use this workflow before editing prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflow instructions.

1. Run `smarteval doctor` if `.smarteval/` exists.
2. Prefer `smarteval config defaults --preset claude` for local subscription-backed planning and judging.
3. Inspect `docs/smarteval_context_for_ai_coding_agents.md` if present.
4. Explore the target code path before writing eval files: entrypoint, inputs, outputs, prompts, model settings, existing tests, mocks, side effects, and safe local execution path.
5. Run `smarteval plan $ARGUMENTS` when no suitable eval exists, or inspect `.smarteval/evals/<name>/eval.yaml`.
6. Build or repair the smallest command harness needed to run one dataset row and print normalized output.
7. Ask the engineer to confirm target, dataset shape, allowed levers, fixed constraints, scoring vectors, budget, and provider defaults before changing production behavior.
8. Do not run candidates until a baseline exists.

---
description: Create or review a Smarteval plan before changing AI behavior.
---

# Smarteval Plan

Use this workflow before editing prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflow instructions.

1. Run `smarteval doctor` if `.smarteval/` exists.
2. Prefer `smarteval config defaults --preset claude` for local subscription-backed planning and judging.
3. Inspect `docs/smarteval_context_for_ai_coding_agents.md` if present.
4. Run `smarteval plan $ARGUMENTS` when no suitable eval exists, or inspect `.smarteval/evals/<name>/eval.yaml`.
5. Ask the engineer to confirm target, allowed levers, fixed constraints, scoring vectors, budget, and provider defaults before changing production behavior.
6. Do not run candidates until a baseline exists.

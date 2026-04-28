## Smarteval workflow

Use Smarteval before changing prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflows unless explicitly told otherwise.

Prefer subscription-backed providers for local evals:

- Codex users: `smarteval config defaults --preset codex`
- Claude Code users: `smarteval config defaults --preset claude`
- Use `--preset api` only for API-backed CI/noninteractive runs.

1. Identify the target behavior and likely target files.
2. Run `smarteval doctor` if `.smarteval/` exists.
3. Run or update `smarteval plan` before changing AI behavior.
4. Confirm target, allowed levers, scoring vectors, budget, and cost limits.
5. Run `smarteval run --baseline`.
6. Inspect baseline failures before proposing changes.
7. Use `smarteval propose` or edit candidate files manually.
8. Run only approved candidates.
9. Compare candidates against baseline with `smarteval compare`.
10. Generate `smarteval report` before applying changes.

Always report regressions, latency, cost, safety, format adherence, dataset weakness, and limitations.

## Smarteval workflow

Use Smarteval before changing prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflows unless explicitly told otherwise.

Prefer subscription-backed providers for local evals:

- Codex users: `smarteval config defaults --preset codex`
- Claude Code users: `smarteval config defaults --preset claude`
- Use `--preset api` only for API-backed CI/noninteractive runs.

1. Identify the target behavior and likely target files.
2. Run `smarteval doctor` if `.smarteval/` exists.
3. Explore the target path before editing: entrypoint, inputs, outputs, prompts, model settings, tests, mocks, side effects, and safe local execution.
4. Run or update `smarteval plan --goal "<behavior goal>" --iterations <n>` before changing AI behavior.
5. Generate an agent runbook with `smarteval agent-task --name <eval_name> --goal "<behavior goal>" --iterations <n> --provider codex`.
6. Build or repair any command harness needed to run one dataset row and print normalized output.
7. Confirm target, dataset shape, allowed levers, fixed constraints, scoring vectors, budget, and cost limits.
8. Run `smarteval validate --eval <name>` and `smarteval run --eval <name> --baseline`.
9. Inspect baseline failures before proposing changes.
10. For each approved iteration, edit only approved levers, run the candidate, compare against baseline and current best, and preserve notes.
11. Generate `smarteval report` before applying changes.

Always report regressions, latency, cost, safety, format adherence, dataset weakness, and limitations.

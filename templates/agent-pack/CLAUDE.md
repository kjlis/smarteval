## Smarteval

Use Smarteval for controlled evaluation of probabilistic AI behavior. Do not edit prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflows before a baseline exists unless explicitly asked.

Prefer Claude Code subscription-backed evals:

```bash
smarteval config defaults --preset claude
smarteval doctor
```

Prefer the Smarteval skill or CLI:

- `smarteval plan --goal "<behavior goal>" --iterations <n>`
- `smarteval agent-task --name <eval_name> --goal "<behavior goal>" --iterations <n> --provider claude`
- `smarteval validate`
- `smarteval run --baseline`
- `smarteval propose`
- `smarteval compare`
- `smarteval report`

Before running candidates, explore the target code path, build or repair any command harness needed to exercise one dataset row, confirm allowed levers and fixed constraints, and record the baseline run ID.

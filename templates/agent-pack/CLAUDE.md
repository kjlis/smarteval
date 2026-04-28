## Smarteval

Use Smarteval for controlled evaluation of probabilistic AI behavior. Do not edit prompts, model configs, retrieval settings, structured-output instructions, image prompts, or agent workflows before a baseline exists unless explicitly asked.

Prefer Claude Code subscription-backed evals:

```bash
smarteval config defaults --preset claude
smarteval doctor
```

Prefer the Smarteval skill or CLI:

- `smarteval plan`
- `smarteval run --baseline`
- `smarteval propose`
- `smarteval compare`
- `smarteval report`

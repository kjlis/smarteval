# Development

## Local Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
.venv/bin/python -m pytest -q
```

## Package Layout

- `src/smarteval/core`: framework runtime and shared models
- `src/smarteval/plugins`: builtin generators, validators, scorers
- `src/smarteval/ledger`: JSONL persistence
- `src/smarteval/proposer`: optimization helpers
- `src/smarteval/reporting`: summary writers
- `src/smarteval/cli`: Typer app
- `tests`: unit and CLI coverage

## Plugin Extension Points

Entry point groups:

- `smarteval.generators`
- `smarteval.contracts`
- `smarteval.scorers`

## Testing Expectations

- add tests for behavior changes
- prefer direct unit coverage for core logic
- add CLI tests when command behavior changes
- keep examples runnable but lightweight

## Behavioral Rules

- do not rerun generators during `rescore`
- keep a single primary artifact per run
- use `rebaseline` for evaluator changes
- preserve ledger history instead of mutating old entries

## Release Notes

Before cutting a release:

1. run the full test suite
2. verify `README.md` and `docs/` examples
3. confirm example configs still validate
4. review CLI help output for changed commands

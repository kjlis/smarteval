# Smarteval

Smarteval is a repo-local evaluation loop for controlled changes to probabilistic AI behavior. It keeps plans, datasets, candidates, runs, scores, and reports in files that humans and coding agents can review.

## Quick start

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js plan --name support_summary --target node scripts/eval-target.js
node dist/cli.js validate --eval support_summary
node dist/cli.js run --eval support_summary --baseline
node dist/cli.js report --eval support_summary --candidate <run_id>
```

Command targets receive one dataset row as JSON on stdin and should print the target output on stdout.

## Artifact layout

```text
.smarteval/
  config.yaml
  evals/
    <eval_name>/
      eval.yaml
      dataset.jsonl
      candidates/
      runs/
      reports/
```

## Main commands

- `smarteval init` creates `.smarteval/config.yaml`.
- `smarteval plan` creates a starter eval plan, dataset, and baseline candidate.
- `smarteval dataset add` appends examples to `dataset.jsonl`.
- `smarteval validate` validates eval, dataset, and candidate artifacts.
- `smarteval run --baseline` or `smarteval run --candidate <id>` runs the target and writes artifacts.
- `smarteval compare` compares two run score files.
- `smarteval report` writes a markdown report to `.smarteval/evals/<name>/reports/latest.md`.
- `smarteval propose` creates human-editable candidate files.
- `smarteval apply <candidate> --dry-run` prints a candidate without changing production code.
- `smarteval doctor` checks the local setup.
- `smarteval agent-pack install` copies Codex and Claude skill templates into a target repo.

## MVP scope

This implementation supports command targets, JSONL datasets, deterministic evaluators, runtime metrics, baseline/candidate run artifacts, comparison, markdown reports, OpenRouter judges, command judges, optional Codex/Claude SDK judges, and agent-pack templates. Python and Node function targets are represented in schemas but should be wrapped with command targets until their adapters are implemented.

Optional judge SDKs are loaded dynamically:

- `codex_sdk` expects `@openai/codex-sdk`.
- `claude_agent_sdk` expects `@anthropic-ai/claude-agent-sdk`.

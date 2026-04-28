# Smarteval

Smarteval is a repo-local evaluation loop for controlled changes to probabilistic AI behavior. It keeps plans, datasets, candidates, runs, scores, and reports in files that humans and coding agents can review.

## Quick start

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js plan --manual --name support_summary --target node scripts/eval-target.js
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
- `smarteval plan` is assisted-first. Use a configured planner provider, `--planner-provider command --planner-command <cmd...>`, or `--manual`.
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

## Planning modes

`smarteval plan` does not silently create a generic scaffold. Planning is expected to be assisted by a repo-aware planner unless you opt into manual mode:

```bash
smarteval plan --manual --name support_summary --target node scripts/eval-target.js
```

For assisted planning without native SDK coupling, use a command planner:

```bash
smarteval plan --planner-provider command --planner-command node scripts/smarteval-planner.js
```

The command planner receives JSON on stdin with the eval name, repo root, and optional target command. It must print JSON with `eval`, `dataset`, `candidates`, optional `rubrics`, and optional follow-up `questions`.

Native/API planner providers are also available:

```bash
smarteval plan --planner-provider codex_sdk --planner-model gpt-5.3-codex
smarteval plan --planner-provider claude_agent_sdk --planner-model claude-sonnet-4-5
OPENROUTER_API_KEY=... smarteval plan --planner-provider openrouter_api --planner-model openai/gpt-5.4-mini
```

Codex and Claude planner SDK packages are loaded only when those providers are used.

## Defaults

Repo defaults live in `.smarteval/config.yaml`. For example, to make Codex with GPT-5.5 the default planner:

```yaml
schema_version: "1"
defaults:
  planner:
    provider: codex_sdk
    model: gpt-5.5
  judge:
    provider: openrouter_api
    model: openai/gpt-5.4-mini
  max_cost_usd: 1
  concurrency: 2
```

CLI flags override config defaults. For example, `smarteval plan --planner-provider openrouter_api` overrides the configured planner provider for that command only.

Optional judge SDKs are loaded dynamically:

- `codex_sdk` expects `@openai/codex-sdk`.
- `claude_agent_sdk` expects `@anthropic-ai/claude-agent-sdk`.

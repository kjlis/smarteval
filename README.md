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
- `smarteval config defaults` updates default planner, judge, budget, and concurrency settings.
- `smarteval plan` is assisted-first. Use a configured planner provider, `--planner-provider command --planner-command <cmd...>`, or `--manual`.
- `smarteval dataset add` appends examples to `dataset.jsonl`.
- `smarteval validate` validates eval, dataset, and candidate artifacts.
- `smarteval run --baseline` or `smarteval run --candidate <id>` runs the target and writes artifacts.
- `smarteval compare` compares two run score files.
- `smarteval report` writes a markdown report to `.smarteval/evals/<name>/reports/latest.md`.
- `smarteval review import` imports human image review ratings for a run.
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

Repo defaults live in `.smarteval/config.yaml`. Smarteval is subscription-first by default: Codex or Claude Code providers should be the normal planner/judge path so developers can use the subscriptions they already have instead of paying per eval call through a model API.

For Codex:

```yaml
schema_version: "1"
defaults:
  planner:
    provider: codex_sdk
    model: gpt-5.5
  judge:
    provider: codex_sdk
    model: gpt-5.5
  max_cost_usd: 1
  concurrency: 2
```

For Claude Code:

```yaml
schema_version: "1"
defaults:
  planner:
    provider: claude_agent_sdk
    model: claude-sonnet-4-5
  judge:
    provider: claude_agent_sdk
    model: claude-sonnet-4-5
  max_cost_usd: 1
  concurrency: 2
```

CLI flags override config defaults. For example, `smarteval plan --planner-provider openrouter_api` overrides the configured planner provider for that command only when an API-backed run is intended.

Optional judge SDKs are loaded dynamically:

- `codex_sdk` expects `@openai/codex-sdk` and supports Codex SDK turn results with `result`, `content`, or `finalResponse`.
- `claude_agent_sdk` expects `@anthropic-ai/claude-agent-sdk` and supports the V2 `unstable_v2_prompt()` shortcut plus the stable `query()` async-generator interface.

You can update defaults without editing YAML:

```bash
smarteval config defaults --preset codex
smarteval config defaults --preset claude
```

Use the API preset only when you specifically want noninteractive/API-backed runs:

```bash
smarteval config defaults --preset api
```

Run `smarteval doctor` after changing SDK-backed defaults. It warns when `@openai/codex-sdk` or `@anthropic-ai/claude-agent-sdk` is missing.

## Codex and Claude Code Agent Pack

Install repo-local instructions and templates for both agents:

```bash
smarteval agent-pack install --target .
```

This writes:

- `AGENTS.md` for Codex-style repo instructions.
- `CLAUDE.md` for Claude Code project memory.
- `.codex/skills/smarteval/` with Smarteval workflow and references.
- `.claude/skills/smarteval/` with the same workflow.
- `.claude/commands/smarteval-plan.md` and `.claude/commands/smarteval-report.md` for explicit Claude Code slash-command workflows.

## Image evals

Command targets can emit image artifacts by setting `target.output_mode: image_artifact`. In this mode, stdout must be JSON:

```json
{
  "image_path": "generated.png",
  "metadata": {
    "model": "my-image-model",
    "prompt_version": "v3"
  }
}
```

Relative image paths are resolved from the repo root and copied into the run directory under `artifacts/images/`. Reports include relative image thumbnails and artifact metadata.

Supported deterministic image metrics:

```yaml
target:
  type: command
  command: ["node", "scripts/generate-image.js"]
  output_mode: image_artifact
scoring_vectors:
  exists:
    type: image_exists
    weight: 0.2
  mime:
    type: image_mime_type
    allowed: ["image/png", "image/jpeg"]
    weight: 0.2
  dimensions:
    type: image_dimensions
    min_width: 512
    min_height: 512
    min_aspect_ratio: 0.9
    max_aspect_ratio: 1.2
    weight: 0.2
  size:
    type: image_file_size
    max_bytes: 2000000
    weight: 0.2
  nonblank:
    type: image_not_blank
    weight: 0.2
  unique:
    type: image_unique
    weight: 0.2
```

For subjective visual quality, collect blind ratings externally and import them:

```csv
example_id,winner,quality_score,content_score,notes
case_001,candidate,5,4,Better prompt adherence
case_002,baseline,2,3,Candidate distorted subject
```

```bash
smarteval review import --eval image_demo --run <run_id> --file ratings.csv
smarteval report --eval image_demo --candidate <run_id>
```

For local multimodal judging, `command_judge` receives `image_artifact.absolute_path` and, when the dataset reference includes `image_path` or `reference_image_path`, `reference_image_artifact.absolute_path`. A starter rubric is available in `templates/agent-pack/references/image-judge-rubric-template.md`.

Multimodal `llm_judge` provider behavior:

- `codex_sdk` sends generated/reference image artifacts as Codex SDK `local_image` input entries.
- `claude_agent_sdk` uses a tool-mediated path: the prompt includes image paths and enables Claude Code's `Read` tool so the agent can inspect images locally.
- `openrouter_api` sends generated/reference image artifacts as base64 `image_url` content parts. Use a vision-capable OpenRouter model for image judging.

To compare baseline and candidate images directly with a local judge:

```bash
smarteval review pairwise-command \
  --eval image_demo \
  --baseline <baseline_run_id> \
  --candidate <candidate_run_id> \
  --rubric "Prefer prompt adherence, subject correctness, and fewer visual defects." \
  -- node scripts/pairwise-image-judge.js
```

The command receives JSON with `baseline_image_artifact.absolute_path`, `candidate_image_artifact.absolute_path`, `example_id`, and `rubric`, and must return JSON with `winner`, `rationale`, and optional `criteria`.

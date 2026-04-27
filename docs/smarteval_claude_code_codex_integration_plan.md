# Smarteval Claude Code and Codex Integration Plan

This plan defines how Smarteval should become useful to engineers who work with AI coding agents such as Claude Code and Codex.

The goal is not to create another generic eval platform. The useful product space is narrower and sharper:

> Smarteval should be the repo-local eval loop that an AI coding agent can safely run while improving prompts, RAG behavior, structured outputs, and agent workflows.

If Smarteval cannot make that loop easier than writing a quick script or using an existing eval tool, it should not exist as a standalone project.

---

## 1. Critical Assessment

### Strong points in the current idea

- The problem is real. Engineers using AI coding agents often change prompts, model settings, retrieval behavior, or agent instructions without a repeatable regression loop.
- Repo-local artifacts are the right default. Agents and humans can inspect files, review diffs, and discuss concrete runs instead of relying on chat history.
- Baseline-first is a strong discipline. It prevents agents from making unmeasured prompt changes and then rationalizing them after the fact.
- Explicit allowed levers are essential. This is the difference between a controlled experiment and an agent randomly editing production behavior.
- Decomposed scoring is the right model. Aggregate scores are useful for sorting, but not for decision-making on their own.
- CLI-first is the right integration surface. Both Claude Code and Codex can run commands, read files, edit artifacts, and summarize results.

### Weak points and gaps

- The original plan was too integration-heavy too early. Skills, hooks, MCP, slash commands, CI, and dashboards only matter after the local loop proves useful.
- The plan underplayed existing competitors. Promptfoo, LangSmith, Braintrust, DeepEval, OpenAI Evals, and similar tools already cover large parts of LLM evaluation. Smarteval needs a specific wedge.
- The proposed CLI was command-rich but not workflow-clear. Engineers need one obvious first path, not a list of verbs.
- Dataset creation was underspecified. Most eval projects fail because the dataset is weak, too small, synthetic-only, or missing edge cases.
- Judge quality was underspecified. LLM-as-judge can be useful, but it introduces bias, grader drift, verbosity bias, reward hacking, and false confidence.
- Cost and runtime controls were too vague. Agent-driven eval loops can accidentally run expensive experiments unless budgets are first-class.
- "Generate a harness" was treated as simple. In real codebases, targets are often side-effectful, authenticated, async, stateful, or dependent on external services.
- It did not define when Smarteval should defer to existing tools instead of competing with them.
- It did not define a minimal adoption promise. A new engineer should be able to get a meaningful first eval in 15-30 minutes.

### Product judgment

There is a good space for Smarteval if it is positioned as:

> A local, agent-friendly eval workbench for controlled AI behavior changes inside a real repository.

There is not a good space if it tries to become:

- a full observability platform,
- a hosted experiment dashboard,
- a generic benchmark runner,
- a replacement for Promptfoo, LangSmith, Braintrust, or OpenAI Evals,
- an autonomous prompt optimizer that edits production code without engineer review.

The strongest wedge is the interaction between coding agents and eval discipline: Smarteval should make agents behave like careful engineers when they change AI behavior.

---

## 2. Product Thesis

Smarteval should help an engineer answer:

1. What AI behavior am I trying to improve?
2. What examples represent success, failure, and edge cases?
3. What is the current baseline?
4. What can the agent change safely?
5. Which candidate changes improved which metrics?
6. What regressed?
7. Is the result strong enough to patch, or should we stop?

The first version should optimize for trust and adoption, not automation depth.

### MVP promise

An engineer should be able to run:

```bash
smarteval init
smarteval plan
smarteval run
smarteval report
```

And get:

- a readable eval plan,
- a small dataset file,
- a baseline run,
- candidate comparison,
- a report that can be pasted into a PR.

If this path is not simple, the product will not be adopted.

### Non-goals for MVP

- No hosted service.
- No team dashboard.
- No automatic production prompt edits.
- No full image-generation eval support.
- No broad agent trajectory optimization.
- No MCP server requirement.
- No CI gate requirement.
- No complex optimizer or search algorithm.

---

## 3. Competitive Context

Smarteval should assume engineers may already know or use:

- **Promptfoo**: strong open-source CLI for prompt, model, RAG, and red-team evals.
- **LangSmith**: strong tracing and eval workflow, especially in LangChain-heavy stacks.
- **Braintrust**: strong experiment tracking, comparison, datasets, and production-oriented workflows.
- **DeepEval / Confident AI**: Python-native pytest-style evals plus a commercial platform.
- **OpenAI Evals and graders**: useful when the team is already centered on OpenAI model evaluation workflows.

Smarteval should not pretend these do not exist.

### Differentiation

Smarteval should win when:

- the engineer is already using a coding agent,
- the behavior lives inside an application repo,
- the team wants local, reviewable artifacts,
- the agent needs a safe protocol before editing prompts or configs,
- the engineer wants a lightweight eval loop without adopting a hosted platform.

### Integration posture

Smarteval should be able to export to or interoperate with existing tools later. For example:

- export JSONL results for Promptfoo or custom dashboards,
- import traces from LangSmith, Braintrust, Langfuse, or OpenTelemetry,
- use OpenAI grader-compatible concepts where useful,
- run as a local CI check once teams trust the eval.

Do not build these integrations before the core loop works.

---

## 4. Design Principles

1. **Start from the target behavior, not from tooling.**
   The user should describe what they want improved before Smarteval asks about frameworks or providers.

2. **Make the first eval cheap.**
   Support 5-20 examples, deterministic checks, one baseline, and one candidate before introducing larger experiments.

3. **Prefer deterministic evaluators.**
   Use schema checks, exact checks, regex checks, JSON validation, field-level checks, latency, cost, and error rate whenever possible.

4. **Treat LLM judges as fallible.**
   Require explicit rubrics, judge model/config metadata, example score anchors, and visible rationale. Encourage pairwise or pass/fail scoring for subjective dimensions.

5. **Keep candidate changes isolated.**
   A candidate should change one coherent strategy at a time. Do not change the evaluator and the target in the same experiment unless explicitly marked.

6. **Never hide trade-offs.**
   Reports must show quality, cost, latency, format adherence, safety, error rate, and known limitations separately.

7. **Do not require users to learn a platform.**
   Smarteval should feel like a focused repo tool, not a system that demands migration.

8. **Let agents help, but keep engineers in control.**
   Agents can inspect, propose, run, and summarize. Engineers approve levers, budgets, and patches.

---

## 5. Core Architecture

Build Smarteval as five layers, in this order:

```text
smarteval-core
  Evaluation plan schema, run model, scoring, comparison, reports.

smarteval-cli
  The stable interface used by humans, Claude Code, Codex, and CI.

.smarteval/
  Repo-local plans, datasets, candidates, runs, and reports.

smarteval-agent-pack
  AGENTS.md snippets, Claude skill, Codex skill, and optional command aliases.

smarteval-integrations
  Later adapters for MCP, CI, trace import, and external eval tools.
```

The CLI and artifact contract are the product. Agent integrations should be thin wrappers around that contract.

### Implementation language recommendation

Use **TypeScript first** for the Smarteval CLI and core package.

Reasons:

- the Codex SDK TypeScript library is the more direct and stable path for controlling local Codex agents, while the Python SDK is currently more experimental;
- the Claude Agent SDK has strong TypeScript support and is natural for local Claude Code integration;
- OpenRouter provides TypeScript examples and an SDK, and its API is close enough to OpenAI-style chat completions to keep the provider abstraction clean;
- TypeScript gives good schema ergonomics with libraries such as Zod, which fits human-readable config validation and structured judge outputs;
- npm/bun-based installation is familiar to many engineers using AI coding agents in application repos.

Keep the design language-neutral by supporting:

- `command` targets for Python, Ruby, Go, Rust, shell, and arbitrary repos;
- JSONL inputs and outputs;
- custom evaluator commands;
- a future Python package only if Python-heavy teams need native imports rather than command adapters.

Do not build TypeScript and Python implementations in parallel for the MVP. That would slow the core loop and create duplicated behavior too early.

---

## 6. Repo Artifact Contract

Use explicit files that can be read by humans and coding agents:

```text
.smarteval/
  config.yaml
  evals/
    <eval_name>/
      eval.yaml
      dataset.jsonl
      candidates/
        baseline.yaml
        candidate_001.yaml
      evaluators/
        custom_evaluator.py
      runs/
        <run_id>/
          manifest.json
          results.jsonl
          scores.json
          costs.json
          failures.jsonl
      reports/
        latest.md
```

### Required metadata

Every run should record:

- Smarteval version,
- eval schema version,
- git commit or dirty-worktree marker,
- target entrypoint,
- dataset hash,
- candidate ID,
- model/provider configuration,
- evaluator configuration,
- random seed or repetition settings when available,
- cost and latency summary,
- errors and timeouts.

Without this metadata, reports are not auditable.

---

## 7. CLI UX

The CLI should have one obvious path and a few advanced commands.

### Primary happy path

```bash
smarteval init
smarteval plan
smarteval run --baseline
smarteval propose
smarteval run --candidate candidate_001
smarteval compare
smarteval report
```

### Better command shape

```bash
smarteval init
smarteval plan [--target <entrypoint>] [--name <eval_name>]
smarteval dataset add [--from-traces <path>] [--interactive]
smarteval validate
smarteval run [--baseline | --candidate <id>] [--max-cost-usd <amount>]
smarteval propose [--count 3]
smarteval compare [--baseline <run_id>] [--candidate <run_id>]
smarteval apply <candidate_id> --dry-run
smarteval report [--format markdown|json]
smarteval doctor
```

### Commands to avoid in MVP

- `smarteval optimize`
- `smarteval auto-fix`
- `smarteval deploy`
- `smarteval monitor`

Those names imply too much autonomy or platform scope.

---

## 8. MVP Scope

The MVP should support:

- text-generation targets,
- structured-output targets,
- Python and JavaScript/TypeScript callable targets,
- shell-command target adapter for arbitrary repos,
- JSONL datasets,
- deterministic evaluators,
- LLM-as-judge evaluators with rubric files,
- runtime metrics,
- baseline and candidate runs,
- simple candidate proposal,
- markdown report generation,
- agent instruction snippets.

### Target adapters

Start with three adapters:

```yaml
target:
  type: python_function
  entrypoint: app.services.summarizer:generate_summary
```

```yaml
target:
  type: node_function
  entrypoint: src/summarizer.ts:generateSummary
```

```yaml
target:
  type: command
  command: ["bun", "run", "scripts/eval-target.ts"]
```

The command adapter is important because it lets teams adopt Smarteval without reshaping their code.

---

## 9. Dataset Strategy

Dataset creation is a first-class product problem.

Smarteval should guide the engineer to create:

- 5-10 smoke examples for the first baseline,
- 20-50 development examples for prompt iteration,
- a validation split for candidate comparison,
- a holdout split when the eval starts influencing production changes.

Each dataset row should allow:

```json
{
  "id": "ticket_001",
  "input": {},
  "reference": {},
  "tags": ["refund", "angry_customer", "long_thread"],
  "notes": "Known failure: summary misses the requested refund action."
}
```

Smarteval should actively warn about:

- too few examples,
- no negative examples,
- no edge cases,
- synthetic-only examples,
- missing production traces,
- missing expected outputs for reference-based metrics,
- judge-only scoring.

---

## 10. Evaluator Strategy

Support evaluator types in this priority order:

1. deterministic checks,
2. reference-based checks,
3. runtime metrics,
4. LLM-as-judge,
5. human review hooks.

### LLM judge requirements

Every LLM judge should store:

- judge model,
- provider,
- prompt/rubric,
- score range,
- pass threshold,
- rationale,
- sampling parameters where supported,
- examples of low, medium, and high scores when available.

Reports should warn when a winning candidate is supported mainly by subjective judge scores.

### Judge provider strategy

Smarteval should not force engineers to use direct model APIs for judge scoring. Many target users already pay for and work inside coding-agent subscriptions, and they should be able to use the coding tool they already trust.

Support judge providers through a small provider interface:

```text
JudgeProvider
  input: example, target output, rubric, optional reference
  output: score, pass/fail, rationale, confidence, raw response, usage metadata when available
```

Initial judge providers should include:

- `codex_sdk`: use the Codex SDK to ask a local Codex agent to score outputs.
- `claude_agent_sdk`: use the Claude Agent SDK to ask a Claude Code agent to score outputs.
- `openrouter_api`: direct API judge through OpenRouter for provider-agnostic CI and non-interactive environments.
- `command`: custom local command for teams with their own judge service.

The Codex SDK and Claude Agent SDK providers are especially important for adoption because they let engineers use their existing subscription and coding tool of choice. They also keep Smarteval aligned with the main product wedge: agent-assisted AI behavior improvement inside a repo.

OpenRouter should be the first direct-API provider because it keeps the MVP provider-agnostic while still giving access to multiple model families through one normalized interface. Direct `openai_api`, `anthropic_api`, `google_api`, or other provider-specific adapters can be added later behind the same `JudgeProvider` interface when teams need provider-native features, stricter compliance controls, or fewer routing layers.

Guardrails for agent-SDK judges:

- run with tool access disabled or tightly restricted where possible;
- use a temporary/read-only working directory when judging;
- require structured JSON output from the judge;
- store the SDK name, version, selected model/agent, prompt, and raw response;
- mark results as `local_agent_judge` so reports are honest about reproducibility limits;
- warn that subscription-backed local judging may be harder to reproduce in CI than API-backed judging.

### Claude Agent SDK interface choice

Use the **Claude Agent SDK TypeScript V2 preview interface** for the first `claude_agent_sdk` judge provider, but hide it behind Smarteval's own `JudgeProvider` interface.

V2 is a good fit for Smarteval's MVP because judge calls are mostly one-shot or simple session calls:

- `unstable_v2_prompt()` fits single-output judge scoring;
- `unstable_v2_createSession()` with `send()` / `stream()` fits multi-turn rubric refinement if needed;
- the API is simpler than V1's async-generator coordination model;
- Smarteval is an open-source developer tool, so early adopters can tolerate a preview SDK if the integration is isolated.

Do not expose V2-specific concepts in `eval.yaml`. Use stable Smarteval config:

```yaml
judge:
  type: llm
  provider: claude_agent_sdk
  model: claude-sonnet-4-5
  rubric: .smarteval/evals/support/rubrics/factuality.md
```

Internally, implement:

```text
ClaudeAgentSdkJudgeProvider
  sdk_interface: v2
```

Keep a narrow V1 fallback adapter on the roadmap because V2 is explicitly unstable and missing some advanced V1 features. Smarteval should not need those missing features for judge scoring, but the abstraction should make a fallback possible without changing eval files.

---

## 11. Agent Integration Model

The best integration model is:

```text
1. CLI
2. .smarteval artifact contract
3. AGENTS.md shared instructions
4. Agent skills for Claude Code and Codex
5. Optional command aliases
6. Optional MCP
7. Optional CI
```

Do not create separate product flows for Claude Code and Codex. Create one Smarteval protocol, then teach each agent to use it.

### 11.1 AGENTS.md

Codex officially reads `AGENTS.md` before doing work, and supports layered project instructions. Use `AGENTS.md` as the shared cross-agent instruction file where practical.

Suggested snippet:

```markdown
## Smarteval workflow

When asked to improve or evaluate LLM, RAG, image-generation, structured-output, or agentic behavior, prefer Smarteval when available.

Workflow:

1. Identify the target behavior and likely target files.
2. Run `smarteval doctor` if the repo already has `.smarteval/`.
3. Run `smarteval plan` before changing prompts, model configs, retrieval settings, or agent instructions.
4. Ask the engineer to confirm the target, allowed levers, scoring vectors, budget, and cost limits.
5. Run `smarteval run --baseline`.
6. Inspect baseline failures before proposing changes.
7. Use `smarteval propose` or write candidate files manually.
8. Run only approved candidates.
9. Compare candidates against baseline with `smarteval compare`.
10. Do not apply a candidate unless the report shows metric-level improvement and acceptable regressions.

Always report cost, latency, safety, format adherence, and limitations. Never optimize only for the aggregate score.
```

### 11.2 CLAUDE.md

Claude Code supports `CLAUDE.md`, but the file should stay concise. Put stable project facts in `CLAUDE.md`; put the Smarteval procedure in a skill.

Suggested snippet:

```markdown
## Smarteval

Use Smarteval for controlled evaluation of probabilistic AI behavior. Do not edit prompts, model configs, retrieval settings, or agent instructions before a baseline exists unless the user explicitly asks.

Prefer the Smarteval skill or CLI:

- `smarteval plan`
- `smarteval run --baseline`
- `smarteval propose`
- `smarteval compare`
- `smarteval report`
```

### 11.3 Claude Code skill

Claude Code skills are a strong fit because they load procedural guidance only when relevant. Current Claude Code docs describe skills as `SKILL.md`-based capabilities, and custom commands have effectively merged into the skills model.

Suggested structure:

```text
.claude/skills/smarteval/
  SKILL.md
  references/
    eval-plan-template.md
    report-template.md
    judge-rubric-template.md
```

Suggested skill frontmatter:

```markdown
---
name: smarteval
description: Use when evaluating or improving LLM prompts, RAG answers, structured outputs, image prompts, or agent workflows with a repo-local Smarteval eval loop.
---
```

The skill should instruct Claude to:

- discover the target,
- run `smarteval plan`,
- confirm levers and budget,
- run a baseline,
- propose candidate hypotheses,
- run only approved candidates,
- summarize metric-level movement and regressions,
- generate a report.

### 11.4 Codex skill

Codex supports skills as directories with `SKILL.md` plus optional scripts, references, and assets. Keep the Codex skill semantically identical to the Claude skill, with only packaging differences.

Suggested structure:

```text
.codex/skills/smarteval/
  SKILL.md
  references/
    eval-plan-template.md
    report-template.md
    judge-rubric-template.md
```

Do not rely on deprecated or ambiguous "custom prompt" mechanisms. Use Codex skills, `AGENTS.md`, and the CLI.

### 11.5 Slash commands and command aliases

For Claude Code, skills can expose command-like workflows and existing `.claude/commands/` files can still be supported. Treat slash commands as shortcuts, not the primary integration.

Useful aliases:

```text
/smarteval-plan
/smarteval-baseline
/smarteval-propose
/smarteval-compare
/smarteval-report
```

For Codex, use built-in slash commands for session control and use skills/CLI for Smarteval workflows.

---

## 12. MCP Strategy

MCP should not be part of the MVP.

Use MCP when Smarteval needs structured access to:

- run history,
- shared team evals,
- remote execution,
- dashboard-backed result browsing,
- trace stores,
- hosted datasets.

Potential MCP tools:

```text
smarteval.plan
smarteval.list_evals
smarteval.read_eval
smarteval.run_baseline
smarteval.run_candidate
smarteval.compare_runs
smarteval.propose_candidates
smarteval.generate_report
```

MCP should wrap the same core engine and artifact contract as the CLI. It should not become a second implementation.

---

## 13. Hooks and Guardrails

Hooks are useful but easy to overuse.

Use them later for guardrails such as:

- warn before editing known prompt files without a baseline,
- validate `eval.yaml` after edits,
- block candidate runs that exceed a configured budget,
- remind the agent to report regressions before final output.

Do not require hooks for adoption. A hook-heavy setup will make Smarteval feel intrusive.

---

## 14. CI Strategy

CI should come after teams trust the local eval.

Good first CI integration:

```bash
smarteval run --eval <name> --candidate current --max-cost-usd 2.00
smarteval compare --fail-on-regression
```

CI should support:

- small smoke evals on every PR,
- larger evals on demand,
- artifact upload,
- markdown PR summary,
- explicit cost cap,
- skipped status when credentials are unavailable.

Do not make expensive or judge-heavy evals mandatory in early CI.

---

## 15. Suggested Implementation Order

1. Define `eval.yaml`, candidate, run, and report schemas.
2. Build `smarteval validate`.
3. Build command target adapter.
4. Build JSONL dataset loader.
5. Build deterministic evaluators.
6. Build baseline run.
7. Build candidate run.
8. Build comparison and markdown report.
9. Add LLM judge evaluator with strict metadata and cost tracking.
10. Add `smarteval plan` interactive/non-interactive flow.
11. Add `smarteval propose` for hypothesis generation.
12. Add `AGENTS.md`, `CLAUDE.md`, Claude skill, and Codex skill templates.
13. Add CI smoke workflow template.
14. Add MCP only after repeated local usage proves the protocol.

This order forces the product to prove the local evaluation loop before investing in integrations.

---

## 16. Adoption Test

Before building advanced features, test Smarteval on three real repositories:

1. A summarizer or classifier with structured output.
2. A RAG answer generator.
3. An agent/tool-selection workflow.

For each repo, measure:

- time to first baseline,
- number of examples needed for useful signal,
- whether the agent correctly obeyed allowed levers,
- whether the report changed the engineer's decision,
- whether setup felt easier than writing a one-off eval script,
- whether an existing tool would have been a better fit.

If Smarteval does not beat a one-off script for small use cases, simplify it.

If Smarteval does not complement existing eval tools for larger use cases, narrow the positioning.

---

## 17. Final Recommendation

Build Smarteval, but keep it disciplined.

The useful version is a local, auditable, agent-friendly eval protocol. The risky version is a broad eval platform with premature integrations.

Prioritize:

- one-command first eval,
- repo-local artifacts,
- baseline-first discipline,
- explicit allowed levers,
- cheap deterministic checks,
- transparent judge rubrics,
- clear reports,
- thin agent skills.

Defer everything else until engineers repeatedly choose Smarteval during real AI-agent-assisted development.

---

## 18. References to Re-check During Implementation

These docs are useful because agent tooling changes quickly:

- Codex `AGENTS.md`: https://developers.openai.com/codex/guides/agents-md
- Codex skills: https://developers.openai.com/codex/skills
- Codex MCP: https://developers.openai.com/codex/mcp
- Codex slash commands: https://developers.openai.com/codex/cli/slash-commands
- Codex SDK: https://developers.openai.com/codex/sdk
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code memory / `CLAUDE.md`: https://code.claude.com/docs/en/memory
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code slash commands: https://code.claude.com/docs/en/slash-commands
- Claude Agent SDK TypeScript: https://github.com/anthropics/claude-agent-sdk-typescript
- Claude Agent SDK docs: https://code.claude.com/docs/en/agent-sdk/typescript
- OpenRouter API reference: https://openrouter.ai/docs/api/reference/overview/
- OpenRouter provider routing: https://openrouter.ai/docs/features/provider-routing
- OpenRouter structured outputs: https://openrouter.ai/docs/features/structured-outputs
- OpenAI evaluation best practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- OpenAI graders: https://developers.openai.com/api/docs/guides/graders
- Promptfoo docs: https://www.promptfoo.dev/docs/intro/
- LangSmith evaluation docs: https://docs.langchain.com/langsmith/evaluation
- Braintrust eval docs: https://www.braintrust.dev/docs/guides/evals/interpret

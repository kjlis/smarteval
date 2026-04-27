# Eval Plan Template

```yaml
schema_version: "1"
name: support_summary
objective:
  description: Improve factuality and format adherence for support summaries.
target:
  type: command
  command: ["node", "scripts/eval-target.js"]
  timeout_ms: 30000
inputs:
  dataset: .smarteval/evals/support_summary/dataset.jsonl
allowed_levers:
  - system_prompt
fixed_constraints:
  - output_schema_must_not_change
scoring_vectors:
  valid_json:
    type: json_validity
    weight: 0.3
  has_summary:
    type: json_required_fields
    fields: ["summary"]
    weight: 0.3
  latency:
    type: latency
    max_ms: 5000
    weight: 0.1
experiment_budget:
  iterations: 1
  candidates_per_iteration: 1
  max_cost_usd: 0
```

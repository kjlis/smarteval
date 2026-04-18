# Generators And Artifacts

Generators produce one primary `Artifact` per run.

## Built-In Generator Kinds

- `script`: calls a local Python callable
- `openai`: uses the OpenAI Responses API
- `codex`: same path as `openai`, defaulting to a Codex model
- `pipeline`: executes an external manifest-backed pipeline
- `router`: dispatches to another declared variant using `router.yaml`

`anthropic` and `gemini` are reserved names in the registry but are not implemented yet.

## Artifact Types

- `text`
- `json`
- `path`

Every artifact may also carry:

- `attachments`: sibling outputs from a pipeline manifest
- `source_manifest`: manifest path for manifest-backed generators
- `source_run_dir`: external pipeline run directory
- `metadata`: model ids, routed variant ids, usage data, and other run metadata

## Script Generator

The callable signature is:

```python
def my_generator(*, case: Case, params: dict) -> Artifact:
    ...
```

This is the simplest path for local logic and tests.

## OpenAI And Codex

`openai` and `codex` read prompt text from either:

- `params.prompt_text`
- `params.prompt`

Optional parameters:

- `model`
- `temperature`
- `top_p`
- `rpm`
- `response_format: json_object`
- `reasoning_effort`
- `max_output_tokens`

## Router Variants

A router variant does not generate content directly. It chooses a target variant using `router.yaml`, runs that variant, and records the selected child variant id in artifact metadata.

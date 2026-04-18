# ASR Note Pipeline Design

**Date:** 2026-04-17  
**Status:** Approved for planning  
**Scope:** `demo/` only; no dependency on the main eval framework

## Goal

Build a Python demo pipeline in `demo/` with three configurable stages:

1. preprocessing
2. ASR
3. LLM-based note generation

The demo must remain independent from the evaluation framework. Its responsibility is to execute pipelines, persist artifacts, and make every parameter easy to tweak and track.

## Non-Goals

- No built-in evaluation metrics
- No dataset batching inside a single pipeline run
- No requirement that all ASR models provide timestamps
- No external experiment tracker in v1

## Architecture

The demo is a YAML-first Python package with a thin CLI and three stage interfaces:

- `Preprocessor`: transforms a single input audio file into a normalized representation
- `ASRAdapter`: returns a normalized transcript result
- `NoteGenerator`: generates structured note JSON and rendered text from the transcript text

Each pipeline run is defined by one YAML config. An experiment runner accepts N pipeline configs and executes them independently in parallel against the same input file. Failures are isolated per run.

## Proposed Layout

```text
demo/
  pyproject.toml
  README.md
  configs/
    pipelines/
      parakeet_v3_default.yaml
      whisper_small_default.yaml
      whisper_turbo_default.yaml
    experiments/
      compare_asr_models.yaml
  src/demo_pipeline/
    cli.py
    config.py
    runner.py
    experiment_runner.py
    artifacts.py
    schemas.py
    stages/
      preprocess.py
      asr.py
      note_generation.py
    preprocessors/
      core.py
      vad.py
      filters.py
    asr_models/
      parakeet.py
      whisper.py
    llms/
      openai_compatible.py
    prompts/
      note_prompts.py
  runs/
  tests/
```

## Configuration Model

Pipeline configs are human-edited YAML files. Each config declares:

- `pipeline_name`
- `input_audio`
- `preprocess` settings
- `asr` backend and model identifier
- `note_generation` backend, model, prompt identifier, and inference parameters
- `output` settings

Experiment configs declare:

- `experiment_name`
- `input_audio`
- `pipeline_configs`
- `max_workers`

The experiment runner uses the shared `input_audio` and resolves each pipeline independently.

## Preprocessing

v1 preprocessing supports:

- resampling
- mono conversion
- normalization
- optional VAD / silence trimming
- optional denoise
- optional band-pass filtering

Core normalization should be deterministic. Speech-aware and experimental filters must be explicitly enabled and recorded in run metadata.

## ASR Contract

All ASR adapters must normalize output to the same shape:

- `text`: required
- `segments`: optional timestamped spans
- `words`: optional word-level timestamps
- `metadata`: backend- and model-specific details

This allows Parakeet and Whisper variants to coexist even when some runs return plain text only. Note generation consumes only `text`.

## Supported ASR Backends

The first version should support Python adapters for:

- `mlx-community/parakeet-tdt-0.6b-v3`
- MLX Whisper small
- `mlx-community/whisper-large-v3-turbo-asr-fp16`

Adapters should wrap MLX APIs directly rather than shelling out.

## Note Generation

Note generation uses an OpenAI-compatible API backend. Inputs are the transcript text, model name, prompt ID, and generation parameters. Outputs are:

- `note.json`: structured sections
- `note.txt`: rendered note text

Prompt templates live in code and are referenced by stable IDs from config.

## Artifacts

Each run writes to its own directory:

```text
runs/<timestamp>_<pipeline_name>/
  resolved_config.yaml
  manifest.json
  transcript.json
  transcript.txt
  note.json
  note.txt
  timings.json
  logs.txt
```

`manifest.json` is the stable handoff artifact for the eval framework. It includes config identifiers, model names, prompt IDs, input path, output paths, timing availability, run status, and error details when present.

## Error Handling

Runs are isolated. One failed config must not stop the others.

- preprocessing failure: run ends as failed
- ASR failure: run ends as failed, note generation is skipped
- note generation failure: transcript artifacts remain; run is marked failed with partial outputs

The experiment summary should list successful and failed runs separately.

## Testing Strategy

Automated tests should focus on:

- config parsing and validation
- adapter selection from YAML
- artifact writing and manifest shape
- optional timestamps in transcript output
- experiment isolation and parallel execution behavior

Use mocked adapters for test speed. Do not require model downloads or live API calls in CI.

## Open Risks

- MLX model availability and API differences may vary by package version
- parallel MLX runs may contend for memory on Apple Silicon
- denoise and band-pass filters can change ASR quality substantially, so config tracking must be exact

## Decision Summary

- YAML-first configuration
- single-audio input per run
- N independent pipeline configs per experiment
- Python adapter layer for MLX ASR
- OpenAI-compatible note generation backend
- optional timestamps in ASR artifacts
- no built-in eval logic in the demo

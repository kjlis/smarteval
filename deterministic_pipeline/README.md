# Deterministic ASR Demo Pipeline

This package contains a fake but deterministic ASR-driven note generation pipeline for
`smarteval` demos.

It simulates three fixed-order stages:

1. preprocessing
2. ASR
3. note generation

The runner accepts one structured `pipeline_config` with independent preprocessing knobs,
an ASR model choice, and note-generation settings. It writes:

- `note.txt` as the primary evaluand
- `transcript.txt` as an attachment
- `debug.json` with the deterministic rule decisions

Supported config shape:

```yaml
pipeline_config:
  preprocessing:
    denoise: off | mild | aggressive
    voice_enhancement: off | on
    silence_trimming: off | conservative | aggressive
    vad: off | basic | strict
  asr:
    model: parakeet | whisper
  note_generation:
    model: gpt-5-mini | gpt-5
    prompt_style: brief | soap | detailed
```

Runnable eval configs for `smarteval` live in `examples/asr_manifest/`:

- `smarteval_fast.yaml`
- `smarteval_balanced.yaml`
- `smarteval_best.yaml`
- `smarteval_golden.yaml`

The default `examples/asr_manifest/smarteval.yaml` compares the whole progression from weak baseline
to golden variant in one run.

Run them with:

```bash
.venv/bin/python -m smarteval.cli.main run --path examples/asr_manifest/smarteval_fast.yaml
.venv/bin/python -m smarteval.cli.main run --path examples/asr_manifest/smarteval_balanced.yaml
.venv/bin/python -m smarteval.cli.main run --path examples/asr_manifest/smarteval_best.yaml
.venv/bin/python -m smarteval.cli.main run --path examples/asr_manifest/smarteval_golden.yaml
.venv/bin/python -m smarteval.cli.main run --path examples/asr_manifest/smarteval.yaml
```

Pipeline-only configs for direct manual runs live in `deterministic_pipeline/configs/`:

- `fast.yaml`
- `balanced.yaml`
- `best.yaml`
- `golden.yaml`

Run the pipeline directly with:

```bash
.venv/bin/python -m deterministic_pipeline.run_demo --config deterministic_pipeline/configs/fast.yaml
.venv/bin/python -m deterministic_pipeline.run_demo --config deterministic_pipeline/configs/balanced.yaml
.venv/bin/python -m deterministic_pipeline.run_demo --config deterministic_pipeline/configs/best.yaml
.venv/bin/python -m deterministic_pipeline.run_demo --config deterministic_pipeline/configs/golden.yaml
```

Override the sample encounter with:

```bash
.venv/bin/python -m deterministic_pipeline.run_demo \
  --config deterministic_pipeline/configs/balanced.yaml \
  --encounter deterministic_pipeline/sample_encounter.yaml \
  --output-root manual_pipeline_runs
```

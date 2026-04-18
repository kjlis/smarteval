# Pipelines And ASR

Manifest-backed pipelines are the intended integration point for ASR and other multi-stage systems.

## Core Rule

One run still evaluates one primary artifact.

For ASR-style systems this means:

- the external pipeline may emit transcript, note, JSON, and other files
- `smarteval` selects one output key as the primary evaluand
- other outputs are retained as attachments/context

## Manifest Shape

The pipeline callable may return:

- a `PipelineManifest`
- a manifest dictionary
- a path to `manifest.json`

Expected manifest structure:

```json
{
  "pipeline_name": "example-asr",
  "source_run_dir": "/abs/path/to/run",
  "status": "success",
  "outputs": {
    "note_txt": {"kind": "text", "uri": "note.txt"},
    "transcript_txt": {"kind": "text", "uri": "transcript.txt"}
  }
}
```

## Output Selection

```yaml
artifact_selection:
  primary_output: note_txt
  copy_attachments: true
```

- if the primary output is missing, generation fails
- if an attachment is missing, the run still succeeds unless a later scorer depends on it

## ASR Guidance

For an ASR pipeline:

- model the full pipeline config as one variant
- keep input audio in the case, not hard-coded in the pipeline config
- give each produced file a stable logical output key
- use separate eval configs when optimizing transcript quality vs note quality

## Rescore Behavior

`smarteval rescore` reuses the stored primary artifact and the stored manifest references. It does not rerun the pipeline.

## Example

See:

- [examples/asr_manifest/smarteval.yaml](../examples/asr_manifest/smarteval.yaml)
- [examples/asr_manifest/pipeline_runner.py](../examples/asr_manifest/pipeline_runner.py)

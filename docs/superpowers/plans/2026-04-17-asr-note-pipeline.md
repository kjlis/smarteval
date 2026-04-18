# ASR Note Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained Python demo in `demo/` that runs configurable `preprocess -> ASR -> note_generation` pipelines and can execute multiple configs independently in parallel on the same input audio.

**Architecture:** The implementation is a YAML-first package. Each pipeline config resolves to a `PipelineConfig`, each stage is selected through a small adapter layer, and each run persists a machine-readable manifest plus human-readable artifacts. An experiment runner fans out isolated process-level runs so failures and partial outputs remain per-config.

**Tech Stack:** Python 3.11+, `pydantic`, `pyyaml`, `typer`, `pytest`, `soundfile`, `librosa`, `scipy`, `noisereduce`, `openai`, `mlx-audio`

---

### Task 1: Bootstrap the demo package and config loader

**Files:**
- Create: `demo/pyproject.toml`
- Create: `demo/README.md`
- Create: `demo/src/demo_pipeline/__init__.py`
- Create: `demo/src/demo_pipeline/config.py`
- Create: `demo/src/demo_pipeline/schemas.py`
- Create: `demo/configs/pipelines/parakeet_v3_default.yaml`
- Create: `demo/configs/pipelines/whisper_small_default.yaml`
- Create: `demo/configs/pipelines/whisper_turbo_default.yaml`
- Create: `demo/configs/experiments/compare_asr_models.yaml`
- Test: `demo/tests/test_config.py`

- [ ] **Step 1: Write the failing config tests**

```python
from pathlib import Path

from demo_pipeline.config import load_experiment_config, load_pipeline_config


def test_load_pipeline_config_reads_asr_and_note_generation_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "pipeline.yaml"
    config_path.write_text(
        """
pipeline_name: whisper_turbo_demo
input_audio: sample.wav
preprocess:
  resample_hz: 16000
  mono: true
  normalize: true
  vad:
    enabled: true
  denoise:
    enabled: false
  bandpass:
    enabled: false
    low_hz: 100
    high_hz: 7000
asr:
  backend: mlx
  model: mlx-community/whisper-large-v3-turbo-asr-fp16
note_generation:
  backend: openai_compatible
  model: gpt-4.1-mini
  prompt_id: soap_v1
  temperature: 0.2
  max_tokens: 1200
output:
  base_dir: runs
        """.strip()
    )

    config = load_pipeline_config(config_path)

    assert config.pipeline_name == "whisper_turbo_demo"
    assert config.asr.model == "mlx-community/whisper-large-v3-turbo-asr-fp16"
    assert config.note_generation.prompt_id == "soap_v1"
    assert config.preprocess.vad.enabled is True


def test_experiment_config_uses_shared_input_audio(tmp_path: Path) -> None:
    config_path = tmp_path / "experiment.yaml"
    config_path.write_text(
        """
experiment_name: compare_asr
input_audio: shared.wav
max_workers: 3
pipeline_configs:
  - configs/pipelines/parakeet_v3_default.yaml
  - configs/pipelines/whisper_turbo_default.yaml
        """.strip()
    )

    config = load_experiment_config(config_path)

    assert config.experiment_name == "compare_asr"
    assert config.input_audio == Path("shared.wav")
    assert config.max_workers == 3
    assert len(config.pipeline_configs) == 2
```

- [ ] **Step 2: Run the config tests to verify they fail**

Run: `cd demo && pytest tests/test_config.py -v`  
Expected: FAIL with import errors because `demo_pipeline.config` and schema models do not exist yet.

- [ ] **Step 3: Implement schema models and YAML loaders**

```python
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class ToggleConfig(BaseModel):
    enabled: bool = False


class BandpassConfig(ToggleConfig):
    low_hz: int = 100
    high_hz: int = 7000


class PreprocessConfig(BaseModel):
    resample_hz: int = 16000
    mono: bool = True
    normalize: bool = True
    vad: ToggleConfig = Field(default_factory=ToggleConfig)
    denoise: ToggleConfig = Field(default_factory=ToggleConfig)
    bandpass: BandpassConfig = Field(default_factory=BandpassConfig)


class ASRConfig(BaseModel):
    backend: str
    model: str


class NoteGenerationConfig(BaseModel):
    backend: str
    model: str
    prompt_id: str
    temperature: float = 0.2
    max_tokens: int = 1200


class OutputConfig(BaseModel):
    base_dir: Path = Path("runs")


class PipelineConfig(BaseModel):
    pipeline_name: str
    input_audio: Path
    preprocess: PreprocessConfig
    asr: ASRConfig
    note_generation: NoteGenerationConfig
    output: OutputConfig = Field(default_factory=OutputConfig)


class ExperimentConfig(BaseModel):
    experiment_name: str
    input_audio: Path
    max_workers: int = 2
    pipeline_configs: list[Path]


def load_pipeline_config(path: Path) -> PipelineConfig:
    return PipelineConfig.model_validate(yaml.safe_load(path.read_text()))


def load_experiment_config(path: Path) -> ExperimentConfig:
    return ExperimentConfig.model_validate(yaml.safe_load(path.read_text()))
```

- [ ] **Step 4: Add package metadata and starter config files**

```toml
[project]
name = "demo-pipeline"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "librosa>=0.10",
  "mlx-audio",
  "noisereduce",
  "openai>=1.0.0",
  "pydantic>=2.0",
  "pyyaml",
  "scipy",
  "soundfile",
  "typer>=0.12",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
pythonpath = ["src"]
```

- [ ] **Step 5: Run the config tests to verify they pass**

Run: `cd demo && pytest tests/test_config.py -v`  
Expected: PASS

- [ ] **Step 6: Commit the bootstrap**

```bash
git add demo/pyproject.toml demo/README.md demo/src/demo_pipeline demo/configs demo/tests/test_config.py
git commit -m "feat: bootstrap demo pipeline config system"
```

### Task 2: Add artifact schemas and single-run output persistence

**Files:**
- Create: `demo/src/demo_pipeline/artifacts.py`
- Create: `demo/src/demo_pipeline/runner.py`
- Test: `demo/tests/test_artifacts.py`

- [ ] **Step 1: Write the failing artifact tests**

```python
from pathlib import Path

from demo_pipeline.artifacts import write_run_artifacts


def test_write_run_artifacts_persists_required_files(tmp_path: Path) -> None:
    run_dir = write_run_artifacts(
        base_dir=tmp_path,
        pipeline_name="whisper_turbo_demo",
        resolved_config={"pipeline_name": "whisper_turbo_demo"},
        transcript={"text": "hello world", "segments": [], "words": []},
        note={"json": {"subjective": "hello"}, "text": "Subjective: hello"},
        timings={"preprocess_seconds": 0.1},
        status="success",
        error=None,
    )

    assert (run_dir / "resolved_config.yaml").exists()
    assert (run_dir / "manifest.json").exists()
    assert (run_dir / "transcript.json").exists()
    assert (run_dir / "transcript.txt").read_text() == "hello world"
    assert (run_dir / "note.txt").exists()


def test_manifest_marks_timestamp_availability(tmp_path: Path) -> None:
    run_dir = write_run_artifacts(
        base_dir=tmp_path,
        pipeline_name="plain_text_asr",
        resolved_config={"pipeline_name": "plain_text_asr"},
        transcript={"text": "plain text only"},
        note={"json": {"subjective": "text"}, "text": "text"},
        timings={},
        status="success",
        error=None,
    )

    manifest = (run_dir / "manifest.json").read_text()
    assert "has_segments" in manifest
    assert "has_words" in manifest
```

- [ ] **Step 2: Run the artifact tests to verify they fail**

Run: `cd demo && pytest tests/test_artifacts.py -v`  
Expected: FAIL because `write_run_artifacts` does not exist.

- [ ] **Step 3: Implement artifact writing with optional timing data**

```python
import json
from datetime import UTC, datetime
from pathlib import Path

import yaml


def write_run_artifacts(
    *,
    base_dir: Path,
    pipeline_name: str,
    resolved_config: dict,
    transcript: dict,
    note: dict,
    timings: dict,
    status: str,
    error: str | None,
) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir = base_dir / f"{timestamp}_{pipeline_name}"
    run_dir.mkdir(parents=True, exist_ok=False)

    (run_dir / "resolved_config.yaml").write_text(yaml.safe_dump(resolved_config, sort_keys=False))
    (run_dir / "transcript.json").write_text(json.dumps(transcript, indent=2))
    (run_dir / "transcript.txt").write_text(transcript["text"])
    (run_dir / "note.json").write_text(json.dumps(note["json"], indent=2))
    (run_dir / "note.txt").write_text(note["text"])
    (run_dir / "timings.json").write_text(json.dumps(timings, indent=2))

    manifest = {
        "pipeline_name": pipeline_name,
        "status": status,
        "error": error,
        "input_audio": resolved_config.get("input_audio"),
        "asr_model": resolved_config.get("asr", {}).get("model"),
        "note_model": resolved_config.get("note_generation", {}).get("model"),
        "prompt_id": resolved_config.get("note_generation", {}).get("prompt_id"),
        "has_segments": bool(transcript.get("segments")),
        "has_words": bool(transcript.get("words")),
        "artifacts": {
            "transcript_json": str(run_dir / "transcript.json"),
            "transcript_txt": str(run_dir / "transcript.txt"),
            "note_json": str(run_dir / "note.json"),
            "note_txt": str(run_dir / "note.txt"),
        },
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (run_dir / "logs.txt").write_text("")
    return run_dir
```

- [ ] **Step 4: Add a run result container in `runner.py`**

```python
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class RunResult:
    run_dir: Path
    status: str
    error: str | None = None
```

- [ ] **Step 5: Run the artifact tests to verify they pass**

Run: `cd demo && pytest tests/test_artifacts.py -v`  
Expected: PASS

- [ ] **Step 6: Commit artifact persistence**

```bash
git add demo/src/demo_pipeline/artifacts.py demo/src/demo_pipeline/runner.py demo/tests/test_artifacts.py
git commit -m "feat: add run artifact persistence"
```

### Task 3: Implement preprocessing with explicit filter tracking

**Files:**
- Create: `demo/src/demo_pipeline/stages/preprocess.py`
- Create: `demo/src/demo_pipeline/preprocessors/core.py`
- Create: `demo/src/demo_pipeline/preprocessors/vad.py`
- Create: `demo/src/demo_pipeline/preprocessors/filters.py`
- Test: `demo/tests/test_preprocess.py`

- [ ] **Step 1: Write failing preprocessing tests**

```python
import numpy as np

from demo_pipeline.preprocessors.core import apply_core_preprocessing
from demo_pipeline.preprocessors.filters import apply_bandpass


def test_core_preprocessing_converts_to_mono_and_target_rate() -> None:
    audio = np.array([[0.1, 0.2], [0.2, 0.3]], dtype=np.float32)
    processed, sample_rate, metadata = apply_core_preprocessing(audio, 8000, target_sample_rate=16000, mono=True)

    assert processed.ndim == 1
    assert sample_rate == 16000
    assert metadata["mono_applied"] is True


def test_bandpass_filter_reports_when_disabled() -> None:
    audio = np.array([0.1, 0.2, 0.1], dtype=np.float32)
    filtered, metadata = apply_bandpass(audio, sample_rate=16000, enabled=False, low_hz=100, high_hz=7000)

    assert np.allclose(filtered, audio)
    assert metadata["bandpass_enabled"] is False
```

- [ ] **Step 2: Run the preprocessing tests to verify they fail**

Run: `cd demo && pytest tests/test_preprocess.py -v`  
Expected: FAIL because preprocessing helpers do not exist.

- [ ] **Step 3: Implement deterministic preprocessing helpers**

```python
import librosa
import numpy as np


def apply_core_preprocessing(audio: np.ndarray, sample_rate: int, *, target_sample_rate: int, mono: bool):
    processed = audio
    mono_applied = False
    if mono and processed.ndim > 1:
        processed = processed.mean(axis=1)
        mono_applied = True
    if sample_rate != target_sample_rate:
        processed = librosa.resample(processed, orig_sr=sample_rate, target_sr=target_sample_rate)
        sample_rate = target_sample_rate
    peak = float(np.max(np.abs(processed))) if processed.size else 0.0
    if peak > 0:
        processed = processed / peak
    return processed, sample_rate, {"mono_applied": mono_applied, "normalized": peak > 0}
```

- [ ] **Step 4: Implement optional VAD, denoise, and band-pass wrappers**

```python
import numpy as np
from scipy.signal import butter, sosfilt


def apply_bandpass(audio: np.ndarray, *, sample_rate: int, enabled: bool, low_hz: int, high_hz: int):
    if not enabled:
        return audio, {"bandpass_enabled": False}
    sos = butter(4, [low_hz, high_hz], btype="bandpass", fs=sample_rate, output="sos")
    return sosfilt(sos, audio), {"bandpass_enabled": True, "low_hz": low_hz, "high_hz": high_hz}
```

- [ ] **Step 5: Implement the stage entry point that returns audio path plus metadata**

```python
from pathlib import Path

import soundfile as sf


def run_preprocess(input_audio: Path, config, working_dir: Path) -> dict:
    working_dir.mkdir(parents=True, exist_ok=True)
    audio, sample_rate = sf.read(str(input_audio))
    processed, sample_rate, core_metadata = apply_core_preprocessing(
        audio,
        sample_rate,
        target_sample_rate=config.resample_hz,
        mono=config.mono,
    )
    processed_audio_path = working_dir / "preprocessed.wav"
    sf.write(processed_audio_path, processed, sample_rate)
    return {
        "audio_path": processed_audio_path,
        "sample_rate": sample_rate,
        "metadata": core_metadata,
    }
```

- [ ] **Step 6: Run the preprocessing tests to verify they pass**

Run: `cd demo && pytest tests/test_preprocess.py -v`  
Expected: PASS

- [ ] **Step 7: Commit preprocessing**

```bash
git add demo/src/demo_pipeline/stages/preprocess.py demo/src/demo_pipeline/preprocessors demo/tests/test_preprocess.py
git commit -m "feat: add configurable audio preprocessing"
```

### Task 4: Implement MLX ASR adapters with optional timestamps

**Files:**
- Create: `demo/src/demo_pipeline/stages/asr.py`
- Create: `demo/src/demo_pipeline/asr_models/parakeet.py`
- Create: `demo/src/demo_pipeline/asr_models/whisper.py`
- Test: `demo/tests/test_asr.py`

- [ ] **Step 1: Write failing ASR adapter tests**

```python
from demo_pipeline.stages.asr import normalize_asr_result


def test_normalize_asr_result_handles_sentence_timestamps() -> None:
    result = normalize_asr_result(
        text="hello world",
        segments=[{"start": 0.0, "end": 1.0, "text": "hello world"}],
        words=None,
        metadata={"model": "parakeet"},
    )

    assert result["text"] == "hello world"
    assert result["segments"][0]["start"] == 0.0
    assert result["words"] == []


def test_normalize_asr_result_accepts_plain_text_only() -> None:
    result = normalize_asr_result(text="plain text", segments=None, words=None, metadata={"model": "whisper"})

    assert result["text"] == "plain text"
    assert result["segments"] == []
    assert result["words"] == []
```

- [ ] **Step 2: Run the ASR tests to verify they fail**

Run: `cd demo && pytest tests/test_asr.py -v`  
Expected: FAIL because ASR normalization helpers do not exist.

- [ ] **Step 3: Implement normalized ASR contract and adapter selection**

```python
def normalize_asr_result(*, text: str, segments: list[dict] | None, words: list[dict] | None, metadata: dict) -> dict:
    return {
        "text": text,
        "segments": segments or [],
        "words": words or [],
        "metadata": metadata,
    }


def get_asr_adapter(model_name: str):
    if "parakeet" in model_name:
        return transcribe_with_parakeet
    if "whisper" in model_name:
        return transcribe_with_whisper
    raise ValueError(f"Unsupported ASR model: {model_name}")
```

- [ ] **Step 4: Implement Parakeet and Whisper Python adapters**

```python
from mlx_audio.stt.generate import generate_transcription
from mlx_audio.stt.utils import load


def transcribe_with_parakeet(audio_path: str, model_name: str) -> dict:
    model = load(model_name)
    result = model.generate(audio_path)
    segments = [
        {"start": sentence.start, "end": sentence.end, "text": sentence.text}
        for sentence in getattr(result, "sentences", [])
    ]
    return normalize_asr_result(text=result.text, segments=segments, words=None, metadata={"model": model_name})


def transcribe_with_whisper(audio_path: str, model_name: str) -> dict:
    result = generate_transcription(model=model_name, audio=audio_path)
    return normalize_asr_result(
        text=result.text,
        segments=getattr(result, "segments", None),
        words=getattr(result, "words", None),
        metadata={"model": model_name},
    )
```

- [ ] **Step 5: Add the stage wrapper used by the pipeline runner**

```python
def run_asr(audio_path, config) -> dict:
    adapter = get_asr_adapter(config.model)
    return adapter(str(audio_path), config.model)
```

- [ ] **Step 6: Run the ASR tests to verify they pass**

Run: `cd demo && pytest tests/test_asr.py -v`  
Expected: PASS

- [ ] **Step 7: Commit ASR support**

```bash
git add demo/src/demo_pipeline/stages/asr.py demo/src/demo_pipeline/asr_models demo/tests/test_asr.py
git commit -m "feat: add mlx asr adapters"
```

### Task 5: Implement OpenAI-compatible note generation with prompt IDs

**Files:**
- Create: `demo/src/demo_pipeline/stages/note_generation.py`
- Create: `demo/src/demo_pipeline/llms/openai_compatible.py`
- Create: `demo/src/demo_pipeline/prompts/note_prompts.py`
- Test: `demo/tests/test_note_generation.py`

- [ ] **Step 1: Write failing note-generation tests**

```python
from demo_pipeline.prompts.note_prompts import get_prompt_template
from demo_pipeline.stages.note_generation import render_note_text


def test_get_prompt_template_returns_known_prompt() -> None:
    prompt = get_prompt_template("soap_v1")
    assert "subjective" in prompt.lower()


def test_render_note_text_formats_sections() -> None:
    note = {
        "subjective": "Patient reports cough.",
        "objective": "No acute distress.",
        "assessment": "Likely viral illness.",
        "plan": "Hydration and rest.",
    }

    rendered = render_note_text(note)

    assert "Subjective" in rendered
    assert "Plan" in rendered
```

- [ ] **Step 2: Run the note-generation tests to verify they fail**

Run: `cd demo && pytest tests/test_note_generation.py -v`  
Expected: FAIL because prompt and rendering helpers do not exist.

- [ ] **Step 3: Implement prompt lookup and note rendering**

```python
PROMPTS = {
    "soap_v1": """
Return a JSON object with keys: subjective, objective, assessment, plan.
Base the note strictly on the transcript. Use concise clinical language.
Transcript:
{transcript}
""".strip(),
}


def get_prompt_template(prompt_id: str) -> str:
    try:
        return PROMPTS[prompt_id]
    except KeyError as exc:
        raise ValueError(f"Unknown prompt_id: {prompt_id}") from exc


def render_note_text(note: dict) -> str:
    return "\n\n".join(
        [
            f"Subjective\n{note['subjective']}",
            f"Objective\n{note['objective']}",
            f"Assessment\n{note['assessment']}",
            f"Plan\n{note['plan']}",
        ]
    )
```

- [ ] **Step 4: Implement the OpenAI-compatible backend**

```python
import json

from openai import OpenAI


def generate_note(*, transcript_text: str, config) -> dict:
    client = OpenAI()
    prompt = get_prompt_template(config.prompt_id).format(transcript=transcript_text)
    response = client.responses.create(
        model=config.model,
        temperature=config.temperature,
        max_output_tokens=config.max_tokens,
        input=prompt,
    )
    note_json = json.loads(response.output_text)
    return {"json": note_json, "text": render_note_text(note_json)}
```

- [ ] **Step 5: Run the note-generation tests to verify they pass**

Run: `cd demo && pytest tests/test_note_generation.py -v`  
Expected: PASS

- [ ] **Step 6: Commit note generation**

```bash
git add demo/src/demo_pipeline/stages/note_generation.py demo/src/demo_pipeline/llms demo/src/demo_pipeline/prompts demo/tests/test_note_generation.py
git commit -m "feat: add llm note generation stage"
```

### Task 6: Wire the pipeline runner and CLI for single-run execution

**Files:**
- Create: `demo/src/demo_pipeline/cli.py`
- Modify: `demo/src/demo_pipeline/runner.py`
- Test: `demo/tests/test_runner.py`

- [ ] **Step 1: Write the failing runner test**

```python
from pathlib import Path

from demo_pipeline.runner import run_pipeline


def test_run_pipeline_returns_success_and_writes_run_dir(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("demo_pipeline.runner.run_preprocess", lambda input_audio, config, working_dir: {"audio_path": input_audio, "sample_rate": 16000, "metadata": {}})
    monkeypatch.setattr("demo_pipeline.runner.run_asr", lambda audio_path, config: {"text": "hello", "segments": [], "words": [], "metadata": {}})
    monkeypatch.setattr("demo_pipeline.runner.run_note_generation", lambda transcript_text, config: {"json": {"subjective": "hello", "objective": "", "assessment": "", "plan": ""}, "text": "Subjective\nhello"})

    result = run_pipeline(config_path=Path("configs/pipelines/whisper_turbo_default.yaml"), input_audio=tmp_path / "sample.wav", base_dir=tmp_path)

    assert result.status == "success"
    assert result.run_dir.exists()
```

- [ ] **Step 2: Run the runner test to verify it fails**

Run: `cd demo && pytest tests/test_runner.py -v`  
Expected: FAIL because `run_pipeline` does not exist.

- [ ] **Step 3: Implement orchestration and failure capture**

```python
import time
from pathlib import Path


def run_pipeline(*, config_path: Path, input_audio: Path | None = None, base_dir: Path | None = None) -> RunResult:
    config = load_pipeline_config(config_path)
    if input_audio is not None:
        config.input_audio = input_audio
    if base_dir is None:
        base_dir = config.output.base_dir

    timings = {}
    transcript = {"text": "", "segments": [], "words": []}
    note = {"json": {}, "text": ""}
    working_dir = base_dir / ".tmp" / config.pipeline_name
    try:
        preprocess_start = time.perf_counter()
        preprocessed = run_preprocess(config.input_audio, config.preprocess, working_dir)
        timings["preprocess_seconds"] = time.perf_counter() - preprocess_start

        asr_start = time.perf_counter()
        transcript = run_asr(preprocessed["audio_path"], config.asr)
        timings["asr_seconds"] = time.perf_counter() - asr_start

        note_start = time.perf_counter()
        note = run_note_generation(transcript["text"], config.note_generation)
        timings["note_generation_seconds"] = time.perf_counter() - note_start

        run_dir = write_run_artifacts(
            base_dir=base_dir,
            pipeline_name=config.pipeline_name,
            resolved_config=config.model_dump(mode="json"),
            transcript=transcript,
            note=note,
            timings=timings,
            status="success",
            error=None,
        )
        return RunResult(run_dir=run_dir, status="success")
    except Exception as exc:
        run_dir = write_run_artifacts(
            base_dir=base_dir,
            pipeline_name=config.pipeline_name,
            resolved_config=config.model_dump(mode="json"),
            transcript=transcript,
            note=note,
            timings=timings,
            status="failed",
            error=str(exc),
        )
        return RunResult(run_dir=run_dir, status="failed", error=str(exc))
```

- [ ] **Step 4: Add a Typer CLI entry point**

```python
import typer
from pathlib import Path

app = typer.Typer()


@app.command("run")
def run_command(config: str, input_audio: str | None = None, output_dir: str | None = None) -> None:
    result = run_pipeline(
        config_path=Path(config),
        input_audio=Path(input_audio) if input_audio else None,
        base_dir=Path(output_dir) if output_dir else None,
    )
    raise typer.Exit(code=0 if result.status == "success" else 1)


if __name__ == "__main__":
    app()
```

- [ ] **Step 5: Run the runner test to verify it passes**

Run: `cd demo && pytest tests/test_runner.py -v`  
Expected: PASS

- [ ] **Step 6: Commit the single-run pipeline**

```bash
git add demo/src/demo_pipeline/cli.py demo/src/demo_pipeline/runner.py demo/tests/test_runner.py
git commit -m "feat: wire single-run demo pipeline"
```

### Task 7: Add the parallel experiment runner with run isolation

**Files:**
- Create: `demo/src/demo_pipeline/experiment_runner.py`
- Test: `demo/tests/test_experiment_runner.py`

- [ ] **Step 1: Write the failing experiment-runner test**

```python
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from demo_pipeline.experiment_runner import run_experiment


def test_run_experiment_continues_after_one_failed_pipeline(tmp_path: Path, monkeypatch) -> None:
    class FakeResult:
        def __init__(self, status: str) -> None:
            self.status = status
            self.run_dir = tmp_path / status
            self.error = None if status == "success" else "boom"

    responses = [FakeResult("success"), FakeResult("failed"), FakeResult("success")]
    monkeypatch.setattr("demo_pipeline.experiment_runner.run_pipeline", lambda **_: responses.pop(0))

    summary = run_experiment(
        experiment_config_path=Path("configs/experiments/compare_asr_models.yaml"),
        input_audio=tmp_path / "sample.wav",
        executor_cls=ThreadPoolExecutor,
    )

    assert summary["total_runs"] == 3
    assert summary["failed_runs"] == 1
    assert summary["successful_runs"] == 2
```

- [ ] **Step 2: Run the experiment-runner test to verify it fails**

Run: `cd demo && pytest tests/test_experiment_runner.py -v`  
Expected: FAIL because `run_experiment` does not exist.

- [ ] **Step 3: Implement process-based parallel fan-out**

```python
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path


def run_experiment(
    *,
    experiment_config_path: Path,
    input_audio: Path | None = None,
    executor_cls=ProcessPoolExecutor,
) -> dict:
    experiment = load_experiment_config(experiment_config_path)
    shared_input = input_audio or experiment.input_audio
    results = []

    with executor_cls(max_workers=experiment.max_workers) as pool:
        futures = [
            pool.submit(run_pipeline, config_path=config_path, input_audio=shared_input)
            for config_path in experiment.pipeline_configs
        ]
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                results.append({"status": "failed", "error": str(exc)})

    def result_status(result) -> str:
        return result.status if hasattr(result, "status") else result["status"]

    return {
        "experiment_name": experiment.experiment_name,
        "total_runs": len(results),
        "successful_runs": sum(1 for result in results if result_status(result) == "success"),
        "failed_runs": sum(1 for result in results if result_status(result) == "failed"),
        "results": results,
    }
```

- [ ] **Step 4: Add a CLI command for experiments**

```python
@app.command("run-experiment")
def run_experiment_command(config: str, input_audio: str | None = None) -> None:
    summary = run_experiment(
        experiment_config_path=Path(config),
        input_audio=Path(input_audio) if input_audio else None,
    )
    if summary["failed_runs"]:
        raise typer.Exit(code=1)
```

- [ ] **Step 5: Run the experiment-runner test to verify it passes**

Run: `cd demo && pytest tests/test_experiment_runner.py -v`  
Expected: PASS

- [ ] **Step 6: Commit experiment execution**

```bash
git add demo/src/demo_pipeline/experiment_runner.py demo/src/demo_pipeline/cli.py demo/tests/test_experiment_runner.py
git commit -m "feat: add parallel experiment runner"
```

### Task 8: Finish documentation and smoke-test coverage

**Files:**
- Modify: `demo/README.md`
- Create: `demo/tests/test_cli_smoke.py`

- [ ] **Step 1: Write the failing smoke test**

```python
from typer.testing import CliRunner

from demo_pipeline.cli import app


def test_cli_shows_commands() -> None:
    result = CliRunner().invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "run-experiment" in result.output
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `cd demo && pytest tests/test_cli_smoke.py -v`  
Expected: FAIL until the CLI module and dependencies are wired correctly.

- [ ] **Step 3: Expand the demo README with usage examples**

````md
# Demo Pipeline

## Install

```bash
cd demo
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Run one pipeline

```bash
python -m demo_pipeline.cli run --config configs/pipelines/whisper_turbo_default.yaml --input-audio ../sample.wav
```

## Run an experiment

```bash
python -m demo_pipeline.cli run-experiment --config configs/experiments/compare_asr_models.yaml --input-audio ../sample.wav
```
````

- [ ] **Step 4: Run the full demo test suite**

Run: `cd demo && pytest tests -v`  
Expected: PASS

- [ ] **Step 5: Commit docs and smoke tests**

```bash
git add demo/README.md demo/tests/test_cli_smoke.py
git commit -m "docs: document demo pipeline usage"
```

### Task 9: Manual verification for real integrations

**Files:**
- Modify: `demo/configs/pipelines/parakeet_v3_default.yaml`
- Modify: `demo/configs/pipelines/whisper_small_default.yaml`
- Modify: `demo/configs/pipelines/whisper_turbo_default.yaml`
- Modify: `demo/configs/experiments/compare_asr_models.yaml`

- [ ] **Step 1: Populate local model IDs and a real API-backed note model**

```yaml
pipeline_name: parakeet_v3_default
input_audio: ../sample.wav
preprocess:
  resample_hz: 16000
  mono: true
  normalize: true
  vad:
    enabled: true
  denoise:
    enabled: false
  bandpass:
    enabled: false
    low_hz: 100
    high_hz: 7000
asr:
  backend: mlx
  model: mlx-community/parakeet-tdt-0.6b-v3
note_generation:
  backend: openai_compatible
  model: gpt-4.1-mini
  prompt_id: soap_v1
  temperature: 0.2
  max_tokens: 1200
output:
  base_dir: runs
```

- [ ] **Step 2: Run one end-to-end pipeline manually**

Run: `cd demo && python -m demo_pipeline.cli run --config configs/pipelines/parakeet_v3_default.yaml --input-audio ../sample.wav`  
Expected: exit code `0` and a new directory under `demo/runs/`

- [ ] **Step 3: Run the parallel experiment manually**

Run: `cd demo && python -m demo_pipeline.cli run-experiment --config configs/experiments/compare_asr_models.yaml --input-audio ../sample.wav`  
Expected: one run directory per pipeline config and a non-zero exit code only if one or more configs fail

- [ ] **Step 4: Inspect generated artifacts**

Run: `cd demo && find runs -maxdepth 2 -type f | sort`  
Expected: each successful run includes `manifest.json`, `transcript.json`, `transcript.txt`, `note.json`, `note.txt`, and `timings.json`

- [ ] **Step 5: Commit verified sample configs**

```bash
git add demo/configs/pipelines demo/configs/experiments/compare_asr_models.yaml
git commit -m "chore: add verified demo configs"
```

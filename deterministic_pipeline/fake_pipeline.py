from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from smarteval.core.models import Case


DEFAULT_PIPELINE_CONFIG: dict[str, Any] = {
    "preprocessing": {
        "denoise": "mild",
        "voice_enhancement": "on",
        "silence_trimming": "conservative",
        "vad": "basic",
    },
    "asr": {"model": "whisper"},
    "note_generation": {"model": "gpt-5-mini", "prompt_style": "soap"},
}


def run_pipeline(*, case: Case, params: dict[str, Any]) -> str:
    pipeline_config = _merged_pipeline_config(params.get("pipeline_config", {}))
    config_hash = _stable_config_hash(pipeline_config)
    output_root = Path(case.input.get("output_root", "example_runs"))
    run_dir = output_root / case.id / config_hash
    run_dir.mkdir(parents=True, exist_ok=True)

    encounter = _build_encounter(case)
    debug = _simulate(encounter=encounter, pipeline_config=pipeline_config)

    transcript_path = run_dir / "transcript.txt"
    note_path = run_dir / "note.txt"
    debug_path = run_dir / "debug.json"
    manifest_path = run_dir / "manifest.json"

    transcript_path.write_text(debug["transcript"], encoding="utf-8")
    note_path.write_text(debug["note"], encoding="utf-8")
    debug_path.write_text(json.dumps(debug, indent=2, sort_keys=True), encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            {
                "pipeline_name": "deterministic-asr-demo",
                "status": "success",
                "source_run_dir": str(run_dir.resolve()),
                "metadata": {
                    "config_hash": config_hash,
                    "quality_score": debug["quality_score"],
                    "quality_band": debug["quality_band"],
                },
                "outputs": {
                    "note_txt": {"kind": "text", "uri": "note.txt"},
                    "transcript_txt": {"kind": "text", "uri": "transcript.txt"},
                    "debug_json": {"kind": "json", "uri": "debug.json"},
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return str(manifest_path.resolve())


def _merged_pipeline_config(raw_config: dict[str, Any]) -> dict[str, Any]:
    merged = json.loads(json.dumps(DEFAULT_PIPELINE_CONFIG))
    for key, value in raw_config.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


def _stable_config_hash(config: dict[str, Any]) -> str:
    payload = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:10]


def _build_encounter(case: Case) -> dict[str, Any]:
    base = {
        "patient_name": "Jordan Lee",
        "speaker_roles": ["clinician", "patient"],
        "complaint": "cough and fever",
        "duration_days": 3,
        "medications": ["ibuprofen"],
        "allergies": ["penicillin"],
        "plan": ["hydration", "rest", "return if symptoms worsen"],
    }
    encounter = case.input.get("encounter", {})
    if not isinstance(encounter, dict):
        return base
    merged = dict(base)
    merged.update(encounter)
    return merged


def _simulate(*, encounter: dict[str, Any], pipeline_config: dict[str, Any]) -> dict[str, Any]:
    quality_score = 0.56
    effects: list[str] = []

    preprocessing = pipeline_config["preprocessing"]
    quality_score, effects = _apply_preprocessing(preprocessing, quality_score, effects)

    asr_model = pipeline_config["asr"]["model"]
    if asr_model == "whisper":
        quality_score += 0.16
        effects.append("whisper preserves named entities and medication details")
    else:
        quality_score -= 0.04
        effects.append("parakeet compresses detail and abbreviates clinical phrases")

    note_generation = pipeline_config["note_generation"]
    note_model = note_generation["model"]
    if note_model == "gpt-5":
        quality_score += 0.12
        effects.append("gpt-5 carries more transcript facts into the note")
    else:
        quality_score += 0.03
        effects.append("gpt-5-mini keeps the note concise but may omit context")

    prompt_style = note_generation["prompt_style"]
    if prompt_style == "soap":
        quality_score += 0.08
        effects.append("soap prompt enforces assessment and plan structure")
    elif prompt_style == "detailed":
        quality_score += 0.05
        effects.append("detailed prompt expands medication and allergy sections")
    else:
        quality_score -= 0.06
        effects.append("brief prompt collapses supporting detail")

    quality_score = max(0.15, min(0.98, round(quality_score, 3)))
    quality_band = _quality_band(quality_score)
    transcript = _render_transcript(encounter, preprocessing, asr_model, quality_band)
    note = _render_note(encounter, quality_band, note_model, prompt_style)

    return {
        "pipeline_config": pipeline_config,
        "quality_score": quality_score,
        "quality_band": quality_band,
        "effects": effects,
        "transcript": transcript,
        "note": note,
    }


def _apply_preprocessing(
    preprocessing: dict[str, Any], quality_score: float, effects: list[str]
) -> tuple[float, list[str]]:
    denoise = preprocessing["denoise"]
    if denoise == "mild":
        quality_score += 0.08
        effects.append("mild denoise removes low-level noise without hurting speech")
    elif denoise == "aggressive":
        quality_score += 0.02
        effects.append("aggressive denoise removes noise but clips consonants")
    else:
        effects.append("no denoise leaves background noise in the signal")

    if preprocessing["voice_enhancement"] == "on":
        quality_score += 0.05
        effects.append("voice enhancement improves speaker prominence")
    else:
        effects.append("no voice enhancement leaves quiet spans harder to decode")

    silence_trimming = preprocessing["silence_trimming"]
    if silence_trimming == "conservative":
        quality_score += 0.02
        effects.append("conservative trimming removes dead air without cutting content")
    elif silence_trimming == "aggressive":
        quality_score -= 0.08
        effects.append("aggressive trimming removes short phrases near pauses")
    else:
        effects.append("no silence trimming keeps filler and room noise")

    vad = preprocessing["vad"]
    if vad == "basic":
        quality_score += 0.03
        effects.append("basic VAD keeps speaker turns aligned")
    elif vad == "strict":
        quality_score -= 0.06
        effects.append("strict VAD drops low-energy tail phrases")
    else:
        effects.append("no VAD lets non-speech fragments leak into transcript")

    return quality_score, effects


def _quality_band(score: float) -> str:
    if score >= 0.86:
        return "high"
    if score >= 0.7:
        return "medium"
    return "low"


def _render_transcript(
    encounter: dict[str, Any],
    preprocessing: dict[str, Any],
    asr_model: str,
    quality_band: str,
) -> str:
    complaint = encounter["complaint"]
    duration_days = encounter["duration_days"]
    meds = ", ".join(encounter["medications"])
    allergies = ", ".join(encounter["allergies"])

    if quality_band == "high":
        patient_line = (
            f"Patient: {encounter['patient_name']} reports {complaint} for {duration_days} days."
        )
        follow_up = f"Medications: {meds}. Allergies: {allergies}."
    elif quality_band == "medium":
        patient_line = f"Patient reports {complaint} for several days."
        follow_up = f"Medication noted: {meds}. Allergy history captured."
    else:
        patient_line = "Patient reports cough and fever."
        follow_up = "Medication and allergy details partly unclear."

    prefix = "Clinician/Patient transcript" if preprocessing["vad"] == "basic" else "Merged transcript"
    suffix = "ASR engine: Whisper." if asr_model == "whisper" else "ASR engine: Parakeet."
    return f"{prefix}\n{patient_line}\n{follow_up}\nPlan discussed: rest and hydration.\n{suffix}"


def _render_note(
    encounter: dict[str, Any], quality_band: str, note_model: str, prompt_style: str
) -> str:
    complaint = encounter["complaint"]
    duration_days = encounter["duration_days"]
    meds = ", ".join(encounter["medications"])
    allergies = ", ".join(encounter["allergies"])
    plan_items = "; ".join(encounter["plan"])

    if quality_band == "high":
        facts = {
            "patient": encounter["patient_name"],
            "subjective": f"Reports {complaint} for {duration_days} days.",
            "medications": meds,
            "allergies": allergies,
            "assessment": complaint,
            "plan": plan_items,
        }
    elif quality_band == "medium":
        facts = {
            "patient": None,
            "subjective": f"Reports {complaint}.",
            "medications": meds,
            "allergies": "allergy history reviewed",
            "assessment": complaint,
            "plan": "hydration; rest",
        }
    else:
        facts = {
            "patient": None,
            "subjective": "Reports cough and fever.",
            "medications": None,
            "allergies": None,
            "assessment": "upper respiratory symptoms",
            "plan": "rest",
        }

    if prompt_style == "brief":
        note = f"Assessment: {facts['assessment']}. Plan: {facts['plan']}."
        if note_model == "gpt-5" and quality_band != "low":
            note = f"{note} Summary: {facts['subjective']}"
        return note

    if prompt_style == "detailed":
        lines = [
            "Clinical Note",
            f"Subjective: {facts['subjective']}",
            f"Assessment: {facts['assessment']}.",
            f"Plan: {facts['plan']}.",
        ]
        if facts["patient"]:
            lines.insert(1, f"Patient: {facts['patient']}")
        if facts["medications"]:
            lines.append(f"Medications: {facts['medications']}.")
        if facts["allergies"]:
            lines.append(f"Allergies: {facts['allergies']}.")
        return "\n".join(lines)

    soap_lines = []
    if facts["patient"]:
        soap_lines.append(f"Patient: {facts['patient']}")
    soap_lines.extend(
        [
            f"Subjective: {facts['subjective']}",
            "Objective: Deterministic demo transcript available.",
            f"Assessment: {facts['assessment']}.",
            f"Plan: {facts['plan']}.",
        ]
    )
    if facts["medications"] and quality_band != "low":
        soap_lines.append(f"Medications: {facts['medications']}.")
    if facts["allergies"] and quality_band != "low":
        soap_lines.append(f"Allergies: {facts['allergies']}.")
    return "\n".join(soap_lines)

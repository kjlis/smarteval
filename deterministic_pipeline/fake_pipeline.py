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

GOLDEN_PIPELINE_CONFIG: dict[str, Any] = {
    "preprocessing": {
        "denoise": "mild",
        "voice_enhancement": "on",
        "silence_trimming": "conservative",
        "vad": "basic",
    },
    "asr": {"model": "whisper"},
    "note_generation": {"model": "gpt-5", "prompt_style": "detailed"},
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
                    "profile": debug["profile"],
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
    return _normalize_pipeline_config(merged)


def _normalize_pipeline_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = json.loads(json.dumps(config))
    preprocessing = normalized.get("preprocessing", {})
    if "voice_enhancement" in preprocessing:
        preprocessing["voice_enhancement"] = _normalize_toggle(preprocessing["voice_enhancement"])
    if "denoise" in preprocessing:
        preprocessing["denoise"] = _normalize_denoise(preprocessing["denoise"])
    return normalized


def _normalize_toggle(value: Any) -> Any:
    if isinstance(value, bool):
        return "on" if value else "off"
    return value


def _normalize_denoise(value: Any) -> Any:
    if not isinstance(value, bool):
        return value
    # YAML will parse unquoted `off` as False. Treat a boolean enable as the
    # mild canonical preset instead of falling through to the custom profile.
    return "mild" if value else "off"


def _stable_config_hash(config: dict[str, Any]) -> str:
    payload = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:10]


def _build_encounter(case: Case) -> dict[str, Any]:
    base = {
        "patient_name": "Jordan Lee",
        "age": 34,
        "speaker_roles": ["clinician", "patient"],
        "complaint": "persistent cough, fever, and fatigue",
        "duration_days": 3,
        "history": "Symptoms began after a sick contact at home and have been worse at night.",
        "associated_symptoms": [
            "sore throat",
            "nasal congestion",
            "intermittent chills",
            "decreased appetite",
        ],
        "negative_symptoms": ["no chest pain", "no hemoptysis", "no shortness of breath at rest"],
        "medications": ["ibuprofen 400 mg as needed", "dextromethorphan syrup at bedtime"],
        "allergies": ["penicillin"],
        "vitals": {
            "temperature": "38.1 C",
            "heart_rate": "98 bpm",
            "blood_pressure": "118/74",
            "oxygen_saturation": "98% on room air",
        },
        "exam": [
            "mild pharyngeal erythema",
            "dry cough during interview",
            "lungs clear to auscultation",
            "no respiratory distress",
        ],
        "assessment": "Most consistent with a viral upper respiratory infection without current evidence of pneumonia.",
        "plan": [
            "supportive care with hydration and rest",
            "continue ibuprofen for fever and pain",
            "consider honey or throat lozenges for cough relief",
            "follow up if symptoms persist beyond 5 to 7 days",
        ],
        "return_precautions": [
            "seek urgent care for worsening shortness of breath",
            "return for persistent fever above 39 C",
            "re-evaluate if cough becomes productive with chest pain",
        ],
    }
    encounter = case.input.get("encounter", {})
    if not isinstance(encounter, dict):
        return base
    merged = dict(base)
    for key, value in encounter.items():
        merged[key] = value
    return merged


def _simulate(*, encounter: dict[str, Any], pipeline_config: dict[str, Any]) -> dict[str, Any]:
    profile = _classify_profile(pipeline_config)
    dimensions = _score_dimensions(pipeline_config, profile)
    quality_score = round(
        (
            dimensions["factual_capture"] * 0.36
            + dimensions["grammar"] * 0.22
            + dimensions["structure"] * 0.20
            + dimensions["recommendation_quality"] * 0.22
        ),
        3,
    )
    quality_band = _quality_band(quality_score)
    language_leakage = _language_leakage(profile)
    effects = _build_effects(profile, pipeline_config, dimensions, language_leakage)
    transcript = _render_transcript(encounter, profile, language_leakage)
    note = _render_note(encounter, profile, language_leakage)

    return {
        "pipeline_config": pipeline_config,
        "profile": profile,
        "quality_score": quality_score,
        "quality_band": quality_band,
        "dimensions": dimensions,
        "language_leakage": language_leakage,
        "effects": effects,
        "transcript": transcript,
        "note": note,
    }


def _classify_profile(pipeline_config: dict[str, Any]) -> str:
    preprocessing = pipeline_config["preprocessing"]
    asr_model = pipeline_config["asr"]["model"]
    note_generation = pipeline_config["note_generation"]
    note_model = note_generation["model"]
    prompt_style = note_generation["prompt_style"]

    if pipeline_config == GOLDEN_PIPELINE_CONFIG:
        return "golden"
    if (
        preprocessing["denoise"] == "mild"
        and preprocessing["voice_enhancement"] == "on"
        and preprocessing["silence_trimming"] == "conservative"
        and preprocessing["vad"] == "basic"
        and asr_model == "whisper"
        and note_model == "gpt-5"
        and prompt_style == "soap"
    ):
        return "advanced"
    if (
        preprocessing["denoise"] == "off"
        and preprocessing["voice_enhancement"] == "off"
        and preprocessing["silence_trimming"] == "aggressive"
        and preprocessing["vad"] == "strict"
        and asr_model == "parakeet"
        and note_model == "gpt-5-mini"
        and prompt_style == "brief"
    ):
        return "baseline"
    if (
        preprocessing["denoise"] == "aggressive"
        and preprocessing["voice_enhancement"] == "on"
        and asr_model == "whisper"
        and note_model == "gpt-5-mini"
        and prompt_style == "soap"
    ):
        return "intermediate"
    if (
        preprocessing["denoise"] == "mild"
        and preprocessing["voice_enhancement"] == "on"
        and preprocessing["silence_trimming"] == "conservative"
        and preprocessing["vad"] == "basic"
        and asr_model == "whisper"
        and note_model == "gpt-5-mini"
        and prompt_style == "detailed"
    ):
        return "best"
    return "custom"


def _score_dimensions(pipeline_config: dict[str, Any], profile: str) -> dict[str, float]:
    factual = 0.56
    grammar = 0.60
    structure = 0.54
    recommendations = 0.52

    preprocessing = pipeline_config["preprocessing"]
    if preprocessing["denoise"] == "mild":
        factual += 0.12
    elif preprocessing["denoise"] == "aggressive":
        factual += 0.04
        grammar -= 0.03

    if preprocessing["voice_enhancement"] == "on":
        factual += 0.05

    if preprocessing["silence_trimming"] == "conservative":
        factual += 0.04
        structure += 0.03
    elif preprocessing["silence_trimming"] == "aggressive":
        factual -= 0.10
        recommendations -= 0.04

    if preprocessing["vad"] == "basic":
        structure += 0.06
    elif preprocessing["vad"] == "strict":
        factual -= 0.08
        grammar -= 0.02

    if pipeline_config["asr"]["model"] == "whisper":
        factual += 0.14
        grammar += 0.04
    else:
        factual -= 0.05
        grammar -= 0.05

    note_generation = pipeline_config["note_generation"]
    if note_generation["model"] == "gpt-5":
        grammar += 0.18
        recommendations += 0.19
    else:
        grammar += 0.05
        recommendations += 0.05

    prompt_style = note_generation["prompt_style"]
    if prompt_style == "brief":
        structure -= 0.14
        recommendations -= 0.12
    elif prompt_style == "soap":
        structure += 0.10
        recommendations += 0.06
    elif prompt_style == "detailed":
        structure += 0.14
        recommendations += 0.10

    if profile == "baseline":
        grammar -= 0.12
        recommendations -= 0.06
    elif profile == "intermediate":
        grammar -= 0.08
    elif profile == "best":
        grammar -= 0.05
        recommendations -= 0.03
    elif profile == "advanced":
        factual += 0.04
        grammar += 0.06
        structure += 0.05
        recommendations += 0.04
    elif profile == "golden":
        factual += 0.12
        grammar += 0.14
        structure += 0.12
        recommendations += 0.14

    values = {
        "factual_capture": factual,
        "grammar": grammar,
        "structure": structure,
        "recommendation_quality": recommendations,
    }
    return {key: round(max(0.2, min(0.98, value)), 3) for key, value in values.items()}


def _quality_band(score: float) -> str:
    if score >= 0.95:
        return "golden"
    if score >= 0.84:
        return "high"
    if score >= 0.70:
        return "medium"
    return "low"


def _language_leakage(profile: str) -> dict[str, str | list[str]]:
    if profile == "baseline":
        return {"language": "Spanish", "tokens": ["por favor", "tos"]}  # plausible random leak
    if profile == "intermediate":
        return {"language": "Polish", "tokens": ["dziekuje", "kaszel"]}
    if profile == "best":
        return {"language": "French", "tokens": ["merci", "fatigue"]}
    if profile == "advanced":
        return {"language": "none", "tokens": []}
    return {"language": "none", "tokens": []}


def _build_effects(
    profile: str,
    pipeline_config: dict[str, Any],
    dimensions: dict[str, float],
    language_leakage: dict[str, str | list[str]],
) -> list[str]:
    effects = [
        f"profile={profile}",
        f"factual_capture={dimensions['factual_capture']}",
        f"grammar={dimensions['grammar']}",
        f"structure={dimensions['structure']}",
        f"recommendation_quality={dimensions['recommendation_quality']}",
        f"asr_model={pipeline_config['asr']['model']}",
        f"prompt_style={pipeline_config['note_generation']['prompt_style']}",
    ]
    if language_leakage["language"] != "none":
        effects.append(f"language_leakage={language_leakage['language']}")
    return effects


def _render_transcript(
    encounter: dict[str, Any], profile: str, language_leakage: dict[str, str | list[str]]
) -> str:
    meds = "; ".join(encounter["medications"])
    negatives = "; ".join(encounter["negative_symptoms"])
    token_1, token_2 = _leak_tokens(language_leakage)

    if profile == "golden":
        return (
            f"Clinician: Please walk me through what has been happening.\n"
            f"Patient: I am {encounter['patient_name']}, and I have had {encounter['complaint']} for "
            f"{encounter['duration_days']} days. {encounter['history']}\n"
            f"Patient: I also notice {', '.join(encounter['associated_symptoms'])}. I am taking {meds}.\n"
            f"Clinician: Any allergies or red flag symptoms?\n"
            f"Patient: Allergy to {', '.join(encounter['allergies'])}. {negatives}.\n"
            f"Clinician: We discussed supportive care, reassessment, and return precautions."
        )

    if profile == "baseline":
        return (
            "Merged transcript\n"
            f"Pt says cough and fever around some days, {token_1}, with tired feeling and throat hurt.\n"
            f"Maybe used meds but exact not always clear. Allergy part partly missed. {token_2}.\n"
            "Plan talked about rest and fluids, maybe come back if worse."
        )

    if profile == "intermediate":
        return (
            "Clinician/Patient transcript\n"
            f"Patient reports cough, fever, fatigue, and sore throat for several days. "
            f"Uses {encounter['medications'][0]}. {token_1}.\n"
            f"Some details on appetite and return guidance captured, although allergy wording is soft. {token_2}."
        )

    if profile == "best":
        return (
            "Clinician/Patient transcript\n"
            f"Patient {encounter['patient_name']} reports {encounter['complaint']} for "
            f"{encounter['duration_days']} days after household exposure. "
            f"Also notes {', '.join(encounter['associated_symptoms'])}. {token_1}.\n"
            f"Medication and return guidance were captured, though one phrase drifted in from another language: {token_2}."
        )

    if profile == "advanced":
        return (
            "Clinician/Patient transcript\n"
            f"Patient {encounter['patient_name']} describes {encounter['complaint']} for "
            f"{encounter['duration_days']} days with night worsening after a sick household exposure. "
            f"Associated symptoms include {', '.join(encounter['associated_symptoms'])}. "
            f"Medication use and allergy history were captured clearly, and explicit return precautions were discussed."
        )

    return (
        "Clinician/Patient transcript\n"
        f"Patient reports {encounter['complaint']} and feels fatigued. Additional details vary by config."
    )


def _render_note(
    encounter: dict[str, Any], profile: str, language_leakage: dict[str, str | list[str]]
) -> str:
    if profile == "golden":
        return _golden_note(encounter)
    if profile == "baseline":
        return _baseline_note(encounter, language_leakage)
    if profile == "intermediate":
        return _intermediate_note(encounter, language_leakage)
    if profile == "best":
        return _best_note(encounter, language_leakage)
    if profile == "advanced":
        return _advanced_note(encounter)
    return _custom_note(encounter)


def _baseline_note(encounter: dict[str, Any], leakage: dict[str, str | list[str]]) -> str:
    token_1, token_2 = _leak_tokens(leakage)
    return (
        f"Visit note: patient came because of cough, fever and feeling tired for around "
        f"{encounter['duration_days']} days. She say symptoms got worse mostly at night and eating less, "
        f"but timeline is not very exact because audio was choppy. The patient mention some sore throat and "
        f"congestion, {token_1}, and maybe chills too. Current medicine sounded like ibuprofen and cough syrup, "
        f"though dose not fully captured. Allergy section was unclear in the recording and was not reliable.\n\n"
        "Assessment is likely viral illness or other upper respiratory problem. Lungs sounded probably okay from the "
        "discussion and there was no obvious emergency issue reported in the call. Note structure is simple and some "
        "phrases are rough because transcript was fragmentary.\n\n"
        f"Plan: advise rest, fluids, symptom meds, and monitor. Can continue home treatment if feeling same or little "
        f"better. Follow-up if still sick in several days. Return sooner if breathing gets bad or high fever continue, "
        f"{token_2}. Recommendation quality is limited because exact red flags and allergy details were not all retained."
    )


def _intermediate_note(encounter: dict[str, Any], leakage: dict[str, str | list[str]]) -> str:
    token_1, token_2 = _leak_tokens(leakage)
    return (
        "SOAP Note\n"
        f"Subjective: Patient reports {encounter['complaint']} for several days after sick exposure at home. "
        f"Associated symptoms include {', '.join(encounter['associated_symptoms'][:3])}. "
        f"She has been using {encounter['medications'][0]} and says appetite is down. One stray language fragment "
        f"appeared in the transcript, {token_1}, but the rest was understandable.\n\n"
        f"Objective: Conversation suggests temperature near {encounter['vitals']['temperature']} and no respiratory "
        f"distress. Dry cough was heard during the interview. Some exam details remained incomplete and the allergy "
        f"history was summarized only loosely. {token_2}.\n\n"
        "Assessment: Viral upper respiratory infection is most likely. Pneumonia seems less likely because the patient "
        "denied chest pain and shortness of breath at rest, but the note still lacks a crisp summary of all negatives.\n\n"
        "Plan: Continue hydration, rest, and ibuprofen as needed for fever or throat discomfort. Encourage cough "
        "supportive care and reassess if symptoms are not improving. Follow-up guidance is present but not highly "
        "specific, and the grammar remains uneven in several sentences."
    )


def _best_note(encounter: dict[str, Any], leakage: dict[str, str | list[str]]) -> str:
    token_1, token_2 = _leak_tokens(leakage)
    return (
        "Clinical Follow-Up Note\n"
        f"{encounter['patient_name']} is a {encounter['age']}-year-old adult seen for {encounter['complaint']} "
        f"lasting {encounter['duration_days']} days. Symptoms began after a household sick contact and are worse at "
        f"night. The patient also described {', '.join(encounter['associated_symptoms'])}. Current self-care includes "
        f"{'; '.join(encounter['medications'])}. Overall intake is reduced but oral hydration is still possible. "
        f"A small language drift appeared in the transcript as {token_1}, and another isolated term, {token_2}, but "
        "the rest of the documentation remained understandable.\n\n"
        f"On review of the recorded encounter, the patient denied {', '.join(encounter['negative_symptoms'])}. "
        f"Reported vitals and observed status were reassuring, including oxygen saturation {encounter['vitals']['oxygen_saturation']}. "
        f"Exam descriptors included {', '.join(encounter['exam'])}.\n\n"
        f"Assessment: {encounter['assessment']}\n\n"
        "Plan: Continue supportive care with hydration, rest, antipyretic use, and symptomatic cough treatment. "
        "Recommend reassessment if symptoms fail to improve over the next several days. The recommendation set is better "
        "organized than the weaker variants, but it still does not spell out full return precautions with the same clarity "
        "as the golden note."
    )


def _advanced_note(encounter: dict[str, Any]) -> str:
    return (
        "SOAP Note\n"
        f"Subjective: {encounter['patient_name']} is a {encounter['age']}-year-old adult presenting with "
        f"{encounter['complaint']} for {encounter['duration_days']} days after a household sick contact. "
        f"Symptoms have been worse at night and include {', '.join(encounter['associated_symptoms'])}. "
        f"The patient has used {'; '.join(encounter['medications'])} with partial relief and confirms allergy to "
        f"{', '.join(encounter['allergies'])}.\n\n"
        f"Objective: Review of the encounter captured reassuring negatives including "
        f"{', '.join(encounter['negative_symptoms'])}. Reported vitals were temperature "
        f"{encounter['vitals']['temperature']}, heart rate {encounter['vitals']['heart_rate']}, blood pressure "
        f"{encounter['vitals']['blood_pressure']}, and oxygen saturation {encounter['vitals']['oxygen_saturation']}. "
        f"Exam descriptors included {', '.join(encounter['exam'])}.\n\n"
        f"Assessment: {encounter['assessment']} The overall picture remains appropriate for outpatient management.\n\n"
        f"Plan: {encounter['plan'][0].capitalize()}, {encounter['plan'][1]}, and {encounter['plan'][2]}. "
        f"Also {encounter['plan'][3]}. Return precautions were reviewed, including "
        f"{'; '.join(encounter['return_precautions'])}. The note is strong and clinically usable, although it is still "
        "slightly less comprehensive and polished than the dedicated golden configuration."
    )


def _golden_note(encounter: dict[str, Any]) -> str:
    return (
        f"Clinical Follow-Up Note\n"
        f"{encounter['patient_name']} is a {encounter['age']}-year-old adult evaluated for {encounter['complaint']} "
        f"for {encounter['duration_days']} days after a household sick contact. The patient reports that symptoms have "
        f"been worse at night and are accompanied by {', '.join(encounter['associated_symptoms'])}. Appetite is reduced, "
        f"but oral intake and hydration are still adequate. The patient has been using "
        f"{'; '.join(encounter['medications'])} with partial relief. Allergy history is notable for "
        f"{', '.join(encounter['allergies'])}.\n\n"
        f"Review of symptoms is otherwise reassuring for {', '.join(encounter['negative_symptoms'])}. "
        f"Observed or reported vitals include temperature {encounter['vitals']['temperature']}, heart rate "
        f"{encounter['vitals']['heart_rate']}, blood pressure {encounter['vitals']['blood_pressure']}, and oxygen "
        f"saturation {encounter['vitals']['oxygen_saturation']}. Exam findings documented in the encounter included "
        f"{', '.join(encounter['exam'])}.\n\n"
        f"Assessment: {encounter['assessment']} The current presentation favors supportive outpatient management because "
        "there is no evidence in the transcript of focal chest findings, resting dyspnea, or hemodynamic instability.\n\n"
        f"Plan: {encounter['plan'][0].capitalize()}, {encounter['plan'][1]}, and {encounter['plan'][2]}. "
        f"Also {encounter['plan'][3]}. Reinforced medication safety, hydration goals, and cough comfort measures. "
        "Return precautions were reviewed explicitly: return precautions include "
        f"{'; '.join(encounter['return_precautions'])}. If the fever pattern worsens, respiratory symptoms escalate, "
        "or oral intake declines further, the patient should be re-evaluated sooner rather than waiting for routine follow-up."
    )


def _custom_note(encounter: dict[str, Any]) -> str:
    return (
        f"Clinical note for {encounter['patient_name']}: evaluated for {encounter['complaint']} with mixed-quality "
        "pipeline settings. The note is serviceable but not calibrated to one of the explicit demo profiles."
    )


def _leak_tokens(language_leakage: dict[str, str | list[str]]) -> tuple[str, str]:
    tokens = language_leakage["tokens"]
    if not isinstance(tokens, list) or len(tokens) < 2:
        return "", ""
    return str(tokens[0]), str(tokens[1])

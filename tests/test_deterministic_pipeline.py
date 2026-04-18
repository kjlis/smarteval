from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import yaml

from smarteval.core.models import Case
from smarteval.plugins.generators.pipeline import PipelineGenerator
from smarteval.plugins.registry import load_callable


def make_case(tmp_dir: str) -> Case:
    return Case(
        id="visit-1",
        input={
            "output_root": tmp_dir,
            "encounter": {
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
                "negative_symptoms": [
                    "no chest pain",
                    "no hemoptysis",
                    "no shortness of breath at rest",
                ],
                "medications": [
                    "ibuprofen 400 mg as needed",
                    "dextromethorphan syrup at bedtime",
                ],
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
            },
        },
        added_at="2026-04-18",
    )


class DeterministicPipelineTests(unittest.TestCase):
    def test_fake_pipeline_is_deterministic_for_same_case_and_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            runner = load_callable("deterministic_pipeline.fake_pipeline:run_pipeline")
            params = {
                "pipeline_config": {
                    "preprocessing": {
                        "denoise": "mild",
                        "voice_enhancement": "on",
                        "silence_trimming": "conservative",
                        "vad": "basic",
                    },
                    "asr": {"model": "whisper"},
                    "note_generation": {"model": "gpt-5-mini", "prompt_style": "soap"},
                }
            }

            first = runner(case=case, params=params)
            second = runner(case=case, params=params)

            self.assertEqual(first, second)
            self.assertTrue(Path(first).exists())

    def test_fake_pipeline_changes_note_when_config_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            generator = PipelineGenerator(
                callable="deterministic_pipeline.fake_pipeline:run_pipeline"
            )
            weak_params = {
                "primary_output": "note_txt",
                "pipeline_config": {
                    "preprocessing": {
                        "denoise": "off",
                        "voice_enhancement": "off",
                        "silence_trimming": "aggressive",
                        "vad": "strict",
                    },
                    "asr": {"model": "parakeet"},
                    "note_generation": {"model": "gpt-5-mini", "prompt_style": "brief"},
                },
            }
            strong_params = {
                "primary_output": "note_txt",
                "pipeline_config": {
                    "preprocessing": {
                        "denoise": "mild",
                        "voice_enhancement": "on",
                        "silence_trimming": "conservative",
                        "vad": "basic",
                    },
                    "asr": {"model": "whisper"},
                    "note_generation": {"model": "gpt-5", "prompt_style": "soap"},
                },
            }

            weak_note = generator.generate(case, weak_params).payload
            strong_note = generator.generate(case, strong_params).payload

            self.assertNotEqual(weak_note, strong_note)
            self.assertIn("Jordan Lee", strong_note)
            self.assertNotIn("Jordan Lee", weak_note)
            self.assertGreater(len(strong_note.split()), 120)
            self.assertLess(len(weak_note.split()), len(strong_note.split()))

    def test_pipeline_generator_keeps_transcript_and_debug_attachments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            generator = PipelineGenerator(
                callable="deterministic_pipeline.fake_pipeline:run_pipeline"
            )

            artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": {
                        "preprocessing": {
                            "denoise": "mild",
                            "voice_enhancement": "on",
                            "silence_trimming": "conservative",
                            "vad": "basic",
                        },
                        "asr": {"model": "whisper"},
                        "note_generation": {"model": "gpt-5-mini", "prompt_style": "detailed"},
                    },
                },
            )

            self.assertEqual(artifact.kind, "text")
            self.assertIn("transcript_txt", artifact.attachments)
            self.assertIn("debug_json", artifact.attachments)
            self.assertEqual(artifact.metadata["pipeline_name"], "deterministic-asr-demo")

    def test_yaml_boolean_toggles_do_not_fall_through_to_custom_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            generator = PipelineGenerator(
                callable="deterministic_pipeline.fake_pipeline:run_pipeline"
            )
            parsed = yaml.safe_load(
                """
                preprocessing:
                  denoise: off
                  voice_enhancement: off
                  silence_trimming: aggressive
                  vad: strict
                asr:
                  model: parakeet
                note_generation:
                  model: gpt-5-mini
                  prompt_style: brief
                """
            )

            artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": parsed,
                },
            )
            debug_payload = json.loads(
                Path(artifact.source_run_dir or "").joinpath("debug.json").read_text(
                    encoding="utf-8"
                )
            )

            self.assertEqual(debug_payload["profile"], "baseline")
            self.assertIn("audio was choppy", artifact.payload)

    def test_golden_config_is_materially_better_than_other_demo_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            generator = PipelineGenerator(
                callable="deterministic_pipeline.fake_pipeline:run_pipeline"
            )

            baseline_artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": {
                        "preprocessing": {
                            "denoise": "off",
                            "voice_enhancement": "off",
                            "silence_trimming": "aggressive",
                            "vad": "strict",
                        },
                        "asr": {"model": "parakeet"},
                        "note_generation": {"model": "gpt-5-mini", "prompt_style": "brief"},
                    },
                },
            )
            intermediate_artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": {
                        "preprocessing": {
                            "denoise": "aggressive",
                            "voice_enhancement": "on",
                            "silence_trimming": "conservative",
                            "vad": "basic",
                        },
                        "asr": {"model": "whisper"},
                        "note_generation": {"model": "gpt-5-mini", "prompt_style": "soap"},
                    },
                },
            )
            golden_artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": {
                        "preprocessing": {
                            "denoise": "mild",
                            "voice_enhancement": "on",
                            "silence_trimming": "conservative",
                            "vad": "basic",
                        },
                        "asr": {"model": "whisper"},
                        "note_generation": {"model": "gpt-5", "prompt_style": "detailed"},
                    },
                },
            )

            baseline_payload = json.loads(
                Path(baseline_artifact.source_run_dir or "").joinpath("debug.json").read_text(
                    encoding="utf-8"
                )
            )
            intermediate_payload = json.loads(
                Path(intermediate_artifact.source_run_dir or "").joinpath("debug.json").read_text(
                    encoding="utf-8"
                )
            )
            golden_payload = json.loads(
                Path(golden_artifact.source_run_dir or "").joinpath("debug.json").read_text(
                    encoding="utf-8"
                )
            )

            self.assertLess(baseline_payload["quality_score"], intermediate_payload["quality_score"])
            self.assertLess(intermediate_payload["quality_score"], golden_payload["quality_score"])
            self.assertEqual(golden_payload["quality_band"], "golden")
            self.assertNotEqual(
                baseline_payload["language_leakage"]["language"],
                intermediate_payload["language_leakage"]["language"],
            )
            self.assertGreater(golden_payload["dimensions"]["recommendation_quality"], 0.9)
            self.assertLess(baseline_payload["dimensions"]["grammar"], 0.75)
            self.assertIn("return precautions", golden_artifact.payload.lower())
            self.assertIn("por favor", baseline_artifact.payload.lower())
            self.assertIn("dziekuje", intermediate_artifact.payload.lower())

    def test_demo_eval_configs_cover_baseline_intermediate_and_golden(self) -> None:
        root = Path(__file__).resolve().parent.parent / "examples" / "asr_manifest"
        for filename in (
            "smarteval_fast.yaml",
            "smarteval_balanced.yaml",
            "smarteval_best.yaml",
            "smarteval_golden.yaml",
        ):
            self.assertTrue((root / filename).exists(), filename)

    def test_pipeline_normalizes_yaml_booleans_for_profile_matching(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = make_case(tmp_dir)
            generator = PipelineGenerator(
                callable="deterministic_pipeline.fake_pipeline:run_pipeline"
            )

            artifact = generator.generate(
                case,
                {
                    "primary_output": "note_txt",
                    "pipeline_config": {
                        "preprocessing": {
                            "denoise": "mild",
                            "voice_enhancement": True,
                            "silence_trimming": "conservative",
                            "vad": "basic",
                        },
                        "asr": {"model": "whisper"},
                        "note_generation": {"model": "gpt-5", "prompt_style": "detailed"},
                    },
                },
            )

            payload = json.loads(
                Path(artifact.source_run_dir or "").joinpath("debug.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(payload["profile"], "golden")
            self.assertEqual(payload["quality_band"], "golden")

if __name__ == "__main__":
    unittest.main()

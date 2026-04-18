from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

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
                "speaker_roles": ["clinician", "patient"],
                "complaint": "cough and fever",
                "duration_days": 3,
                "medications": ["ibuprofen"],
                "allergies": ["penicillin"],
                "plan": ["hydration", "rest", "return if symptoms worsen"],
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

if __name__ == "__main__":
    unittest.main()

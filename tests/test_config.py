from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path

from smarteval.core.config import load_config
from smarteval.plugins.registry import create_generator


class ConfigLoadingTests(unittest.TestCase):
    def test_pipeline_config_inherits_primary_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            config_path = tmp_path / "smarteval.yaml"
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text("", encoding="utf-8")
            prompt_dir = tmp_path / "configs"
            prompt_dir.mkdir()

            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: ./golden.jsonl
                    baseline: note-baseline
                    artifact_selection:
                      primary_output: note_txt
                      copy_attachments: false
                    evaluator:
                      model: gpt-4o-mini
                    variants:
                      - id: note-baseline
                        generator:
                          kind: pipeline
                          callable: builtins:print
                        params:
                          pipeline_config: ./configs/note.yaml
                    """
                ),
                encoding="utf-8",
            )

            config = load_config(config_path)
            self.assertEqual(config.artifact_selection.primary_output, "note_txt")
            self.assertEqual(config.golden_set, golden_path.resolve())

            generator, params = create_generator(config.get_variant("note-baseline"), config=config)
            self.assertEqual(generator.name, "pipeline")
            self.assertEqual(params["primary_output"], "note_txt")
            self.assertFalse(params["copy_attachments"])
            self.assertEqual(params["pipeline_config"], str((prompt_dir / "note.yaml").resolve()))

    def test_missing_baseline_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            config_path = tmp_path / "smarteval.yaml"
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text("", encoding="utf-8")

            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden_path}
                    baseline: missing
                    evaluator:
                      model: gpt-4o-mini
                    variants:
                      - id: only
                        generator:
                          kind: script
                          callable: builtins:str
                    """
                ),
                encoding="utf-8",
            )

            with self.assertRaises(ValueError):
                load_config(config_path)

    def test_deterministic_demo_configs_load(self) -> None:
        root = Path(__file__).resolve().parent.parent
        demo_configs = [
            root / "examples" / "asr_manifest" / "smarteval.yaml",
        ]

        loaded_ids: list[str] = []
        prompt_styles: list[str] = []
        asr_models: list[str] = []

        for config_path in demo_configs:
            config = load_config(config_path)
            variant = config.get_variant(config.baseline)
            generator, params = create_generator(variant, config=config)

            loaded_ids.append(variant.id)
            prompt_styles.append(params["pipeline_config"]["note_generation"]["prompt_style"])
            asr_models.append(params["pipeline_config"]["asr"]["model"])

            self.assertEqual(generator.name, "pipeline")
            self.assertEqual(
                params["callable"], "deterministic_pipeline.fake_pipeline:run_pipeline"
            )
            self.assertEqual(params["primary_output"], "note_txt")

        self.assertEqual(loaded_ids, ["baseline"])
        self.assertEqual(prompt_styles, ["brief"])
        self.assertEqual(asr_models, ["parakeet"])


if __name__ == "__main__":
    unittest.main()

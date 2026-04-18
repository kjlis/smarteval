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


if __name__ == "__main__":
    unittest.main()

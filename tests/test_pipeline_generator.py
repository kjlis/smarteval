from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from smarteval.core.models import Artifact, Case
from smarteval.plugins.generators.pipeline import PipelineGenerator, PipelineManifestError


def inline_manifest_runner(*, case: Case, params: dict[str, object]) -> dict[str, object]:
    run_dir = Path(case.input["run_dir"])
    note_path = run_dir / "note.txt"
    transcript_path = run_dir / "transcript.txt"
    note_path.write_text("SOAP note content", encoding="utf-8")
    transcript_path.write_text("transcript content", encoding="utf-8")
    return {
        "pipeline_name": "demo-pipeline",
        "source_run_dir": str(run_dir),
        "outputs": {
            "note_txt": {"kind": "text", "uri": "note.txt"},
            "transcript_txt": {"kind": "text", "uri": "transcript.txt"},
        },
    }


def manifest_file_runner(*, case: Case, params: dict[str, object]) -> str:
    run_dir = Path(case.input["run_dir"])
    note_json_path = run_dir / "note.json"
    note_json_path.write_text(json.dumps({"summary": "structured note"}), encoding="utf-8")
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "pipeline_name": "demo-pipeline",
                "source_run_dir": str(run_dir),
                "outputs": {
                    "note_json": {"kind": "json", "uri": "note.json"},
                    "transcript_txt": {"kind": "text", "uri": "missing-transcript.txt"},
                },
            }
        ),
        encoding="utf-8",
    )
    return str(manifest_path)


class PipelineGeneratorTests(unittest.TestCase):
    def test_pipeline_generator_selects_primary_output_and_keeps_attachments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = Case(
                id="visit-1",
                input={"run_dir": tmp_dir},
                added_at="2026-04-17",
            )
            generator = PipelineGenerator(callable=inline_manifest_runner)

            artifact = generator.generate(case, {"primary_output": "note_txt"})

            self.assertIsInstance(artifact, Artifact)
            self.assertEqual(artifact.kind, "text")
            self.assertEqual(artifact.payload, "SOAP note content")
            self.assertIn("transcript_txt", artifact.attachments)
            self.assertEqual(Path(artifact.source_run_dir), Path(tmp_dir))
            self.assertIsNone(artifact.source_manifest)

    def test_pipeline_generator_reads_manifest_file_relative_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = Case(
                id="visit-2",
                input={"run_dir": tmp_dir},
                added_at="2026-04-17",
            )
            generator = PipelineGenerator(callable=manifest_file_runner)

            artifact = generator.generate(case, {"primary_output": "note_json"})

            self.assertEqual(artifact.kind, "json")
            self.assertEqual(artifact.payload, {"summary": "structured note"})
            self.assertTrue(artifact.source_manifest.endswith("manifest.json"))

    def test_pipeline_generator_fails_when_primary_output_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            case = Case(
                id="visit-3",
                input={"run_dir": tmp_dir},
                added_at="2026-04-17",
            )
            generator = PipelineGenerator(callable=inline_manifest_runner)

            with self.assertRaises(PipelineManifestError):
                generator.generate(case, {"primary_output": "note_json"})


if __name__ == "__main__":
    unittest.main()

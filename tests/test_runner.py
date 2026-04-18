from __future__ import annotations

import json
import tempfile
import textwrap
import unittest
from pathlib import Path

from typer.testing import CliRunner

from smarteval.cli.main import app
from smarteval.core.config import load_config
from smarteval.core.runner import estimate_bakeoff, run_bakeoff


def pipeline_case_runner(*, case, params):
    run_dir = Path(case.input["run_dir"])
    run_dir.mkdir(parents=True, exist_ok=True)
    note_path = run_dir / "note.txt"
    transcript_path = run_dir / "transcript.txt"
    note_path.write_text("note body", encoding="utf-8")
    transcript_path.write_text("transcript body", encoding="utf-8")
    return {
        "source_run_dir": str(run_dir),
        "outputs": {
            "note_txt": {"kind": "text", "uri": "note.txt"},
            "transcript_txt": {"kind": "text", "uri": "transcript.txt"},
        },
    }


class RunnerTests(unittest.TestCase):
    def test_run_bakeoff_writes_reports_and_detects_delta(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text(
                (
                    '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"added_at":"2026-04-17"}\n'
                    '{"id":"q2","input":{"question":"3+3"},"expected":{"answer":"6"},"added_at":"2026-04-17"}\n'
                ),
                encoding="utf-8",
            )
            config_path = tmp_path / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden_path}
                    baseline: baseline
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:always_wrong
                      - id: winner
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
                    pipeline:
                      - id: exact
                        kind: exact_match
                    execution:
                      runs_per_variant: 1
                    reporting:
                      formats: [markdown, json]
                      ci_summary: true
                    """
                ),
                encoding="utf-8",
            )

            config = load_config(config_path)
            estimate = estimate_bakeoff(config)
            self.assertEqual(estimate["total_runs"], 4)

            run_dir, summary = run_bakeoff(config, output_root=tmp_path / "runs")
            self.assertTrue((run_dir / "summary.md").exists())
            self.assertTrue((run_dir / "summary.json").exists())
            self.assertTrue((run_dir / "ci.json").exists())
            self.assertEqual(summary.baseline, "baseline")

            summary_payload = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
            variants = {item["variant_id"]: item for item in summary_payload["variants"]}
            self.assertEqual(variants["baseline"]["mean_score"], 0.0)
            self.assertEqual(variants["winner"]["mean_score"], 1.0)
            self.assertGreater(variants["winner"]["delta_vs_baseline"], 0.0)

    def test_cli_estimate_and_run(self) -> None:
        runner = CliRunner()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text(
                '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp_path / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden_path}
                    baseline: baseline
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
                    pipeline:
                      - id: exact
                        kind: exact_match
                    """
                ),
                encoding="utf-8",
            )

            estimate_result = runner.invoke(app, ["estimate", "--path", str(config_path)])
            self.assertEqual(estimate_result.exit_code, 0)
            self.assertIn('"total_runs": 1', estimate_result.stdout)

            run_result = runner.invoke(
                app,
                ["run", "--path", str(config_path), "--output-root", str(tmp_path / "runs")],
            )
            self.assertEqual(run_result.exit_code, 0)
            self.assertIn("Preflight:", run_result.stdout)
            self.assertIn("Completed bakeoff", run_result.stdout)

    def test_cli_run_supports_filters_and_dry_run(self) -> None:
        runner = CliRunner()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text(
                (
                    '{"id":"math-1","input":{"question":"2+2"},"expected":{"answer":"4"},"tags":["math"],"added_at":"2026-04-17"}\n'
                    '{"id":"science-1","input":{"question":"3+3"},"expected":{"answer":"6"},"tags":["science"],"added_at":"2026-04-17"}\n'
                ),
                encoding="utf-8",
            )
            config_path = tmp_path / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden_path}
                    baseline: baseline
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
                      - id: other
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:always_wrong
                    pipeline:
                      - id: exact
                        kind: exact_match
                    """
                ),
                encoding="utf-8",
            )

            dry_run = runner.invoke(
                app,
                [
                    "run",
                    "--path",
                    str(config_path),
                    "--variant",
                    "baseline",
                    "--tag",
                    "math",
                    "--case-pattern",
                    "math-*",
                    "--dry-run",
                ],
            )
            self.assertEqual(dry_run.exit_code, 0)
            self.assertIn('"total_runs": 1', dry_run.stdout)

    def test_run_bakeoff_writes_incremental_summaries_and_copied_attachments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source_run_dir = tmp_path / "pipeline-run"
            golden_path = tmp_path / "golden.jsonl"
            golden_path.write_text(
                json.dumps(
                    {
                        "id": "case-1",
                        "input": {"run_dir": str(source_run_dir)},
                        "expected": {"answer": "note body"},
                        "added_at": "2026-04-17",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            config_path = tmp_path / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden_path}
                    baseline: baseline
                    artifact_selection:
                      primary_output: note_txt
                      copy_attachments: true
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: pipeline
                        params:
                          callable: tests.test_runner:pipeline_case_runner
                    pipeline:
                      - id: exact
                        kind: exact_match
                    reporting:
                      formats: [json]
                      incremental_summary_every_n_runs: 1
                    """
                ),
                encoding="utf-8",
            )

            config = load_config(config_path)
            run_dir, _ = run_bakeoff(config, output_root=tmp_path / "runs")

            self.assertTrue((run_dir / "summary.json").exists())
            copied = list((run_dir / "attachments").glob("*transcript_txt.txt"))
            self.assertEqual(len(copied), 1)


if __name__ == "__main__":
    unittest.main()

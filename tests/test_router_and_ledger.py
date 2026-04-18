from __future__ import annotations

import json
import tempfile
import textwrap
import unittest
from pathlib import Path

from typer.testing import CliRunner

from smarteval.cli.main import app
from smarteval.core.config import load_config
from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.runner import load_run_records, read_summary, resume_bakeoff, run_bakeoff


class RouterAndLedgerTests(unittest.TestCase):
    def test_router_variant_dispatches_by_tag_and_marks_route(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                (
                    '{"id":"c1","input":{"question":"a"},"expected":{"answer":"4"},"tags":["math"],"added_at":"2026-04-17"}\n'
                    '{"id":"c2","input":{"question":"b"},"expected":{"answer":"6"},"tags":["science"],"added_at":"2026-04-17"}\n'
                ),
                encoding="utf-8",
            )
            router_path = tmp / "router.yaml"
            router_path.write_text(
                textwrap.dedent(
                    """
                    default_variant_id: baseline
                    max_specialists: 3
                    rules:
                      - when:
                          tag: math
                        variant_id: specialist
                    """
                ),
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: baseline
                    router: {router_path}
                    gates:
                      specialist_lift_threshold: 0.0
                      specialist_min_n: 1
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
                      - id: specialist
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:always_wrong
                      - id: routed
                        generator:
                          kind: router
                    pipeline:
                      - id: exact
                        kind: exact_match
                    reporting:
                      formats: [json]
                    """
                ),
                encoding="utf-8",
            )

            config = load_config(config_path)
            run_dir, summary = run_bakeoff(config, output_root=tmp / "runs")
            records = load_run_records(run_dir)
            routed_math = next(record for record in records.values() if record.variant_id == "routed" and record.case_id == "c1")
            routed_science = next(record for record in records.values() if record.variant_id == "routed" and record.case_id == "c2")

            self.assertEqual(routed_math.artifact.metadata["routed_variant_id"], "specialist")
            self.assertEqual(routed_science.artifact.metadata["routed_variant_id"], "baseline")
            self.assertTrue((run_dir / "lock.json").exists())
            self.assertGreaterEqual(len(summary.per_slice), 1)

    def test_log_verdict_resume_and_diff_commands_work(self) -> None:
        runner = CliRunner()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"tags":["math"],"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
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
                    reporting:
                      formats: [json]
                      ci_summary: true
                    """
                ),
                encoding="utf-8",
            )

            config = load_config(config_path)
            run_dir, summary = run_bakeoff(config, output_root=tmp / "runs")

            verdict_result = runner.invoke(
                app,
                [
                    "verdict",
                    "--path",
                    str(config_path),
                    summary.bakeoff_id + "/q1/baseline/1",
                ],
                input="win\nbroad_default\nworks\n",
            )
            self.assertEqual(verdict_result.exit_code, 0)

            log_result = runner.invoke(app, ["log", "--path", str(config_path)])
            self.assertEqual(log_result.exit_code, 0)
            self.assertIn('"status": "win"', log_result.stdout)

            diff_result = runner.invoke(app, ["diff", str(run_dir), str(run_dir)])
            self.assertEqual(diff_result.exit_code, 0)
            self.assertIn('"delta": 0.0', diff_result.stdout)

            verdicts_path = tmp / "ledger" / "verdicts.jsonl"
            self.assertTrue(verdicts_path.exists())
            verdict_payload = verdicts_path.read_text(encoding="utf-8")
            self.assertIn('"diff":{"callable":"tests.helpers:echo_expected"}', verdict_payload)
            note_files = list((tmp / "ledger" / "notes").glob("*.md"))
            self.assertEqual(len(note_files), 1)

            by_case_files = list((run_dir / "by_case").glob("*.jsonl"))
            by_case_files[0].unlink()
            resumed_dir, resumed_summary = resume_bakeoff(config, run_dir=run_dir)
            self.assertEqual(resumed_dir, run_dir)
            self.assertTrue((run_dir / "by_case").exists())
            self.assertEqual(read_summary(run_dir).bakeoff_id, resumed_summary.bakeoff_id)

    def test_doctor_and_rebaseline_commands(self) -> None:
        runner = CliRunner()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
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

            doctor_result = runner.invoke(app, ["doctor", "--path", str(config_path)])
            self.assertEqual(doctor_result.exit_code, 0)
            self.assertIn('"config_loadable": true', doctor_result.stdout)

            config = load_config(config_path)
            run_dir, _ = run_bakeoff(config, output_root=tmp / "runs")

            rebaseline_result = runner.invoke(
                app,
                [
                    "rebaseline",
                    str(run_dir),
                    "--path",
                    str(config_path),
                    "--from",
                    "gpt-4.1",
                    "--to",
                    "gpt-5.2",
                    "--approve",
                ],
            )
            self.assertEqual(rebaseline_result.exit_code, 0)
            self.assertTrue((tmp / ".smarteval" / "lock.json").exists())
            self.assertTrue((tmp / ".smarteval" / "rebaseline-reports").exists())
            self.assertIn('"per_slice_comparison"', rebaseline_result.stdout)

    def test_try_new_model_rejects_evaluator_target(self) -> None:
        runner = CliRunner()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: baseline
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: baseline
                        generator:
                          kind: openai
                          model: gpt-4.1-mini
                    pipeline:
                      - id: exact
                        kind: exact_match
                    """
                ),
                encoding="utf-8",
            )

            result = runner.invoke(
                app,
                ["try-new-model", "gpt-5.2", "--path", str(config_path), "--target", "evaluator"],
            )
            self.assertNotEqual(result.exit_code, 0)
            self.assertIn("use rebaseline", result.stderr)

    def test_run_refuses_when_project_lock_evaluator_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"2+2"},"expected":{"answer":"4"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: baseline
                    gates:
                      evaluator_fingerprint_change: refuse
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
            config = load_config(config_path)
            lock_dir = tmp / ".smarteval"
            lock_dir.mkdir(parents=True, exist_ok=True)
            (lock_dir / "lock.json").write_text(
                json.dumps({"evaluator_fingerprint": compute_evaluator_fingerprint(config.evaluator) + "-old"}, indent=2),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "use `smarteval rebaseline`"):
                run_bakeoff(config, output_root=tmp / "runs")


if __name__ == "__main__":
    unittest.main()

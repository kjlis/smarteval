from __future__ import annotations

import json
import tempfile
import textwrap
import unittest
from pathlib import Path

from smarteval.core.models import VariantProposal
from smarteval.optimization.loop import run_optimization_loop


class OptimizationLoopTests(unittest.TestCase):
    def test_optimization_loop_runs_rounds_and_persists_variants(self) -> None:
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
                      model: gpt-5.4
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:always_wrong
                    pipeline:
                      - id: exact
                        kind: exact_match
                    reporting:
                      formats: [json]
                    """
                ),
                encoding="utf-8",
            )

            calls: list[dict] = []

            def fake_propose(**kwargs):
                calls.append(kwargs)
                if len(calls) == 1:
                    return [
                        VariantProposal(
                            parent_variant_id="baseline",
                            rationale="fix callable",
                            diff={"params.callable": "tests.helpers:echo_expected"},
                            expected_slice="math",
                        )
                    ]
                if len(calls) == 2:
                    return [
                        VariantProposal(
                            parent_variant_id=kwargs["context"]["current_best_variant"]["id"],
                            rationale="keep winning variant and annotate it",
                            diff={"description": "second round improvement"},
                            expected_slice="math",
                        )
                    ]
                return []

            trace = run_optimization_loop(
                path=config_path,
                rounds=3,
                proposals_per_round=1,
                output_root=tmp / "runs",
                propose_fn=fake_propose,
            )

            self.assertEqual(trace["rounds_completed"], 2)
            self.assertEqual(trace["proposer_backend"], "codex_local")
            self.assertEqual(len(calls), 3)
            self.assertTrue(Path(trace["trace_path"]).exists())
            self.assertEqual(trace["rounds"][0]["status"], "completed")
            self.assertEqual(trace["rounds"][1]["status"], "completed")
            self.assertEqual(trace["rounds"][2]["status"], "stopped_no_proposals")
            self.assertTrue(trace["rounds"][0]["queued_variant_ids"][0].startswith("baseline-proposal-"))
            self.assertTrue(trace["rounds"][1]["queued_variant_ids"][0].startswith("baseline-proposal-"))

            variants_log = (tmp / "ledger" / "variants.jsonl").read_text(encoding="utf-8")
            self.assertIn("fix callable", variants_log)
            self.assertIn("second round improvement", variants_log)

            trace_payload = json.loads(Path(trace["trace_path"]).read_text(encoding="utf-8"))
            self.assertEqual(trace_payload["rounds_completed"], 2)
            self.assertEqual(trace_payload["final_run_dir"], trace["final_run_dir"])


if __name__ == "__main__":
    unittest.main()

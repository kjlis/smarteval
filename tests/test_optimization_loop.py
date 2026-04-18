from __future__ import annotations

import json
import tempfile
import textwrap
import unittest
from pathlib import Path

from smarteval.core.models import VariantProposal
from smarteval.optimization.loop import run_optimization_loop
from smarteval.proposer.dedup import ProposalReview


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
                    proposal = VariantProposal(
                        parent_variant_id="baseline",
                        rationale="fix callable",
                        diff={"params.callable": "tests.helpers:echo_expected"},
                        expected_slice="math",
                    )
                    rejected = VariantProposal(
                        parent_variant_id="baseline",
                        rationale="repeat a dead idea",
                        diff={"params.prompt_text": "same old path"},
                        expected_slice="math",
                    )
                    return [
                        proposal
                    ], [
                        ProposalReview(proposal=proposal, status="accepted"),
                        ProposalReview(
                            proposal=rejected,
                            status="rejected_exact_duplicate",
                            duplicate_of_variant_id="dead-baseline",
                        ),
                    ]
                if len(calls) == 2:
                    proposal = VariantProposal(
                        parent_variant_id=kwargs["context"]["current_best_variant"]["id"],
                        rationale="keep winning variant and annotate it",
                        diff={"description": "second round improvement"},
                        expected_slice="math",
                    )
                    return [proposal], [ProposalReview(proposal=proposal, status="accepted")]
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
            self.assertEqual(trace["rounds"][0]["rejected_proposal_count"], 1)
            self.assertEqual(trace["rounds"][0]["rejected_proposals"][0]["duplicate_of_variant_id"], "dead-baseline")

            variants_log = (tmp / "ledger" / "variants.jsonl").read_text(encoding="utf-8")
            self.assertIn("fix callable", variants_log)
            self.assertIn("second round improvement", variants_log)
            proposals_log = (tmp / "ledger" / "proposals.jsonl").read_text(encoding="utf-8")
            self.assertIn('"status":"accepted"', proposals_log)
            self.assertIn('"status":"rejected_exact_duplicate"', proposals_log)

            trace_payload = json.loads(Path(trace["trace_path"]).read_text(encoding="utf-8"))
            self.assertEqual(trace_payload["rounds_completed"], 2)
            self.assertEqual(trace_payload["final_run_dir"], trace["final_run_dir"])

            summary_payload = json.loads((Path(trace["final_run_dir"]) / "summary.json").read_text(encoding="utf-8"))
            improvement_traces = {item["variant_id"]: item for item in summary_payload["improvement_traces"]}
            best_variant_id = trace["rounds"][1]["best_variant_id"]
            best_trace = improvement_traces[best_variant_id]
            self.assertEqual(len(best_trace["steps"]), 2)
            self.assertEqual(best_trace["steps"][0]["rationale"], "fix callable")
            self.assertEqual(best_trace["steps"][1]["rationale"], "keep winning variant and annotate it")
            self.assertEqual(best_trace["steps"][0]["changes"][0]["field_path"], "params.callable")
            self.assertEqual(best_trace["steps"][1]["changes"][0]["field_path"], "description")


if __name__ == "__main__":
    unittest.main()

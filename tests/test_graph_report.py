from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path

from smarteval.reporting.graph_report import _collect_graph_data, build_report


REPO_ROOT = Path(__file__).resolve().parents[1]
ASR_EXAMPLE = REPO_ROOT / "examples" / "asr_manifest"


class GraphReportTests(unittest.TestCase):
    def test_collects_graph_data_from_asr_example(self) -> None:
        data = _collect_graph_data(ASR_EXAMPLE)
        self.assertEqual(data["meta"]["variant_count"], 16)
        self.assertGreaterEqual(data["meta"]["bakeoff_count"], 6)
        self.assertEqual(data["meta"]["baseline_id"], "baseline")

        baseline = next(v for v in data["variants"] if v["id"] == "baseline")
        self.assertTrue(baseline["is_baseline"])
        self.assertIsNone(baseline["parent_id"])

        # All accepted edges should have 'from' pointing to a real variant
        variant_ids = {v["id"] for v in data["variants"]}
        accepted_edges = [e for e in data["edges"] if e["kind"] == "accepted"]
        self.assertEqual(len(accepted_edges), 15)
        for e in accepted_edges:
            self.assertIn(e["from"], variant_ids)
            self.assertIn(e["to"], variant_ids)

    def test_winner_detection(self) -> None:
        data = _collect_graph_data(ASR_EXAMPLE)
        winner = data["winner_path"]
        self.assertIsNotNone(winner)
        self.assertTrue(winner["target_variant_id"].endswith("-proposal-20260418133421-1"))
        self.assertAlmostEqual(winner["total_delta_vs_baseline"], 0.4, places=2)
        self.assertEqual(winner["node_ids"][0], "baseline")
        self.assertEqual(winner["node_ids"][-1], winner["target_variant_id"])
        self.assertEqual(len(winner["edge_pairs"]), len(winner["node_ids"]) - 1)

    def test_diff_changes_skip_equal_before_after(self) -> None:
        data = _collect_graph_data(ASR_EXAMPLE)
        for v in data["variants"]:
            for c in v["diff_changes"]:
                self.assertNotEqual(c["before"], c["after"], f"equal before/after for {v['id']} {c}")
                self.assertNotEqual(c["field_path"], "description")

    def test_winner_variant_has_case_artifact(self) -> None:
        data = _collect_graph_data(ASR_EXAMPLE)
        winner_id = data["winner_path"]["target_variant_id"]
        winner = next(v for v in data["variants"] if v["id"] == winner_id)
        self.assertTrue(len(winner["case_runs"]) >= 1)
        cr = winner["case_runs"][0]
        self.assertEqual(cr["case_id"], "visit-1")
        self.assertIsNotNone(cr["artifact_payload"])
        self.assertEqual(cr["status"], "success")
        self.assertTrue(len(cr["scores"]) >= 1)
        self.assertTrue(len(cr["scores"][0]["rubric_dimensions"]) >= 3)

    def test_build_report_writes_html_with_embedded_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "report.html"
            result = build_report(ASR_EXAMPLE, out)
            self.assertTrue(result.exists())
            html = result.read_text(encoding="utf-8")
            self.assertIn('id="graph-data"', html)
            self.assertIn("cytoscape", html)

            match = re.search(
                r'<script id="graph-data" type="application/json">(.*?)</script>',
                html,
                re.DOTALL,
            )
            self.assertIsNotNone(match)
            payload = json.loads(match.group(1))
            self.assertEqual(payload["meta"]["variant_count"], 16)
            self.assertIsNotNone(payload["winner_path"])

    def test_handles_empty_smarteval_gracefully(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            (project_root / ".smarteval" / "ledger").mkdir(parents=True)
            (project_root / ".smarteval" / "runs").mkdir()
            data = _collect_graph_data(project_root)
            self.assertEqual(data["meta"]["variant_count"], 0)
            self.assertEqual(data["meta"]["bakeoff_count"], 0)
            self.assertIsNone(data["winner_path"])
            out = project_root / "report.html"
            build_report(project_root, out)
            self.assertTrue(out.exists())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path

from smarteval.core.config import load_config
from smarteval.core.model_swap import select_variants_for_model_try
from smarteval.core.models import Artifact, Case
from smarteval.core.pipeline import execute_scoring_pipeline
from smarteval.core.runner import run_bakeoff
from smarteval.proposer.dedup import filter_duplicate_proposals
from smarteval.proposer.prompter import propose_variants


def short_text(*, case: Case, params: dict) -> Artifact:
    return Artifact(kind="text", payload="no")


def long_text(*, case: Case, params: dict) -> Artifact:
    return Artifact(kind="text", payload="this is long enough")


class FakeUsage:
    def model_dump(self) -> dict[str, int]:
        return {}


class FakeResponse:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.id = "resp"
        self.usage = FakeUsage()


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text

    def create(self, **kwargs):
        return FakeResponse(self.output_text)


class FakeClient:
    def __init__(self, output_text: str) -> None:
        self.responses = FakeResponses(output_text)


class FrameworkSemanticsTests(unittest.TestCase):
    def test_gated_by_skips_dependent_scorer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"x"},"expected":{"answer":"ok"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: base
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: base
                        generator:
                          kind: script
                        params:
                          callable: tests.test_framework_semantics:short_text
                    pipeline:
                      - id: min-len
                        kind: length_bounds
                        min_length: 5
                        gates_downstream: false
                      - id: exact
                        kind: exact_match
                        gated_by: [min-len]
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            case = Case(id="q1", input={"question": "x"}, expected={"answer": "ok"}, added_at="2026-04-17")
            artifact = short_text(case=case, params={})
            contract, scores = execute_scoring_pipeline(case, artifact, config.pipeline, evaluator=config.evaluator)

            self.assertFalse(scores[-1].passed)
            self.assertTrue(scores[-1].raw["skipped"])

    def test_paired_delta_ci_is_present_in_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                (
                    '{"id":"q1","input":{"question":"x"},"expected":{"answer":"ok"},"added_at":"2026-04-17"}\n'
                    '{"id":"q2","input":{"question":"y"},"expected":{"answer":"ok"},"added_at":"2026-04-17"}\n'
                ),
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: bad
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: bad
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:always_wrong
                      - id: good
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
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
            _, summary = run_bakeoff(config, output_root=tmp / "runs")
            good = next(item for item in summary.variants if item.variant_id == "good")
            self.assertIsNotNone(good.delta_ci_low)
            self.assertIsNotNone(good.delta_ci_high)

    def test_proposer_dedup_filters_rejected_variant(self) -> None:
        client = FakeClient(
            '{"proposals":[{"parent_variant_id":"baseline","rationale":"same","diff":{"params.prompt_text":"same"},"expected_slice":"math"}]}'
        )
        proposals = propose_variants(
            model="gpt-4.1",
            context={"x": 1},
            backend="openai",
            client=client,
            verdicts=[
                {
                    "variant_id": "baseline",
                    "status": "loss",
                    "promotion_level": "dead",
                    "diff": {"params.prompt_text": "same"},
                }
            ],
        )
        self.assertEqual(proposals, [])

        filtered = filter_duplicate_proposals(
            [],
            [{"variant_id": "baseline", "status": "loss", "promotion_level": "dead", "diff": {"x": 1}}],
        )
        self.assertEqual(filtered, [])

    def test_proposer_dedup_filters_semantically_similar_rejection(self) -> None:
        proposals = propose_variants(
            model="gpt-4.1",
            context={"x": 1},
            backend="openai",
            client=FakeClient(
                '{"proposals":[{"parent_variant_id":"baseline","rationale":"rewrite","diff":{"params.prompt_text":"answer carefully and concisely"},"expected_slice":"math"}]}'
            ),
            verdicts=[
                {
                    "variant_id": "baseline",
                    "parent_variant_id": "baseline",
                    "status": "loss",
                    "promotion_level": "dead",
                    "diff": {"params.prompt_text": "answer concisely and carefully"},
                }
            ],
        )
        self.assertEqual(proposals, [])

    def test_embedding_similarity_scorer_returns_normalized_score(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"x"},"expected":{"answer":"hello world"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: base
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: base
                        generator:
                          kind: script
                        params:
                          callable: tests.test_framework_semantics:long_text
                    pipeline:
                      - id: semantic
                        kind: embedding_sim
                        threshold: 0.1
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            case = Case(id="q1", input={"question": "x"}, expected={"answer": "hello world"}, added_at="2026-04-17")
            artifact = Artifact(kind="text", payload="hello there world")
            _, scores = execute_scoring_pipeline(case, artifact, config.pipeline, evaluator=config.evaluator)

            self.assertEqual(scores[0].name, "semantic")
            self.assertIsNotNone(scores[0].value)
            assert scores[0].value is not None
            self.assertGreaterEqual(scores[0].value, 0.0)
            self.assertLessEqual(scores[0].value, 1.0)
            self.assertTrue(scores[0].passed)

    def test_try_new_model_selector_uses_ledger_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            golden = tmp / "golden.jsonl"
            golden.write_text(
                '{"id":"q1","input":{"question":"x"},"expected":{"answer":"ok"},"added_at":"2026-04-17"}\n',
                encoding="utf-8",
            )
            config_path = tmp / "smarteval.yaml"
            config_path.write_text(
                textwrap.dedent(
                    f"""
                    version: 1
                    golden_set: {golden}
                    baseline: broad
                    evaluator:
                      model: gpt-4.1
                    variants:
                      - id: broad
                        generator:
                          kind: openai
                          model: gpt-4.1
                      - id: specialist
                        generator:
                          kind: codex
                          model: gpt-5.2-codex
                    pipeline:
                      - id: exact
                        kind: exact_match
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            ledger = {
                "verdicts": [
                    {"variant_id": "broad", "promotion_level": "dead"},
                    {"variant_id": "specialist", "promotion_level": "specialist"},
                ]
            }
            self.assertEqual(select_variants_for_model_try(config, ledger, "broad"), {"specialist"})
            self.assertEqual(select_variants_for_model_try(config, ledger, "specialists"), {"specialist"})


if __name__ == "__main__":
    unittest.main()

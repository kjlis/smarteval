from __future__ import annotations

import json
import tempfile
import textwrap
import unittest
from pathlib import Path

from typer.testing import CliRunner

import smarteval.cli.main as cli_main
from smarteval.core.config import load_config
from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.rescore import rescore_bakeoff
from smarteval.core.runner import load_run_records, read_summary, run_bakeoff
from smarteval.core.models import VariantProposal
from smarteval.proposer.context import build_proposer_context
from smarteval.proposer.prompter import propose_variants


class FakeUsage:
    def model_dump(self) -> dict[str, int]:
        return {"input_tokens": 5, "output_tokens": 5}


class FakeResponse:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.usage = FakeUsage()
        self.id = "resp-propose"


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.output_text)


class FakeClient:
    def __init__(self, output_text: str) -> None:
        self.responses = FakeResponses(output_text)


class FakeCodexThread:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.prompts: list[str] = []

    def run(self, prompt: str):
        self.prompts.append(prompt)
        return FakeCodexResult(self.response_text)


class FakeCodexResult:
    def __init__(self, final_response: str) -> None:
        self.final_response = final_response


class FakeCodexClient:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.models: list[str] = []
        self.thread = FakeCodexThread(response_text)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def thread_start(self, *, model: str):
        self.models.append(model)
        return self.thread


class RescoreAndProposerTests(unittest.TestCase):
    def test_rescore_reuses_artifacts_and_updates_summary(self) -> None:
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
                    reporting:
                      formats: [json]
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            run_dir, _ = run_bakeoff(config, output_root=tmp / "runs")
            summary = rescore_bakeoff(config, run_dir=run_dir)

            self.assertEqual(summary.variants[0].mean_score, 1.0)
            self.assertEqual(read_summary(run_dir).variants[0].mean_score, 1.0)

    def test_rescore_updates_evaluator_fingerprint_when_policy_changes(self) -> None:
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
                    reporting:
                      formats: [json]
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            run_dir, initial = run_bakeoff(config, output_root=tmp / "runs")

            config.evaluator.model = "gpt-5.2"
            updated = rescore_bakeoff(config, run_dir=run_dir)

            self.assertNotEqual(updated.evaluator_fingerprint, initial.evaluator_fingerprint)
            self.assertEqual(updated.evaluator_fingerprint, compute_evaluator_fingerprint(config.evaluator))

    def test_evaluator_fingerprint_includes_llm_rubric_backend(self) -> None:
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
                      model: gpt-5.4
                    variants:
                      - id: baseline
                        generator:
                          kind: script
                        params:
                          callable: tests.helpers:echo_expected
                    pipeline:
                      - id: rubric
                        kind: llm_rubric
                        rubric: tests/fixtures/rubrics/demo.yaml
                    reporting:
                      formats: [json]
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)

            codex_fp = compute_evaluator_fingerprint(config.evaluator, backend="codex_local")
            openai_fp = compute_evaluator_fingerprint(config.evaluator, backend="openai")

            self.assertNotEqual(codex_fp, openai_fp)

    def test_proposer_returns_structured_variant_proposals(self) -> None:
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
            config = load_config(config_path)
            run_dir, summary = run_bakeoff(config, output_root=tmp / "runs")
            context = build_proposer_context(config, summary, list(load_run_records(run_dir).values()))

            client = FakeClient(
                json.dumps(
                    {
                        "proposals": [
                            {
                                "parent_variant_id": "baseline",
                                "rationale": "tighten prompt",
                                "diff": {"params.prompt_text": "answer carefully"},
                                "expected_slice": "math",
                            }
                        ]
                    }
                )
            )
            proposals = propose_variants(
                model="gpt-4.1",
                context=context,
                n=1,
                backend="openai",
                client=client,
            )

            self.assertEqual(len(proposals), 1)
            self.assertEqual(proposals[0].parent_variant_id, "baseline")
            self.assertEqual(client.responses.calls[0]["model"], "gpt-4.1")

    def test_proposer_defaults_to_local_codex_backend(self) -> None:
        client = FakeCodexClient(
            json.dumps(
                {
                    "proposals": [
                        {
                            "parent_variant_id": "baseline",
                            "rationale": "tighten pipeline config",
                            "diff": {"params.pipeline_config": {"asr": {"model": "whisper"}}},
                            "expected_slice": "asr-demo",
                        }
                    ]
                }
            )
        )

        proposals = propose_variants(model="gpt-5.4", context={"x": 1}, n=1, client=client)

        self.assertEqual(len(proposals), 1)
        self.assertEqual(client.models, ["gpt-5.4"])
        self.assertIn("Need up to 1 proposals", client.thread.prompts[0])

    def test_proposer_supports_explicit_openai_backend(self) -> None:
        client = FakeClient(
            json.dumps(
                {
                    "proposals": [
                        {
                            "parent_variant_id": "baseline",
                            "rationale": "keep openai fallback",
                            "diff": {"params.prompt_text": "answer carefully"},
                            "expected_slice": "math",
                        }
                    ]
                }
            )
        )

        proposals = propose_variants(
            model="gpt-4.1",
            context={"x": 1},
            n=1,
            backend="openai",
            client=client,
        )

        self.assertEqual(len(proposals), 1)
        self.assertEqual(client.responses.calls[0]["model"], "gpt-4.1")

    def test_cli_propose_persists_and_auto_queues_materialized_variants(self) -> None:
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
                    autonomy:
                      propose: auto_queue
                      run: auto_queue
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
                    """
                ),
                encoding="utf-8",
            )
            config = load_config(config_path)
            run_dir, _ = run_bakeoff(config, output_root=tmp / "runs")

            original_propose = cli_main.propose_variants
            cli_main.propose_variants = lambda **kwargs: [
                VariantProposal(
                    parent_variant_id="baseline",
                    rationale="try a different prompt",
                    diff={"params.prompt_text": "answer carefully"},
                    expected_slice="math",
                )
            ]
            try:
                result = runner.invoke(
                    cli_main.app,
                    ["propose", "--path", str(config_path), str(run_dir), "--n", "1"],
                )
            finally:
                cli_main.propose_variants = original_propose

            self.assertEqual(result.exit_code, 0)
            payload = json.loads(result.stdout)
            self.assertIn("queued_variant_ids", payload)
            self.assertIn("queued_run_dir", payload)
            variants_log = (tmp / "ledger" / "variants.jsonl").read_text(encoding="utf-8")
            self.assertIn("baseline-proposal-", variants_log)


if __name__ == "__main__":
    unittest.main()

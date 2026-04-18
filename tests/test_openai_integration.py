from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from smarteval.core.models import Artifact, Case, ContractResult, Rubric, RubricDimension
from smarteval.core.rate_limit import clear_buckets
from smarteval.plugins.generators.openai import CodexGenerator, OpenAIGenerator
from smarteval.plugins.scorers.llm_rubric import LLMRubricScorer


class FakeUsage:
    def model_dump(self) -> dict[str, int]:
        return {"input_tokens": 10, "output_tokens": 5}


class FakeResponse:
    def __init__(self, output_text: str, response_id: str = "resp_123") -> None:
        self.output_text = output_text
        self.id = response_id
        self.usage = FakeUsage()


class FakeResponsesAPI:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.response_text)


class FakeClient:
    def __init__(self, response_text: str) -> None:
        self.responses = FakeResponsesAPI(response_text)


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
        self.usage = FakeUsage()


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


class OpenAIIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_buckets()

    def test_openai_generator_renders_prompt_and_returns_text_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            prompt_path = Path(tmp_dir) / "prompt.txt"
            prompt_path.write_text("Q: {input_json}", encoding="utf-8")

            client = FakeClient("final answer")
            generator = OpenAIGenerator(model="gpt-4.1", _client=client)
            case = Case(id="q1", input={"question": "What is 2+2?"}, added_at="2026-04-17")

            artifact = generator.generate(case, {"prompt": str(prompt_path)})

            self.assertEqual(artifact.kind, "text")
            self.assertEqual(artifact.payload, "final answer")
            self.assertEqual(client.responses.calls[0]["model"], "gpt-4.1")
            self.assertIn("What is 2+2?", client.responses.calls[0]["input"])

    def test_codex_generator_defaults_to_codex_model(self) -> None:
        client = FakeClient("patch output")
        generator = CodexGenerator(_client=client)
        case = Case(id="q2", input={"question": "Fix code"}, added_at="2026-04-17")

        with tempfile.TemporaryDirectory() as tmp_dir:
            prompt_path = Path(tmp_dir) / "prompt.txt"
            prompt_path.write_text("Task: {input_json}", encoding="utf-8")
            generator.generate(case, {"prompt": str(prompt_path), "reasoning_effort": "high"})

        self.assertEqual(client.responses.calls[0]["model"], "gpt-5.2-codex")
        self.assertEqual(client.responses.calls[0]["reasoning"], {"effort": "high"})

    def test_llm_rubric_scorer_normalizes_dimension_scores(self) -> None:
        client = FakeClient(
            '{"dimensions":[{"id":"accuracy","score":4,"justification":"ok","failure_mode":null}],"overall_justification":"fine"}'
        )
        rubric = Rubric(
            id="demo",
            version="1.0.0",
            dimensions=[RubricDimension(id="accuracy", weight=1.0, prompt="Score accuracy")],
            pass_threshold=3.5,
        )
        scorer = LLMRubricScorer(model="gpt-4.1", rubric=rubric, backend="openai", _client=client)
        case = Case(id="q3", input={"question": "Summarize"}, added_at="2026-04-17")
        artifact = Artifact(kind="text", payload="candidate answer")

        score = scorer.score(case, artifact, ContractResult(passed=True), [])

        self.assertAlmostEqual(score.value or 0.0, 0.8)
        self.assertTrue(score.passed)
        self.assertEqual(score.raw["usage"]["input_tokens"], 10)

    def test_llm_rubric_scorer_accepts_pre_normalized_dimension_scores(self) -> None:
        client = FakeClient(
            '{"dimensions":[{"id":"accuracy","score":0.8,"justification":"ok","failure_mode":null}],"overall_justification":"fine"}'
        )
        rubric = Rubric(
            id="demo",
            version="1.0.0",
            dimensions=[RubricDimension(id="accuracy", weight=1.0, prompt="Score accuracy")],
            pass_threshold=3.5,
        )
        scorer = LLMRubricScorer(model="gpt-4.1", rubric=rubric, backend="openai", _client=client)
        case = Case(id="q3b", input={"question": "Summarize"}, added_at="2026-04-17")
        artifact = Artifact(kind="text", payload="candidate answer")

        score = scorer.score(case, artifact, ContractResult(passed=True), [])

        self.assertAlmostEqual(score.value or 0.0, 0.8)
        self.assertTrue(score.passed)

    def test_llm_rubric_scorer_defaults_to_local_codex_backend(self) -> None:
        client = FakeCodexClient(
            '{"dimensions":[{"id":"accuracy","score":5,"justification":"strong","failure_mode":null}],"overall_justification":"good"}'
        )
        rubric = Rubric(
            id="demo",
            version="1.0.0",
            dimensions=[RubricDimension(id="accuracy", weight=1.0, prompt="Score accuracy")],
            pass_threshold=3.5,
        )
        scorer = LLMRubricScorer(
            model="gpt-5.4",
            rubric=rubric,
            _client=client,
        )
        case = Case(id="q5", input={"question": "Summarize"}, added_at="2026-04-17")
        artifact = Artifact(kind="text", payload="candidate answer")

        score = scorer.score(case, artifact, ContractResult(passed=True), [])

        self.assertAlmostEqual(score.value or 0.0, 1.0)
        self.assertTrue(score.passed)
        self.assertEqual(client.models, ["gpt-5.4"])
        self.assertIn("candidate answer", client.thread.prompts[0])

    def test_openai_generator_honors_rate_limit_bucket(self) -> None:
        import smarteval.plugins.generators.openai as openai_mod

        class StubBucket:
            def __init__(self) -> None:
                self.calls = 0

            def acquire(self) -> None:
                self.calls += 1

        bucket = StubBucket()
        original = openai_mod.get_bucket
        openai_mod.get_bucket = lambda name, rpm: bucket
        try:
            client = FakeClient("final answer")
            generator = OpenAIGenerator(model="gpt-4.1", _client=client)
            case = Case(id="q4", input={"question": "What is 2+2?"}, added_at="2026-04-17")
            with tempfile.TemporaryDirectory() as tmp_dir:
                prompt_path = Path(tmp_dir) / "prompt.txt"
                prompt_path.write_text("Q: {input_json}", encoding="utf-8")
                generator.generate(case, {"prompt": str(prompt_path), "rpm": 30})
            self.assertEqual(bucket.calls, 1)
        finally:
            openai_mod.get_bucket = original


if __name__ == "__main__":
    unittest.main()

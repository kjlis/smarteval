from __future__ import annotations

from smarteval.core.models import Artifact, Case, ContractResult, PipelineStage, Score
from smarteval.plugins.registry import create_contract, create_scorer, is_contract_stage, is_scorer_stage


def execute_scoring_pipeline(
    case: Case,
    artifact: Artifact,
    stages: list[PipelineStage],
    *,
    evaluator,
) -> tuple[ContractResult, list[Score]]:
    contract_result = ContractResult(passed=True)
    scores: list[Score] = []
    gated = False
    stage_outcomes: dict[str, bool] = {}

    for stage in stages:
        if gated or _is_blocked_by_dependencies(stage, stage_outcomes):
            scores.append(
                Score(
                    name=stage.id,
                    value=None,
                    passed=False,
                    raw={"skipped": True, "reason": "gated by previous stage"},
                )
            )
            stage_outcomes[stage.id] = False
            continue

        if is_contract_stage(stage.kind):
            validator = create_contract(stage)
            contract_result = validator.validate(case, artifact)
            stage_outcomes[stage.id] = contract_result.passed
            if not contract_result.passed and stage.gates_downstream:
                gated = True
            continue

        if is_scorer_stage(stage.kind):
            scorer = create_scorer(stage, evaluator=evaluator)
            score = scorer.score(case, artifact, contract_result, scores)
            score.name = stage.id
            scores.append(score)
            stage_outcomes[stage.id] = score.passed
            if not score.passed and stage.gates_downstream:
                gated = True
            continue

        raise KeyError(f"unknown pipeline stage kind {stage.kind!r}")

    return contract_result, scores


def _is_blocked_by_dependencies(stage: PipelineStage, stage_outcomes: dict[str, bool]) -> bool:
    return any(stage_outcomes.get(dep) is False for dep in stage.gated_by)

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Case(BaseModel):
    id: str
    input: dict[str, Any]
    expected: dict[str, Any] | None = None
    tags: list[str] = Field(default_factory=list)
    difficulty: Literal["easy", "medium", "hard"] | None = None
    notes: str | None = None
    added_at: date
    added_by: str | None = None


class GeneratorRef(BaseModel):
    model_config = ConfigDict(extra="allow")

    kind: str


class Variant(BaseModel):
    id: str
    description: str | None = None
    generator: GeneratorRef
    params: dict[str, Any] = Field(default_factory=dict)
    parent_id: str | None = None


class ArtifactSelection(BaseModel):
    primary_output: str = "response_text"
    copy_attachments: bool = False


class ArtifactRef(BaseModel):
    kind: Literal["text", "json", "path"]
    uri: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class Artifact(BaseModel):
    kind: Literal["text", "json", "path"]
    payload: Any
    attachments: dict[str, ArtifactRef] = Field(default_factory=dict)
    source_manifest: str | None = None
    source_run_dir: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def to_prompt_text(self) -> str:
        if self.kind == "text":
            return str(self.payload)
        if self.kind == "json":
            import json

            return json.dumps(self.payload, indent=2, sort_keys=True)
        return str(self.payload)


class PipelineManifest(BaseModel):
    outputs: dict[str, ArtifactRef]
    pipeline_name: str | None = None
    status: str = "success"
    source_run_dir: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_outputs_for_success(self) -> "PipelineManifest":
        if self.status == "success" and not self.outputs:
            raise ValueError("successful pipeline manifests must define at least one output")
        return self


class ContractResult(BaseModel):
    passed: bool
    violations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class Score(BaseModel):
    name: str = "score"
    value: float | None = None
    raw: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    passed: bool


class RubricDimension(BaseModel):
    id: str
    weight: float
    prompt: str
    evidence_required: bool = True
    failure_mode_enum: list[str] = Field(default_factory=list)


class Rubric(BaseModel):
    id: str
    version: str
    scale: Literal[5] = 5
    dimensions: list[RubricDimension]
    pass_threshold: float = 3.5
    weight_sum_check: Literal["strict", "warn"] = "strict"

    @model_validator(mode="after")
    def validate_weight_sum(self) -> "Rubric":
        total = sum(d.weight for d in self.dimensions)
        if self.weight_sum_check == "strict" and abs(total - 1.0) > 1e-6:
            raise ValueError(f"rubric weights must sum to 1.0; got {total}")
        return self


class PipelineStage(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    kind: str
    gates_downstream: bool = False
    gated_by: list[str] = Field(default_factory=list)


class EvaluatorPolicy(BaseModel):
    model: str
    version_hint: str | None = None
    temperature: float = 0.0
    top_p: float = 0.1
    rpm: int | None = None
    n_averaging: int = 1
    canonical: bool = True
    fingerprint: str | None = None
    reasoning_effort: str | None = None
    max_output_tokens: int | None = None


class ExecutionPolicy(BaseModel):
    runs_per_variant: int = 1
    concurrency: int = 1
    evaluator_rpm: int | None = None
    budget_usd: float | None = None
    max_duration_min: int | None = None
    on_budget_exceeded: Literal["abort", "warn"] = "warn"


class ReportingPolicy(BaseModel):
    formats: list[Literal["markdown", "json"]] = Field(default_factory=lambda: ["markdown", "json"])
    slice_by: list[str] = Field(default_factory=lambda: ["tags", "difficulty"])
    diff_against_baseline: bool = True
    ci_summary: bool = False
    incremental_summary_every_n_runs: int = 5


class Gates(BaseModel):
    min_runs_per_variant: int = 1
    min_runs_warning: int = 1
    slice_regression_threshold: float = 0.10
    slice_regression_action: Literal["fail", "warn"] = "warn"
    require_baseline: bool = True
    evaluator_fingerprint_change: Literal["refuse", "warn"] = "warn"
    cross_evaluator_verification: bool = False
    specialist_lift_threshold: float = 0.30
    specialist_min_n: int = 10


class RouterValidation(BaseModel):
    run_id: str
    lift_vs_default: float
    scope: str
    n_runs: int


class RouterRule(BaseModel):
    when: dict[str, Any]
    variant_id: str
    validation: RouterValidation | None = None


class RouterSpec(BaseModel):
    default_variant_id: str
    rules: list[RouterRule] = Field(default_factory=list)
    max_specialists: int = 10

    @model_validator(mode="after")
    def validate_complexity(self) -> "RouterSpec":
        if len(self.rules) > self.max_specialists:
            raise ValueError(
                f"router defines {len(self.rules)} rules but max_specialists={self.max_specialists}"
            )
        return self


class Verdict(BaseModel):
    run_id: str
    status: Literal["win", "loss", "specialist", "noisy", "pending"]
    promotion_level: Literal["dead", "specialist", "broad_default", "pending"]
    rationale: str
    killed_by: Literal["human", "canonical_eval", "slice_regression", "noise"] | None = None
    follow_up_variant_id: str | None = None
    author: str
    timestamp: datetime


class LedgerVariantRecord(BaseModel):
    id: str
    parent_id: str | None = None
    author: str = "framework"
    hypothesis: str | None = None
    rationale: str | None = None
    diff: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class LedgerVerdictRecord(BaseModel):
    variant_id: str
    parent_variant_id: str | None = None
    run_id: str
    status: str
    promotion_level: str
    rationale: str
    diff: dict[str, Any] = Field(default_factory=dict)
    killed_by: str | None = None
    follow_up_variant_id: str | None = None
    author: str
    timestamp: datetime


class VariantProposal(BaseModel):
    parent_variant_id: str
    rationale: str
    diff: dict[str, Any]
    expected_slice: str | None = None


class RunRecord(BaseModel):
    run_id: str
    case_id: str
    case_input: dict[str, Any] = Field(default_factory=dict)
    case_expected: dict[str, Any] | None = None
    variant_id: str
    generator: str
    iteration: int
    artifact: Artifact
    contract: ContractResult
    scores: list[Score]
    cost_usd: float = 0.0
    duration_ms: int = 0
    timestamp: datetime
    evaluator_fingerprint: str
    golden_hash: str
    status: Literal["success", "failed"] = "success"
    error: str | None = None
    tags: list[str] = Field(default_factory=list)
    difficulty: Literal["easy", "medium", "hard"] | None = None


class SliceSummary(BaseModel):
    slice_name: str
    variant_id: str
    run_count: int
    mean_score: float | None = None
    delta_vs_baseline: float | None = None


class SpecialistCandidate(BaseModel):
    variant_id: str
    slice_name: str
    lift_vs_baseline: float
    n_runs: int


class VariantSummary(BaseModel):
    variant_id: str
    run_count: int
    pass_rate: float
    pass_rate_ci_low: float | None = None
    pass_rate_ci_high: float | None = None
    mean_score: float | None = None
    mean_score_ci_low: float | None = None
    mean_score_ci_high: float | None = None
    mean_cost_usd: float = 0.0
    mean_duration_ms: float = 0.0
    delta_vs_baseline: float | None = None
    delta_ci_low: float | None = None
    delta_ci_high: float | None = None


class VariantChange(BaseModel):
    field_path: str
    before: Any | None = None
    after: Any | None = None
    summary: str


class ImprovementStep(BaseModel):
    variant_id: str
    parent_variant_id: str
    rationale: str | None = None
    hypothesis: str | None = None
    judge_justification: str | None = None
    delta_vs_parent: float | None = None
    delta_vs_baseline: float | None = None
    changes: list[VariantChange] = Field(default_factory=list)


class ImprovementTrace(BaseModel):
    variant_id: str
    baseline_variant_id: str
    total_delta_vs_baseline: float | None = None
    steps: list[ImprovementStep] = Field(default_factory=list)


class BakeoffSummary(BaseModel):
    bakeoff_id: str
    baseline: str
    evaluator_fingerprint: str
    golden_hash: str
    generated_at: datetime
    variants: list[VariantSummary]
    per_slice: list[SliceSummary] = Field(default_factory=list)
    specialists: list[SpecialistCandidate] = Field(default_factory=list)
    improvement_traces: list[ImprovementTrace] = Field(default_factory=list)
    regressions: list[str] = Field(default_factory=list)
    total_cost_usd: float = 0.0
    total_duration_ms: int = 0
    schema_version: int = 2


class BakeoffConfig(BaseModel):
    version: int = 1
    golden_set: Path
    baseline: str
    artifact_selection: ArtifactSelection = Field(default_factory=ArtifactSelection)
    evaluator: EvaluatorPolicy
    variants: list[Variant]
    pipeline: list[PipelineStage] = Field(default_factory=list)
    execution: ExecutionPolicy = Field(default_factory=ExecutionPolicy)
    reporting: ReportingPolicy = Field(default_factory=ReportingPolicy)
    gates: Gates = Field(default_factory=Gates)
    router: str | None = None
    autonomy: dict[str, Any] = Field(default_factory=dict)
    project_root: Path | None = None
    config_path: Path | None = None

    @model_validator(mode="after")
    def validate_baseline_exists(self) -> "BakeoffConfig":
        variant_ids = {variant.id for variant in self.variants}
        if self.baseline not in variant_ids:
            raise ValueError(f"baseline {self.baseline!r} must reference a declared variant")
        return self

    def get_variant(self, variant_id: str) -> Variant:
        for variant in self.variants:
            if variant.id == variant_id:
                return variant
        raise KeyError(f"unknown variant {variant_id!r}")

    def resolved_variant_params(self, variant_id: str) -> dict[str, Any]:
        variant = self.get_variant(variant_id)
        params = dict(variant.params)
        params.setdefault("primary_output", self.artifact_selection.primary_output)
        params.setdefault("copy_attachments", self.artifact_selection.copy_attachments)
        return params

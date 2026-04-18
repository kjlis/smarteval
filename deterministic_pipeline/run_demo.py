from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml

from smarteval.core.models import Case

from deterministic_pipeline.fake_pipeline import run_pipeline


DEFAULT_ENCOUNTER: dict[str, Any] = {
    "patient_name": "Jordan Lee",
    "speaker_roles": ["clinician", "patient"],
    "complaint": "cough and fever",
    "duration_days": 3,
    "medications": ["ibuprofen"],
    "allergies": ["penicillin"],
    "plan": ["hydration", "rest", "return if symptoms worsen"],
}


def run_from_config(
    *,
    config_path: Path,
    output_root: Path,
    encounter_path: Path | None = None,
    case_id: str = "visit-1",
) -> Path:
    raw_config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    pipeline_config = raw_config.get("pipeline_config", raw_config)
    encounter = dict(DEFAULT_ENCOUNTER)
    if encounter_path is not None:
        encounter.update(_load_mapping(encounter_path))

    case = Case(
        id=case_id,
        input={"output_root": str(output_root), "encounter": encounter},
        added_at="2026-04-18",
    )
    manifest_path = run_pipeline(case=case, params={"pipeline_config": pipeline_config})
    return Path(manifest_path)


def _load_mapping(path: Path) -> dict[str, Any]:
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the deterministic ASR demo pipeline directly.")
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to a pipeline-only YAML config file.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("manual_pipeline_runs"),
        help="Directory where the pipeline artifacts should be written.",
    )
    parser.add_argument(
        "--encounter",
        type=Path,
        default=None,
        help="Optional JSON or YAML file overriding the sample encounter.",
    )
    parser.add_argument(
        "--case-id",
        default="visit-1",
        help="Case identifier used in the output directory layout.",
    )
    args = parser.parse_args()

    manifest_path = run_from_config(
        config_path=args.config,
        output_root=args.output_root,
        encounter_path=args.encounter,
        case_id=args.case_id,
    )
    print(manifest_path)


if __name__ == "__main__":
    main()

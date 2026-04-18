from __future__ import annotations

import json
from pathlib import Path

from smarteval.core.models import Case


def run_pipeline(*, case: Case, params: dict) -> str:
    output_root = Path(case.input["output_root"])
    run_dir = output_root / case.id
    run_dir.mkdir(parents=True, exist_ok=True)

    transcript_path = run_dir / "transcript.txt"
    note_path = run_dir / "note.txt"
    manifest_path = run_dir / "manifest.json"

    transcript_path.write_text("Speaker: patient reports mild cough.", encoding="utf-8")
    note_path.write_text("Assessment: mild cough. Plan: hydration and monitoring.", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            {
                "pipeline_name": "example-asr",
                "source_run_dir": str(run_dir),
                "outputs": {
                    "note_txt": {"kind": "text", "uri": "note.txt"},
                    "transcript_txt": {"kind": "text", "uri": "transcript.txt"},
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return str(manifest_path)

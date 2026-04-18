"""Build a self-contained interactive HTML report of the optimization DAG.

See docs/graph.md for the data shape.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from smarteval.core.paths import ledger_root, optimization_runs_root, default_run_root


_TEMPLATE_PATH = Path(__file__).parent / "template.html"
_DATA_PLACEHOLDER = "{{DATA_JSON}}"


# ---------- file IO ----------


def _load_jsonl_records(path: Path) -> list[dict[str, Any]]:
    """Load a JSONL file. Returns [] if file missing."""
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def _load_json_or_jsonl(path: Path) -> list[dict[str, Any]]:
    """by_case files are pretty-printed JSON objects, not true JSONL. Try
    whole-file parse first; fall back to line-by-line for robustness."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        return [parsed] if isinstance(parsed, dict) else list(parsed)
    except json.JSONDecodeError:
        return _load_jsonl_records(path)


# ---------- diff helpers ----------


def _flatten_diff(value: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten a nested dict into dotted keys. Mixed flat/nested diffs occur in
    the ledger (some use `params.pipeline_config.asr.model`, others nest under
    `params`). Normalize both to dotted keys."""
    out: dict[str, Any] = {}
    if isinstance(value, dict):
        for k, v in value.items():
            new_prefix = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                out.update(_flatten_diff(v, new_prefix))
            else:
                out[new_prefix] = v
    else:
        out[prefix] = value
    return out


def _derive_changes(
    variant_diff: dict[str, Any], parent_diff: dict[str, Any]
) -> list[dict[str, Any]]:
    """Diff a variant's flat diff against its parent's flat diff. Skip the
    `description` field and meta fields like `callable`."""
    flat_self = _flatten_diff(variant_diff)
    flat_parent = _flatten_diff(parent_diff)
    changes: list[dict[str, Any]] = []
    for field_path, after in flat_self.items():
        if field_path == "description":
            continue
        before = flat_parent.get(field_path)
        if before != after:
            changes.append({"field_path": field_path, "before": before, "after": after})
    return changes


# ---------- run summary reading ----------


@dataclass
class _BakeoffData:
    bakeoff_id: str
    dir_name: str
    generated_at: str | None
    summary: dict[str, Any]
    by_case_files: dict[str, list[Path]] = field(default_factory=dict)  # keyed by variant_id


_VARIANT_FILENAME_RE = re.compile(
    r"case-(?P<case>[^_]+(?:_[^_]+)*?)__variant-(?P<variant>.+?)__iter-\d+\.jsonl$"
)


def _scan_by_case(run_dir: Path) -> dict[str, list[Path]]:
    """Group by_case files by variant_id."""
    by_case_dir = run_dir / "by_case"
    if not by_case_dir.exists():
        return {}
    out: dict[str, list[Path]] = {}
    for path in sorted(by_case_dir.iterdir()):
        if not path.is_file():
            continue
        m = _VARIANT_FILENAME_RE.search(path.name)
        if not m:
            continue
        out.setdefault(m.group("variant"), []).append(path)
    return out


def _load_bakeoffs(runs_dir: Path) -> list[_BakeoffData]:
    if not runs_dir.exists():
        return []
    results: list[_BakeoffData] = []
    for run_dir in sorted(runs_dir.iterdir()):
        summary_path = run_dir / "summary.json"
        if not summary_path.exists():
            continue
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        results.append(
            _BakeoffData(
                bakeoff_id=summary.get("bakeoff_id", run_dir.name),
                dir_name=run_dir.name,
                generated_at=summary.get("generated_at"),
                summary=summary,
                by_case_files=_scan_by_case(run_dir),
            )
        )
    return results


# ---------- aggregation ----------


def _latest_bakeoff(bakeoffs: list[_BakeoffData]) -> _BakeoffData | None:
    if not bakeoffs:
        return None
    with_ts = [b for b in bakeoffs if b.generated_at]
    if with_ts:
        return max(with_ts, key=lambda b: b.generated_at or "")
    return bakeoffs[-1]


def _build_scores_by_variant(
    bakeoffs: list[_BakeoffData],
) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for b in bakeoffs:
        for entry in b.summary.get("variants", []):
            vid = entry.get("variant_id")
            if not vid:
                continue
            out.setdefault(vid, []).append(
                {
                    "bakeoff_id": b.bakeoff_id,
                    "run_dir": b.dir_name,
                    "mean_score": entry.get("mean_score"),
                    "delta_vs_baseline": entry.get("delta_vs_baseline"),
                    "pass_rate": entry.get("pass_rate"),
                    "run_count": entry.get("run_count"),
                    "failed_run_count": entry.get("failed_run_count"),
                    "sample_errors": entry.get("sample_errors", []),
                    "generated_at": b.generated_at,
                }
            )
    return out


def _hydrate_case_runs(
    variant_id: str, bakeoffs: list[_BakeoffData]
) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    for b in bakeoffs:
        for path in b.by_case_files.get(variant_id, []):
            records = _load_json_or_jsonl(path)
            for rec in records:
                runs.append(
                    {
                        "bakeoff_id": b.bakeoff_id,
                        "case_id": rec.get("case_id"),
                        "status": rec.get("status"),
                        "error": rec.get("error"),
                        "iteration": rec.get("iteration"),
                        "duration_ms": rec.get("duration_ms"),
                        "artifact_kind": (rec.get("artifact") or {}).get("kind"),
                        "artifact_payload": (rec.get("artifact") or {}).get("payload"),
                        "case_expected": (rec.get("case_expected") or {}),
                        "scores": _normalize_scores(rec.get("scores") or []),
                    }
                )
    return runs


def _normalize_scores(scores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in scores:
        raw = s.get("raw") or {}
        rubric = raw.get("rubric") or {}
        dims = []
        for d in rubric.get("dimensions") or []:
            dims.append(
                {
                    "id": d.get("id"),
                    "score": d.get("score"),
                    "justification": d.get("justification"),
                    "failure_mode": d.get("failure_mode"),
                }
            )
        out.append(
            {
                "name": s.get("name"),
                "value": s.get("value"),
                "passed": s.get("passed"),
                "overall_justification": rubric.get("overall_justification"),
                "rubric_dimensions": dims,
            }
        )
    return out


# ---------- winner / trace detection ----------


def _find_traces(bakeoffs: list[_BakeoffData]) -> list[dict[str, Any]]:
    latest = _latest_bakeoff(bakeoffs)
    if not latest:
        return []
    return latest.summary.get("improvement_traces") or []


def _winner_from_traces(
    traces: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Return (winner_trace, all_traces_normalized)."""
    if not traces:
        return None, []
    normalized = []
    for trace in traces:
        node_ids = [trace.get("baseline_variant_id")] + [
            step.get("variant_id") for step in trace.get("steps", [])
        ]
        node_ids = [n for n in node_ids if n]
        edge_pairs = list(zip(node_ids, node_ids[1:]))
        normalized.append(
            {
                "target_variant_id": trace.get("variant_id"),
                "baseline_variant_id": trace.get("baseline_variant_id"),
                "total_delta_vs_baseline": trace.get("total_delta_vs_baseline"),
                "node_ids": node_ids,
                "edge_pairs": edge_pairs,
                "steps": trace.get("steps", []),
            }
        )
    winner = max(
        normalized,
        key=lambda t: (t.get("total_delta_vs_baseline") or float("-inf")),
    )
    return winner, normalized


def _winner_from_scores(
    variants_by_id: dict[str, dict[str, Any]],
    scores_by_variant: dict[str, list[dict[str, Any]]],
    baseline_id: str,
) -> dict[str, Any] | None:
    """Fallback when no improvement_traces exist: pick variant with max mean
    score across all bakeoffs, walk up parent chain."""
    best_id = None
    best_score = float("-inf")
    for vid, rows in scores_by_variant.items():
        for row in rows:
            ms = row.get("mean_score")
            if ms is None:
                continue
            if ms > best_score:
                best_score = ms
                best_id = vid
    if best_id is None or best_id == baseline_id:
        return None
    # walk up
    chain: list[str] = []
    cur = best_id
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        chain.append(cur)
        parent = (variants_by_id.get(cur) or {}).get("parent_id")
        if parent is None:
            break
        cur = parent
    chain.reverse()
    if chain and chain[0] != baseline_id:
        chain.insert(0, baseline_id)
    edge_pairs = list(zip(chain, chain[1:]))
    return {
        "target_variant_id": best_id,
        "baseline_variant_id": baseline_id,
        "total_delta_vs_baseline": None,
        "node_ids": chain,
        "edge_pairs": edge_pairs,
        "steps": [],
    }


# ---------- optimization rounds ----------


def _load_optimization_rounds(opt_dir: Path) -> list[dict[str, Any]]:
    if not opt_dir.exists():
        return []
    out: list[dict[str, Any]] = []
    for path in sorted(opt_dir.iterdir()):
        if path.suffix != ".json":
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "trace_path": path.name,
                "rounds_requested": payload.get("rounds_requested"),
                "rounds_completed": payload.get("rounds_completed"),
                "initial_best_variant_id": payload.get("initial_best_variant_id"),
                "final_run_dir": Path(payload.get("final_run_dir") or "").name,
                "rounds": [
                    {
                        "round": r.get("round"),
                        "source_run_dir": Path(r.get("source_run_dir") or "").name,
                        "queued_variant_ids": r.get("queued_variant_ids") or [],
                        "best_variant_id": r.get("best_variant_id"),
                        "best_mean_score": r.get("best_mean_score"),
                        "rejected_proposal_count": r.get("rejected_proposal_count") or 0,
                    }
                    for r in payload.get("rounds") or []
                ],
            }
        )
    return out


def _variant_round_map(rounds_payloads: list[dict[str, Any]]) -> dict[str, int]:
    """Map variant_id -> round number (first time it appears as queued)."""
    out: dict[str, int] = {}
    for payload in rounds_payloads:
        for r in payload.get("rounds") or []:
            for vid in r.get("queued_variant_ids") or []:
                if vid not in out:
                    out[vid] = r.get("round") or 0
    return out


# ---------- main aggregator ----------


def _collect_graph_data(project_root: Path) -> dict[str, Any]:
    ledger = ledger_root(project_root)
    variants_records = _load_jsonl_records(ledger / "variants.jsonl")
    proposals_records = _load_jsonl_records(ledger / "proposals.jsonl")

    bakeoffs = _load_bakeoffs(default_run_root(project_root))
    scores_by_variant = _build_scores_by_variant(bakeoffs)
    optimization_payloads = _load_optimization_rounds(
        optimization_runs_root(project_root)
    )
    round_by_variant = _variant_round_map(optimization_payloads)

    latest = _latest_bakeoff(bakeoffs)
    baseline_id = (latest.summary.get("baseline") if latest else None) or "baseline"

    variants_by_id: dict[str, dict[str, Any]] = {v["id"]: v for v in variants_records}

    # attach step-level diff info from the latest improvement traces
    trace_steps_by_variant: dict[str, dict[str, Any]] = {}
    for trace in (latest.summary.get("improvement_traces") if latest else []) or []:
        for step in trace.get("steps", []):
            vid = step.get("variant_id")
            if vid and vid not in trace_steps_by_variant:
                trace_steps_by_variant[vid] = step

    # Build variant nodes
    variant_nodes: list[dict[str, Any]] = []
    for v in variants_records:
        vid = v["id"]
        parent_id = v.get("parent_id")
        parent_diff = (variants_by_id.get(parent_id) or {}).get("diff") or {}
        step = trace_steps_by_variant.get(vid)
        if step and step.get("changes"):
            diff_changes = [
                {
                    "field_path": c.get("field_path"),
                    "before": c.get("before"),
                    "after": c.get("after"),
                    "summary": c.get("summary"),
                }
                for c in step["changes"]
                if c.get("field_path") != "description"
                and c.get("before") != c.get("after")
            ]
        else:
            diff_changes = _derive_changes(v.get("diff") or {}, parent_diff)

        score_rows = scores_by_variant.get(vid, [])
        score_values = [r["mean_score"] for r in score_rows if r.get("mean_score") is not None]
        delta_values = [
            r["delta_vs_baseline"]
            for r in score_rows
            if r.get("delta_vs_baseline") is not None
        ]
        variant_nodes.append(
            {
                "id": vid,
                "parent_id": parent_id,
                "author": v.get("author"),
                "hypothesis": v.get("hypothesis"),
                "rationale": v.get("rationale"),
                "created_at": v.get("created_at"),
                "diff": v.get("diff") or {},
                "description": (v.get("diff") or {}).get("description"),
                "diff_changes": diff_changes,
                "scores_by_bakeoff": score_rows,
                "best_mean_score": max(score_values) if score_values else None,
                "best_delta_vs_baseline": max(delta_values) if delta_values else None,
                "round": round_by_variant.get(vid),
                "case_runs": _hydrate_case_runs(vid, bakeoffs),
                "is_baseline": vid == baseline_id,
            }
        )

    # Proposals — separate rejected ones into their own node list
    rejected_proposals: list[dict[str, Any]] = []
    proposal_edges: list[dict[str, Any]] = []
    for p in proposals_records:
        status = p.get("status") or ""
        parent = p.get("parent_variant_id")
        mat = p.get("materialized_variant_id")
        if status.startswith("rejected") and not mat:
            rejected_proposals.append(
                {
                    "id": p.get("proposal_id"),
                    "parent_variant_id": parent,
                    "status": status,
                    "rationale": p.get("rationale"),
                    "diff": p.get("diff") or {},
                    "duplicate_of_variant_id": p.get("duplicate_of_variant_id"),
                    "similarity": p.get("similarity"),
                    "created_at": p.get("created_at"),
                }
            )
            if parent and p.get("proposal_id"):
                proposal_edges.append(
                    {
                        "kind": "rejected",
                        "from": parent,
                        "to": p["proposal_id"],
                        "status": status,
                        "rationale": p.get("rationale"),
                    }
                )
        elif mat and parent:
            proposal_edges.append(
                {
                    "kind": "accepted",
                    "from": parent,
                    "to": mat,
                    "rationale": p.get("rationale"),
                    "hypothesis": p.get("expected_slice"),
                }
            )

    # Ensure every variant has a parent edge even if no proposal record matched
    existing_accepted = {(e["from"], e["to"]) for e in proposal_edges if e["kind"] == "accepted"}
    for v in variants_records:
        parent = v.get("parent_id")
        if parent and (parent, v["id"]) not in existing_accepted:
            proposal_edges.append(
                {
                    "kind": "accepted",
                    "from": parent,
                    "to": v["id"],
                    "rationale": v.get("rationale"),
                    "hypothesis": v.get("hypothesis"),
                }
            )
            existing_accepted.add((parent, v["id"]))

    traces = _find_traces(bakeoffs)
    winner_path, all_traces = _winner_from_traces(traces)
    if winner_path is None:
        winner_path = _winner_from_scores(variants_by_id, scores_by_variant, baseline_id)

    return {
        "meta": {
            "project_root": str(project_root.resolve()),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bakeoff_count": len(bakeoffs),
            "variant_count": len(variant_nodes),
            "rejected_proposal_count": len(rejected_proposals),
            "baseline_id": baseline_id,
        },
        "variants": variant_nodes,
        "rejected_proposals": rejected_proposals,
        "edges": proposal_edges,
        "winner_path": winner_path,
        "all_traces": all_traces,
        "bakeoffs": [
            {
                "bakeoff_id": b.bakeoff_id,
                "dir_name": b.dir_name,
                "generated_at": b.generated_at,
                "variant_ids": [v.get("variant_id") for v in b.summary.get("variants", [])],
            }
            for b in bakeoffs
        ],
        "optimization": optimization_payloads,
    }


# ---------- HTML rendering ----------


def _render_html(data: dict[str, Any]) -> str:
    template = _TEMPLATE_PATH.read_text(encoding="utf-8")
    if _DATA_PLACEHOLDER not in template:
        raise RuntimeError(
            f"Template {_TEMPLATE_PATH} is missing {_DATA_PLACEHOLDER} placeholder"
        )
    # Protect against the rare `</script>` substring inside JSON text.
    encoded = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return template.replace(_DATA_PLACEHOLDER, encoded)


def build_report(project_root: str | Path, output: str | Path) -> Path:
    """Build an HTML report from `<project_root>/.smarteval/` and write it to
    `output`. Returns the absolute output path."""
    project_root = Path(project_root)
    output = Path(output)
    data = _collect_graph_data(project_root)
    html = _render_html(data)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    return output.resolve()

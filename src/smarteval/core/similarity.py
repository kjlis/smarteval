from __future__ import annotations

import json
import math
import re
from collections import Counter
from typing import Any


def similarity_from_text(left: str, right: str) -> float:
    left_vector = _hashed_embedding(_normalize_text(left))
    right_vector = _hashed_embedding(_normalize_text(right))
    return _cosine_similarity(left_vector, right_vector)


def similarity_from_diff(left: dict[str, Any], right: dict[str, Any]) -> float:
    return similarity_from_text(_serialize_diff(left), _serialize_diff(right))


def expected_text(expected: Any) -> str:
    if isinstance(expected, dict) and "answer" in expected:
        return str(expected["answer"])
    return json.dumps(expected, sort_keys=True) if isinstance(expected, (dict, list)) else str(expected)


def _serialize_diff(diff: dict[str, Any]) -> str:
    parts = []
    for key, value in sorted(diff.items()):
        rendered = json.dumps(value, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
        parts.append(f"{key}={rendered}")
    return "\n".join(parts)


def _normalize_text(value: str) -> str:
    lowered = value.lower()
    collapsed = re.sub(r"\s+", " ", lowered).strip()
    return collapsed


def _hashed_embedding(value: str, *, dims: int = 128) -> list[float]:
    tokens = re.findall(r"[a-z0-9_./:-]+", value)
    features = tokens + [value[index : index + 3] for index in range(max(0, len(value) - 2))]
    counts = Counter(features)
    vector = [0.0] * dims
    for feature, weight in counts.items():
        vector[hash(feature) % dims] += float(weight)
    return vector


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=False))
    return max(0.0, min(1.0, dot / (left_norm * right_norm)))

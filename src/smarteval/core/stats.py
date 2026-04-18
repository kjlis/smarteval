from __future__ import annotations

import random
from statistics import mean


def mean_or_none(values: list[float]) -> float | None:
    return mean(values) if values else None


def bootstrap_ci(
    values: list[float],
    *,
    samples: int = 500,
    confidence: float = 0.95,
    seed: int = 17,
) -> tuple[float | None, float | None]:
    if not values:
        return None, None
    if len(values) == 1:
        return values[0], values[0]

    rng = random.Random(seed)
    boot = []
    for _ in range(samples):
        resample = [rng.choice(values) for _ in range(len(values))]
        boot.append(mean(resample))
    boot.sort()
    lower_index = max(0, int(((1.0 - confidence) / 2.0) * len(boot)))
    upper_index = min(len(boot) - 1, int((1.0 - (1.0 - confidence) / 2.0) * len(boot)) - 1)
    return boot[lower_index], boot[upper_index]


def paired_bootstrap_delta_ci(
    baseline: list[float],
    candidate: list[float],
    *,
    samples: int = 500,
    confidence: float = 0.95,
    seed: int = 17,
) -> tuple[float | None, float | None]:
    if not baseline or not candidate or len(baseline) != len(candidate):
        return None, None
    if len(baseline) == 1:
        delta = candidate[0] - baseline[0]
        return delta, delta

    rng = random.Random(seed)
    indices = list(range(len(baseline)))
    boot = []
    for _ in range(samples):
        chosen = [rng.choice(indices) for _ in indices]
        deltas = [candidate[index] - baseline[index] for index in chosen]
        boot.append(mean(deltas))
    boot.sort()
    lower_index = max(0, int(((1.0 - confidence) / 2.0) * len(boot)))
    upper_index = min(len(boot) - 1, int((1.0 - (1.0 - confidence) / 2.0) * len(boot)) - 1)
    return boot[lower_index], boot[upper_index]

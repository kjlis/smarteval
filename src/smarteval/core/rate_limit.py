from __future__ import annotations

import time
from collections.abc import Callable


class TokenBucket:
    def __init__(
        self,
        rpm: int,
        *,
        time_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
    ) -> None:
        if rpm <= 0:
            raise ValueError("rpm must be positive")
        self.rpm = rpm
        self.interval = 60.0 / rpm
        self._time = time_fn or time.monotonic
        self._sleep = sleep_fn or time.sleep
        self._next_allowed_at = 0.0

    def acquire(self) -> None:
        now = self._time()
        if self._next_allowed_at <= 0.0:
            self._next_allowed_at = now + self.interval
            return
        if now < self._next_allowed_at:
            self._sleep(self._next_allowed_at - now)
            now = self._time()
        self._next_allowed_at = max(now, self._next_allowed_at) + self.interval


_BUCKETS: dict[str, TokenBucket] = {}


def get_bucket(name: str, rpm: int) -> TokenBucket:
    bucket = _BUCKETS.get(name)
    if bucket is None or bucket.rpm != rpm:
        bucket = TokenBucket(rpm)
        _BUCKETS[name] = bucket
    return bucket


def clear_buckets() -> None:
    _BUCKETS.clear()

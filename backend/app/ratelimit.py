"""Simple in-process sliding-window rate limiter.

Good enough for a single API instance; for several instances put the limit in front
(reverse proxy) or replace the backend with Redis (same interface).
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.errors import ApiError


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: int) -> None:
        """Record a hit; raise ``ApiError(429)`` if ``limit`` was already reached in the window."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                retry_after = max(1, int(q[0] + window_seconds - now))
                raise ApiError(
                    429,
                    "rate_limited",
                    "Too many requests, please try again later.",
                    {"retry_after_seconds": retry_after},
                    headers={"Retry-After": str(retry_after)},
                )
            q.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()

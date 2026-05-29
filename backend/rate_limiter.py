import os
import time
import threading
from typing import Tuple

try:
    import redis
except Exception:
    redis = None


class RateLimiter:
    """Simple rate limiter that uses Redis when REDIS_URL is provided,
    otherwise falls back to an in-memory timestamp map.
    """

    def __init__(self):
        self.redis_url = os.environ.get('REDIS_URL')
        self._lock = threading.Lock()
        self._map = {}
        self._redis = None
        if self.redis_url and redis:
            try:
                self._redis = redis.from_url(self.redis_url, socket_timeout=2)
            except Exception:
                self._redis = None

    def allow_request(self, key: str, limit: int, window: int) -> Tuple[bool, int, int]:
        """
        Returns (allowed, remaining, retry_after_seconds).
        """
        if self._redis:
            try:
                # Use Redis INCR with EXPIRE to implement sliding window counter per key.
                redis_key = f"rate:{key}:{window}"
                cur = self._redis.incr(redis_key)
                if cur == 1:
                    # first hit; set expiry
                    self._redis.expire(redis_key, window)
                remaining = max(0, limit - int(cur))
                allowed = int(cur) <= limit
                ttl = self._redis.ttl(redis_key)
                retry_after = int(ttl) if ttl and ttl > 0 else window
                return allowed, remaining, retry_after
            except Exception:
                # fall back to in-memory on redis error
                pass

        now = time.time()
        with self._lock:
            entries = self._map.get(key, [])
            # drop old
            entries = [t for t in entries if now - t < window]
            remaining = max(0, limit - len(entries))
            if remaining <= 0:
                retry_after = int(window - (now - entries[0]) if entries else window)
                return False, 0, retry_after
            # allow and record
            entries.append(now)
            self._map[key] = entries
            return True, max(0, limit - len(entries)), 0


__all__ = ['RateLimiter']

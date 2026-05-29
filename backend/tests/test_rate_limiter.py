import os
import time
import importlib


def test_in_memory_rate_limiter():
    from backend.rate_limiter import RateLimiter

    rl = RateLimiter()
    key = '1.2.3.4'
    limit = 3
    window = 2

    # first `limit` requests allowed
    for i in range(limit):
        allowed, remaining, retry = rl.allow_request(key, limit, window)
        assert allowed is True
        assert remaining == limit - (i + 1)

    # next request should be blocked
    allowed, remaining, retry = rl.allow_request(key, limit, window)
    assert allowed is False
    assert remaining == 0
    assert retry > 0

    # after window seconds, requests allowed again
    time.sleep(window + 0.1)
    allowed, remaining, retry = rl.allow_request(key, limit, window)
    assert allowed is True


def test_redis_backed_rate_limiter_mock(monkeypatch):
    # Prepare a fake redis module with minimal behavior
    class FakeRedisClient:
        def __init__(self):
            self.store = {}
            self.expiries = {}

        def incr(self, key):
            v = int(self.store.get(key, 0)) + 1
            self.store[key] = v
            return v

        def expire(self, key, seconds):
            self.expiries[key] = time.time() + int(seconds)
            return True

        def ttl(self, key):
            exp = self.expiries.get(key)
            if not exp:
                return -1
            remaining = int(exp - time.time())
            return remaining if remaining > 0 else -2

    class FakeRedisModule:
        def __init__(self):
            self.client = FakeRedisClient()

        def from_url(self, url, socket_timeout=None):
            return self.client

    # Monkeypatch the redis module used by rate_limiter
    import backend
    import backend.rate_limiter as rlmod
    fake = FakeRedisModule()
    monkeypatch.setattr(rlmod, 'redis', fake)

    # Ensure env triggers redis usage path
    monkeypatch.setenv('REDIS_URL', 'redis://localhost')
    importlib.reload(rlmod)
    rl = rlmod.RateLimiter()

    key = '5.6.7.8'
    limit = 2
    window = 5

    allowed, remaining, retry = rl.allow_request(key, limit, window)
    assert allowed is True
    assert remaining == 1

    allowed, remaining, retry = rl.allow_request(key, limit, window)
    assert allowed is True
    assert remaining == 0

    allowed, remaining, retry = rl.allow_request(key, limit, window)
    assert allowed is False
    assert remaining == 0

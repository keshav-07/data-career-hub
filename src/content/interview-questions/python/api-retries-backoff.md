---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you add retries with backoff to API ingestion in Python?"
seoTitle: "Python API Retries With Backoff: Interview Answer"
description: "Python API retries with backoff, interview answer: retry timeouts, 429 and 5xx only, with capped jittered backoff that honours Retry-After."
technology: ["python"]
topic: ["retries", "apis", "reliability"]
difficulty: "Medium"
questionType: ["coding", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "I retry only failures that can succeed later: connection errors, timeouts, 429 Too Many Requests and 5xx responses. Client errors such as 400, 401, 403 and 404 fail immediately. Between attempts I wait with exponential backoff and random jitter, capped at a maximum delay, and I use the server's Retry-After value when it sends one. I limit attempts and total time, set a timeout on every request, and only retry idempotent requests, or POSTs that carry an idempotency key. With requests I usually mount urllib3's Retry on a session; when I need custom logging or deadlines I write a small loop or use tenacity, and I test it with a fake clock so tests do not sleep."
followUps: ["Why add jitter to the backoff?", "What if the API fails on page 300 of 500?", "How do you avoid duplicates when retrying a POST?", "How would you test the retry logic?"]
related: ["articles:python/working-with-apis", "articles:etl-elt/pipeline-reliability-and-retries", "interview-questions:python/exceptions-in-pipelines"]
sources:
  - { label: "urllib3 documentation: Retry", url: "https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html#urllib3.util.Retry" }
  - { label: "AWS Architecture Blog: Exponential backoff and jitter", url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/" }
  - { label: "MDN: Retry-After header", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After" }
versionContext: "Examples run on Python 3.11 (standard library only); the retry function is exercised with fake responses and a fake sleep"
---

## Detailed explanation

### What to retry

| Failure | Retry? |
|---------|--------|
| Connection error, read timeout | Yes |
| 429 Too Many Requests | Yes, after `Retry-After` if present |
| 500, 502, 503, 504 | Yes |
| 400, 401, 403, 404, 409, 422 | No: the request or credentials are wrong |
| A response that parses but fails validation | No: a data or contract problem, alert instead |

### How long to wait

- **Exponential backoff**: `base * 2 ** (attempt - 1)`, so 1 s, 2 s, 4 s ...
- **Cap** each delay (for example 30 s) and the number of attempts (for example 5), and optionally a total deadline.
- **Jitter**: randomise the delay. "Full jitter" picks uniformly between 0 and the exponential value, which spreads out many clients that failed at the same moment instead of having them all retry together.
- **Retry-After** from the server overrides your own delay: it knows when it will accept requests again.

### Safety

- Every request has a timeout, or a hung connection is never retried at all.
- Retried requests must be idempotent. GET is; a POST that creates an order is not, unless the API supports an idempotency key header.
- In a paginated pull, retry the failed page, not the whole pull, and keep the cursor so a crash can resume.

## Example

```python
import random

class Response:
    def __init__(self, status, headers=None, body=None):
        self.status, self.headers, self.body = status, headers or {}, body

RETRYABLE = {429, 500, 502, 503, 504}

def get_with_retry(send, url, *, attempts=5, base=1.0, cap=30.0, sleep, rng=random.random):
    for attempt in range(1, attempts + 1):
        try:
            resp = send(url)
        except (ConnectionError, TimeoutError) as exc:
            if attempt == attempts:
                raise
            delay = rng() * min(cap, base * 2 ** (attempt - 1))
            print(f"attempt {attempt}: {type(exc).__name__}, retry in {delay:.2f}s")
            sleep(delay)
            continue
        if resp.status < 400:
            return resp
        if resp.status not in RETRYABLE or attempt == attempts:
            raise RuntimeError(f"GET {url} failed with {resp.status} after {attempt} attempt(s)")
        retry_after = resp.headers.get("Retry-After")
        delay = float(retry_after) if retry_after else rng() * min(cap, base * 2 ** (attempt - 1))
        print(f"attempt {attempt}: HTTP {resp.status}, retry in {delay:.2f}s")
        sleep(delay)

script = iter([TimeoutError("read timed out"), Response(503), Response(429, {"Retry-After": "5"}),
               Response(200, body={"rows": 50})])
def fake_send(url):
    item = next(script)
    if isinstance(item, Exception):
        raise item
    return item

random.seed(3)
waits = []
resp = get_with_retry(fake_send, "/orders?page=1", sleep=waits.append)
print(resp.status, resp.body, "| total wait", round(sum(waits), 2))

try:
    get_with_retry(lambda url: Response(404), "/orders?page=999", sleep=waits.append)
except RuntimeError as exc:
    print(exc)
```

```text
attempt 1: TimeoutError, retry in 0.24s
attempt 2: HTTP 503, retry in 1.09s
attempt 3: HTTP 429, retry in 5.00s
200 {'rows': 50} | total wait 6.33
GET /orders?page=999 failed with 404 after 1 attempt(s)
```

The 429 waited exactly the five seconds the server asked for; the 404 failed on the first attempt. Injecting `send`, `sleep` and `rng` makes the function deterministic in tests, so the suite never actually sleeps.

In production with `requests`, the same policy is configuration rather than code:

<!-- noexec -->
```python
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = Session()
session.mount("https://", HTTPAdapter(max_retries=Retry(
    total=5, backoff_factor=1, backoff_jitter=0.5, backoff_max=30,
    status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset({"GET"}),
    respect_retry_after_header=True, raise_on_status=False)))
resp = session.get("https://api.example.com/orders", timeout=(3.05, 30))
resp.raise_for_status()
```

## Trade-offs and pitfalls

- More attempts improve the chance of success but delay the failure alert; for scheduled jobs, a few attempts inside the task plus the orchestrator's own task retries is usually enough.
- Many parallel workers retrying against one rate-limited API make throttling worse; pace requests and reduce concurrency instead.
- Retrying a validation failure (the API returned 200 with an unexpected payload) just repeats it.
- Log each retry with the URL (without tokens), status and delay, so slow APIs are visible in monitoring.

## Common mistakes

1. Retrying every exception, including 401 and 404.
2. Fixed delays without jitter, or no cap on the delay.
3. Ignoring `Retry-After`.
4. No request timeout.
5. Retrying non-idempotent POSTs and creating duplicates.

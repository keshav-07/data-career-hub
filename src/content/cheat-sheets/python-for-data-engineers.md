---
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Python for Data Engineers Cheat Sheet"
description: "A quick Python reference for pipelines: files and CSV, JSON, dates, collections, generators and batching, error handling, logging and testing with pytest."
inventoryId: "CHEAT-02"
technology: ["python"]
topic: ["reference"]
cheatTopic: "Python"
related: ["articles:python/iterators-generators", "articles:python/data-structures-for-interviews", "articles:python/idempotent-csv-loader", "articles:python/file-io-csv-json", "articles:python/error-handling-logging", "articles:python/working-with-apis", "articles:python/pandas-for-data-engineers", "articles:python/testing-with-pytest"]
versionContext: "Examples run on Python 3.11 (standard library); itertools.batched needs Python 3.12, with a fallback shown"
---

## Files and CSV

```python
import csv, io

f = io.StringIO("id,amount\n1,10\n2,20\n")          # use open(path, newline="") for real files
rows = list(csv.DictReader(f))
print(rows[0]["amount"])
```

## JSON

```python
import json

record = json.loads('{"id": 1, "tags": ["a", "b"]}')
print(json.dumps(record, sort_keys=True))
```

## Dates and times

```python
from datetime import date, datetime, timedelta, timezone

run_date = date(2026, 10, 1)
print(run_date.isoformat(), run_date + timedelta(days=1))
print(datetime(2026, 10, 1, 9, 30, tzinfo=timezone.utc).isoformat())
```

Store and compare timestamps in UTC; convert to local time only for display.

## Collections

```python
from collections import Counter, defaultdict, deque

totals = defaultdict(int)
for k, v in [("a", 1), ("b", 2), ("a", 3)]:
    totals[k] += v
print(dict(totals), Counter("abca").most_common(1), deque([1, 2, 3], maxlen=2))
print(list(dict.fromkeys(["b", "a", "b"])))          # dedupe, keep order
```

## Generators and batching

```python
from itertools import islice

try:
    from itertools import batched                     # Python 3.12+
except ImportError:
    def batched(iterable, n):                         # fallback for 3.11 and older
        it = iter(iterable)
        while chunk := tuple(islice(it, n)):
            yield chunk

def read_ids(n):
    for i in range(n):
        yield i

print(list(islice(read_ids(10), 3)))
print(list(batched(read_ids(5), 2)))
```

## Error handling

```python
class LoadError(Exception):
    pass

try:
    try:
        int("x")
    except ValueError as exc:
        raise LoadError("bad amount in row 7") from exc
except LoadError as err:
    print(err, "| caused by", type(err.__cause__).__name__)
```

Catch specific exceptions, preserve the cause with `raise ... from exc`, and let unexpected errors fail the run.

## Logging

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("orders")
log.info("loaded %d rows from %s", 120, "orders.csv")   # lazy formatting
```

## Atomic file writes

```python
import os, tempfile
from pathlib import Path

target = Path(tempfile.mkdtemp()) / "extract.csv"
tmp = target.with_name(f".{target.name}.tmp")
tmp.write_text("id\n1\n", encoding="utf-8")
os.replace(tmp, target)                               # readers see the old file or the new one, never half
print(target.read_text(encoding="utf-8").split())
```

## HTTP with timeouts and retries

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()
session.mount("https://", HTTPAdapter(max_retries=Retry(
    total=5, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET"}), respect_retry_after_header=True)))
# resp = session.get(url, params=params, timeout=(3.05, 30)); resp.raise_for_status()
print(type(session.adapters["https://"].max_retries).__name__)
```

Retry only 429, 5xx and network errors; fail fast on other 4xx. Always pass `timeout=`.

## pandas safety switches

```text
pd.read_csv(path, dtype={"id": "string", "qty": "Int64"}, parse_dates=["ts"])   # explicit types
df.drop_duplicates(subset="order_id", keep="last")                              # always name the key
left.merge(right, on="id", how="left", validate="many_to_one", indicator=True)   # catch fan-out
df.loc[df.x > 0, "y"] = 1                                                        # not df[df.x > 0]["y"] = 1
df.to_parquet("out.parquet", index=False)                                        # keeps types
```

Above a few million rows or near memory limits, use DuckDB, Polars or Spark instead.

## Testing with pytest

```python
def to_cents(amount: float) -> int:
    return int(round(amount * 100))

def test_to_cents():
    assert to_cents(19.99) == 1999

test_to_cents()
```

Run `pytest -q`. Put pure transformation logic in functions so it can be tested without I/O.

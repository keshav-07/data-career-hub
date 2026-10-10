---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Why are mutable default arguments dangerous in Python?"
seoTitle: "Python Mutable Default Arguments: Interview Answer"
description: "Python mutable default arguments, interview answer: defaults are evaluated once at definition time, so a list or dict default is shared across calls; use None and create it inside."
technology: ["python"]
topic: ["functions", "gotchas"]
difficulty: "Easy"
questionType: ["conceptual", "debugging"]
estimatedMinutes: 5
interviewRelevance: "Foundational"
shortAnswer: "Default values are evaluated once, when the def statement runs, not on every call. If the default is a mutable object such as a list, dict or set, every call that relies on the default gets the same object, so changes made in one call leak into the next. In a pipeline that can mean rows from yesterday's batch appearing in today's, or settings changed by one task affecting another in the same worker process. The fix is to use None as the default and create a new object inside the function, or to use an immutable default such as a tuple or frozenset."
followUps: ["Is a default of datetime.now() also a problem?", "Why might this bug only appear in an orchestrator and not in a quick script?", "How do dataclasses handle mutable defaults?", "Is the shared default ever useful on purpose?"]
related: ["articles:python/functions-modules-reusable-code", "interview-questions:python/shallow-vs-deep-copy"]
sources:
  - { label: "Python documentation: Default argument values", url: "https://docs.python.org/3/tutorial/controlflow.html#default-argument-values" }
  - { label: "Python documentation: dataclasses (default_factory)", url: "https://docs.python.org/3/library/dataclasses.html#mutable-default-values" }
versionContext: "Examples run on Python 3.11"
---

## Detailed explanation

`def f(rows=[])` creates the list **once**, stores it on the function object (`f.__defaults__`) and reuses it for every call that omits `rows`. Appending to it changes the stored default.

```python
def collect_bad_rows(row, bad_rows=[]):          # the bug
    if row.get("amount") is None:
        bad_rows.append(row)
    return bad_rows

print(collect_bad_rows({"id": 1, "amount": None}))
print(collect_bad_rows({"id": 2, "amount": 5}))   # a good row, yet the list is not empty
print(collect_bad_rows.__defaults__)
```

```text
[{'id': 1, 'amount': None}]
[{'id': 1, 'amount': None}]
([{'id': 1, 'amount': None}],)
```

The second call reports a bad row it never saw. In a long-running worker (an Airflow worker, a Lambda container that is reused, a streaming consumer), the list keeps growing across runs until memory runs out or wrong counts are published.

## The fix

```python
def collect_bad_rows(row, bad_rows=None):
    if bad_rows is None:
        bad_rows = []                             # a new list on every call
    if row.get("amount") is None:
        bad_rows.append(row)
    return bad_rows

print(collect_bad_rows({"id": 1, "amount": None}))
print(collect_bad_rows({"id": 2, "amount": 5}))
```

```text
[{'id': 1, 'amount': None}]
[]
```

## The same trap with time

Defaults that call functions are also evaluated once:

```python
from datetime import datetime
import time

def stamp(loaded_at=datetime.now()):
    return loaded_at

first = stamp()
time.sleep(0.01)
print(stamp() == first)                           # the "current" time never changes
```

```text
True
```

In a pipeline, prefer passing the run's logical date explicitly anyway; reading the clock inside a job breaks reruns and backfills.

## Dataclasses

`dataclasses` refuses a mutable default and points you at `default_factory`:

```python
from dataclasses import dataclass, field

try:
    @dataclass
    class Bad:
        tables: list = []
except ValueError as exc:
    print("ValueError:", exc)

@dataclass
class LoadConfig:
    tables: list[str] = field(default_factory=list)

a, b = LoadConfig(), LoadConfig()
a.tables.append("orders")
print(a.tables, b.tables)
```

```text
ValueError: mutable default <class 'list'> for field tables is not allowed: use default_factory
['orders'] []
```

Each `LoadConfig` gets its own list, so appending to one does not affect the other.

## Trade-offs and pitfalls

- Immutable defaults (`()`, `frozenset()`, `None`, numbers, strings) are safe.
- The shared default is occasionally used on purpose as a cache, but `functools.lru_cache` or an explicit module-level dict says that more clearly.
- Linters flag the pattern (for example Ruff's `B006`), so enable them in CI.

## Common mistakes

1. `def f(x=[])`, `def f(x={})` or `def f(x=set())`.
2. Defaults computed from the clock or the environment at import time.
3. Copying a default with `list(default)` but still mutating a nested object inside it.

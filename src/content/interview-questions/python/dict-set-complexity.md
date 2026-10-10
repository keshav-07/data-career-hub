---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Why are dict and set lookups O(1) in Python, and when are they not?"
seoTitle: "Python dict and set Complexity: Interview Answer"
description: "Python dict and set complexity, interview answer: hash tables give O(1) average lookups, O(n) worst case and amortised O(1) inserts."
technology: ["python"]
topic: ["data-structures", "complexity", "hashing"]
difficulty: "Medium"
questionType: ["conceptual", "optimization"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Dicts and sets are hash tables. To find a key, Python computes its hash, jumps to a slot derived from it, and compares only the few keys stored around that slot, so lookup, insert and delete are O(1) on average regardless of size. The worst case is O(n) when many keys collide, which is rare with good hashes. Inserts are amortised O(1): the table occasionally resizes and rehashes everything, but that cost is spread over many inserts. Keys must be hashable and must not change while stored, which is why lists cannot be keys but tuples of immutable values can. The price is memory: a set of a million ids uses much more memory than a list of them."
followUps: ["What happens if two keys have the same hash?", "Why can a tuple be a dict key but a list cannot?", "What must hold between __eq__ and __hash__ for your own classes?", "When would you choose a sorted list and bisect over a set?"]
related: ["articles:python/data-structures-for-interviews", "interview-questions:python/list-tuple-set", "articles:dsa/arrays-and-hashing"]
sources:
  - { label: "Python wiki: Time complexity", url: "https://wiki.python.org/moin/TimeComplexity" }
  - { label: "Python documentation: Glossary (hashable)", url: "https://docs.python.org/3/glossary.html#term-hashable" }
  - { label: "Python documentation: object.__hash__", url: "https://docs.python.org/3/reference/datamodel.html#object.__hash__" }
versionContext: "Examples run on Python 3.11 (CPython). Timings are compared as ratios because absolute times depend on the machine."
---

## Detailed explanation

| Operation | list | set / dict |
|-----------|------|------------|
| `x in c` | O(n) scan | O(1) average, O(n) worst |
| Add / insert | O(1) amortised at the end | O(1) amortised |
| Delete by value / key | O(n) | O(1) average |
| Iterate | O(n) | O(n) |
| Ordered? | Yes | dict: insertion order (guaranteed since 3.7); set: no |

### How the lookup works

1. `hash(key)` produces an integer.
2. The integer, reduced to the table size, picks a slot.
3. If the slot holds a different key, CPython probes further slots in a fixed pseudo-random sequence (open addressing) until it finds the key or an empty slot.
4. Candidate keys are compared with `==` only when their stored hashes match, so most comparisons are cheap.

The table is kept partly empty. When it gets too full it is resized and every key is re-inserted. A single insert that triggers a resize costs O(n), but resizes happen geometrically less often, so the average cost per insert stays O(1): **amortised** O(1).

### Why the worst case is O(n)

If many keys land in the same probe sequence, a lookup compares against many of them. With Python's built-in hashes this does not happen for normal data. String hashing is randomised per process (`PYTHONHASHSEED`) precisely so that attackers cannot craft inputs that collide on purpose.

## Example: the difference in practice

```python
import timeit

ids_list = list(range(100_000))
ids_set = set(ids_list)
lookups = list(range(99_000, 100_000))          # 1,000 lookups near the end of the list

list_time = timeit.timeit(lambda: [x in ids_list for x in lookups], number=3)
set_time = timeit.timeit(lambda: [x in ids_set for x in lookups], number=3)
print("set at least 100x faster:", list_time > 100 * set_time)
```

```text
set at least 100x faster: True
```

This is the classic pipeline bug: `if row_id in already_loaded_ids:` inside a loop over a million rows, with `already_loaded_ids` a list, turns a linear job into a quadratic one.

### Hashability

A key must be **hashable** (its hash never changes) and **equal keys must have equal hashes**:

```python
key = ("2026-10-05", "DE")
daily = {key: 150}
print(daily[("2026-10-05", "DE")])

for candidate in (["2026-10-05", "DE"], ("2026-10-05", ["DE"])):
    try:
        hash(candidate)
    except TypeError as exc:
        print(type(candidate).__name__, "->", exc)
```

```text
150
list -> unhashable type: 'list'
tuple -> unhashable type: 'list'
```

A tuple is hashable only if everything inside it is. For your own classes, a frozen dataclass (`@dataclass(frozen=True)`) generates a consistent `__eq__` and `__hash__` from its fields.

### What a "slow hash" looks like

The O(1) claim assumes hashing the key is cheap. Hashing a long string or a large tuple is O(length) (CPython caches a string's hash after the first computation). Keys that are huge composite tuples rebuilt on every lookup can make "O(1)" lookups noticeably expensive; a compact key (an integer id, a short string) is faster.

## Trade-offs and pitfalls

- **Memory**: a set or dict stores hashes and keeps spare slots, so it typically uses several times the memory of a list of the same items. For hundreds of millions of keys, use a database, a sorted array with `bisect`, or an engine such as DuckDB.
- **Order**: dicts keep insertion order; sets do not. `list(dict.fromkeys(items))` deduplicates while keeping order.
- **Floats as keys**: `0.1 + 0.2 != 0.3`, so floats computed differently may not match. Use integers (cents) or strings for keys.
- **Mutating keys**: changing an object after using it as a key (possible with a badly written custom class) makes it unfindable.

## Common mistakes

1. Membership tests against a list inside a loop.
2. Claiming dict lookups are "always O(1)" without mentioning average versus worst case or amortised resizing.
3. Using lists, or tuples containing lists, as keys.
4. Building a giant set of keys in memory when a database join would do the work.

---
title: "Sort Characters By Frequency: Count, Then Order by a Heap or Buckets"
seoTitle: "Sort Characters By Frequency: Heap and Buckets"
description: "Rearrange a string so the most frequent characters come first. Count with a hash map, then order by a max-heap in O(n log k) or by buckets in O(n)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "hashing", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Count each character with a hash map. Push (-count, char) pairs into a heap and pop them, writing each character count times; with k distinct characters that is O(n + k log k). Or skip the heap: put characters into buckets indexed by count (a count is at most n) and read buckets from n down to 1, for O(n). Equal characters must stay together, and ties between different characters may come out in any order unless the interviewer asks for a rule."
followUps: ["How would you make the output deterministic when two characters have the same count?", "How would you do this when the text is too large for memory?", "What changes if the string can contain any Unicode character?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/top-k-frequent-elements", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 451, "title": "Sort Characters By Frequency", "url": "https://leetcode.com/problems/sort-characters-by-frequency/"}
previous: "interview-questions:dsa/minimum-cost-of-ropes"
next: "interview-questions:dsa/find-k-closest-elements"
---

## Problem

Given a string, return a rearrangement of it in which characters are ordered by how often they occur, most frequent first. All copies of a character must be next to each other. Upper and lower case are different characters, and digits count too. When two characters occur equally often, either may come first. This is LeetCode 451, Sort Characters By Frequency.

## Examples

```text
"etl"       ->  "etl" or any order of the three letters (all occur once)
"pipeline"  ->  "ppiieeln"   (the pairs pp, ii, ee in any order, then l and n)
"Aabb"      ->  "bbAa" or "bbaA"
""          ->  ""
```

## Approach 1: sort by count

Count the characters, then sort the string with a key of (negative count, character). The character in the key keeps equal characters together when counts tie.

```python
from collections import Counter

def frequency_sort_simple(s):
    counts = Counter(s)
    return "".join(sorted(s, key=lambda ch: (-counts[ch], ch)))
```

**Complexity:** O(n log n) time because the whole string is sorted, O(n) space. Fine in practice, and a good first answer.

## Approach 2: optimal (heap of distinct characters, or buckets)

Sorting all n characters wastes work: only the k distinct characters need ordering. Push one entry per distinct character into a heap keyed by negative count, then pop and write each character count times.

```python
import heapq

def frequency_sort_heap(s):
    heap = [(-c, ch) for ch, c in Counter(s).items()]
    heapq.heapify(heap)
    parts = []
    while heap:
        neg, ch = heapq.heappop(heap)
        parts.append(ch * -neg)
    return "".join(parts)
```

To remove the log factor, note that a count lies between 1 and n. Put each character into the bucket for its count and read the buckets from the top.

```python
def frequency_sort_buckets(s):
    buckets = [[] for _ in range(len(s) + 1)]
    for ch, c in Counter(s).items():
        buckets[c].append(ch)
    parts = []
    for c in range(len(s), 0, -1):
        for ch in buckets[c]:
            parts.append(ch * c)
    return "".join(parts)
```

**Why it is correct:** both versions emit each distinct character exactly once, as one block of its full count, in non-increasing order of count, which is exactly what the output requires.

**Complexity:** heap: O(n + k log k) time, O(n) space. Buckets: O(n) time and space.

## Tests

The answer is not unique, so the tests check the properties instead of one string.

```python
import random

def is_valid(original, result):
    if Counter(result) != Counter(original):
        return False
    blocks = []
    for ch in result:
        if blocks and blocks[-1][0] == ch:
            blocks[-1][1] += 1
        else:
            blocks.append([ch, 1])
    if len({ch for ch, _ in blocks}) != len(blocks):   # a character split in two
        return False
    sizes = [n for _, n in blocks]
    return sizes == sorted(sizes, reverse=True)

for f in (frequency_sort_simple, frequency_sort_heap, frequency_sort_buckets):
    for s in ["etl", "pipeline", "Aabb", "", "z", "aaaa", "112233a", "tree"]:
        assert is_valid(s, f(s)), (f.__name__, s)
    assert f("pipeline")[:2] in ("pp", "ii", "ee")

assert not is_valid("aab", "aba")      # the checker rejects split blocks
random.seed(4)
for _ in range(300):
    s = "".join(random.choice("aAbB1") for _ in range(random.randint(0, 12)))
    for f in (frequency_sort_simple, frequency_sort_heap, frequency_sort_buckets):
        assert is_valid(s, f(s))
print("ok")
```

## Edge cases and pitfalls

- Sorting with only `-counts[ch]` as the key can interleave two characters with the same count (`"abab"` stays `"abab"`), which breaks the "copies together" rule. Add the character as a tie-breaker, or build the output from blocks.
- Case matters: `A` and `a` are counted separately.
- Build the result with `"".join` on a list; repeated `+=` on strings can be quadratic.
- The bucket array has length n + 1, because a single character can occur n times.

## Where this shows up in data engineering

Counting then ranking by frequency is the core of profiling a column: the most common values, the share of nulls or sentinel values, and the long tail. The bucket idea is how you get top-frequency lists in one pass when counts are bounded, and the heap version is what you use when you only want the top few and the distinct count is large.

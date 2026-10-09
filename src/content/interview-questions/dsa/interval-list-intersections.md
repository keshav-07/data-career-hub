---
title: "Interval List Intersections: Two Pointers over Sorted Ranges"
seoTitle: "Interval List Intersections: Two Pointers"
description: "Intersect two sorted lists of disjoint closed intervals. Two pointers compare the current pair, emit the overlap and advance whichever ends first, in O(m + n)."
technology: ["dsa"]
topic: ["intervals", "two-pointers"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Keep one pointer in each list. For the current pair, the overlap is [max of the starts, min of the ends]; if that start is at most that end, record it. Then advance the pointer whose interval ends first, because it cannot overlap anything further in the other list. Each step moves one pointer, so the time is O(m + n) and the extra space is O(1) besides the output. Closed intervals that share only an endpoint produce a single-point intersection such as [5, 5]."
followUps: ["Why is it safe to advance the interval that ends first?", "How would you intersect k lists instead of two?", "What changes if the intervals are half-open?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/merge-intervals", "interview-questions:dsa/insert-interval", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "LeetCode", "number": 986, "title": "Interval List Intersections", "url": "https://leetcode.com/problems/interval-list-intersections/"}
previous: "interview-questions:dsa/non-overlapping-intervals"
next: "interview-questions:dsa/attend-all-meetings-ii"
---

## Problem

You get two lists of closed intervals `[start, end]`. Within each list the intervals are sorted and do not overlap each other. Return every interval that is covered by both lists, in sorted order. This is LeetCode 986, Interval List Intersections.

## Examples

```text
A = [[0, 3], [6, 9]],        B = [[2, 7]]           ->  [[2, 3], [6, 7]]
A = [[1, 5]],                B = [[5, 8]]           ->  [[5, 5]]     (shared endpoint)
A = [[1, 2], [4, 6]],        B = []                 ->  []
A = [[0, 10]],               B = [[1, 2], [3, 4]]   ->  [[1, 2], [3, 4]]
```

## Approach 1: brute force

Compare every interval in `A` with every interval in `B` and keep the non-empty overlaps. Because both lists are internally disjoint, the overlaps never overlap one another, so sorting them gives the answer.

```python
def intersect_brute(a, b):
    out = []
    for s1, e1 in a:
        for s2, e2 in b:
            lo, hi = max(s1, s2), min(e1, e2)
            if lo <= hi:
                out.append([lo, hi])
    return sorted(out)
```

**Complexity:** O(m · n) time plus the sort of the output.

## Approach 2: optimal (two pointers)

Walk both lists like the merge step of merge sort. Look at `A[i]` and `B[j]`; their overlap, if any, is `[max(starts), min(ends)]`. Whichever of the two ends first is finished: every later interval in the other list starts after the current one there, which is no earlier than the current one, so nothing later can reach back far enough. Advance that pointer and repeat.

```python
def intersect(a, b):
    i = j = 0
    out = []
    while i < len(a) and j < len(b):
        lo = max(a[i][0], b[j][0])
        hi = min(a[i][1], b[j][1])
        if lo <= hi:
            out.append([lo, hi])
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out
```

**Why it is correct:** suppose `A[i]` ends first. Any later `B[j']` starts after `B[j]` ends, which is at or after `A[i]` ends, so `A[i]` cannot meet it. Dropping `A[i]` loses no intersection. The same holds with the roles swapped, and when the ends are equal, either choice is safe. Intersections are produced in increasing order because both pointers only move forward.

**Complexity:** O(m + n) time, O(1) extra space besides the output.

## Tests

```python
import random

def random_disjoint(rng):
    out, pos = [], rng.randint(-5, 2)
    for _ in range(rng.randint(0, 5)):
        start = pos + rng.randint(0, 3)
        end = start + rng.randint(0, 3)
        out.append([start, end])
        pos = end + 1
    return out

for f in (intersect, intersect_brute):
    assert f([[0, 3], [6, 9]], [[2, 7]]) == [[2, 3], [6, 7]]
    assert f([[1, 5]], [[5, 8]]) == [[5, 5]]
    assert f([[1, 2], [4, 6]], []) == []
    assert f([], []) == []
    assert f([[0, 10]], [[1, 2], [3, 4]]) == [[1, 2], [3, 4]]
    assert f([[1, 3]], [[1, 3]]) == [[1, 3]]          # identical
    assert f([[1, 2]], [[3, 4]]) == []                # disjoint

rng = random.Random(15)
for _ in range(500):
    a, b = random_disjoint(rng), random_disjoint(rng)
    assert intersect(a, b) == intersect_brute(a, b)
print("ok")
```

## Edge cases and pitfalls

- Use `<=` in the overlap test for closed intervals; `[1, 5]` and `[5, 8]` meet at the point 5. For half-open intervals use `<`.
- Advance by comparing ends, not starts. Advancing the interval that starts first can skip an overlap with a long interval in the other list.
- When either list runs out, stop; nothing in the other list can intersect an empty list.
- Both inputs must already be sorted and internally disjoint; if they are not, merge each list first.

## Where this shows up in data engineering

Intersecting two sets of time ranges answers questions such as "when was the customer both subscribed and active", "when were two services both degraded" or "which periods are covered by both the source and the target load". When both inputs are sorted by start time, the two-pointer sweep is linear and needs no join, and in SQL the same rule becomes a range join on `a.start_ts <= b.end_ts AND b.start_ts <= a.end_ts`, with `GREATEST` and `LEAST` of the bounds giving each overlap.

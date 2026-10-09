---
title: "Minimum Number of Days to Make m Bouquets: Binary Search on the Day"
seoTitle: "Minimum Days to Make m Bouquets"
description: "Find the earliest day you can pick m bouquets of k adjacent flowers by binary searching over days with a greedy check. Python solutions, proof and tests."
technology: ["dsa"]
topic: ["binary-search", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
shortAnswer: "If m * k exceeds the number of flowers, return -1. Otherwise, being able to make m bouquets by day d is monotonic: waiting longer only opens more flowers. Check a day greedily in one pass by counting runs of opened flowers and cutting a bouquet every time a run reaches k. Binary search d between the smallest and largest bloom day for the first day that passes. That is O(n log D) time, where D is the range of bloom days, and O(1) space. Remember that the k flowers must be adjacent."
followUps: ["Why is greedy cutting of the leftmost k opened flowers optimal for the check?", "How would you tighten the search to only the distinct bloom days?", "What changes if the flowers in a bouquet need not be adjacent?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/koko-eating-bananas"]
practice: {"platform": "LeetCode", "number": 1482, "title": "Minimum Number of Days to Make m Bouquets", "url": "https://leetcode.com/problems/minimum-number-of-days-to-make-m-bouquets/"}
---

## Problem

A row of flowers is described by a list `bloom`, where `bloom[i]` is the day flower `i` opens. Once open, a flower stays open. You want `m` bouquets, and each bouquet needs exactly `k` flowers that are next to each other in the row. A flower can be used in only one bouquet. Return the smallest day on which you can make all `m` bouquets, or `-1` if it can never be done.

This is LeetCode 1482, Minimum Number of Days to Make m Bouquets. It is a binary search on the answer with a greedy feasibility check.

Assume up to 100,000 flowers, bloom days up to a billion, and `m`, `k` up to about a million.

## Examples

```text
bloom = [3, 9, 2, 8, 4], m = 2, k = 1  ->  3    (day 3: flowers 0 and 2 are open)
bloom = [3, 9, 2, 8, 4], m = 2, k = 2  ->  9    (needs two adjacent pairs: all five must be open)
bloom = [3, 9, 2, 8, 4], m = 3, k = 2  -> -1    (six flowers needed, only five exist)
bloom = [5, 5, 1, 1, 1], m = 1, k = 3  ->  1    (flowers 2, 3, 4 open on day 1)
```

## Approach 1: brute force

The answer, if it exists, is one of the bloom days, because nothing changes between them. Try each distinct bloom day in increasing order and return the first that works.

```python
def can_make(bloom, day, m, k):
    bouquets = run = 0
    for b in bloom:
        if b <= day:
            run += 1
            if run == k:          # cut a bouquet from this run
                bouquets += 1
                run = 0
        else:
            run = 0               # a closed flower breaks adjacency
    return bouquets >= m

def min_days_linear(bloom, m, k):
    if m * k > len(bloom):
        return -1
    for day in sorted(set(bloom)):
        if can_make(bloom, day, m, k):
            return day
    return -1
```

This is O(n * u) for `u` distinct bloom days, so O(n^2) in the worst case.

## Approach 2: optimal (binary search on the day)

**Monotonicity.** If you can make `m` bouquets on day `d`, you can on any later day, because every flower open on day `d` is still open. So the answers over days are `no, ..., no, yes, ...`, and you want the first yes.

**Range.** Search between `min(bloom)` (nothing can be ready earlier) and `max(bloom)` (every flower is open, so it works whenever `m * k <= n`).

**The check.** Walk the row once, counting consecutive open flowers. Each time the count reaches `k`, cut a bouquet and reset. Cutting as early as possible is never worse: any bouquet arrangement in a run can be shifted left to start at the run's beginning without overlapping others.

```python
def min_days(bloom, m, k):
    if m * k > len(bloom):
        return -1
    lo, hi = min(bloom), max(bloom)
    while lo < hi:
        mid = (lo + hi) // 2
        if can_make(bloom, mid, m, k):
            hi = mid              # mid works; try earlier
        else:
            lo = mid + 1          # not enough adjacent open flowers yet
    return lo
```

Walkthrough for `[3, 9, 2, 8, 4]`, `m = 2`, `k = 2`, range `[2, 9]`: day 5 opens flowers 0, 2, 4 with no adjacent pair, so `lo = 6`; day 7 is the same, `lo = 8`; day 8 opens 0, 2, 3, 4, giving one pair (2, 3) only, so `lo = 9`; the answer is 9.

**Why it is correct.** The upfront check rules out impossible inputs, so `max(bloom)` always passes and the answer lies in the range. The loop keeps the first passing day inside `[lo, hi]` and halves the range each step.

**Complexity.** O(n log D) time, where D is `max(bloom) - min(bloom)`, and O(1) extra space.

## Tests

```python
import random

def check(fn):
    b = [3, 9, 2, 8, 4]
    assert fn(b, 2, 1) == 3
    assert fn(b, 2, 2) == 9
    assert fn(b, 3, 2) == -1
    assert fn([5, 5, 1, 1, 1], 1, 3) == 1
    assert fn([7], 1, 1) == 7
    assert fn([7], 1, 2) == -1
    assert fn([1, 10, 1, 10, 1], 2, 1) == 1
    assert fn([1, 10, 1, 10, 1], 1, 2) == 10

for f in (min_days_linear, min_days):
    check(f)

rng = random.Random(5)
for _ in range(500):
    bloom = [rng.randint(1, 15) for _ in range(rng.randint(1, 12))]
    m, k = rng.randint(1, 5), rng.randint(1, 4)
    assert min_days(bloom, m, k) == min_days_linear(bloom, m, k), (bloom, m, k)

# large values: only the logarithmic search is practical
assert min_days([10**9] * 3 + [1], 1, 3) == 10**9
print("ok")
```

## Edge cases and pitfalls

- **Impossible input.** Check `m * k > len(bloom)` first; otherwise the search returns `max(bloom)` even though it fails.
- **Adjacency.** Counting all open flowers instead of runs ignores the "next to each other" rule. Reset the run on every closed flower.
- **Reusing flowers.** Reset the run to 0 after cutting a bouquet, not `run - k + 1`; overlapping bouquets are not allowed.
- **Overflow elsewhere.** In Java or C++, `m * k` can overflow 32 bits; Python does not have this problem.

## Where this shows up in data engineering

"The earliest time by which enough contiguous inputs are ready" is a scheduling question: for example, the first hour at which a job can process m windows, each needing k consecutive partitions to have landed. When partition arrival times are known, binary searching the cut-off time with a single scan per guess answers it without simulating every hour.

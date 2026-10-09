---
title: "Aggressive Cows: Maximise the Minimum Gap with Binary Search"
seoTitle: "Aggressive Cows: Maximise the Minimum Gap"
description: "Place k cows in stalls so the closest pair is as far apart as possible, using binary search on the gap and a greedy check. Python solutions, proof and tests."
technology: ["dsa"]
topic: ["binary-search", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
shortAnswer: "Sort the stall positions. For a candidate gap g, greedily place the first cow in the first stall and each next cow in the first stall at least g past the previous one; if you place k cows, g is feasible. Feasibility is monotonic (a smaller gap is always easier), so binary search for the largest feasible g between 1 and max - min. That is O(n log n) for the sort plus O(n log R) for the search, where R is the span of positions, and O(1) extra space beyond sorting. This is the 'last true' version of binary search on the answer."
followUps: ["Why is placing each cow in the earliest possible stall optimal?", "How would you write the 'last true' search without an infinite loop?", "How is this related to placing k facilities to maximise the minimum distance on a line?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/koko-eating-bananas", "interview-questions:dsa/minimum-number-of-days-to-make-m-bouquets"]
practice: {"platform": "GeeksforGeeks", "title": "Aggressive Cows", "url": "https://www.geeksforgeeks.org/problems/aggressive-cows/1"}
previous: "interview-questions:dsa/minimum-number-of-days-to-make-m-bouquets"
next: "interview-questions:dsa/maximum-candies-allocated-to-k-children"
---

## Problem

You are given the positions of `n` stalls along a line, as distinct integers in any order, and a number of cows `k` with `2 <= k <= n`. Put each cow in a different stall so that the smallest distance between any two cows is as large as possible. Return that largest possible minimum distance.

This is GeeksforGeeks: Aggressive Cows, a classic exercise in binary search on the answer where you maximise rather than minimise.

Assume up to 100,000 stalls with positions up to a billion.

## Examples

```text
stalls = [1, 2, 4, 8, 9],    k = 3  ->  3    (cows at 1, 4, 8: gaps 3 and 4)
stalls = [10, 1, 2, 7, 5],   k = 3  ->  4    (cows at 1, 5, 10)
stalls = [2, 12, 11, 3, 26, 7], k = 5 -> 1
stalls = [0, 100],           k = 2  ->  100
```

## Approach 1: brute force

Try every gap from 1 to the full span and keep the largest that lets you place all cows. The check is the same greedy pass the optimal solution uses.

```python
def can_place(stalls, k, gap):
    # stalls must be sorted
    placed, last = 1, stalls[0]
    for s in stalls[1:]:
        if s - last >= gap:
            placed += 1
            last = s
            if placed == k:
                return True
    return placed >= k

def max_min_gap_linear(stalls, k):
    stalls = sorted(stalls)
    best = 0
    for gap in range(1, stalls[-1] - stalls[0] + 1):
        if can_place(stalls, k, gap):
            best = gap
        else:
            break                 # larger gaps cannot work either
    return best
```

This is O(n * R) where `R` is the span between the first and last stall, which is hopeless for positions up to a billion.

## Approach 2: optimal (binary search on the gap)

**Monotonicity.** If you can keep every pair at least `g` apart, the same placement keeps them at least `g - 1` apart. So feasibility over gaps reads `yes, yes, ..., yes, no, no, ...`, and the answer is the last yes.

**The greedy check.** After sorting, put the first cow in the first stall, then each next cow in the earliest stall at least `g` past the previous cow. Choosing the earliest stall never hurts: it leaves the most room for the remaining cows. If this places `k` cows, `g` works.

**Range.** The answer is at least 1 (stalls are distinct) and at most `stalls[-1] - stalls[0]`.

For a "last true" search, round the middle up so the loop always makes progress when `lo = mid`:

```python
def max_min_gap(stalls, k):
    stalls = sorted(stalls)
    lo, hi = 1, stalls[-1] - stalls[0]
    while lo < hi:
        mid = (lo + hi + 1) // 2     # round up for a 'last true' search
        if can_place(stalls, k, mid):
            lo = mid                 # mid works; try a wider gap
        else:
            hi = mid - 1             # too wide
    return lo
```

Walkthrough for `[1, 2, 4, 8, 9]`, `k = 3`, range `[1, 8]`: `mid = 5` places cows at 1 and 8 only, so `hi = 4`; `mid = 3` places 1, 4, 8, so `lo = 3`; `mid = 4` places 1 and 8 only (9 is just 1 past 8), so `hi = 3`; the answer is 3.

**Why it is correct.** The invariant is that `lo` is always feasible and every value above `hi` is not. Rounding up guarantees `mid > lo`, so each step shrinks the range. With `k >= 2`, gap 1 is always feasible, so the starting `lo` is valid.

**Complexity.** Sorting is O(n log n), and the search runs O(log R) greedy passes of O(n). Extra space is O(1) besides the sorted copy.

## Tests

```python
import random
from itertools import combinations

def max_min_gap_exhaustive(stalls, k):
    s = sorted(stalls)
    return max(min(b - a for a, b in zip(c, c[1:])) for c in combinations(s, k))

def check(fn):
    assert fn([1, 2, 4, 8, 9], 3) == 3
    assert fn([10, 1, 2, 7, 5], 3) == 4
    assert fn([2, 12, 11, 3, 26, 7], 5) == 1
    assert fn([0, 100], 2) == 100
    assert fn([5, 1, 3], 3) == 2
    assert fn([1, 2, 3, 4, 5], 2) == 4

for f in (max_min_gap_linear, max_min_gap, max_min_gap_exhaustive):
    check(f)

rng = random.Random(8)
for _ in range(300):
    stalls = rng.sample(range(0, 40), rng.randint(2, 8))
    k = rng.randint(2, len(stalls))
    expected = max_min_gap_exhaustive(stalls, k)
    assert max_min_gap(stalls, k) == max_min_gap_linear(stalls, k) == expected

assert max_min_gap([0, 10**9, 5 * 10**8], 3) == 5 * 10**8
print("ok")
```

## Edge cases and pitfalls

- **Forgetting to sort.** The greedy check assumes increasing positions. Unsorted input gives wrong answers silently.
- **Infinite loop.** With `lo = mid`, you must compute `mid = (lo + hi + 1) // 2`. Rounding down leaves `lo == mid` forever when `hi = lo + 1`.
- **Wrong range.** Starting `lo` at 0 is harmless, but `hi` must be the full span, not the largest single gap.
- **Two cows.** The answer is simply the span; a good sanity check.

## Where this shows up in data engineering

Spreading k items as far apart as possible over a fixed set of slots appears in scheduling, for example choosing maintenance or compaction windows from the allowed hours so that no two are too close together. More generally, "maximise the worst case" objectives with a cheap greedy check are a good fit for this search, and they come up when sizing spacing, buffers or replica placement.

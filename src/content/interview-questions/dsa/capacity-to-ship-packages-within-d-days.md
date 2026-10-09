---
title: "Capacity To Ship Packages Within D Days: Binary Search on Capacity"
seoTitle: "Capacity To Ship Packages Within D Days"
description: "Find the smallest ship capacity that moves packages in order within D days, using binary search on capacity and a greedy day count. Python solutions and tests."
technology: ["dsa"]
topic: ["binary-search", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
shortAnswer: "For a given capacity, load packages in order and start a new day whenever the next package would overflow; that greedy count is the fewest days that capacity needs. Bigger capacity never needs more days, so binary search the capacity between max(weights), since the heaviest package must fit, and sum(weights), which ships everything in one day. Return the first capacity whose day count is at most D. That is O(n log S) time, where S is the sum of weights, and O(1) space. The usual bug is a lower bound below the heaviest package."
followUps: ["Why is filling each day as much as possible optimal?", "How is this the same problem as Split Array Largest Sum?", "What if packages could be shipped in any order?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/koko-eating-bananas", "interview-questions:dsa/minimum-number-of-days-to-make-m-bouquets"]
practice: {"platform": "LeetCode", "number": 1011, "title": "Capacity To Ship Packages Within D Days", "url": "https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/"}
previous: "interview-questions:dsa/maximum-candies-allocated-to-k-children"
next: "interview-questions:dsa/split-array-largest-sum"
---

## Problem

Packages sit on a conveyor belt in a fixed order, with positive integer weights. Each day a ship takes the next packages in that order, as many as fit without exceeding its weight capacity. Packages cannot be split or reordered. Return the smallest integer capacity that ships every package within `days` days.

This is LeetCode 1011, Capacity To Ship Packages Within D Days. It is binary search on the answer with a greedy simulation as the feasibility check.

Assume up to 50,000 packages, each weighing up to 500, and `1 <= days <= len(weights)`.

## Examples

```text
weights = [4, 7, 2, 6, 3, 5], days = 3  ->  11   ([4, 7] [2, 6, 3] [5])
weights = [4, 7, 2, 6, 3, 5], days = 6  ->  7    (one package per day: the heaviest decides)
weights = [4, 7, 2, 6, 3, 5], days = 1  ->  27   (everything at once)
weights = [1, 1, 1, 1],       days = 2  ->  2
```

## Approach 1: brute force

Try every capacity from the heaviest package upwards and return the first that fits within the deadline.

```python
def days_needed(weights, cap):
    days, load = 1, 0
    for w in weights:
        if load + w > cap:      # this package goes on tomorrow's ship
            days += 1
            load = 0
        load += w
    return days

def ship_linear(weights, days):
    cap = max(weights)
    while days_needed(weights, cap) > days:
        cap += 1
    return cap
```

This is O(n * S) in the worst case, where `S` is the sum of the weights.

## Approach 2: optimal (binary search on capacity)

**The check.** For a fixed capacity, the fewest days come from loading each day as full as possible, in order. Holding a package back for no reason can only push later packages later, never earlier, so greedy filling is optimal.

**Monotonicity.** A larger ship can always copy a smaller ship's schedule, so days needed never rises as capacity rises. Feasibility reads `no, ..., no, yes, ...`, and you want the first yes.

**Range.** The capacity must be at least `max(weights)`, or the heaviest package never ships. It never needs to exceed `sum(weights)`, which ships everything in one day.

```python
def ship_within_days(weights, days):
    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = (lo + hi) // 2
        if days_needed(weights, mid) <= days:
            hi = mid              # fits; try a smaller ship
        else:
            lo = mid + 1          # too small
    return lo
```

Walkthrough for `[4, 7, 2, 6, 3, 5]`, `days = 3`, range `[7, 27]`:

```text
mid=17  [4 7 2] [6 3 5]        2 days -> hi=17
mid=12  [4 7] [2 6 3] [5]      3 days -> hi=12
mid=9   [4] [7 2] [6 3] [5]    4 days -> lo=10
mid=11  [4 7] [2 6 3] [5]      3 days -> hi=11
mid=10  [4] [7 2] [6 3] [5]    4 days -> lo=11
answer 11
```

**Why it is correct.** At `hi = sum(weights)` the check passes, and below `max(weights)` it cannot, so the answer is in the starting range. The loop keeps the first passing capacity inside `[lo, hi]` and halves the range every step.

**Complexity.** O(n log S) time, with `S` the sum of the weights, and O(1) extra space.

## Tests

```python
import random

def ship_exhaustive(weights, days):
    # smallest over all ways to cut the list into at most `days` contiguous groups
    n = len(weights)
    best = sum(weights)
    def go(i, groups_left, worst):
        nonlocal best
        if i == n:
            best = min(best, worst)
            return
        if groups_left == 0:
            return
        total = 0
        for j in range(i, n):
            total += weights[j]
            go(j + 1, groups_left - 1, max(worst, total))
    go(0, days, 0)
    return best

def check(fn):
    w = [4, 7, 2, 6, 3, 5]
    assert fn(w, 3) == 11
    assert fn(w, 6) == 7
    assert fn(w, 1) == 27
    assert fn([1, 1, 1, 1], 2) == 2
    assert fn([10], 1) == 10
    assert fn([3, 2, 2, 4, 1, 4], 3) == 6

for f in (ship_linear, ship_within_days, ship_exhaustive):
    check(f)

rng = random.Random(12)
for _ in range(300):
    w = [rng.randint(1, 20) for _ in range(rng.randint(1, 8))]
    d = rng.randint(1, len(w))
    assert ship_within_days(w, d) == ship_linear(w, d) == ship_exhaustive(w, d), (w, d)
print("ok")
```

## Edge cases and pitfalls

- **Lower bound too small.** Starting at 1 makes `days_needed` treat an oversized package as its own day, which silently undercounts and returns a capacity that cannot carry it. Start at `max(weights)`.
- **Off-by-one in the simulation.** Start with `days = 1`, and check the overflow before adding the package.
- **Order matters.** Sorting the weights changes the problem. The belt order is fixed.
- **Same problem, new name.** Split Array Largest Sum is this exact search with "subarrays" instead of "days".

## Where this shows up in data engineering

This is batch sizing for an ordered stream: given records or files that must be processed in order and a limit on the number of batches (or runs in a maintenance window), find the smallest per-batch size limit that still finishes. The greedy "fill the batch until the next item would overflow" rule is how many writers and uploaders already form batches, so the search only adds the outer loop.

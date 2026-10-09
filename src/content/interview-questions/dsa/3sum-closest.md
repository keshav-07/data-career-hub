---
title: "3Sum Closest: Sort, Fix One Value, and Squeeze Two Pointers"
seoTitle: "3Sum Closest: Sort Plus Two Pointers"
description: "Find the sum of three array elements that lies closest to a target. Sort, fix the first element, and move two pointers inward: O(n²) time, O(1) extra space."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the array. For each index i, look for the best pair to the right of i with two pointers, lo = i + 1 and hi = n − 1. Compute the three-value sum; if it is closer to the target than the best so far, record it. If the sum is below the target, move lo right to increase it; if above, move hi left; if equal, return the target immediately. Sorting is O(n log n) and the scans are O(n²) in total, with O(1) extra space. The key point is why moving a pointer cannot skip the answer: in a sorted range, every pair you discard would move the sum further from the target."
followUps: ["How would you return the three values or indices instead of the sum?", "Can you prune the outer loop using the smallest and largest possible sums for a given i?", "How does this generalise to the k elements closest to a target?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers", "interview-questions:dsa/3sum"]
practice: {"platform": "LeetCode", "number": 16, "title": "3Sum Closest", "url": "https://leetcode.com/problems/3sum-closest/"}
---

## Problem

You are given a list of integers `nums` with at least three elements and an integer `target`. Choose three elements at different positions so that their sum is as close as possible to `target`, and return that sum. Assume exactly one closest sum exists, so you never have to break a tie. This is LeetCode 16, 3Sum Closest.

## Examples

```text
nums = [4, -3, 1, 9, 2],  target = 6    ->  7    (4 + 1 + 2, or -3 + 1 + 9)
nums = [1, 1, 1],         target = 100  ->  3    (only one triple)
nums = [-5, 0, 5, 10],    target = 0    ->  0    (-5 + 0 + 5, exact)
```

## Approach 1: brute force

Try every triple of positions.

```python
from itertools import combinations

def three_sum_closest_brute(nums, target):
    best = None
    for a, b, c in combinations(nums, 3):
        s = a + b + c
        if best is None or abs(s - target) < abs(best - target):
            best = s
    return best
```

**Complexity:** O(n³) time, O(1) extra space. Fine for n up to a few hundred, too slow beyond that.

## Approach 2: optimal (sort + two pointers)

**Idea in plain English:** once the list is sorted, fixing the smallest of the three values turns the rest into a two-value problem on a sorted range, which two pointers solve in linear time. If the current sum is too small, the only way to get closer is a bigger value, so move the left pointer right. If it is too large, move the right pointer left. Keep the closest sum seen along the way.

Walkthrough on sorted `[-3, 1, 2, 4, 9]`, `target = 6`, with `i = 0` (value −3). The starting best is the first triple, −3 + 1 + 2 = 0.

| lo | hi | sum | vs target | best |
|---|---|---|---|---|
| 1 | 9 | 7 | too big, hi left | 7 |
| 1 | 4 | 2 | too small, lo right | 7 |
| 2 | 4 | 3 | too small, lo right | 7 |
| lo meets hi | | | next i | 7 |

The later values of `i` find nothing closer than distance 1, so the answer is 7.

```python
def three_sum_closest(nums, target):
    nums = sorted(nums)
    n = len(nums)
    best = nums[0] + nums[1] + nums[2]
    for i in range(n - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue                        # same first value, same pairs
        lo, hi = i + 1, n - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if abs(s - target) < abs(best - target):
                best = s
            if s < target:
                lo += 1
            elif s > target:
                hi -= 1
            else:
                return s                    # cannot get closer than exact
    return best
```

**Why it is correct:** fix `i` and suppose the sum is below the target. Pairing `nums[lo]` with any index below `hi` gives an even smaller sum, so those pairs are all further from the target than the current one. Dropping `lo` loses nothing. The symmetric argument covers moving `hi` when the sum is too big. Every pair is therefore either checked or proven no better than a pair that was checked. Skipping a repeated first value is safe because it would scan a subset of the same pairs.

**Complexity:** O(n log n) to sort plus O(n²) for the scans, so O(n²) overall. Extra space is O(n) for the sorted copy here (O(1) if you sort in place).

## Tests

```python
import random

for f in (three_sum_closest, three_sum_closest_brute):
    assert f([4, -3, 1, 9, 2], 6) == 7
    assert f([4, -3, 1, 8, 2], 6) == 6               # exact: -3 + 1 + 8
    assert f([1, 1, 1], 100) == 3                  # exactly three elements
    assert f([-5, 0, 5, 10], 0) == 0               # exact match
    assert f([0, 0, 0], 1) == 0
    assert f([-10, -7, -3, -1], -15) == -14        # all negative
    assert f([1, 2, 4, 8, 16], 3) == 7             # target below every sum
    assert f([1000, -1000, 3, 7], 9) == 7               # 1000 and -1000 cancel

def closest_dist(nums, target):
    return abs(three_sum_closest_brute(nums, target) - target)

random.seed(16)
for _ in range(500):
    nums = [random.randint(-20, 20) for _ in range(random.randint(3, 10))]
    target = random.randint(-60, 60)
    got = three_sum_closest(nums, target)
    # ties are possible in random data, so compare distances
    assert abs(got - target) == closest_dist(nums, target)
```

## Edge cases and pitfalls

- Initialise `best` with a real triple, not infinity or zero, so the first comparison is meaningful and the answer is always a sum that exists.
- Compare distances with `abs(s - target)`. Comparing sums directly picks the wrong side when the closest sum is above the target.
- Return as soon as the sum equals the target; no other sum can be closer.
- The three elements must be at different positions, but they can hold equal values. Duplicate skipping on `i` is an optimisation; do not skip duplicates in a way that forbids `[1, 1, 1]`.
- In random tests ties can happen even though the platform promises a unique answer, so compare distances, not sums.

## Where this shows up in data engineering

"Find the combination closest to a budget" appears in capacity planning, for example picking three instance sizes or batch sizes whose total is nearest a quota. More generally, sort first and then sweep with two pointers is the standard way to turn a nested search into a near-linear scan, the same reasoning behind sort-merge joins and band joins on sorted keys.

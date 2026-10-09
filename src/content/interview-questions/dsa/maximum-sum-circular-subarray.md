---
title: "Maximum Sum Circular Subarray: Kadane Plus Total Minus Minimum"
seoTitle: "Maximum Sum Circular Subarray: Kadane Twice"
description: "Find the largest subarray sum when the array wraps around. Learn why a wrapping answer equals the total minus the minimum subarray, and the all-negative trap."
technology: ["dsa"]
topic: ["dynamic-programming", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 18
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The best subarray either stays inside the array or wraps past the end. The non-wrapping case is plain Kadane. A wrapping subarray is the whole array with a middle slice removed, so its best sum is total minus the minimum subarray sum, which is Kadane with min. Answer max(max_kadane, total - min_kadane), computed in one O(n) pass with O(1) space. The trap: if every number is negative, the minimum subarray is the whole array and total - min is 0, an empty answer, so return max_kadane in that case."
followUps: ["Why is the all-negative case the only time total - min gives an empty subarray?", "How would you solve it with prefix sums and a monotonic deque instead?", "What if the circular subarray must have length at most k?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/maximum-subarray"]
practice: {"platform": "LeetCode", "number": 918, "title": "Maximum Sum Circular Subarray", "url": "https://leetcode.com/problems/maximum-sum-circular-subarray/"}
---

## Problem

You are given a list of integers `nums` arranged in a circle, so the element after the last one is the first one. Return the largest possible sum of a non-empty contiguous subarray, where a subarray may wrap around the end but may use each element at most once. This is LeetCode 918, Maximum Sum Circular Subarray.

The list has up to about 3 · 10^4 elements and values can be negative.

## Examples

```text
nums = [4, -6, 1, 3]         ->  8    (wrap: [1, 3, 4])
nums = [2, -1, 3]            ->  5    (wrap: [3, 2])
nums = [1, -5, 2, 2]         ->  5    (wrap: [2, 2, 1])
nums = [-4, -2, -7]          ->  -2   (all negative: best single element)
```

## Approach 1: brute force

Try every start and every length up to `n`, walking with modular indices.

```python
def max_circular_brute(nums):
    n = len(nums)
    best = float("-inf")
    for start in range(n):
        total = 0
        for length in range(1, n + 1):
            total += nums[(start + length - 1) % n]
            best = max(best, total)
    return best
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (Kadane for max and min)

**Key insight:** picture the circle cut open into the normal array. The best subarray is one of two shapes.

1. **No wrap:** an ordinary slice in the middle. Kadane's algorithm finds the best.
2. **Wrap:** a suffix plus a prefix. What it leaves out is a contiguous middle slice. Maximising what you keep means minimising what you leave out, so its best sum is `total - (minimum subarray sum)`.

```python
def max_circular(nums):
    total = 0
    cur_max, best_max = 0, float("-inf")
    cur_min, best_min = 0, float("inf")
    for x in nums:
        total += x
        cur_max = max(x, cur_max + x)
        best_max = max(best_max, cur_max)
        cur_min = min(x, cur_min + x)
        best_min = min(best_min, cur_min)
    if best_max < 0:                      # every element is negative
        return best_max
    return max(best_max, total - best_min)
```

On `[4, -6, 1, 3]`: the total is 2, Kadane's maximum is 4 (`[4]` or `[1, 3]`), the minimum subarray is `[-6]` with sum -6, so the wrapping candidate is 2 - (-6) = 8, which is `[1, 3, 4]`.

**Why it is correct:** every non-empty circular subarray is either a normal slice or a complement of a normal slice that is neither empty nor the whole array. Kadane covers the first shape exactly. For the second, `total - best_min` is the best complement, with one exception: when the minimum slice is the whole array, the complement is empty and the formula gives 0. If any element is non-negative, `best_max ≥ 0`, so that bogus 0 can at most tie with a real answer and never wins. If every element is negative, `best_max` is negative and the guard returns it before the formula is used.

**Complexity:** O(n) time, O(1) extra space.

## Tests

```python
import random

for f in (max_circular, max_circular_brute):
    assert f([4, -6, 1, 3]) == 8
    assert f([2, -1, 3]) == 5
    assert f([1, -5, 2, 2]) == 5
    assert f([-4, -2, -7]) == -2             # all negative
    assert f([7]) == 7                       # single element
    assert f([-3]) == -3
    assert f([5, 5, 5]) == 15                # whole array, no double counting
    assert f([0, -1, 0]) == 0                # zeros next to negatives

random.seed(13)
for _ in range(1000):
    arr = [random.randint(-9, 9) for _ in range(random.randint(1, 9))]
    assert max_circular(arr) == max_circular_brute(arr)
```

## Edge cases and pitfalls

- **All negative.** `total - best_min` is 0 there, which corresponds to choosing nothing. Return the Kadane maximum instead.
- **No double counting.** Concatenating the array to itself and running Kadane lets a subarray longer than `n`, so it overcounts `[5, 5, 5]` unless you also cap the length.
- Track `best_max` and `best_min` separately from the running values; the final running value is not the best one.
- Zeros count as non-negative, so `[0, -1, 0]` does not hit the all-negative guard and correctly returns 0.

## Where this shows up in data engineering

Circular data is common: hours of the day, days of the week, ring buffers and time windows that cross midnight. Finding the busiest stretch of hours when the peak runs from 22:00 to 03:00 is exactly this problem, and the "total minus the worst middle part" trick avoids duplicating the data to handle the wrap.

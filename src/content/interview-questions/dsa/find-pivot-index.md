---
title: "Find Pivot Index: Balance Left and Right Prefix Sums"
description: "Find the leftmost index where the sum to its left equals the sum to its right. Learn the running prefix sum that replaces an O(n²) rescan with one O(n) pass."
technology: ["dsa"]
topic: ["prefix-sum", "arrays"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Compute the total once. Walk left to right keeping left, the sum of everything before the current index. The right side is then total - left - nums[i], so index i is a pivot when left == total - left - nums[i]. Return the first such index, or -1. Add nums[i] to left only after the check. This is O(n) time and O(1) extra space, versus O(n²) if you re-add both sides at every index."
followUps: ["How would you return every pivot index instead of the first?", "How does the answer change if the array can be updated between queries?", "Can you split the array into three parts with equal sums using the same idea?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 724, "title": "Find Pivot Index", "url": "https://leetcode.com/problems/find-pivot-index/"}
previous: "interview-questions:dsa/majority-element"
next: "interview-questions:dsa/product-of-array-except-self"
---

## Problem

You are given a list of integers `nums`. A pivot index is a position `i` where the sum of all elements strictly to the left of `i` equals the sum of all elements strictly to the right of `i`. The element at `i` itself belongs to neither side, and an empty side sums to 0. Return the leftmost pivot index, or -1 if there is none. This is LeetCode 724, Find Pivot Index.

The list has between 1 and about 10^4 elements, and values can be negative.

## Examples

```text
nums = [2, 3, -1, 8, 4]     ->  3    (2 + 3 - 1 = 4 on the left, 4 on the right)
nums = [5, -5, 7]           ->  2    (5 - 5 = 0 on the left, nothing on the right)
nums = [1, 2, 3]            ->  -1   (no index balances)
nums = [0, 0]               ->  0    (the leftmost of two valid answers)
```

## Approach 1: brute force

For every index, add up both sides from scratch.

```python
def pivot_index_brute(nums):
    for i in range(len(nums)):
        if sum(nums[:i]) == sum(nums[i + 1:]):
            return i
    return -1
```

**Complexity:** O(n²) time, because each index re-sums the whole array. O(n) extra space for the slices (O(1) with index loops).

## Approach 2: optimal (running prefix sum)

**Key insight:** the two sides always add up to `total - nums[i]`. If you know the left sum, you know the right sum without looking at it. Keep the left sum as a running total while you walk.

Walkthrough on `nums = [2, 3, -1, 8, 4]`, `total = 16`:

| i | nums[i] | left | right = total - left - nums[i] | pivot? |
|---|---|---|---|---|
| 0 | 2 | 0 | 14 | no |
| 1 | 3 | 2 | 11 | no |
| 2 | -1 | 5 | 12 | no |
| 3 | 8 | 4 | 4 | yes, return 3 |

```python
def pivot_index(nums):
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:
            return i
        left += x
    return -1
```

**Why it is correct:** before the check at index `i`, `left` holds exactly `nums[0] + ... + nums[i-1]`, so `total - left - x` is exactly the sum of `nums[i+1:]`. The comparison is the definition of a pivot, and scanning from the left returns the first one.

**Complexity:** O(n) time (two passes: one for the total, one for the scan), O(1) extra space.

## Tests

```python
import random

for f in (pivot_index, pivot_index_brute):
    assert f([2, 3, -1, 8, 4]) == 3
    assert f([5, -5, 7]) == 2               # pivot at the last index
    assert f([7, 3, -3]) == 0               # pivot at index 0: right side sums to 0
    assert f([1, 2, 3]) == -1               # no pivot
    assert f([0, 0]) == 0                   # leftmost of several answers
    assert f([42]) == 0                     # single element: both sides empty
    assert f([-1, -1, -1, 0, 1, 1]) == 0    # negatives
    assert f([]) == -1                      # defensive

random.seed(7)
for _ in range(500):
    arr = [random.randint(-5, 5) for _ in range(random.randint(1, 9))]
    assert pivot_index(arr) == pivot_index_brute(arr)
```

## Edge cases and pitfalls

- Add `nums[i]` to `left` **after** the comparison. Adding it first counts the pivot on the left side.
- The pivot can be index 0 or the last index; an empty side counts as 0, not as "no answer".
- Do not stop at the first index where the left sum passes half the total. With negative numbers the sums are not monotonic, so you must check every index.
- When several indices qualify, the problem wants the leftmost, which a left-to-right scan gives for free.

## Where this shows up in data engineering

Running totals are the same calculation as `SUM(...) OVER (ORDER BY ...)` in SQL, and "total minus running total" gives the remaining amount without a second scan. Finding a balance point like this appears when splitting a sorted workload into two partitions of roughly equal weight.

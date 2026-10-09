---
title: "4Sum: Two Fixed Indices, Two Pointers and Careful Duplicate Skipping"
seoTitle: "4Sum: Sort, Two Loops and Two Pointers"
description: "Return every unique set of four values that sums to a target. Sort, fix two indices, scan the rest with two pointers and skip duplicates: O(n³) time."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the array. Fix the first index i and the second index j > i, then find the remaining pair in nums[j + 1:] with two pointers: move lo right when the sum is too small, hi left when it is too big, and record the quadruplet when it matches. Uniqueness comes from skipping repeated values at every level: for i, for j, and for lo and hi after each match. This is O(n³) time and O(1) extra space besides the output. The common bugs are skipping duplicates for j relative to the wrong start, and not skipping both pointers after a match."
followUps: ["How would you write a general k-sum that recurses down to two-sum?", "What pruning can you add using the smallest and largest possible sums at each level?", "When would a hash map of pair sums be a better choice, and what does it cost?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers", "interview-questions:dsa/3sum"]
practice: {"platform": "LeetCode", "number": 18, "title": "4Sum", "url": "https://leetcode.com/problems/4sum/"}
previous: "interview-questions:dsa/subarray-product-less-than-k"
next: "interview-questions:dsa/shortest-unsorted-continuous-subarray"
---

## Problem

You are given a list of integers `nums` and an integer `target`. Return every distinct quadruplet of values `[a, b, c, d]`, taken from four different positions, with `a + b + c + d == target`. Two quadruplets are the same if they contain the same values with the same multiplicities, regardless of order. The output order does not matter. This is LeetCode 18, 4Sum.

## Examples

```text
nums = [2, -1, 0, 1, -2, 2],    target = 0   ->  [[-2, -1, 1, 2]]
nums = [5, -5, 0, 0, 5, -5],    target = 0   ->  [[-5, -5, 5, 5], [-5, 0, 0, 5]]
nums = [3, 3, 3, 3, 3],         target = 12  ->  [[3, 3, 3, 3]]
nums = [1, 2, 3],               target = 6   ->  []    (fewer than four values)
```

## Approach 1: brute force

Try every choice of four positions and keep the sorted value tuples in a set.

```python
from itertools import combinations

def four_sum_brute(nums, target):
    found = set()
    for combo in combinations(nums, 4):
        if sum(combo) == target:
            found.add(tuple(sorted(combo)))
    return [list(q) for q in sorted(found)]
```

**Complexity:** O(n⁴) time, plus the set of results. Correct, and a good reference for testing, but too slow beyond about a hundred elements.

## Approach 2: optimal (sort + two loops + two pointers)

**Idea in plain English:** 4Sum is 3Sum with one more fixed value, and 3Sum is two-sum on a sorted range with one fixed value. After sorting, choose the smallest value with index `i` and the second smallest with `j`. The other two must sum to `target − nums[i] − nums[j]` and come from the range after `j`, which two pointers search in linear time. To avoid repeats, never start a level with the same value it just used.

Walkthrough on sorted `[-5, -5, 0, 0, 5, 5]`, `target = 0`:

| i | j | lo, hi values | sum | result |
|---|---|---|---|---|
| -5 | -5 | 0, 5 | -5 | lo right |
| -5 | -5 | 0, 5 | -5 | lo right |
| -5 | -5 | 5, 5 | 0 | record [-5, -5, 5, 5] |
| -5 | 0 | 0, 5 | 0 | record [-5, 0, 0, 5] |
| -5 (second) | | | | skipped: same value as before |

```python
def four_sum(nums, target):
    nums = sorted(nums)
    n = len(nums)
    result = []
    for i in range(n - 3):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        for j in range(i + 1, n - 2):
            if j > i + 1 and nums[j] == nums[j - 1]:
                continue
            lo, hi = j + 1, n - 1
            need = target - nums[i] - nums[j]
            while lo < hi:
                pair = nums[lo] + nums[hi]
                if pair < need:
                    lo += 1
                elif pair > need:
                    hi -= 1
                else:
                    result.append([nums[i], nums[j], nums[lo], nums[hi]])
                    lo += 1
                    hi -= 1
                    while lo < hi and nums[lo] == nums[lo - 1]:
                        lo += 1
                    while lo < hi and nums[hi] == nums[hi + 1]:
                        hi -= 1
    return result
```

**Why it is correct:** every answer, written in sorted order, has a first value, a second value and a remaining pair. The outer loops visit the first occurrence of each possible first value and, for each, the first occurrence of each possible second value after it. Using the first occurrence keeps the most elements available to the right, so no answer is lost. The two-pointer scan finds every pair with the needed sum in a sorted range (moving a pointer only discards pairs that are too small or too large), and skipping equal values after a match prevents the same pair twice.

**Complexity:** O(n log n) to sort plus O(n³) for the nested scans, so O(n³). Extra space is O(1) besides the sorted copy and the output.

## Tests

```python
import random

def norm(quads):
    return sorted(tuple(q) for q in quads)

for f in (four_sum, four_sum_brute):
    assert norm(f([2, -1, 0, 1, -2, 2], 0)) == [(-2, -1, 1, 2)]
    assert norm(f([5, -5, 0, 0, 5, -5], 0)) == [(-5, -5, 5, 5), (-5, 0, 0, 5)]
    assert norm(f([3, 3, 3, 3, 3], 12)) == [(3, 3, 3, 3)]     # one answer, not five
    assert f([1, 2, 3], 6) == []                              # too short
    assert f([], 0) == []
    assert norm(f([0, 0, 0, 0], 0)) == [(0, 0, 0, 0)]
    assert norm(f([10**9] * 4, 4 * 10**9)) == [(10**9,) * 4]  # large values

random.seed(18)
for _ in range(300):
    nums = [random.randint(-4, 4) for _ in range(random.randint(0, 10))]
    target = random.randint(-6, 6)
    got = four_sum(nums, target)
    assert len(got) == len(set(map(tuple, got)))              # no duplicates
    assert norm(got) == norm(four_sum_brute(nums, target))
```

## Edge cases and pitfalls

- For the second loop, skip a repeat only when `j > i + 1`. Writing `j > 0` skips the case where `nums[j]` legitimately equals `nums[i]`, losing answers like `[-5, -5, 5, 5]`.
- After recording a match, move both pointers and skip equal values on both sides, or the same pair is reported again.
- Lists shorter than four return an empty result; `range(n - 3)` is empty then, so no special case is needed.
- In languages with 32-bit integers, `nums[i] + nums[j] + ...` can overflow with values near a billion; use 64-bit sums. Python does not overflow.
- A hash map of pair sums can reach O(n²) average time for existence checks, but producing unique quadruplets with distinct indices from it is fiddly and needs O(n²) memory. The two-pointer version is the expected answer.

## Where this shows up in data engineering

The pattern of fixing outer values and scanning the rest with two pointers is the same idea as a nested sort-merge join: sort once, then each inner search is a linear sweep instead of a full scan. Deduplicating by skipping equal neighbours in sorted data is also how you remove duplicate result rows cheaply after an `ORDER BY`.

---
title: "Maximum Absolute Sum of Any Subarray: Run Kadane for Max and Min"
seoTitle: "Maximum Absolute Subarray Sum: Kadane Max and Min"
description: "Find the largest absolute value of any subarray sum. Learn to run Kadane for the maximum and the minimum together, and the neat prefix-sum range shortcut."
technology: ["dsa"]
topic: ["dynamic-programming", "prefix-sum"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The largest absolute sum is either the largest subarray sum or the negation of the smallest one. Run Kadane twice in the same loop: hi = max(x, hi + x) and lo = min(x, lo + x), tracking the best of hi and -lo. O(n) time, O(1) space. A shorter view: every subarray sum is a difference of two prefix sums, so the answer is max(prefix) - min(prefix) over all prefixes including the empty one (0). The empty subarray is allowed, so the answer is never below 0."
followUps: ["Why does max prefix minus min prefix work even when the max comes before the min?", "How would you return the subarray itself?", "How would you answer this for every sliding window of length k?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/maximum-subarray"]
practice: {"platform": "LeetCode", "number": 1749, "title": "Maximum Absolute Sum of Any Subarray", "url": "https://leetcode.com/problems/maximum-absolute-sum-of-any-subarray/"}
previous: "interview-questions:dsa/maximum-subarray-sum-with-one-deletion"
next: "interview-questions:dsa/maximum-sum-circular-subarray"
---

## Problem

You are given a list of integers `nums`. For any contiguous subarray, take the absolute value of its sum. Return the largest such value. The subarray may be empty, whose sum is 0. This is LeetCode 1749, Maximum Absolute Sum of Any Subarray.

The list has up to about 10^5 elements, with values roughly between -10^4 and 10^4.

## Examples

```text
nums = [2, -3, -4, 1]       ->  7    ([-3, -4] sums to -7)
nums = [3, -1, 4]           ->  6    (the whole array)
nums = [5]                  ->  5
nums = [1, -1, 1, -1]       ->  1
```

## Approach 1: brute force

Try every start and extend the end with a running sum.

```python
def max_abs_sum_brute(nums):
    best = 0                                # the empty subarray
    for i in range(len(nums)):
        total = 0
        for j in range(i, len(nums)):
            total += nums[j]
            best = max(best, abs(total))
    return best
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (Kadane for maximum and minimum)

**Key insight:** `|s|` is large either because `s` is very positive or very negative. Kadane's algorithm finds the largest subarray sum; the same rule with `min` finds the smallest. Run both at once and take the larger magnitude.

```python
def max_abs_sum(nums):
    hi = lo = 0                  # best sums ending here (empty allowed)
    best = 0
    for x in nums:
        hi = max(x, hi + x)
        lo = min(x, lo + x)
        best = max(best, hi, -lo)
    return best
```

Walkthrough on `[2, -3, -4, 1]`:

| x | hi | lo | best |
|---|---|---|---|
| 2 | 2 | 2 | 2 |
| -3 | -1 | -3 | 3 |
| -4 | -4 | -7 | 7 |
| 1 | 1 | -6 | 7 |

**Why it is correct:** for each end index, `hi` is the largest and `lo` the smallest sum of a non-empty subarray ending there (Kadane's invariant: either extend the best one ending just before, or start fresh). The overall maximum and minimum are among these values, and the answer is `max(max_sum, -min_sum, 0)`.

**Complexity:** O(n) time, O(1) extra space.

## Approach 3: prefix-sum range

Every subarray sum is `P[j] - P[i]` for two prefix sums, and taking the absolute value means the order of `i` and `j` no longer matters. So the answer is simply the spread of the prefix sums, including the empty prefix 0.

```python
from itertools import accumulate

def max_abs_sum_prefix(nums):
    prefixes = [0, *accumulate(nums)]
    return max(prefixes) - min(prefixes)
```

This is O(n) time; it uses O(n) space as written, or O(1) if you track the running max and min instead of building the list.

## Tests

```python
import random

for f in (max_abs_sum, max_abs_sum_prefix, max_abs_sum_brute):
    assert f([2, -3, -4, 1]) == 7
    assert f([3, -1, 4]) == 6
    assert f([5]) == 5
    assert f([-5]) == 5                      # negative single element
    assert f([1, -1, 1, -1]) == 1
    assert f([0, 0]) == 0
    assert f([]) == 0                        # empty input: empty subarray

random.seed(12)
for _ in range(500):
    arr = [random.randint(-10, 10) for _ in range(random.randint(1, 10))]
    assert max_abs_sum(arr) == max_abs_sum_prefix(arr) == max_abs_sum_brute(arr)
```

## Edge cases and pitfalls

- Running Kadane on `abs(x)` is wrong: it treats every element as positive and returns the sum of magnitudes.
- Remember the minimum side. Only tracking the maximum misses answers like `[-3, -4]`.
- Include the empty prefix (0) in the prefix-sum version, otherwise a subarray starting at index 0 can be missed.
- In fixed-width languages, check the range of the sum; here it stays within about 10^9, which fits a 32-bit integer.

## Where this shows up in data engineering

The spread between the highest and lowest running total is the largest swing in a balance, inventory level or queue backlog over a period, which is a common monitoring metric. In SQL it is `MAX(running) - MIN(running)` over a `SUM(...) OVER (ORDER BY ts)` column, with a zero starting row added.

---
title: "Minimum Size Subarray Sum: Grow Until Valid, Then Shrink"
seoTitle: "Minimum Size Subarray Sum: Shrinking Window"
description: "Find the shortest contiguous slice of positive numbers whose sum reaches a target. Expand right, shrink from the left while valid: O(n) time, O(1) space."
technology: ["dsa"]
topic: ["sliding-window", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "With positive values, a longer window always has a larger sum, so the window can be managed with two forward-only pointers. Add nums[right] to a running sum. While the sum is at least the target, record the window length, subtract nums[left] and move left forward. Return the smallest length recorded, or 0 if none. Each element enters and leaves once, so this is O(n) time and O(1) space. An O(n log n) alternative uses prefix sums and binary search. The pitfall is using if instead of while for the shrink step, which leaves windows longer than necessary."
followUps: ["How does the prefix-sum and binary-search version work, and when would you use it?", "What breaks if the array can contain negative numbers, and what would you use instead?", "How would you return the slice itself as well as its length?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window"]
practice: {"platform": "LeetCode", "number": 209, "title": "Minimum Size Subarray Sum", "url": "https://leetcode.com/problems/minimum-size-subarray-sum/"}
---

## Problem

You are given a positive integer `target` and a list of positive integers `nums`. Return the length of the shortest contiguous, non-empty slice whose sum is at least `target`. If no slice reaches the target, return 0. This is LeetCode 209, Minimum Size Subarray Sum.

## Examples

```text
target = 9,   nums = [2, 1, 5, 2, 4, 3]   ->  3    ([5, 2, 4] or [2, 4, 3])
target = 6,   nums = [1, 6, 1]            ->  1    ([6])
target = 20,  nums = [3, 4, 5]            ->  0    (total is only 12)
target = 3,   nums = [1, 1, 1]            ->  3    (the whole list)
```

## Approach 1: brute force

For each start, extend to the right until the sum reaches the target; the first such end gives the shortest slice from that start.

```python
def min_subarray_len_brute(target, nums):
    best = 0
    for start in range(len(nums)):
        total = 0
        for end in range(start, len(nums)):
            total += nums[end]
            if total >= target:
                length = end - start + 1
                if best == 0 or length < best:
                    best = length
                break
    return best
```

**Complexity:** O(n²) time, O(1) space.

## Approach 2: optimal (variable-size sliding window)

**Idea in plain English:** keep a window `[left, right]` and its sum. Grow it by moving `right`. As soon as the sum reaches the target, the window is valid, so try to make it shorter: drop elements from the left one at a time, recording the length each time, until the sum falls below the target again. Then keep growing. Because all values are positive, a start that was dropped can never be useful again: any later window starting there would be longer than one already found.

Walkthrough on `[2, 1, 5, 2, 4, 3]`, `target = 9`:

| right | add | sum | shrink steps | best |
|---|---|---|---|---|
| 0 | 2 | 2 | | none |
| 1 | 1 | 3 | | none |
| 2 | 5 | 8 | | none |
| 3 | 2 | 10 | record 4, drop 2 -> 8 | 4 |
| 4 | 4 | 12 | record 4, drop 1 -> 11; record 3, drop 5 -> 6 | 3 |
| 5 | 3 | 9 | record 3, drop 2 -> 7 | 3 |

```python
def min_subarray_len(target, nums):
    best = 0
    left = 0
    total = 0
    for right, value in enumerate(nums):
        total += value
        while total >= target:
            length = right - left + 1
            if best == 0 or length < best:
                best = length
            total -= nums[left]
            left += 1
    return best
```

**Why it is correct:** for each right end, the inner loop finds the largest start that still reaches the target and records that shortest window ending at `right`. The start never needs to move backwards: if a window `[left, right]` is valid, then for any later right end, starting at `left` or earlier gives a window at least as long as one already recorded. So the minimum over all right ends is the overall minimum.

**Complexity:** O(n) time, since `left` and `right` each move at most n times, and O(1) extra space.

### Alternative: prefix sums and binary search

Build prefix sums `p` with `p[0] = 0`. For each start `i`, binary search for the first `j` with `p[j] - p[i] >= target`. Prefix sums are increasing because the values are positive, so `bisect` applies. This is O(n log n) and is worth knowing because it generalises to queries with many targets.

```python
from bisect import bisect_left
from itertools import accumulate

def min_subarray_len_bisect(target, nums):
    p = [0] + list(accumulate(nums))
    best = 0
    for i in range(len(nums)):
        j = bisect_left(p, p[i] + target)
        if j < len(p):
            length = j - i
            if best == 0 or length < best:
                best = length
    return best
```

## Tests

```python
import random

for f in (min_subarray_len, min_subarray_len_brute, min_subarray_len_bisect):
    assert f(9, [2, 1, 5, 2, 4, 3]) == 3
    assert f(6, [1, 6, 1]) == 1              # one element suffices
    assert f(20, [3, 4, 5]) == 0             # impossible
    assert f(3, [1, 1, 1]) == 3              # whole list
    assert f(1, [5]) == 1
    assert f(5, []) == 0                     # empty
    assert f(7, [2, 3, 1, 2, 4, 3]) == 2     # [4, 3]

random.seed(209)
for _ in range(500):
    nums = [random.randint(1, 9) for _ in range(random.randint(0, 12))]
    target = random.randint(1, 40)
    expected = min_subarray_len_brute(target, nums)
    assert min_subarray_len(target, nums) == expected
    assert min_subarray_len_bisect(target, nums) == expected
```

## Edge cases and pitfalls

- Shrink with `while`, not `if`. One added element can allow several elements to be dropped from the left.
- Return 0, not infinity or n + 1, when no window reaches the target; initialise carefully and convert at the end if you use a sentinel.
- The condition is "at least" the target. Using strictly greater misses windows that hit it exactly.
- The sliding window and the binary search both rely on positive values. With negatives, use prefix sums with a monotonic deque instead.

## Where this shows up in data engineering

"The shortest run of consecutive records that reaches a threshold" is a common monitoring question, for example the fewest consecutive minutes in which traffic passed a quota, or the smallest batch of files that fills a target block size. The grow-then-shrink window answers it in one streaming pass with constant memory.

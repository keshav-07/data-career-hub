---
title: "Next Greater Element II: Monotonic Stack Over a Circular Array"
seoTitle: "Next Greater Element II: Circular Monotonic Stack"
description: "For each value in a circular array, find the first larger value going forward and wrapping around. Walk the array twice with a stack of indices in O(n)."
technology: ["dsa"]
topic: ["stack", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Use a stack of indices whose values are still waiting for a greater element, kept in decreasing order of value. Loop i from 0 to 2n - 1 and read nums[i % n], so every element also sees the elements before it after the wrap. While the current value is greater than the value at the top index, pop and record the answer. Push indices only during the first pass. Anything left at the end has no greater element and keeps -1. Each index is pushed and popped once: O(n) time, O(n) space. Use indices rather than values, because values can repeat."
followUps: ["Why is two passes enough to see every element after a given one?", "How would you return the distance to the next greater element instead of its value?", "How would you find the previous greater element in a circular array?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks", "interview-questions:dsa/next-greater-element-i", "interview-questions:dsa/daily-temperatures"]
practice: {"platform": "LeetCode", "number": 503, "title": "Next Greater Element II", "url": "https://leetcode.com/problems/next-greater-element-ii/"}
---

## Problem

You are given a list of integers `nums` that should be treated as circular: after the last element comes the first one again. For each position, return the first value strictly greater than it when you move forward from that position, wrapping around if needed. If no such value exists, return -1 for that position. Values can repeat. This is LeetCode 503, Next Greater Element II.

Lengths go up to around 10,000, so O(n²) is slow but workable for testing; the expected answer is O(n).

## Examples

```text
[3, 8, 4, 1]       ->  [8, -1, 8, 3]     (1 wraps round to 3; 4 wraps round to 8)
[5, 5, 5]          ->  [-1, -1, -1]      (equal is not greater)
[2, 9, 2, 7, 9]    ->  [9, -1, 7, 9, -1]
[6]                ->  [-1]
```

## Approach 1: brute force

For each index, look at the next `n - 1` positions in circular order and stop at the first larger value.

```python
def next_greater_circular_brute(nums):
    n = len(nums)
    out = [-1] * n
    for i in range(n):
        for step in range(1, n):
            v = nums[(i + step) % n]
            if v > nums[i]:
                out[i] = v
                break
    return out
```

**Complexity:** O(n²) time, O(1) extra space besides the output.

## Approach 2: optimal (monotonic stack, two passes)

**Idea.** In the non-circular version, you scan once with a stack of indices still waiting for a greater value; each new value answers every smaller value on top of the stack. The only change for a circular array is that an element near the end may find its answer near the start. So scan the array twice. During the second lap you only resolve waiting indices; you do not push new ones, because every index was already pushed in the first lap.

Walkthrough on `[3, 8, 4, 1]` (values shown on the stack for readability):

| i | value | Popped (answer) | Stack after |
|---|---|---|---|
| 0 | 3 | | 3 |
| 1 | 8 | 3 → 8 | 8 |
| 2 | 4 | | 8 4 |
| 3 | 1 | | 8 4 1 |
| 4 (wrap) | 3 | 1 → 3 | 8 4 |
| 5 (wrap) | 8 | 4 → 8 | 8 |
| 6, 7 | 4, 1 | | 8 |

The 8 stays on the stack, so its answer is -1.

```python
def next_greater_circular(nums):
    n = len(nums)
    out = [-1] * n
    stack = []                         # indices, values strictly decreasing from bottom to top
    for i in range(2 * n):
        v = nums[i % n]
        while stack and nums[stack[-1]] < v:
            out[stack.pop()] = v
        if i < n:
            stack.append(i)
    return out
```

**Why it is correct.** An index waits on the stack until the first larger value arrives after it, and the stack's decreasing order means the first larger value pops it immediately. In circular order, the elements after index `i` are positions `i+1, ..., n-1, 0, ..., i-1`, which all appear in the scan before position `i + n`. So if a greater element exists anywhere, the scan reaches it within the two laps. If none exists, the index is never popped and its answer stays -1.

**Complexity:** each index is pushed once and popped at most once, and the outer loop runs 2n times, so O(n) time; O(n) space for the stack and output.

## Tests

```python
import random

for f in (next_greater_circular, next_greater_circular_brute):
    assert f([3, 8, 4, 1]) == [8, -1, 8, 3]
    assert f([5, 5, 5]) == [-1, -1, -1]
    assert f([2, 9, 2, 7, 9]) == [9, -1, 7, 9, -1]
    assert f([6]) == [-1]
    assert f([]) == []
    assert f([1, 2, 3, 4]) == [2, 3, 4, -1]
    assert f([4, 3, 2, 1]) == [-1, 4, 4, 4]           # every answer wraps
    assert f([-3, -1, -2]) == [-1, -1, -1]           # here -1 is a real value: it answers -3 and -2
    assert f([1, 5, 1, 5]) == [5, -1, 5, -1]          # duplicates need indices, not values

random.seed(503)
for _ in range(1000):
    nums = [random.randint(-3, 3) for _ in range(random.randint(0, 9))]
    assert next_greater_circular(nums) == next_greater_circular_brute(nums), nums

big = list(range(10_000, 0, -1))
assert next_greater_circular(big) == [-1] + [10_000] * 9_999
```

## Edge cases and pitfalls

- **Push only in the first lap.** Pushing during the second lap as well still gives the right answers here, but it doubles the stack work and hides what the second lap is for.
- **Strictly greater.** Use `<` when popping, so equal values do not answer each other; `[5, 5, 5]` must give all -1.
- **Store indices, not values.** With duplicates, a dictionary keyed by value (as in Next Greater Element I) overwrites answers.
- **The maximum never gets an answer.** Every copy of the maximum value stays on the stack and keeps -1, which is why initialising the output to -1 matters.
- **Empty input** should return an empty list; the loop simply does not run.

## Where this shows up in data engineering

Circular order appears with cyclical keys: hours of the day, days of the week, or ring-shaped hash spaces used for consistent hashing. "The next slot after this one with a higher value, wrapping round" is this problem, for example the next hour with more capacity than the current one. Doubling the range with a modulo index is the standard way to handle the wrap without copying the data.

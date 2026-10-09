---
title: "132 Pattern: Find a Low, High, Middle Subsequence in One Pass"
seoTitle: "132 Pattern: Monotonic Stack From the Right"
description: "Decide whether an array has a low, high, middle subsequence. Go from O(n^3) to O(n^2) with a prefix minimum, then O(n) with a stack scanned from the right."
technology: ["dsa"]
topic: ["stack", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Scan from right to left with a decreasing stack, and track 'third': the largest value seen so far that has a bigger value to its left, which makes it a valid '2' for the '3' that popped it. When a new value is larger than the stack top, pop and update third with each popped value; the new value is the '3'. If any value is smaller than third, it is the '1' and the pattern exists. Each value is pushed and popped once, so O(n) time and O(n) space. A simpler O(n^2) answer fixes the '3' and uses the prefix minimum as the '1'."
followUps: ["Why is it enough to keep only the largest valid '2'?", "Can you solve it in O(n log n) with a sorted structure instead of a stack?", "How would you return the three indices rather than True or False?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks"]
practice: {"platform": "LeetCode", "number": 456, "title": "132 Pattern", "url": "https://leetcode.com/problems/132-pattern/"}
previous: "interview-questions:dsa/remove-k-digits"
next: "interview-questions:dsa/largest-rectangle-in-histogram"
---

## Problem

Given a list of integers `nums`, return `True` if there are indices `i < j < k` with `nums[i] < nums[k] < nums[j]`, and `False` otherwise. The name comes from the shape: the first value is the lowest ("1"), the second the highest ("3"), and the third sits between them ("2"). This is LeetCode 456, 132 Pattern.

Lengths go up to around 200,000 and values can be negative, so only an O(n) or O(n log n) solution is fast enough at full size.

## Examples

```text
[1, 2, 3, 4]        ->  False   (only increasing)
[3, 1, 4, 2]        ->  True    (1, 4, 2)
[-1, 3, 2, 0]       ->  True    (-1, 3, 2) and others
[1, 0, 1, -4, -3]   ->  False
[2, 4, 2]           ->  False   (the "2" must be strictly greater than the "1")
```

## Approach 1: brute force

Try every triple of indices.

```python
def find132_brute(nums):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                if nums[i] < nums[k] < nums[j]:
                    return True
    return False
```

**Complexity:** O(n³) time, O(1) space.

## Approach 2: fix the middle, use the prefix minimum

For a fixed "3" at index `j`, the best "1" is the smallest value before `j`, because a smaller "1" only widens the gap for the "2". So keep a running minimum and, for each `j`, look for any `k > j` with `low < nums[k] < nums[j]`.

```python
def find132_quadratic(nums):
    low = float("inf")
    for j in range(len(nums)):
        low = min(low, nums[j])
        for k in range(j + 1, len(nums)):
            if low < nums[k] < nums[j]:
                return True
    return False
```

**Complexity:** O(n²) time, O(1) space. This is a good stepping stone to say out loud before the stack version.

## Approach 3: optimal (monotonic stack from the right)

**Idea.** Walk from right to left and think of the current value as a candidate "1". Keep `third`, the largest value found so far that has a larger value to its left among the elements already scanned; that pair is a ready-made "3, 2". If the current value is smaller than `third`, it completes the pattern.

To maintain `third`, keep a stack of values seen so far in decreasing order from bottom to top. When the current value is larger than the top, that top value has found a larger value to its left (the current one), so it becomes a valid "2": pop it and set `third` to it. The values pop in increasing order, so `third` ends at the largest one less than the current value. Then push the current value, which can act as a "3" for later pops.

Walkthrough on `[3, 1, 4, 2]` (right to left):

| Value | Check `value < third` | Pops | `third` | Stack after |
|---|---|---|---|---|
| 2 | 2 < -inf? no | | -inf | 2 |
| 4 | 4 < -inf? no | 2 | 2 | 4 |
| 1 | 1 < 2? yes | | | pattern found |

```python
def find132(nums):
    third = float("-inf")
    stack = []
    for v in reversed(nums):
        if v < third:
            return True
        while stack and stack[-1] < v:
            third = stack.pop()
        stack.append(v)
    return False
```

**Why it is correct.** Whenever `third` holds a value, it was popped by a strictly larger value to its left, so a "3, 2" pair exists to the right of the current position, and any smaller value completes it. Conversely, suppose a pattern `i < j < k` exists. When the scan reaches `j`, either `nums[k]` has already been popped (by a larger value between `j` and `k`, so `third ≥ nums[k]`), or it is still on the stack and `nums[j] > nums[k]` pops it now. Either way `third ≥ nums[k] > nums[i]` before the scan reaches `i`, and `third` never decreases, so the check fires.

**Complexity:** every value is pushed and popped at most once, so O(n) time; the stack uses O(n) space.

## Tests

```python
import random

cases = [([1, 2, 3, 4], False), ([3, 1, 4, 2], True), ([-1, 3, 2, 0], True),
         ([1, 0, 1, -4, -3], False), ([2, 4, 2], False), ([], False), ([1], False),
         ([1, 2], False), ([3, 5, 0, 3, 4], True), ([1, 3, 2], True), ([5, 5, 5, 5], False)]
for nums, expected in cases:
    for f in (find132, find132_quadratic, find132_brute):
        assert f(nums) == expected, (f.__name__, nums)

random.seed(456)
for _ in range(1500):
    nums = [random.randint(-4, 4) for _ in range(random.randint(0, 9))]
    want = find132_brute(nums)
    assert find132(nums) == want, nums
    assert find132_quadratic(nums) == want, nums

assert find132(list(range(200_000))) is False
assert find132(list(range(100_000)) + [50_000, 99_998]) is True
```

## Edge cases and pitfalls

- **Strict inequalities.** `[2, 4, 2]` is not a pattern; compare with `<`, and pop only while the top is strictly smaller than the current value.
- **Starting value of `third`.** Use negative infinity, not 0 or -1, because values can be negative.
- **Scanning direction.** The left-to-right version needs the prefix minimum alongside each stack entry; the right-to-left version above is shorter and easier to get right.
- **Fewer than three elements** can never form a pattern; the code returns `False` without special cases.

## Where this shows up in data engineering

The "1, 3, 2" shape is a dip, a spike and a partial recovery in an ordered series, which is the kind of question you may ask of metric or price data: did the value ever rise above a level and then fall back between the earlier low and that peak? More generally, the technique of scanning from the end while keeping a stack plus one summary value is a reusable way to answer "does some earlier, later pair exist" questions in a single pass.

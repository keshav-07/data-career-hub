---
title: "Max Consecutive Ones III: Longest Window With at Most K Zeros"
seoTitle: "Max Consecutive Ones III: At Most K Zeros"
description: "Find the longest run of 1s you can make by flipping at most k zeros. It is the longest window holding at most k zeros, found by a sliding window in O(n)."
technology: ["dsa"]
topic: ["sliding-window", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Flipping at most k zeros to make the longest block of 1s is the same as finding the longest contiguous window that contains at most k zeros, since you would flip exactly the zeros inside it. Move a right pointer, counting zeros that enter the window. While the count exceeds k, move the left pointer forward, decrementing the count when a zero leaves. Record the window length after each step. This is O(n) time and O(1) space. Do not actually flip values; only count them."
followUps: ["How would you handle a stream where k is fixed but the array is too large to store?", "Can you write it so the window never shrinks?", "What changes if each flip has a different cost and you have a budget?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window"]
practice: {"platform": "LeetCode", "number": 1004, "title": "Max Consecutive Ones III", "url": "https://leetcode.com/problems/max-consecutive-ones-iii/"}
---

## Problem

You are given a list `nums` containing only 0s and 1s and an integer `k` (at least 0). You may change at most `k` of the zeros into ones. Return the length of the longest contiguous block of ones you can end up with. This is LeetCode 1004, Max Consecutive Ones III.

## Examples

```text
nums = [1, 0, 1, 1, 0, 0, 1, 1, 1, 0],  k = 2   ->  7   (flip the zeros at indices 4 and 5)
nums = [1, 1, 0, 1],                    k = 1   ->  4   (flip the single zero)
nums = [0, 0, 0],                       k = 0   ->  0   (no flips allowed)
nums = [0, 0, 0],                       k = 5   ->  3   (k larger than needed)
```

## Approach 1: brute force

From every start, extend right while the number of zeros stays within `k`.

```python
def longest_ones_brute(nums, k):
    best = 0
    for start in range(len(nums)):
        zeros = 0
        for end in range(start, len(nums)):
            if nums[end] == 0:
                zeros += 1
            if zeros > k:
                break
            best = max(best, end - start + 1)
    return best
```

**Complexity:** O(n²) time, O(1) space.

## Approach 2: optimal (sliding window counting zeros)

**Idea in plain English:** any block of ones you build is a window in which you flipped every zero, so the window can contain at most `k` zeros. Conversely, any window with at most `k` zeros can be turned into all ones. So find the longest window with at most `k` zeros. Grow the window to the right and count zeros. When there are too many, move the left edge forward until a zero leaves.

Walkthrough on `[1, 0, 1, 1, 0, 0, 1, 1, 1, 0]`, `k = 2`:

| right | value | zeros | left after shrink | length | best |
|---|---|---|---|---|---|
| 0 to 4 | ... | 2 | 0 | 5 | 5 |
| 5 | 0 | 3 -> 2 | 2 | 4 | 5 |
| 6 | 1 | 2 | 2 | 5 | 5 |
| 7 | 1 | 2 | 2 | 6 | 6 |
| 8 | 1 | 2 | 2 | 7 | 7 |
| 9 | 0 | 3 -> 2 | 5 | 5 | 7 |

```python
def longest_ones(nums, k):
    left = 0
    zeros = 0
    best = 0
    for right, value in enumerate(nums):
        if value == 0:
            zeros += 1
        while zeros > k:
            if nums[left] == 0:
                zeros -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
```

**Why it is correct:** after the shrink loop, `[left, right]` is the longest window ending at `right` with at most `k` zeros: every index skipped by `left` was needed to bring the zero count down. A window that has too many zeros still has too many when extended right, so `left` never needs to move back. The maximum over all right ends is therefore the longest valid window.

**Complexity:** O(n) time, since both pointers move forward at most n times; O(1) extra space.

### Non-shrinking variant

Replace the `while` with an `if`: when the window has too many zeros, move `left` by one step only. The window length then never decreases, and at the end it equals the best length. This is a well-known follow-up and gives the same answer.

```python
def longest_ones_slide(nums, k):
    left = 0
    for value in nums:
        if value == 0:
            k -= 1
        if k < 0:
            if nums[left] == 0:
                k += 1
            left += 1
    return len(nums) - left
```

## Tests

```python
import random

for f in (longest_ones, longest_ones_brute, longest_ones_slide):
    assert f([1, 0, 1, 1, 0, 0, 1, 1, 1, 0], 2) == 7
    assert f([1, 1, 0, 1], 1) == 4
    assert f([0, 0, 0], 0) == 0                   # no flips, no ones
    assert f([0, 0, 0], 5) == 3                   # k exceeds zeros
    assert f([1, 1, 1], 0) == 3                   # nothing to flip
    assert f([], 3) == 0                          # empty
    assert f([1, 0, 0, 1, 0, 1, 1, 0, 1], 1) == 4

random.seed(1004)
for _ in range(800):
    nums = [random.randint(0, 1) for _ in range(random.randint(0, 15))]
    k = random.randint(0, 4)
    expected = longest_ones_brute(nums, k)
    assert longest_ones(nums, k) == expected
    assert longest_ones_slide(nums, k) == expected
```

## Edge cases and pitfalls

- `k = 0` turns the problem into the longest run of existing ones; the same code handles it.
- `k` larger than the number of zeros means the whole list is the answer; the window simply never shrinks.
- Do not flip values in the input to "try" them. Counting zeros in the window is enough, and mutating the list makes the shrink step wrong.
- In the non-shrinking variant, the final window may not be valid. Only its length is the answer.

## Where this shows up in data engineering

"The longest stretch with at most k gaps" is a common data-quality question: the longest period of sensor readings with at most k missing intervals, or the longest streak of daily activity allowing k missed days. The same window over a time-ordered table answers it in one pass, and in SQL it becomes a gaps-and-islands query with a running count of gaps.

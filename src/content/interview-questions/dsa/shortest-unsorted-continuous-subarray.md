---
title: "Shortest Unsorted Continuous Subarray: Find the Boundaries With Running Max and Min"
seoTitle: "Shortest Unsorted Continuous Subarray"
description: "Find the shortest slice that, once sorted, sorts the whole array. Compare with a sorted copy in O(n log n), or track running max and min for O(n)."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The slice must cover every element that is not already in its final sorted position. The simple answer sorts a copy and returns the span between the first and last index where the two differ: O(n log n). The O(n) answer uses two sweeps. Left to right, keep the running maximum; any element smaller than it is out of place, and the last such index is the right boundary. Right to left, keep the running minimum; the last element larger than it is the left boundary. If no element is out of place, return 0. The pitfall is stopping at the first descent, which misses values further out that also need to move."
followUps: ["Why does finding the first and last descent alone give the wrong answer?", "Can you combine both sweeps into one loop?", "How would you return the slice itself rather than its length?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers"]
practice: {"platform": "LeetCode", "number": 581, "title": "Shortest Unsorted Continuous Subarray", "url": "https://leetcode.com/problems/shortest-unsorted-continuous-subarray/"}
previous: "interview-questions:dsa/4sum"
next: "interview-questions:dsa/trapping-rain-water"
---

## Problem

You are given a list of integers `nums`. Find the shortest contiguous slice such that sorting just that slice in ascending order leaves the whole list sorted in ascending order. Return the slice's length, or 0 if the list is already sorted. This is LeetCode 581, Shortest Unsorted Continuous Subarray.

## Examples

```text
[1, 5, 3, 4, 2, 7]   ->  4    (sort [5, 3, 4, 2])
[1, 2, 3]            ->  0    (already sorted)
[3, 2, 1]            ->  3    (everything moves)
[1, 3, 3, 2, 2]      ->  4    (sort [3, 3, 2, 2]; duplicates count)
```

## Approach 1: compare with a sorted copy

Sort a copy. Every index where the copy and the original differ must be inside the slice, and every index outside the first and last such positions is already correct.

```python
def unsorted_length_sort(nums):
    target = sorted(nums)
    diff = [i for i in range(len(nums)) if nums[i] != target[i]]
    return diff[-1] - diff[0] + 1 if diff else 0
```

**Complexity:** O(n log n) time, O(n) space. It is short and easy to justify, so it is a strong first answer.

## Approach 2: optimal (running max and min sweeps)

**Idea in plain English:** an element is already in its final place on the right side only if it is at least as large as everything before it. So sweep from the left with a running maximum; whenever an element is smaller than that maximum, it has to move, and the slice must extend at least to it. The last such index is the right boundary. Mirror it for the left boundary: sweep from the right with a running minimum, and the last element (furthest left) that is larger than everything after it marks where the slice starts.

Walkthrough on `[1, 5, 3, 4, 2, 7]`:

| index | value | running max | smaller than max? | running min (from right) | larger than min? |
|---|---|---|---|---|---|
| 0 | 1 | 1 | no | 1 | no |
| 1 | 5 | 5 | no | 2 | **yes -> left = 1** |
| 2 | 3 | 5 | yes | 2 | yes |
| 3 | 4 | 5 | yes | 2 | yes |
| 4 | 2 | 5 | **yes -> right = 4** | 2 | no |
| 5 | 7 | 7 | no | 7 | no |

Right boundary 4, left boundary 1, length 4.

```python
def unsorted_length(nums):
    n = len(nums)
    right = -1
    running_max = float("-inf")
    for i in range(n):
        if nums[i] < running_max:
            right = i
        else:
            running_max = nums[i]
    if right == -1:
        return 0                      # nothing is out of place
    left = n
    running_min = float("inf")
    for i in range(n - 1, -1, -1):
        if nums[i] > running_min:
            left = i
        else:
            running_min = nums[i]
    return right - left + 1
```

**Why it is correct:** take any index `i` after the right boundary. Nothing before it is larger (otherwise the sweep would have moved the boundary), and nothing after it is smaller either, because any smaller later value would also be below the running maximum and so would itself be a boundary further right. So `nums[i]` is already in its sorted place. The same argument, mirrored, covers indices before the left boundary. Conversely, the boundary elements themselves are out of order with some element outside them, so the slice cannot be shorter.

**Complexity:** O(n) time with two passes, O(1) extra space.

## Tests

```python
import random

for f in (unsorted_length, unsorted_length_sort):
    assert f([1, 5, 3, 4, 2, 7]) == 4
    assert f([1, 2, 3]) == 0                 # sorted
    assert f([3, 2, 1]) == 3                 # reversed
    assert f([1, 3, 3, 2, 2]) == 4           # duplicates
    assert f([2, 2, 2]) == 0                 # all equal
    assert f([]) == 0
    assert f([7]) == 0
    assert f([2, 1]) == 2
    assert f([1, 2, 4, 3, 5]) == 2
    assert f([1, 3, 2, 0, 5]) == 4           # 0 pulls the start back to index 0

random.seed(581)
for _ in range(1000):
    nums = [random.randint(-5, 5) for _ in range(random.randint(0, 12))]
    assert unsorted_length(nums) == unsorted_length_sort(nums)
```

## Edge cases and pitfalls

- Finding only the first and last positions where `nums[i] > nums[i + 1]` is a common wrong answer. In `[1, 3, 2, 0, 5]` the only descents are at indices 1 and 2, but the 0 must travel to the front, so the slice is `[1, 3, 2, 0]`.
- Use strict comparisons. Equal values next to each other are already in order; `<=` would stretch the slice over duplicates for no reason.
- Return 0 when nothing is out of place, rather than computing `right − left + 1` from sentinel values.
- Empty and single-element lists are sorted; both approaches return 0 without special handling beyond the sentinel check.

## Where this shows up in data engineering

Finding the smallest range that needs fixing is how incremental re-sorting works: when late data lands in a mostly sorted table or file, you only need to rewrite the affected range, and the boundaries come from comparing new values against the running maximum of what came before. Watermark logic in stream processing uses the same running-maximum idea to decide which events arrived out of order.

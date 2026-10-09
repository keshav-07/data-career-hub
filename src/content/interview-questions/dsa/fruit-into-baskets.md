---
title: "Fruit Into Baskets: Longest Window With at Most Two Distinct Values"
seoTitle: "Fruit Into Baskets: At Most Two Distinct"
description: "Pick the longest run of trees using only two fruit types. It is the longest subarray with at most two distinct values, solved by a counting window in O(n)."
technology: ["dsa"]
topic: ["sliding-window", "hashing"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Strip away the story and the task is: find the longest contiguous subarray containing at most two distinct values. Slide a window and keep a count per value inside it. Add each new value on the right; while there are more than two distinct values, remove values from the left and delete a key when its count hits zero. After each step the window is valid, so record its length. This is O(n) time and O(1) extra space, since the map never holds more than three keys. The pitfall is jumping the left pointer to a remembered index without updating counts consistently."
followUps: ["How would you generalise to k baskets?", "Can you solve it with a window that never shrinks, only slides?", "How would you return which two fruit types give the best run?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window", "interview-questions:dsa/longest-k-unique-characters-substring"]
practice: {"platform": "LeetCode", "number": 904, "title": "Fruit Into Baskets", "url": "https://leetcode.com/problems/fruit-into-baskets/"}
---

## Problem

You walk along a row of trees, each producing one type of fruit, given as a list of integers `fruits`. You have two baskets, and each basket can hold any amount of a single type. You may start at any tree, must pick one fruit from every tree as you move right, and must stop at the first tree whose type fits neither basket. Return the largest number of fruits you can collect. Put plainly: return the length of the longest contiguous subarray with at most two distinct values. This is LeetCode 904, Fruit Into Baskets.

## Examples

```text
[3, 1, 3, 2, 2, 2, 1]      ->  4    ([3, 2, 2, 2])
[4, 4, 4]                  ->  3    (one type is fine)
[1, 2, 3, 4]               ->  2    (any adjacent pair)
[0, 1, 0, 2, 0, 2, 2, 1]   ->  5    ([0, 2, 0, 2, 2])
```

## Approach 1: brute force

From each start, extend right while at most two types have been seen.

```python
def total_fruit_brute(fruits):
    best = 0
    for start in range(len(fruits)):
        types = set()
        for end in range(start, len(fruits)):
            types.add(fruits[end])
            if len(types) > 2:
                break
            best = max(best, end - start + 1)
    return best
```

**Complexity:** O(n²) time, O(1) space (the set holds at most three values).

## Approach 2: optimal (sliding window with counts)

**Idea in plain English:** the window is the stretch of trees you are currently picking from, and the count map is what is in your baskets. Each step adds the next tree on the right. If that introduces a third type, drop trees from the left of the window until one type disappears completely. The window then holds at most two types again, so its length is a valid harvest.

Walkthrough on `[3, 1, 3, 2, 2, 2, 1]`:

| right | type | window after shrink | counts | best |
|---|---|---|---|---|
| 0 | 3 | [3] | 3:1 | 1 |
| 1 | 1 | [3, 1] | 3:1, 1:1 | 2 |
| 2 | 3 | [3, 1, 3] | 3:2, 1:1 | 3 |
| 3 | 2 | [3, 2] | 3:1, 2:1 | 3 |
| 4 | 2 | [3, 2, 2] | 3:1, 2:2 | 3 |
| 5 | 2 | [3, 2, 2, 2] | 3:1, 2:3 | 4 |
| 6 | 1 | [2, 2, 2, 1] | 2:3, 1:1 | 4 |

```python
def total_fruit(fruits):
    counts = {}
    left = 0
    best = 0
    for right, kind in enumerate(fruits):
        counts[kind] = counts.get(kind, 0) + 1
        while len(counts) > 2:
            out = fruits[left]
            counts[out] -= 1
            if counts[out] == 0:
                del counts[out]
            left += 1
        best = max(best, right - left + 1)
    return best
```

**Why it is correct:** after the shrink loop, `[left, right]` is the longest window ending at `right` with at most two types. Starting any earlier would include a type that was removed, making three. The left pointer can only move forward, because a window with three types still has three when it grows to the right. Every possible harvest ends at some tree, so the maximum over all right ends is the answer.

**Complexity:** O(n) time, each index enters and leaves once; O(1) extra space.

### A window that never shrinks

A neat variant keeps the window length equal to the best seen so far. When the window becomes invalid, move `left` by exactly one instead of looping; the window slides without shrinking, and its final length is the answer. It does the same amount of work but is a common follow-up.

```python
def total_fruit_nonshrinking(fruits):
    counts = {}
    left = 0
    for kind in fruits:
        counts[kind] = counts.get(kind, 0) + 1
        if len(counts) > 2:
            out = fruits[left]
            counts[out] -= 1
            if counts[out] == 0:
                del counts[out]
            left += 1
    return len(fruits) - left
```

## Tests

```python
import random

for f in (total_fruit, total_fruit_brute, total_fruit_nonshrinking):
    assert f([3, 1, 3, 2, 2, 2, 1]) == 4
    assert f([4, 4, 4]) == 3                    # single type
    assert f([1, 2, 3, 4]) == 2                 # all different
    assert f([0, 1, 0, 2, 0, 2, 2, 1]) == 5
    assert f([7]) == 1
    assert f([]) == 0                           # no trees
    assert f([1, 2, 1, 2, 1, 2]) == 6           # whole row

random.seed(904)
for _ in range(800):
    fruits = [random.randint(0, 3) for _ in range(random.randint(0, 14))]
    expected = total_fruit_brute(fruits)
    assert total_fruit(fruits) == expected
    assert total_fruit_nonshrinking(fruits) == expected
```

## Edge cases and pitfalls

- Delete a type from the map when its count reaches zero; the window's type count is `len(counts)`, and stale zero entries break it.
- Record the length after the shrink, not before; before the shrink the window can hold three types.
- An all-same row is valid: two baskets do not have to both be used.
- In the non-shrinking variant, the window can be invalid at the end of the loop; only its length is meaningful, not its contents.

## Where this shows up in data engineering

"The longest stretch involving at most two distinct keys" appears when grouping a sorted or time-ordered stream into runs that a downstream writer can handle, for example batching consecutive events so that each batch touches at most two target tables or partitions. The count-map window is the general tool for any "at most k distinct" constraint over a sequence.

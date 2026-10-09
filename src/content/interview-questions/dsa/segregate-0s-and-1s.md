---
title: "Segregate 0s and 1s: Partition a Binary Array in One Pass"
seoTitle: "Segregate 0s and 1s: In-Place Partition"
description: "Rearrange an array of 0s and 1s in place so every 0 comes before every 1. Counting works; two pointers from the ends do it in one pass with O(1) space."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The simplest answer counts the zeros and rewrites the array: that many 0s, then 1s. It is O(n) but makes two passes. The two-pointer version uses one pass: a left pointer looks for a 1 that is too far left and a right pointer looks for a 0 that is too far right; when both are found, swap them and move both inward. Stop when the pointers meet. Both are O(n) time and O(1) space. The pitfall is a loop that does not advance when both ends already hold the right values, which hangs forever."
followUps: ["How would you extend this to 0s, 1s and 2s?", "Is the two-pointer partition stable, and does stability matter here?", "How would you partition records by a boolean flag rather than plain 0s and 1s?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers"]
practice: {"platform": "GeeksforGeeks", "title": "Segregate 0s and 1s", "url": "https://www.geeksforgeeks.org/problems/segregate-0s-and-1s5106/1"}
previous: "interview-questions:dsa/squares-of-a-sorted-array"
next: "interview-questions:dsa/backspace-string-compare"
---

## Problem

You are given a list that contains only the values 0 and 1, in any order. Modify it in place so that all the 0s come first, followed by all the 1s. Nothing is returned; the list itself is the result. This is the GeeksforGeeks problem Segregate 0s and 1s.

## Examples

```text
[1, 0, 1, 1, 0, 0]   ->  [0, 0, 0, 1, 1, 1]
[0, 0, 1]            ->  [0, 0, 1]     (already partitioned)
[1, 1, 1]            ->  [1, 1, 1]
[1, 0]               ->  [0, 1]
```

## Approach 1: counting (two passes)

Because the values carry no other data, you can count the zeros and overwrite the list. This is the brute-force baseline: easy to get right, but it rewrites every element and only works when the values are bare 0s and 1s.

```python
def segregate_count(arr):
    zeros = arr.count(0)
    for i in range(len(arr)):
        arr[i] = 0 if i < zeros else 1
```

**Complexity:** O(n) time with two passes over the data, O(1) extra space.

## Approach 2: optimal (two pointers from the ends)

**Idea in plain English:** everything left of `left` is already a 0 and everything right of `right` is already a 1. Move `left` forward past 0s, move `right` backward past 1s. If they have not crossed, `left` now points at a misplaced 1 and `right` at a misplaced 0, so swap them. This is the partition step of quicksort with the pivot sitting between 0 and 1.

Walkthrough on `[1, 0, 1, 1, 0, 0]`:

| left | right | values | action |
|---|---|---|---|
| 0 | 5 | 1, 0 | swap -> [0, 0, 1, 1, 0, 1] |
| 1 -> 2 | 4 | 1, 0 | swap -> [0, 0, 0, 1, 1, 1] |
| 3 | 3 | pointers meet | stop |

```python
def segregate(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        while left < right and arr[left] == 0:
            left += 1
        while left < right and arr[right] == 1:
            right -= 1
        if left < right:
            arr[left], arr[right] = arr[right], arr[left]
            left += 1
            right -= 1
```

**Why it is correct:** the invariant is that `arr[:left]` holds only 0s and `arr[right + 1:]` holds only 1s. The inner loops extend those regions without breaking the invariant. A swap puts a 0 at `left` and a 1 at `right`, so both regions can grow by one. Each iteration moves at least one pointer, and when they meet the two regions cover the whole list.

A one-direction variant also works: keep a write pointer for the next 0 slot, scan left to right, and swap each 0 into that slot (the same shape as Move Zeroes). It does more swaps but is easier to extend.

**Complexity:** O(n) time in a single pass, O(1) extra space, at most n / 2 swaps.

## Tests

```python
import random

for f in (segregate, segregate_count):
    for data in ([1, 0, 1, 1, 0, 0], [0, 0, 1], [1, 1, 1], [0, 0, 0],
                 [1, 0], [0], [1], []):
        arr = list(data)
        result = f(arr)
        assert result is None                  # in place, nothing returned
        assert arr == sorted(data)

random.seed(5106)
for _ in range(500):
    data = [random.randint(0, 1) for _ in range(random.randint(0, 20))]
    a, b = list(data), list(data)
    segregate(a)
    segregate_count(b)
    assert a == b == sorted(data)
```

## Edge cases and pitfalls

- Guard every inner loop with `left < right`; without it, an all-0 or all-1 list runs off the end.
- Advance both pointers after a swap. Forgetting is not wrong, but it re-checks values you already know.
- The end-to-end swap is not stable. With bare 0s and 1s that is invisible, but if each value is a record with a flag, the order of records within each group changes. Use the left-to-right write-pointer version when stability matters.
- An empty list or a single element needs no work; make sure the code does not index into an empty list.

## Where this shows up in data engineering

Splitting records into two groups by a predicate, valid and invalid, late and on time, hot and cold, is a partition step. Query engines do it when they apply a filter to a batch of rows in place, and quicksort-based sorters do it at every level. Knowing whether your partition is stable tells you whether a later "first row per key" step is still safe.

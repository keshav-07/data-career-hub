---
title: "Ceil in Sorted Array: Lower-Bound Binary Search"
description: "Find the first index whose value is at least x in a sorted array using a lower-bound binary search. Python solutions, walkthrough, pitfalls and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "The ceiling of x is the smallest value that is greater than or equal to x, which is exactly the lower bound of x. Keep a half-open range [lo, hi) and move hi to mid whenever arr[mid] >= x, otherwise move lo past mid. When the loop ends, lo is the first index whose value is at least x; if lo equals the length, no ceiling exists and you return -1. It runs in O(log n) time and O(1) space, and it naturally lands on the first copy when x is duplicated."
followUps: ["How would you find the floor (largest value not above x) with the same template?", "How does Python's bisect module express this in one call?", "What changes if you need the last index of the ceiling value rather than the first?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/binary-search", "interview-questions:dsa/find-first-and-last-position"]
practice: {"platform": "GeeksforGeeks", "title": "Ceil in Sorted Array", "url": "https://www.geeksforgeeks.org/problems/ceil-in-a-sorted-array/1"}
---

## Problem

You are given a list of integers sorted in non-decreasing order and a value `x`. The ceiling of `x` is the smallest element in the list that is greater than or equal to `x`. Return the index of the ceiling, choosing the first index if the ceiling value appears more than once, or `-1` if every element is smaller than `x`.

This is GeeksforGeeks: Ceil in Sorted Array. It is the "lower bound" query that sits underneath many harder binary search problems, so it is worth being able to write it without thinking.

Assume the list can hold up to about a million values, so a linear scan is acceptable for correctness but not what the interviewer wants.

## Examples

```text
arr = [2, 4, 4, 7, 10], x = 5   ->  3    (7 is the smallest value >= 5)
arr = [2, 4, 4, 7, 10], x = 4   ->  1    (4 itself, first copy)
arr = [2, 4, 4, 7, 10], x = 1   ->  0    (everything is >= 1)
arr = [2, 4, 4, 7, 10], x = 11  -> -1    (nothing is >= 11)
```

## Approach 1: brute force

Walk from the left and return the first index whose value is at least `x`. Because the list is sorted, the first hit is the ceiling.

```python
def ceil_index_linear(arr, x):
    for i, v in enumerate(arr):
        if v >= x:
            return i
    return -1
```

This is O(n) time and O(1) space. It is correct but ignores the sorted order beyond the first match.

## Approach 2: optimal (lower-bound binary search)

The condition `arr[i] >= x` is false for a prefix of the list and true for the rest. The ceiling is the first index where it turns true, so you binary search for that boundary.

Keep a half-open range `[lo, hi)` that always contains the boundary. Look at the middle. If `arr[mid] >= x`, the boundary is at `mid` or to its left, so set `hi = mid`. Otherwise it is strictly to the right, so set `lo = mid + 1`. When `lo == hi` the range holds a single position: the boundary.

Walkthrough for `[2, 4, 4, 7, 10]`, `x = 5`:

```text
lo=0 hi=5 mid=2  arr[2]=4 < 5   -> lo=3
lo=3 hi=5 mid=4  arr[4]=10 >= 5 -> hi=4
lo=3 hi=4 mid=3  arr[3]=7 >= 5  -> hi=3
lo=hi=3          answer 3
```

```python
def ceil_index(arr, x):
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] >= x:
            hi = mid          # mid could be the ceiling; keep it
        else:
            lo = mid + 1      # mid is too small
    return lo if lo < len(arr) else -1
```

**Why it is correct.** Every index left of `lo` holds a value below `x`, and every index from `hi` onwards holds a value at least `x`. Both moves keep that invariant, and the range shrinks every step, so the loop stops with `lo` at the first value that is at least `x`. Duplicates are handled for free, because a match moves `hi` left rather than stopping.

Python's standard library already does this: `bisect.bisect_left(arr, x)` returns the same `lo`.

```python
from bisect import bisect_left

def ceil_index_bisect(arr, x):
    i = bisect_left(arr, x)
    return i if i < len(arr) else -1
```

**Complexity.** O(log n) time and O(1) extra space.

## Tests

```python
import random

def check(fn):
    a = [2, 4, 4, 7, 10]
    assert fn(a, 5) == 3
    assert fn(a, 4) == 1
    assert fn(a, 1) == 0
    assert fn(a, 11) == -1
    assert fn(a, 10) == 4
    assert fn([], 3) == -1
    assert fn([5], 5) == 0
    assert fn([5], 6) == -1
    assert fn([3, 3, 3], 3) == 0
    assert fn([-8, -3, 0], -5) == 1

for f in (ceil_index_linear, ceil_index, ceil_index_bisect):
    check(f)

rng = random.Random(1)
for _ in range(500):
    arr = sorted(rng.randint(-20, 20) for _ in range(rng.randint(0, 12)))
    x = rng.randint(-25, 25)
    assert ceil_index(arr, x) == ceil_index_linear(arr, x) == ceil_index_bisect(arr, x)
print("ok")
```

## Edge cases and pitfalls

- **No ceiling.** When `x` is larger than every element, `lo` ends at `len(arr)`. Check this before indexing, or you return an out-of-range index.
- **Duplicates.** Stopping as soon as `arr[mid] == x` can return a later copy. Keep shrinking towards the left.
- **Mixing templates.** With `while lo < hi` and `hi = len(arr)`, the update must be `hi = mid`, not `mid - 1`.
- **Empty input.** The loop never runs and the function returns `-1`, which is the right answer.
- **Floor versus ceiling.** The floor is the element just before the lower bound of `x + 1` (or the upper bound of `x`). Interviewers often ask for both together.

## Where this shows up in data engineering

Lower-bound lookups are how sorted storage finds where to start reading: a range scan over a sorted file, a sorted index or a list of partition boundaries begins at the first key that is at least the lower bound of the filter. Mapping an event timestamp to the bucket or price tier that applies from that time onwards is the same query on a small sorted list.

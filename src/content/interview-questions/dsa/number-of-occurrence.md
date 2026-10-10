---
title: "Number of Occurrence: Count a Value with Two Boundary Searches"
seoTitle: "Number of Occurrence with Binary Search"
description: "Count how many times a value appears in a sorted array in O(log n) using lower and upper bound binary searches. Python solutions, pitfalls and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "In a sorted array all copies of the target are contiguous, so the count is upper_bound(target) minus lower_bound(target): the first index with a value greater than the target minus the first index with a value at least the target. Both are standard half-open binary searches, so the total is O(log n) time and O(1) space, and an absent target gives 0 automatically. The pitfall is finding one copy and then scanning outwards, which degrades to O(n) when the target fills most of the array."
followUps: ["How would you return the first and last positions instead of the count?", "Can you count all values within a range [a, b] the same way?", "Why is expanding outwards from one match not O(log n)?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/find-first-and-last-position", "interview-questions:dsa/ceil-in-a-sorted-array"]
practice: {"platform": "GeeksforGeeks", "title": "Number of Occurrence", "url": "https://www.geeksforgeeks.org/problems/number-of-occurrence2259/1"}
previous: "interview-questions:dsa/find-first-and-last-position"
next: "interview-questions:dsa/median-of-two-sorted-arrays"
---

## Problem

You are given a list of integers sorted in non-decreasing order and a target value. Return how many times the target appears. If it does not appear, return 0.

This is GeeksforGeeks: Number of Occurrence. The point of the exercise is to do better than counting one element at a time by exploiting the sorted order.

Assume up to about 100,000 values, with any number of duplicates.

## Examples

```text
arr = [1, 3, 3, 3, 5, 8, 8], target = 3  ->  3
arr = [1, 3, 3, 3, 5, 8, 8], target = 8  ->  2
arr = [1, 3, 3, 3, 5, 8, 8], target = 4  ->  0
arr = [6, 6, 6, 6],          target = 6  ->  4
```

## Approach 1: brute force

Count every element that equals the target.

```python
def count_linear(arr, target):
    return sum(1 for v in arr if v == target)
```

This is O(n) time and O(1) space. A tempting middle ground is to binary search for any copy and then walk left and right, but if the target fills most of the array that walk is still O(n).

## Approach 2: optimal (lower and upper bound)

Because the list is sorted, every copy of the target sits in one contiguous block. You only need the two edges of that block:

- `lower_bound(t)`: the first index whose value is at least `t`.
- `upper_bound(t)`: the first index whose value is greater than `t`.

The block is `[lower_bound, upper_bound)`, so its length is the count. When the target is missing, both searches land on the same index and the difference is 0.

Both searches use the same half-open template; only the comparison changes.

```python
def lower_bound(arr, t):
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    return lo

def upper_bound(arr, t):
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] <= t:
            lo = mid + 1
        else:
            hi = mid
    return lo

def count_occurrences(arr, target):
    return upper_bound(arr, target) - lower_bound(arr, target)
```

Walkthrough for `[1, 3, 3, 3, 5, 8, 8]`, target 3: the lower bound stops at index 1 (the first 3) and the upper bound stops at index 4 (the 5). The count is 4 - 1 = 3.

**Why it is correct.** For the lower bound, the predicate `arr[i] >= t` is false then true across the list, and the search returns its first true position. The upper bound does the same for `arr[i] > t`. Every index between the two satisfies `arr[i] >= t` and not `arr[i] > t`, so it holds exactly `t`.

In Python you would use the standard library in practice:

```python
from bisect import bisect_left, bisect_right

def count_bisect(arr, target):
    return bisect_right(arr, target) - bisect_left(arr, target)
```

**Complexity.** Two binary searches: O(log n) time and O(1) extra space, however many copies there are.

## Tests

```python
import random

def check(fn):
    a = [1, 3, 3, 3, 5, 8, 8]
    assert fn(a, 3) == 3
    assert fn(a, 8) == 2
    assert fn(a, 1) == 1
    assert fn(a, 4) == 0
    assert fn(a, 0) == 0
    assert fn(a, 9) == 0
    assert fn([6, 6, 6, 6], 6) == 4
    assert fn([], 6) == 0
    assert fn([-2, -2, 0], -2) == 2

for f in (count_linear, count_occurrences, count_bisect):
    check(f)

rng = random.Random(9)
for _ in range(500):
    arr = sorted(rng.randint(0, 6) for _ in range(rng.randint(0, 20)))
    t = rng.randint(-1, 7)
    assert count_occurrences(arr, t) == count_linear(arr, t) == count_bisect(arr, t)
print("ok")
```

## Edge cases and pitfalls

- **Expanding from one match.** Finding a copy and scanning outwards is O(k) for k copies, which is O(n) in the worst case. Interviewers often probe this.
- **Off-by-one between the two bounds.** The only difference is `<` versus `<=`. Write one function, then copy it and change that single operator.
- **Absent target.** No special case is needed: both bounds coincide and the difference is 0.
- **Range counts.** The count of values in `[a, b]` is `upper_bound(b) - lower_bound(a)`, the same idea with two different targets.

## Where this shows up in data engineering

Counting the rows that match a key in a sorted file or a sorted index, without reading them, is this calculation: find where the key's run starts and ends. Range counts over sorted timestamps (how many events fell between two times) use the same pair of bounds, which is why sorted, columnar layouts can answer such questions cheaply.

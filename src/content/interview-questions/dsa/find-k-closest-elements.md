---
title: "Find K Closest Elements: Binary Search for the Best Window"
seoTitle: "Find K Closest Elements: Heap vs Binary Search"
description: "Return the k values in a sorted array closest to a target. Compare a size-k heap at O(n log k) with binary search on the window start at O(log n + k)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "binary-search", "two-pointers"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 18
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Because the array is sorted, the answer is always a contiguous window of length k. Binary-search the window's left edge over 0..n-k: for a candidate start m, compare x - arr[m] with arr[m+k] - x; if the left end is farther away, the window should move right, otherwise left. That costs O(log(n - k)) plus O(k) to copy the window. A max-heap of size k keyed by (distance, value) also works in O(n log k) and does not need sorted input. Ties go to the smaller value."
followUps: ["Why must the answer be a contiguous window of the sorted array?", "What if the array were not sorted?", "How would you answer many queries with different x on the same array?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/k-closest-points-to-origin", "interview-questions:dsa/binary-search", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 658, "title": "Find K Closest Elements", "url": "https://leetcode.com/problems/find-k-closest-elements/"}
previous: "interview-questions:dsa/sort-characters-by-frequency"
next: "interview-questions:dsa/reorganize-string"
---

## Problem

You get an array of integers sorted in ascending order, a count `k` (1 ≤ k ≤ length) and a target `x`, which need not be in the array. Return the `k` elements closest to `x`, in ascending order. Closeness is the absolute difference; when two elements are equally close, the smaller one wins. This is LeetCode 658, Find K Closest Elements.

## Examples

```text
arr = [1, 3, 5, 7, 9],  k = 2, x = 6   ->  [5, 7]
arr = [1, 3, 5, 7, 9],  k = 2, x = 4   ->  [3, 5]      (3 and 5 tie; both fit)
arr = [1, 3, 5, 7, 9],  k = 1, x = 4   ->  [3]         (tie goes to the smaller)
arr = [2, 4, 6],        k = 3, x = 100 ->  [2, 4, 6]
arr = [1, 1, 2, 2, 3],  k = 3, x = 0   ->  [1, 1, 2]
```

## Approach 1: brute force (sort by distance)

Sort all values by `(distance, value)`, take the first k, and sort them back into ascending order.

```python
def closest_brute(arr, k, x):
    best = sorted(arr, key=lambda v: (abs(v - x), v))[:k]
    return sorted(best)
```

**Complexity:** O(n log n) time, O(n) space.

## Approach 2: size-k max-heap

Keep the k best seen so far in a heap whose top is the worst of them. Python's `heapq` is a min-heap, so store negated keys. A new value replaces the top only if it is strictly better.

```python
import heapq

def closest_heap(arr, k, x):
    heap = []   # entries (-distance, -value): the top is the farthest, larger value on ties
    for v in arr:
        item = (-abs(v - x), -v)
        if len(heap) < k:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)
    return sorted(-neg_v for _, neg_v in heap)
```

**Complexity:** O(n log k) time, O(k) space. It does not use the sorted order, so it also works on unsorted input.

## Approach 3: optimal (binary search on the window start)

In a sorted array, if a value is in the answer then everything between it and `x` is at least as close, so the answer is a window `arr[m : m + k]`. Compare a window starting at `m` with the one starting at `m + 1`: they differ only in `arr[m]` (dropped) and `arr[m + k]` (added). If `x - arr[m] > arr[m + k] - x`, the left element is farther, so the best start is to the right of `m`; otherwise the best start is `m` or to its left. That test is monotone in `m`, so binary search finds the first start where it fails.

```python
def closest_window(arr, k, x):
    lo, hi = 0, len(arr) - k
    while lo < hi:
        mid = (lo + hi) // 2
        if x - arr[mid] > arr[mid + k] - x:
            lo = mid + 1
        else:
            hi = mid
    return arr[lo:lo + k]
```

**Why it is correct:** using the signed differences instead of `abs` keeps the test monotone even when `x` lies outside the window, and `>` (not `>=`) means that on a tie the window keeps the smaller left element, matching the tie rule.

**Complexity:** O(log(n − k) + k) time, O(1) extra space besides the output.

## Tests

```python
import random

cases = [
    ([1, 3, 5, 7, 9], 2, 6, [5, 7]),
    ([1, 3, 5, 7, 9], 2, 4, [3, 5]),
    ([1, 3, 5, 7, 9], 1, 4, [3]),
    ([2, 4, 6], 3, 100, [2, 4, 6]),
    ([1, 1, 2, 2, 3], 3, 0, [1, 1, 2]),
    ([5], 1, -7, [5]),
    ([-4, -1, 0, 8], 2, -2, [-4, -1]),
    ([1, 1, 2, 2, 2, 2, 2, 3, 3], 3, 3, [2, 3, 3]),   # breaks an abs-based comparison
]
for f in (closest_brute, closest_heap, closest_window):
    for arr, k, x, expected in cases:
        assert f(arr, k, x) == expected, (f.__name__, arr, k, x)

random.seed(6)
for _ in range(500):
    arr = sorted(random.randint(-10, 10) for _ in range(random.randint(1, 9)))
    k = random.randint(1, len(arr))
    x = random.randint(-14, 14)
    expected = closest_brute(arr, k, x)
    assert closest_heap(arr, k, x) == expected
    assert closest_window(arr, k, x) == expected
print("ok")
```

## Edge cases and pitfalls

- Do not compare `abs(x - arr[mid])` with `abs(arr[mid + k] - x)`: with duplicates, such as `[1, 1, 2, 2, 2, 2, 2, 3, 3]` and `x = 3`, the absolute values tie at the wrong place and the search stops too early.
- The search range for the start is `0..n-k`, not `0..n-1`, so `mid + k` is always a valid index.
- The output must be in ascending order. The heap version needs a final sort; the window version is already sorted.
- `x` may lie below the first element or above the last; the window simply sits at an end.

## Where this shows up in data engineering

"Nearest k readings to a timestamp" is a common lookup: pick the sensor values around an event, the prices nearest a trade time, or the log lines around an error. On a time-sorted array or a sorted index the window search is the cheap way to do it, and it is the same idea as an as-of join, which seeks to a timestamp in sorted data and reads neighbours rather than scanning everything.

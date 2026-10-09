---
title: "Kth Smallest Element in a Sorted Matrix: Binary Search on Values"
seoTitle: "Kth Smallest Element in a Sorted Matrix"
description: "Find the kth smallest value in a row- and column-sorted matrix with a min-heap merge or a binary search on values with staircase counting. Python solutions and tests."
technology: ["dsa"]
topic: ["binary-search", "heaps-priority-queues", "matrix"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "High"
shortAnswer: "Two good answers. A min-heap merge of the n sorted rows pops k times in O(k log n). The binary search answer searches values, not indices: for a candidate x, count the cells at most x with a staircase walk from the bottom-left in O(n), and find the smallest x whose count is at least k, between matrix[0][0] and matrix[-1][-1]. That is O(n log R) time for value range R and O(1) space. The search always lands on a value that is in the matrix, because the smallest x with count at least k must be one of the cells."
followUps: ["Why is the value returned by the binary search guaranteed to be in the matrix?", "When would you prefer the heap over the binary search?", "How would you find the kth smallest sum of pairs from two sorted arrays?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/search-a-2d-matrix-ii", "interview-questions:dsa/kth-largest-element-in-an-array"]
practice: {"platform": "LeetCode", "number": 378, "title": "Kth Smallest Element in a Sorted Matrix", "url": "https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/"}
previous: "interview-questions:dsa/search-a-2d-matrix-ii"
next: "interview-questions:dsa/merge-two-sorted-lists"
---

## Problem

You are given an `n x n` grid of integers in which each row and each column is sorted in ascending order, and an integer `k` with `1 <= k <= n * n`. Return the kth smallest value counting duplicates, so the kth value in the sorted list of all `n * n` cells, not the kth distinct value. Aim for better than O(n^2) memory.

This is LeetCode 378, Kth Smallest Element in a Sorted Matrix. It is a showcase for binary search on the answer where the answer is a value, not an index.

Assume `n` up to 300 and values within the 32-bit signed range.

## Examples

```text
grid = [[ 1,  4,  7],
        [ 3,  6, 10],
        [ 5, 11, 14]]

k = 1  ->  1
k = 4  ->  5      (sorted: 1, 3, 4, 5, 6, 7, 10, 11, 14)
k = 9  ->  14

grid = [[2, 2], [2, 3]], k = 3  ->  2   (duplicates count)
```

## Approach 1: brute force

Flatten, sort, and index.

```python
def kth_sort(grid, k):
    return sorted(v for row in grid for v in row)[k - 1]
```

This is O(n^2 log n) time and O(n^2) space. Fine for a first answer, but it ignores the ordering and uses the memory the problem asks you to avoid.

## Approach 2: min-heap merge

Each row is a sorted list, so the problem is "merge n sorted lists and stop at the kth item". Put the first cell of every row in a min-heap. Pop the smallest, push the next cell from the same row, and repeat; the kth pop is the answer.

```python
import heapq

def kth_heap(grid, k):
    n = len(grid)
    heap = [(grid[r][0], r, 0) for r in range(min(n, k))]   # rows beyond k cannot matter
    heapq.heapify(heap)
    for _ in range(k - 1):
        v, r, c = heapq.heappop(heap)
        if c + 1 < len(grid[r]):
            heapq.heappush(heap, (grid[r][c + 1], r, c + 1))
    return heap[0][0]
```

This is O(n + k log n) time and O(n) space. It only uses the row order, and it is the better choice when `k` is small.

## Approach 3: optimal (binary search on values)

**Idea.** Pick a candidate value `x` and ask: how many cells are at most `x`? Call it `count(x)`. It never decreases as `x` grows. The kth smallest value is the smallest `x` with `count(x) >= k`. Search `x` between the smallest cell (top-left) and the largest (bottom-right).

**Counting in O(n).** Use the staircase walk from the bottom-left corner. If the cell is at most `x`, every cell above it in that column is too, so add `row + 1` and move right. Otherwise move up.

```python
def count_at_most(grid, x):
    n = len(grid)
    r, c, count = n - 1, 0, 0
    while r >= 0 and c < n:
        if grid[r][c] <= x:
            count += r + 1        # this cell and everything above it
            c += 1
        else:
            r -= 1
    return count

def kth_smallest(grid, k):
    lo, hi = grid[0][0], grid[-1][-1]
    while lo < hi:
        mid = (lo + hi) // 2
        if count_at_most(grid, mid) >= k:
            hi = mid              # at least k cells are <= mid
        else:
            lo = mid + 1
    return lo
```

Walkthrough on the 3 x 3 grid with `k = 4`, range `[1, 14]`: `count(7) = 6`, so `hi = 7`; `count(4) = 3`, so `lo = 5`; `count(6) = 5`, so `hi = 6`; `count(5) = 4`, so `hi = 5`; the answer is 5.

**Why the answer is a real cell.** Let `v` be the true kth smallest value. Then `count(v) >= k`, and for any `x < v`, `count(x) < k`, because fewer than k cells are below `v`. So the smallest `x` with `count(x) >= k` is exactly `v`, even though the search visits values such as 7 or 6 that may not be the answer.

**Complexity.** O(n log R) time, where R is `grid[-1][-1] - grid[0][0]`, and O(1) extra space. With 32-bit values, log R is at most about 32.

## Tests

```python
import random

G = [[1, 4, 7],
     [3, 6, 10],
     [5, 11, 14]]

def check(fn):
    assert fn(G, 1) == 1
    assert fn(G, 4) == 5
    assert fn(G, 5) == 6
    assert fn(G, 9) == 14
    assert fn([[2, 2], [2, 3]], 3) == 2
    assert fn([[2, 2], [2, 3]], 4) == 3
    assert fn([[-5]], 1) == -5
    assert fn([[-10, -3], [-4, 0]], 2) == -4

def random_sorted_grid(rng, n):
    g = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            base = max(g[i - 1][j] if i else -20, g[i][j - 1] if j else -20)
            g[i][j] = base + rng.randint(0, 4)
    return g

for f in (kth_sort, kth_heap, kth_smallest):
    check(f)

rng = random.Random(10)
for _ in range(300):
    n = rng.randint(1, 6)
    g = random_sorted_grid(rng, n)
    k = rng.randint(1, n * n)
    assert kth_smallest(g, k) == kth_heap(g, k) == kth_sort(g, k), (g, k)
print("ok")
```

## Edge cases and pitfalls

- **Duplicates.** Count them. The condition `count >= k` (not `== k`) handles runs of equal values.
- **Midpoint with negatives.** In Python `(lo + hi) // 2` floors correctly for negative numbers. In C++ or Java integer division rounds towards zero, so use `lo + (hi - lo) / 2` to keep the loop moving.
- **Searching indices instead of values.** The grid is not one sorted list, so index-based binary search does not apply.
- **Counting cost.** Counting with a per-row binary search is O(n log n) per step; the staircase is O(n).

## Where this shows up in data engineering

Percentiles over data that is already sorted in pieces, such as per-partition sorted values, are a kth-smallest query. A heap merge streams the sorted pieces, while "guess a value, count how many are below it" is the idea behind approximate quantile and histogram methods that never materialise the full sorted list.

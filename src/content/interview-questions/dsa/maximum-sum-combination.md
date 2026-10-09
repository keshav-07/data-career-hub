---
title: "Maximum Sum Combination: The K Largest Pair Sums with a Max-Heap"
seoTitle: "Maximum Sum Combination: Top K Pair Sums"
description: "Find the k largest sums of one element from each of two arrays. Sort both, then expand a max-heap of index pairs with a visited set in O(n log n + k log k)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort both arrays in descending order. The largest sum is a[0] + b[0]. Push it into a max-heap with its index pair (0, 0). Each time you pop (i, j), record the sum and push its two neighbours (i + 1, j) and (i, j + 1), using a visited set so a pair is never pushed twice. After k pops you have the k largest sums in non-increasing order. Cost: O(n log n) to sort plus O(k log k) for the heap, instead of O(n² log n) for generating every sum."
followUps: ["Why are (i + 1, j) and (i, j + 1) the only candidates you need to add?", "How would you find the k smallest pair sums instead?", "How does this generalise to merging k sorted lists?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/merge-k-sorted-lists", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "GeeksforGeeks", "title": "Maximum Sum Combination", "url": "https://www.geeksforgeeks.org/problems/maximum-sum-combination/1"}
previous: "interview-questions:dsa/maximum-frequency-stack"
next: "interview-questions:dsa/find-median-from-data-stream"
---

## Problem

You have two integer arrays `a` and `b` of the same length n, and a count `k` (at most n · n). A combination takes one element from `a` and one from `b` (by position) and its value is their sum. Return the k largest combination sums, largest first. Equal sums from different index pairs count separately. This is GeeksforGeeks: Maximum Sum Combination.

## Examples

```text
a = [4, 1],     b = [3, 5],     k = 2   ->  [9, 7]    (4+5, 4+3)
a = [1, 4, 2],  b = [2, 5, 1],  k = 3   ->  [9, 7, 6] (4+5, 2+5, 4+2 or 1+5)
a = [3, 3],     b = [3, 3],     k = 4   ->  [6, 6, 6, 6]
```

## Approach 1: brute force

Form all n² sums, sort them in descending order, keep the first k.

```python
def top_sums_brute(a, b, k):
    sums = sorted((x + y for x in a for y in b), reverse=True)
    return sums[:k]
```

**Complexity:** O(n² log n) time and O(n²) space, which hurts once n reaches tens of thousands.

## Approach 2: optimal (heap over a sorted grid)

Sort both arrays in descending order and picture the grid of sums `a[i] + b[j]`. Every row and every column is non-increasing, so the top-left cell is the largest. After you take a cell, the next largest is either one already waiting in the heap or one of the cells directly right of or below a cell you have taken. So a heap seeded with `(0, 0)` and expanded by those two neighbours yields the sums in order, one pop at a time. A visited set stops a cell from entering the heap twice, once from above and once from the left.

```python
import heapq

def top_sums(a, b, k):
    if not a or not b or k <= 0:
        return []
    a = sorted(a, reverse=True)
    b = sorted(b, reverse=True)
    n, m = len(a), len(b)
    heap = [(-(a[0] + b[0]), 0, 0)]
    seen = {(0, 0)}
    result = []
    while heap and len(result) < k:
        neg, i, j = heapq.heappop(heap)
        result.append(-neg)
        for ni, nj in ((i + 1, j), (i, j + 1)):
            if ni < n and nj < m and (ni, nj) not in seen:
                seen.add((ni, nj))
                heapq.heappush(heap, (-(a[ni] + b[nj]), ni, nj))
    return result
```

**Why it is correct:** any cell other than `(0, 0)` has a neighbour above or to its left whose sum is at least as large. By induction, when a cell's turn comes, that neighbour has already been popped, so the cell is already in the heap. The heap therefore always contains the largest sum not yet taken.

**Complexity:** O(n log n) to sort; each pop pushes at most two cells, so O(k log k) for the heap work. Space O(k) for the heap and visited set.

## Tests

```python
import random

for f in (top_sums, top_sums_brute):
    assert f([4, 1], [3, 5], 2) == [9, 7]
    assert f([1, 4, 2], [2, 5, 1], 3) == [9, 7, 6]
    assert f([3, 3], [3, 3], 4) == [6, 6, 6, 6]       # duplicate sums count separately
    assert f([-1, -5], [-2, -3], 3) == [-3, -4, -7]   # negatives
    assert f([7], [8], 1) == [15]

assert top_sums([], [], 2) == []

random.seed(10)
for _ in range(400):
    n = random.randint(1, 6)
    a = [random.randint(-9, 9) for _ in range(n)]
    b = [random.randint(-9, 9) for _ in range(n)]
    k = random.randint(1, n * n)
    assert top_sums(a, b, k) == top_sums_brute(a, b, k)
print("ok")
```

## Edge cases and pitfalls

- Track visited index pairs, not visited sums. Different pairs can have the same sum and must all be returned.
- Without the visited set, a cell can be pushed twice and appear twice in the output.
- Pushing only `(i + 1, j)` or only `(i, j + 1)` misses cells; both neighbours are needed.
- A tempting shortcut, "take the top k of each array and combine them", is still O(k²) and only helps when k is much smaller than n.

## Where this shows up in data engineering

Top-k over a cross product appears when ranking pairs: best product bundles from two price lists, highest combined scores in a two-stage retrieval system, or the most expensive joins when estimating costs. The general lesson is to avoid materialising the full cross join when only the top few rows matter; a sorted frontier plus a heap reads just enough of it.

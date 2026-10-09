---
title: "Triplets with Smaller Sum: Count Many Pairs at Once With Two Pointers"
seoTitle: "Triplets with Smaller Sum: Two Pointers"
description: "Count the triples of distinct positions whose sum is below a limit. Sort, fix one value, and count a whole block of pairs per pointer move: O(n²) time."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the array; the count of triples does not depend on order because each triple is a set of positions. Fix the first index i and run two pointers lo = i + 1, hi = n − 1. If the sum is below the limit, then nums[lo] paired with every index from lo + 1 to hi also works, so add hi − lo to the count in one step and move lo right. Otherwise move hi left. That is O(n²) time after an O(n log n) sort, and O(1) extra space. The trick worth explaining is counting a block of pairs per step rather than one pair at a time."
followUps: ["How would you count triples with sum at most the limit, or exactly equal to it?", "What changes if you must list the triples instead of counting them?", "Why is sorting allowed when the problem talks about indices i < j < k?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers", "interview-questions:dsa/3sum"]
practice: {"platform": "GeeksforGeeks", "title": "Triplets with Smaller Sum", "url": "https://www.geeksforgeeks.org/problems/count-triplets-with-sum-smaller-than-x5549/1"}
---

## Problem

You are given a list of integers `arr` and an integer `limit`. Count the triples of positions `i < j < k` for which `arr[i] + arr[j] + arr[k] < limit`. Positions must differ, but values may repeat. Return the count. This is the GeeksforGeeks problem Triplets with Smaller Sum (the same task appears on LeetCode as 3Sum Smaller, which is subscription-only).

## Examples

```text
arr = [3, -1, 2, 5],   limit = 5   ->  1   (only 3 + -1 + 2 = 4)
arr = [-2, 0, 1, 3],   limit = 2   ->  2   (-2 + 0 + 1 = -1 and -2 + 0 + 3 = 1)
arr = [1, 1, 1, 1],    limit = 4   ->  4   (any 3 of the 4 positions sum to 3)
arr = [5, 6, 7],       limit = 10  ->  0
```

## Approach 1: brute force

Check every triple of positions.

```python
def count_triplets_brute(arr, limit):
    n = len(arr)
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                if arr[i] + arr[j] + arr[k] < limit:
                    count += 1
    return count
```

**Complexity:** O(n³) time, O(1) extra space.

## Approach 2: optimal (sort + counting two pointers)

**Idea in plain English:** a triple is a set of three positions, and sorting only renames the positions, so the number of qualifying triples is unchanged. After sorting, fix the smallest element `i` and look at the range to its right with `lo` and `hi`. If `arr[i] + arr[lo] + arr[hi]` is below the limit, replacing `hi` by anything between `lo + 1` and `hi` makes the sum even smaller, so all `hi − lo` of those pairs qualify. Count them at once and move `lo` right. If the sum is too big, `hi` cannot be part of any pair with `lo` or larger, so move `hi` left.

Walkthrough on sorted `[-2, 0, 1, 3]`, `limit = 2`, `i = 0` (value −2):

| lo | hi | sum | action | count |
|---|---|---|---|---|
| 0 | 3 | 1 | below: add hi − lo = 2, lo right | 2 |
| 1 | 3 | 2 | not below: hi left | 2 |
| lo meets hi | | | stop | 2 |

With `i = 1` (value 0), the only pair is (1, 3), sum 4, which fails. Total: 2.

```python
def count_triplets(arr, limit):
    arr = sorted(arr)
    n = len(arr)
    count = 0
    for i in range(n - 2):
        lo, hi = i + 1, n - 1
        while lo < hi:
            if arr[i] + arr[lo] + arr[hi] < limit:
                count += hi - lo        # every k in (lo, hi] works with this lo
                lo += 1
            else:
                hi -= 1
    return count
```

**Why it is correct:** for a fixed `i` and `lo`, the qualifying `k` values form a prefix of the sorted range, from `lo + 1` up to some largest index. The `hi` pointer only moves left past indices that fail with the current `lo`, and since `lo` only increases, those indices also fail with every later `lo`. So when the sum first drops below the limit, `hi` is exactly the largest valid partner and `hi − lo` counts all of them. Do not skip duplicate values here: equal values at different positions are different triples.

**Complexity:** O(n log n) to sort and O(n²) for the scans, O(1) extra space beyond the sorted copy.

## Tests

```python
import random

for f in (count_triplets, count_triplets_brute):
    assert f([3, -1, 2, 5], 5) == 1
    assert f([-2, 0, 1, 3], 2) == 2
    assert f([1, 1, 1, 1], 4) == 4            # duplicates count separately
    assert f([5, 6, 7], 10) == 0
    assert f([5, 6, 7], 19) == 1              # exactly three elements
    assert f([1, 2], 100) == 0                # fewer than three
    assert f([], 0) == 0
    assert f([-5, -5, -5, -5, -5], -14) == 10 # all C(5, 3) triples

random.seed(5549)
for _ in range(500):
    arr = [random.randint(-10, 10) for _ in range(random.randint(0, 12))]
    limit = random.randint(-25, 25)
    assert count_triplets(arr, limit) == count_triplets_brute(arr, limit)
```

## Edge cases and pitfalls

- The condition is strictly less than. Using `<=` silently counts triples that hit the limit exactly.
- Add `hi − lo`, not `hi − lo + 1`: the pair partner ranges over `lo + 1 .. hi`, which is `hi − lo` indices.
- Do not deduplicate values the way 3Sum does. Here positions, not value sets, are counted.
- With fewer than three elements the answer is 0; the loops above handle it without special cases.
- The count can reach about n³ / 6, so in fixed-width languages use a 64-bit counter.

## Where this shows up in data engineering

Counting pairs or triples under a threshold without listing them is a common analytics shape, for example "how many order bundles of three items fit under a shipping weight". The counting-two-pointer trick is the same one used to count rows within a range after sorting, which is how range-count joins and percentile approximations avoid a nested loop.

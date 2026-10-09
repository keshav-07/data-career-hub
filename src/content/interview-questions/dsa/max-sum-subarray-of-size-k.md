---
title: "Max Sum Subarray of Size K: The Fixed-Size Sliding Window"
seoTitle: "Max Sum Subarray of Size K: Fixed Window"
description: "Find the largest sum of any k consecutive elements. Keep a running window sum, add the new value, subtract the old one, and track the best: O(n) time."
technology: ["dsa"]
topic: ["sliding-window", "arrays"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Neighbouring windows of length k share k − 1 elements, so do not re-add them. Sum the first k values, then for each later index add the value entering the window and subtract the value leaving it, and keep the largest sum seen. This is O(n) time and O(1) space, compared with O(n · k) for summing every window from scratch. Initialise the best with the first window's sum, not zero, so negative inputs work."
followUps: ["How would you return the start index of the best window as well?", "What changes if you need the longest window whose sum is at most a target?", "How would you compute the sum of every window, as a rolling sum?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window"]
practice: {"platform": "GeeksforGeeks", "title": "Max Sum Subarray of Size K", "url": "https://www.geeksforgeeks.org/problems/max-sum-subarray-of-size-k5313/1"}
previous: "interview-questions:dsa/maximum-average-subarray-i"
next: "interview-questions:dsa/longest-substring-without-repeating-characters"
---

## Problem

You are given a list of integers `arr` and an integer `k` with 1 ≤ k ≤ len(arr). Return the largest sum of any contiguous block of exactly `k` elements. This is the GeeksforGeeks problem Max Sum Subarray of Size K, and the standard first exercise for the fixed-size sliding window.

## Examples

```text
arr = [4, 2, 7, 1, 8, 3],  k = 3   ->  16   (7 + 1 + 8)
arr = [5, -9, 6],          k = 1   ->  6
arr = [-4, -2, -7],        k = 2   ->  -6   (-4 + -2)
arr = [3, 3, 3],           k = 3   ->  9    (k equals the length)
```

## Approach 1: brute force

Sum every window of length `k` from scratch and keep the largest.

```python
def max_sum_k_brute(arr, k):
    best = None
    for start in range(len(arr) - k + 1):
        total = sum(arr[start:start + k])
        if best is None or total > best:
            best = total
    return best
```

**Complexity:** O((n − k + 1) · k) time, which is O(n · k), and O(k) space per slice. When `k` is around n / 2 this is quadratic.

## Approach 2: optimal (fixed-size sliding window)

**Idea in plain English:** moving the window one step to the right adds one element on the right and drops one on the left; the other k − 1 elements are unchanged. So the new sum is the old sum plus the entering value minus the leaving value. You do one addition and one subtraction per step instead of k additions.

Walkthrough on `[4, 2, 7, 1, 8, 3]`, `k = 3`:

| window | update | sum | best |
|---|---|---|---|
| [4, 2, 7] | first window | 13 | 13 |
| [2, 7, 1] | +1 − 4 | 10 | 13 |
| [7, 1, 8] | +8 − 2 | 16 | 16 |
| [1, 8, 3] | +3 − 7 | 12 | 16 |

```python
def max_sum_k(arr, k):
    window = sum(arr[:k])
    best = window
    for right in range(k, len(arr)):
        window += arr[right] - arr[right - k]
        best = max(best, window)
    return best
```

**Why it is correct:** after the update at index `right`, `window` equals the sum of `arr[right - k + 1 .. right]`, because the previous value covered `arr[right - k .. right - 1]` and the update removes the first of those and adds `arr[right]`. Every window of length k ends at exactly one index from k − 1 to n − 1, so every window is examined once and the maximum is the answer.

**Complexity:** O(n) time, O(1) extra space.

## Tests

```python
import random

for f in (max_sum_k, max_sum_k_brute):
    assert f([4, 2, 7, 1, 8, 3], 3) == 16
    assert f([5, -9, 6], 1) == 6                 # k = 1: the maximum element
    assert f([-4, -2, -7], 2) == -6              # all negative
    assert f([3, 3, 3], 3) == 9                  # k = n: one window
    assert f([0, 0, 0, 0], 2) == 0
    assert f([10**9, 10**9, 1], 2) == 2 * 10**9  # large values
    assert f([1, 2, 3, 100], 2) == 103           # best window at the end

random.seed(5313)
for _ in range(500):
    arr = [random.randint(-30, 30) for _ in range(random.randint(1, 15))]
    k = random.randint(1, len(arr))
    assert max_sum_k(arr, k) == max_sum_k_brute(arr, k)

big = [random.randint(-1000, 1000) for _ in range(100_000)]
assert max_sum_k(big, 500) == max(max_sum_k(big[:50_000], 500), max_sum_k(big[49_501:], 500))
```

## Edge cases and pitfalls

- Starting `best` at 0 is the classic bug: with all-negative input the answer is negative.
- Subtract `arr[right - k]`, the element that just left. Using `right - k + 1` is an off-by-one that shrinks the window.
- If `k` can exceed the length (some variants allow it), decide up front what to return; the code above assumes 1 ≤ k ≤ n.
- In fixed-width integer languages, use a 64-bit accumulator; the sum of k large values can overflow 32 bits.

## Where this shows up in data engineering

A fixed-length window over ordered data is a rolling aggregate, such as a 7-day revenue total. In SQL you write `SUM(amount) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`, and engines can evaluate such frames incrementally in the same add-new, subtract-old way. Stream processors use the same trick for sliding windows so each event is processed in constant time.

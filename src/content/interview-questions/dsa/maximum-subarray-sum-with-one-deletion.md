---
title: "Maximum Subarray Sum with One Deletion: Kadane With Two States"
seoTitle: "Max Subarray Sum with One Deletion: Kadane x2"
description: "Find the largest subarray sum when you may delete at most one element. Learn to extend Kadane's algorithm with a second state that has already used its deletion."
technology: ["dsa"]
topic: ["dynamic-programming", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Track two running values for subarrays ending at the current index: keep, the best sum with no deletion (plain Kadane: max(x, keep + x)), and drop, the best sum with exactly one deletion: max(drop + x, keep_before), where keep_before means you delete the current element. Update drop from the old keep before updating keep. The answer is the largest value either state reaches. This is O(n) time and O(1) space. The pitfall: the result must be non-empty, so an all-negative array returns its largest element, not 0."
followUps: ["How would you allow up to k deletions?", "Can you solve it with forward and backward Kadane arrays instead, and what does each array mean?", "How would you return the subarray and the deleted index, not just the sum?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/maximum-subarray"]
practice: {"platform": "LeetCode", "number": 1186, "title": "Maximum Subarray Sum with One Deletion", "url": "https://leetcode.com/problems/maximum-subarray-sum-with-one-deletion/"}
previous: "interview-questions:dsa/maximum-product-subarray"
next: "interview-questions:dsa/maximum-absolute-sum-of-any-subarray"
---

## Problem

You are given a list of integers `arr`. Choose a non-empty contiguous subarray, then optionally delete one element from it, and the subarray must still be non-empty afterwards. Return the largest possible sum of what remains. This is LeetCode 1186, Maximum Subarray Sum with One Deletion.

The list has up to about 10^5 elements and values can be negative.

## Examples

```text
arr = [2, -4, 3, 1]          ->  6    (take [2, -4, 3, 1], delete -4)
arr = [5, -1, -1, 5]         ->  9    (delete one -1, keep the other)
arr = [-3, -7, -2]           ->  -2   (cannot delete the only element; take [-2])
arr = [4, 1]                 ->  5    (no deletion needed)
```

## Approach 1: brute force

Try every subarray, and for each one try "no deletion" and "delete position d".

```python
def max_sum_one_deletion_brute(arr):
    best = float("-inf")
    n = len(arr)
    for i in range(n):
        for j in range(i, n):
            total = sum(arr[i:j + 1])
            best = max(best, total)                   # no deletion
            if j > i:                                 # something must remain
                for d in range(i, j + 1):
                    best = max(best, total - arr[d])
    return best
```

**Complexity:** O(n³) time, O(1) extra space apart from the slice. Fine as a test oracle.

## Approach 2: optimal (Kadane with a deletion state)

**Key insight:** plain Kadane keeps the best sum of a subarray that ends at the current index. Add a second running value for subarrays that end here and have already used their one deletion. There are only two ways to be in that state at index `i`:

- you used the deletion earlier, and now extend with `arr[i]`: `drop + arr[i]`;
- you delete `arr[i]` itself, keeping the best no-deletion subarray that ended at `i - 1`: `keep`.

```python
def max_sum_one_deletion(arr):
    keep = arr[0]                 # best sum ending here, no deletion
    drop = float("-inf")          # best sum ending here, one deletion used
    best = arr[0]
    for x in arr[1:]:
        drop = max(drop + x, keep)          # uses the old keep
        keep = max(keep + x, x)
        best = max(best, keep, drop)
    return best
```

Walkthrough on `[2, -4, 3, 1]`:

| x | drop | keep | best |
|---|---|---|---|
| 2 (start) | -inf | 2 | 2 |
| -4 | max(-inf, 2) = 2 | max(-2, -4) = -2 | 2 |
| 3 | max(5, -2) = 5 | max(1, 3) = 3 | 5 |
| 1 | max(6, 3) = 6 | max(4, 1) = 4 | 6 |

**Why it is correct:** every candidate answer ends at some index `i`, and either has no deletion (covered by `keep`, which is Kadane's invariant) or has one deletion at some `d ≤ i`. If `d = i`, the rest is a no-deletion subarray ending at `i - 1`, whose best is the old `keep`. If `d < i`, removing `arr[i]` leaves a one-deletion subarray ending at `i - 1`, whose best is the old `drop`. Starting `drop` at minus infinity stops a "delete the only element" empty answer.

**Complexity:** O(n) time, O(1) extra space.

## Tests

```python
import random

for f in (max_sum_one_deletion, max_sum_one_deletion_brute):
    assert f([2, -4, 3, 1]) == 6
    assert f([5, -1, -1, 5]) == 9
    assert f([-3, -7, -2]) == -2             # all negative: no empty answer
    assert f([4, 1]) == 5
    assert f([-5]) == -5                     # single element cannot be deleted
    assert f([-1, -1]) == -1
    assert f([3, -100, 4, -100, 5]) == 9     # one deletion bridges one gap: 4 + 5

random.seed(6)
for _ in range(500):
    arr = [random.randint(-8, 8) for _ in range(random.randint(1, 9))]
    assert max_sum_one_deletion(arr) == max_sum_one_deletion_brute(arr)
```

## Edge cases and pitfalls

- **Order of updates.** Compute `drop` from the previous `keep` before you overwrite `keep`; otherwise you delete an element and keep it at the same time.
- **Non-empty result.** Starting `best` at 0 or `drop` at 0 returns 0 for an all-negative array, which is wrong.
- Deleting is optional, and deleting a positive element is never useful, but the recurrence does not need a special case for that.
- An alternative uses two arrays: best sum ending at each index from the left and starting at each index from the right; deleting `i` joins `left[i - 1] + right[i + 1]`. It is also O(n) but uses O(n) space.

## Where this shows up in data engineering

"Best run allowing one exception" appears when scoring streaks in event data, such as the longest high-revenue stretch that tolerates one bad day, or a trend that ignores a single outlier reading. The two-state running update is also how streaming jobs keep small amounts of state per key instead of re-scanning history.

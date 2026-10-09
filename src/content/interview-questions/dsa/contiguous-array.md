---
title: "Contiguous Array: Longest Balanced 0/1 Subarray via Prefix Sums"
seoTitle: "Contiguous Array: Balanced 0s and 1s in O(n)"
description: "Find the longest subarray with equal numbers of 0s and 1s. Learn to count 0 as -1 and store the first index of each prefix sum, solving it in one O(n) pass."
technology: ["dsa"]
topic: ["prefix-sum", "hashing"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Treat each 0 as -1 and each 1 as +1. A subarray is balanced exactly when its sum is 0, which means the running sum before it equals the running sum at its end. Walk the array keeping the running sum and a map from each sum to the first index where it appeared, seeded with {0: -1}. When a sum repeats, the gap back to its first index is a balanced subarray; keep the longest. Store only the first index, because the earliest start gives the longest slice. O(n) time, O(n) space."
followUps: ["How would you count the balanced subarrays instead of finding the longest?", "How does this generalise to the longest subarray with sum exactly k?", "Can you do it with an array instead of a dictionary, and how large must it be?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/subarray-sum-equals-k"]
practice: {"platform": "LeetCode", "number": 525, "title": "Contiguous Array", "url": "https://leetcode.com/problems/contiguous-array/"}
---

## Problem

You are given a list `nums` containing only 0s and 1s. Return the length of the longest contiguous subarray that contains the same number of 0s and 1s, or 0 if there is none. This is LeetCode 525, Contiguous Array.

The list has up to about 10^5 elements.

## Examples

```text
nums = [1, 1, 0, 1, 0, 0, 1]   ->  6    ([1, 0, 1, 0, 0, 1] or [1, 1, 0, 1, 0, 0])
nums = [0, 1]                  ->  2
nums = [1, 1, 1]               ->  0    (no balanced subarray)
nums = [0, 0, 1, 1, 0]         ->  4
```

## Approach 1: brute force

Try every start, extend the end, and keep a running balance.

```python
def longest_balanced_brute(nums):
    best = 0
    for i in range(len(nums)):
        balance = 0
        for j in range(i, len(nums)):
            balance += 1 if nums[j] == 1 else -1
            if balance == 0:
                best = max(best, j - i + 1)
    return best
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (prefix sum with first-seen index)

**Key insight:** replace each 0 with -1. Then "as many 0s as 1s" means "sums to 0". A slice sums to 0 exactly when the running sum just before it equals the running sum at its last element. So for each running sum, remember the first index where it occurred; whenever you see it again, the stretch in between is balanced.

Walkthrough on `[1, 1, 0, 1, 0, 0, 1]`. The map starts as `{0: -1}`, meaning "a sum of 0 before index 0".

| i | value | running sum | first seen at | length |
|---|---|---|---|---|
| 0 | 1 | 1 | new, store 0 | |
| 1 | 1 | 2 | new, store 1 | |
| 2 | 0 | 1 | 0 | 2 |
| 3 | 1 | 2 | 1 | 2 |
| 4 | 0 | 1 | 0 | 4 |
| 5 | 0 | 0 | -1 | 6 |
| 6 | 1 | 1 | 0 | 6 |

```python
def longest_balanced(nums):
    first_index = {0: -1}
    running = 0
    best = 0
    for i, x in enumerate(nums):
        running += 1 if x == 1 else -1
        if running in first_index:
            best = max(best, i - first_index[running])
        else:
            first_index[running] = i
    return best
```

**Why it is correct:** the slice from `a + 1` to `i` is balanced exactly when the running sums at `a` and `i` are equal (with index -1 standing for the empty prefix). For a fixed end `i`, the longest balanced slice starts right after the earliest index with the same sum, and the map stores exactly that earliest index because it is never overwritten.

**Complexity:** O(n) time, O(n) extra space. The running sum lies between `-n` and `n`, so a list of size `2n + 1` can replace the dictionary.

## Tests

```python
import random

for f in (longest_balanced, longest_balanced_brute):
    assert f([1, 1, 0, 1, 0, 0, 1]) == 6
    assert f([0, 1]) == 2
    assert f([1, 1, 1]) == 0                 # all the same
    assert f([0, 0, 1, 1, 0]) == 4
    assert f([0]) == 0                       # single element
    assert f([1, 0, 1, 0, 1, 0]) == 6        # the whole array
    assert f([]) == 0                        # defensive

random.seed(8)
for _ in range(500):
    arr = [random.randint(0, 1) for _ in range(random.randint(1, 14))]
    assert longest_balanced(arr) == longest_balanced_brute(arr)
```

## Edge cases and pitfalls

- **Seed with `{0: -1}`.** Without it, a balanced prefix such as the whole array `[0, 1]` is missed, or measured one short.
- **Keep the first index, not the latest.** Overwriting the stored index on each repeat shrinks the answer.
- Counting 0 as 0 (not -1) breaks the idea: the sum then measures the number of 1s, not the balance.
- A sliding window does not work here. The window cannot tell whether to shrink or grow, because the balance can move either way.

## Where this shows up in data engineering

Turning two categories into +1 and -1 and tracking a running balance is how you find periods where inflows and outflows cancel out, such as logins against logouts or credits against debits. In SQL the running balance is a `SUM(...) OVER (ORDER BY ts)`, and two rows with the same balance bound a period that nets to zero.

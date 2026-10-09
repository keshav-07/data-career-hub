---
title: "Set Mismatch: Find the Duplicate and the Missing Number With Cyclic Sort"
seoTitle: "Set Mismatch: Duplicate and Missing via Cyclic Sort"
description: "One value in 1..n was copied over another. Find the duplicate and the missing number with counting, cyclic sort in O(1) space, or sum arithmetic."
technology: ["dsa"]
topic: ["arrays", "hashing"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Every value v in 1..n has a home at index v - 1. Cyclic sort swaps each value home, skipping when the home already holds that value. Afterwards exactly one slot i holds the wrong value: that value is the duplicate and i + 1 is the missing number. That is O(n) time and O(1) extra space. A count array is simpler at O(n) space, and sum arithmetic also works: sum(nums) - n(n+1)/2 equals duplicate minus missing, and the sum of squares gives the second equation."
followUps: ["How would you solve it if the array is read-only and you need O(1) space?", "What changes if several values were duplicated?", "Can XOR find the pair, and how do you tell which one is the duplicate?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 645, "title": "Set Mismatch", "url": "https://leetcode.com/problems/set-mismatch/"}
---

## Problem

A list `nums` of length `n` should have contained each number from 1 to `n` exactly once, but one number was overwritten by a copy of another. So one value appears twice and one value is missing. Return `[duplicate, missing]`. This is LeetCode 645, Set Mismatch.

The input is unsorted and `n` is at least 2.

## Examples

```text
nums = [1, 3, 3, 4]        ->  [3, 2]
nums = [2, 2]              ->  [2, 1]
nums = [4, 1, 2, 2]        ->  [2, 3]
nums = [1, 1]              ->  [1, 2]   (missing value at the top of the range)
```

## Approach 1: brute force with counts

Count each value and read off the one seen twice and the one seen zero times.

```python
def mismatch_count(nums):
    n = len(nums)
    count = [0] * (n + 1)
    for v in nums:
        count[v] += 1
    dup = next(v for v in range(1, n + 1) if count[v] == 2)
    missing = next(v for v in range(1, n + 1) if count[v] == 0)
    return [dup, missing]
```

**Complexity:** O(n) time, O(n) extra space. Testing `nums.count(v)` for each v instead would be O(n²).

## Approach 2: optimal (cyclic sort)

**Key insight:** if every value were present, swapping each value to index `value - 1` would sort the list perfectly. With one duplicate, the extra copy has no home, so it settles in the home of the missing number. A single scan then reveals both.

```python
def mismatch_cyclic(nums):
    nums = list(nums)
    i = 0
    while i < len(nums):
        home = nums[i] - 1
        if nums[home] != nums[i]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    for i, v in enumerate(nums):
        if v != i + 1:
            return [v, i + 1]
    return []
```

On `[4, 1, 2, 2]` the loop finishes with `[1, 2, 2, 4]`. Index 2 holds 2 instead of 3, so the answer is `[2, 3]`.

**Why it is correct:** every swap puts one value in its home for good, so the loop ends after at most `n` swaps with each present value at home. Only `n - 1` distinct values exist, so exactly one slot is left over. It must be the home of the missing number, and the only value that can sit there is the surplus copy.

**Complexity:** O(n) time, O(1) extra space (the copy is optional).

## Approach 3: arithmetic

Let `d` be the duplicate and `m` the missing value. Compared with 1..n, the list gains `d` and loses `m`, so `sum(nums) - expected_sum = d - m` and `sum of squares - expected_squares = d² - m² = (d - m)(d + m)`. Dividing gives `d + m`, and two equations give both.

```python
def mismatch_math(nums):
    n = len(nums)
    diff = sum(nums) - n * (n + 1) // 2                      # d - m
    sq_diff = sum(v * v for v in nums) - n * (n + 1) * (2 * n + 1) // 6   # d^2 - m^2
    total = sq_diff // diff                                  # d + m
    d = (diff + total) // 2
    return [d, d - diff]
```

`diff` is never zero because `d != m`. Python integers do not overflow; in fixed-width languages the squares can, which is one reason to prefer cyclic sort there.

## Tests

```python
import random

for f in (mismatch_cyclic, mismatch_math, mismatch_count):
    assert f([1, 3, 3, 4]) == [3, 2]
    assert f([2, 2]) == [2, 1]
    assert f([1, 1]) == [1, 2]            # missing value is n
    assert f([4, 1, 2, 2]) == [2, 3]
    assert f([3, 2, 3, 4, 6, 5]) == [3, 1]  # missing value is 1

random.seed(5)
for _ in range(500):
    n = random.randint(2, 12)
    arr = list(range(1, n + 1))
    d, m = random.sample(arr, 2)
    arr[arr.index(m)] = d
    random.shuffle(arr)
    assert mismatch_cyclic(arr) == mismatch_math(arr) == mismatch_count(arr) == [d, m]
```

## Edge cases and pitfalls

- Return the duplicate first. Swapping the order is the most common wrong answer on this problem.
- The swap guard must compare values (`nums[home] != nums[i]`), otherwise the two copies swap with each other forever.
- The missing number can be 1 or `n`; check that the scan covers both ends.
- Sign marking (negate `nums[abs(v) - 1]`) also works: the value whose slot is already negative is the duplicate, and the slot left positive is the missing number.

## Where this shows up in data engineering

A key that appears twice next to a key that is missing is a classic sign of a bad overwrite or a replay during ingestion. Reconciliation checks compare a batch against its expected ID range and report both directions; in SQL that is a `GROUP BY ... HAVING COUNT(*) > 1` plus an anti-join against a generated series.

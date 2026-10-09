---
title: "First Missing Positive: Cyclic Sort Into Home Slots in O(n) Time, O(1) Space"
seoTitle: "First Missing Positive: Cyclic Sort, O(1) Space"
description: "Find the smallest positive integer missing from an unsorted array in O(n) time and O(1) extra space. Learn why the answer lies in 1..n+1 and how cyclic sort finds it."
technology: ["dsa"]
topic: ["arrays", "hashing"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "With n numbers, the answer is in 1..n+1: if all of 1..n are present it is n+1, otherwise it is the first gap. So only values in 1..n matter, and value v has a home at index v - 1. Cyclic sort: for each index, while its value v is in range and nums[v - 1] != v, swap v into its home. Ignore values out of range and duplicates. Then the first index i with nums[i] != i + 1 gives i + 1; if none, return n + 1. Each swap places a value for good, so it is O(n) time and O(1) extra space. A set gives O(n) space; sorting gives O(n log n)."
followUps: ["Why can the answer never be larger than n + 1?", "How would you solve it with sign marking instead of swaps?", "How would you find the k smallest missing positives?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/find-all-numbers-disappeared-in-an-array"]
practice: {"platform": "LeetCode", "number": 41, "title": "First Missing Positive", "url": "https://leetcode.com/problems/first-missing-positive/"}
previous: "interview-questions:dsa/find-all-duplicates-in-an-array"
next: "interview-questions:dsa/contains-duplicate"
---

## Problem

You are given an unsorted list of integers `nums`, which may contain negatives, zeros, duplicates and very large values. Return the smallest positive integer (1, 2, 3, ...) that does not appear in it. This is LeetCode 41, First Missing Positive.

The challenge is the constraint: O(n) time and O(1) extra space. The list has up to about 10^5 elements.

## Examples

```text
nums = [3, 4, -1, 1]          ->  2
nums = [8, 9, 10]             ->  1    (1 is missing)
nums = [2, 1, 3]              ->  4    (1..n all present, so n + 1)
nums = [1, 1, 0, -5, 2]       ->  3    (duplicates and non-positives are ignored)
```

## Approach 1: brute force with a set

Put everything in a set and count upwards from 1.

```python
def first_missing_set(nums):
    seen = set(nums)
    candidate = 1
    while candidate in seen:
        candidate += 1
    return candidate
```

**Complexity:** O(n) time on average (the loop runs at most n + 1 times), but O(n) extra space, which the problem rules out. Sorting first and scanning avoids the set but costs O(n log n) time.

## Approach 2: optimal (cyclic sort)

**Key insight:** with `n` slots, at most `n` distinct positive values fit, so the answer is somewhere in `1..n+1`. Every value outside `1..n` is irrelevant, and every value `v` inside it has a home at index `v - 1`. Move each relevant value home by swapping, then scan for the first slot that does not hold its own value.

At each index, keep swapping while the current value is in range and its home does not already hold it. Values out of range and duplicates are left in place; they simply occupy slots whose own values are missing.

Walkthrough on `[3, 4, -1, 1]` (n = 4):

| step | array | note |
|---|---|---|
| i = 0 | `[-1, 4, 3, 1]` | 3 goes to index 2; -1 arrives and is out of range |
| i = 1 | `[-1, 1, 3, 4]` | 4 goes to index 3; 1 arrives |
| i = 1 | `[1, -1, 3, 4]` | 1 goes to index 0; -1 arrives, stop |
| i = 2, 3 | `[1, -1, 3, 4]` | 3 and 4 are already home |
| scan | `[1, -1, 3, 4]` | index 1 does not hold 2: answer 2 |

```python
def first_missing_positive(nums):
    nums = list(nums)                     # drop the copy if mutation is allowed
    n = len(nums)
    for i in range(n):
        while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
            home = nums[i] - 1
            nums[i], nums[home] = nums[home], nums[i]
    for i in range(n):
        if nums[i] != i + 1:
            return i + 1
    return n + 1
```

**Why it is correct:** a swap happens only when the home slot does not already hold its value, and afterwards it does, permanently, so there are at most `n` swaps in total. When the loop ends, every value in `1..n` that appears in the input sits at its home. The first slot that does not hold its own value is therefore the smallest missing positive. If every slot is correct, `1..n` are all present and the answer is `n + 1`.

**Complexity:** O(n) time, because the inner loop's swaps are bounded by `n` across the whole run. O(1) extra space (the copy is optional).

## Approach 3: sign marking

Make every irrelevant value harmless by replacing it with `n + 1`, then use the sign of `nums[v - 1]` as a "v is present" flag.

```python
def first_missing_mark(nums):
    nums = list(nums)
    n = len(nums)
    for i in range(n):
        if not 1 <= nums[i] <= n:
            nums[i] = n + 1
    for v in nums:
        v = abs(v)
        if v <= n and nums[v - 1] > 0:
            nums[v - 1] = -nums[v - 1]
    for i in range(n):
        if nums[i] > 0:
            return i + 1
    return n + 1
```

This is also O(n) time and O(1) extra space. The first pass matters: without it, negative inputs would look like flags.

## Tests

```python
import random

for f in (first_missing_positive, first_missing_mark, first_missing_set):
    assert f([3, 4, -1, 1]) == 2
    assert f([8, 9, 10]) == 1              # 1 missing
    assert f([2, 1, 3]) == 4               # n + 1
    assert f([1, 1, 0, -5, 2]) == 3        # duplicates, zero, negatives
    assert f([1]) == 2
    assert f([-3]) == 1
    assert f([2, 2]) == 1                  # duplicates of an in-range value
    assert f([10**9, 1]) == 2              # huge value is ignored
    assert f([]) == 1                      # empty list

random.seed(16)
for _ in range(1000):
    arr = [random.randint(-3, 9) for _ in range(random.randint(1, 9))]
    assert first_missing_positive(arr) == first_missing_mark(arr) == first_missing_set(arr)
```

## Edge cases and pitfalls

- **Guard against duplicates.** The loop condition must be `nums[nums[i] - 1] != nums[i]`. Checking only `nums[i] != i + 1` swaps two equal values forever on input like `[2, 2]`.
- **Compute the home before swapping.** In Python, `nums[i], nums[nums[i] - 1] = ...` assigns `nums[i]` first and then evaluates the second target with the new value, which corrupts the swap. Save `home` first, as above.
- Zero is not positive. An input of only non-positive values returns 1.
- The answer can be `n + 1`; returning `n` or -1 when every slot is filled is a common slip.

## Where this shows up in data engineering

Finding the smallest unused ID is a real allocation task: reusing freed slot numbers, partition IDs or worker numbers. More often, the takeaway is the range argument: when keys are known to be dense in `1..n`, the keys themselves can index a fixed-size array or bitmap, which is far cheaper than a general hash set.

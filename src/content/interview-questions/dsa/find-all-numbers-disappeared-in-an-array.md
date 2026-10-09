---
title: "Find All Numbers Disappeared in an Array: Cyclic Sort and In-Place Marking"
seoTitle: "Numbers Disappeared in an Array: Cyclic Sort"
description: "List every value from 1 to n missing from an array of n numbers. Learn cyclic sort and sign marking, which both use the array itself and need O(1) extra space."
technology: ["dsa"]
topic: ["arrays", "hashing"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Values lie in 1..n, so each value has a home slot: value v belongs at index v - 1. Cyclic sort swaps each value into its home until the slot already holds the right value; afterwards any index i whose slot does not hold i + 1 means i + 1 is missing. Each swap places one value for good, so it is O(n) time and O(1) extra space. Sign marking is an alternative: negate nums[abs(v) - 1] for every v, then positive slots are missing values. A set also works but costs O(n) space."
followUps: ["How would you also report which numbers appear twice?", "Can you solve it without modifying the input, and what does that cost?", "Why is the swap loop O(n) even though it has a nested while?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 448, "title": "Find All Numbers Disappeared in an Array", "url": "https://leetcode.com/problems/find-all-numbers-disappeared-in-an-array/"}
---

## Problem

You are given a list `nums` of length `n` in which every value is between 1 and `n`. Some values appear twice and others not at all. Return every value in the range 1 to `n` that does not appear, in increasing order. This is LeetCode 448, Find All Numbers Disappeared in an Array.

The follow-up asks for O(n) time without extra space beyond the output list.

## Examples

```text
nums = [3, 1, 3, 5, 1]     ->  [2, 4]
nums = [2, 2]              ->  [1]
nums = [1, 2, 3]           ->  []        (nothing missing)
nums = [4, 4, 4, 4]        ->  [1, 2, 3]
```

## Approach 1: brute force with a set

Put every value in a set, then test each candidate from 1 to `n`.

```python
def disappeared_set(nums):
    seen = set(nums)
    return [v for v in range(1, len(nums) + 1) if v not in seen]
```

**Complexity:** O(n) time, O(n) extra space for the set. (Without a set, testing `v in nums` for each candidate is O(n²).)

## Approach 2: optimal (cyclic sort)

**Key insight:** because the values are exactly the range of positions shifted by one, every value has a home. Put each value in its home by swapping. Duplicates have nowhere to go, so they end up sitting in the homes of the missing values.

At each index, keep swapping the current value to its home until either the current slot holds the right value or the home already holds a copy of the value (a duplicate). Then move on.

Walkthrough on `[3, 1, 3, 5, 1]`:

| step | array | note |
|---|---|---|
| i = 0 | `[3, 1, 3, 5, 1]` | 3 belongs at index 2, which already holds 3: duplicate, move on |
| i = 1 | `[1, 3, 3, 5, 1]` | swap 1 to index 0; now 3 at index 1, home holds 3, move on |
| i = 3 | `[1, 3, 3, 1, 5]` | swap 5 to index 4; then 1 at index 3, home holds 1, move on |
| scan | `[1, 3, 3, 1, 5]` | index 1 holds 3 (not 2), index 3 holds 1 (not 4): answer `[2, 4]` |

```python
def disappeared_cyclic(nums):
    nums = list(nums)              # work on a copy so callers keep their input
    i = 0
    while i < len(nums):
        home = nums[i] - 1
        if nums[home] != nums[i]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    return [i + 1 for i, v in enumerate(nums) if v != i + 1]
```

**Why it is correct:** a swap only happens when the home slot does not already hold the right value, and afterwards it does, permanently. So at most `n` swaps occur in total, and when the loop ends every value that is present sits in its own home. A slot that holds the wrong value can only mean its own value never appeared.

**Complexity:** O(n) time (at most `n` swaps plus `n` index advances), O(1) extra space apart from the output. The copy is a courtesy; drop it if mutating the input is allowed.

## Approach 3: sign marking

Use the sign of `nums[v - 1]` as a "seen v" flag. Values stay recoverable with `abs`.

```python
def disappeared_mark(nums):
    nums = list(nums)
    for v in nums:
        slot = abs(v) - 1
        if nums[slot] > 0:
            nums[slot] = -nums[slot]
    return [i + 1 for i, v in enumerate(nums) if v > 0]
```

**Complexity:** O(n) time, O(1) extra space. It is shorter than cyclic sort, but the cyclic sort pattern generalises better (duplicates, first missing positive, set mismatch).

## Tests

```python
import random

for f in (disappeared_cyclic, disappeared_mark, disappeared_set):
    assert f([3, 1, 3, 5, 1]) == [2, 4]
    assert f([2, 2]) == [1]
    assert f([1, 2, 3]) == []                 # nothing missing
    assert f([4, 4, 4, 4]) == [1, 2, 3]       # one value repeated
    assert f([1]) == []                       # smallest input
    assert f([]) == []                        # defensive

original = [2, 2, 1]
disappeared_cyclic(original)
assert original == [2, 2, 1]                  # input untouched

random.seed(11)
for _ in range(500):
    n = random.randint(1, 10)
    arr = [random.randint(1, n) for _ in range(n)]
    assert disappeared_cyclic(arr) == disappeared_mark(arr) == disappeared_set(arr)
```

## Edge cases and pitfalls

- Guard the swap with `nums[home] != nums[i]`, not `home != i`. Without it, two copies of the same value swap with each other forever.
- Do not advance `i` after a swap: the value that arrived at `i` still needs placing.
- In sign marking, read the slot with `abs(v)`; the value may already have been negated.
- Both in-place methods change the array. Say so, or copy it, if the caller needs the original.

## Where this shows up in data engineering

This is gap detection: finding missing sequence numbers, invoice IDs or daily partitions in a range you expect to be complete. In SQL you would anti-join against a generated series; in Python with a dense, known range, a bitmap or in-place marking finds the gaps without building a large set.

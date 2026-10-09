---
title: "Find All Duplicates in an Array: Cyclic Sort and Sign Marking in O(1) Space"
seoTitle: "Find All Duplicates in an Array: O(1) Space"
description: "Return every value that appears twice in an array whose values lie in 1..n. Learn cyclic sort and sign marking, which use the array as its own hash table."
technology: ["dsa"]
topic: ["arrays", "hashing"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Because every value v is in 1..n, index v - 1 can act as a flag for v. Sign marking: for each v, look at slot abs(v) - 1; if it is already negative, v has been seen before, so record it; otherwise negate it. Cyclic sort works too: swap each value to its home, then any slot i not holding i + 1 holds a duplicate. Both are O(n) time and O(1) extra space apart from the output, against O(n) for a set. Read values with abs() during marking, and state that the input is modified."
followUps: ["What if values could appear three or more times?", "How would you solve it if the array were read-only?", "How does this relate to Find the Duplicate Number, where you may not modify the array?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/find-all-numbers-disappeared-in-an-array"]
practice: {"platform": "LeetCode", "number": 442, "title": "Find All Duplicates in an Array", "url": "https://leetcode.com/problems/find-all-duplicates-in-an-array/"}
previous: "interview-questions:dsa/set-mismatch"
next: "interview-questions:dsa/contains-duplicate"
---

## Problem

You are given a list `nums` of length `n` in which every value is between 1 and `n`, and each value appears once or twice. Return every value that appears twice. This is LeetCode 442, Find All Duplicates in an Array.

The target is O(n) time and constant extra space beyond the output. Any order of the output is accepted; the code below returns the values in increasing order to keep tests simple.

## Examples

```text
nums = [3, 5, 2, 3, 1, 5]   ->  [3, 5]
nums = [1, 1]               ->  [1]
nums = [2, 1]               ->  []
nums = [1]                  ->  []
```

## Approach 1: brute force with a set

Remember every value seen; a value seen again is a duplicate.

```python
def duplicates_set(nums):
    seen, dup = set(), []
    for v in nums:
        if v in seen:
            dup.append(v)
        else:
            seen.add(v)
    return sorted(dup)
```

**Complexity:** O(n) time on average (plus the sort of the output), O(n) extra space. Sorting the input first and comparing neighbours avoids the set but costs O(n log n).

## Approach 2: optimal (sign marking)

**Key insight:** the values are a subset of the indices shifted by one, so the array can be its own "seen" table. Store the flag for value `v` in the sign of `nums[v - 1]`. The magnitude is kept, so the original value at that slot can still be read with `abs`.

Walkthrough on `[3, 5, 2, 3, 1, 5]`:

| v | slot | slot value before | action |
|---|---|---|---|
| 3 | 2 | 2 | negate |
| 5 | 4 | 1 | negate |
| 2 | 1 | 5 | negate |
| 3 | 2 | -2 | already negative: 3 is a duplicate |
| 1 | 0 | 3 | negate |
| 5 | 4 | -1 | already negative: 5 is a duplicate |

```python
def duplicates_mark(nums):
    nums = list(nums)                     # drop the copy if mutation is allowed
    dup = []
    for v in nums:
        slot = abs(v) - 1
        if nums[slot] < 0:
            dup.append(abs(v))
        else:
            nums[slot] = -nums[slot]
    return sorted(dup)
```

**Why it is correct:** slot `v - 1` is negated the first time `v` is met and never touched by any other value, because only `v` maps to it. So the slot is negative exactly when `v` has already been seen. Since each value appears at most twice, each duplicate is reported once.

**Complexity:** O(n) time, O(1) extra space apart from the output list. (The final `sorted` is only for the tests; without it the output is in second-occurrence order.)

## Approach 3: cyclic sort

Swap each value to its home slot. A value whose home already holds a copy stays where it is, so after the loop every slot that does not hold its own value contains a duplicate.

```python
def duplicates_cyclic(nums):
    nums = list(nums)
    i = 0
    while i < len(nums):
        home = nums[i] - 1
        if nums[home] != nums[i]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    return sorted(v for i, v in enumerate(nums) if v != i + 1)
```

Each spare copy occupies one slot that is not its home, so every duplicate appears exactly once in the result. It is O(n) time for the same reason as in the other cyclic sort problems: each swap fixes one value for good.

## Tests

```python
import random

for f in (duplicates_mark, duplicates_cyclic, duplicates_set):
    assert f([3, 5, 2, 3, 1, 5]) == [3, 5]
    assert f([1, 1]) == [1]
    assert f([2, 1]) == []                   # no duplicates
    assert f([1]) == []                      # single element
    assert f([2, 2, 3, 3]) == [2, 3]         # half the values duplicated
    assert f([]) == []                       # defensive

data = [2, 2, 1]
duplicates_mark(data)
assert data == [2, 2, 1]                     # the input list is not changed

random.seed(10)
for _ in range(500):
    n = random.randint(1, 12)
    values = list(range(1, n + 1))
    random.shuffle(values)
    arr = values[: (n + 1) // 2]
    arr += random.sample(arr, n - len(arr))  # each value at most twice
    random.shuffle(arr)
    assert duplicates_mark(arr) == duplicates_cyclic(arr) == duplicates_set(arr)
```

## Edge cases and pitfalls

- Use `abs(v)` both for the slot and for the reported value, because `v` itself may already have been negated.
- Sign marking relies on each value appearing at most twice. With three copies, the third would report the value again; guard with a check or switch approaches.
- In cyclic sort, the guard is `nums[home] != nums[i]`. Comparing indices instead loops forever on duplicates.
- Both in-place approaches change the array. If the caller needs it unchanged, copy it (and accept O(n) space) or restore the signs afterwards.

## Where this shows up in data engineering

Finding keys that occur twice is deduplication, one of the most common data quality checks. When the key space is dense and known, such as sequence numbers from 1 to n, a bitmap or in-place flag array finds duplicates with far less memory than a hash set, which matters when the data barely fits on one machine.

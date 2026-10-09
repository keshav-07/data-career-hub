---
title: "Remove Duplicates from Sorted Array: Compact Unique Values In Place"
seoTitle: "Remove Duplicates from Sorted Array: Two Pointers"
description: "Remove repeated values from a sorted array in place and return how many unique values remain. A read pointer and a write pointer solve it in one O(n) pass."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Because the array is sorted, equal values sit next to each other, so a value is new exactly when it differs from the last value kept. Keep a write pointer at the end of the unique prefix and scan with a read pointer; whenever the read value differs from the last kept value, copy it to the write slot and advance. Return the write pointer. This is O(n) time and O(1) extra space. The pitfall is comparing with the previous read value instead of the last written one, or forgetting the empty array."
followUps: ["How would you allow each value to appear at most twice?", "What changes if the array is not sorted?", "Why does the content after the returned length not matter?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers"]
practice: {"platform": "LeetCode", "number": 26, "title": "Remove Duplicates from Sorted Array", "url": "https://leetcode.com/problems/remove-duplicates-from-sorted-array/"}
---

## Problem

You are given a list of integers sorted in non-decreasing order. Rearrange it in place so that each distinct value appears once, in sorted order, at the front of the list, and return `k`, the number of distinct values. Only the first `k` positions are checked; whatever sits after them does not matter. You may not allocate a second list of size n. This is LeetCode 26, Remove Duplicates from Sorted Array.

## Examples

```text
[1, 1, 4, 4, 4, 9]   ->  k = 3, front = [1, 4, 9]
[-2, -2, -2]         ->  k = 1, front = [-2]
[3, 5, 8]            ->  k = 3, front = [3, 5, 8]   (nothing to remove)
[]                   ->  k = 0
```

## Approach 1: brute force

Walk the list and delete an element whenever it equals the one before it. Deleting from the middle of a Python list shifts every later element left, so each deletion costs O(n).

```python
def remove_duplicates_brute(nums):
    i = 1
    while i < len(nums):
        if nums[i] == nums[i - 1]:
            del nums[i]          # shifts the tail left: O(n)
        else:
            i += 1
    return len(nums)
```

**Complexity:** O(n²) time in the worst case (for example, all values equal), O(1) extra space. It also shrinks the list, which the original problem does not require.

## Approach 2: optimal (read and write pointers)

**Idea in plain English:** split the list into a finished part on the left (unique values, in order) and an unread part on the right. A read pointer scans every element once. The write pointer marks where the next new value goes. Since the input is sorted, a value is new if and only if it differs from the last value already written.

Walkthrough on `[1, 1, 4, 4, 4, 9]`:

| read | value | last kept | action | write after |
|---|---|---|---|---|
| 1 | 1 | 1 | skip | 1 |
| 2 | 4 | 1 | copy to slot 1 | 2 |
| 3 | 4 | 4 | skip | 2 |
| 4 | 4 | 4 | skip | 2 |
| 5 | 9 | 4 | copy to slot 2 | 3 |

```python
def remove_duplicates(nums):
    if not nums:
        return 0
    write = 1                      # nums[0] is always kept
    for read in range(1, len(nums)):
        if nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return write
```

**Why it is correct:** the invariant is that `nums[:write]` holds exactly the distinct values of `nums[:read]`, in sorted order. It holds at the start (one element). When `nums[read]` equals the last kept value, it is a duplicate, because sorting puts all copies together. When it differs, it is larger than everything kept, so appending it keeps the prefix sorted and distinct. The write pointer never passes the read pointer, so no unread value is overwritten.

**Complexity:** O(n) time, O(1) extra space, at most n − 1 writes.

## Tests

```python
import random

def check(f, nums):
    expected = sorted(set(nums))
    arr = list(nums)
    k = f(arr)
    assert k == len(expected)
    assert arr[:k] == expected

for f in (remove_duplicates, remove_duplicates_brute):
    check(f, [1, 1, 4, 4, 4, 9])
    check(f, [-2, -2, -2])           # all equal
    check(f, [3, 5, 8])              # already unique
    check(f, [])                     # empty
    check(f, [7])                    # single element
    check(f, [0, 0, 1, 1, 2, 2])     # pairs

random.seed(26)
for _ in range(400):
    nums = sorted(random.randint(-5, 5) for _ in range(random.randint(0, 15)))
    check(remove_duplicates, nums)
    check(remove_duplicates_brute, nums)

big = sorted([random.randint(0, 1000) for _ in range(100_000)])
check(remove_duplicates, big)
```

## Edge cases and pitfalls

- Handle the empty list before reading `nums[0]`; otherwise you get an index error or return 1.
- Compare against `nums[write - 1]`, the last value kept. Comparing with `nums[read - 1]` also works for this exact problem, but it breaks the "at most twice" variant, where you compare with `nums[write - 2]`.
- The method relies on sorting. On an unsorted list, equal values are not adjacent; you need a set of seen values instead, which costs O(n) space.
- Return the count, not the list. Callers read only the first `k` slots.

## Where this shows up in data engineering

Deduplicating a stream that is already sorted by key is a standard step in sort-merge pipelines: once records are ordered, you drop a record when its key matches the previous one, with no hash table and constant memory. The same idea is behind `uniq` on sorted input and behind keeping the first row per key after an `ORDER BY` in an external sort.

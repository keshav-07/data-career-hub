---
title: "Squares of a Sorted Array: Merge From Both Ends Without Sorting"
seoTitle: "Squares of a Sorted Array: Two Pointers"
description: "Square every value of a sorted array and return the squares in sorted order. Two pointers at the ends fill the result from the back in O(n) time."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Squaring breaks the order only because negative numbers flip: the largest square is always at one of the two ends of the sorted input. Put one pointer at each end, compare absolute values, write the larger square into the last free slot of the result, and move that pointer inward. Repeat until the pointers cross. This is O(n) time and O(n) for the output, versus O(n log n) for square-then-sort. Fill from the back; filling from the front would need the smallest square, which sits somewhere in the middle."
followUps: ["How would you do it if you had to fill the result from the front?", "Can you do it in place with O(1) extra space?", "What changes if the transform is x squared plus a times x plus b instead?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers"]
practice: {"platform": "LeetCode", "number": 977, "title": "Squares of a Sorted Array", "url": "https://leetcode.com/problems/squares-of-a-sorted-array/"}
previous: "interview-questions:dsa/remove-duplicates-from-sorted-array"
next: "interview-questions:dsa/segregate-0s-and-1s"
---

## Problem

You are given a list of integers sorted in non-decreasing order, possibly containing negative numbers. Return a new list holding the square of every value, also sorted in non-decreasing order. This is LeetCode 977, Squares of a Sorted Array.

## Examples

```text
[-5, -2, 0, 3, 4]   ->  [0, 4, 9, 16, 25]
[-7, -3, -1]        ->  [1, 9, 49]        (all negative: order reverses)
[2, 3, 6]           ->  [4, 9, 36]        (all non-negative: order kept)
[-3, 3]             ->  [9, 9]
```

## Approach 1: brute force

Square every value, then sort.

```python
def sorted_squares_brute(nums):
    return sorted(x * x for x in nums)
```

**Complexity:** O(n log n) time, O(n) space. It is correct and short, and in an interview it is a fine opening line, but it ignores the fact that the input is already sorted.

## Approach 2: optimal (two pointers from the ends)

**Idea in plain English:** picture the sorted input as two sorted runs. The negative part, read from right to left, has increasing absolute values; the non-negative part, read left to right, also has increasing absolute values. The biggest absolute value, and so the biggest square, must be at the far left or the far right. Compare the two ends, take the larger square, place it at the back of the result, and move that end inward. This is a merge of two sorted runs, done from the large end.

Walkthrough on `[-5, -2, 0, 3, 4]`:

| left | right | compare | write | slot |
|---|---|---|---|---|
| -5 | 4 | 25 > 16 | 25 | 4 |
| -2 | 4 | 4 < 16 | 16 | 3 |
| -2 | 3 | 4 < 9 | 9 | 2 |
| -2 | 0 | 4 > 0 | 4 | 1 |
| 0 | 0 | same element | 0 | 0 |

```python
def sorted_squares(nums):
    n = len(nums)
    result = [0] * n
    left, right = 0, n - 1
    for slot in range(n - 1, -1, -1):
        if abs(nums[left]) > abs(nums[right]):
            result[slot] = nums[left] * nums[left]
            left += 1
        else:
            result[slot] = nums[right] * nums[right]
            right -= 1
    return result
```

**Why it is correct:** at every step the unplaced values are exactly `nums[left..right]`, a contiguous sorted range. In a sorted range the value with the largest absolute value is at one of the two ends, so the square written is the largest of those remaining. Writing from the last slot backwards therefore produces a non-decreasing list. Each step places one value, so the loop runs exactly n times and the pointers meet on the final element.

**Complexity:** O(n) time, O(n) space for the output (O(1) besides it).

## Tests

```python
import random

for f in (sorted_squares, sorted_squares_brute):
    assert f([-5, -2, 0, 3, 4]) == [0, 4, 9, 16, 25]
    assert f([-7, -3, -1]) == [1, 9, 49]        # all negative
    assert f([2, 3, 6]) == [4, 9, 36]           # all non-negative
    assert f([-3, 3]) == [9, 9]                 # ties across zero
    assert f([0]) == [0]                        # single element
    assert f([]) == []                          # empty
    assert f([-10**4, 10**4]) == [10**8, 10**8] # large values

random.seed(977)
for _ in range(500):
    nums = sorted(random.randint(-20, 20) for _ in range(random.randint(0, 15)))
    assert sorted_squares(nums) == sorted_squares_brute(nums)
```

## Edge cases and pitfalls

- Do not try to fill from the front. The smallest square sits at the sign boundary, which you would first have to find (possible with binary search, but more code and more off-by-one risk).
- On ties (`abs(left) == abs(right)`) either choice is fine; the loop above takes the right one. Both squares end up in the result.
- An empty list must return an empty list; the loop above simply does not run.
- In languages with fixed-width integers, squaring a large value can overflow. Python integers do not, but say so in an interview.

## Where this shows up in data engineering

The pattern is a two-way merge of sorted runs, the core step of external merge sort, sort-merge joins and LSM-tree compaction. Whenever you know your data is already ordered in pieces, merging those pieces in linear time beats a full re-sort, and spotting that shortcut is the skill this problem tests.

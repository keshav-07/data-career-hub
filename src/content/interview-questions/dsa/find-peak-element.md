---
title: "Find Peak Element: Follow the Uphill Side with Binary Search"
seoTitle: "Find Peak Element with Binary Search"
description: "Return any index greater than its neighbours in O(log n) by always moving towards the larger neighbour. Python solutions, the proof it works and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
shortAnswer: "Treat positions outside the array as minus infinity and note that neighbours are never equal. Compare nums[mid] with nums[mid + 1]. If the right neighbour is larger, walking right keeps climbing and must hit a peak before the array ends, so lo = mid + 1. Otherwise mid is itself higher than its right side, so a peak exists at mid or to its left, so hi = mid. When lo equals hi you are on a peak. It is O(log n) time and O(1) space. The array is not sorted; the guarantee comes from the edges acting as minus infinity."
followUps: ["Why is a peak guaranteed to exist?", "Does the algorithm still work if adjacent values may be equal?", "How would you find a peak in a 2D grid (a cell larger than its four neighbours)?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/peak-index-in-a-mountain-array"]
practice: {"platform": "LeetCode", "number": 162, "title": "Find Peak Element", "url": "https://leetcode.com/problems/find-peak-element/"}
---

## Problem

You are given a list of integers in which no two adjacent values are equal. A peak is an index whose value is strictly greater than each neighbour it has; imagine the positions just before the start and just after the end as minus infinity, so an end element only needs to beat its single neighbour. Return the index of any peak, in O(log n) time.

This is LeetCode 162, Find Peak Element. Unlike a mountain array there can be many peaks, and any one of them is an acceptable answer.

Assume between 1 and 1,000 values.

## Examples

```text
[3, 8, 5]              ->  1
[1, 2, 3, 4]           ->  3      (the last element beats its only neighbour)
[6, 2, 7, 1, 9, 4]     ->  0, 2 or 4 are all valid
[5]                    ->  0
```

## Approach 1: brute force

Scan from the left and return the first index whose next value is smaller. If none is found, the last index is a peak.

```python
def peak_linear(nums):
    for i in range(len(nums) - 1):
        if nums[i] > nums[i + 1]:
            return i
    return len(nums) - 1
```

This works because if you reach index `i` the values so far have been rising, so `nums[i]` already beats its left neighbour. It is O(n) time and O(1) space.

## Approach 2: optimal (binary search towards the uphill side)

The array is not sorted, yet binary search still works because of one observation: **if you stand somewhere and the value to your right is bigger, walking right must reach a peak.** You keep climbing until either a value drops (the last value before the drop is a peak) or you reach the end (the last value is a peak, since beyond it is minus infinity).

So at each step look at `mid` and `mid + 1`:

- `nums[mid] < nums[mid + 1]`: there is a peak in `(mid, hi]`. Set `lo = mid + 1`.
- `nums[mid] > nums[mid + 1]`: by the mirror argument, walking left from `mid` (or staying put) reaches a peak. Set `hi = mid`.

Walkthrough for `[6, 2, 7, 1, 9, 4]`:

```text
lo=0 hi=5 mid=2  7 > 1  -> hi=2
lo=0 hi=2 mid=1  2 < 7  -> lo=2
lo=hi=2          answer 2   (7 beats 2 and 1)
```

```python
def find_peak(nums):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < nums[mid + 1]:
            lo = mid + 1      # uphill to the right: a peak lies there
        else:
            hi = mid          # mid beats its right side: a peak is at mid or left
    return lo
```

**Why it is correct.** The invariant is stronger than "a peak lies in `[lo, hi]`": it is that `nums[lo]` beats its left neighbour (or `lo` is 0) and `nums[hi]` beats its right neighbour (or `hi` is the last index). Each update preserves this: setting `lo = mid + 1` is safe because `nums[mid + 1] > nums[mid]`, and setting `hi = mid` is safe because `nums[mid] > nums[mid + 1]`. When `lo == hi`, that single index beats both sides, so it is a peak. Because `mid < hi` inside the loop, `mid + 1` is always a valid index.

**Complexity.** O(log n) time and O(1) extra space.

## Tests

```python
import random

def is_peak(nums, i):
    left = nums[i - 1] if i > 0 else float("-inf")
    right = nums[i + 1] if i < len(nums) - 1 else float("-inf")
    return nums[i] > left and nums[i] > right

def check(fn):
    assert fn([3, 8, 5]) == 1
    assert fn([1, 2, 3, 4]) == 3
    assert fn([4, 3, 2, 1]) == 0
    assert fn([5]) == 0
    assert fn([1, 2]) == 1
    assert fn([2, 1]) == 0
    assert fn([6, 2, 7, 1, 9, 4]) in (0, 2, 4)

for f in (peak_linear, find_peak):
    check(f)

rng = random.Random(11)
for _ in range(1000):
    n = rng.randint(1, 15)
    nums = [rng.randint(-10, 10)]
    while len(nums) < n:
        v = rng.randint(-10, 10)
        if v != nums[-1]:
            nums.append(v)
    assert is_peak(nums, find_peak(nums)), nums
    assert is_peak(nums, peak_linear(nums)), nums
print("ok")
```

## Edge cases and pitfalls

- **Testing a specific index.** Several answers can be correct. Test with an `is_peak` check rather than one expected index, as above.
- **Equal neighbours.** The guarantee depends on adjacent values differing. With plateaus, `nums[mid] == nums[mid + 1]` gives no direction and the worst case becomes linear.
- **Thinking it needs sorted input.** Explain the climbing argument; that is what interviewers listen for.
- **Single element.** It is a peak by definition; the loop does not run and returns 0.

## Where this shows up in data engineering

Local maxima appear when you look for spikes in a metric series, such as moments when error counts or lag peaked before falling. In monitoring you usually scan the whole series, but the climbing argument is useful when probing an expensive function (for example, re-running a job with different settings) where you only need one good local optimum, not the global one.

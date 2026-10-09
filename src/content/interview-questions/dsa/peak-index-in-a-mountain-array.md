---
title: "Peak Index in a Mountain Array: Binary Search on the Slope"
seoTitle: "Peak Index in a Mountain Array"
description: "Find the summit of a strictly rising then falling array in O(log n) by checking which slope the middle sits on. Python solutions, proof, pitfalls and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "A mountain array rises strictly to one peak and then falls strictly. At any index, compare arr[mid] with arr[mid + 1]: if the next value is larger you are on the rising slope and the peak is to the right, so lo = mid + 1; otherwise you are at the peak or on the falling slope, so hi = mid. The predicate 'arr[i] > arr[i + 1]' is false then true, so the first true index is the peak. That is O(log n) time and O(1) space. Search only over 0..n-2 so mid + 1 is always valid."
followUps: ["How does this change when the array may have several peaks (Find Peak Element)?", "How would you search a mountain array for a target value?", "What if the slopes were non-strict, with flat stretches?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/find-peak-element", "interview-questions:dsa/find-minimum-in-rotated-sorted-array"]
practice: {"platform": "LeetCode", "number": 852, "title": "Peak Index in a Mountain Array", "url": "https://leetcode.com/problems/peak-index-in-a-mountain-array/"}
previous: "interview-questions:dsa/search-in-rotated-sorted-array"
next: "interview-questions:dsa/find-peak-element"
---

## Problem

You are given a mountain array: at least three integers that strictly increase up to a single highest value and then strictly decrease. The highest value is never at either end. Return the index of that highest value, in O(log n) time.

This is LeetCode 852, Peak Index in a Mountain Array. It shows that binary search does not need a sorted list, only a yes/no question whose answers switch once across the indices.

Assume between 3 and 100,000 values.

## Examples

```text
[1, 4, 9, 6, 2]        ->  2
[0, 5, 3]              ->  1
[2, 3, 5, 8, 11, 7]    ->  4
[10, 20, 15, 12, 4, 1] ->  1
```

## Approach 1: brute force

Walk from the left until the next value is smaller. That index is the peak.

```python
def peak_linear(arr):
    i = 0
    while arr[i] < arr[i + 1]:
        i += 1
    return i
```

This is O(n) time and O(1) space. It is correct because the array rises strictly until the peak, so the first descent marks it.

## Approach 2: optimal (binary search on the slope)

Ask, for each index `i` from 0 to `n - 2`: "is `arr[i] > arr[i + 1]`?" On the rising side the answer is no. At the peak and everywhere after, it is yes. So the answers look like `no, no, ..., no, yes, yes, ...`, and the peak is the first yes.

Binary search for that first yes:

- If `arr[mid] < arr[mid + 1]`, `mid` is on the rising slope, so the peak is strictly to the right: `lo = mid + 1`.
- Otherwise `mid` is the peak or on the falling slope: `hi = mid`.

Walkthrough for `[2, 3, 5, 8, 11, 7]`, searching indices 0 to 4:

```text
lo=0 hi=4 mid=2  5 < 8   -> lo=3
lo=3 hi=4 mid=3  8 < 11  -> lo=4
lo=hi=4          answer 4
```

```python
def peak_index(arr):
    lo, hi = 0, len(arr) - 2       # the peak is never the last index
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < arr[mid + 1]:
            lo = mid + 1           # still climbing
        else:
            hi = mid               # at or past the summit
    return lo
```

**Why it is correct.** The invariant is that the peak lies in `[lo, hi]`. Climbing at `mid` means everything up to `mid` is below the peak, so discarding it is safe. Not climbing at `mid` means `mid` is the peak or after it, so the peak is at most `mid`. The range shrinks on every step, and when it has one index left, that index is the peak. Setting `hi = n - 2` keeps `mid + 1` in bounds; it is safe because the peak cannot be the last element.

**Complexity.** O(log n) time and O(1) extra space.

## Tests

```python
import random

def check(fn):
    assert fn([1, 4, 9, 6, 2]) == 2
    assert fn([0, 5, 3]) == 1
    assert fn([2, 3, 5, 8, 11, 7]) == 4
    assert fn([10, 20, 15, 12, 4, 1]) == 1
    assert fn([-5, -1, -3]) == 1

for f in (peak_linear, peak_index):
    check(f)

rng = random.Random(3)
for _ in range(500):
    vals = rng.sample(range(-200, 200), rng.randint(3, 20))
    top = max(vals)
    rest = [v for v in vals if v != top]
    cut = rng.randint(1, len(rest) - 1)
    left, right = sorted(rest[:cut]), sorted(rest[cut:], reverse=True)
    arr = left + [top] + right
    assert peak_index(arr) == peak_linear(arr) == len(left)
print("ok")
```

## Edge cases and pitfalls

- **Index out of range.** With `hi = len(arr) - 1`, `mid + 1` can still be valid because `mid < hi`, but starting at `n - 2` makes the bound obvious and costs nothing.
- **Comparing with both neighbours.** You only need `arr[mid + 1]`. Checking `arr[mid - 1]` too adds branches and boundary bugs without helping.
- **Using `max`.** `arr.index(max(arr))` is a fine one-liner but O(n); say so if you mention it.
- **Flat stretches.** The strictness matters. With equal neighbours the slope test gives no direction and binary search no longer works in the worst case.

## Where this shows up in data engineering

Finding the hour with peak traffic, or the batch size where throughput stops improving, is a search for the top of a curve. When you know the measure is unimodal (rises, then falls) and each evaluation is expensive, such as a benchmark run, comparing neighbouring points and halving the range finds the peak in few evaluations. If the curve can be noisy or flat, measure more densely instead.

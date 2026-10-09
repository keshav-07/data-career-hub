---
title: "Find Rotation Count: The Index of the Minimum Is the Answer"
seoTitle: "Find Rotation Count with Binary Search"
description: "Count how many times a sorted array of distinct values was rotated by binary searching for its minimum. Python solutions, walkthrough, pitfalls and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "Rotating a sorted list of distinct values to the right k times moves the smallest value to index k, so the rotation count is the index of the minimum. Binary search for it: compare arr[mid] with arr[hi]. If arr[mid] is larger, the drop is to the right, so lo = mid + 1; otherwise the minimum is at mid or to its left, so hi = mid. Stop when lo equals hi. That is O(log n) time and O(1) space. It relies on the values being distinct; with duplicates the worst case becomes linear."
followUps: ["Why compare with the right end instead of the left end?", "How would duplicates change the algorithm and its worst-case complexity?", "How would you use the rotation count to search the array for a target?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/find-minimum-in-rotated-sorted-array", "interview-questions:dsa/search-in-rotated-sorted-array"]
practice: {"platform": "GeeksforGeeks", "title": "Find Rotation Count", "url": "https://www.geeksforgeeks.org/problems/rotation4723/1"}
previous: "interview-questions:dsa/median-of-two-sorted-arrays"
next: "interview-questions:dsa/find-minimum-in-rotated-sorted-array"
---

## Problem

A list of distinct integers was sorted in ascending order and then rotated to the right `k` times. One right rotation moves the last element to the front. Given the rotated list, return `k`, the number of rotations, with `0 <= k < n`.

This is GeeksforGeeks: Find Rotation Count. It is a close cousin of finding the minimum in a rotated sorted array, and the same binary search answers both.

Assume up to about 100,000 values, so the target is O(log n).

## Examples

```text
[15, 18, 2, 3, 6, 12]  ->  2    (two right rotations of [2, 3, 6, 12, 15, 18])
[7, 9, 11, 12, 5]      ->  4
[1, 2, 3, 4]           ->  0    (not rotated, or rotated a multiple of n times)
[9]                    ->  0
```

## Approach 1: brute force

After `k` right rotations of a sorted list, the original first element (the minimum) sits at index `k`. So the answer is simply the position of the smallest value. A linear scan finds it.

```python
def rotation_count_linear(arr):
    best = 0
    for i in range(1, len(arr)):
        if arr[i] < arr[best]:
            best = i
    return best
```

This is O(n) time and O(1) space.

## Approach 2: optimal (binary search for the minimum)

The rotated list is two ascending runs, and every value in the first run is larger than every value in the second. The minimum is where the second run starts.

Compare the middle value with the value at the right end of the current range:

- If `arr[mid] > arr[hi]`, then `mid` is in the first (larger) run and the drop lies somewhere to its right, so `lo = mid + 1`.
- Otherwise `arr[mid]` is in the second run, so the minimum is at `mid` or to its left, so `hi = mid`.

Walkthrough for `[15, 18, 2, 3, 6, 12]`:

```text
lo=0 hi=5 mid=2  arr[2]=2  <= arr[5]=12 -> hi=2
lo=0 hi=2 mid=1  arr[1]=18 >  arr[2]=2  -> lo=2
lo=hi=2          answer 2
```

```python
def rotation_count(arr):
    lo, hi = 0, len(arr) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] > arr[hi]:
            lo = mid + 1      # minimum is strictly right of mid
        else:
            hi = mid          # minimum is at mid or to its left
    return lo
```

**Why it is correct.** The invariant is that the minimum always lies in `[lo, hi]`. The right end of the range is always in the second run or is the minimum itself, so comparing with it tells you which run `mid` belongs to without ambiguity. Each step shrinks the range and never discards the minimum, so the loop stops on it. Comparing with the left end does not work as cleanly: in an unrotated list `arr[mid] > arr[lo]` would wrongly suggest the drop is to the right.

**Complexity.** O(log n) time and O(1) extra space.

## Tests

```python
import random

def check(fn):
    assert fn([15, 18, 2, 3, 6, 12]) == 2
    assert fn([7, 9, 11, 12, 5]) == 4
    assert fn([1, 2, 3, 4]) == 0
    assert fn([9]) == 0
    assert fn([2, 1]) == 1
    assert fn([1, 2]) == 0
    assert fn([-3, -10, -7]) == 1

def rotate_right(a, k):
    k %= len(a)
    return a[-k:] + a[:-k] if k else a[:]

for f in (rotation_count_linear, rotation_count):
    check(f)

rng = random.Random(4)
for _ in range(500):
    base = sorted(rng.sample(range(-100, 100), rng.randint(1, 15)))
    k = rng.randrange(len(base))
    arr = rotate_right(base, k)
    assert rotation_count(arr) == rotation_count_linear(arr) == k
print("ok")
```

## Edge cases and pitfalls

- **No rotation.** A fully sorted list must return 0. The right-end comparison handles this; a left-end comparison often does not.
- **Rotation direction.** A left rotation by `k` puts the minimum at `n - k`. Confirm the direction before answering; the problem here uses right rotations.
- **Duplicates.** With repeated values, `arr[mid] == arr[hi]` gives no information. The usual fix is `hi -= 1`, which makes the worst case O(n).
- **Two elements.** `[2, 1]` and `[1, 2]` are the smallest cases that test both branches; include them in your own checks.

## Where this shows up in data engineering

Circular buffers and ring-shaped logs store records in sorted order but start at an arbitrary offset, and finding the oldest entry is exactly this search for the rotation point. The same idea helps when a sorted list of timestamps wraps around, for example hourly values that restart after midnight, and you need to know where the sequence begins.

---
title: "Smallest Range Covering Elements from K Lists: K-Way Merge with a Min-Heap"
seoTitle: "Smallest Range Covering K Lists: Min-Heap"
description: "Find the narrowest range that holds at least one number from each of k sorted lists. A min-heap with one pointer per list tracks the window in O(N log k)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "sliding-window"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Hold one element from every list at a time: start with each list's first element in a min-heap and track the current maximum. The range [heap minimum, maximum] covers all lists; record it if it beats the best. Then advance the list that supplied the minimum, since only raising the minimum can shrink the range, update the maximum, and repeat until some list runs out. That is O(N log k) for N total elements and O(k) space. Compare ranges by width first, then by left end."
followUps: ["Why is it enough to advance only the list holding the minimum?", "How would you solve it with a sliding window over the merged list instead?", "What changes if the lists are not sorted?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/merge-k-sorted-lists", "interview-questions:dsa/minimum-window-substring", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 632, "title": "Smallest Range Covering Elements from K Lists", "url": "https://leetcode.com/problems/smallest-range-covering-elements-from-k-lists/"}
previous: "interview-questions:dsa/merge-k-sorted-lists"
next: "interview-questions:dsa/jump-game"
---

## Problem

You get k non-empty lists of integers, each sorted in ascending order. Find the smallest range `[a, b]` (inclusive) that contains at least one number from every list. One range is smaller than another if it is narrower (`b - a` is less), or equally wide with a smaller `a`. This is LeetCode 632, Smallest Range Covering Elements from K Lists.

## Examples

```text
[[1, 10, 20], [4, 12], [11, 30]]   ->  [10, 12]
[[1, 2, 3], [1, 2, 3], [1, 2, 3]]  ->  [1, 1]
[[5], [9]]                         ->  [5, 9]
[[3, 8]]                           ->  [3, 3]     (one list: any single value)
```

## Approach 1: brute force

The best range always starts and ends on values from the lists. Try every pair of values as `[a, b]` and keep the best one that covers every list.

```python
from bisect import bisect_left

def smallest_range_brute(lists):
    values = sorted({v for lst in lists for v in lst})
    best = None
    for a in values:
        for b in values:
            if b < a:
                continue
            covers = all((j := bisect_left(lst, a)) < len(lst) and lst[j] <= b for lst in lists)
            if covers and (best is None or (b - a, a) < (best[1] - best[0], best[0])):
                best = [a, b]
    return best
```

**Complexity:** O(V² · k log m) for V distinct values and lists of length up to m. Fine for checking, far too slow for real inputs.

## Approach 2: sliding window over the merged list

Merge all elements into one list of `(value, list id)` sorted by value. Now the question is the classic "shortest window that contains every id at least once": grow the right edge until all k ids are present, then shrink from the left while they stay present, recording the range each time.

```python
from collections import defaultdict

def smallest_range_window(lists):
    merged = sorted((v, i) for i, lst in enumerate(lists) for v in lst)
    need = len(lists)
    seen = defaultdict(int)
    covered = 0
    best = None
    left = 0
    for right, (v, i) in enumerate(merged):
        seen[i] += 1
        if seen[i] == 1:
            covered += 1
        while covered == need:
            lo = merged[left][0]
            if best is None or (v - lo, lo) < (best[1] - best[0], best[0]):
                best = [lo, v]
            j = merged[left][1]
            seen[j] -= 1
            if seen[j] == 0:
                covered -= 1
            left += 1
    return best
```

**Complexity:** O(N log N) time for the sort and O(N) space for the merged list.

## Approach 3: optimal (k-way merge with a min-heap)

You do not need the whole merged list at once. Keep exactly one current element from each list, which always covers all k lists. The range they span is from the smallest to the largest. To find a narrower range, the only useful move is to raise the smallest element, since moving any other pointer forward can only raise the maximum. So pop the minimum, record the range, push the next element from the same list, and update the maximum. When a list has nothing left to push, the minimum can no longer rise, so stop.

```python
import heapq

def smallest_range(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists)]
    heapq.heapify(heap)
    hi = max(lst[0] for lst in lists)
    best = [heap[0][0], hi]
    while True:
        lo, i, j = heapq.heappop(heap)
        if hi - lo < best[1] - best[0] or (hi - lo == best[1] - best[0] and lo < best[0]):
            best = [lo, hi]
        if j + 1 == len(lists[i]):
            return best
        nxt = lists[i][j + 1]
        heapq.heappush(heap, (nxt, i, j + 1))
        hi = max(hi, nxt)
```

**Why it is correct:** let `[a, b]` be the best range. A pointer only moves past an element when that element is the heap minimum, so while the minimum is below `a`, no pointer moves past an element that is at least `a`. Consider the first moment the minimum is at least `a`. Every pointer then sits on its list's first element that is at least `a`, and since every list has an element in `[a, b]`, that element is at most `b`. So the current range lies inside `[a, b]`, and it is recorded. The loop cannot stop earlier: stopping needs a list whose last element was popped while below `a`, and that list would have nothing in `[a, b]`.

**Complexity:** O(N log k) time for N total elements, O(k) space for the heap.

## Tests

```python
import random

cases = [
    ([[1, 10, 20], [4, 12], [11, 30]], [10, 12]),
    ([[1, 2, 3], [1, 2, 3], [1, 2, 3]], [1, 1]),
    ([[5], [9]], [5, 9]),
    ([[3, 8]], [3, 3]),
    ([[1, 5], [3, 7]], [1, 3]),           # [1, 3] and [3, 5] tie on width
    ([[-10, -5, 0], [-6, 4], [-7, 10]], [-7, -5]),
]
for f in (smallest_range, smallest_range_window, smallest_range_brute):
    for lists, expected in cases:
        assert f(lists) == expected, (f.__name__, lists)

random.seed(21)
for _ in range(400):
    lists = [sorted(random.randint(-10, 10) for _ in range(random.randint(1, 4)))
             for _ in range(random.randint(1, 4))]
    expected = smallest_range_brute(lists)
    assert smallest_range(lists) == expected, lists
    assert smallest_range_window(lists) == expected, lists
print("ok")
```

## Edge cases and pitfalls

- Stop as soon as the list that held the minimum is exhausted. Continuing without it would produce ranges that no longer cover every list.
- Compare ranges by width first and left end second; comparing `[a, b]` tuples directly prefers the smaller start even when the range is wider.
- Lists can contain duplicates and the same value can appear in several lists; both are fine as long as the heap entries carry the list index.
- Put the list index in the heap tuple so equal values never fall back to comparing something unorderable.

## Where this shows up in data engineering

The heap of one pointer per sorted input is the k-way merge used to combine sorted files, sorted runs in an external sort, or sorted partitions from many workers. Finding the smallest window that touches every source is the same as finding the tightest time window in which every sensor, region or shard reported at least once, which is a useful freshness or alignment check across feeds.

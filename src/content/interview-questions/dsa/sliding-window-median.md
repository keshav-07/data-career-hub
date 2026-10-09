---
title: "Sliding Window Median: Two Heaps with Lazy Deletion"
seoTitle: "Sliding Window Median: Two Heaps, Lazy Deletes"
description: "Report the median of every window of size k. Compare a sorted window kept with bisect against two balanced heaps with lazy deletion in O(n log k)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "sliding-window"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 30
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Keep the smaller half of the window in a max-heap and the larger half in a min-heap, with the max-heap holding the extra element when k is odd; the median is its top, or the mean of both tops. Heaps cannot delete an arbitrary element, so record outgoing values in a 'to delete' counter, adjust the balance count as if they were gone, and discard them only when they reach a heap's top. Each value is pushed and popped a constant number of times, so the work is O(n log n) at worst and usually quoted as O(n log k). A simpler alternative keeps the window as a sorted list with bisect: O(log k) search but O(k) insert and delete, so O(n·k)."
followUps: ["Why is lazy deletion needed, and what bounds the size of the heaps?", "How would you solve this with a balanced tree or an order-statistic structure?", "What changes if you need the 90th percentile instead of the median?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/find-median-from-data-stream", "interview-questions:dsa/sliding-window-maximum", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 480, "title": "Sliding Window Median", "url": "https://leetcode.com/problems/sliding-window-median/"}
previous: "interview-questions:dsa/find-median-from-data-stream"
next: "interview-questions:dsa/ipo"
---

## Problem

Given an integer array and a window size `k` (1 ≤ k ≤ length), slide a window of `k` consecutive elements from the left end to the right end, one step at a time. For each position, report the median of the window: the middle value when k is odd, or the mean of the two middle values when k is even. Return the list of medians as floats. This is LeetCode 480, Sliding Window Median.

## Examples

```text
nums = [5, 2, 8, 1, 9, 3],  k = 3   ->  [5.0, 2.0, 8.0, 3.0]
nums = [5, 2, 8, 1, 9, 3],  k = 2   ->  [3.5, 5.0, 4.5, 5.0, 6.0]
nums = [4, 4, 4],           k = 1   ->  [4.0, 4.0, 4.0]
```

## Approach 1: brute force

Sort each window from scratch.

```python
def medians_brute(nums, k):
    out = []
    for i in range(len(nums) - k + 1):
        w = sorted(nums[i:i + k])
        out.append(float(w[k // 2]) if k % 2 else (w[k // 2 - 1] + w[k // 2]) / 2)
    return out
```

**Complexity:** O(n · k log k) time, O(k) space.

## Approach 2: sorted window with bisect

Keep the current window sorted. Sliding removes one value and inserts one; both positions are found by binary search, and the median is read by index.

```python
from bisect import bisect_left, insort

def medians_sorted(nums, k):
    window = sorted(nums[:k])
    out = []
    for i in range(k, len(nums) + 1):
        out.append(float(window[k // 2]) if k % 2
                   else (window[k // 2 - 1] + window[k // 2]) / 2)
        if i == len(nums):
            break
        window.pop(bisect_left(window, nums[i - k]))
        insort(window, nums[i])
    return out
```

**Complexity:** O(n · k) in the worst case because list insert and delete shift elements, although the shifting is fast in practice. This is a strong answer to give first.

## Approach 3: optimal (two heaps with lazy deletion)

Split the window into a lower half (`low`, a max-heap stored as negated values) and an upper half (`high`, a min-heap). Keep every value in `low` at most every value in `high`, and keep `low` the same size as `high` or one larger. The median then comes from the tops.

Adding a value is easy. Removing the value that leaves the window is not, because a heap only removes its top. Instead, count the value in `pending`, and update the *logical* sizes as if it were gone. Whenever a pending value surfaces at a heap's top, pop it for real. The only extra rule: after any change, prune both tops so the median is never read from a stale entry.

```python
import heapq
from collections import Counter

def medians_heaps(nums, k):
    low, high = [], []            # low holds negated values
    pending = Counter()
    sizes = {"low": 0, "high": 0} # live elements, excluding pending ones

    def prune(heap, sign):
        while heap and pending[sign * heap[0]]:
            pending[sign * heap[0]] -= 1
            heapq.heappop(heap)

    def rebalance():
        if sizes["low"] > sizes["high"] + 1:
            heapq.heappush(high, -heapq.heappop(low))
            sizes["low"] -= 1; sizes["high"] += 1
            prune(low, -1)
        elif sizes["low"] < sizes["high"]:
            heapq.heappush(low, -heapq.heappop(high))
            sizes["high"] -= 1; sizes["low"] += 1
            prune(high, 1)

    def add(v):
        if not low or v <= -low[0]:
            heapq.heappush(low, -v); sizes["low"] += 1
        else:
            heapq.heappush(high, v); sizes["high"] += 1
        rebalance()

    def remove(v):
        pending[v] += 1
        if v <= -low[0]:
            sizes["low"] -= 1
            if v == -low[0]:
                prune(low, -1)
        else:
            sizes["high"] -= 1
            if high and v == high[0]:
                prune(high, 1)
        rebalance()

    def median():
        return float(-low[0]) if k % 2 else (-low[0] + high[0]) / 2

    out = []
    for i, v in enumerate(nums):
        add(v)
        if i >= k:
            remove(nums[i - k])
        if i >= k - 1:
            out.append(median())
    return out
```

**Why it is correct:** the invariants are about live elements only: all live values in `low` are at most all live values in `high`, and the live sizes differ by at most one in favour of `low`. A pending value is skipped as soon as it reaches a top, and both tops are pruned after every rebalance, so the tops are always live and are the two middle values. Deciding which heap an outgoing value belongs to by comparing it with `low`'s live top is safe, because a value equal to that top counts as lower-half whichever copy is removed.

**Complexity:** each value is pushed and popped a constant number of times. Stale entries can make a heap larger than k, so the strict worst case is O(n log n) time and O(n) space; in typical inputs the heaps stay close to k elements, which is why the bound is usually quoted as O(n log k).

## Tests

```python
import random

cases = [
    ([5, 2, 8, 1, 9, 3], 3, [5.0, 2.0, 8.0, 3.0]),
    ([5, 2, 8, 1, 9, 3], 2, [3.5, 5.0, 4.5, 5.0, 6.0]),
    ([4, 4, 4], 1, [4.0, 4.0, 4.0]),
    ([7], 1, [7.0]),
    ([1, 2], 2, [1.5]),
    ([2147483647, 2147483647], 2, [2147483647.0]),   # no overflow in Python
    ([-3, -1, -2, -5], 3, [-2.0, -2.0]),
]
for f in (medians_heaps, medians_sorted, medians_brute):
    for nums, k, expected in cases:
        assert f(nums, k) == expected, (f.__name__, nums, k)

random.seed(19)
for _ in range(500):
    nums = [random.randint(-5, 5) for _ in range(random.randint(1, 14))]
    k = random.randint(1, len(nums))
    expected = medians_brute(nums, k)
    assert medians_sorted(nums, k) == expected
    assert medians_heaps(nums, k) == expected, (nums, k)
print("ok")
```

## Edge cases and pitfalls

- Duplicates are where lazy deletion breaks if you track positions loosely. Count pending deletions by value, and decide the outgoing value's half by comparing with `low`'s live top.
- Rebalance using the logical sizes, not `len(heap)`, since heaps may still hold stale entries.
- Prune after every move between heaps; a stale value moved to the other heap's top would otherwise be read as the median.
- For even k, average with `/ 2` on the sum; in fixed-width languages compute `a / 2 + b / 2` or use a wider type to avoid overflow.

## Where this shows up in data engineering

Rolling medians are a standard robust statistic in monitoring: a moving median of latency or row counts ignores single spikes that would drag a moving average, which makes it good for anomaly baselines. Most SQL engines do not offer a sliding-window median directly, so it is usually computed in a stream processor or in Python with exactly these structures; pandas exposes it as `rolling(k).median()`.

---
title: "Shortest Subarray with Sum at Least K: Prefix Sums and a Monotonic Deque"
seoTitle: "Shortest Subarray Sum at Least K: Monotonic Deque"
description: "Find the shortest subarray with sum at least k when values can be negative. Learn why sliding windows fail and how a monotonic deque of prefix sums gives O(n)."
technology: ["dsa"]
topic: ["prefix-sum", "queue", "sliding-window"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "With prefix sums P, you want the smallest j - i with P[j] - P[i] >= k. Keep a deque of start indices whose prefix sums are increasing. For each j: while P[j] - P[front] >= k, record j - front and pop the front, since no later j can use it for a shorter answer. Then pop from the back every index whose prefix is >= P[j], because j is a later and lower start, which is always better. Push j. Each index enters and leaves once, so it is O(n) time and O(n) space. A plain sliding window fails because negative values break the 'shrink when too big' logic."
followUps: ["Why is it safe to pop the front after recording an answer?", "How would you solve it in O(n log n) with binary search over prefix sums?", "What changes if every value is positive?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/sliding-window-maximum"]
practice: {"platform": "LeetCode", "number": 862, "title": "Shortest Subarray with Sum at Least K", "url": "https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/"}
previous: "interview-questions:dsa/contiguous-array"
next: "interview-questions:dsa/maximum-subarray"
---

## Problem

You are given a list of integers `nums`, which may contain negative values, and a positive integer `k`. Return the length of the shortest non-empty contiguous subarray whose sum is at least `k`, or -1 if no subarray qualifies. This is LeetCode 862, Shortest Subarray with Sum at Least K.

The list has up to about 10^5 elements, so an O(n²) scan is too slow.

## Examples

```text
nums = [2, -1, 2],          k = 3    ->  3    (only the whole array reaches 3)
nums = [1, 2],              k = 4    ->  -1
nums = [4, -10, 3, 3],      k = 6    ->  2    ([3, 3])
nums = [5, 1, 3],           k = 5    ->  1    ([5])
```

## Approach 1: brute force

Fix each start and extend the end with a running sum, stopping at the first end that reaches `k` (going further only makes the subarray longer).

```python
def shortest_at_least_k_brute(nums, k):
    best = float("inf")
    for i in range(len(nums)):
        total = 0
        for j in range(i, len(nums)):
            total += nums[j]
            if total >= k:
                best = min(best, j - i + 1)
                break
    return best if best != float("inf") else -1
```

**Complexity:** O(n²) time, O(1) extra space.

### Why a sliding window does not work

With only positive numbers, you can grow the window until the sum reaches `k` and then shrink it from the left. A negative number breaks this: shrinking can **increase** the sum (dropping a negative), and growing can decrease it, so the window has no reliable rule for which way to move.

## Approach 2: optimal (monotonic deque of prefix sums)

Let `P[0] = 0` and `P[t]` be the sum of the first `t` elements. A subarray from start `i` to end `j - 1` sums to `P[j] - P[i]`, and its length is `j - i`. You want the smallest `j - i` with `P[j] - P[i] >= k`.

Two observations let you throw starts away for good:

1. **Front: a start that has found its match is finished.** If `P[j] - P[i] >= k`, record `j - i`. Any later end `j'` would give a longer subarray from the same `i`, so pop `i`.
2. **Back: a later, smaller prefix beats an earlier, larger one.** If `P[j] <= P[i]` for some earlier `i` still in the deque, then `j` is a better start than `i` for every future end: it gives a larger difference and a shorter length. So pop `i`.

After rule 2, the deque holds indices whose prefix sums strictly increase, which is what makes rule 1 correct to check only at the front.

```python
from collections import deque

def shortest_at_least_k(nums, k):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    best = len(nums) + 1
    starts = deque()                       # indices into prefix, increasing prefix values
    for j, p in enumerate(prefix):
        while starts and p - prefix[starts[0]] >= k:
            best = min(best, j - starts.popleft())
        while starts and prefix[starts[-1]] >= p:
            starts.pop()
        starts.append(j)
    return best if best <= len(nums) else -1
```

Walkthrough on `[4, -10, 3, 3]`, `k = 6`. Prefix sums are `[0, 4, -6, -3, 0]`.

| j | P[j] | front matches | back pops | deque after |
|---|---|---|---|---|
| 0 | 0 | | | [0] |
| 1 | 4 | 4 - 0 < 6 | | [0, 1] |
| 2 | -6 | | pop 1, pop 0 | [2] |
| 3 | -3 | 3 < 6 | | [2, 3] |
| 4 | 0 | 0 - (-6) = 6: length 2, pop 2; then 0 - (-3) < 6 | | [3, 4] |

**Why it is correct:** every index popped from the back is dominated by `j` for all future ends, so dropping it never loses the optimum. Every index popped from the front already produced its best possible length. Because the remaining prefix sums increase from front to back, if the front fails `P[j] - P[front] >= k`, every other index in the deque fails too, so stopping there loses nothing.

**Complexity:** O(n) time, since each index is pushed once and popped at most once. O(n) extra space for the prefix sums and the deque.

## Tests

```python
import random

for f in (shortest_at_least_k, shortest_at_least_k_brute):
    assert f([2, -1, 2], 3) == 3
    assert f([1, 2], 4) == -1                # impossible
    assert f([4, -10, 3, 3], 6) == 2         # negative value resets the best start
    assert f([5, 1, 3], 5) == 1              # single element
    assert f([1], 1) == 1
    assert f([-5, -1], 1) == -1              # all negative
    assert f([10, -20, 4, 4, 4], 12) == 3    # the large first value is not usable
    assert f([], 1) == -1                    # defensive

random.seed(15)
for _ in range(2000):
    arr = [random.randint(-6, 8) for _ in range(random.randint(1, 10))]
    k = random.randint(1, 15)
    assert shortest_at_least_k(arr, k) == shortest_at_least_k_brute(arr, k)
```

## Edge cases and pitfalls

- **Use `>=` when popping from the back.** Equal prefix sums are also dominated by the later index; using `>` keeps useless starts but stays correct. Getting the comparison backwards breaks the increasing order.
- **Include `P[0] = 0`.** Without the empty prefix, subarrays starting at index 0 are never considered.
- Check the front **before** pushing `j`, otherwise you compare `j` with itself.
- Return -1, not 0 or infinity, when nothing qualifies.
- A binary search over a sorted list of candidate prefixes gives O(n log n), which is a reasonable fallback if you cannot recall the deque.

## Where this shows up in data engineering

"The shortest period whose total reaches a threshold" is a common alerting and analytics question, such as the fastest stretch in which net spend, error count or net inflow reached a limit, where refunds or corrections make some values negative. The monotonic deque is the same structure used for sliding-window maximums in stream processing, and it keeps memory proportional to the useful candidates rather than the whole history.

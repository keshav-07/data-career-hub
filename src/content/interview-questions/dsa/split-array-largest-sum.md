---
title: "Split Array Largest Sum: Binary Search on the Largest Part"
seoTitle: "Split Array Largest Sum: Binary Search"
description: "Split an array into k contiguous parts so the largest part sum is as small as possible, with DP and binary search on the answer. Python solutions, proof and tests."
technology: ["dsa"]
topic: ["binary-search", "greedy", "dynamic-programming"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 30
interviewRelevance: "High"
shortAnswer: "Guess a limit L for the largest part. Greedily extend the current part until the next value would push it over L, then start a new part; this gives the fewest parts any split under L can have. If that count is at most k, L is feasible, and feasibility is monotonic in L. Binary search L between max(nums) and sum(nums) for the first feasible value. That is O(n log S) time and O(1) space. A DP over prefix sums also works in O(k n^2) and is worth mentioning, but the binary search is the expected answer. Exactly k parts is fine because a split with fewer parts can always be cut further."
followUps: ["Why is 'at most k parts' the same as 'exactly k parts' here?", "How would you return the actual split points, not just the value?", "When would you prefer the DP solution over the binary search?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/capacity-to-ship-packages-within-d-days", "interview-questions:dsa/koko-eating-bananas"]
practice: {"platform": "LeetCode", "number": 410, "title": "Split Array Largest Sum", "url": "https://leetcode.com/problems/split-array-largest-sum/"}
---

## Problem

You are given a list of non-negative integers and an integer `k`. Cut the list into exactly `k` non-empty contiguous parts. Each part has a sum, and the cost of a split is the largest of those sums. Return the smallest possible cost.

This is LeetCode 410, Split Array Largest Sum. It is the general form of several "binary search on the answer" problems, including Capacity To Ship Packages Within D Days, where days play the role of parts.

Assume up to 1,000 values, each up to a million, and `1 <= k <= min(50, len(nums))`.

## Examples

```text
nums = [8, 3, 5, 9, 2, 6], k = 1  ->  33    (the whole list)
nums = [8, 3, 5, 9, 2, 6], k = 2  ->  17    ([8, 3, 5] = 16, [9, 2, 6] = 17)
nums = [8, 3, 5, 9, 2, 6], k = 3  ->  14    ([8, 3] = 11, [5, 9] = 14, [2, 6] = 8)
nums = [8, 3, 5, 9, 2, 6], k = 6  ->  9     (one value per part: the largest value)
nums = [0, 0, 5],          k = 2  ->  5
```

## Approach 1: dynamic programming

Let `dp[j][i]` be the best cost for splitting the first `i` values into `j` parts. The last part is `nums[p:i]` for some cut `p`, so

`dp[j][i] = min over p of max(dp[j - 1][p], sum(nums[p:i]))`.

Prefix sums make each part sum O(1).

```python
def split_dp(nums, k):
    n = len(nums)
    pre = [0]
    for v in nums:
        pre.append(pre[-1] + v)
    INF = float("inf")
    dp = [[INF] * (n + 1) for _ in range(k + 1)]
    dp[0][0] = 0
    for j in range(1, k + 1):
        for i in range(j, n + 1):              # need at least j values for j parts
            for p in range(j - 1, i):          # the last part is nums[p:i], non-empty
                cand = max(dp[j - 1][p], pre[i] - pre[p])
                if cand < dp[j][i]:
                    dp[j][i] = cand
    return dp[k][len(nums)]
```

This is O(k * n^2) time and O(k * n) space: correct and a good way to show you understand the structure, but slow for large inputs.

## Approach 2: optimal (binary search on the largest part)

**Flip the question.** Instead of "what is the best cost?", ask "can the cost be at most `L`?" To answer it, walk the list and keep adding values to the current part; when the next value would push the part over `L`, close it and start a new one. The number of parts this greedy uses is the fewest possible under limit `L`, because closing a part earlier than necessary never helps the parts that follow.

**At most k is enough.** If the greedy needs fewer than `k` parts, you can still reach exactly `k` by cutting existing parts into smaller pieces, which never increases any sum. The list has at least `k` values, so there is always room to cut. So `L` is feasible exactly when the greedy count is at most `k`.

**Monotonicity and range.** A larger `L` never needs more parts. The cost is at least `max(nums)`, since that value sits in some part, and at most `sum(nums)`, the single-part split. Binary search for the first feasible `L`.

```python
def parts_needed(nums, limit):
    parts, current = 1, 0
    for v in nums:
        if current + v > limit:
            parts += 1
            current = 0
        current += v
    return parts

def split_array(nums, k):
    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if parts_needed(nums, mid) <= k:
            hi = mid              # achievable; try a lower cost
        else:
            lo = mid + 1          # needs too many parts
    return lo
```

Walkthrough for `[8, 3, 5, 9, 2, 6]`, `k = 2`, range `[9, 33]`:

```text
mid=21  [8 3 5] [9 2 6]          2 parts -> hi=21
mid=15  [8 3] [5 9] [2 6]        3 parts -> lo=16
mid=18  [8 3 5] [9 2 6]          2 parts -> hi=18
mid=17  [8 3 5] [9 2 6]          2 parts -> hi=17
mid=16  [8 3 5] [9 2] [6]        3 parts -> lo=17
answer 17
```

**Why the result is optimal.** Every value below `lo` was shown infeasible, and `lo` itself is feasible. So `lo` is the smallest achievable cost. It is also a real part sum of some split, because the optimum is; the search does not need to visit only real sums to find it.

**Complexity.** Each check is O(n), and the search makes O(log S) checks for `S = sum(nums)`: O(n log S) time and O(1) extra space. With a million per value and a thousand values, log S is about 30.

## Tests

```python
import random
from itertools import combinations

def split_exhaustive(nums, k):
    n = len(nums)
    best = None
    for cuts in combinations(range(1, n), k - 1):
        b = [0, *cuts, n]
        cost = max(sum(nums[b[i]:b[i + 1]]) for i in range(k))
        best = cost if best is None else min(best, cost)
    return best

def check(fn):
    a = [8, 3, 5, 9, 2, 6]
    assert fn(a, 1) == 33
    assert fn(a, 2) == 17
    assert fn(a, 3) == 14
    assert fn(a, 6) == 9
    assert fn([0, 0, 5], 2) == 5
    assert fn([1, 4, 4], 3) == 4
    assert fn([7], 1) == 7
    assert fn([0, 0, 0], 2) == 0

for f in (split_dp, split_array, split_exhaustive):
    check(f)

rng = random.Random(13)
for _ in range(300):
    nums = [rng.randint(0, 15) for _ in range(rng.randint(1, 8))]
    k = rng.randint(1, len(nums))
    expected = split_exhaustive(nums, k)
    assert split_array(nums, k) == split_dp(nums, k) == expected, (nums, k)

big = [10**6] * 1000
assert split_array(big, 50) == 20 * 10**6
print("ok")
```

## Edge cases and pitfalls

- **Lower bound below the largest value.** Starting at 0 or 1 lets the greedy place an oversized value in a part by itself, which undercounts and returns an impossible cost. Start at `max(nums)`.
- **Exactly k versus at most k.** Some candidates add special code to force exactly `k` parts. It is unnecessary, as argued above, but be ready to explain why.
- **Zeros.** Non-negative values include 0, so a cost of 0 is possible. The range `[max, sum]` handles it.
- **DP indices.** Each part must be non-empty, so `p` ranges from `j - 1`, and `i` from `j`. Off-by-one errors here produce empty parts with cost 0.

## Where this shows up in data engineering

This is balanced work partitioning for ordered data: split a sorted key range or a time-ordered sequence of files into `k` contiguous chunks for `k` workers so that the slowest worker (the biggest chunk) finishes as early as possible. Range-based partitioning of backfills and splitting a sorted table into balanced ranges both have this shape, and the same greedy check tells you whether a size limit per chunk can be met with the workers you have.

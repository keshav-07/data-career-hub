---
title: "Maximum Candies Allocated to K Children: Binary Search on the Share"
seoTitle: "Maximum Candies Allocated to K Children"
description: "Find the largest equal share of candies for k children when piles can be split but not merged, using binary search on the share. Python solutions and tests."
technology: ["dsa"]
topic: ["binary-search"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
shortAnswer: "A share of s candies per child is achievable if the piles, each split into chunks of s, give at least k chunks: the sum of pile // s is at least k. That count only falls as s grows, so binary search for the largest s that still works, between 1 and max(piles). If even s = 1 fails (total candies below k), the answer is 0. It runs in O(n log M) time for the largest pile M and O(1) space. Use floor division, because leftover candies in a pile cannot be combined with another pile."
followUps: ["Why can you not simply return sum(candies) // k?", "How would you set a tighter upper bound for the search?", "How does this compare with Koko Eating Bananas, which searches for the smallest feasible value?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/koko-eating-bananas", "interview-questions:dsa/aggressive-cows"]
practice: {"platform": "LeetCode", "number": 2226, "title": "Maximum Candies Allocated to K Children", "url": "https://leetcode.com/problems/maximum-candies-allocated-to-k-children/"}
previous: "interview-questions:dsa/aggressive-cows"
next: "interview-questions:dsa/capacity-to-ship-packages-within-d-days"
---

## Problem

You have several piles of candies, given as a list of positive integers, and `k` children. You may split any pile into smaller sub-piles, but you cannot merge two piles. Each child receives exactly one (sub-)pile, and every child must receive the same number of candies. Some candies may go unused. Return the largest number of candies each child can receive; return 0 if you cannot give every child at least one.

This is LeetCode 2226, Maximum Candies Allocated to K Children. It is binary search on the answer in its "largest feasible value" form.

Assume up to 100,000 piles, each up to ten million, and `k` up to about 10^12.

## Examples

```text
candies = [6, 9, 4], k = 4   ->  4    (6 -> 4, 9 -> 4 + 4, 4 -> 4: four shares of 4)
candies = [6, 9, 4], k = 3   ->  4    (a share of 5 serves only two children)
candies = [2, 3],    k = 9   ->  0    (only 5 candies in total)
candies = [7],       k = 2   ->  3
```

## Approach 1: brute force

Try every share size from the largest pile downwards and return the first one that yields `k` chunks.

```python
def chunks(candies, s):
    return sum(c // s for c in candies)

def max_share_linear(candies, k):
    for s in range(max(candies), 0, -1):
        if chunks(candies, s) >= k:
            return s
    return 0
```

This is O(n * M) for the largest pile `M`, far too slow at ten million per pile.

## Approach 2: optimal (binary search on the share)

**Feasibility test.** With share `s`, a pile of `c` candies can serve `c // s` children; the remainder is wasted because piles cannot be merged. So `s` works when `sum(c // s) >= k`.

**Monotonicity.** Increasing `s` never increases any `c // s`, so the count of children served only falls. Feasibility reads `yes, ..., yes, no, ...` from `s = 1` upwards, and you want the last yes.

**Range.** The answer is between 0 and `max(candies)`. Treat 0 as "always feasible" (every child gets nothing) and search `[0, max(candies)]`; that handles the impossible case without a special branch.

```python
def max_share(candies, k):
    lo, hi = 0, max(candies)
    while lo < hi:
        mid = (lo + hi + 1) // 2          # round up: we move lo = mid
        if chunks(candies, mid) >= k:
            lo = mid                      # mid works; try bigger shares
        else:
            hi = mid - 1                  # too big
    return lo
```

Because `mid` is rounded up, it is never 0 inside the loop, so there is no division by zero.

Walkthrough for `[6, 9, 4]`, `k = 4`, range `[0, 9]`: `mid = 5` gives 1 + 1 + 0 = 2 chunks, so `hi = 4`; `mid = 2` gives 3 + 4 + 2 = 9, so `lo = 2`; `mid = 3` gives 2 + 3 + 1 = 6, so `lo = 3`; `mid = 4` gives 1 + 2 + 1 = 4, so `lo = 4`; the answer is 4.

**Why not `sum // k`?** That assumes candies from different piles can be pooled. With `[6, 9, 4]` and `k = 3`, the total of 19 suggests 6, but a share of 6 serves only two children (one from the 6, one from the 9) and the real answer is 4. With `[5, 5]` and `k = 3` the total suggests 3 while the real answer is 2.

**Complexity.** O(n log M) time and O(1) extra space.

## Tests

```python
import random

def check(fn):
    assert fn([6, 9, 4], 4) == 4
    assert fn([6, 9, 4], 3) == 4
    assert fn([2, 3], 9) == 0
    assert fn([7], 2) == 3
    assert fn([5, 5], 3) == 2
    assert fn([1], 1) == 1
    assert fn([10, 10, 10], 3) == 10

for f in (max_share_linear, max_share):
    check(f)

rng = random.Random(6)
for _ in range(500):
    candies = [rng.randint(1, 30) for _ in range(rng.randint(1, 6))]
    k = rng.randint(1, 60)
    assert max_share(candies, k) == max_share_linear(candies, k), (candies, k)

assert max_share([10**7] * 3, 10**12) == 0
assert max_share([10**7, 10**7], 4) == 5 * 10**6
print("ok")
```

## Edge cases and pitfalls

- **Pooling across piles.** `sum(candies) // k` is an upper bound, not the answer. The test must use per-pile floor division.
- **Division by zero.** Starting `lo` at 0 is fine only if `mid` is rounded up. With a "start at 1" variant, handle the "even 1 fails" case separately.
- **Huge k.** When `k` exceeds the total candies, the answer is 0. In Java or C++ use 64-bit counters, since k and the chunk sum can exceed 32 bits.
- **Infinite loop.** `lo = mid` with `mid` rounded down loops forever when `hi = lo + 1`.

## Where this shows up in data engineering

Splitting large inputs into equal-sized work units that cannot span inputs is this problem: for example, the largest batch size you can use so that k workers each get one full batch when every batch must come from a single file or partition. Searching on the batch size with a per-file floor division gives a size that is guaranteed to work.

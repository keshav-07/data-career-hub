---
title: "Count Subsets with Sum: Add Up the Ways, Not Just True or False"
seoTitle: "Count Subsets with Sum: Counting DP"
description: "Count how many subsets of an array add up to a target. Swap the boolean subset-sum DP for a counting one, and handle zeros, which double every count they join."
technology: ["dsa"]
topic: ["dynamic-programming", "knapsack"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Use the subset-sum recurrence but count instead of OR: ways(i, t) = ways(i - 1, t) + ways(i - 1, t - a[i]), with ways(0, 0) = 1 for the empty subset. A single array of size target + 1, updated from high t to low, gives O(n * target) time and O(target) space. Subsets are told apart by position, so two equal values give two different subsets. Zeros matter: each zero doubles every count, which the downward loop handles only if it runs all the way to t = 0. If the platform asks for the count modulo 10^9 + 7, reduce after each addition."
followUps: ["Why does the loop have to include t = 0 when the array contains zeros?", "How do you count subsets whose sums differ by a given amount?", "How would you list the subsets instead of counting them?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/dynamic-programming"]
practice: {"platform": "GeeksforGeeks", "title": "Count Subsets with Sum", "url": "https://www.geeksforgeeks.org/problems/perfect-sum-problem5633/1"}
previous: "interview-questions:dsa/subset-sum-problem"
next: "interview-questions:dsa/longest-palindromic-substring"
---

## Problem

You get an array of non-negative integers and a target. Count the subsets whose elements sum to exactly the target.
Two subsets are different when they use different positions, even if the values match, so `[2, 2]` has two subsets
that sum to 2.

This is GeeksforGeeks: Count Subsets with Sum (also known as the perfect sum problem). Versions of the problem have
asked for the plain count or for the count modulo 10^9 + 7, so check the statement; the code below takes an optional
modulus. Assume up to about 1,000 numbers and a target up to about 1,000.

## Examples

```text
nums = [1, 2, 3, 4], target = 5      ->  2    ({1, 4} and {2, 3})
nums = [2, 2, 2], target = 4         ->  3    (any two of the three positions)
nums = [0, 3], target = 3            ->  2    ({3} and {0, 3})
nums = [5, 6], target = 2            ->  0
```

## Approach 1: brute force (recursion)

Every element is either in the subset or not. Explore both branches and count the leaves where the remaining target
is exactly zero. Unlike the yes/no version, you cannot stop at the first zero: later zeros in the array could still
be added, and each gives another subset.

```python
def count_subsets_brute(nums, target):
    def go(i, remaining):
        if i == len(nums):
            return 1 if remaining == 0 else 0
        total = go(i + 1, remaining)
        if nums[i] <= remaining:
            total += go(i + 1, remaining - nums[i])
        return total
    return go(0, target)
```

**Complexity:** O(2^n) time and O(n) recursion depth.

## Approach 2: optimal (counting DP)

Keep `ways[t]`, the number of subsets of the elements seen so far that sum to `t`. Before any element only the empty
subset exists, so `ways[0] = 1`. A new element `a` creates, for every total `t`, `ways[t - a]` new subsets: each old
subset summing to `t - a`, now with `a` added. Update from high totals to low so that each element is added at most
once, and include `t = a`, even when `a` is 0.

```python
def count_subsets(nums, target, mod=None):
    ways = [0] * (target + 1)
    ways[0] = 1
    for a in nums:
        for t in range(target, a - 1, -1):
            ways[t] += ways[t - a]
            if mod:
                ways[t] %= mod
    return ways[target]
```

**Why it is correct:** subsets of the first `i` elements that sum to `t` split into two disjoint groups: those
without element `i` (already counted in `ways[t]`) and those with it (one for each subset of the earlier elements
summing to `t - a`). Adding the two counts covers every subset exactly once. For `a = 0` the loop ends at `t = 0`,
so `ways[0]` doubles and every other `ways[t]` doubles too, matching the fact that each subset may or may not
include the zero.

**Complexity:** O(n * target) time and O(target) space.

### Two-dimensional form

The table version makes the recurrence explicit, and is what you would draw on a whiteboard.

```python
def count_subsets_table(nums, target):
    rows = len(nums) + 1
    dp = [[0] * (target + 1) for _ in range(rows)]
    dp[0][0] = 1
    for i in range(1, rows):
        a = nums[i - 1]
        for t in range(target + 1):
            dp[i][t] = dp[i - 1][t] + (dp[i - 1][t - a] if t >= a else 0)
    return dp[-1][target]
```

## Tests

```python
import random
from itertools import combinations

def exhaustive(nums, target):
    return sum(1 for k in range(len(nums) + 1) for c in combinations(range(len(nums)), k)
               if sum(nums[i] for i in c) == target)

for f in (count_subsets, count_subsets_brute, count_subsets_table):
    assert f([1, 2, 3, 4], 5) == 2
    assert f([2, 2, 2], 4) == 3                       # equal values count separately
    assert f([0, 3], 3) == 2                          # a zero doubles the count
    assert f([0, 0], 0) == 4                          # {}, {0a}, {0b}, {0a, 0b}
    assert f([5, 6], 2) == 0
    assert f([], 0) == 1 and f([], 4) == 0            # empty array
    assert f([1] * 10, 3) == 120                      # C(10, 3)

random.seed(14)
for _ in range(400):
    nums = [random.randint(0, 6) for _ in range(random.randint(0, 8))]
    target = random.randint(0, 20)
    expected = exhaustive(nums, target)
    assert count_subsets(nums, target) == count_subsets_brute(nums, target) == count_subsets_table(nums, target) == expected

MOD = 10**9 + 7
assert count_subsets([1] * 1000, 500, MOD) == count_subsets([1] * 1000, 500) % MOD
```

## Edge cases and pitfalls

- Zeros: the empty subset already sums to 0, so with `k` zeros the count for target 0 is `2^k`. A loop that stops at
  `t = 1`, or a recursion that returns as soon as the remainder reaches 0, undercounts.
- Count positions, not values. Deduplicating the input first changes the answer for `[2, 2, 2]`.
- Counts grow exponentially. Python integers do not overflow, but in Java or C++ you need the modulus the problem
  gives, applied after each addition.
- Upward loops count multisets with repetition (the coin change counting problem) rather than subsets.

## Where this shows up in data engineering

Counting combinations is how you size a search before running it: how many groups of transactions could explain a
reconciliation difference, or how many combinations of partitions fit a size budget. If the count is in the
millions, you know to add constraints before enumerating. The same counting DP also underlies
[Target Sum](/interview/dsa/target-sum/), where signs are assigned instead of subsets chosen.

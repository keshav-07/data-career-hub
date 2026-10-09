---
title: "0 - 1 Knapsack Problem: Take or Skip Each Item Once"
seoTitle: "0/1 Knapsack: Take or Skip Each Item Once"
description: "Choose items to maximise total value without exceeding a weight limit. Build the take-or-skip DP table, then shrink it to one row by looping capacity downwards."
technology: ["dsa"]
topic: ["dynamic-programming", "knapsack"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Let best(i, w) be the highest value using the first i items with capacity w. Either skip item i, giving best(i - 1, w), or take it if it fits, giving val[i] + best(i - 1, w - wt[i]); keep the larger. Base case: no items or no capacity gives 0. Filling the table costs O(n * W) time. A single array of size W + 1 is enough if you loop capacity from high to low, so each item is used at most once. Looping upwards instead silently turns it into the unbounded knapsack. O(n * W) is pseudo-polynomial: it grows with the value of W, not its number of digits."
followUps: ["Why must the 1D loop go from high capacity to low?", "How would you recover which items were chosen?", "What changes for the unbounded knapsack, where each item can be taken many times?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/dynamic-programming"]
practice: {"platform": "GeeksforGeeks", "title": "0 - 1 Knapsack Problem", "url": "https://www.geeksforgeeks.org/problems/0-1-knapsack-problem0945/1"}
---

## Problem

You have `n` items, each with a weight and a value, and a bag that holds at most a total weight `W`. Pick a subset of
the items, each item at most once and never split, so that the total weight is at most `W` and the total value is as
large as possible. Return that value.

This is GeeksforGeeks: 0 - 1 Knapsack Problem. Assume up to about 1,000 items and capacity up to about 1,000, so an
`n * W` table is affordable. [Partition Equal Subset Sum](/interview/dsa/partition-equal-subset-sum/) and
[Target Sum](/interview/dsa/target-sum/) are variations of the same recurrence.

## Examples

```text
W = 8, values = [15, 20, 30, 25], weights = [2, 3, 5, 4]  ->  50   (weights 3 + 5: 20 + 30)
W = 6, values = [8, 3, 7], weights = [5, 1, 4]            ->  11   (weights 5 + 1; the 8 alone or 7 + 3 is worse)
W = 4, values = [5], weights = [2]                        ->  5    (one copy only, even though two would fit)
W = 0, values = [5], weights = [1]                        ->  0
```

## Approach 1: brute force (recursion)

For each item, try both choices and return the better result. This is the recurrence written directly.

```python
def knapsack_brute(W, val, wt):
    def best(i, cap):
        if i == len(val) or cap == 0:
            return 0
        skip = best(i + 1, cap)
        if wt[i] <= cap:
            return max(skip, val[i] + best(i + 1, cap - wt[i]))
        return skip
    return best(0, W)
```

**Complexity:** O(2^n) time, since every item doubles the number of branches, and O(n) recursion depth.

## Approach 2: optimal (bottom-up table)

The recursion only ever asks about pairs (items considered, capacity left), and there are just `(n + 1) * (W + 1)`
of them. Fill a table where `dp[i][w]` is the best value using the first `i` items and capacity `w`. Row `i` depends
only on row `i - 1`.

```python
def knapsack(W, val, wt):
    n = len(val)
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        weight, value = wt[i - 1], val[i - 1]
        for w in range(W + 1):
            dp[i][w] = dp[i - 1][w]
            if weight <= w:
                dp[i][w] = max(dp[i][w], value + dp[i - 1][w - weight])
    return dp[-1][W]
```

**Why it is correct:** the best selection from the first `i` items either excludes item `i`, in which case it is the
best selection from the first `i - 1` items at the same capacity, or includes it, in which case the rest is the best
selection from the first `i - 1` items with the remaining capacity. The table evaluates both and keeps the maximum.

**Complexity:** O(n * W) time and space.

### One-row version

Because each row reads only the row above, one array is enough, provided you go through capacities from `W` down to
the item's weight. Going downwards, `dp[w - weight]` still holds the value from before this item was considered, so
the item cannot be added twice.

```python
def knapsack_1d(W, val, wt):
    dp = [0] * (W + 1)
    for weight, value in zip(wt, val):
        for w in range(W, weight - 1, -1):
            dp[w] = max(dp[w], value + dp[w - weight])
    return dp[W]
```

**Complexity:** O(n * W) time and O(W) space.

## Tests

```python
import random
from itertools import combinations

def exhaustive(W, val, wt):
    best = 0
    for k in range(len(val) + 1):
        for pick in combinations(range(len(val)), k):
            if sum(wt[i] for i in pick) <= W:
                best = max(best, sum(val[i] for i in pick))
    return best

for f in (knapsack, knapsack_1d, knapsack_brute):
    assert f(8, [15, 20, 30, 25], [2, 3, 5, 4]) == 50
    assert f(6, [8, 3, 7], [5, 1, 4]) == 11
    assert f(4, [5], [2]) == 5                         # each item at most once
    assert f(0, [5], [1]) == 0                         # no capacity
    assert f(10, [], []) == 0                          # no items
    assert f(5, [7], [5]) == 7                         # exact fit
    assert f(4, [7], [5]) == 0                         # item too heavy
    assert f(6, [3, 3, 3], [2, 2, 2]) == 9             # equal items, each used once

random.seed(12)
for _ in range(300):
    n = random.randint(0, 7)
    val = [random.randint(1, 20) for _ in range(n)]
    wt = [random.randint(1, 10) for _ in range(n)]
    W = random.randint(0, 25)
    expected = exhaustive(W, val, wt)
    assert knapsack(W, val, wt) == knapsack_1d(W, val, wt) == knapsack_brute(W, val, wt) == expected

assert knapsack_1d(1000, list(range(1, 1001)), list(range(1, 1001))) == 1000
```

## Edge cases and pitfalls

- Looping capacity upwards in the 1D version lets an item be reused, which solves the unbounded knapsack instead.
  With capacity 4 and one item of weight 2 and value 5, the upward loop returns 10; the correct answer is 5.
- An item heavier than `W` is simply never taken; make sure the inner loop range handles it (the downward range is
  empty).
- Zero capacity or no items gives 0, not an error.
- O(n * W) is pseudo-polynomial. If `W` is in the billions, the table is impossible; switch to a DP over value, or
  branch and bound.

## Where this shows up in data engineering

Choosing which jobs, partitions or materialised views to fit into a fixed budget of memory, compute credits or a
maintenance window, each with a size and a benefit, is a 0/1 knapsack. In practice you often use a greedy
value-per-weight heuristic, but knowing the exact DP tells you when a small instance can be solved optimally and why
greedy can be wrong.

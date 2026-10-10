---
title: "Subset Sum Problem: Track Every Reachable Total"
seoTitle: "Subset Sum Problem: Reachable Totals DP"
description: "Subset sum problem: decide whether some subset of non-negative numbers hits a target with a take-or-skip table, compressed to one row or a Python bitset."
technology: ["dsa"]
topic: ["dynamic-programming", "knapsack"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Let can(i, t) say whether some subset of the first i numbers sums to t. Either skip number i, so can(i - 1, t), or use it, so can(i - 1, t - a[i]) when t >= a[i]. The empty subset makes can(i, 0) true. A single boolean array of size target + 1 suffices if you loop the target downwards for each number, so a number is used at most once. That is O(n * target) time and O(target) space. In Python, a big integer used as a bitset (reach |= reach << a) does the same work very quickly."
followUps: ["How would you return one subset that reaches the target, not just true or false?", "How does this change if the numbers can be negative?", "When would meet-in-the-middle beat the DP?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/dynamic-programming"]
practice: {"platform": "GeeksforGeeks", "title": "Subset Sum Problem", "url": "https://www.geeksforgeeks.org/problems/subset-sum-problem-1611555638/1"}
previous: "interview-questions:dsa/0-1-knapsack-problem"
next: "interview-questions:dsa/perfect-sum-problem"
---

## Problem

You get a list of non-negative integers and a target. Decide whether you can choose some of the numbers, each at
most once, whose sum is exactly the target.

This is GeeksforGeeks: Subset Sum Problem. It is the decision version of the 0/1 knapsack, and
[Partition Equal Subset Sum](/interview/dsa/partition-equal-subset-sum/) is the special case where the target is
half the total. Assume up to about 200 numbers and a target up to about 10,000.

## Examples

```text
nums = [6, 1, 8, 3], target = 10     ->  True    (6 + 1 + 3)
nums = [4, 9, 14], target = 6        ->  False
nums = [7, 2], target = 0            ->  True    (the empty subset)
nums = [], target = 3                ->  False
```

## Approach 1: brute force (recursion)

Walk the list and, for each number, try including it and excluding it. Stop early when the remaining target hits
zero.

```python
def subset_sum_brute(nums, target):
    def go(i, remaining):
        if remaining == 0:
            return True
        if i == len(nums):
            return False
        if nums[i] <= remaining and go(i + 1, remaining - nums[i]):
            return True
        return go(i + 1, remaining)
    return go(0, target)
```

**Complexity:** O(2^n) time in the worst case and O(n) recursion depth.

## Approach 2: optimal (boolean DP)

There are only `target + 1` totals worth tracking. Keep a row of booleans, `reach[t]`, meaning "some subset of the
numbers seen so far sums to t". Before any number, only 0 is reachable. Each new number `a` adds the totals `t`
where `t - a` was already reachable. Go from high `t` to low so that a total made with `a` in this round is not
used to add `a` again.

```python
def subset_sum(nums, target):
    reach = [False] * (target + 1)
    reach[0] = True
    for a in nums:
        for t in range(target, a - 1, -1):
            if reach[t - a]:
                reach[t] = True
        if reach[target]:
            return True
    return reach[target]
```

**Why it is correct:** after processing the first `i` numbers, `reach[t]` is true exactly when some subset of them
sums to `t`. That holds at the start (only the empty subset) and each step adds precisely the subsets that include
the new number. The downward loop reads only values from before this number, which enforces "at most once".

**Complexity:** O(n * target) time and O(target) space. The early return helps when the target is reached quickly.

## Approach 3: bitset

Represent the reachable totals as the bits of one integer: bit `t` is set when total `t` is reachable. Adding a
number `a` to every reachable total is a left shift by `a`, and combining with the old totals is a bitwise OR. Python
integers have arbitrary size, and these shifts run in C over machine words.

```python
def subset_sum_bitset(nums, target):
    mask = (1 << (target + 1)) - 1          # keep only totals up to target
    reach = 1                               # bit 0: the empty subset
    for a in nums:
        reach = (reach | (reach << a)) & mask
    return bool(reach >> target & 1)
```

**Complexity:** still O(n * target) bit operations, but about 64 totals per machine operation, so it is typically
far faster than the list version in Python.

## Tests

```python
import random
from itertools import combinations

def exhaustive(nums, target):
    return any(sum(c) == target for k in range(len(nums) + 1) for c in combinations(nums, k))

for f in (subset_sum, subset_sum_brute, subset_sum_bitset):
    assert f([6, 1, 8, 3], 10) is True
    assert f([4, 9, 14], 6) is False
    assert f([7, 2], 0) is True                        # empty subset
    assert f([], 3) is False                           # no numbers
    assert f([], 0) is True
    assert f([5], 5) is True and f([5], 10) is False   # a number used at most once
    assert f([0, 0, 4], 4) is True                     # zeros
    assert f([2, 4, 6], 7) is False                    # all even, odd target

random.seed(13)
for _ in range(400):
    nums = [random.randint(0, 12) for _ in range(random.randint(0, 8))]
    target = random.randint(0, 40)
    expected = exhaustive(nums, target)
    assert subset_sum(nums, target) == subset_sum_brute(nums, target) == subset_sum_bitset(nums, target) == expected

big = [random.randint(1, 100) for _ in range(200)]
assert subset_sum(big, 9_999) == subset_sum_bitset(big, 9_999)
```

## Edge cases and pitfalls

- Target 0 is always reachable with the empty subset, whatever the list holds.
- Looping the target upwards lets one number be used repeatedly (so `[5]` would reach 10). Loop downwards, or read
  from a copy of the previous row.
- A number larger than the target can never be used; the downward range starting at `target` and ending at `a`
  skips it automatically.
- The DP depends on the target's value, not its length. For a few large numbers, enumerating subsets of each half
  and matching sums (meet in the middle) is better.
- Negative numbers break the array indexing. Shift every total by the sum of the negatives, or use a set of
  reachable totals.

## Where this shows up in data engineering

Reconciliation is subset sum in disguise: finding which open invoices add up to a single bank payment, or which
ledger lines explain a balance difference. Real tools add tolerances and limits on subset size, because the number
of candidate combinations grows exponentially and many subsets can match the same amount.

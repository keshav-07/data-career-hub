---
title: "Partition Into 2 Subsets with Min Sum Diff: Subset Sum Up to Half the Total"
seoTitle: "Minimum Sum Partition: Subset Sum to Half"
description: "Split an array into two groups whose sums are as close as possible. Find every subset sum reachable up to half the total, then take the largest one."
technology: ["dsa"]
topic: ["dynamic-programming", "knapsack"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "If one group sums to s, the other sums to total - s, so the difference is total - 2s. Minimising it means finding the largest reachable subset sum s that is at most total // 2. Compute reachable sums with the 0/1 subset-sum DP (a boolean array of size total // 2 + 1, updated from high to low for each number), then scan down from total // 2 to the first reachable value. Time O(n * total), space O(total). A Python integer bitset does the same in a few lines. The greedy idea of giving each number to the lighter group is wrong."
followUps: ["Why is it enough to look only at sums up to half the total?", "How would you return the two groups themselves?", "What if the two groups must also have equal sizes?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/dynamic-programming"]
practice: {"platform": "GeeksforGeeks", "title": "Partition Into 2 Subsets with Min Sum Diff", "url": "https://www.geeksforgeeks.org/problems/minimum-sum-partition3317/1"}
previous: "interview-questions:dsa/perfect-sum-problem"
next: "interview-questions:dsa/longest-palindromic-substring"
---

## Problem

You get an array of positive integers. Divide all of them into two groups, every element in exactly one group (a
group may be empty), so that the absolute difference between the two group sums is as small as possible. Return that
smallest difference.

This is GeeksforGeeks: Partition Into 2 Subsets with Min Sum Diff, often called the minimum sum partition problem.
It generalises [Partition Equal Subset Sum](/interview/dsa/partition-equal-subset-sum/), which asks only whether
the difference can be 0, and builds on the [Subset Sum Problem](/interview/dsa/subset-sum-problem/). Assume up to
about 100 numbers with a total up to about 10,000.

## Examples

```text
[7, 3, 5, 1]       ->  0    ({7, 1} and {3, 5}: 8 and 8)
[9, 4, 2]          ->  3    ({9} and {4, 2}: 9 and 6)
[10, 1, 2]         ->  7    (10 against 3: a large element dominates)
[6]                ->  6    (the other group is empty)
```

## Approach 1: brute force (try every split)

Give each element to group A or group B in every possible way, and keep the smallest difference. Only group A's sum
needs tracking, since group B's is the total minus it.

```python
def min_diff_brute(nums):
    total = sum(nums)

    def go(i, a_sum):
        if i == len(nums):
            return abs(total - 2 * a_sum)
        return min(go(i + 1, a_sum + nums[i]), go(i + 1, a_sum))

    return go(0, 0)
```

**Complexity:** O(2^n) time and O(n) recursion depth.

## Approach 2: optimal (subset sums up to half the total)

Every split is described by one group's sum `s`; the difference is `|total - 2s|`. Swapping the names of the groups
does not change the difference, so you may assume `s` is the smaller sum, at most `total // 2`. The best split is
the reachable `s` closest to `total // 2` from below. So compute which sums up to half the total some subset can
make, using the 0/1 subset-sum DP, and take the largest.

```python
def min_diff(nums):
    total = sum(nums)
    half = total // 2
    reach = [False] * (half + 1)
    reach[0] = True
    for a in nums:
        for s in range(half, a - 1, -1):
            if reach[s - a]:
                reach[s] = True
    for s in range(half, -1, -1):
        if reach[s]:
            return total - 2 * s
```

**Why it is correct:** `reach[s]` is true exactly when some subset sums to `s` (the standard subset-sum invariant;
the downward loop uses each number at most once). Every split has a smaller-sum group with sum at most `half`, so
the optimum is among the values checked, and the largest reachable `s` gives the smallest `total - 2s`. The scan
always stops, because `reach[0]` is true for the empty group.

**Complexity:** O(n * total) time and O(total) space.

## Approach 3: bitset

The same reachable set fits in the bits of a Python integer: bit `s` is set when sum `s` is reachable, and adding a
number is a shift and OR. Afterwards, mask off everything above `half` and read the highest set bit.

```python
def min_diff_bitset(nums):
    total = sum(nums)
    half = total // 2
    reach = 1
    for a in nums:
        reach |= reach << a
    best = (reach & ((1 << (half + 1)) - 1)).bit_length() - 1
    return total - 2 * best
```

**Complexity:** O(n * total) bit operations, done about 64 at a time, so usually much faster in Python. Without a
mask during the loop, the integer grows to `total` bits, which is fine at this size.

## Why greedy fails

Sorting in descending order and giving each number to the currently lighter group is a reasonable heuristic, but it
is not exact. On `[3, 3, 2, 2, 2]` it puts the two 3s in separate groups and the three 2s then alternate, giving 7 and 5,
a difference of 2, while `{3, 3}` against `{2, 2, 2}` gives 6 and 6, a difference of 0.

```python
def min_diff_greedy(nums):
    a = b = 0
    for x in sorted(nums, reverse=True):
        if a <= b:
            a += x
        else:
            b += x
    return abs(a - b)

assert min_diff_greedy([3, 3, 2, 2, 2]) == 2
assert min_diff([3, 3, 2, 2, 2]) == 0
```

## Tests

```python
import random

for f in (min_diff, min_diff_brute, min_diff_bitset):
    assert f([7, 3, 5, 1]) == 0
    assert f([9, 4, 2]) == 3
    assert f([8, 3, 5, 4]) == 2                        # 10 is not reachable: best is 9 vs 11
    assert f([10, 1, 2]) == 7                          # {10} and {1, 2}
    assert f([3, 3, 2, 2, 2]) == 0                     # greedy gets 2
    assert f([6]) == 6                                 # one element: the other group is empty
    assert f([]) == 0                                  # empty array
    assert f([5, 5]) == 0
    assert f([1, 2, 4, 8, 16]) == 1                    # 15 vs 16

random.seed(15)
for _ in range(400):
    nums = [random.randint(1, 15) for _ in range(random.randint(0, 9))]
    expected = min_diff_brute(nums)
    assert min_diff(nums) == expected == min_diff_bitset(nums)

big = [random.randint(1, 100) for _ in range(100)]
assert min_diff(big) == min_diff_bitset(big)
```

## Edge cases and pitfalls

- Use `total // 2` and scan downwards from it. With an odd total the answer is at least 1, and the scan handles that
  without special cases.
- Loop the inner sum downwards. An upward loop reuses a number and can report a split that does not exist.
- A group may be empty, so a single element gives a difference equal to that element.
- The DP is pseudo-polynomial: it depends on the total, not the count. For a handful of very large numbers, use
  meet in the middle: enumerate subset sums of each half, sort one side, and binary search for the best partner.
- If the platform's array can contain zeros or negative numbers, zeros change nothing, but negatives need the sums
  shifted or a set of reachable sums instead of an array.

## Where this shows up in data engineering

Balancing work between two machines, or splitting files between two batches so both take about as long, is this
problem with sizes or runtimes as the numbers. With more than two workers it becomes multiway number partitioning,
where engines and schedulers normally use greedy heuristics such as largest-first assignment. This page shows what
those heuristics give up and how to get the exact answer when the instance is small.

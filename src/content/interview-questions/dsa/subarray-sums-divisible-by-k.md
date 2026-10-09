---
title: "Subarray Sums Divisible by K: Count Matching Prefix Remainders"
seoTitle: "Subarray Sums Divisible by K: Prefix Remainders"
description: "Count contiguous subarrays whose sum is a multiple of k. Learn why equal prefix-sum remainders mark such a subarray, and how a counting map makes it O(n)."
technology: ["dsa"]
topic: ["prefix-sum", "hashing"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A slice i..j sums to prefix[j+1] - prefix[i], and that difference is divisible by k exactly when both prefixes leave the same remainder mod k. Walk the array keeping the running prefix mod k and a count of how many times each remainder has appeared, seeded with {0: 1} for the empty prefix. At each step add the count for the current remainder to the answer, then increment it. This is O(n) time and O(k) space. The pitfall is negative numbers: use a remainder in 0..k-1, which Python's % gives but C++ and Java do not."
followUps: ["How would you handle the same problem in Java, where -1 % 5 is -1?", "How would you find the longest such subarray instead of counting them?", "What changes if the subarray must have at least two elements?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/subarray-sum-equals-k"]
practice: {"platform": "LeetCode", "number": 974, "title": "Subarray Sums Divisible by K", "url": "https://leetcode.com/problems/subarray-sums-divisible-by-k/"}
---

## Problem

You are given a list of integers `nums`, which may contain negatives and zeros, and a positive integer `k`. Count the non-empty contiguous subarrays whose sum is divisible by `k` (a sum of 0 counts). This is LeetCode 974, Subarray Sums Divisible by K.

The list has up to about 3 · 10^4 elements and `k` is at least 2, up to about 10^4.

## Examples

```text
nums = [3, 1, 2, -3],  k = 3   ->  6    ([3], [3, 1, 2], [3, 1, 2, -3], [1, 2], [1, 2, -3], [-3])
nums = [4],            k = 4   ->  1
nums = [1, 2],         k = 5   ->  0
nums = [0, 0],         k = 7   ->  3    ([0], [0], [0, 0])
```

## Approach 1: brute force

Fix each start, extend the end, and keep a running sum so each subarray costs O(1).

```python
def count_divisible_brute(nums, k):
    count = 0
    for i in range(len(nums)):
        total = 0
        for j in range(i, len(nums)):
            total += nums[j]
            if total % k == 0:
                count += 1
    return count
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (prefix remainders and a counting map)

**Key insight:** write `P[t]` for the sum of the first `t` elements, with `P[0] = 0`. The subarray from `i` to `j` sums to `P[j+1] - P[i]`. A difference is divisible by `k` exactly when the two numbers have the same remainder mod `k`. So the question becomes: for each prefix, how many earlier prefixes share its remainder?

Walkthrough on `[3, 1, 2, -3]`, `k = 3`. The map starts at `{0: 1}` for the empty prefix.

| x | prefix | prefix % 3 | earlier with same remainder | total |
|---|---|---|---|---|
| 3 | 3 | 0 | 1 | 1 |
| 1 | 4 | 1 | 0 | 1 |
| 2 | 6 | 0 | 2 | 3 |
| -3 | 3 | 0 | 3 | 6 |

The last step matches three earlier prefixes with remainder 0 (the empty prefix, after `3` and after `2`), which are the subarrays `[3, 1, 2, -3]`, `[1, 2, -3]` and `[-3]`.

```python
def count_divisible(nums, k):
    seen = {0: 1}               # remainder -> how many prefixes had it
    prefix = 0
    count = 0
    for x in nums:
        prefix = (prefix + x) % k          # Python's % is always in 0..k-1
        count += seen.get(prefix, 0)
        seen[prefix] = seen.get(prefix, 0) + 1
    return count
```

Because remainders lie in `0..k-1`, a list of length `k` can replace the dictionary.

**Why it is correct:** every subarray corresponds to exactly one pair of prefix positions `i < j+1`, and it qualifies exactly when the two prefixes share a remainder. When the scan reaches a prefix, the map holds the remainders of all earlier prefixes, so adding the matching count counts each qualifying pair once, at its right end.

**Complexity:** O(n) time, O(min(n, k)) extra space.

## Tests

```python
import random

for f in (count_divisible, count_divisible_brute):
    assert f([3, 1, 2, -3], 3) == 6
    assert f([4], 4) == 1
    assert f([1, 2], 5) == 0
    assert f([0, 0], 7) == 3                 # zero sums count
    assert f([-1, 2, 9], 2) == 2             # negatives: [-1, 2, 9] and [2]
    assert f([5, 5, 5], 5) == 6              # every subarray
    assert f([], 3) == 0                     # defensive

random.seed(1)
for _ in range(500):
    arr = [random.randint(-9, 9) for _ in range(random.randint(1, 10))]
    k = random.randint(2, 6)
    assert count_divisible(arr, k) == count_divisible_brute(arr, k)
```

## Edge cases and pitfalls

- **Negative remainders.** In Java, C and C++, `-1 % 5` is `-1`, which would never match a prefix with remainder 4. Normalise with `((p % k) + k) % k`. Python's `%` already returns a value in `0..k-1` for positive `k`.
- **Seed the map with `{0: 1}`.** Without the empty prefix, subarrays that start at index 0 are missed.
- Look up before you increment, or each prefix pairs with itself.
- You never need the full prefix sum, only its remainder, so values stay small.

## Where this shows up in data engineering

Grouping running totals by a modulus is how you find stretches that balance to a multiple, such as batches that fill an exact number of fixed-size pages or shipments of whole cases. More generally, "two cumulative values with the same key mark a qualifying range" is the trick behind many window-function solutions in SQL, where you partition a running total by its remainder and count pairs.

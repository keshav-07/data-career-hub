---
title: "Single Number III: Split Two Unique Values With One XOR Bit"
seoTitle: "Single Number III: XOR and the Lowest Set Bit"
description: "Find the two values that appear once when every other value appears twice. Learn to XOR everything, pick one differing bit, and split the array into two groups."
technology: ["dsa"]
topic: ["bit-manipulation", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "XOR of all numbers cancels every pair and leaves a ^ b, where a and b are the two singles. Since a != b, that value has at least one set bit, and a and b differ there. Take the lowest one with x & -x, then XOR the numbers that have that bit into one group and the rest into another. Each pair lands in the same group and cancels, so the groups give a and b. O(n) time, O(1) space. A counter is simpler but uses O(n) space. In Python, x & -x works for negatives too, because integers act as infinite two's complement."
followUps: ["Why is x & -x the lowest set bit?", "How would you find the single number when every other value appears three times?", "What if there were three single numbers?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing", "interview-questions:dsa/single-number"]
practice: {"platform": "LeetCode", "number": 260, "title": "Single Number III", "url": "https://leetcode.com/problems/single-number-iii/"}
---

## Problem

You are given a list of integers `nums` in which exactly two values appear once and every other value appears exactly twice. Return the two values that appear once, in any order. This is LeetCode 260, Single Number III.

The target is O(n) time and O(1) extra space. Values can be negative and fit in 32 bits. The code below returns the pair in increasing order so tests are easy to write.

## Examples

```text
nums = [4, 7, 4, 9, 2, 9]     ->  [2, 7]
nums = [-1, 0]                ->  [-1, 0]
nums = [6, 1, 6, 3]           ->  [1, 3]
```

## Approach 1: brute force with a counter

Count each value and keep the ones with count 1.

```python
from collections import Counter

def single_pair_count(nums):
    return sorted(v for v, c in Counter(nums).items() if c == 1)
```

**Complexity:** O(n) time on average, O(n) extra space. Without a hash map, counting each value with `nums.count` is O(n²).

## Approach 2: optimal (XOR and partition by one bit)

**Key insight:** XOR has three useful properties: `x ^ x = 0`, `x ^ 0 = x`, and order does not matter. XOR-ing everything therefore removes all pairs and leaves `a ^ b`. That alone does not separate `a` from `b`, but any 1 bit in `a ^ b` is a position where they differ. Split the numbers by that bit: `a` and `b` fall into different groups, and both copies of every paired value fall into the same group. XOR each group separately.

Walkthrough on `[4, 7, 4, 9, 2, 9]`:

| step | value |
|---|---|
| XOR of all | 7 ^ 2 = 0b111 ^ 0b010 = 0b101 = 5 |
| lowest set bit, `5 & -5` | 0b001 = 1 |
| group with bit 1 set | 7, 9, 9 → XOR = 7 |
| group with bit 1 clear | 4, 4, 2 → XOR = 2 |

```python
def single_pair(nums):
    both = 0
    for x in nums:
        both ^= x                    # a ^ b
    low_bit = both & -both           # lowest bit where a and b differ
    a = 0
    for x in nums:
        if x & low_bit:
            a ^= x
    b = both ^ a
    return sorted([a, b])
```

`b` comes for free: since `both = a ^ b`, `both ^ a = b`.

**Why `x & -x` isolates the lowest set bit:** in two's complement, `-x` is `~x + 1`. Inverting flips every bit, and adding 1 carries through the trailing 1s (which were the trailing 0s of `x`) until it reaches the first 0, which was the lowest 1 of `x`. So `x` and `-x` agree only at that bit. Python integers behave like two's complement with unlimited width, so this holds for negative values too.

**Why it is correct:** each paired value contributes both copies to the same group, so it cancels there. `a` and `b` differ at `low_bit`, so they land in different groups, and each group's XOR is exactly its single value.

**Complexity:** O(n) time, O(1) extra space.

## Tests

```python
import random

for f in (single_pair, single_pair_count):
    assert f([4, 7, 4, 9, 2, 9]) == [2, 7]
    assert f([-1, 0]) == [-1, 0]                     # negative and zero
    assert f([6, 1, 6, 3]) == [1, 3]
    assert f([2, 3]) == [2, 3]                       # only the two singles
    assert f([-8, 5, -8, -3]) == [-3, 5]
    assert f([2**31 - 1, -2**31]) == [-2**31, 2**31 - 1]   # 32-bit extremes

random.seed(14)
for _ in range(500):
    pool = random.sample(range(-50, 50), random.randint(2, 10))
    a, b, rest = pool[0], pool[1], pool[2:]
    arr = [a, b] + rest + rest
    random.shuffle(arr)
    assert single_pair(arr) == single_pair_count(arr) == sorted([a, b])
```

## Edge cases and pitfalls

- `a ^ b` is never 0, because the two singles are different values, so a set bit always exists.
- **Fixed-width languages.** When `a ^ b` is the minimum 32-bit integer, `-x` overflows. Java wraps and still returns the right bit, but in C++ signed overflow is undefined behaviour, so do the trick on an unsigned value. Python has no overflow.
- Any set bit of `a ^ b` works, not only the lowest. The lowest is just the cheapest to extract.
- Return the pair in the order the caller expects. The problem accepts any order, so sorting is optional.

## Where this shows up in data engineering

XOR-based checksums are used to compare two datasets cheaply: XOR the hashes of every row on each side, and matching sides cancel to the same value. This problem shows how to go one step further and identify the rows that differ, by splitting on a bit of the combined checksum, which is the idea behind some set-reconciliation techniques for syncing replicas.

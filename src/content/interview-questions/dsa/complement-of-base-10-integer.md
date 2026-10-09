---
title: "Complement of Base 10 Integer: Flip Bits With an All-Ones Mask"
seoTitle: "Complement of Base 10 Integer: XOR With a Mask"
description: "Flip every bit of a non-negative integer's binary form, ignoring leading zeros. Learn the all-ones mask and XOR trick, and why the input 0 needs special care."
technology: ["dsa"]
topic: ["bit-manipulation"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Only the bits up to the highest set bit count, so build a mask of that many 1s: mask = (1 << n.bit_length()) - 1. XOR with the mask flips exactly those bits, so the answer is n ^ mask, or equivalently mask - n. The trap is 0: its binary form is a single 0, whose complement is 1, but bit_length() is 0, so handle it with max(1, ...). It runs in O(log n) time at worst and O(1) space. Python's ~n does not work: it gives -n - 1 because Python integers have no fixed width."
followUps: ["Why does ~n give a negative number in Python?", "How would you flip only bits i through j?", "How would you compute the bit length without bit_length()?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 1009, "title": "Complement of Base 10 Integer", "url": "https://leetcode.com/problems/complement-of-base-10-integer/"}
previous: "interview-questions:dsa/counting-bits"
next: "interview-questions:dsa/sum-of-two-integers"
---

## Problem

Given a non-negative integer `n`, write it in binary without leading zeros, flip every bit (0 becomes 1 and 1 becomes 0), and return the resulting number in base 10. This is LeetCode 1009, Complement of Base 10 Integer.

`n` is below 10^9, so it fits in 30 bits. The binary form of 0 is the single digit 0.

## Examples

```text
n = 5    (101)      ->  2    (010)
n = 12   (1100)     ->  3    (0011)
n = 7    (111)      ->  0    (000)
n = 0    (0)        ->  1    (1)
```

## Approach 1: brute force with strings

Convert to a binary string, flip each character, and parse it back.

```python
def complement_string(n):
    bits = bin(n)[2:]                       # "0b101" -> "101"
    flipped = "".join("1" if b == "0" else "0" for b in bits)
    return int(flipped, 2)
```

**Complexity:** O(log n) time and space for the string. It is correct and readable, but interviewers usually want the bitwise version.

## Approach 2: optimal (all-ones mask and XOR)

**Key insight:** XOR with 1 flips a bit and XOR with 0 leaves it alone. So you need a number that has 1s in exactly the positions that `n` uses and 0s above them. That number is `2^k - 1`, where `k` is the count of binary digits of `n`.

| n | binary | k | mask | n ^ mask |
|---|---|---|---|---|
| 5 | 101 | 3 | 111 | 010 = 2 |
| 12 | 1100 | 4 | 1111 | 0011 = 3 |
| 0 | 0 | 1 | 1 | 1 |

```python
def complement(n):
    k = max(1, n.bit_length())              # 0 still has one digit
    mask = (1 << k) - 1
    return n ^ mask
```

If you cannot use `bit_length()`, grow the mask until it covers `n`:

```python
def complement_loop(n):
    mask = 1
    while mask < n:
        mask = (mask << 1) | 1
    return n ^ mask
```

Starting from `mask = 1` handles 0 and 1 without a special case.

**Why it is correct:** the mask has 1s in every position from 0 to `k - 1` and 0s above, which are exactly the positions in `n`'s binary form. XOR flips each of those bits and leaves the infinitely many leading zeros as zeros. Because every bit of `n` sits under a 1 of the mask, `n ^ mask` also equals `mask - n`.

**Complexity:** O(1) with `bit_length()` for numbers of bounded size, O(log n) for the loop. O(1) extra space.

## Tests

```python
for f in (complement, complement_loop, complement_string):
    assert f(5) == 2
    assert f(12) == 3
    assert f(7) == 0                       # all ones flip to zero
    assert f(0) == 1                       # special case
    assert f(1) == 0
    assert f(8) == 7                       # power of two: 1000 -> 0111
    assert f(10**9 - 1) == ((1 << (10**9 - 1).bit_length()) - 1) - (10**9 - 1)

for n in range(0, 5000):
    assert complement(n) == complement_loop(n) == complement_string(n)
    assert complement(n) + n == (1 << max(1, n.bit_length())) - 1
```

## Edge cases and pitfalls

- **Zero.** `(0).bit_length()` is 0, which gives a mask of 0 and a wrong answer of 0. The expected answer is 1.
- **Python's `~`.** Python integers behave as if they had infinitely many sign bits, so `~5` is `-6`, not 2. You must mask.
- **Fixed-width languages.** In Java or C, `~n` flips all 32 bits, so you still AND or XOR with the mask to keep only the meaningful ones.
- This problem is the same as LeetCode 476 (Number Complement) apart from the 0 case.

## Where this shows up in data engineering

Masks like `(1 << k) - 1` appear whenever bits are packed into one integer: feature flags, permission sets, partition bucket IDs taken from the low bits of a hash, and bitmap indexes. Knowing that a language's integer width changes what `~` does avoids subtle bugs when moving such logic between Python, SQL engines and the JVM.

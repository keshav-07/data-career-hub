---
title: "Longest Palindrome: Pair Up Letter Counts and Keep One Centre"
seoTitle: "Longest Palindrome: Pair Counts Plus One Centre"
description: "Longest palindrome from a string's letters: use every pair of letters, then add one odd letter as the centre. Counting argument with Python code."
technology: ["dsa"]
topic: ["hashing", "strings", "greedy"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A palindrome mirrors around its centre, so every letter except possibly one must be used an even number of times. Count each letter; each count c contributes c // 2 * 2 letters as mirrored pairs. If any count was odd, one spare letter can sit in the middle, so add 1. That is O(n) time and O(1) space for a fixed alphabet. A neat equivalent: the answer is n minus the number of odd counts, plus 1 if there was at least one odd count. Letters are case-sensitive."
followUps: ["How would you actually build one such palindrome, not just its length?", "Can the letters of a string be rearranged into a palindrome at all?", "How does this differ from finding the longest palindromic substring?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 409, "title": "Longest Palindrome", "url": "https://leetcode.com/problems/longest-palindrome/"}
previous: "interview-questions:dsa/first-unique-character-in-a-string"
next: "interview-questions:dsa/ransom-note"
---

## Problem

You are given a string `s` of upper- and lowercase English letters. Using any subset of its letters, each letter at most as many times as it appears, you want to arrange a palindrome. Return the length of the longest one possible. Upper and lower case count as different letters. This is LeetCode 409, Longest Palindrome.

You only return the length, and the order of `s` does not matter.

## Examples

```text
s = "aabbbcd"     ->  5    (e.g. "abbba": pairs a, a, b, b plus a spare b in the middle)
s = "Aa"          ->  1    ("A" and "a" are different letters)
s = "zzzz"        ->  4
s = "x"           ->  1
```

## Approach 1: brute force

Try every multiset of letters, from largest to smallest, and test whether it can be arranged into a palindrome. A multiset can form a palindrome when at most one letter has an odd count. Enumerating subsets is exponential, so this only works for tiny inputs, but it is a useful oracle for testing.

```python
from collections import Counter
from itertools import combinations

def longest_palindrome_brute(s):
    for size in range(len(s), 0, -1):
        for picked in combinations(s, size):
            odd = sum(c % 2 for c in Counter(picked).values())
            if odd <= 1:
                return size
    return 0
```

**Complexity:** O(2^n · n) time in the worst case. Only for checking the real solution on short strings.

## Approach 2: optimal (counting pairs)

**Key insight:** a palindrome reads the same from both ends, so letters come in mirrored pairs. The only exception is the single middle position of an odd-length palindrome. So use as many pairs of each letter as you can, then, if any letter had a leftover, spend one leftover on the middle.

```python
from collections import Counter

def longest_palindrome(s):
    length = 0
    has_odd = False
    for c in Counter(s).values():
        length += c // 2 * 2
        if c % 2:
            has_odd = True
    return length + (1 if has_odd else 0)
```

On `"aabbbcd"` the counts are a:2, b:3, c:1, d:1. Pairs give 2 + 2 + 0 + 0 = 4 letters, some count is odd, so the answer is 5.

The same idea as a one-liner: every odd count wastes exactly one letter, except that one of them can be the centre.

```python
def longest_palindrome_odds(s):
    odd = sum(c % 2 for c in Counter(s).values())
    return len(s) - odd + (1 if odd else 0)
```

**Why it is correct:** no palindrome can use more than `c // 2 * 2` copies of a letter in mirrored positions, and it has at most one unmirrored position. The greedy choice reaches both limits at once, so nothing longer exists.

**Complexity:** O(n) time, O(k) space for an alphabet of k letters (at most 52 here, so O(1)).

## Tests

```python
import random

for f in (longest_palindrome, longest_palindrome_odds, longest_palindrome_brute):
    assert f("aabbbcd") == 5
    assert f("Aa") == 1                 # case-sensitive
    assert f("zzzz") == 4               # all pairs, no centre needed
    assert f("x") == 1
    assert f("abc") == 1                # only a centre
    assert f("aaabbbccc") == 7          # three odd counts, one becomes the centre

assert longest_palindrome("") == 0      # defensive

random.seed(4)
for _ in range(300):
    s = "".join(random.choice("abAB") for _ in range(random.randint(1, 8)))
    assert longest_palindrome(s) == longest_palindrome_odds(s) == longest_palindrome_brute(s)
```

## Edge cases and pitfalls

- Add the centre at most **once**, not once per odd letter. `"aaabbbccc"` gives 7, not 9.
- An odd count still contributes its pairs: three `b`s give two mirrored `b`s plus a candidate centre. Skipping odd counts entirely is a common mistake.
- Do not lowercase the input; the problem treats `"A"` and `"a"` as different.
- This is about rearranging letters. It is unrelated to the longest palindromic substring, which keeps the original order.

## Where this shows up in data engineering

The pattern is "aggregate counts, then reason about parity", which is a `GROUP BY` followed by a small calculation over the counts. Parity checks on counts are also a cheap sanity check in pipelines, for example confirming that every opening event has a matching closing event.

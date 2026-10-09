---
title: "First Unique Character in a String: Count, Then Scan Again"
description: "Return the index of the first character that appears exactly once in a string. Learn the two-pass frequency count that turns an O(n²) check into O(n)."
technology: ["dsa"]
topic: ["hashing", "strings"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Make two passes. The first counts how often each character occurs, using a dictionary or a 26-slot array for lowercase letters. The second walks the string in order and returns the first index whose character has count 1, or -1 if none does. Both passes are O(n), and the count table is O(1) space for a fixed alphabet. The pitfall is scanning the counts instead of the string: a dictionary's order is insertion order, which happens to work in Python 3.7+, but the string scan is the clear, portable answer."
followUps: ["How would you answer the same question for a stream where characters keep arriving?", "What changes if the string can contain any Unicode character?", "How would you find the first character that repeats instead?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 387, "title": "First Unique Character in a String", "url": "https://leetcode.com/problems/first-unique-character-in-a-string/"}
---

## Problem

Given a string `s`, return the index of the first character that occurs exactly once in the whole string. If every character repeats, return -1. This is LeetCode 387, First Unique Character in a String.

The string has between 1 and about 10^5 characters, all lowercase English letters.

## Examples

```text
s = "racecars"     ->  3     ("e" is the only letter used once)
s = "stream"       ->  0     (every letter is unique, so the first one wins)
s = "abab"         ->  -1    (no unique letter)
s = "z"            ->  0
```

## Approach 1: brute force

For each position, check whether its character appears anywhere else.

```python
def first_unique_brute(s):
    for i, ch in enumerate(s):
        if all(s[j] != ch for j in range(len(s)) if j != i):
            return i
    return -1
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (frequency count, two passes)

**Key insight:** "unique" is a property of the whole string, so you cannot decide it on the first visit. Count everything first, then make a second pass in the original order and pick the first character whose count is 1.

```python
from collections import Counter

def first_unique(s):
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1
```

For a fixed lowercase alphabet, a list of 26 counters avoids hashing altogether:

```python
def first_unique_array(s):
    counts = [0] * 26
    for ch in s:
        counts[ord(ch) - ord("a")] += 1
    for i, ch in enumerate(s):
        if counts[ord(ch) - ord("a")] == 1:
            return i
    return -1
```

**Why it is correct:** after the first pass, `counts[ch]` is the exact number of occurrences of `ch` in `s`. The second pass visits indices in increasing order and stops at the first one with count 1, which is the definition of the answer.

**Complexity:** O(n) time. Extra space is O(k) for an alphabet of size k: O(1) for 26 letters, and at most O(n) for arbitrary characters.

## Tests

```python
import random
import string

for f in (first_unique, first_unique_array, first_unique_brute):
    assert f("racecars") == 3
    assert f("stream") == 0               # all unique
    assert f("abab") == -1                # none unique
    assert f("z") == 0                    # single character
    assert f("aabbccd") == 6              # unique character at the end
    assert f("zzzz") == -1

assert first_unique("") == -1 and first_unique_brute("") == -1   # defensive

random.seed(2)
for _ in range(500):
    s = "".join(random.choice("abcde") for _ in range(random.randint(1, 12)))
    assert first_unique(s) == first_unique_array(s) == first_unique_brute(s)
```

## Edge cases and pitfalls

- Return the **index**, not the character. Return -1, not `None`, when nothing qualifies.
- Do not try to decide in one pass by removing characters when you see them again: a character seen three times would be re-added on the third visit.
- If the input is not limited to lowercase letters, the 26-slot array breaks (negative or too-large indices); use `Counter` instead.
- Upper and lower case are different characters unless the problem says otherwise.

## Where this shows up in data engineering

Counting then filtering for frequency 1 is `GROUP BY key HAVING COUNT(*) = 1`, used to find singleton keys such as customers with one order or events that never got a follow-up. Keeping the original order while doing it is what a window function like `COUNT(*) OVER (PARTITION BY key)` gives you in SQL.

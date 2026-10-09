---
title: "Ransom Note: Check Letter Supply Against Demand With a Counter"
seoTitle: "Ransom Note: Letter Counts With a Hash Map"
description: "Decide whether one string can be built from the letters of another, each used once. Learn the frequency-count check that runs in O(m + n) time."
technology: ["dsa"]
topic: ["hashing", "strings"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Count the letters available in the magazine with a dictionary or a 26-slot array. Then walk the note and spend one count per letter; if any count would drop below zero, the note cannot be built. This is O(m + n) time and O(1) space for a fixed alphabet. In Python, Counter(note) <= Counter(magazine) expresses the same check in one line (Python 3.10+). An early exit when the note is longer than the magazine is a cheap extra check."
followUps: ["What if the magazine is huge and the note is tiny: which string do you count?", "How would you report which letters are short, and by how many?", "How does this change if the strings contain arbitrary Unicode text?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/arrays-and-hashing"]
practice: {"platform": "LeetCode", "number": 383, "title": "Ransom Note", "url": "https://leetcode.com/problems/ransom-note/"}
previous: "interview-questions:dsa/longest-palindrome"
next: "interview-questions:dsa/valid-sudoku"
---

## Problem

You are given two strings, `note` and `magazine`. Return `True` if `note` can be written by cutting letters out of `magazine`, where each letter in `magazine` can be used at most once, and `False` otherwise. Order does not matter. This is LeetCode 383, Ransom Note.

Both strings contain lowercase English letters and are up to about 10^5 characters long.

## Examples

```text
note = "tea",   magazine = "eatery"   ->  True
note = "tree",  magazine = "rte"      ->  False   (needs two e's, magazine has one)
note = "",      magazine = "abc"      ->  True    (nothing to build)
note = "a",     magazine = ""         ->  False
```

## Approach 1: brute force

For each letter of the note, find and remove a matching letter from a list copy of the magazine.

```python
def can_construct_brute(note, magazine):
    letters = list(magazine)
    for ch in note:
        if ch not in letters:
            return False
        letters.remove(ch)
    return True
```

**Complexity:** O(m · n) time, because each `in` and `remove` scans the list. O(n) extra space for the copy.

## Approach 2: optimal (frequency count)

**Key insight:** order is irrelevant, so only the number of copies of each letter matters. Build the supply once, then let the note draw it down.

```python
def can_construct(note, magazine):
    if len(note) > len(magazine):
        return False
    supply = [0] * 26
    for ch in magazine:
        supply[ord(ch) - ord("a")] += 1
    for ch in note:
        i = ord(ch) - ord("a")
        supply[i] -= 1
        if supply[i] < 0:
            return False
    return True
```

With `collections.Counter`, the comparison is a one-liner. Counter's `<=` checks that every count on the left is at most the matching count on the right (available from Python 3.10).

```python
from collections import Counter

def can_construct_counter(note, magazine):
    return Counter(note) <= Counter(magazine)
```

**Why it is correct:** the note can be built exactly when, for every letter, the note needs no more copies than the magazine has. The loop checks that inequality letter by letter as it spends counts, and it fails the moment any letter runs out.

**Complexity:** O(m + n) time, O(1) extra space for the 26 counters (O(k) for an alphabet of size k).

## Tests

```python
import random

for f in (can_construct, can_construct_counter, can_construct_brute):
    assert f("tea", "eatery") is True
    assert f("tree", "rte") is False      # not enough copies of one letter
    assert f("", "abc") is True           # empty note
    assert f("a", "") is False            # empty magazine
    assert f("", "") is True
    assert f("aab", "baa") is True        # exact match of counts
    assert f("abc", "ab") is False        # letter missing entirely

random.seed(9)
for _ in range(500):
    note = "".join(random.choice("abc") for _ in range(random.randint(0, 6)))
    mag = "".join(random.choice("abc") for _ in range(random.randint(0, 8)))
    assert can_construct(note, mag) == can_construct_counter(note, mag) == can_construct_brute(note, mag)
```

## Edge cases and pitfalls

- Count the **magazine** as supply and subtract the **note**. Doing it the other way round answers a different question.
- Using a set instead of counts ignores multiplicity: `"tree"` from `"rte"` would wrongly pass.
- The 26-slot array assumes lowercase letters; anything else needs a dictionary.
- `Counter`'s rich comparisons need Python 3.10 or later. On older versions, check `not (Counter(note) - Counter(magazine))`.

## Where this shows up in data engineering

This is a supply-versus-demand check: can the stock on hand cover these orders, or does a target table contain at least as many rows per key as the source? In SQL you aggregate both sides by key, join, and look for keys where demand exceeds supply. Reporting the shortfall instead of a single yes or no is usually what a data quality check needs.

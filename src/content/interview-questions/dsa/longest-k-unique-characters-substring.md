---
title: "Longest K Unique Characters Substring: A Window Bounded by a Distinct Count"
seoTitle: "Longest K Unique Characters Substring"
description: "Find the longest substring with exactly k distinct characters, or -1 if none exists. A sliding window with a character count map solves it in O(n)."
technology: ["dsa"]
topic: ["sliding-window", "hashing", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Slide a window over the string and keep a count of each character inside it. Move the right end one step at a time and add its character. While the window holds more than k distinct characters, remove characters from the left, deleting a key when its count reaches zero. Whenever the window has exactly k distinct characters, it is a candidate, so record its length. Return the best length, or -1 if no window ever had exactly k. This is O(n) time and O(k) extra space. The trap is returning the length of a window with fewer than k distinct characters, for example when the whole string has fewer than k."
followUps: ["How would you change it to allow at most k distinct characters?", "How would you count the substrings with exactly k distinct characters?", "What changes if the input is a stream and you cannot look back?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window"]
practice: {"platform": "GeeksforGeeks", "title": "Longest K unique characters substring", "url": "https://www.geeksforgeeks.org/problems/longest-k-unique-characters-substring0853/1"}
---

## Problem

You are given a string `s` of lowercase letters and an integer `k` (at least 1). Return the length of the longest contiguous substring that contains exactly `k` different characters. If no substring has exactly `k` distinct characters, return -1. This is the GeeksforGeeks problem Longest K unique characters substring.

## Examples

```text
s = "xyxzzzy",  k = 2   ->  4    ("xzzz" or "zzzy")
s = "abcbbd",   k = 3   ->  5    ("abcbb" or "bcbbd")
s = "aaaa",     k = 1   ->  4    (the whole string)
s = "aaaa",     k = 2   ->  -1   (only one distinct character exists)
```

## Approach 1: brute force

For each start, extend to the right while tracking the set of characters seen. Once the set grows past `k`, longer substrings from this start can only have more, so stop.

```python
def longest_k_unique_brute(s, k):
    best = -1
    for start in range(len(s)):
        seen = set()
        for end in range(start, len(s)):
            seen.add(s[end])
            if len(seen) > k:
                break
            if len(seen) == k:
                best = max(best, end - start + 1)
    return best
```

**Complexity:** O(n²) time, O(k) space for the set.

## Approach 2: optimal (variable-size sliding window with counts)

**Idea in plain English:** keep a window and a dictionary that maps each character in the window to how many times it appears there, so the number of keys is the number of distinct characters. Extend the window to the right. If that pushes the distinct count above `k`, shrink from the left until it is back to `k`, removing a key when its count drops to zero. Any time the distinct count is exactly `k`, the window is a valid answer and you compare its length with the best.

Walkthrough on `"xyxzzzy"`, `k = 2`:

| right | char | window after shrink | distinct | best |
|---|---|---|---|---|
| 0 | x | x | 1 | -1 |
| 1 | y | xy | 2 | 2 |
| 2 | x | xyx | 2 | 3 |
| 3 | z | xz (dropped x, y) | 2 | 3 |
| 4 | z | xzz | 2 | 3 |
| 5 | z | xzzz | 2 | 4 |
| 6 | y | zzzy (dropped x) | 2 | 4 |

```python
def longest_k_unique(s, k):
    counts = {}
    left = 0
    best = -1
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        while len(counts) > k:
            out = s[left]
            counts[out] -= 1
            if counts[out] == 0:
                del counts[out]
            left += 1
        if len(counts) == k:
            best = max(best, right - left + 1)
    return best
```

**Why it is correct:** for each right end, the loop leaves `left` at the smallest start whose window has at most `k` distinct characters. Moving the start further left would add characters and exceed `k`, so if the window ending at `right` with exactly `k` distinct characters exists, the longest one starts at `left`. The left pointer never needs to go back, because a window that already has too many distinct characters still has too many when extended to the right. Taking the maximum over all right ends gives the answer.

**Complexity:** O(n) time, as each character enters and leaves the window once, and O(k) extra space for the dictionary (at most k + 1 keys).

## Tests

```python
import random

for f in (longest_k_unique, longest_k_unique_brute):
    assert f("xyxzzzy", 2) == 4
    assert f("abcbbd", 3) == 5
    assert f("aaaa", 1) == 4
    assert f("aaaa", 2) == -1                # fewer than k distinct overall
    assert f("", 1) == -1                    # empty string
    assert f("abc", 3) == 3                  # whole string, exactly k
    assert f("abc", 1) == 1
    assert f("abaccc", 2) == 4               # "accc"

random.seed(853)
for _ in range(800):
    s = "".join(random.choice("abcd") for _ in range(random.randint(0, 12)))
    k = random.randint(1, 5)
    assert longest_k_unique(s, k) == longest_k_unique_brute(s, k)

assert longest_k_unique("ab" * 50_000, 2) == 100_000    # long input
```

## Edge cases and pitfalls

- Only record a length when the window has exactly `k` distinct characters. Recording windows with fewer gives a wrong positive answer when the string has fewer than `k` distinct characters in total.
- Delete a key when its count reaches zero; otherwise `len(counts)` keeps counting characters that have left the window.
- Shrink with `while`, not `if`. Removing one character from the left may not reduce the distinct count (another copy can remain), so several removals can be needed.
- Return -1 for "no answer", not 0, since that is what this problem asks for. Check the convention in whatever variant you are given.

## Where this shows up in data engineering

The "at most k distinct values in a window" constraint appears when you cap the number of distinct keys in a batch, for example writing contiguous runs of records that touch at most k partitions per file, or finding the longest stretch of a session that involved exactly k products. The count-map window is the same structure used for approximate distinct counts over a recent range of events.

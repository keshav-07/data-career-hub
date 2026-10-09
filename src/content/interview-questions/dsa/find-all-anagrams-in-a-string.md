---
title: "Find All Anagrams in a String: Fixed Window With Letter Counts"
seoTitle: "Find All Anagrams in a String: Fixed Window"
description: "Return every start index where a substring of s is an anagram of p. Slide a window of len(p), update letter counts in O(1) per step: O(n) time overall."
technology: ["dsa"]
topic: ["sliding-window", "hashing", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "An anagram of p has exactly p's length and letter counts, so slide a window of len(p) across s. Keep 26 counts for p and 26 for the window. Each step adds the entering letter and removes the leaving one, which is O(1). Record the start index whenever the two count arrays match; comparing 26 slots is constant work, or you can maintain a counter of how many letters currently match. This is O(n) time and O(1) space. Check the window after it is updated, including the very last one, and return an empty list when p is longer than s."
followUps: ["How does a matches counter avoid comparing all 26 counts at every step?", "What changes if the alphabet is arbitrary Unicode?", "How would you find anagrams of any of several patterns of the same length?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window", "interview-questions:dsa/permutation-in-string"]
practice: {"platform": "LeetCode", "number": 438, "title": "Find All Anagrams in a String", "url": "https://leetcode.com/problems/find-all-anagrams-in-a-string/"}
---

## Problem

You are given two lowercase strings, `s` and `p`. Return a list of every index `i` such that the substring of `s` starting at `i` with the same length as `p` is a rearrangement of `p` (the same letters with the same counts). Return the indices in increasing order. This is LeetCode 438, Find All Anagrams in a String. It extends Permutation in String, which only asks whether one such index exists.

## Examples

```text
s = "nabbanab",      p = "ab"       ->  [1, 3, 6]   ("ab", "ba", "ab")
s = "listensilent",  p = "silent"   ->  [0, 3, 6]   ("listen", "tensil", "silent")
s = "aaaa",          p = "aa"       ->  [0, 1, 2]   (windows overlap)
s = "abc",           p = "abcd"     ->  []          (p longer than s)
```

## Approach 1: brute force

Compare the sorted form of every window with sorted `p`.

```python
def find_anagrams_brute(s, p):
    m = len(p)
    target = sorted(p)
    return [i for i in range(len(s) - m + 1) if sorted(s[i:i + m]) == target]
```

**Complexity:** O((n − m + 1) · m log m) time, O(m) space per window. Fine for short patterns, slow when `p` is long.

## Approach 2: optimal (fixed-size sliding window with counts)

**Idea in plain English:** neighbouring windows share all but two letters: one enters on the right and one leaves on the left. So keep the window's letter counts and update just those two letters per step rather than recounting. The window is an anagram exactly when its counts equal `p`'s. Comparing two lists of 26 integers costs a fixed amount, so the whole scan is linear.

Walkthrough on `s = "nabbanab"`, `p = "ab"`:

| start | window | counts equal? | result |
|---|---|---|---|
| 0 | na | no | |
| 1 | ab | yes | [1] |
| 2 | bb | no | |
| 3 | ba | yes | [1, 3] |
| 4 | an | no | |
| 5 | na | no | |
| 6 | ab | yes | [1, 3, 6] |

```python
def find_anagrams(s, p):
    n, m = len(s), len(p)
    if m > n:
        return []
    need = [0] * 26
    have = [0] * 26
    for ch in p:
        need[ord(ch) - 97] += 1
    result = []
    for right in range(n):
        have[ord(s[right]) - 97] += 1          # letter enters
        if right >= m:
            have[ord(s[right - m]) - 97] -= 1  # letter leaves
        if right >= m - 1 and have == need:
            result.append(right - m + 1)
    return result
```

**Why it is correct:** after processing index `right` (once `right >= m − 1`), `have` holds the letter counts of exactly `s[right − m + 1 .. right]`, because each letter is added when it enters and removed exactly `m` steps later. Two strings are anagrams if and only if their letter counts are equal, so the check records precisely the anagram windows, and every window of length `m` is checked once.

**Complexity:** O(26 · n) = O(n) time and O(1) space (two fixed arrays). Keeping a running `matches` count of letters whose counts agree removes the factor of 26, as shown in the Permutation in String solution.

### Variant with a dictionary

For a general alphabet, use `Counter` objects and delete keys that drop to zero so equality stays correct.

```python
from collections import Counter

def find_anagrams_counter(s, p):
    m = len(p)
    need = Counter(p)
    window = Counter()
    result = []
    for right, ch in enumerate(s):
        window[ch] += 1
        if right >= m:
            out = s[right - m]
            window[out] -= 1
            if window[out] == 0:
                del window[out]
        if right >= m - 1 and window == need:
            result.append(right - m + 1)
    return result
```

## Tests

```python
import random

for f in (find_anagrams, find_anagrams_brute, find_anagrams_counter):
    assert f("nabbanab", "ab") == [1, 3, 6]
    assert f("listensilent", "silent") == [0, 3, 6]
    assert f("aaaa", "aa") == [0, 1, 2]          # overlapping matches
    assert f("abc", "abcd") == []                # p longer than s
    assert f("xyz", "q") == []
    assert f("z", "z") == [0]                    # equal strings
    assert f("ba", "ab") == [0]
    assert f("aab", "ab") == [1]                 # counts matter, not just letters

random.seed(438)
for _ in range(800):
    s = "".join(random.choice("abc") for _ in range(random.randint(0, 12)))
    p = "".join(random.choice("abc") for _ in range(random.randint(1, 4)))
    expected = find_anagrams_brute(s, p)
    assert find_anagrams(s, p) == expected
    assert find_anagrams_counter(s, p) == expected

assert len(find_anagrams("ab" * 50_000, "ba")) == 99_999   # long input
```

## Edge cases and pitfalls

- Return an empty list when `p` is longer than `s`; otherwise index arithmetic produces negative starts.
- Check the window only once it is full (`right >= m − 1`), and remember the last window, which is easy to miss when the check sits before the update in the loop.
- Matches can overlap, as in `"aaaa"`; do not jump ahead by `m` after a match.
- With a `Counter`, delete keys whose count drops to zero. Since Python 3.10, `Counter` equality treats a missing key and a zero count as equal, but explicit deletion keeps the code correct on older versions and with plain dictionaries or other languages' maps.

## Where this shows up in data engineering

A fixed-length window that keeps per-category counts is a rolling histogram: for example, the counts of event types in the last 100 events, compared against an expected profile to flag anomalies. Updating only the entering and leaving item is what makes such rolling profiles cheap enough to run on every event.

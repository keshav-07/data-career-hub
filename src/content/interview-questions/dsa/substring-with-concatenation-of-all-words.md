---
title: "Substring with Concatenation of All Words: Word-Sized Sliding Windows per Offset"
seoTitle: "Concatenation of All Words: Word Windows"
description: "Find every index where s holds all the given equal-length words joined in any order. Slide a word-step window for each offset: O(n · w) time overall."
technology: ["dsa"]
topic: ["sliding-window", "hashing", "strings"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "All words have the same length w, so any match is a run of m consecutive w-length chunks whose multiset equals the word list. The brute force checks every start index by chopping m chunks and comparing counts, O(n · m · w). The better solution splits the work by offset: for each r from 0 to w − 1, read s as chunks starting at r and slide a window of chunks with a count map. Add the next chunk; if it is not a word, clear the window and restart after it; if it now appears too often, drop chunks from the left until it fits. When the window holds m chunks, record its start. Each chunk enters and leaves once per offset, giving O(n · w) time. Duplicate words in the list are the usual trap."
followUps: ["Why does processing each of the w offsets separately cover every possible start index?", "How would you handle words of different lengths?", "How would the solution change if the word list could be empty?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/sliding-window", "interview-questions:dsa/find-all-anagrams-in-a-string"]
practice: {"platform": "LeetCode", "number": 30, "title": "Substring with Concatenation of All Words", "url": "https://leetcode.com/problems/substring-with-concatenation-of-all-words/"}
---

## Problem

You are given a string `s` and a non-empty list `words` of strings that all have the same length `w`. A concatenation is any string formed by joining every word in `words` exactly once, in any order (a word listed twice must appear twice). Return every start index in `s` where some concatenation begins, in any order. This is LeetCode 30, Substring with Concatenation of All Words.

## Examples

```text
s = "dogcatcatdog",  words = ["cat", "dog"]          ->  [0, 6]     ("dogcat", "catdog")
s = "xxabbaabxx",    words = ["ab", "ba"]            ->  [2, 4]     ("abba", "baab")
s = "aaaaaa",        words = ["aa", "aa"]            ->  [0, 1, 2]  (duplicate words, overlapping)
s = "catdogcow",     words = ["cat", "cow"]          ->  []         (cat and cow are not adjacent)
s = "abab",          words = ["ab", "ab", "ab"]      ->  []         (s too short)
```

## Approach 1: brute force

At each start index, cut the next `m · w` characters into `m` chunks and compare their counts with the word counts.

```python
from collections import Counter

def find_substring_brute(s, words):
    w, m = len(words[0]), len(words)
    total = w * m
    need = Counter(words)
    result = []
    for start in range(len(s) - total + 1):
        chunks = Counter(s[start + j * w:start + (j + 1) * w] for j in range(m))
        if chunks == need:
            result.append(start)
    return result
```

**Complexity:** O((n − m · w + 1) · m · w) time, since each start slices `m` chunks of length `w`; O(m) space for the counters.

## Approach 2: optimal (one sliding window per offset)

**Idea in plain English:** a match always starts at some index `start`, and from there it is cut into chunks at `start`, `start + w`, `start + 2w` and so on. Group start indices by `start % w`. Within one group the chunk boundaries line up, so you can read `s` as a sequence of whole chunks and run an ordinary sliding window over that sequence, where each step adds one chunk instead of one character.

For a fixed offset `r`, the window holds consecutive chunks with a count map:

1. Read the next chunk. If it is not one of the words, no window can contain it: clear the map and start the window after it.
2. Otherwise add it. If its count now exceeds the required count, drop chunks from the left until it does not.
3. If the window now holds exactly `m` chunks, its left edge is an answer.

Walkthrough on `s = "dogcatcatdog"`, `words = ["cat", "dog"]`, `w = 3`, offset 0 (chunks `dog`, `cat`, `cat`, `dog`):

| chunk | action | window | full? |
|---|---|---|---|
| dog | add | dog | no |
| cat | add | dog cat | yes: record 0, then drop dog |
| cat | cat now 2 > 1: drop the older cat | cat | no |
| dog | add | cat dog | yes: record 6 |

Offsets 1 and 2 produce chunks such as `ogc` and `gca` that are not words, so they record nothing.

```python
from collections import Counter

def find_substring(s, words):
    w, m = len(words[0]), len(words)
    n = len(s)
    need = Counter(words)
    result = []
    for offset in range(w):
        left = offset
        have = Counter()
        used = 0                                    # chunks in the window
        for right in range(offset, n - w + 1, w):
            chunk = s[right:right + w]
            if chunk not in need:
                have.clear()
                used = 0
                left = right + w
                continue
            have[chunk] += 1
            used += 1
            while have[chunk] > need[chunk]:
                have[s[left:left + w]] -= 1
                used -= 1
                left += w
            if used == m:
                result.append(left)
                have[s[left:left + w]] -= 1         # slide: drop the first chunk
                used -= 1
                left += w
    return sorted(result)
```

**Why it is correct:** every start index belongs to exactly one offset class, and within that class the chunks seen are exactly the chunks a match starting there would be cut into. For a fixed class, the window is always a run of consecutive chunks in which no word occurs more often than required. When it reaches `m` chunks, every count must then equal its requirement exactly (the counts sum to `m` and none exceeds its limit), so it is a concatenation. Conversely, a real match is never skipped: its chunks are all words, so it never triggers a reset, and the left edge only moves past a chunk when keeping it would exceed a count, which cannot happen inside a match. After recording, the code drops the first chunk so the window can slide on and catch overlapping matches.

**Complexity:** for each of the `w` offsets, about `n / w` chunks enter and leave once, and each slice or hash costs O(w). That is O(w · (n / w) · w) = O(n · w) time, independent of the number of words, and O(m) space for the count maps.

## Tests

```python
import random

for f in (find_substring, find_substring_brute):
    assert sorted(f("dogcatcatdog", ["cat", "dog"])) == [0, 6]
    assert sorted(f("xxabbaabxx", ["ab", "ba"])) == [2, 4]
    assert sorted(f("aaaaaa", ["aa", "aa"])) == [0, 1, 2]     # duplicates, overlaps
    assert f("catdogcow", ["cat", "cow"]) == []
    assert f("abab", ["ab", "ab", "ab"]) == []                # s too short
    assert f("", ["a"]) == []
    assert sorted(f("abc", ["b"])) == [1]                     # w = 1
    assert sorted(f("foofoobar", ["foo", "bar"])) == [3]

random.seed(30)
for _ in range(1500):
    w = random.randint(1, 3)
    m = random.randint(1, 3)
    words = ["".join(random.choice("ab") for _ in range(w)) for _ in range(m)]
    s = "".join(random.choice("ab") for _ in range(random.randint(0, 14)))
    assert sorted(find_substring(s, words)) == sorted(find_substring_brute(s, words))

long_s = "ab" * 20_000
assert len(find_substring(long_s, ["ab", "ab", "ab"])) == len(find_substring_brute(long_s, ["ab", "ab", "ab"]))
```

## Edge cases and pitfalls

- Duplicate words matter. Use counts, not a set, or `["aa", "aa"]` would accept a single `"aa"`.
- Run the window for every offset from 0 to `w − 1`. Stepping only from index 0 in steps of `w` misses matches that start at other positions, such as index 1 in `"aaaaaa"`.
- On a chunk that is not a word, reset the whole window and move the left edge past it; shrinking one chunk at a time would leave the bad chunk inside.
- After recording a match, drop one chunk so the window can continue; otherwise the next chunk is added to a full window.
- If `s` is shorter than the total length `m · w`, the answer is empty; both versions handle it because their loops do not reach a full window.

## Where this shows up in data engineering

Fixed-width records are common in legacy feeds and binary formats, and searching a byte stream for a block that contains a required set of fixed-width codes, in any order, is this exact problem. The general lesson, aligning a sliding window to record boundaries and running one scan per alignment, also applies when parsing fixed-width files whose starting offset is unknown.

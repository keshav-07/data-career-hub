---
title: "Extra Characters in a String: Dynamic Programming over a Trie of Words"
seoTitle: "Extra Characters in a String: DP and a Trie"
description: "Split a string into dictionary words while leaving as few characters unused as possible. Suffix DP with a trie of words turns the search into O(n²) time."
technology: ["dsa"]
topic: ["tries", "dynamic-programming", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Let dp[i] be the fewest leftover characters in the suffix starting at i, with dp[n] = 0. At each i you either skip s[i] (cost 1 + dp[i+1]) or use a dictionary word that starts at i and ends at j (cost dp[j+1]). Walking a trie from position i finds every matching word in one pass and stops as soon as no word continues, so the whole DP is O(n²) plus the cost of building the trie. The pitfall is checking every substring against a set, which adds a factor for slicing and hashing."
followUps: ["How would you return the actual split, not just the count?", "What changes if each dictionary word may be used at most once?", "When is a plain set of words good enough instead of a trie?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/word-break", "interview-questions:dsa/implement-trie-prefix-tree", "articles:dsa/binary-trees"]
practice: {"platform": "LeetCode", "number": 2707, "title": "Extra Characters in a String", "url": "https://leetcode.com/problems/extra-characters-in-a-string/"}
---

## Problem

You have a string `s` and a list of distinct dictionary words. Cut `s` into non-overlapping pieces so that as many characters as possible belong to pieces that are dictionary words; any characters that are not covered by a word are "extra". Words can be reused. Return the minimum number of extra characters. This is LeetCode 2707, Extra Characters in a String. Strings are short (tens of characters) and lowercase.

## Examples

```text
s = "datalake",  words = ["data", "lake", "la"]     ->  0   ("data" + "lake")
s = "xdatay",    words = ["data"]                   ->  2   (x and y are extra)
s = "abc",       words = ["d"]                      ->  3
s = "aaa",       words = ["a"]                      ->  0
```

## Approach 1: brute force (recursion over every split)

At each position, either treat the current character as extra or jump past any dictionary word that starts here. Try all choices.

```python
def min_extra_brute(s, words):
    vocab = set(words)

    def solve(i):
        if i == len(s):
            return 0
        best = 1 + solve(i + 1)
        for j in range(i + 1, len(s) + 1):
            if s[i:j] in vocab:
                best = min(best, solve(j))
        return best

    return solve(0)
```

**Complexity:** exponential in the worst case, because the same suffix is solved again and again.

## Approach 2: optimal (suffix DP with a trie)

Only the starting position matters for the rest of the answer, so store one number per position. Compute from the end backwards: `dp[i] = 1 + dp[i + 1]` if you drop `s[i]`, or `dp[j + 1]` for every word `s[i..j]`. To find those words without slicing, walk a trie from `s[i]` character by character; every node marked as a word end gives a candidate `j`, and the walk stops when the trie has no child for the next character.

```python
def build_trie(words):
    root = {}
    for w in words:
        node = root
        for ch in w:
            node = node.setdefault(ch, {})
        node["$"] = True
    return root

def min_extra(s, words):
    root = build_trie(words)
    n = len(s)
    dp = [0] * (n + 1)
    for i in range(n - 1, -1, -1):
        dp[i] = 1 + dp[i + 1]
        node = root
        for j in range(i, n):
            node = node.get(s[j])
            if node is None:
                break
            if "$" in node:
                dp[i] = min(dp[i], dp[j + 1])
    return dp[0]
```

**Why it is correct:** any optimal split of the suffix at `i` starts with either an extra `s[i]` or a word `s[i..j]`, and the rest is an optimal split of a shorter suffix, which `dp` already holds. The trie walk lists exactly the words that start at `i`.

**Complexity:** O(n²) time for the DP (each start walks at most n characters) plus O(total word length) to build the trie; O(n + total word length) space.

## Tests

```python
import random

for f in (min_extra, min_extra_brute):
    assert f("datalake", ["data", "lake", "la"]) == 0
    assert f("xdatay", ["data"]) == 2
    assert f("abc", ["d"]) == 3
    assert f("aaa", ["a"]) == 0
    assert f("", ["a"]) == 0
    assert f("abc", []) == 3
    assert f("abcab", ["abc", "ab", "cab"]) == 0   # several splits possible
    assert f("abcab", ["abca", "bcab", "a"]) == 0  # longest-first greedy gives 1

random.seed(5)
for _ in range(300):
    s = "".join(random.choice("ab") for _ in range(random.randint(0, 10)))
    words = list({"".join(random.choice("ab") for _ in range(random.randint(1, 3)))
                  for _ in range(random.randint(0, 4))})
    assert min_extra(s, words) == min_extra_brute(s, words)
print("ok")
```

## Edge cases and pitfalls

- Do not stop at the first word that matches. The shorter word may leave a worse remainder than a longer one (and the reverse), so take the minimum over all of them.
- A greedy "longest match first" split is wrong: on `"abcab"` with words `["abca", "bcab", "a"]` it takes `"abca"` and leaves `b` extra, while `"a"` + `"bcab"` leaves nothing.
- Break out of the trie walk as soon as a character has no child; that is where the speed-up comes from.
- Reusing words is allowed, so the trie never needs to track usage.

## Where this shows up in data engineering

Segmenting text against a dictionary appears when parsing concatenated identifiers, splitting hashtags or URL slugs into words, or tokenising product codes made of known parts. The trie-plus-DP pattern is also how longest-match tokenisers and some log parsers find known prefixes quickly, and the "cost of leftovers" framing is a handy way to score how well a record matches a reference vocabulary.

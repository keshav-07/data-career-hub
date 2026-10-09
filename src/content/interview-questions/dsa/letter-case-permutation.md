---
title: "Letter Case Permutation: Branch Twice on Every Letter"
seoTitle: "Letter Case Permutation: Backtracking"
description: "Generate every string formed by switching letters between lower and upper case. Backtrack with two branches per letter and one per digit, or build the list iteratively."
technology: ["dsa"]
topic: ["backtracking", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Walk the string position by position. A digit has one choice, so keep it; a letter has two, so recurse once with its lower-case form and once with its upper-case form. When the position reaches the end, record the built string. With k letters there are 2^k results, each of length n, so time and output size are O(2^k * n). An iterative version starts from [''] and, at each character, extends every partial string by one or two options. The pitfall is branching on digits, which creates duplicates."
followUps: ["How many results are there for a string with k letters, and why?", "How would you generate them in lexicographic order?", "How would you produce the results lazily, one at a time?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/backtracking"]
practice: {"platform": "LeetCode", "number": 784, "title": "Letter Case Permutation", "url": "https://leetcode.com/problems/letter-case-permutation/"}
---

## Problem

You get a string of English letters and digits. You may switch any letter to lower or upper case independently.
Return every distinct string you can make this way, in any order. Digits never change.

This is LeetCode 784, Letter Case Permutation. Assume the string has at most 12 characters, so there are at most
4,096 results. It is a close cousin of [Subsets](/interview/dsa/subsets/): each letter is an independent binary
choice.

## Examples

```text
"c4d"   ->  ["c4d", "c4D", "C4d", "C4D"]
"7z"    ->  ["7z", "7Z"]
"42"    ->  ["42"]          (no letters: one result)
"Q"     ->  ["q", "Q"]      (input case does not matter)
```

## Approach 1: brute force (bitmask enumeration)

Number the letters `0..k-1`. Every integer from `0` to `2^k - 1` is one choice pattern: bit `i` set means letter
`i` is upper case.

```python
def letter_case_bitmask(s):
    letter_positions = [i for i, ch in enumerate(s) if ch.isalpha()]
    k = len(letter_positions)
    results = []
    for mask in range(1 << k):
        chars = list(s.lower())
        for bit, pos in enumerate(letter_positions):
            if mask >> bit & 1:
                chars[pos] = chars[pos].upper()
        results.append("".join(chars))
    return results
```

**Complexity:** O(2^k * n) time and output space. This is as fast as any method, because the output alone has that
size; it is "brute force" only in that it rebuilds every string from scratch.

## Approach 2: optimal (backtracking)

Build the answer one character at a time in a shared list. At each position decide what goes there: for a digit
there is one option, for a letter two. After exploring an option, the next option overwrites the same slot, so no
explicit undo is needed beyond that. When the position equals the length, the list holds one complete string.

```python
def letter_case_permutation(s):
    results = []
    path = list(s)

    def backtrack(i):
        if i == len(s):
            results.append("".join(path))
            return
        if s[i].isalpha():
            for option in (s[i].lower(), s[i].upper()):
                path[i] = option
                backtrack(i + 1)
        else:
            backtrack(i + 1)

    backtrack(0)
    return results
```

**Why it is correct:** the recursion tree has one level per character, two children at letters and one at digits,
so its leaves are exactly the 2^k combinations of case choices. Different leaves differ in at least one letter's
case, so there are no duplicates.

**Complexity:** O(2^k * n) time (2^k leaves, each joined in O(n)) and O(n) recursion depth besides the output.

## Approach 3: iterative expansion

The same tree, built level by level: keep a list of partial strings and extend each by every option for the next
character.

```python
def letter_case_iterative(s):
    partials = [""]
    for ch in s:
        options = {ch.lower(), ch.upper()}
        partials = [p + o for p in partials for o in sorted(options)]
    return partials
```

Using a set for the options collapses the two identical "cases" of a digit into one, which is the whole trick.

## Tests

```python
import random, string

def expected(s):
    from itertools import product
    return sorted({"".join(t) for t in product(*[{c.lower(), c.upper()} for c in s])})

for f in (letter_case_permutation, letter_case_bitmask, letter_case_iterative):
    assert sorted(f("c4d")) == ["C4D", "C4d", "c4D", "c4d"]
    assert sorted(f("7z")) == ["7Z", "7z"]
    assert f("42") == ["42"]                        # digits only
    assert sorted(f("Q")) == ["Q", "q"]
    assert f("") == [""]                            # empty string
    assert len(f("abcdefghijkl")) == 4096           # 12 letters
    assert len(set(f("aB3cD"))) == 16               # no duplicates

random.seed(1)
for _ in range(200):
    s = "".join(random.choice(string.ascii_letters + string.digits) for _ in range(random.randint(0, 7)))
    for f in (letter_case_permutation, letter_case_bitmask, letter_case_iterative):
        assert sorted(f(s)) == expected(s)
```

## Edge cases and pitfalls

- Branching on digits doubles the work and produces duplicate strings. Only letters branch.
- The input may already contain upper-case letters, so generate both `lower()` and `upper()` rather than "keep or
  capitalise", which would miss the lower-case form of `"Q"`.
- Join the path when recording a result. Appending the list itself stores a reference that later changes.
- The empty string has exactly one permutation, the empty string.

## Where this shows up in data engineering

The pattern is "expand each field into its allowed variants and take the cross product", which is how you generate
test inputs for case-insensitive matching, build all spellings of a key when a source system stores identifiers
inconsistently, or enumerate every combination of flag columns for a coverage test. The growth is the same 2^k, so
the same caution about blow-up applies when the number of independent choices grows.

---
title: "Remove All Adjacent Duplicates in String II: Stack of Character Counts"
seoTitle: "Remove Adjacent Duplicates II: Count Stack"
description: "Repeatedly delete runs of k equal neighbouring letters. Keep a stack of (letter, run length) pairs so each removal is O(1) and the whole pass is O(n)."
technology: ["dsa"]
topic: ["stack", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Scan the string with a stack of [letter, count] pairs describing the surviving runs. If the next letter matches the top run, increment its count, and pop the run when the count reaches k; otherwise push a new run with count 1. Popping can make two runs of the same letter adjacent, but the next matching letter simply extends the run now on top, so chain reactions are handled. Rebuild the answer by repeating each letter by its count. This is O(n) time and O(n) space; scanning back over the stack to count each time would be O(n·k)."
followUps: ["Why store counts instead of comparing the last k characters each time?", "How would you solve it in place with a write pointer and a counts array?", "What happens when k is 1 or larger than the string?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks", "interview-questions:dsa/remove-all-adjacent-duplicates-in-string"]
practice: {"platform": "LeetCode", "number": 1209, "title": "Remove All Adjacent Duplicates in String II", "url": "https://leetcode.com/problems/remove-all-adjacent-duplicates-in-string-ii/"}
---

## Problem

You get a string `s` of lowercase letters and an integer `k ≥ 2`. Whenever `k` equal letters stand next to each other, remove that whole block, which joins its left and right neighbours. Keep removing until no block of `k` equal adjacent letters remains, and return the result. This is LeetCode 1209, Remove All Adjacent Duplicates in String II.

As in the k = 2 version, the order of removals does not change the final string. The string can be up to around 100,000 characters and `k` up to around 10,000, so both O(n²) and O(n·k) approaches are too slow.

## Examples

```text
s = "pqqqpp",       k = 3   ->  ""        (remove "qqq" -> "ppp", then remove "ppp")
s = "abbbaac",      k = 3   ->  "c"       (remove "bbb" -> "aaac", then "aaa")
s = "aabbaa",       k = 2   ->  ""
s = "abcd",         k = 2   ->  "abcd"
s = "aaaa",         k = 3   ->  "a"
```

## Approach 1: brute force

Scan for a block of `k` equal letters, cut it out, and start over until nothing changes.

```python
def remove_k_brute(s, k):
    changed = True
    while changed:
        changed = False
        run = 1
        for i in range(1, len(s) + 1):
            if i < len(s) and s[i] == s[i - 1]:
                run += 1
                if run == k:
                    s = s[:i - k + 1] + s[i + 1:]
                    changed = True
                    break
            else:
                run = 1
    return s
```

**Complexity:** each removal is O(n) to find and rebuild, with up to n/k removals, so O(n²/k) time in the worst case and O(n) space. A version that checks "are the last k characters on the result stack equal?" for every character is O(n·k).

## Approach 2: optimal (stack of runs)

**Idea.** Instead of storing every surviving letter, store runs: a stack of `[letter, count]`. The top of the stack is the run that the next letter could join. Matching letter: add one to the count, and if it reaches `k`, the run disappears, so pop it. Different letter: push a new run of length 1. After a pop, the new top is the run immediately to the left, so the next letter is compared with the correct neighbour, which handles chain reactions.

Walkthrough on `"abbbaac"`, `k = 3`:

| Char | Action | Stack after |
|---|---|---|
| a | push | [a,1] |
| b | push | [a,1] [b,1] |
| b | count 2 | [a,1] [b,2] |
| b | count 3, pop | [a,1] |
| a | count 2 | [a,2] |
| a | count 3, pop | (empty) |
| c | push | [c,1] |

```python
def remove_duplicates_k(s, k):
    stack = []                      # list of [letter, count]
    for ch in s:
        if stack and stack[-1][0] == ch:
            stack[-1][1] += 1
            if stack[-1][1] == k:
                stack.pop()
        else:
            stack.append([ch, 1])
    return "".join(ch * count for ch, count in stack)
```

**Why it is correct.** The invariant is that the stack describes the fully reduced form of the prefix read so far, as maximal runs each shorter than `k`, with no two neighbouring runs of the same letter. A new letter can only extend the last run or start a new one. If the extension reaches `k`, removing the run leaves the runs below, which already satisfied the invariant, and any letter equal to the new top will merge into it on the next step. Two runs of the same letter can never sit side by side, because a pop is the only way they could become adjacent and the next equal letter merges into the top rather than pushing.

**Complexity:** each character does O(1) work, so O(n) time; the stack and output use O(n) space.

## Tests

```python
import random

for f in (remove_duplicates_k, remove_k_brute):
    assert f("pqqqpp", 3) == ""
    assert f("abbbaac", 3) == "c"
    assert f("aabbaa", 2) == ""
    assert f("abcd", 2) == "abcd"
    assert f("aaaa", 3) == "a"
    assert f("", 3) == ""
    assert f("aa", 5) == "aa"            # k longer than any run
    assert f("abbaccaab", 2) == "b"

random.seed(1209)
for _ in range(800):
    k = random.randint(2, 4)
    s = "".join(random.choice("ab") for _ in range(random.randint(0, 14)))
    assert remove_duplicates_k(s, k) == remove_k_brute(s, k), (s, k)

assert remove_duplicates_k("a" * 99_999, 3) == ""
assert remove_duplicates_k("ab" * 50_000, 2) == "ab" * 50_000
```

## Edge cases and pitfalls

- **Use a mutable pair.** Tuples cannot be incremented in place; use a list `[ch, count]` or keep two parallel stacks.
- **Do not reset the count after a pop.** The run below keeps its own count, which is what makes `"abbbaac"` reduce fully.
- **Runs longer than k.** Five equal letters with `k = 3` leave two; the count reaches 3, pops, then restarts at 1 for the fourth letter.
- **Rebuilding the output.** `ch * count` per run and one `join` keeps the final step linear.

## Where this shows up in data engineering

Run-length encoding, which is what the stack of `[letter, count]` pairs is, is a basic compression scheme; columnar formats such as Parquet use a run-length hybrid encoding for repeated values. The removal rule resembles collapsing a burst of identical events, such as k duplicate retries, once it reaches a threshold. Keeping counts per run instead of the raw items is the general trick: summarise as you go so each update is constant time.

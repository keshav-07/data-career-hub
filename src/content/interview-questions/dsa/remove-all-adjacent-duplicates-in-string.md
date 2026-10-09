---
title: "Remove All Adjacent Duplicates In String: Cancel Pairs With a Stack"
seoTitle: "Remove Adjacent Duplicates: Stack Solution"
description: "Repeatedly delete pairs of equal neighbouring letters until none remain. Use a stack as the result string and solve it in one O(n) pass, with Python tests."
technology: ["dsa"]
topic: ["stack", "strings"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Treat a list as a stack holding the letters that survive so far. For each character, if it equals the top of the stack, pop the top because the two cancel; otherwise push it. A cancellation can expose a new equal pair, and the stack handles that automatically because the next character is compared with whatever is now on top. Join the stack at the end. This is O(n) time and O(n) space, compared with O(n^2) for repeatedly scanning and rebuilding the string."
followUps: ["How does the solution change if only runs of k equal letters are removed?", "Why does the order in which pairs are removed not change the final answer?", "Can you do it in place with a write pointer instead of a separate stack?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks"]
practice: {"platform": "LeetCode", "number": 1047, "title": "Remove All Adjacent Duplicates In String", "url": "https://leetcode.com/problems/remove-all-adjacent-duplicates-in-string/"}
---

## Problem

You are given a string of lowercase letters. While the string contains two equal letters side by side, delete that pair. Keep going until no such pair exists and return what is left (possibly the empty string). This is LeetCode 1047, Remove All Adjacent Duplicates In String.

The final result is the same whichever pair you remove first, so the answer is well defined. Strings can be long (up to around 100,000 characters), so a quadratic approach is too slow in practice.

## Examples

```text
"abbaca"   ->  "ca"     (remove "bb" -> "aaca", then "aa" -> "ca")
"xyyxz"    ->  "z"      (remove "yy" -> "xxz", then "xx" -> "z")
"abc"      ->  "abc"    (nothing to remove)
"aaaa"     ->  ""       (two pairs cancel)
"aaa"      ->  "a"      (one pair cancels, one letter stays)
```

## Approach 1: brute force

Scan for the first adjacent equal pair, cut it out, and start again. Stop when a full scan finds nothing.

```python
def remove_duplicates_brute(s):
    changed = True
    while changed:
        changed = False
        for i in range(len(s) - 1):
            if s[i] == s[i + 1]:
                s = s[:i] + s[i + 2:]
                changed = True
                break
    return s
```

**Complexity:** each removal costs O(n) to find and O(n) to rebuild the string, and there can be n/2 removals, so O(n^2) time and O(n) space.

## Approach 2: optimal (stack)

**Idea.** Build the answer from left to right and keep it on a stack. The top of the stack is the last surviving letter. When the next letter equals that top, the two would become neighbours and cancel, so pop. Otherwise the new letter survives for now, so push it. After a pop, the new top is the letter that is now adjacent to whatever comes next, which is exactly what a chain reaction like `"abba"` needs.

Walkthrough on `"abbaca"`:

| Char | Action | Stack after |
|---|---|---|
| a | push | a |
| b | push | a b |
| b | equals top, pop | a |
| a | equals top, pop | (empty) |
| c | push | c |
| a | push | c a |

```python
def remove_duplicates(s):
    stack = []
    for ch in s:
        if stack and stack[-1] == ch:
            stack.pop()
        else:
            stack.append(ch)
    return "".join(stack)
```

**Why it is correct.** The stack always holds the fully reduced form of the prefix read so far: no two neighbours in it are equal. Appending one letter can only create a new equal pair at the very end, between that letter and the top. Removing that pair leaves a reduced string again, because the letters below the top were already reduced. So the invariant holds after every step, and at the end the stack is the reduced form of the whole string.

**Complexity:** every character is pushed once and popped at most once, so O(n) time; the stack uses O(n) space.

## Tests

```python
import random

for f in (remove_duplicates, remove_duplicates_brute):
    assert f("abbaca") == "ca"
    assert f("xyyxz") == "z"
    assert f("abc") == "abc"
    assert f("aaaa") == ""
    assert f("aaa") == "a"
    assert f("") == ""
    assert f("a") == "a"
    assert f("abccba") == ""          # full chain reaction

random.seed(1047)
for _ in range(500):
    s = "".join(random.choice("abc") for _ in range(random.randint(0, 15)))
    assert remove_duplicates(s) == remove_duplicates_brute(s), s

assert remove_duplicates("ab" * 50_000) == "ab" * 50_000
assert remove_duplicates("a" * 100_000) == ""
```

## Edge cases and pitfalls

- **Odd runs.** Three equal letters leave one behind; the stack gets this right because the third letter finds an empty top or a different letter.
- **Check before peeking.** `stack[-1]` on an empty list raises `IndexError`, so test `stack` first.
- **String concatenation in a loop.** Building the result with `result = result[:-1]` copies the string each time and turns the solution quadratic. Use a list and `"".join` once.
- **Do not stop after one pass of pair removal.** Removing all pairs once (for example with a regex) misses pairs created by earlier removals, as in `"abba"`.

## Where this shows up in data engineering

Cancelling adjacent opposites is the same shape as collapsing an event log where an action is immediately undone, such as an add followed by a remove of the same item, before loading it. A stack applied while reading events in order gives the net result in one pass, which suits a streaming or per-partition transformation over time-ordered data.

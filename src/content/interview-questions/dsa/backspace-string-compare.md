---
title: "Backspace String Compare: Read Both Strings Backwards With Skip Counters"
seoTitle: "Backspace String Compare: Reverse Two Pointers"
description: "Decide whether two strings with # as backspace type the same text. A stack is simple; scanning both strings from the end with skip counters uses O(1) space."
technology: ["dsa"]
topic: ["two-pointers", "strings"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The easy answer builds each final string with a stack: push letters, pop on '#', then compare. That is O(n + m) time and space. For O(1) space, walk both strings from the end, because a '#' only affects characters before it. Each pointer keeps a skip counter: a '#' adds one, a letter with skip > 0 is consumed and decrements it, and the first letter with skip == 0 is the next real character. Compare the two real characters; if they differ, or only one string has one left, return False. The pitfall is stopping early when one string runs out while the other still has only deleted characters."
followUps: ["Why is it easier to scan from the end than from the start?", "How would you handle a 'delete word' key as well as backspace?", "What happens if there are more backspaces than characters?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers"]
practice: {"platform": "LeetCode", "number": 844, "title": "Backspace String Compare", "url": "https://leetcode.com/problems/backspace-string-compare/"}
---

## Problem

You are given two strings, `s` and `t`, made of lowercase letters and the character `#`. Each string describes keystrokes in a text editor that starts empty: a letter is typed, and `#` deletes the last typed character if there is one (backspace on an empty editor does nothing). Return `True` if both keystroke sequences leave the same text. This is LeetCode 844, Backspace String Compare.

## Examples

```text
s = "ab#c",   t = "ad#c"    ->  True    (both type "ac")
s = "x##y",   t = "#y"      ->  True    (both type "y")
s = "a#c",    t = "b"       ->  False   ("c" vs "b")
s = "###",    t = ""        ->  True    (both empty)
```

## Approach 1: build both results with a stack

Simulate the editor. A Python list works as a stack.

```python
def backspace_compare_stack(s, t):
    def build(text):
        out = []
        for ch in text:
            if ch == "#":
                if out:
                    out.pop()
            else:
                out.append(ch)
        return out
    return build(s) == build(t)
```

**Complexity:** O(n + m) time and O(n + m) space for the two built strings. This is a perfectly good answer; the follow-up is almost always "now do it in O(1) space".

## Approach 2: optimal (two pointers from the end)

**Idea in plain English:** a backspace only deletes characters to its left, so if you read from right to left you know how many deletions are pending before you meet the characters they delete. Keep a pointer and a skip counter for each string. To find the next surviving character, move left: on `#` increase skip; on a letter with skip above 0, drop it and decrease skip; on a letter with skip at 0, stop, that letter survives. Then compare the surviving characters of both strings and repeat.

Walkthrough on `s = "ab#c"`, `t = "ad#c"`:

| step | s survivor | t survivor | equal? |
|---|---|---|---|
| 1 | c (index 3) | c (index 3) | yes |
| 2 | `#` skips b, a survives | `#` skips d, a survives | yes |
| 3 | none | none | both done: True |

```python
def backspace_compare(s, t):
    def next_char(text, i):
        """Index of the next surviving character at or before i, or -1."""
        skip = 0
        while i >= 0:
            if text[i] == "#":
                skip += 1
            elif skip > 0:
                skip -= 1
            else:
                return i
            i -= 1
        return -1

    i, j = len(s) - 1, len(t) - 1
    while True:
        i, j = next_char(s, i), next_char(t, j)
        if i < 0 or j < 0:
            return i < 0 and j < 0       # both must run out together
        if s[i] != t[j]:
            return False
        i -= 1
        j -= 1
```

**Why it is correct:** the surviving characters of a string, read right to left, are exactly the letters that `next_char` returns, because a letter is deleted exactly when some `#` to its right has not already been used up by a nearer letter. The skip counter is the number of those unused backspaces at the current position, so a letter survives precisely when the counter is zero. Two final strings are equal when their surviving characters match one by one and both sequences end at the same time.

**Complexity:** O(n + m) time, since each index is visited once, and O(1) extra space.

## Tests

```python
import random

for f in (backspace_compare, backspace_compare_stack):
    assert f("ab#c", "ad#c") is True
    assert f("x##y", "#y") is True
    assert f("a#c", "b") is False
    assert f("###", "") is True              # backspaces on an empty editor
    assert f("", "") is True
    assert f("a", "a#a") is True
    assert f("ab##", "c#d#") is True         # both empty after deletes
    assert f("a##b", "b") is True
    assert f("bxj##tw", "bxo#j##tw") is True
    assert f("abc", "ab") is False           # different lengths

random.seed(844)
for _ in range(1000):
    s = "".join(random.choice("ab#") for _ in range(random.randint(0, 8)))
    t = "".join(random.choice("ab#") for _ in range(random.randint(0, 8)))
    assert backspace_compare(s, t) == backspace_compare_stack(s, t)
```

## Edge cases and pitfalls

- Do not return as soon as one pointer goes below zero. The other string may still contain only deleted characters; `next_char` must run on both first.
- A backspace on an empty editor does nothing. With the stack, check `if out` before popping; with the reverse scan, extra `#` simply leave `skip` above zero at the start.
- Do not compare raw lengths up front. `"a#b"` and `"b"` have different lengths but the same result.
- Scanning from the left cannot work in O(1) space, because you do not yet know whether a later `#` will delete the character you are looking at.

## Where this shows up in data engineering

Reading from the end to resolve deletions is how change logs are applied: a delete or tombstone record later in a log cancels earlier writes for the same key, and compaction processes the newest entries first so it can drop anything already superseded. The two-pointer comparison is also the shape of comparing two streams element by element without materialising either one.

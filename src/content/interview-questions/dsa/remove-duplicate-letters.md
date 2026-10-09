---
title: "Remove Duplicate Letters: Smallest Order with a Greedy Monotonic Stack"
seoTitle: "Remove Duplicate Letters: Greedy Monotonic Stack"
description: "Keep one copy of each letter so the result is the smallest in dictionary order. A greedy monotonic stack that knows each letter's last position solves it in O(n)."
technology: ["dsa"]
topic: ["greedy", "stack", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Record the last index of each letter. Scan left to right with a stack holding the answer so far and a set of letters in it. Skip a letter already on the stack. Otherwise, while the top of the stack is larger than the current letter and that top letter appears again later, pop it, since you can take it later in a better position. Then push the current letter. Each letter is pushed and popped at most once, so it is O(n) time and O(k) space for k distinct letters. The common bug is popping a letter that will not appear again."
followUps: ["Why is it safe to pop a larger letter only when it occurs again later?", "How does this differ from removing k digits to make the smallest number?", "What changes if you want the largest result instead?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/daily-temperatures", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "LeetCode", "number": 316, "title": "Remove Duplicate Letters", "url": "https://leetcode.com/problems/remove-duplicate-letters/"}
---

## Problem

Given a string of lowercase letters, delete characters so that every distinct letter appears exactly once, keeping the remaining characters in their original order. Among all results, return the one that comes first in dictionary order. This is LeetCode 316, Remove Duplicate Letters (LeetCode 1081 asks the same question with different wording).

## Examples

```text
"cbacdcbc"  ->  "acdb"
"bcabc"     ->  "abc"
"abacb"     ->  "abc"
"zyx"       ->  "zyx"     (no duplicates: nothing to choose)
"aaaa"      ->  "a"
```

## Approach 1: brute force

Every valid result is a subsequence that uses each distinct letter once. Try every subset of positions, keep the valid ones, and take the smallest. Only usable for very short strings, but it is an honest reference.

```python
from itertools import combinations

def remove_dups_brute(s):
    k = len(set(s))
    best = None
    for idx in combinations(range(len(s)), k):
        t = "".join(s[i] for i in idx)
        if len(set(t)) == k and (best is None or t < best):
            best = t
    return best if best is not None else ""
```

**Complexity:** O(C(n, k) · k), exponential in general.

## Approach 2: optimal (greedy monotonic stack)

Build the answer from left to right and keep it as small as possible at every step. When the next letter is smaller than the last letter you kept, you would rather have the smaller one earlier, and you can afford to drop the larger one if another copy of it appears later. Keep popping while that holds. A letter already in the answer is skipped: its earlier position is at least as good, since everything after it was chosen to be as small as possible.

```python
def remove_dups(s):
    last = {ch: i for i, ch in enumerate(s)}
    stack, in_stack = [], set()
    for i, ch in enumerate(s):
        if ch in in_stack:
            continue
        while stack and stack[-1] > ch and last[stack[-1]] > i:
            in_stack.remove(stack.pop())
        stack.append(ch)
        in_stack.add(ch)
    return "".join(stack)
```

Walkthrough on `"cbacdcbc"`:

| i | char | action | stack |
|---|---|---|---|
| 0 | c | push | c |
| 1 | b | c > b and c appears later: pop c; push b | b |
| 2 | a | b > a and b appears later: pop b; push a | a |
| 3 | c | push | a c |
| 4 | d | push | a c d |
| 5 | c | already in stack: skip | a c d |
| 6 | b | d > b but d never appears again: stop; push b | a c d b |
| 7 | c | already in stack: skip | a c d b |

**Why it is correct:** the stack always holds the smallest possible prefix that can still be completed with every remaining letter. A pop only happens when the removed letter can be picked up later, so feasibility is kept, and placing the smaller letter earlier makes the result strictly smaller in dictionary order.

**Complexity:** O(n) time (each position is pushed and popped at most once), O(k) space for the stack, set and last-index map.

## Tests

```python
import random

for f in (remove_dups, remove_dups_brute):
    assert f("cbacdcbc") == "acdb"
    assert f("bcabc") == "abc"
    assert f("abacb") == "abc"
    assert f("zyx") == "zyx"
    assert f("aaaa") == "a"
    assert f("") == ""
    assert f("bbcaac") == "bac"

random.seed(14)
for _ in range(400):
    s = "".join(random.choice("abcd") for _ in range(random.randint(0, 9)))
    assert remove_dups(s) == remove_dups_brute(s), s
print("ok")
```

## Edge cases and pitfalls

- Check `last[top] > i` before popping. Popping a letter whose last copy has already passed loses it from the answer entirely.
- Skip letters already on the stack; without the set, a later copy can pop letters and create duplicates or a worse order.
- Sorting the distinct letters (`"abcd"`) is wrong: the result must be a subsequence, so order constraints from the input still apply, as `"cbacdcbc" -> "acdb"` shows.
- Remove from the set when you pop, so the letter can be pushed again later.

## Where this shows up in data engineering

Deduplicating while keeping order is routine, for example keeping one row per key in arrival order. This problem adds a choice of which copy to keep under a global ordering goal, the kind of reasoning used when you pick which duplicate event to retain so a downstream sorted output or a canonical key is as small or as early as possible. The "pop while it can be recovered later" test is the same safety check you make before discarding a record that might be the only one left.

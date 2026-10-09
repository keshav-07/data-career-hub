---
title: "Reorganize String: Place the Most Frequent Character First, Never Twice in a Row"
seoTitle: "Reorganize String: Greedy Max-Heap Solution"
description: "Rearrange a string so no two neighbours match, or report that it is impossible. A greedy max-heap or filling even then odd slots solves it in O(n log k) or O(n)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "greedy", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A valid arrangement exists exactly when no character occurs more than (n + 1) // 2 times. To build one, keep a max-heap of counts; each step pop the most frequent character, append it, and push back the character you held from the previous step, so the same character never comes out twice in a row. That is O(n log k) for k distinct characters. A linear alternative writes the most frequent character into indices 0, 2, 4, ..., then fills the remaining even and odd slots with the rest."
followUps: ["Generalise it: rearrange so equal characters are at least d positions apart.", "Why does filling even indices first with the most frequent character always work?", "How does this relate to Task Scheduler?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/task-scheduler", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 767, "title": "Reorganize String", "url": "https://leetcode.com/problems/reorganize-string/"}
previous: "interview-questions:dsa/find-k-closest-elements"
next: "interview-questions:dsa/maximum-frequency-stack"
---

## Problem

Given a string of lowercase letters, rearrange its characters so that no two adjacent characters are equal. Return any such arrangement, or an empty string if none exists. This is LeetCode 767, Reorganize String.

## Examples

```text
"aab"     ->  "aba"
"aaab"    ->  ""          (three a's need at least two separators)
"aabbcc"  ->  e.g. "abcabc"
"z"       ->  "z"
```

## Approach 1: brute force (backtracking)

Build the string one character at a time, trying each remaining character that differs from the last one placed. Trying each distinct character once per position avoids repeating identical branches.

```python
from collections import Counter

def reorganize_brute(s):
    counts = Counter(s)
    out = []

    def place():
        if len(out) == len(s):
            return True
        for ch in sorted(counts):
            if counts[ch] and (not out or out[-1] != ch):
                counts[ch] -= 1
                out.append(ch)
                if place():
                    return True
                out.pop()
                counts[ch] += 1
        return False

    return "".join(out) if place() else ""
```

**Complexity:** exponential in the worst case; useful only as a reference for tests.

## Approach 2: optimal (greedy with a max-heap)

The most frequent character is the one most at risk of being forced next to itself, so place it as early as possible, but never right after itself. Pop the highest count, append it, and keep it aside for one step; on the next step, after popping the new top, push the held character back. If the heap runs dry while characters are still waiting, no arrangement exists.

```python
import heapq

def reorganize(s):
    heap = [(-c, ch) for ch, c in Counter(s).items()]
    heapq.heapify(heap)
    out = []
    held = None                      # (negative count, char) placed in the last step
    while heap:
        neg, ch = heapq.heappop(heap)
        out.append(ch)
        if held:
            heapq.heappush(heap, held)
        held = (neg + 1, ch) if neg + 1 < 0 else None
    return "".join(out) if len(out) == len(s) else ""
```

**Why it is correct:** the held character is the only one excluded at each step, so adjacent characters always differ. The loop only stalls when the held character is the sole one left with copies, which means it outnumbers everything else by more than one; that is precisely when its count exceeds `(n + 1) // 2` and no answer exists.

**Complexity:** O(n log k) time with k ≤ 26 distinct letters, so effectively O(n); O(k) heap space plus the output.

## Approach 3: fill even slots, then odd slots

First reject if the top count exceeds `(n + 1) // 2`. Otherwise write the most frequent character into indices 0, 2, 4, ..., then continue with the other characters in any order, moving on to index 1, 3, 5, ... when the even slots run out. Copies of one character land two apart, except across the wrap from the last even slot to index 1, and that cannot cause a clash because the first character used up the earliest even slots.

```python
def reorganize_slots(s):
    counts = Counter(s)
    n = len(s)
    if n and max(counts.values()) > (n + 1) // 2:
        return ""
    order = sorted(counts, key=lambda ch: -counts[ch])
    out = [""] * n
    i = 0
    for ch in order:
        for _ in range(counts[ch]):
            if i >= n:
                i = 1
            out[i] = ch
            i += 2
    return "".join(out)
```

**Complexity:** O(n) time (the sort is over at most 26 letters), O(n) space.

## Tests

```python
import random

def valid(original, result):
    if result == "":
        return False
    return Counter(result) == Counter(original) and all(
        a != b for a, b in zip(result, result[1:]))

def possible(s):
    return not s or max(Counter(s).values()) <= (len(s) + 1) // 2

for f in (reorganize, reorganize_slots, reorganize_brute):
    assert valid("aab", f("aab"))
    assert f("aaab") == ""
    assert valid("aabbcc", f("aabbcc"))
    assert f("z") == "z"
    assert f("") == ""
    assert f("aa") == ""
    assert valid("aaabb", f("aaabb"))        # top count exactly (n + 1) // 2

random.seed(9)
for _ in range(400):
    s = "".join(random.choice("aabbc") for _ in range(random.randint(1, 9)))
    for f in (reorganize, reorganize_slots, reorganize_brute):
        r = f(s)
        assert (r != "") == possible(s), (f.__name__, s)
        if r:
            assert valid(s, r)
print("ok")
```

## Edge cases and pitfalls

- Check feasibility with `(n + 1) // 2`, not `n // 2`: `"aba"` has n = 3 and two a's, which is fine.
- In the heap version, push the held character back after popping the next one, never before, or it can come straight back out.
- In the slot version the most frequent character must go first; starting with another character can put two copies of the frequent one side by side.
- The empty string is a valid (empty) answer, so distinguish it from failure if your interface allows; LeetCode inputs are non-empty.

## Where this shows up in data engineering

Spreading equal items apart is a scheduling problem: interleave jobs from different tenants so one tenant cannot hog consecutive slots, distribute writes so the same partition key is not hit back to back, or order test traffic so similar requests do not cluster. The heap-with-cooldown pattern here generalises directly to rate-limited schedulers with a minimum gap.

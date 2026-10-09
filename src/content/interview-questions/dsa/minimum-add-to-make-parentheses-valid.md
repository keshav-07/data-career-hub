---
title: "Minimum Add to Make Parentheses Valid: Count Unmatched Brackets in One Pass"
seoTitle: "Minimum Add to Make Parentheses Valid"
description: "Find the fewest brackets to insert so a parentheses string becomes balanced. Track open brackets and unmatched closers in one greedy pass, O(n) time and O(1) space."
technology: ["dsa"]
topic: ["greedy", "stack", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Scan left to right with two counters: open, the number of '(' still waiting for a match, and needed, the number of ')' that arrived with nothing to match. On '(' increment open; on ')' decrement open if it is positive, otherwise increment needed. The answer is open + needed: each unmatched ')' needs a '(' inserted before it and each leftover '(' needs a ')' at the end. O(n) time, O(1) space; it is the stack solution with the stack replaced by a counter."
followUps: ["How would you return one valid string with the minimum insertions?", "What if you could delete characters instead of inserting them?", "How does this change with several bracket types?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/valid-parentheses", "interview-questions:dsa/valid-parenthesis-string", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "LeetCode", "number": 921, "title": "Minimum Add to Make Parentheses Valid", "url": "https://leetcode.com/problems/minimum-add-to-make-parentheses-valid/"}
previous: "interview-questions:dsa/maximum-length-of-pair-chain"
next: "interview-questions:dsa/remove-duplicate-letters"
---

## Problem

You get a string made only of `(` and `)`. In one move you may insert a single bracket anywhere. Return the minimum number of moves needed to make the string balanced: every `(` closed by a later `)`, and no `)` without an earlier `(`. This is LeetCode 921, Minimum Add to Make Parentheses Valid.

## Examples

```text
"(()"     ->  1   (add one ')' at the end)
")))"     ->  3
")("      ->  2   (one '(' at the front, one ')' at the end)
"()()"    ->  0
""        ->  0
```

## Approach 1: stack (remove matched pairs)

Push `(`. On `)`, pop a matching `(` if there is one; otherwise push the `)` as unmatched. Whatever stays on the stack can never be matched and needs one insertion each.

```python
def min_add_stack(s):
    stack = []
    for ch in s:
        if ch == ")" and stack and stack[-1] == "(":
            stack.pop()
        else:
            stack.append(ch)
    return len(stack)
```

**Complexity:** O(n) time, O(n) space for the stack.

## Approach 2: optimal (greedy counters)

The stack above only ever holds some `)` followed by some `(`, because a `(` is always popped before a later `)` is pushed. So you only need two numbers: how many `)` were unmatched (`needed`) and how many `(` are still open (`open_`).

```python
def min_add(s):
    open_ = needed = 0
    for ch in s:
        if ch == "(":
            open_ += 1
        elif open_:
            open_ -= 1
        else:
            needed += 1
    return open_ + needed
```

**Why it is correct:** matching each `)` with the nearest unmatched `(` before it never wastes a bracket, so the number of unmatched characters is as small as possible. Each unmatched character needs at least one inserted partner, and one insertion per unmatched character is enough (put `(` at the very start for each unmatched `)`, and `)` at the end for each leftover `(`). So the minimum equals the count of unmatched characters.

**Complexity:** O(n) time, O(1) space.

## Tests

```python
import random
from collections import deque

def min_add_bfs(s):
    # Exhaustive search over insertions, for short strings only.
    def balanced(t):
        depth = 0
        for ch in t:
            depth += 1 if ch == "(" else -1
            if depth < 0:
                return False
        return depth == 0
    seen, queue = {s}, deque([(s, 0)])
    while queue:
        t, d = queue.popleft()
        if balanced(t):
            return d
        for i in range(len(t) + 1):
            for ch in "()":
                u = t[:i] + ch + t[i:]
                if u not in seen:
                    seen.add(u)
                    queue.append((u, d + 1))

for f in (min_add, min_add_stack, min_add_bfs):
    assert f("(()") == 1
    assert f(")))") == 3
    assert f(")(") == 2
    assert f("()()") == 0
    assert f("") == 0
    assert f("())(()") == 2

random.seed(13)
for _ in range(150):
    s = "".join(random.choice("()") for _ in range(random.randint(0, 6)))
    expected = min_add_bfs(s)
    assert min_add(s) == expected
    assert min_add_stack(s) == expected
print("ok")
```

## Edge cases and pitfalls

- Counting `(` minus `)` over the whole string is wrong: `")("` has a net balance of zero but needs two insertions. Order matters, so the scan must react to each `)` as it arrives.
- Do not let the open counter go negative; an unmatched `)` is recorded in `needed` and the open count stays at zero.
- The answer is the sum of both counters, not the larger of them.

## Where this shows up in data engineering

Balancing open and close events is a common data-quality check: every session start needs a session end, every `BEGIN` a `COMMIT` or `ROLLBACK`, every job "started" log line a "finished" one. A running counter over time-ordered events finds the unmatched ends and the still-open starts in one pass, which is the same logic as these two counters, often written in SQL as a running `SUM` of +1 and −1.

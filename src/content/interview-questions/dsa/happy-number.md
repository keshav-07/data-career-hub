---
title: "Happy Number: Detect a Cycle in a Digit-Square Sequence"
seoTitle: "Happy Number: Set or Floyd Cycle Detection"
description: "Decide whether repeatedly summing the squares of a number's digits reaches 1. Spot the loop with a set, then in O(1) space with fast and slow pointers."
technology: ["dsa"]
topic: ["hashing", "two-pointers"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Replacing a number by the sum of the squares of its digits defines a sequence that either reaches 1 and stays there, or falls into a loop that never contains 1. It cannot grow forever, because any number with four or more digits maps to a smaller number. So the task is cycle detection: store seen values in a set and stop on a repeat, or use Floyd's fast and slow pointers on the sequence for O(1) space. Each step costs O(log n) for the digits, and the sequence quickly drops below a few hundred, so either version is effectively O(log n)."
followUps: ["Why can the sequence never grow without bound?", "How would you find the length of the loop an unhappy number falls into?", "How does this relate to finding the start of a cycle in a linked list?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/linked-list-cycle"]
practice: {"platform": "LeetCode", "number": 202, "title": "Happy Number", "url": "https://leetcode.com/problems/happy-number/"}
---

## Problem

Take a positive integer and replace it with the sum of the squares of its decimal digits. Repeat. If the process eventually produces 1, the starting number is called happy; if it loops forever without reaching 1, it is not. Return `True` for happy numbers and `False` otherwise. This is LeetCode 202, Happy Number.

The input is a positive integer that fits in 32 bits.

## Examples

```text
7    ->  True    (7 -> 49 -> 97 -> 130 -> 10 -> 1)
1    ->  True    (already 1)
2    ->  False   (2 -> 4 -> 16 -> 37 -> 58 -> 89 -> 145 -> 42 -> 20 -> 4 -> ...)
100  ->  True    (100 -> 1)
```

## Approach 1: brute force (remember every value)

Walk the sequence and keep every value in a set. Reaching 1 means happy; seeing a value twice means you are in a loop that will repeat forever without 1.

```python
def digit_square_sum(n):
    total = 0
    while n:
        n, d = divmod(n, 10)
        total += d * d
    return total

def is_happy_set(n):
    seen = set()
    while n != 1 and n not in seen:
        seen.add(n)
        n = digit_square_sum(n)
    return n == 1
```

**Why it terminates.** A number with d digits maps to at most 81·d. For d ≥ 4 that is smaller than the number itself (for example any 4-digit number maps to at most 324), so the sequence drops until it is below 1,000 and then stays below 1,000. A sequence that lives in a finite set of values must eventually repeat.

**Complexity:** O(log n) per step for the digits, and only a small, bounded number of steps once the values are below 1,000. Space is the size of the set, which is also small and bounded.

## Approach 2: optimal (fast and slow pointers)

**Idea.** The sequence is a linked list in disguise: each value "points to" its digit-square sum. Floyd's cycle detection works on any such function. Move `slow` one step and `fast` two steps. If `fast` reaches 1, the number is happy (1 maps to itself, so it is a loop of length one). Otherwise the two pointers must meet inside the loop, and if the meeting value is not 1, the number is unhappy.

```python
def is_happy(n):
    slow = n
    fast = digit_square_sum(n)
    while fast != 1 and slow != fast:
        slow = digit_square_sum(slow)
        fast = digit_square_sum(digit_square_sum(fast))
    return fast == 1
```

**Why it is correct.** Every sequence ends in a loop: either the fixed point 1, or a loop of other values. Once both pointers are in the loop, the gap between them shrinks by one each step, so they meet within one lap. If the loop is the fixed point 1, `fast` gets there first and the condition `fast != 1` stops the walk.

**Complexity:** the same O(log n) time as Approach 1, but O(1) extra space.

## Tests

```python
assert digit_square_sum(97) == 130
assert digit_square_sum(0) == 0

known_happy = {1, 7, 10, 13, 19, 23, 28, 31, 32, 44, 49, 68, 70, 79, 82, 86, 91, 94, 97, 100}
for f in (is_happy, is_happy_set):
    for n in range(1, 101):
        assert f(n) == (n in known_happy), (f.__name__, n)
    assert f(2**31 - 1) == is_happy_set(2**31 - 1)

for n in range(1, 20_000):
    assert is_happy(n) == is_happy_set(n), n
print("ok")
```

## Edge cases and pitfalls

- **n = 1** is happy immediately; make sure the loop condition does not skip that check.
- **Starting `fast` equal to `slow`** with a `while slow != fast` loop exits before it moves. Start `fast` one step ahead, or use a do-while style loop.
- **Converting to a string** (`sum(int(c) ** 2 for c in str(n))`) is fine and readable; `divmod` avoids string allocation but neither choice changes the complexity.
- **Hard-coding the unhappy loop** (all unhappy numbers reach 4) is a valid trick, but explain it rather than presenting it as obvious.

## Where this shows up in data engineering

Any process that maps a state to the next state and must not run forever needs this check: following redirect or alias chains, resolving a chain of renamed table or column names, or iterating a transformation until it stops changing. Keeping a visited set is the usual guard; Floyd's method matters only when you cannot store the history.

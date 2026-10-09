---
title: "Remove K Digits: Smallest Number With a Greedy Monotonic Stack"
seoTitle: "Remove K Digits: Greedy Monotonic Stack"
description: "Delete k digits from a number string to make the smallest possible number. A greedy increasing stack removes each peak digit in one O(n) pass. Python tests."
technology: ["dsa"]
topic: ["stack", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 18
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The leftmost digits matter most, so whenever a digit is followed by a smaller one, deleting the larger digit makes the number smaller. Scan left to right with a stack: while you still have deletions left and the top of the stack is greater than the current digit, pop it. Push the current digit. If deletions remain at the end, the stack is non-decreasing, so drop digits from the end. Finally strip leading zeros and return '0' for an empty result. This is O(n) time and O(n) space, compared with O(k·n) for deleting one peak per pass."
followUps: ["Why is it safe to commit to removing a digit greedily?", "How would you build the largest number instead?", "How does this relate to finding the smallest subsequence of a fixed length?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks"]
practice: {"platform": "LeetCode", "number": 402, "title": "Remove K Digits", "url": "https://leetcode.com/problems/remove-k-digits/"}
---

## Problem

You are given a non-negative integer as a string of digits, `num`, with no leading zeros unless it is `"0"`, and an integer `k` with `0 ≤ k ≤ len(num)`. Remove exactly `k` digits, keeping the others in their original order, so that the remaining number is as small as possible. Return it as a string without leading zeros, and `"0"` if nothing is left. This is LeetCode 402, Remove K Digits.

The string can be up to around 100,000 digits, so you cannot try every subset of digits to delete.

## Examples

```text
num = "4273",     k = 1   ->  "273"     (delete 4, the first digit followed by a smaller one)
num = "4273",     k = 2   ->  "23"
num = "30200",    k = 1   ->  "200"     ("0200" loses its leading zero)
num = "12345",    k = 2   ->  "123"     (increasing: delete from the end)
num = "90",       k = 2   ->  "0"
```

## Approach 1: brute force (one peak per pass)

Deleting one digit optimally is easy: remove the first digit that is larger than the next one (a peak), or the last digit if the string never decreases. Repeat that `k` times.

```python
def remove_k_digits_brute(num, k):
    for _ in range(k):
        i = 0
        while i + 1 < len(num) and num[i] <= num[i + 1]:
            i += 1
        num = num[:i] + num[i + 1:]
    return num.lstrip("0") or "0"
```

**Complexity:** each pass is O(n) to scan and rebuild, so O(k·n) time, which is O(n²) when k is proportional to n. O(n) space.

## Approach 2: optimal (greedy monotonic stack)

**Idea.** The brute force keeps rescanning from the start, but after a deletion the next peak is always at or just before the position you deleted. A stack remembers exactly that. Scan the digits; the stack holds the digits kept so far. When the current digit is smaller than the top and deletions remain, the top is a peak, so pop it and check again. Then push the current digit. The kept digits stay in non-decreasing order, so any deletions still unused at the end are best spent on the last digits.

Walkthrough on `"4273"`, `k = 2`:

| Digit | Action | Stack | k left |
|---|---|---|---|
| 4 | push | 4 | 2 |
| 2 | 4 > 2, pop; push | 2 | 1 |
| 7 | push | 2 7 | 1 |
| 3 | 7 > 3, pop; push | 2 3 | 0 |

Result `"23"`.

```python
def remove_k_digits(num, k):
    stack = []
    for d in num:
        while k and stack and stack[-1] > d:
            stack.pop()
            k -= 1
        stack.append(d)
    if k:
        stack = stack[:-k]                # remaining deletions come off the end
    return "".join(stack).lstrip("0") or "0"
```

**Why it is correct.** Compare two numbers of the same length by their first differing digit. If digit `a` is immediately followed by a smaller digit `b`, any result that keeps `a` at that point is beaten by the same result with `a` removed, because `b` (or something no larger) moves into `a`'s position. So removing such a peak is always part of some optimal answer, and the stack performs exactly the removals that one-peak-per-pass would, in the same order, without rescanning. Once no peaks remain the kept digits are non-decreasing, and for such a sequence the smallest result of a given length is its prefix.

**Complexity:** each digit is pushed once and popped at most once, so O(n) time; the stack is O(n) space.

## Tests

```python
import itertools, random

def smallest_exhaustive(num, k):
    keep = len(num) - k
    best = None
    for idx in itertools.combinations(range(len(num)), keep):
        s = "".join(num[i] for i in idx).lstrip("0") or "0"
        if best is None or (len(s), s) < (len(best), best):
            best = s
    return best if best is not None else "0"

cases = [("4273", 1, "273"), ("4273", 2, "23"), ("30200", 1, "200"),
         ("12345", 2, "123"), ("90", 2, "0"), ("0", 0, "0"), ("10", 1, "0"),
         ("100200", 1, "200"), ("1111", 2, "11"), ("54321", 0, "54321")]
for num, k, want in cases:
    assert remove_k_digits(num, k) == want, (num, k)
    assert remove_k_digits_brute(num, k) == want, (num, k)

random.seed(402)
for _ in range(600):
    n = random.randint(1, 8)
    num = str(random.randint(1, 9)) + "".join(random.choice("0123456789") for _ in range(n - 1))
    k = random.randint(0, n)
    want = smallest_exhaustive(num, k)
    assert remove_k_digits(num, k) == want, (num, k)
    assert remove_k_digits_brute(num, k) == want, (num, k)

assert remove_k_digits("9" * 50_000 + "1" * 50_000, 50_000) == "1" * 50_000
```

## Edge cases and pitfalls

- **Leftover deletions.** For non-decreasing input such as `"12345"`, the loop never pops; you must cut the remaining `k` from the end.
- **`stack[:-k]` with k = 0** would return an empty list, so guard it with `if k`.
- **Leading zeros** appear after deleting the first digit (`"10"` → `"0"`, `"30200"` → `"0200"`). Strip them once at the end, and return `"0"` for an empty string.
- **Strictly greater when popping.** Popping equal digits wastes deletions: `"1111"` with k = 2 should be `"11"` either way, but `"112"` with k = 1 must become `"11"`, not `"12"`.
- **Do not convert to an integer** to compare candidates; the string can be far longer than is practical to convert repeatedly.

## Where this shows up in data engineering

The same greedy stack, which drops an earlier item as soon as a better one arrives, solves any task of the form "keep a fixed number of items, in their original order, so the resulting sequence is lexicographically smallest or largest". The broader lesson for pipeline code is the one at the end: normalise representations (leading zeros, empty results) in one place, because those are the cases that silently produce wrong joins and duplicate keys.

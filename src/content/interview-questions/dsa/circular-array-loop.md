---
title: "Circular Array Loop: Fast and Slow Pointers on Index Jumps"
seoTitle: "Circular Array Loop: Floyd on Index Jumps"
description: "Find a one-direction loop longer than one element in a circular array of jumps. Check each start in O(n^2), then use Floyd's pointers and marking for O(n)."
technology: ["dsa"]
topic: ["two-pointers", "arrays"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 25
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Treat each index as a node whose next node is (i + nums[i]) mod n, so the array is a set of linked lists that may contain cycles. From each unvisited start, run Floyd's fast and slow pointers, but refuse any step whose value has the opposite sign to the start or that jumps to itself. If the pointers meet, a valid loop exists. If the walk fails, every index on that path cannot be part of a valid loop, so mark it (set it to 0) and never revisit it. Each index is marked once, giving O(n) time and O(1) extra space; work on a copy if the input must not change."
followUps: ["Why is it safe to mark every index on a failed path as dead?", "How does Python's modulo make negative jumps easy, and what would you do in a language where it is not?", "How would you return the indices of the loop instead of True or False?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/linked-list-cycle"]
practice: {"platform": "LeetCode", "number": 457, "title": "Circular Array Loop", "url": "https://leetcode.com/problems/circular-array-loop/"}
previous: "interview-questions:dsa/linked-list-cycle-ii"
next: "interview-questions:dsa/reverse-linked-list"
---

## Problem

You get a list `nums` of non-zero integers arranged in a circle. Standing at index `i`, you move `nums[i]` positions: forward if it is positive, backward if negative, wrapping around both ends. Return `True` if there is a loop that

- you can follow forever by repeating these moves,
- contains more than one index (a jump that lands back on itself does not count), and
- uses moves that all go in the same direction (all positive or all negative).

Otherwise return `False`. This is LeetCode 457, Circular Array Loop. The follow-up asks for O(n) time and O(1) extra space.

## Examples

```text
[2, -1, 1, 2, 2]   ->  True    (0 -> 2 -> 3 -> 0, all forward)
[-1, -2, -3, -4]   ->  False   (every path ends at index 3, which jumps to itself)
[1, -1]            ->  False   (0 -> 1 -> 0, but the directions differ)
[3, 1, 2]          ->  True    (1 -> 2 -> 1)
[2, 2]             ->  False   (each index jumps back to itself)
```

## Approach 1: brute force (try every start)

For each start index, follow the jumps for at most `n` moves. Give up if a move goes the other way or lands on itself; succeed if you get back to the start. Any valid loop passes through some start, so trying them all is enough.

```python
def circular_loop_brute(nums):
    n = len(nums)
    for start in range(n):
        forward = nums[start] > 0
        i, moves = start, 0
        while moves < n:
            if (nums[i] > 0) != forward:
                break
            j = (i + nums[i]) % n          # Python's % is never negative for n > 0
            moves += 1
            if j == i:                     # a self-loop does not count
                break
            i = j
            if i == start:
                return True
    return False
```

**Complexity:** O(n) moves per start, so O(n²) time and O(1) space.

## Approach 2: optimal (Floyd's pointers plus marking)

**Idea in plain English.** Each index has exactly one next index, so the array behaves like a group of linked lists whose tails end in cycles. Finding a loop is cycle detection, and Floyd's fast and slow pointers do that in O(1) space. Two changes adapt it to the rules:

1. A move is only allowed if its value has the same sign as the start's value and it does not land on itself. A forbidden move ends the search from this start.
2. When a search fails, every index on that path (in the start's direction) leads only into the same failure, so it can never be part of a valid loop. Set those entries to 0 so later searches stop as soon as they reach one. That is what makes the total work linear.

```python
def circular_array_loop(nums):
    nums = list(nums)                      # work on a copy; marking changes the values
    n = len(nums)

    def step(i, forward):
        """Next index from i, or -1 if the move is not allowed."""
        if nums[i] == 0 or (nums[i] > 0) != forward:
            return -1
        j = (i + nums[i]) % n
        return -1 if j == i else j

    for start in range(n):
        if nums[start] == 0:
            continue
        forward = nums[start] > 0
        slow = fast = start
        while True:
            slow = step(slow, forward)
            fast = step(fast, forward)
            if fast != -1:
                fast = step(fast, forward)
            if slow == -1 or fast == -1:
                break
            if slow == fast:
                return True
        # no valid loop from start: mark its same-direction path as dead
        i = start
        while nums[i] != 0 and (nums[i] > 0) == forward:
            j = (i + nums[i]) % n
            nums[i] = 0
            i = j
    return False
```

**Why it is correct.** If `slow` and `fast` meet, they are on a cycle, and every index on it was stepped from by `fast` (it is always ahead of `slow` on the same path), so every move on the cycle passed the checks: same direction and no self-loop. A cycle of allowed moves with no self-loop has more than one index, so it is a valid loop. If no meeting happens, the path from `start` hits a forbidden move or a dead index, and so does the path from every index along it, because those paths are suffixes of the same path. Marking them is therefore safe, and a dead index can never belong to a valid loop found later.

**Complexity:** each index is zeroed at most once, and a search only walks over live indices before failing or succeeding, so O(n) time overall; O(1) extra space apart from the defensive copy. Drop the copy if the caller allows the input to be modified.

## Tests

```python
import random

cases = [([2, -1, 1, 2, 2], True), ([-1, -2, -3, -4], False), ([1, -1], False),
         ([3, 1, 2], True), ([2, 2], False), ([1, 1, 1], True), ([-1, -1], True),
         ([1], False), ([-1], False), ([-2, 1, -1, -2, -2], False), ([5, -3, 2, 7], False)]
for nums, expected in cases:
    original = list(nums)
    assert circular_array_loop(nums) == expected, nums
    assert circular_loop_brute(nums) == expected, nums
    assert nums == original                     # the input is not modified

random.seed(457)
for _ in range(5000):
    n = random.randint(1, 8)
    nums = [random.choice([-1, 1]) * random.randint(1, 9) for _ in range(n)]
    assert circular_array_loop(nums) == circular_loop_brute(nums), nums

assert circular_array_loop([1] * 5000) is True
assert circular_array_loop([5000] * 5000) is False     # every index jumps to itself
```

## Edge cases and pitfalls

- **Self-loops.** A jump that is a multiple of `n` lands on the same index; `[2, 2]` has no valid loop even though every index repeats forever.
- **Mixed directions.** `[1, -1]` cycles between two indices but changes direction, so it does not count. Check the sign on every move, not just at the start.
- **Negative modulo.** Python's `%` returns a value in `0..n-1` for negative jumps. In Java or C, use `((i + nums[i]) % n + n) % n`.
- **Marking only in the start's direction.** Stop marking when the sign changes; an index of the other direction may still be part of a valid loop of its own.
- **Modifying the input.** Marking with 0 is what gives O(1) space. Say so explicitly, and copy first if the caller needs the list back.

## Where this shows up in data engineering

An array where each slot points to another slot is a compact way to store "next" links, such as successor tables, pointer-based free lists or a mapping of each record to its replacement. Before following such links in a job you want to know they cannot loop forever. Marking dead entries so that each is explored once is the same idea as memoising results in a graph traversal: it turns repeated walks into a single linear pass.

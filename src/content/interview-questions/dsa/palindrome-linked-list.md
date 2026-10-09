---
title: "Palindrome Linked List: Find the Middle, Reverse the Back Half, Compare"
seoTitle: "Palindrome Linked List: O(1) Space Solution"
description: "Check whether a singly linked list reads the same both ways. Copy to an array, then in O(1) space by finding the middle and reversing the second half."
technology: ["dsa"]
topic: ["linked-lists", "two-pointers"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The simple answer copies the values into a Python list and compares it with its reverse: O(n) time and O(n) space. For O(1) space, use fast and slow pointers to find the middle, reverse the second half in place, then walk one pointer from the head and one from the reversed half, comparing values until the reversed half runs out. Reverse the second half back afterwards so the caller's list is unchanged. The whole thing is O(n) time and O(1) extra space."
followUps: ["Why should you restore the list after checking it?", "How would you solve it recursively, and what does that cost in stack space?", "Does the odd middle node need to be compared with anything?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/reverse-linked-list", "interview-questions:dsa/middle-of-the-linked-list"]
practice: {"platform": "LeetCode", "number": 234, "title": "Palindrome Linked List", "url": "https://leetcode.com/problems/palindrome-linked-list/"}
previous: "interview-questions:dsa/middle-of-the-linked-list"
next: "interview-questions:dsa/reorder-list"
---

## Problem

Given the head of a singly linked list of integers, return `True` if the sequence of values is the same read forwards and backwards, and `False` otherwise. This is LeetCode 234, Palindrome Linked List. The follow-up asks for O(n) time and O(1) extra space.

A singly linked list cannot be walked backwards, which is what makes this harder than checking a string.

## Examples

```text
4 -> 9 -> 9 -> 4        ->  True
4 -> 9 -> 2 -> 9 -> 4   ->  True    (odd length, the middle 2 is ignored)
4 -> 9 -> 3             ->  False
8                       ->  True
```

## Approach 1: brute force (copy to an array)

Read the values into a list and compare it with its reverse.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def is_palindrome_list(head):
    values = []
    while head:
        values.append(head.val)
        head = head.next
    return values == values[::-1]
```

**Complexity:** O(n) time and O(n) space. In an interview this is the right first answer, then you offer the O(1) space version.

## Approach 2: optimal (middle, reverse, compare)

**Idea.** A palindrome's second half, read backwards, equals its first half. You cannot read backwards, but you can reverse the second half in place. Three steps:

1. Find the end of the first half with fast and slow pointers (the first middle, so the odd middle node stays in the first half).
2. Reverse the list that starts after that node.
3. Compare the first half with the reversed second half, node by node. The reversed half is never longer, so stop when it runs out.

Then reverse the second half again and reattach it, so the input is left as it was.

```python
def reverse(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next
    return prev

def is_palindrome(head):
    if head is None or head.next is None:
        return True
    # 1. first_end is the last node of the first half
    first_end = fast = head
    while fast.next and fast.next.next:
        first_end = first_end.next
        fast = fast.next.next
    # 2. reverse the second half
    second = reverse(first_end.next)
    # 3. compare
    result = True
    p, q = head, second
    while q:
        if p.val != q.val:
            result = False
            break
        p, q = p.next, q.next
    # restore the original list
    first_end.next = reverse(second)
    return result
```

**Why it is correct.** For n nodes, the first half holds `ceil(n/2)` nodes and the second half `floor(n/2)`. Reversing the second half lines up node i from the end with node i from the start, which is exactly the pair a palindrome check needs. When n is odd, the extra middle node is the last node of the first half and is never compared, which is right because it matches itself.

**Complexity:** finding the middle, reversing twice and comparing are each O(n), so O(n) time; only a few pointers, so O(1) extra space.

## Tests

```python
import random

def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

cases = [
    ([4, 9, 9, 4], True),
    ([4, 9, 2, 9, 4], True),
    ([4, 9, 3], False),
    ([8], True),
    ([], True),
    ([1, 2], False),
    ([5, 5], True),
    ([1, 2, 1, 2], False),
    ([1, 1, 2, 1], False),
]
for values, expected in cases:
    for f in (is_palindrome, is_palindrome_list):
        head = build(values)
        assert f(head) == expected, (f.__name__, values)
        assert to_list(head) == values          # list is unchanged

random.seed(234)
for _ in range(500):
    half = [random.randint(0, 2) for _ in range(random.randint(0, 6))]
    values = half + ([random.randint(0, 2)] if random.random() < 0.5 else []) + half[::-1]
    if random.random() < 0.5 and values:
        values[random.randrange(len(values))] = random.randint(0, 2)
    head = build(values)
    assert is_palindrome(head) == (values == values[::-1]), values
    assert to_list(head) == values
```

## Edge cases and pitfalls

- **Empty and single-node lists** are palindromes; return early before the pointer logic.
- **Not restoring the list.** Leaving the second half reversed is a side effect callers do not expect. Many interviewers ask about it directly.
- **Compare values, not nodes.** Here you want `p.val != q.val`; the nodes are always distinct objects.
- **Breaking out early** without restoring is a common bug. Store the result, then restore, then return, as above.
- **Recursion** can compare from both ends by walking to the tail recursively, but it uses O(n) call stack and hits Python's recursion limit on long lists.

## Where this shows up in data engineering

The palindrome itself is rare in pipeline work, but its building blocks are not: split a sequence at its midpoint, process one half in reverse, and compare record by record. The bigger lesson is the restore step. Functions that mutate shared input to save memory must put it back, or a later stage reads corrupted data.

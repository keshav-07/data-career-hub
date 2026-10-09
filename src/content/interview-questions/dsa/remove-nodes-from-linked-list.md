---
title: "Remove Nodes From Linked List: Keep Nodes With Nothing Larger to Their Right"
seoTitle: "Remove Nodes From Linked List: Monotonic Stack"
description: "Delete every linked list node that has a strictly larger value somewhere after it. Solve it with a monotonic stack, then in O(1) space by reversing the list."
technology: ["dsa"]
topic: ["linked-lists", "stack"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A node survives only if no later node is strictly larger, so the survivors form a non-increasing sequence ending at the last node. Walk the list with a stack of surviving nodes: before pushing a node, pop every node on top whose value is smaller, because this node is larger and comes after them. Then relink the stack from bottom to top. That is O(n) time and O(n) space. For O(1) space, reverse the list, keep a node only if it is at least the running maximum, and reverse back. Equal values are kept, since they are not strictly larger."
followUps: ["Why does the reverse-and-scan approach need a running maximum rather than a stack?", "How would you solve it recursively, and what is the risk in Python?", "How does this relate to finding the next greater element?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks", "articles:dsa/linked-lists", "interview-questions:dsa/reverse-linked-list"]
practice: {"platform": "LeetCode", "number": 2487, "title": "Remove Nodes From Linked List", "url": "https://leetcode.com/problems/remove-nodes-from-linked-list/"}
previous: "interview-questions:dsa/next-greater-element-ii"
next: "interview-questions:dsa/remove-k-digits"
---

## Problem

Given the head of a singly linked list of positive integers, remove every node for which some node further along the list has a strictly greater value. Return the head of the modified list. This is LeetCode 2487, Remove Nodes From Linked List.

The list can hold up to around 100,000 nodes, so checking every later node for each node is too slow.

## Examples

```text
4 -> 1 -> 7 -> 2 -> 5 -> 3      ->  7 -> 5 -> 3
6 -> 6 -> 6                     ->  6 -> 6 -> 6      (equal is not greater)
1 -> 2 -> 3                     ->  3
9                               ->  9
```

## Approach 1: brute force

For each node, scan the rest of the list for a larger value; keep the node only if there is none.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def remove_nodes_brute(head):
    dummy = ListNode(0)
    tail = dummy
    node = head
    while node:
        later = node.next
        while later and later.val <= node.val:
            later = later.next
        if later is None:              # nothing larger after this node
            tail.next = node
            tail = node
        node = node.next
    tail.next = None
    return dummy.next
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (monotonic stack)

**Idea.** Read the nodes left to right and keep a stack of the nodes that survive so far. When a new node arrives, every node on top of the stack with a smaller value now has something larger after it, so it is removed: pop it. Then push the new node. The stack's values are non-increasing from bottom to top. At the end, the stack holds exactly the survivors in their original order, so link them up.

Walkthrough on `4 -> 1 -> 7 -> 2 -> 5 -> 3`:

| Node | Popped | Stack after |
|---|---|---|
| 4 | | 4 |
| 1 | | 4 1 |
| 7 | 1, 4 | 7 |
| 2 | | 7 2 |
| 5 | 2 | 7 5 |
| 3 | | 7 5 3 |

```python
def remove_nodes(head):
    stack = []
    node = head
    while node:
        while stack and stack[-1].val < node.val:
            stack.pop()
        stack.append(node)
        node = node.next
    for a, b in zip(stack, stack[1:]):
        a.next = b
    if stack:
        stack[-1].next = None
    return stack[0] if stack else None
```

**Why it is correct.** A node is popped exactly when a strictly larger node arrives after it, which is the removal rule. A node that is never popped had no larger node after it, because any such node would have popped it (everything above it on the stack is smaller or equal, so a larger arrival keeps popping down to it). Relative order is preserved because the stack only ever appends.

**Complexity:** each node is pushed and popped at most once, so O(n) time; O(n) space for the stack.

## Approach 3: O(1) space (reverse, filter, reverse)

Reading the list from the end turns the rule into "keep a node if it is at least as large as every node seen so far", which needs only a running maximum. Reverse the list, filter, and reverse the result.

```python
def reverse(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next
    return prev

def remove_nodes_reverse(head):
    head = reverse(head)
    node = head
    while node and node.next:
        if node.next.val < node.val:   # node holds the running maximum of the suffix
            node.next = node.next.next
        else:
            node = node.next
    return reverse(head)
```

`node` always points at the last kept node, whose value is the maximum so far, so comparing with it is the same as comparing with the running maximum. This is O(n) time and O(1) space.

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

def expected(values):
    return [v for i, v in enumerate(values) if all(w <= v for w in values[i + 1:])]

cases = [[4, 1, 7, 2, 5, 3], [6, 6, 6], [1, 2, 3], [9], [], [5, 4, 3], [3, 5, 5, 2, 5]]
for values in cases:
    for f in (remove_nodes, remove_nodes_brute, remove_nodes_reverse):
        assert to_list(f(build(values))) == expected(values), (f.__name__, values)

assert to_list(remove_nodes(build([4, 1, 7, 2, 5, 3]))) == [7, 5, 3]

random.seed(2487)
for _ in range(800):
    values = [random.randint(1, 5) for _ in range(random.randint(0, 10))]
    for f in (remove_nodes, remove_nodes_brute, remove_nodes_reverse):
        assert to_list(f(build(values))) == expected(values), (f.__name__, values)

long_values = list(range(1, 100_001))
assert to_list(remove_nodes(build(long_values))) == [100_000]
assert to_list(remove_nodes_reverse(build(long_values))) == [100_000]
```

## Edge cases and pitfalls

- **Strictly greater.** Pop with `<`, not `<=`, so runs of equal values all survive.
- **Terminate the new list.** Set the last survivor's `next` to `None`; it may still point at a removed node.
- **Recursion.** "Fix the rest of the list, then keep this node if it is at least the new head" is elegant, but it recurses once per node and exceeds Python's default recursion limit of about 1,000 frames on long lists.
- **The last node always survives**, so the result is never empty for a non-empty input.

## Where this shows up in data engineering

Keeping only the records that are not dominated by a later one is a "running maximum from the end" filter: for example, keeping only the price points that were never beaten afterwards, or the high-water marks in a metric series. Processing in reverse with a single running value is often the simplest way to express it, both in Python and as a window function over a reversed ordering in SQL.

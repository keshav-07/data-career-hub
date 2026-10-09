---
title: "Middle of the Linked List: Find It in One Pass With Fast and Slow Pointers"
seoTitle: "Middle of the Linked List: Fast and Slow Pointers"
description: "Return the middle node of a singly linked list, the second middle for even lengths. Count-then-walk, then one pass with fast and slow pointers. Python tests."
technology: ["dsa"]
topic: ["linked-lists", "two-pointers"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Start two pointers at the head. Move slow one node and fast two nodes per step, and stop when fast is None or fast.next is None. Slow is then at the middle, and for an even length it lands on the second of the two middle nodes. This is O(n) time and O(1) space in a single pass. The pitfall is the loop condition: changing it to stop when fast.next.next is None gives the first middle instead, so pick the condition that matches the required convention."
followUps: ["How would you return the first middle node for an even-length list?", "How is finding the middle used in merge sort on a linked list or in checking a palindrome list?", "How would you find the node one third of the way along?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists"]
practice: {"platform": "LeetCode", "number": 876, "title": "Middle of the Linked List", "url": "https://leetcode.com/problems/middle-of-the-linked-list/"}
previous: "interview-questions:dsa/happy-number"
next: "interview-questions:dsa/palindrome-linked-list"
---

## Problem

Given the head of a non-empty singly linked list, return the node in the middle. When the list has an even number of nodes there are two middle nodes; return the second one. This is LeetCode 876, Middle of the Linked List.

You return the node itself (so the caller can read the rest of the list from it), not just its value.

## Examples

```text
3 -> 5 -> 8 -> 1 -> 9          ->  node 8        (position 3 of 5)
3 -> 5 -> 8 -> 1               ->  node 8        (second of the middles 5 and 8)
42                             ->  node 42
6 -> 2                         ->  node 2
```

## Approach 1: brute force (count, then walk)

Count the nodes, then walk `count // 2` steps from the head. For 5 nodes that is 2 steps (the third node); for 4 nodes it is 2 steps (the third node, which is the second middle).

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def middle_node_count(head):
    count = 0
    node = head
    while node:
        count += 1
        node = node.next
    node = head
    for _ in range(count // 2):
        node = node.next
    return node
```

**Complexity:** O(n) time over two passes, O(1) space. Copying the nodes into a Python list and returning `nodes[len(nodes) // 2]` is also O(n) time but uses O(n) space.

## Approach 2: optimal (fast and slow pointers)

**Idea.** If one runner moves twice as fast as another, the slow runner is halfway when the fast one finishes. Move `slow` one node and `fast` two nodes per step. When `fast` can no longer take two steps, `slow` is at the middle.

Walkthrough on `3 -> 5 -> 8 -> 1`:

| Step | `slow` | `fast` |
|---|---|---|
| 0 | 3 | 3 |
| 1 | 5 | 8 |
| 2 | 8 | None (stop) |

```python
def middle_node(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow
```

**Why it is correct.** After k steps, `slow` is at index k and `fast` is at index 2k. The loop continues while nodes at indices 2k and 2k+1 both exist. For odd n it stops when 2k = n - 1, so k = (n - 1)/2; for even n it stops when 2k = n, so k = n/2. Both equal `n // 2`, the same node Approach 1 picks.

**Complexity:** O(n) time in one pass, O(1) space.

### Variant: first middle

If a caller needs the first of the two middles (common when splitting a list for merge sort), stop one step earlier:

```python
def first_middle_node(head):
    slow = fast = head
    while fast.next and fast.next.next:
        slow = slow.next
        fast = fast.next.next
    return slow
```

## Tests

```python
def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def nodes_of(head):
    out = []
    while head:
        out.append(head)
        head = head.next
    return out

for n in range(1, 30):
    head = build(list(range(n)))
    nodes = nodes_of(head)
    assert middle_node(head) is nodes[n // 2]
    assert middle_node_count(head) is nodes[n // 2]
    assert first_middle_node(head) is nodes[(n - 1) // 2]

assert middle_node(build([3, 5, 8, 1, 9])).val == 8
assert middle_node(build([3, 5, 8, 1])).val == 8
assert middle_node(build([42])).val == 42
assert middle_node(build([6, 2])).val == 2
head = build([7, 7, 7, 7])
assert middle_node(head) is head.next.next   # duplicates: identity, not value
```

## Edge cases and pitfalls

- **Even length convention.** `while fast and fast.next` gives the second middle; `while fast.next and fast.next.next` gives the first. Know which one the question wants.
- **Order of the checks.** Test `fast` before `fast.next`, or an even-length list raises `AttributeError` at the end.
- **Return the node, not the value**, when the caller needs the tail from the middle onwards.
- **Empty list.** The stated problem guarantees at least one node; the main version returns `None` for an empty list anyway, but the first-middle variant would fail, so guard it if empty input is possible.

## Where this shows up in data engineering

Finding a midpoint in one pass is the step that lets merge sort work on linked structures, and the same "two cursors at different speeds" trick is used to sample or split a stream whose length you do not know in advance. In everyday pipeline code you usually know the size, but the pattern is worth recognising for streaming iterators that can only be read once.

---
title: "Linked List Cycle II: Find Where the Cycle Starts With Floyd's Algorithm"
seoTitle: "Linked List Cycle II: Find the Cycle Start"
description: "Return the node where a linked list's cycle begins, or None. Use a visited set, then Floyd's meeting point and a second walk from the head in O(1) space."
technology: ["dsa"]
topic: ["linked-lists", "two-pointers"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Run Floyd's fast and slow pointers until they meet; if fast reaches None there is no cycle. Then move one pointer back to the head and advance both one step at a time: they meet at the first node of the cycle. The reason is that if the head is a steps from the cycle start and the meeting point is b steps into a cycle of length c, then 2(a + b) = a + b + m·c, so a = m·c - b, and walking a steps from the meeting point lands on the start. This is O(n) time and O(1) space, against O(n) space for a visited set."
followUps: ["How do you compute the length of the cycle once the pointers meet?", "Why must the comparison be by node identity rather than by value?", "How does Find the Duplicate Number reduce to this problem?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/linked-list-cycle", "interview-questions:dsa/find-the-duplicate-number"]
practice: {"platform": "LeetCode", "number": 142, "title": "Linked List Cycle II", "url": "https://leetcode.com/problems/linked-list-cycle-ii/"}
---

## Problem

Given the head of a singly linked list, return the node at which a cycle begins: the first node you reach that you will reach again by following `next`. If the list ends in `None`, return `None`. Do not modify the list, and aim for O(1) extra memory. This is LeetCode 142, Linked List Cycle II, the follow-up to Linked List Cycle.

## Examples

```text
3 -> 6 -> 9 -> 12 -> 15, with 15 pointing back to 9    ->  node 9
3 -> 6, with 6 pointing back to 3                     ->  node 3
5, pointing to itself                                 ->  node 5
3 -> 6 -> 9 ending in None                            ->  None
```

## Approach 1: brute force (visited set)

Walk the list and remember each node. The first node you see a second time is where the cycle starts, because it is the first node that is entered from two directions.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def detect_cycle_set(head):
    seen = set()
    node = head
    while node:
        if node in seen:
            return node
        seen.add(node)
        node = node.next
    return None
```

**Complexity:** O(n) time and O(n) space.

## Approach 2: optimal (Floyd's tortoise and hare)

**Idea in plain English.** First, detect the cycle: `slow` moves one step, `fast` moves two. If there is a cycle they must meet inside it. Second, find the entrance: put one pointer back at the head and leave the other at the meeting point, then move both one step at a time. The distance from the head to the entrance equals the distance from the meeting point forward to the entrance (plus whole laps), so they arrive together.

```python
def detect_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            finder = head
            while finder is not slow:
                finder = finder.next
                slow = slow.next
            return finder
    return None
```

**Why it is correct.** Let `a` be the number of steps from the head to the cycle start, `c` the cycle length, and `b` the number of steps from the cycle start to the meeting point. When they meet, `slow` has taken `a + b` steps and `fast` has taken twice as many. `fast` has also covered the same path plus some whole number of laps `m ≥ 1`:

```text
2(a + b) = a + b + m·c      so      a = m·c - b = (m - 1)·c + (c - b)
```

`c - b` is the distance from the meeting point forward to the cycle start. So after `a` steps, a pointer starting at the meeting point has gone `c - b` steps to the start plus `m - 1` full laps, and is at the start, exactly where the pointer from the head arrives after its `a` steps. They cannot meet earlier, because before `a` steps the head pointer is not yet in the cycle.

`slow` meets `fast` within its first lap of the cycle, because once both are inside, the gap closes by one node per step and is less than `c`. So `slow` takes at most `a + c` steps.

**Complexity:** O(n) time, since both phases take at most `a + c ≤ n` steps; O(1) space.

### Cycle length

Once the pointers meet, hold one still and walk the other round until it returns; the number of steps is `c`. This is a common follow-up.

```python
def cycle_length(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            steps, node = 1, slow.next
            while node is not slow:
                node, steps = node.next, steps + 1
            return steps
    return 0
```

## Tests

```python
def build(values, pos=-1):
    nodes = [ListNode(v) for v in values]
    for x, y in zip(nodes, nodes[1:]):
        x.next = y
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return (nodes[0] if nodes else None), nodes

for n in range(0, 12):
    for pos in range(-1, n):
        head, nodes = build([7] * n, pos)              # equal values: identity matters
        want = nodes[pos] if pos >= 0 else None
        assert detect_cycle(head) is want, (n, pos)
        assert detect_cycle_set(head) is want, (n, pos)
        assert cycle_length(head) == (n - pos if pos >= 0 else 0), (n, pos)

head, nodes = build([3, 6, 9, 12, 15], 2)
assert detect_cycle(head).val == 9
values_before = [node.val for node in nodes]
detect_cycle(head)
assert [node.val for node in nodes] == values_before and nodes[-1].next is nodes[2]   # unmodified

head, nodes = build(list(range(10_000)), 9_999)        # self-loop at the end
assert detect_cycle(head) is nodes[9_999]
```

## Edge cases and pitfalls

- **Single node pointing to itself**: the pointers meet at that node and the second phase returns it immediately.
- **Cycle starting at the head**: `a = 0`, so the meeting point is already the start when `m = 1`. The `while finder is not slow` loop handles it with zero steps.
- **Comparing values.** Use `is`; lists with repeated values give wrong answers if you compare `.val`.
- **Restarting both pointers.** Only one pointer goes back to the head, and both then move one step at a time; moving the other one two steps breaks the distance argument.
- **Marking nodes** by changing values or `next` pointers would find the start too, but it modifies the input, which the problem forbids.

## Where this shows up in data engineering

Finding where a loop begins is what you need to report a circular dependency usefully: not just "there is a cycle" but "the chain from this table re-enters at that one". In data systems this usually involves graphs with many outgoing edges, handled with depth-first search, but chains with a single successor (alias to alias, redirect to redirect, a parent pointer in a hierarchy) are exactly this linked-list case.

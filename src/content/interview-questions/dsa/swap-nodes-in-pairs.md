---
title: "Swap Nodes in Pairs: Rewire Every Two Nodes With a Dummy Head"
seoTitle: "Swap Nodes in Pairs: Iterative and Recursive"
description: "Swap every two adjacent nodes of a linked list by changing links, not values. Learn the iterative dummy-node method and the short recursive version, with tests."
technology: ["dsa"]
topic: ["linked-lists"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Use a dummy node before the head and a pointer prev to the node before the current pair. While two nodes first and second follow prev, rewire three links: prev.next = second, first.next = second.next, second.next = first. Then move prev to first, which is now the second node of the swapped pair. A trailing single node stays where it is. This is O(n) time and O(1) space. The recursive version swaps the first pair and attaches the swapped rest, which is shorter but uses O(n) call stack."
followUps: ["How would you generalise this to reversing every group of k nodes?", "Why is swapping values not an acceptable answer?", "In what order must the three links be updated to avoid losing part of the list?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/reverse-nodes-in-k-group", "interview-questions:dsa/reverse-linked-list-ii"]
practice: {"platform": "LeetCode", "number": 24, "title": "Swap Nodes in Pairs", "url": "https://leetcode.com/problems/swap-nodes-in-pairs/"}
---

## Problem

Given the head of a singly linked list, swap each pair of neighbouring nodes (the first with the second, the third with the fourth, and so on) and return the new head. If the length is odd, the last node stays in place. You must move the nodes themselves; changing the values stored in them is not allowed. This is LeetCode 24, Swap Nodes in Pairs.

## Examples

```text
1 -> 2 -> 3 -> 4         ->  2 -> 1 -> 4 -> 3
1 -> 2 -> 3              ->  2 -> 1 -> 3
5                        ->  5
(empty)                  ->  (empty)
```

## Approach 1: brute force (collect nodes, relink)

Put the nodes in a Python list, swap neighbouring entries in the list, then relink the nodes in their new order. It moves nodes rather than values, but uses O(n) extra space.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def swap_pairs_list(head):
    nodes = []
    while head:
        nodes.append(head)
        head = head.next
    for i in range(0, len(nodes) - 1, 2):
        nodes[i], nodes[i + 1] = nodes[i + 1], nodes[i]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if nodes:
        nodes[-1].next = None
    return nodes[0] if nodes else None
```

**Complexity:** O(n) time and O(n) space.

## Approach 2: optimal (iterative, dummy node)

**Idea in plain English.** Work pair by pair with a pointer `prev` to the node just before the pair. Call the pair `first` and `second`. After the swap, `prev` must point to `second`, `second` must point to `first`, and `first` must point to whatever followed the pair. Do those three updates, then step `prev` forward to `first`, which now sits just before the next pair. The dummy node gives the first pair a `prev` too.

Walkthrough on `1 -> 2 -> 3 -> 4`:

| Step | `prev` | Pair | List after |
|---|---|---|---|
| 1 | dummy | 1, 2 | 2 -> 1 -> 3 -> 4 |
| 2 | 1 | 3, 4 | 2 -> 1 -> 4 -> 3 |
| 3 | 3 | none left | stop |

```python
def swap_pairs(head):
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next and prev.next.next:
        first = prev.next
        second = first.next
        first.next = second.next      # first now points past the pair
        second.next = first           # second points back to first
        prev.next = second            # the node before the pair points to second
        prev = first                  # first is now the last node of the swapped pair
    return dummy.next
```

**Why it is correct.** Before each iteration, everything up to `prev` is already swapped and `prev.next` is the first unprocessed node. The three updates reorder exactly `first` and `second` while keeping the remainder attached through `first.next`. Setting `prev = first` restores the same invariant one pair later. The loop stops when fewer than two nodes remain, which leaves an odd last node untouched.

**Complexity:** each node is visited once, so O(n) time; O(1) extra space.

## Approach 3: recursive

Swap the first two nodes and let recursion swap the rest.

```python
def swap_pairs_recursive(head):
    if head is None or head.next is None:
        return head
    second = head.next
    head.next = swap_pairs_recursive(second.next)
    second.next = head
    return second
```

This is O(n) time but O(n) call-stack depth (n/2 frames), so long lists hit Python's default recursion limit of about 1,000 frames. Mention it as an alternative, and prefer the iterative version.

## Tests

```python
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
    out = list(values)
    for i in range(0, len(out) - 1, 2):
        out[i], out[i + 1] = out[i + 1], out[i]
    return out

for f in (swap_pairs, swap_pairs_list, swap_pairs_recursive):
    assert to_list(f(build([1, 2, 3, 4]))) == [2, 1, 4, 3]
    assert to_list(f(build([1, 2, 3]))) == [2, 1, 3]
    assert to_list(f(build([5]))) == [5]
    assert f(None) is None
    for n in range(0, 12):
        assert to_list(f(build(list(range(n))))) == expected(list(range(n))), (f.__name__, n)

# nodes move, values stay attached to their nodes
head = build([1, 2])
a, b = head, head.next
new_head = swap_pairs(head)
assert new_head is b and new_head.next is a and a.next is None

assert to_list(swap_pairs(build(list(range(100_000))))) == expected(list(range(100_000)))
```

## Edge cases and pitfalls

- **Empty list and single node.** The loop condition handles both; no pairs, nothing changes.
- **Odd length.** The last node has no partner and must stay at the end, still linked.
- **Update order.** Set `first.next = second.next` before `second.next = first`, or you lose the rest of the list.
- **Moving `prev`.** After the swap, the node before the next pair is `first`, not `second`. Moving to `second` makes the next iteration swap `first` with the following node, which is the wrong pair.
- **Swapping values** is explicitly disallowed; say why: nodes may carry other data and outside references.

## Where this shows up in data engineering

Pairwise swaps are rare in pipelines, but this problem trains the pattern behind every in-place relinking task: hold a reference to the node before the change, update links in an order that never strands the rest of the chain, and restore your loop invariant. The k-group version of the same idea underlies reversing or batching fixed-size chunks of a linked sequence, and the stack-depth warning about the recursive version applies to any recursive processing of long chains of records in Python.

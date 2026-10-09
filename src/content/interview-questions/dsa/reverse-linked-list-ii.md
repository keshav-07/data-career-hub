---
title: "Reverse Linked List II: Reverse a Sublist in One Pass With a Dummy Node"
seoTitle: "Reverse Linked List II: In-place Sublist Reversal"
description: "Reverse only positions left to right of a singly linked list. Copy values first, then rewire the sublist in place in one pass using a dummy head node."
technology: ["dsa"]
topic: ["linked-lists"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Put a dummy node before the head so reversing from position 1 needs no special case. Walk to the node just before position left (call it prev). The node after it, curr, will end up as the tail of the reversed section. Then repeat right - left times: take the node after curr, unlink it, and insert it directly after prev. Each move puts one more node at the front of the section. Return dummy.next. This is one pass, O(n) time and O(1) space. The usual bugs are losing the rest of the list and mishandling left = 1."
followUps: ["How would you reverse every group of k nodes?", "Why does the dummy node remove the special case for left = 1?", "How would you do this recursively, and what does it cost?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/reverse-linked-list", "interview-questions:dsa/reverse-nodes-in-k-group"]
practice: {"platform": "LeetCode", "number": 92, "title": "Reverse Linked List II", "url": "https://leetcode.com/problems/reverse-linked-list-ii/"}
previous: "interview-questions:dsa/reverse-linked-list"
next: "interview-questions:dsa/swap-nodes-in-pairs"
---

## Problem

Given the head of a singly linked list and two positions `left ≤ right` (counted from 1), reverse the nodes from position `left` to position `right` inclusive and return the head of the resulting list. Nodes outside that range keep their order. This is LeetCode 92, Reverse Linked List II. The follow-up asks for a single pass.

Positions are always valid: `1 ≤ left ≤ right ≤ length`.

## Examples

```text
1 -> 2 -> 3 -> 4 -> 5,  left = 2, right = 4   ->  1 -> 4 -> 3 -> 2 -> 5
1 -> 2 -> 3,            left = 1, right = 3   ->  3 -> 2 -> 1
1 -> 2 -> 3,            left = 2, right = 2   ->  1 -> 2 -> 3      (nothing to do)
7,                      left = 1, right = 1   ->  7
```

## Approach 1: brute force (copy the values)

Read the values into a Python list, reverse the slice, and write the values back into the nodes.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverse_between_values(head, left, right):
    nodes = []
    node = head
    while node:
        nodes.append(node)
        node = node.next
    vals = [n.val for n in nodes]
    vals[left - 1:right] = vals[left - 1:right][::-1]
    for n, v in zip(nodes, vals):
        n.val = v
    return head
```

**Complexity:** O(n) time and O(n) space. It also swaps values rather than nodes, which interviewers usually rule out, because real nodes often carry more than one field and other code may hold references to them.

## Approach 2: optimal (in-place, one pass)

**Idea in plain English.** Stop at the node just before the section, `prev`. The first node of the section, `curr`, will finish as the section's last node, so it never moves relative to `prev` except by being pushed back. Now repeatedly pull out the node right after `curr` and put it at the front of the section (right after `prev`). After `right - left` moves, the section is reversed and still attached at both ends. A dummy node in front of the head means `prev` always exists, even when `left = 1`.

Walkthrough on `1 -> 2 -> 3 -> 4 -> 5`, `left = 2`, `right = 4` (`prev` = 1, `curr` = 2):

| Move | Node moved to the front | List |
|---|---|---|
| start | | 1 -> 2 -> 3 -> 4 -> 5 |
| 1 | 3 | 1 -> 3 -> 2 -> 4 -> 5 |
| 2 | 4 | 1 -> 4 -> 3 -> 2 -> 5 |

```python
def reverse_between(head, left, right):
    dummy = ListNode(0, head)
    prev = dummy
    for _ in range(left - 1):
        prev = prev.next
    curr = prev.next
    for _ in range(right - left):
        move = curr.next              # node to bring to the front of the section
        curr.next = move.next         # unlink it
        move.next = prev.next         # point it at the current front
        prev.next = move              # make it the new front
    return dummy.next
```

**Why it is correct.** Before each move, the nodes between `prev` and `curr` (inclusive) are the first few nodes of the original section in reverse order, `curr` is last, and `curr.next` is the rest of the list. Each move takes the next original node and places it first, which extends the reversed part by one while keeping `curr` last and the remainder attached. After `right - left` moves the whole section has been processed.

**Complexity:** at most `right` steps to reach and process the section, so O(n) time in one pass; O(1) extra space.

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

assert to_list(reverse_between(build([1, 2, 3, 4, 5]), 2, 4)) == [1, 4, 3, 2, 5]
assert to_list(reverse_between(build([1, 2, 3]), 1, 3)) == [3, 2, 1]
assert to_list(reverse_between(build([1, 2, 3]), 2, 2)) == [1, 2, 3]
assert to_list(reverse_between(build([7]), 1, 1)) == [7]
assert to_list(reverse_between(build([1, 2]), 1, 2)) == [2, 1]

for n in range(1, 9):
    values = list(range(n))
    for left in range(1, n + 1):
        for right in range(left, n + 1):
            want = values[:left - 1] + values[left - 1:right][::-1] + values[right:]
            assert to_list(reverse_between(build(values), left, right)) == want
            assert to_list(reverse_between_values(build(values), left, right)) == want

# nodes are rewired, not relabelled
head = build([1, 2, 3, 4])
original = [head, head.next, head.next.next, head.next.next.next]
new_head = reverse_between(head, 1, 4)
assert new_head is original[3] and new_head.next.next.next is original[0]

big = list(range(100_000))
assert to_list(reverse_between(build(big), 2, 99_999)) == [0] + big[1:99_999][::-1] + [99_999]
```

## Edge cases and pitfalls

- **left = 1.** Without a dummy node you must update `head` separately; the dummy removes that branch.
- **left = right.** The loop runs zero times and the list is returned unchanged.
- **Losing the tail.** Reversing the section with the usual three-pointer method and forgetting to reconnect its last node to the node after `right` cuts the list. The insertion method above never disconnects it.
- **Off-by-one positions.** Positions start at 1, so `prev` is reached in `left - 1` steps from the dummy.
- **Swapping values** passes simple tests but is not a node reversal; mention why you avoid it.

## Where this shows up in data engineering

Splicing a run of records out of an ordered chain and putting it back in a different order is how linked structures such as free lists and LRU caches are maintained, and the same discipline applies when you reorder a segment of a sequence in place: anchor the node before the segment, keep the rest of the chain attached, and update one link at a time. In everyday pipelines you would reorder a slice of an array instead, but the pointer bookkeeping is what interviews test.

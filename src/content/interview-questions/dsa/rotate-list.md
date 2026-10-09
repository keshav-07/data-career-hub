---
title: "Rotate List: Close the Ring, Then Cut It at the New Tail"
seoTitle: "Rotate List: Ring and Cut in O(n)"
description: "Rotate a linked list right by k places, where k can exceed the length. Reduce k modulo the length, join the tail to the head, and cut at the new tail."
technology: ["dsa"]
topic: ["linked-lists"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Walk the list once to find its length n and its tail. Reduce k to k mod n; if that is 0 the list is unchanged. Otherwise link the tail to the head to form a ring, walk n - k - 1 steps from the head to reach the new tail, make the node after it the new head, and set the new tail's next to None. This is O(n) time and O(1) space. The key pitfall is k being much larger than n: rotating one step at a time costs O(k·n) and times out, so always take the modulo first."
followUps: ["How would you rotate left by k instead of right?", "How would you rotate an array in place with O(1) extra space?", "Can you find the new tail with two pointers k apart instead of computing the length?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/linked-lists", "interview-questions:dsa/remove-nth-node-from-end-of-list"]
practice: {"platform": "LeetCode", "number": 61, "title": "Rotate List", "url": "https://leetcode.com/problems/rotate-list/"}
---

## Problem

Given the head of a singly linked list and a non-negative integer `k`, rotate the list to the right by `k` places: the last `k` nodes move, in order, to the front. Return the new head. `k` may be far larger than the list length (up to around two billion), and the list may be empty. This is LeetCode 61, Rotate List.

## Examples

```text
10 -> 20 -> 30 -> 40 -> 50,  k = 2    ->  40 -> 50 -> 10 -> 20 -> 30
10 -> 20 -> 30,              k = 4    ->  30 -> 10 -> 20     (4 mod 3 = 1)
10 -> 20 -> 30,              k = 3    ->  10 -> 20 -> 30     (a full turn)
(empty),                     k = 5    ->  (empty)
```

## Approach 1: brute force (one step at a time)

Rotating right by one step means moving the last node to the front. Do that `k mod n` times. Without the modulo this is hopeless for large `k`.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def rotate_right_steps(head, k):
    if head is None or head.next is None:
        return head
    n = 0
    node = head
    while node:
        n += 1
        node = node.next
    for _ in range(k % n):
        prev, last = None, head
        while last.next:              # find the last node and the one before it
            prev, last = last, last.next
        prev.next = None
        last.next = head
        head = last
    return head
```

**Complexity:** O(n) per single-step rotation, so O(n · (k mod n)), which is O(n²) in the worst case; O(1) space.

## Approach 2: optimal (ring and cut)

**Idea in plain English.** A rotation does not reorder anything around the ring; it only changes where the list starts. So join the tail to the head to make a ring, then cut it in the right place. After rotating right by `k`, the new head is the node `k` from the end, which is position `n - k` from the start (counting from 0), and the new tail is just before it, at position `n - k - 1`.

Walkthrough on `10 -> 20 -> 30 -> 40 -> 50`, `k = 2`:

1. Length 5, tail is 50, `k mod 5 = 2`.
2. Link 50 back to 10, forming a ring.
3. Walk `5 - 2 - 1 = 2` steps from 10: 10 → 20 → 30. Node 30 is the new tail.
4. New head is 40; set `30.next = None`. Result: `40 -> 50 -> 10 -> 20 -> 30`.

```python
def rotate_right(head, k):
    if head is None or head.next is None:
        return head
    n, tail = 1, head
    while tail.next:
        tail = tail.next
        n += 1
    k %= n
    if k == 0:
        return head
    tail.next = head                  # close the ring
    new_tail = head
    for _ in range(n - k - 1):
        new_tail = new_tail.next
    new_head = new_tail.next
    new_tail.next = None              # cut the ring
    return new_head
```

**Why it is correct.** Right rotation by `k` maps the node at position `i` to position `(i + k) mod n`, so the node at position `n - k` moves to position 0. In the ring, following `next` from that node visits the nodes in exactly the rotated order, and cutting the link into it (from position `n - k - 1`) turns the ring back into a list that starts there.

**Complexity:** one pass to measure, at most one more partial pass to find the cut, so O(n) time; O(1) extra space. The running time does not depend on `k`.

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

def expected(values, k):
    if not values:
        return []
    k %= len(values)
    return values[-k:] + values[:-k] if k else list(values)

for f in (rotate_right, rotate_right_steps):
    assert to_list(f(build([10, 20, 30, 40, 50]), 2)) == [40, 50, 10, 20, 30]
    assert to_list(f(build([10, 20, 30]), 4)) == [30, 10, 20]
    assert to_list(f(build([10, 20, 30]), 3)) == [10, 20, 30]
    assert f(None, 5) is None
    assert to_list(f(build([7]), 1000)) == [7]
    assert to_list(f(build([1, 2]), 2_000_000_001)) == [2, 1]     # huge k, odd
    for n in range(0, 7):
        for k in range(0, 15):
            assert to_list(f(build(list(range(n))), k)) == expected(list(range(n)), k), (n, k)

random.seed(61)
for _ in range(200):
    values = [random.randint(0, 9) for _ in range(random.randint(0, 50))]
    k = random.randint(0, 10**9)
    assert to_list(rotate_right(build(values), k)) == expected(values, k)

big = list(range(100_000))
assert to_list(rotate_right(build(big), 2 * 10**9 + 7)) == expected(big, 2 * 10**9 + 7)
```

## Edge cases and pitfalls

- **Large k.** Always reduce `k` modulo the length; a loop of `k` single rotations will not finish for `k` near two billion.
- **k a multiple of n.** After the modulo, `k = 0`; return the head unchanged and do not close the ring, or you return a cyclic list.
- **Empty list or one node.** Return early; the modulo by zero would otherwise raise `ZeroDivisionError`.
- **Off-by-one on the cut.** The new tail is `n - k - 1` steps from the head, so the new head is `n - k` steps away. Draw a five-node example to check.
- **Forgetting to cut.** Leaving `new_tail.next` pointing at the new head returns a ring that never ends.

## Where this shows up in data engineering

Rotation is how round-robin assignment works: the same ordered list of workers, partitions or shards, but starting from a different position each time. Taking the offset modulo the list length, rather than stepping one position at a time, is the habit that keeps such schedulers correct when counters grow large, and the same arithmetic underlies circular buffers used for fixed-size event windows.

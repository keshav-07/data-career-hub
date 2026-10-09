---
title: "Min Cost to Connect Ropes: Always Join the Two Shortest"
seoTitle: "Min Cost to Connect Ropes with a Min-Heap"
description: "Join ropes two at a time, paying the sum of their lengths each time, for the lowest total cost. A min-heap always joins the two shortest in O(n log n)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Put all lengths in a min-heap. Repeatedly pop the two shortest ropes, add their sum to the total, and push the joined rope back, until one rope remains. Short ropes get counted in many joins, so they should be joined first; this is the same greedy argument as Huffman coding. Time is O(n log n), space O(n). Pitfalls: re-sorting the list after each join (O(n² log n)) and forgetting that one rope or none costs zero."
followUps: ["Why is joining the two shortest ropes optimal? Sketch the exchange argument.", "If the lengths arrive already sorted, can you do it in O(n) without a heap?", "How does this relate to Huffman coding?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/last-stone-weight", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "GeeksforGeeks", "title": "Min Cost to Connect Ropes", "url": "https://www.geeksforgeeks.org/problems/minimum-cost-of-ropes-1587115620/1"}
---

## Problem

You have ropes of given positive lengths. You may join any two ropes into one; doing so costs the sum of their two lengths, and the new rope's length is that sum. Keep joining until one rope remains. Return the smallest possible total cost. This is GeeksforGeeks: Min Cost to Connect Ropes (also known as LeetCode 1167, which is subscription-only).

## Examples

```text
[4, 3, 2, 6]   ->  29   (2+3=5, 4+5=9, 6+9=15; 5 + 9 + 15)
[1, 1, 1, 1]   ->  8    (1+1, 1+1, 2+2)
[7]            ->  0    (nothing to join)
[5, 5]         ->  10
```

## Approach 1: brute force (try every order)

Recursively try every pair to join next and keep the cheapest total. This is only useful to check the greedy on small inputs.

```python
from functools import lru_cache

def min_cost_brute(ropes):
    @lru_cache(maxsize=None)
    def solve(state):
        if len(state) <= 1:
            return 0
        best = None
        items = list(state)
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                joined = items[i] + items[j]
                rest = items[:i] + items[i + 1:j] + items[j + 1:] + [joined]
                cost = joined + solve(tuple(sorted(rest)))
                if best is None or cost < best:
                    best = cost
        return best

    return solve(tuple(sorted(ropes)))
```

**Complexity:** exponential; memoising on the sorted multiset helps but does not change that.

## Approach 2: optimal (greedy with a min-heap)

Every rope's length is paid once for each join it takes part in, directly or as part of a bigger rope. So the total is the sum of each original length times its depth in the "join tree". To keep the total low, the shortest ropes should be the deepest, which means joining the two shortest ropes first, then repeating on the new set. A min-heap gives the two shortest in O(log n) each time.

```python
import heapq

def min_cost(ropes):
    heap = list(ropes)
    heapq.heapify(heap)
    total = 0
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        total += a + b
        heapq.heappush(heap, a + b)
    return total
```

**Why it is correct:** take any optimal join tree and a pair of sibling ropes at its deepest level. Swapping the two shortest ropes into those two positions moves shorter lengths deeper and longer lengths shallower, which cannot increase the total, so some optimal tree joins the two shortest ropes first. Treating that joined rope as one new rope leaves a smaller problem of the same kind, and induction finishes the proof. It is the exchange argument behind Huffman coding.

**Complexity:** O(n log n) time (n − 1 joins, each a few heap operations), O(n) space.

## Tests

```python
import random

for f in (min_cost, min_cost_brute):
    assert f([4, 3, 2, 6]) == 29
    assert f([1, 1, 1, 1]) == 8
    assert f([7]) == 0
    assert f([]) == 0
    assert f([5, 5]) == 10
    assert f([1, 2, 3, 4, 5]) == 33

random.seed(2)
for _ in range(200):
    rs = [random.randint(1, 20) for _ in range(random.randint(0, 6))]
    assert min_cost(rs) == min_cost_brute(rs)

ropes = [3, 1, 2]
min_cost(ropes)
assert ropes == [3, 1, 2]   # input not mutated
print("ok")
```

## Edge cases and pitfalls

- Copy the list before `heapify` if the caller still needs it; `heapify` rearranges in place.
- Joining in the given order, or always adding the next rope to one growing rope, is not optimal: `[4, 3, 2, 6]` in order costs 7 + 9 + 15 = 31, against 29 for the greedy.
- Totals can exceed 32-bit integers in languages with fixed-width ints; Python is safe, but say so in a Java or C++ answer.
- Zero or one rope costs nothing.

## Where this shows up in data engineering

This is the cost model of merging sorted runs or small files: merging two files costs roughly the bytes read and written, and merged output is merged again later. Compaction planners therefore merge the smallest files first, which is the same greedy. It is also why a k-way merge of many runs at once beats a chain of pairwise merges, a point worth raising when the interviewer asks about external sorting.

---
title: "IPO: Maximise Capital by Picking the Best Affordable Project Each Round"
seoTitle: "IPO: Greedy with Two Heaps"
description: "Choose up to k projects to maximise final capital, where each needs a minimum capital to start. Sort by cost and use a max-heap of affordable profits, O(n log n)."
technology: ["dsa"]
topic: ["heaps-priority-queues", "greedy"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Profits are never negative and capital only grows, so in each round the best move is the most profitable project you can currently afford. Sort projects by required capital. In each of up to k rounds, move every project whose requirement is at most your capital into a max-heap of profits, then pop the largest profit and add it. Stop early if the heap is empty. Sorting is O(n log n) and the heap work is O((n + k) log n). Scanning every project each round instead costs O(n·k)."
followUps: ["Why is the greedy choice safe here? What would break it?", "How would you also return which projects were chosen?", "What changes if a project could lose money?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/task-scheduler", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 502, "title": "IPO", "url": "https://leetcode.com/problems/ipo/"}
previous: "interview-questions:dsa/sliding-window-median"
next: "interview-questions:dsa/design-twitter"
---

## Problem

You start with capital `w` and may complete at most `k` distinct projects, one after another. Project `i` can only be started when your current capital is at least `capital[i]`; finishing it adds its non-negative `profits[i]` to your capital (the requirement is not spent). Return the largest capital you can end with. This is LeetCode 502, IPO.

## Examples

```text
k = 2, w = 0, profits = [1, 2, 3], capital = [0, 1, 1]   ->  4   (take 1, then 3)
k = 3, w = 0, profits = [1, 2, 3], capital = [0, 1, 2]   ->  6
k = 1, w = 0, profits = [5],       capital = [1]         ->  0   (cannot afford anything)
k = 5, w = 2, profits = [1, 1],    capital = [0, 0]      ->  4   (only two projects exist)
```

## Approach 1: brute force (greedy with a full scan)

The greedy idea is the same as the optimal one, but each round scans every unused project for the best affordable profit.

```python
def ipo_scan(k, w, profits, capital):
    used = [False] * len(profits)
    for _ in range(k):
        best = -1
        for i in range(len(profits)):
            if not used[i] and capital[i] <= w and (best == -1 or profits[i] > profits[best]):
                best = i
        if best == -1:
            break
        used[best] = True
        w += profits[best]
    return w
```

**Complexity:** O(n · k) time, O(n) space.

## Approach 2: optimal (sorted costs plus a max-heap of profits)

Two things only move forward: your capital, and the set of projects you can afford. So sort projects by required capital and keep a pointer into that list. Each round, advance the pointer past every project you can now afford, pushing its profit into a max-heap. The heap top is the best affordable project; take it. Projects never leave the affordable set, so nothing is pushed twice.

```python
import heapq

def ipo(k, w, profits, capital):
    projects = sorted(zip(capital, profits))
    available = []          # negated profits: a max-heap
    i = 0
    for _ in range(k):
        while i < len(projects) and projects[i][0] <= w:
            heapq.heappush(available, -projects[i][1])
            i += 1
        if not available:
            break
        w -= heapq.heappop(available)
    return w
```

**Why it is correct:** suppose some optimal plan picks a project other than the most profitable affordable one, P, in the first round. If the plan uses P later, swap the two: P first gives at least as much capital at every intermediate step, so every later project stays affordable. If the plan never uses P, replace its first project with P: capital afterwards is at least as high, so the rest of the plan still works. Repeating the argument round by round shows the greedy is optimal. It relies on profits being non-negative and requirements not being spent.

**Complexity:** O(n log n) to sort, O(n log n) for pushes and O(k log n) for pops; O(n) space.

## Tests

```python
import random
from itertools import permutations

def ipo_brute(k, w, profits, capital):
    best = w
    n = len(profits)
    for r in range(1, min(k, n) + 1):
        for order in permutations(range(n), r):
            cur = w
            for i in order:
                if capital[i] > cur:
                    break
                cur += profits[i]
            else:
                best = max(best, cur)
    return best

for f in (ipo, ipo_scan, ipo_brute):
    assert f(2, 0, [1, 2, 3], [0, 1, 1]) == 4
    assert f(3, 0, [1, 2, 3], [0, 1, 2]) == 6
    assert f(1, 0, [5], [1]) == 0
    assert f(5, 2, [1, 1], [0, 0]) == 4
    assert f(0, 7, [3], [0]) == 7              # no rounds
    assert f(2, 1, [0, 0, 9], [0, 0, 1]) == 10  # zero-profit projects

random.seed(20)
for _ in range(300):
    n = random.randint(0, 5)
    profits = [random.randint(0, 6) for _ in range(n)]
    capital = [random.randint(0, 8) for _ in range(n)]
    k, w = random.randint(0, 5), random.randint(0, 4)
    expected = ipo_brute(k, w, profits, capital)
    assert ipo(k, w, profits, capital) == expected
    assert ipo_scan(k, w, profits, capital) == expected
print("ok")
```

## Edge cases and pitfalls

- Stop when the heap is empty; continuing would pop from an empty heap or loop uselessly.
- Do not subtract the capital requirement. It is a threshold, not a cost.
- Sort the pairs together (`zip`), not the two lists separately, or profits detach from their requirements.
- If k exceeds the number of projects, the loop simply runs out of projects and stops.

## Where this shows up in data engineering

The shape is "unlock options as resources grow, then pick the best unlocked one": prioritising backlog work where each finished task frees budget or capacity for bigger ones, or a scheduler that admits jobs once enough memory is free and then runs the highest-value one first. The two-structure pattern, a sorted list of thresholds plus a heap of unlocked candidates, is the reusable part.

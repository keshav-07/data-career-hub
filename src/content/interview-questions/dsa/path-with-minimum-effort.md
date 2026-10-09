---
title: "Path With Minimum Effort: Minimise the Largest Step on a Grid"
seoTitle: "Path With Minimum Effort: Dijkstra and DSU"
description: "Find a grid path whose biggest height jump is as small as possible. Run Dijkstra with max instead of plus, or union cells in edge order until the corners join."
technology: ["dsa"]
topic: ["graphs", "union-find", "shortest-path"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 20
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The cost of a path is its largest absolute height difference between neighbouring cells, and you want the path with the smallest such cost. Two clean solutions: Dijkstra where a path's cost is max(cost so far, next step) instead of a sum, popping the cheapest cell from a heap until the target comes out; or union-find, sorting all adjacent-cell edges by weight and joining them in order until the top-left and bottom-right cells are connected, the last weight added being the answer. Both are O(R * C * log(R * C))."
followUps: ["Why is Dijkstra still correct when you combine costs with max instead of addition?", "How would binary search on the answer work, and what is its complexity?", "How does this relate to a minimum spanning tree?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 1631, "title": "Path With Minimum Effort", "url": "https://leetcode.com/problems/path-with-minimum-effort/"}
---

## Problem

You get a grid of heights. Starting at the top-left cell, you want to reach the bottom-right cell, moving up, down,
left or right. The effort of a route is the largest absolute difference in height between two consecutive cells on
it. Return the minimum effort over all routes.

This is LeetCode 1631, Path With Minimum Effort. It is a "bottleneck path" problem, a close relative of
[Swim in Rising Water](/interview/dsa/swim-in-rising-water/). Assume up to 100 by 100 cells and heights up to
1,000,000.

## Examples

```text
1 4 2
6 9 3      ->  3    (route 1 -> 4 -> 2 -> 3 -> 4: steps 3, 2, 1, 1)
5 8 4

2 3 9
8 4 9      ->  1    (route 2 -> 3 -> 4 -> 5 -> 6 winds through the middle)
9 5 6

7          ->  0    (start is the target)
```

## Approach 1: brute force (try every simple path)

Explore every route that does not revisit a cell, tracking the largest step so far, and keep the best effort found at
the target. Pruning branches whose effort already matches the best answer helps a little, but the search remains
exponential.

```python
def min_effort_brute(heights):
    rows, cols = len(heights), len(heights[0])
    best = float("inf")
    seen = {(0, 0)}

    def dfs(r, c, effort):
        nonlocal best
        if effort >= best:
            return
        if (r, c) == (rows - 1, cols - 1):
            best = effort
            return
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen:
                seen.add((nr, nc))
                dfs(nr, nc, max(effort, abs(heights[nr][nc] - heights[r][c])))
                seen.remove((nr, nc))

    dfs(0, 0, 0)
    return best
```

**Complexity:** exponential in the number of cells. Only for tiny grids and for testing.

## Approach 2: optimal (Dijkstra with max)

Dijkstra's algorithm works for any path cost that never decreases as the path grows. "Largest step so far" is such a
cost: extending a route can keep it the same or raise it, never lower it. So run Dijkstra with
`max(effort, step)` in place of `distance + weight`. The first time the target leaves the heap, its effort is final.

```python
import heapq

def min_effort(heights):
    rows, cols = len(heights), len(heights[0])
    best = [[float("inf")] * cols for _ in range(rows)]
    best[0][0] = 0
    heap = [(0, 0, 0)]
    while heap:
        effort, r, c = heapq.heappop(heap)
        if (r, c) == (rows - 1, cols - 1):
            return effort
        if effort > best[r][c]:
            continue                                   # stale heap entry
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols:
                cand = max(effort, abs(heights[nr][nc] - heights[r][c]))
                if cand < best[nr][nc]:
                    best[nr][nc] = cand
                    heapq.heappush(heap, (cand, nr, nc))
    return 0
```

**Why it is correct:** cells come off the heap in non-decreasing order of effort. When a cell is popped, any other
route to it would have to leave the set of finished cells through an edge that already costs at least the popped
effort, so it cannot do better.

**Complexity:** O(E log V) with V = R * C cells and E about 2V edges, so O(R * C * log(R * C)) time and O(R * C)
space.

## Approach 3: union-find (Kruskal order)

Sort every edge between adjacent cells by its height difference. Add edges from cheapest to most expensive, joining
their cells with union-find. The moment the start and target fall into the same set, a route exists that uses only
edges up to the current weight, and no cheaper set of edges connected them, so that weight is the answer.

```python
def min_effort_dsu(heights):
    rows, cols = len(heights), len(heights[0])
    if rows * cols == 1:
        return 0
    edges = []
    for r in range(rows):
        for c in range(cols):
            if r + 1 < rows:
                edges.append((abs(heights[r][c] - heights[r + 1][c]), r * cols + c, (r + 1) * cols + c))
            if c + 1 < cols:
                edges.append((abs(heights[r][c] - heights[r][c + 1]), r * cols + c, r * cols + c + 1))
    edges.sort()
    parent = list(range(rows * cols))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    target = rows * cols - 1
    for weight, a, b in edges:
        parent[find(a)] = find(b)
        if find(0) == find(target):
            return weight
    return 0
```

**Complexity:** O(E log E) for the sort plus near-constant union-find operations, so O(R * C * log(R * C)) time and
O(R * C) space. This is the bottleneck property of minimum spanning trees: the best bottleneck path between two
vertices runs along the minimum spanning tree.

## Tests

```python
import random

for f in (min_effort, min_effort_dsu, min_effort_brute):
    assert f([[1, 4, 2], [6, 9, 3], [5, 8, 4]]) == 3
    assert f([[2, 3, 9], [8, 4, 9], [9, 5, 6]]) == 1
    assert f([[7]]) == 0                                   # single cell
    assert f([[1, 10, 6, 7, 9, 10, 4, 9]]) == 9            # one row: no choice of route
    assert f([[4, 4], [4, 4]]) == 0                        # flat
    assert f([[1, 1000000], [1000000, 1]]) == 999999       # every route must climb

random.seed(10)
for _ in range(300):
    rows, cols = random.randint(1, 4), random.randint(1, 4)
    g = [[random.randint(1, 9) for _ in range(cols)] for _ in range(rows)]
    expected = min_effort_brute(g)
    assert min_effort(g) == expected == min_effort_dsu(g)

big = [[(r * 7 + c * 13) % 50 for c in range(100)] for r in range(100)]
assert min_effort(big) == min_effort_dsu(big)
```

## Edge cases and pitfalls

- A single cell needs no moves, so the effort is 0. The union-find version must return before looping over an empty
  edge list.
- BFS without a heap does not work: the first route to reach a cell is the shortest in steps, not the one with the
  smallest largest step.
- Skip stale heap entries, otherwise cells are relaxed many times and the run slows down badly.
- Routes may go up, left or backwards; restricting moves to right and down gives wrong answers on winding grids.

## Where this shows up in data engineering

Bottleneck paths answer "what is the best worst link?": the highest-bandwidth route between two data centres, or the
chain of transformations whose slowest step is as fast as possible. The union-find view also explains threshold
clustering, used in entity resolution: link records whose distance is below a threshold, and two records end up in
the same cluster exactly when some chain of links between them never exceeds it.

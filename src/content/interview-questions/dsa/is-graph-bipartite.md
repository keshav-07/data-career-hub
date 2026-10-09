---
title: "Is Graph Bipartite?: Two-Colour Every Component"
seoTitle: "Is Graph Bipartite?: Two-Colouring"
description: "Decide whether a graph's vertices split into two sides with every edge crossing. Two-colour each component with BFS, or check neighbours with union-find."
technology: ["dsa"]
topic: ["graphs", "union-find"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A graph is bipartite exactly when you can colour its vertices with two colours so that every edge joins different colours, which is the same as having no odd cycle. For each uncoloured vertex, start a BFS: give it colour 0, give each uncoloured neighbour the opposite colour, and fail if a neighbour already has the same colour. Loop over every vertex so disconnected components are checked. O(V + E) time, O(V) space. With union-find, union all neighbours of a vertex together and fail if a vertex ends up in the same set as one of its neighbours."
followUps: ["Why does an odd cycle make two-colouring impossible?", "How would you return the two groups, or an odd cycle as proof of failure?", "How would you support edges arriving one at a time?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 785, "title": "Is Graph Bipartite?", "url": "https://leetcode.com/problems/is-graph-bipartite/"}
---

## Problem

You get an undirected graph as an adjacency list: `graph[u]` lists the neighbours of vertex `u`. There are no
self-loops or repeated edges, and the graph may be disconnected. Decide whether the vertices can be split into two
groups so that every edge has one end in each group.

This is LeetCode 785, Is Graph Bipartite?. Assume up to 100 vertices; the methods below are linear, so the limit is
generous.

## Examples

```text
graph = [[1, 5], [0, 2], [1, 3], [2, 4], [3, 5], [4, 0]]   ->  True    (6-cycle: {0, 2, 4} and {1, 3, 5})
graph = [[1, 2], [0, 2], [0, 1]]                           ->  False   (triangle: odd cycle)
graph = [[1], [0], [3], [2], []]                           ->  True    (two edges and an isolated vertex)
```

## Approach 1: brute force (try every colouring)

Assign each vertex side 0 or 1 in every possible way and check whether any assignment makes every edge cross.

```python
from itertools import product

def is_bipartite_brute(graph):
    n = len(graph)
    for sides in product((0, 1), repeat=n):
        if all(sides[u] != sides[v] for u in range(n) for v in graph[u]):
            return True
    return False
```

**Complexity:** O(2^V * (V + E)) time. Only usable for tiny graphs, but it is an exact reference for testing.

## Approach 2: optimal (BFS two-colouring)

Colour greedily. In one component, the colour of the first vertex decides everything else: its neighbours must take
the other colour, their neighbours the first colour again, and so on. So pick any uncoloured vertex, colour it 0,
spread with BFS, and look for a conflict, an edge whose two ends got the same colour. Repeat from every vertex that
is still uncoloured to cover all components.

```python
from collections import deque

def is_bipartite(graph):
    n = len(graph)
    color = [-1] * n
    for start in range(n):
        if color[start] != -1:
            continue
        color[start] = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nxt in graph[node]:
                if color[nxt] == -1:
                    color[nxt] = 1 - color[node]
                    queue.append(nxt)
                elif color[nxt] == color[node]:
                    return False
    return True
```

**Why it is correct:** within a component, BFS forces each vertex's colour by the parity of its distance from the
start, so if any valid colouring exists this one is it (up to swapping the colours). A conflict means two vertices
at the same parity are adjacent, which closes an odd cycle, and an odd cycle cannot be two-coloured.

**Complexity:** O(V + E) time and O(V) space.

## Approach 3: union-find

In a bipartite graph, all neighbours of a vertex sit on the same side, the side opposite the vertex. So for each
vertex, union all of its neighbours into one set, then check that the vertex itself is not in that set.

```python
def is_bipartite_dsu(graph):
    n = len(graph)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for u in range(n):
        for v in graph[u]:
            if find(u) == find(v):
                return False
            parent[find(v)] = find(graph[u][0])
    return True
```

The check runs before each union, and any vertex already merged with a neighbour reveals an odd cycle.

**Complexity:** O((V + E) * α(V)) time, O(V) space. This form is handy when edges arrive incrementally.

## Tests

```python
import random

for f in (is_bipartite, is_bipartite_brute, is_bipartite_dsu):
    assert f([[1, 5], [0, 2], [1, 3], [2, 4], [3, 5], [4, 0]]) is True
    assert f([[1, 2], [0, 2], [0, 1]]) is False         # triangle
    assert f([[1], [0], [3], [2], []]) is True          # disconnected, isolated vertex
    assert f([[]]) is True                              # single vertex
    assert f([[], [2, 3, 4], [1], [1], [1]]) is True    # star
    five = [[1, 4], [0, 2], [1, 3], [2, 4], [3, 0]]
    assert f(five) is False                             # odd cycle of length 5
    two_parts = [[1], [0], [3, 4], [2, 4], [2, 3]]
    assert f(two_parts) is False                        # odd cycle only in the second component

random.seed(6)
for _ in range(400):
    n = random.randint(1, 8)
    adj = [set() for _ in range(n)]
    for u in range(n):
        for v in range(u + 1, n):
            if random.random() < 0.3:
                adj[u].add(v)
                adj[v].add(u)
    g = [sorted(s) for s in adj]
    expected = is_bipartite_brute(g)
    assert is_bipartite(g) == expected
    assert is_bipartite_dsu(g) == expected
```

## Edge cases and pitfalls

- The graph may be disconnected. Starting one BFS from vertex 0 misses conflicts in other components.
- An isolated vertex is fine on either side; it cannot cause a conflict.
- In the union-find version, merge the neighbours with each other, never with the vertex itself.
- Check a coloured neighbour for a conflict even when you did not colour it in this step; that edge is exactly where
  odd cycles are caught.

## Where this shows up in data engineering

Two-sided data is common: users and items, customers and products, authors and papers. Checking that a relationship
graph is bipartite is a quick integrity test that no edge links two entities of the same kind, for example after
merging two sources that use overlapping id ranges. Bipartite structure is also what recommendation and matching
jobs rely on when they project user-item graphs into user-user similarity.

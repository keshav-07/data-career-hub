---
title: "Find if Path Exists in Graph: Reachability with BFS or Union-Find"
seoTitle: "Find if Path Exists in Graph: BFS and DSU"
description: "Decide whether two vertices of an undirected graph are connected. Build an adjacency list and run BFS, or merge edges with union-find, both in near-linear time."
technology: ["dsa"]
topic: ["graphs", "union-find"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 10
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Build an adjacency list from the edges, then run BFS (or iterative DFS) from the source, marking vertices as visited when you enqueue them. Return true as soon as you reach the destination, false when the queue empties. That is O(V + E) time and space. An alternative is union-find: union the endpoints of every edge and check whether source and destination share a root. The pitfall is forgetting that source can equal destination, which is trivially true even with no edges."
followUps: ["How would you answer many reachability queries on the same graph efficiently?", "What changes if the graph is directed?", "How would you return the actual path, not just true or false?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 1971, "title": "Find if Path Exists in Graph", "url": "https://leetcode.com/problems/find-if-path-exists-in-graph/"}
---

## Problem

You are given `n` vertices labelled `0` to `n - 1` and a list of undirected edges, each a pair `[u, v]`. Given a
`source` and a `destination` vertex, decide whether you can walk from one to the other along edges. There are no
duplicate edges and no self-loops.

This is LeetCode 1971, Find if Path Exists in Graph. Assume up to about 200,000 vertices and edges, so the
solution must be close to linear.

## Examples

```text
n = 4, edges = [[0, 1], [1, 2]], source = 0, destination = 2   ->  True   (0 - 1 - 2)
n = 4, edges = [[0, 1], [2, 3]], source = 0, destination = 3   ->  False  (two separate pieces)
n = 1, edges = [],               source = 0, destination = 0   ->  True   (same vertex)
```

## Approach 1: brute force

Repeatedly scan the whole edge list, growing a set of vertices known to be reachable from the source, until a full
pass adds nothing new.

```python
def valid_path_brute(n, edges, source, destination):
    reached = {source}
    changed = True
    while changed:
        changed = False
        for u, v in edges:
            if (u in reached) != (v in reached):
                reached.add(u)
                reached.add(v)
                changed = True
    return destination in reached
```

**Complexity:** O(V * E) time in the worst case (a long chain listed in reverse order adds one vertex per pass),
O(V) space.

## Approach 2: optimal (BFS on an adjacency list)

Turn the edge list into an adjacency list once, so each vertex can list its neighbours directly. Then explore
outwards from the source with a queue. Each vertex enters the queue at most once because you mark it as seen when
you add it.

```python
from collections import deque

def valid_path(n, edges, source, destination):
    if source == destination:
        return True
    graph = [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    seen = [False] * n
    seen[source] = True
    queue = deque([source])
    while queue:
        node = queue.popleft()
        for nxt in graph[node]:
            if nxt == destination:
                return True
            if not seen[nxt]:
                seen[nxt] = True
                queue.append(nxt)
    return False
```

**Why it is correct:** BFS visits exactly the vertices in the source's connected component. If the destination is
in that component it is reached; if the queue empties first, no path exists.

**Complexity:** O(V + E) time and space.

## Approach 3: union-find

Union-find (disjoint set union) keeps a parent pointer per vertex. Union the two endpoints of every edge; afterwards
two vertices are connected exactly when they have the same root. With path compression and union by size each
operation is almost constant time. It shines when edges arrive one at a time or when you must answer many
"are these connected?" queries.

```python
def valid_path_dsu(n, edges, source, destination):
    parent = list(range(n))
    size = [1] * n

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]   # path halving
            a = parent[a]
        return a

    for u, v in edges:
        ru, rv = find(u), find(v)
        if ru != rv:
            if size[ru] < size[rv]:
                ru, rv = rv, ru
            parent[rv] = ru
            size[ru] += size[rv]
    return find(source) == find(destination)
```

**Complexity:** O((V + E) * α(V)) time, where α is the inverse Ackermann function (effectively a small constant),
and O(V) space.

## Tests

```python
import random

for f in (valid_path, valid_path_brute, valid_path_dsu):
    assert f(4, [[0, 1], [1, 2]], 0, 2) is True
    assert f(4, [[0, 1], [2, 3]], 0, 3) is False
    assert f(1, [], 0, 0) is True                       # same vertex, no edges
    assert f(2, [], 0, 1) is False                      # no edges
    assert f(5, [[3, 4], [2, 3], [1, 2], [0, 1]], 0, 4) is True   # chain in reverse
    assert f(6, [[0, 1], [1, 2], [2, 0], [3, 4]], 2, 4) is False  # cycle plus separate edge

random.seed(7)
for _ in range(300):
    n = random.randint(1, 8)
    pairs = [(a, b) for a in range(n) for b in range(a + 1, n)]
    edges = [list(p) for p in random.sample(pairs, random.randint(0, len(pairs)))]
    s, d = random.randrange(n), random.randrange(n)
    expected = valid_path_brute(n, edges, s, d)
    assert valid_path(n, edges, s, d) == expected
    assert valid_path_dsu(n, edges, s, d) == expected

big = [[i, i + 1] for i in range(199_999)]
assert valid_path(200_000, big, 0, 199_999) is True
assert valid_path_dsu(200_000, big, 0, 199_999) is True
```

## Edge cases and pitfalls

- `source == destination` is true even with an empty edge list. The BFS version handles it explicitly because it
  only checks the destination when looking at neighbours.
- Add each edge in both directions. Forgetting the reverse direction silently turns the graph into a directed one.
- Recursive DFS on a 200,000-vertex chain overflows Python's default recursion limit. Use a queue or an explicit
  stack.
- Mark vertices when you enqueue them, not when you pop them, or a vertex with many neighbours enters the queue
  repeatedly.

## Where this shows up in data engineering

Lineage tools answer "does this dashboard depend on that source table?", which is reachability over a dependency
graph. Entity resolution uses the union-find form: each matching rule links two records, and connected components
become one customer. Spark's GraphFrames and similar libraries offer connected components for the same purpose at
scale.

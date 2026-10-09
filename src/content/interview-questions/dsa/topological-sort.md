---
title: "Topological Sort: Order a DAG with Kahn's Algorithm or DFS"
seoTitle: "Topological Sort: Kahn's Algorithm and DFS"
description: "Order the vertices of a directed acyclic graph so every edge points forward. Peel off zero in-degree vertices with Kahn's algorithm, or reverse a DFS finish order."
technology: ["dsa"]
topic: ["graphs", "topological-sort"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Kahn's algorithm: compute every vertex's in-degree, put all zero in-degree vertices in a queue, and repeatedly pop one, append it to the order and decrement the in-degree of its successors, enqueuing any that reach zero. The DFS alternative appends each vertex after all its descendants finish and reverses the list. Both run in O(V + E). If Kahn's output has fewer than V vertices, the graph has a cycle and no valid order exists. Many orders can be valid, so tests should check the edge property rather than one specific list."
followUps: ["How do you detect a cycle with each method?", "How would you produce the lexicographically smallest order?", "How would you group vertices into levels that can run in parallel?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "GeeksforGeeks", "title": "Topological Sort", "url": "https://www.geeksforgeeks.org/problems/topological-sort/1"}
previous: "interview-questions:dsa/course-schedule-ii"
next: "interview-questions:dsa/minimum-height-trees"
---

## Problem

You get a directed acyclic graph (DAG) with `V` vertices numbered `0` to `V - 1` and a list of directed edges
`[u, v]`, meaning `u` must come before `v`. Return any ordering of all vertices such that for every edge, `u`
appears earlier than `v`.

This is GeeksforGeeks: Topological Sort. The judge accepts any valid order. It is the core of
[Course Schedule II](/interview/dsa/course-schedule-ii/) and [Alien Dictionary](/interview/dsa/alien-dictionary/).
Assume up to about 10,000 vertices and edges.

## Examples

```text
V = 4, edges = [[2, 1], [1, 0], [2, 3]]            ->  [2, 1, 3, 0]   (2 first; 0 after 1; 3 anywhere after 2)
V = 5, edges = [[0, 3], [1, 3], [3, 4], [2, 4]]    ->  [0, 1, 2, 3, 4] is one valid answer
V = 3, edges = []                                   ->  [0, 1, 2]      (any permutation)
```

## Approach 1: brute force (repeatedly pick a source)

A DAG always has at least one vertex with no incoming edge from the vertices still left. Pick one, output it,
remove it, and repeat. Recomputing "no incoming edge" from scratch each round is what makes this slow.

```python
def topo_sort_brute(V, edges):
    remaining = set(range(V))
    order = []
    while remaining:
        blocked = {v for u, v in edges if u in remaining}
        sources = sorted(remaining - blocked)
        if not sources:
            return []                      # a cycle: no vertex is free
        order.append(sources[0])
        remaining.remove(sources[0])
    return order
```

**Complexity:** O(V * E) time, because every round scans all edges, and O(V) space.

## Approach 2: optimal (Kahn's algorithm)

Keep the in-degree of each vertex up to date instead of recomputing it. Start with every vertex whose in-degree is
zero. When you output a vertex, its outgoing edges disappear, so decrement each successor's in-degree; any successor
that hits zero is now free and joins the queue.

```python
from collections import deque

def topo_sort(V, edges):
    graph = [[] for _ in range(V)]
    indegree = [0] * V
    for u, v in edges:
        graph[u].append(v)
        indegree[v] += 1
    queue = deque(i for i in range(V) if indegree[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in graph[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return order if len(order) == V else []
```

**Why it is correct:** a vertex is output only when all of its predecessors have already been output, so every edge
points forward. If the graph is acyclic, some vertex is always free, so all `V` vertices are output; if a cycle
exists, its vertices never reach in-degree zero and the order comes up short.

**Complexity:** O(V + E) time and space.

## Approach 3: DFS finish order

Run DFS and append a vertex only after all of its successors are finished. A vertex then finishes after everything
it must precede, so reversing the finish list gives a valid order. Three colours (unvisited, in progress, done)
detect cycles: reaching an in-progress vertex means a back edge. The version below is iterative to avoid recursion
limits.

```python
def topo_sort_dfs(V, edges):
    graph = [[] for _ in range(V)]
    for u, v in edges:
        graph[u].append(v)
    state = [0] * V                        # 0 unvisited, 1 in progress, 2 done
    finished = []
    for start in range(V):
        if state[start]:
            continue
        stack = [(start, iter(graph[start]))]
        state[start] = 1
        while stack:
            node, children = stack[-1]
            nxt = next(children, None)
            if nxt is None:
                state[node] = 2
                finished.append(node)
                stack.pop()
            elif state[nxt] == 1:
                return []                  # back edge: cycle
            elif state[nxt] == 0:
                state[nxt] = 1
                stack.append((nxt, iter(graph[nxt])))
    return finished[::-1]
```

**Complexity:** O(V + E) time and space.

## Tests

```python
import random

def is_valid(V, edges, order):
    pos = {v: i for i, v in enumerate(order)}
    return sorted(order) == list(range(V)) and all(pos[u] < pos[v] for u, v in edges)

cases = [
    (4, [[2, 1], [1, 0], [2, 3]]),
    (5, [[0, 3], [1, 3], [3, 4], [2, 4]]),
    (3, []),                                       # no edges
    (1, []),                                       # single vertex
    (5, [[0, 1], [1, 2], [2, 3], [3, 4]]),         # chain
    (4, [[0, 1], [0, 2], [1, 3], [2, 3]]),         # diamond
]
for f in (topo_sort, topo_sort_brute, topo_sort_dfs):
    for V, edges in cases:
        assert is_valid(V, edges, f(V, edges))
    assert f(3, [[0, 1], [1, 2], [2, 0]]) == []    # cycle detected
    assert f(2, [[0, 0]]) == []                    # self-loop is a cycle

random.seed(4)
for _ in range(300):
    V = random.randint(1, 9)
    perm = random.sample(range(V), V)              # hidden order makes a DAG
    edges = [[perm[i], perm[j]] for i in range(V) for j in range(i + 1, V) if random.random() < 0.3]
    for f in (topo_sort, topo_sort_brute, topo_sort_dfs):
        assert is_valid(V, edges, f(V, edges))

chain = [[i, i + 1] for i in range(9_999)]
assert topo_sort_dfs(10_000, chain) == list(range(10_000))
```

## Edge cases and pitfalls

- Many orders are valid. Test by checking that every edge points forward, not against one expected list.
- Isolated vertices have in-degree zero and must still appear in the output.
- In DFS, a two-state visited flag cannot tell a back edge (cycle) from a cross edge to a finished vertex. Use three
  states.
- Forgetting to reverse the DFS finish list gives an order where every edge points backwards.
- Recursive DFS overflows Python's default recursion limit on a 10,000-vertex chain.

## Where this shows up in data engineering

Every orchestrator has to run tasks in dependency order: Airflow, Dagster and dbt all build a DAG of tasks or models
and refuse cycles. Kahn's algorithm maps directly onto scheduling, because the queue of zero in-degree vertices is
the set of tasks whose upstreams have all succeeded and can run now, possibly in parallel. dbt's `ref()` graph and
`dbt build` ordering are a topological sort of your models.

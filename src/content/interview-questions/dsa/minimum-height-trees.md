---
title: "Minimum Height Trees: Trim Leaves Until the Centre Remains"
seoTitle: "Minimum Height Trees: Trim Leaves Inward"
description: "Find every root that gives a tree its smallest height. Peel leaves layer by layer, a topological sort on degrees, until one or two centre nodes are left."
technology: ["dsa"]
topic: ["graphs", "topological-sort"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 18
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The best roots are the centre of the tree, the middle of its longest path, so there are always one or two of them. Find them by trimming: put all leaves (degree 1) in a list, remove them and decrement their neighbours' degrees, collect the neighbours that become leaves, and repeat while more than two nodes remain. What is left is the answer. This is Kahn's algorithm on undirected degrees and runs in O(n) time and space. Running BFS from every node also works but costs O(n^2). Handle n = 1, where the single node has degree 0."
followUps: ["Why can there never be three minimum-height roots?", "How would you find the centre using two BFS passes and the diameter?", "How would you compute the height for every possible root in O(n)?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 310, "title": "Minimum Height Trees", "url": "https://leetcode.com/problems/minimum-height-trees/"}
previous: "interview-questions:dsa/topological-sort"
next: "interview-questions:dsa/alien-dictionary"
---

## Problem

You get a tree with `n` nodes labelled `0` to `n - 1`, as a list of `n - 1` undirected edges. Any node can be chosen
as the root, and the height is then the number of edges on the longest path from the root down to a leaf. Return
all nodes whose choice as root gives the minimum possible height, in any order.

This is LeetCode 310, Minimum Height Trees. Assume `n` up to about 20,000, which rules out anything quadratic.

## Examples

```text
n = 5, edges = [[0, 2], [2, 1], [2, 3], [2, 4]]            ->  [2]       (a star: the hub)
n = 6, edges = [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]]    ->  [1, 2]    (two centres)
n = 1, edges = []                                          ->  [0]
n = 2, edges = [[0, 1]]                                    ->  [0, 1]
```

## Approach 1: brute force (BFS from every node)

Root the tree at each node in turn, measure its height with BFS, and keep the nodes that tie for the smallest.

```python
from collections import deque

def tree_height(graph, root):
    depth = {root: 0}
    queue = deque([root])
    while queue:
        node = queue.popleft()
        for nxt in graph[node]:
            if nxt not in depth:
                depth[nxt] = depth[node] + 1
                queue.append(nxt)
    return max(depth.values())

def find_min_height_trees_brute(n, edges):
    graph = [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    heights = [tree_height(graph, r) for r in range(n)]
    best = min(heights)
    return [r for r in range(n) if heights[r] == best]
```

**Complexity:** O(n^2) time (n BFS runs of O(n) each) and O(n) space. Fine for checking, too slow at 20,000 nodes.

## Approach 2: optimal (trim leaves layer by layer)

Picture the longest path in the tree. Its middle node, or middle two nodes when its length is odd, is the best
root: going any other way only lengthens the longer half. To find the middle without knowing the path, burn the
tree from the outside in. Remove every current leaf at once; this shortens every longest path by one at each end.
The nodes that become leaves form the next layer. Stop when one or two nodes remain; they are the centre.

```python
def find_min_height_trees(n, edges):
    if n <= 2:
        return list(range(n))
    graph = [[] for _ in range(n)]
    degree = [0] * n
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
        degree[u] += 1
        degree[v] += 1
    leaves = [i for i in range(n) if degree[i] == 1]
    remaining = n
    while remaining > 2:
        remaining -= len(leaves)
        next_leaves = []
        for leaf in leaves:
            for nb in graph[leaf]:
                degree[nb] -= 1
                if degree[nb] == 1:
                    next_leaves.append(nb)
        leaves = next_leaves
    return leaves
```

**Why it is correct:** the height from a root equals its distance to the farthest leaf, which is always an end of a
longest path. Each trimming round removes both ends of every longest path, so the middle of the longest path is the
last thing removed. A path has one middle node or two adjacent middle nodes, so the loop always stops with one or
two. Trimming a leaf whose neighbour was already trimmed cannot happen within a round, because a node becomes a leaf
only after all but one of its neighbours are gone.

**Complexity:** O(n) time and space. Each node joins a leaf list once and each edge is decremented once from each
side.

## Tests

```python
import random

def norm(xs):
    return sorted(xs)

for f in (find_min_height_trees, find_min_height_trees_brute):
    assert norm(f(5, [[0, 2], [2, 1], [2, 3], [2, 4]])) == [2]
    assert norm(f(6, [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]])) == [1, 2]
    assert f(1, []) == [0]                                       # single node
    assert norm(f(2, [[0, 1]])) == [0, 1]                        # one edge
    assert norm(f(5, [[0, 1], [1, 2], [2, 3], [3, 4]])) == [2]   # odd path
    assert norm(f(4, [[0, 1], [1, 2], [2, 3]])) == [1, 2]        # even path

random.seed(8)
for _ in range(300):
    n = random.randint(1, 12)
    edges = [[i, random.randrange(i)] for i in range(1, n)]      # random tree
    assert norm(find_min_height_trees(n, edges)) == norm(find_min_height_trees_brute(n, edges))

path = [[i, i + 1] for i in range(19_999)]
assert norm(find_min_height_trees(20_000, path)) == [9_999, 10_000]
```

## Edge cases and pitfalls

- With `n = 1` there are no edges and the only node has degree 0, so the leaf list would be empty. Return `[0]`
  directly. `n = 2` returns both nodes.
- Stop when at most two nodes remain, not when the leaf list is empty, or you trim the centre away too.
- Subtract the whole layer from `remaining` before processing it. Checking the count in the middle of a layer can
  stop half-way through.
- The answer is never more than two nodes. If your code returns three, it has trimmed unevenly.

## Where this shows up in data engineering

Picking the node of a network or dependency tree that minimises the worst-case distance to everything else is the
graph centre problem: placing a coordinator or aggregation point to minimise the longest hop, or choosing a root for
a hierarchy so the deepest level is as shallow as possible. The trimming idea also reappears in pruning: repeatedly
removing leaf tables or tasks that nothing depends on, to find the core of a lineage graph.

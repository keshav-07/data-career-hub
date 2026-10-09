---
title: "Number of Provinces: Count Components in an Adjacency Matrix"
seoTitle: "Number of Provinces: Count Components"
description: "Count groups of directly or indirectly connected cities given an adjacency matrix. Start a DFS from each unvisited city, or merge pairs with union-find."
technology: ["dsa"]
topic: ["graphs", "union-find"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "A province is a connected component. Loop over the cities; each time you meet one not yet visited, add one to the count and run a DFS or BFS from it, marking every city it reaches. Because the input is an n by n matrix, scanning a city's neighbours costs O(n), so the total is O(n^2) time and O(n) extra space. Union-find gives the same answer: start with n components and subtract one every time a union merges two different roots."
followUps: ["How would the complexity change if the graph were given as an edge list instead of a matrix?", "How would you handle cities and connections arriving as a stream?", "How would you also report the size of the largest province?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 547, "title": "Number of Provinces", "url": "https://leetcode.com/problems/number-of-provinces/"}
---

## Problem

There are `n` cities. You get an `n` by `n` matrix where entry `[i][j]` is `1` if cities `i` and `j` are directly
connected and `0` otherwise. The matrix is symmetric and every city is connected to itself. A province is a group of
cities linked directly or through other cities, with no link to any city outside the group. Return the number of
provinces.

This is LeetCode 547, Number of Provinces. It is the matrix form of
[Number of Connected Components](/interview/dsa/number-of-connected-components/). Assume `n` is at most 200.

## Examples

```text
1 1 0
1 1 0      ->  2    ({0, 1} and {2})
0 0 1

1 0 0
0 1 0      ->  3    (no links)
0 0 1

1 0 0 1
0 1 1 0    ->  2    ({0, 3} and {1, 2})
0 1 1 0
1 0 0 1
```

## Approach 1: brute force (label propagation)

Give every city its own label. Repeatedly scan every connected pair and lower the larger label to the smaller,
until a full scan changes nothing. The number of distinct labels left is the answer.

```python
def find_provinces_labels(is_connected):
    n = len(is_connected)
    label = list(range(n))
    changed = True
    while changed:
        changed = False
        for i in range(n):
            for j in range(n):
                if is_connected[i][j] and label[i] != label[j]:
                    low = min(label[i], label[j])
                    label[i] = label[j] = low
                    changed = True
    return len(set(label))
```

**Complexity:** O(n^3) time in the worst case (a long chain can need O(n) scans of O(n^2) each), O(n) space.

## Approach 2: optimal (DFS from each unvisited city)

Treat the matrix as a graph. Go through the cities in order. An unvisited city must start a new province, so count
it and visit everything reachable from it with an explicit stack. When the loop ends, each province has been counted
exactly once, at its first city.

```python
def find_provinces(is_connected):
    n = len(is_connected)
    visited = [False] * n
    provinces = 0
    for start in range(n):
        if visited[start]:
            continue
        provinces += 1
        visited[start] = True
        stack = [start]
        while stack:
            city = stack.pop()
            for other in range(n):
                if is_connected[city][other] and not visited[other]:
                    visited[other] = True
                    stack.append(other)
    return provinces
```

**Why it is correct:** a DFS from a city marks exactly its connected component. Later starts skip marked cities, so
each component triggers one increment.

**Complexity:** O(n^2) time, because each city's row is scanned once, and O(n) space. You cannot beat O(n^2) here:
the input itself has n^2 entries.

## Approach 3: union-find

Start with `n` separate components. For each connected pair above the diagonal, union the two cities; a union that
joins two different roots reduces the count by one.

```python
def find_provinces_dsu(is_connected):
    n = len(is_connected)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    count = n
    for i in range(n):
        for j in range(i + 1, n):
            if is_connected[i][j]:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[ri] = rj
                    count -= 1
    return count
```

**Complexity:** O(n^2 * α(n)) time, O(n) space. Union-find is the better fit when links arrive one at a time and you
need the running count after each.

## Tests

```python
import random

for f in (find_provinces, find_provinces_labels, find_provinces_dsu):
    assert f([[1, 1, 0], [1, 1, 0], [0, 0, 1]]) == 2
    assert f([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) == 3
    assert f([[1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1]]) == 2
    assert f([[1]]) == 1                                  # single city
    assert f([[1] * 5 for _ in range(5)]) == 1            # fully connected
    chain = [[1 if abs(i - j) <= 1 else 0 for j in range(6)] for i in range(6)]
    assert f(chain) == 1                                  # path 0-1-2-3-4-5

random.seed(2)
for _ in range(300):
    n = random.randint(1, 8)
    m = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if random.random() < 0.25:
                m[i][j] = m[j][i] = 1
    assert find_provinces(m) == find_provinces_labels(m) == find_provinces_dsu(m)
```

## Edge cases and pitfalls

- The diagonal is always `1`. It does no harm in the DFS (the city is already visited) but skip it in union-find
  loops to save work.
- Decrement the union-find count only when the roots differ; otherwise a cycle of links would undercount.
- Recursive DFS is safe for n = 200, but the iterative form avoids recursion limits if the problem grows.
- Do not count provinces by counting rows with a `1` off the diagonal: isolated cities are provinces too.

## Where this shows up in data engineering

Grouping records that link to each other directly or transitively is connected components: merging customer
accounts that share an email or phone number, grouping invoices that reference each other, or finding clusters of
tables joined by lineage. At warehouse scale you would run union-find style label propagation, which is what
Approach 1 resembles, iterating joins until no label changes.

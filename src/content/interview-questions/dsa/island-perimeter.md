---
title: "Island Perimeter: Count Land Edges Without a Traversal"
seoTitle: "Island Perimeter: Count Edges in One Pass"
description: "Find the perimeter of a single island in a grid. Add four per land cell and subtract two per shared edge, a one-pass count that needs no DFS or visited set."
technology: ["dsa"]
topic: ["graphs", "matrix"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Each land cell contributes four edges. Every pair of horizontally or vertically adjacent land cells hides one edge from each of them, so subtract two per adjacent pair. Count pairs by checking only the cell above and the cell to the left while scanning, so each pair is seen once. One pass, O(R * C) time, O(1) extra space. A DFS works too but is unnecessary, because the perimeter is a local property of each cell."
followUps: ["How would you handle a grid with several islands and return each island's perimeter?", "What changes if lakes inside the island should not count toward the perimeter?", "How would you write this as a SQL query over a table of land cells?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 463, "title": "Island Perimeter", "url": "https://leetcode.com/problems/island-perimeter/"}
---

## Problem

A grid holds `1` for land and `0` for water. Land cells connect horizontally and vertically, and the grid contains
exactly one island. Water surrounds the grid on all sides, and the island has no lakes (water cells completely
enclosed by land). Return the length of the island's
coastline, where each cell side is one unit.

This is LeetCode 463, Island Perimeter. Assume grids of up to 100 by 100.

## Examples

```text
0 1 0 0
1 1 1 0     ->  16
0 1 0 0
1 1 0 0

1           ->  4     (one cell)
1 1         ->  6     (two cells share one edge: 8 - 2)
```

## Approach 1: brute force (check all four sides)

For every land cell, look at its four neighbours. Each side that faces water or the grid boundary is part of the
perimeter.

```python
def island_perimeter_sides(grid):
    rows, cols = len(grid), len(grid[0])
    total = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if not (0 <= nr < rows and 0 <= nc < cols) or grid[nr][nc] == 0:
                        total += 1
    return total
```

**Complexity:** O(R * C) time and O(1) space. This is already optimal in big-O terms; it is "brute force" only in the
sense that it inspects every side of every cell.

## Approach 2: optimal (count cells and shared edges)

Think of it as arithmetic instead of geometry. If the island had `L` land cells that never touched, the perimeter
would be `4 * L`. Each time two land cells sit side by side, the edge between them is internal, and it was counted
once for each cell, so you subtract 2. Scanning row by row, you only need to look up and left; looking all four ways
would count each shared edge twice.

```python
def island_perimeter(grid):
    land = shared = 0
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell == 1:
                land += 1
                if r > 0 and grid[r - 1][c] == 1:
                    shared += 1
                if c > 0 and row[c - 1] == 1:
                    shared += 1
    return 4 * land - 2 * shared
```

**Why it is correct:** every unit edge of a land cell is either on the coast or between two land cells. Coast edges
are counted once in `4 * land`; internal edges are counted twice there and removed twice by `2 * shared`.

**Complexity:** O(R * C) time, O(1) extra space, and roughly half the neighbour checks of Approach 1.

## Approach 3: DFS (when you need the island anyway)

If the grid had several islands and you wanted each perimeter, you would traverse each island and add one for every
step that leaves land. This is the version to reach for when the question changes.

```python
def island_perimeter_dfs(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                stack, perim = [(r, c)], 0
                seen.add((r, c))
                while stack:
                    cr, cc = stack.pop()
                    for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                        if not (0 <= nr < rows and 0 <= nc < cols) or grid[nr][nc] == 0:
                            perim += 1
                        elif (nr, nc) not in seen:
                            seen.add((nr, nc))
                            stack.append((nr, nc))
                return perim
    return 0
```

**Complexity:** O(R * C) time and space for the visited set.

## Tests

```python
import random

sample = [[0, 1, 0, 0], [1, 1, 1, 0], [0, 1, 0, 0], [1, 1, 0, 0]]
for f in (island_perimeter, island_perimeter_sides, island_perimeter_dfs):
    assert f(sample) == 16
    assert f([[1]]) == 4
    assert f([[1, 1]]) == 6
    assert f([[1], [1], [1]]) == 8                     # vertical strip
    assert f([[1, 1], [1, 1]]) == 8                    # 2x2 block
    assert f([[0, 0, 0], [0, 1, 0], [0, 0, 0]]) == 4   # cell surrounded by water

def random_island(rows, cols):
    grid = [[0] * cols for _ in range(rows)]
    r, c = random.randrange(rows), random.randrange(cols)
    for _ in range(random.randint(1, rows * cols)):
        grid[r][c] = 1
        dr, dc = random.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
        if 0 <= r + dr < rows and 0 <= c + dc < cols:
            r, c = r + dr, c + dc
    return grid

random.seed(5)
for _ in range(300):
    g = random_island(random.randint(1, 6), random.randint(1, 6))   # a random walk is always connected
    expected = island_perimeter_sides(g)
    assert island_perimeter(g) == expected == island_perimeter_dfs(g)
```

## Edge cases and pitfalls

- Count each shared edge once. Checking all four neighbours and subtracting two per hit double-subtracts.
- Treat the grid border as water. Index checks must come before reading `grid[nr][nc]`, or negative indices wrap
  around in Python and read the opposite side of the grid.
- The formula works for any set of land cells, connected or not, so it also gives the total coastline of many
  islands. If lakes were allowed, their shores would be counted too, which may or may not be what the question
  wants.

## Where this shows up in data engineering

The cell-and-shared-edge trick is a self-join: with land cells stored as `(row, col)` rows, the perimeter is
`4 * COUNT(*)` minus twice the number of matches when you join each cell to the cell one row up or one column left.
Turning a traversal into a counting query like this is often how grid and adjacency problems become cheap set-based
SQL in a warehouse.

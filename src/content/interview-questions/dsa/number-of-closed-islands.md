---
title: "Number of Closed Islands: Sink the Border, Then Count"
seoTitle: "Number of Closed Islands: Sink the Border"
description: "Count land regions that never touch the grid edge. Flood-fill every island that reaches the border first, then count the islands that remain with one more pass."
technology: ["dsa"]
topic: ["graphs", "matrix"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "An island is closed when none of its cells lie on the grid edge. First flood-fill from every land cell on the border and turn those regions into water, because they cannot be closed. Then scan the interior: each remaining land cell starts a new closed island, which you count and flood-fill away. Every cell is visited a constant number of times, so time is O(R * C) and the explicit stack is O(R * C) in the worst case. Watch the inverted encoding: here 0 is land and 1 is water."
followUps: ["How would you solve it in a single pass, flagging whether each island touched the border?", "How would you return the area of each closed island?", "How does this relate to Surrounded Regions?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 1254, "title": "Number of Closed Islands", "url": "https://leetcode.com/problems/number-of-closed-islands/"}
---

## Problem

A grid holds `0` for land and `1` for water. Note the encoding: it is the reverse of
[Number of Islands](/interview/dsa/number-of-islands/). An island is a maximal group of land cells joined up, down,
left or right. A closed island is one completely surrounded by water on all four sides, which in practice means none
of its cells sit on the outer edge of the grid. Return the number of closed islands.

This is LeetCode 1254, Number of Closed Islands. Assume grids of up to 100 by 100.

## Examples

```text
1 1 1 1 1
1 0 0 1 1
1 0 1 0 1      ->  2    (the 0s at (1,1),(1,2),(2,1) and the single 0 at (2,3))
1 1 1 1 1

0 1 1
1 0 1          ->  1    (the corner 0 touches the edge; the centre 0 is closed)
1 1 1

0 0
0 0            ->  0    (every land cell is on the edge)
```

## Approach 1: brute force (traverse each island and check it)

Find every island with a traversal, and while visiting it note whether any cell lies on the border. Count the
islands that never did. Recording the cells first and testing them afterwards keeps the logic simple, and the
traversal must finish even after the border is found so the whole island is marked.

```python
def closed_island_check(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 0 and (r, c) not in seen:
                seen.add((r, c))
                stack, cells = [(r, c)], []
                while stack:
                    cr, cc = stack.pop()
                    cells.append((cr, cc))
                    for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0 and (nr, nc) not in seen:
                            seen.add((nr, nc))
                            stack.append((nr, nc))
                if all(0 < a < rows - 1 and 0 < b < cols - 1 for a, b in cells):
                    count += 1
    return count
```

**Complexity:** O(R * C) time and space. It is correct and linear; the next approach is shorter and does not need a
visited set or a cell list.

## Approach 2: optimal (sink border islands, then count)

Any island with a cell on the border is disqualified, so remove those islands first: flood-fill from every border
land cell and turn the region into water. Whatever land remains cannot reach the edge. Now this is plain island
counting: each remaining land cell you meet starts a new closed island, and you sink it as you count it.

```python
def closed_island(grid):
    g = [row[:] for row in grid]
    rows, cols = len(g), len(g[0])

    def sink(r, c):
        if g[r][c] != 0:
            return
        g[r][c] = 1
        stack = [(r, c)]
        while stack:
            cr, cc = stack.pop()
            for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and g[nr][nc] == 0:
                    g[nr][nc] = 1
                    stack.append((nr, nc))

    for r in range(rows):
        sink(r, 0)
        sink(r, cols - 1)
    for c in range(cols):
        sink(0, c)
        sink(rows - 1, c)

    count = 0
    for r in range(1, rows - 1):
        for c in range(1, cols - 1):
            if g[r][c] == 0:
                count += 1
                sink(r, c)
    return count
```

**Why it is correct:** after the border pass, every remaining land cell belongs to an island with no border cell
(otherwise the border flood fill would have reached it). Counting islands in what remains therefore counts exactly
the closed islands.

**Complexity:** O(R * C) time, since each land cell is sunk once, and O(R * C) space for the copy and the stack in the
worst case. Mutating the input instead of copying saves the copy if the caller allows it.

## Tests

```python
import random

for f in (closed_island, closed_island_check):
    assert f([[1, 1, 1, 1, 1], [1, 0, 0, 1, 1], [1, 0, 1, 0, 1], [1, 1, 1, 1, 1]]) == 2
    assert f([[0, 1, 1], [1, 0, 1], [1, 1, 1]]) == 1
    assert f([[0, 0], [0, 0]]) == 0                      # all land on the edge
    assert f([[1]]) == 0 and f([[0]]) == 0               # single cell
    assert f([[1, 1, 1], [1, 1, 1], [1, 1, 1]]) == 0     # no land
    ring = [[1, 1, 1, 1, 1],
            [1, 0, 0, 0, 1],
            [1, 0, 1, 0, 1],
            [1, 0, 0, 0, 1],
            [1, 1, 1, 1, 1]]
    assert f(ring) == 1                                  # ring-shaped island
    leaky = [[1, 1, 1, 1],
             [1, 0, 0, 0],                               # interior land connected to the right edge
             [1, 1, 1, 1]]
    assert f(leaky) == 0

random.seed(9)
for _ in range(400):
    rows, cols = random.randint(1, 7), random.randint(1, 7)
    g = [[random.randint(0, 1) for _ in range(cols)] for _ in range(rows)]
    original = [row[:] for row in g]
    assert closed_island(g) == closed_island_check(g)
    assert g == original                                 # input not modified
```

## Edge cases and pitfalls

- The encoding is inverted: `0` is land. Copying an island-counting solution without flipping the test is the most
  common bug.
- A region that looks enclosed can still leak to the edge through a narrow corridor. Only a traversal tells you, not
  a check of its first cell.
- In the one-pass variant, do not stop the traversal the moment you hit the border. The rest of the island stays
  unvisited and is later counted as a separate, wrongly closed island.
- Grids with one or two rows or columns have no interior, so the answer is 0.

## Where this shows up in data engineering

"Eliminate everything connected to a known-bad seed, then count what is left" is a common shape in graph cleanup:
discarding sessions linked to bot traffic before counting genuine user clusters, or pruning lineage nodes reachable
from a deprecated source before computing what still depends only on approved tables. The two-phase structure keeps
each phase a simple traversal.

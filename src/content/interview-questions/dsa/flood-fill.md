---
title: "Flood Fill: Repaint a Connected Region with DFS or BFS"
seoTitle: "Flood Fill: Repaint a Region with DFS or BFS"
description: "Repaint every cell connected to a starting pixel that shares its colour. Traverse the region with an explicit stack or queue and guard the same-colour case."
technology: ["dsa"]
topic: ["graphs", "matrix"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Remember the starting cell's original colour. If it already equals the new colour, return the image unchanged, otherwise the traversal never terminates. Then run DFS or BFS from the start: repaint each cell as you visit it and push its four neighbours that are inside the grid and still have the original colour. Repainting doubles as the visited marker. Time and space are O(R * C) in the worst case."
followUps: ["Why does the same-colour case cause an infinite loop without a guard?", "How would you include diagonal neighbours?", "How would you fill only the boundary of the region?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/graphs"]
practice: {"platform": "LeetCode", "number": 733, "title": "Flood Fill", "url": "https://leetcode.com/problems/flood-fill/"}
---

## Problem

An image is a grid of integers, one colour per pixel. Starting from a given pixel `(sr, sc)`, change the colour of
that pixel and of every pixel connected to it through up, down, left or right steps that has the same original
colour as the start. Return the modified image. Pixels of other colours act as walls.

This is LeetCode 733, Flood Fill. It is the "paint bucket" tool from image editors and the smallest possible grid
traversal question. Assume grids of up to 50 by 50.

## Examples

```text
image          start   new colour   result
3 3 0          (0, 0)  5            5 5 0
3 0 0                               5 0 0
0 3 3                               0 3 3    (bottom-right 3s are not connected to the start)

1 1            (1, 1)  1            1 1      (new colour equals old colour: nothing changes)
1 1                                 1 1
```

## Approach 1: brute force

Grow the region by repeated sweeps. Mark the start, then keep scanning the whole grid, marking any original-colour
cell that touches a marked cell, until a sweep marks nothing. Finally repaint the marked cells.

```python
def flood_fill_brute(image, sr, sc, color):
    img = [row[:] for row in image]
    rows, cols = len(img), len(img[0])
    old = img[sr][sc]
    marked = {(sr, sc)}
    changed = True
    while changed:
        changed = False
        for r in range(rows):
            for c in range(cols):
                if img[r][c] == old and (r, c) not in marked:
                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if (r + dr, c + dc) in marked:
                            marked.add((r, c))
                            changed = True
                            break
    for r, c in marked:
        img[r][c] = color
    return img
```

**Complexity:** O((R * C)²) time in the worst case, because a snake-shaped region may grow by one cell per sweep.
O(R * C) space.

## Approach 2: optimal (DFS with an explicit stack)

Visit the region directly. Start at the given pixel, repaint it, and push each neighbour that still has the original
colour. Because repainted cells no longer match the original colour, they are never pushed again, so the colour
change itself is the visited set. That only works when the new colour differs from the old one, hence the guard.

```python
def flood_fill(image, sr, sc, color):
    img = [row[:] for row in image]
    old = img[sr][sc]
    if old == color:
        return img
    rows, cols = len(img), len(img[0])
    img[sr][sc] = color
    stack = [(sr, sc)]
    while stack:
        r, c = stack.pop()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and img[nr][nc] == old:
                img[nr][nc] = color
                stack.append((nr, nc))
    return img
```

**Why it is correct:** a cell is pushed only if it is adjacent to a repainted cell and has the original colour, so
only connected same-colour cells change. Every such cell is reachable by a chain of steps from the start, and the
traversal follows every step, so none is missed.

**Complexity:** O(R * C) time, since each cell is pushed at most once, and O(R * C) space for the stack in the worst
case. Replacing the stack with `collections.deque` and `popleft` gives BFS with the same bounds.

The solutions copy the image so tests can compare against the input. LeetCode accepts in-place modification too,
which saves the O(R * C) copy.

## Tests

```python
import random

for f in (flood_fill, flood_fill_brute):
    assert f([[3, 3, 0], [3, 0, 0], [0, 3, 3]], 0, 0, 5) == [[5, 5, 0], [5, 0, 0], [0, 3, 3]]
    assert f([[1, 1], [1, 1]], 1, 1, 1) == [[1, 1], [1, 1]]          # same colour
    assert f([[7]], 0, 0, 2) == [[2]]                                 # single pixel
    assert f([[0, 1, 0]], 0, 1, 4) == [[0, 4, 0]]                     # isolated start
    assert f([[2, 2], [2, 2]], 0, 1, 9) == [[9, 9], [9, 9]]           # whole grid
    assert f([[1, 0, 1], [0, 1, 0], [1, 0, 1]], 1, 1, 3) == [[1, 0, 1], [0, 3, 0], [1, 0, 1]]  # no diagonals

random.seed(3)
for _ in range(300):
    rows, cols = random.randint(1, 6), random.randint(1, 6)
    img = [[random.randint(0, 2) for _ in range(cols)] for _ in range(rows)]
    sr, sc, col = random.randrange(rows), random.randrange(cols), random.randint(0, 3)
    assert flood_fill(img, sr, sc, col) == flood_fill_brute(img, sr, sc, col)

big = [[1] * 200 for _ in range(200)]
assert flood_fill(big, 0, 0, 2) == [[2] * 200 for _ in range(200)]
```

## Edge cases and pitfalls

- New colour equal to the old colour: without the early return, every repainted cell still "matches" and the
  traversal loops forever.
- Repaint when you push, not when you pop, so a cell cannot be pushed twice by two neighbours.
- Recursive DFS is fine for a 50 by 50 grid, but a 1000 by 1000 grid of one colour exceeds Python's default
  recursion limit. The explicit stack has no such limit.
- Only four directions count. Diagonal cells of the same colour stay unchanged.

## Where this shows up in data engineering

Flood fill is connected-component labelling on a grid: the same routine groups adjacent raster cells in geospatial
pipelines (for example, merging contiguous land-use pixels into regions) and labels blobs in image preprocessing
before features are extracted. The general lesson, that a mutation can serve as the visited marker only when it
changes the matching condition, applies to any in-place graph traversal.

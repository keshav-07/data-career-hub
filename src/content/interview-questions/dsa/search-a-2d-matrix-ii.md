---
title: "Search a 2D Matrix II: Staircase Search from the Top-Right Corner"
seoTitle: "Search a 2D Matrix II: Staircase Search"
description: "Search a matrix whose rows and columns are both sorted in O(m + n) by walking from the top-right corner, plus a per-row binary search. Python solutions and tests."
technology: ["dsa"]
topic: ["binary-search", "matrix"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
shortAnswer: "Start at the top-right cell. It is the largest value in its row and the smallest in its column, so one comparison removes a whole row or column: if it is bigger than the target, move left; if smaller, move down; if equal, you are done. You take at most m + n steps, so it is O(m + n) time and O(1) space. A binary search on each row gives O(m log n), which is better only when there are far fewer rows than columns. Flattening the matrix into one sorted list does not work here, because a row does not continue the previous one."
followUps: ["Why does starting at the top-left corner not work?", "When is binary searching each row faster than the staircase?", "How would you count the values less than or equal to x in the same matrix?"]
versionContext: "Python 3 solutions verified with assert-based tests"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
related: ["articles:dsa/binary-search", "interview-questions:dsa/search-a-2d-matrix"]
practice: {"platform": "LeetCode", "number": 240, "title": "Search a 2D Matrix II", "url": "https://leetcode.com/problems/search-a-2d-matrix-ii/"}
---

## Problem

You are given an `m x n` grid of integers in which every row is sorted in ascending order from left to right and every column is sorted in ascending order from top to bottom. Return whether a target value appears in the grid.

This is LeetCode 240, Search a 2D Matrix II. Unlike Search a 2D Matrix, the first value of a row can be smaller than the last value of the row above, so the grid is not one sorted list.

Assume up to 300 rows and 300 columns.

## Examples

```text
grid = [[ 2,  5,  9, 14],
        [ 3,  8, 12, 19],
        [ 7, 10, 16, 23],
        [11, 15, 20, 30]]

target = 12  ->  True
target = 13  ->  False
target = 2   ->  True    (top-left corner)
target = 31  ->  False   (larger than everything)
```

## Approach 1: brute force

Check every cell.

```python
def search_linear(grid, target):
    return any(target in row for row in grid)
```

This is O(m * n) time and uses neither ordering.

## Approach 2: binary search each row

Each row is sorted, so binary search each one. You can also skip rows that cannot contain the target: if a row starts above the target, every later row does too, because columns are sorted.

```python
from bisect import bisect_left

def search_rows(grid, target):
    for row in grid:
        if not row or row[0] > target:
            break                       # this and every lower row start too high
        i = bisect_left(row, target)
        if i < len(row) and row[i] == target:
            return True
    return False
```

This is O(m log n) time and O(1) space. It uses the row order fully but the column order only for the early exit.

## Approach 3: optimal (staircase search)

Look at the top-right cell. Everything to its left in that row is smaller, and everything below it in that column is larger. So a single comparison with the target settles a whole line:

- If the cell is **greater** than the target, the target cannot be anywhere in this column (everything below is even larger). Move one column left.
- If the cell is **less** than the target, the target cannot be in this row (everything to the left is even smaller). Move one row down.
- If it is equal, return `True`.

Walkthrough for target 12 in the grid above:

```text
(0,3)=14 > 12 -> left
(0,2)=9  < 12 -> down
(1,2)=12      -> found
```

```python
def search_staircase(grid, target):
    if not grid or not grid[0]:
        return False
    r, c = 0, len(grid[0]) - 1
    while r < len(grid) and c >= 0:
        v = grid[r][c]
        if v == target:
            return True
        if v > target:
            c -= 1                      # discard this column
        else:
            r += 1                      # discard this row
    return False
```

**Why it is correct.** The invariant is that if the target is present, it lies in rows `r..m-1` and columns `0..c`. Each move discards a row or column that cannot contain it, as argued above. When the region becomes empty, the target is not there. The bottom-left corner works just as well, with the directions mirrored. The top-left corner does not: it is the smallest in both its row and column, so a "too small" result does not tell you which way to go.

**Complexity.** Each step removes a row or a column, so at most `m + n` steps: O(m + n) time and O(1) space. This beats the per-row binary search unless one dimension is much smaller than the other.

## Tests

```python
import random

G = [[2, 5, 9, 14],
     [3, 8, 12, 19],
     [7, 10, 16, 23],
     [11, 15, 20, 30]]

def check(fn):
    assert fn(G, 12) is True
    assert fn(G, 13) is False
    assert fn(G, 2) is True
    assert fn(G, 30) is True
    assert fn(G, 31) is False
    assert fn(G, 1) is False
    assert fn([[5]], 5) is True
    assert fn([[1, 3, 5]], 4) is False
    assert fn([[1], [3], [5]], 3) is True
    assert fn([], 1) is False

def random_sorted_grid(rng, m, n):
    grid = [[0] * n for _ in range(m)]
    for i in range(m):
        for j in range(n):
            base = max(grid[i - 1][j] if i else 0, grid[i][j - 1] if j else 0)
            grid[i][j] = base + rng.randint(0, 3)
    return grid

for f in (search_linear, search_rows, search_staircase):
    check(f)

rng = random.Random(2)
for _ in range(300):
    g = random_sorted_grid(rng, rng.randint(1, 6), rng.randint(1, 6))
    t = rng.randint(-1, 30)
    assert search_staircase(g, t) == search_rows(g, t) == search_linear(g, t)
print("ok")
```

## Edge cases and pitfalls

- **Treating it as one sorted list.** The divmod trick from Search a 2D Matrix is wrong here, because row ends do not line up with the next row's start.
- **Wrong corner.** Top-left and bottom-right give no direction. Use top-right or bottom-left.
- **Empty grid or empty rows.** Guard before reading `grid[0]`.
- **Duplicates.** They do not break the staircase; any equal cell ends the search.

## Where this shows up in data engineering

A table sorted by two keys that rise together, such as a grid of time buckets against cumulative counts, has this shape, and the staircase walk is also the core of counting how many cells fall below a threshold in a sorted matrix. The same "discard a whole row or column per comparison" reasoning helps when merging or joining two sorted inputs.

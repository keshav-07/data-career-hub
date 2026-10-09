---
title: "Sudoku Solver: Backtracking with Constraint Sets and Smart Cell Choice"
seoTitle: "Sudoku Solver: Backtracking with Bitmasks"
description: "Fill a 9 by 9 Sudoku so every row, column and box holds 1 to 9 once. Backtrack over empty cells, track used digits in bitmasks, and branch on the tightest cell."
technology: ["dsa"]
topic: ["backtracking", "bit-manipulation"]
difficulty: "Hard"
questionType: ["coding"]
estimatedMinutes: 30
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Backtracking: pick an empty cell, try each digit that does not already appear in its row, column or 3 by 3 box, recurse, and undo the placement if the recursion fails. Make the validity check O(1) by keeping a bitmask of used digits for each row, column and box, and speed the search up enormously by always branching on the empty cell with the fewest candidates, which also detects dead ends at once (zero candidates). The worst case is still exponential, but on a fixed 9 by 9 board real puzzles solve in milliseconds. Remember to undo all three masks on backtrack."
followUps: ["Why does choosing the cell with the fewest candidates help so much?", "How would you check that a puzzle has exactly one solution?", "How would you add constraint propagation, such as filling cells with a single candidate before branching?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/backtracking"]
practice: {"platform": "LeetCode", "number": 37, "title": "Sudoku Solver", "url": "https://leetcode.com/problems/sudoku-solver/"}
previous: "interview-questions:dsa/n-queens"
next: "interview-questions:dsa/find-if-path-exists-in-graph"
---

## Problem

You get a 9 by 9 board as a list of lists of single characters: `"1"` to `"9"` for given digits and `"."` for empty
cells. Fill the empty cells in place so that each row, each column and each of the nine 3 by 3 boxes contains every
digit from 1 to 9 exactly once. The puzzle is guaranteed to have a solution, and the given digits must not change.

This is LeetCode 37, Sudoku Solver. Checking a partly filled board without solving it is
[Valid Sudoku](/interview/dsa/valid-sudoku/); placing pieces under constraints with undo is the same shape as
[N-Queens](/interview/dsa/n-queens/).

## Examples

```text
input (. = empty)         one valid completion
3 . 7 | . 2 6 | . . .     each row, column and box of the result
. 4 . | 3 1 . | 2 . 9     contains 1 to 9 once, and every given
9 . 6 | 8 4 5 | 1 . 3     digit stays where it was
------+-------+------
. . . | . 5 . | . . 1
. . 9 | . 7 . | . . 2
. . . | 2 . . | . 9 .
------+-------+------
. . 4 | 6 . . | . . .
. . . | . . . | . . 7
. . . | . 8 4 | . . 6
```

The tests below check the property rather than one fixed answer, because a sparse board can have more than one
completion.

## Approach 1: brute force (plain backtracking)

Scan for the first empty cell in reading order. Try digits 1 to 9; for each, scan its row, column and box to see
whether it is allowed. Place it, recurse, and clear the cell if the recursion fails. If no digit works, return
false so the caller tries its next digit.

```python
def allowed(board, r, c, d):
    br, bc = 3 * (r // 3), 3 * (c // 3)
    for i in range(9):
        if board[r][i] == d or board[i][c] == d or board[br + i // 3][bc + i % 3] == d:
            return False
    return True

def solve_sudoku_naive(board):
    for r in range(9):
        for c in range(9):
            if board[r][c] == ".":
                for d in "123456789":
                    if allowed(board, r, c, d):
                        board[r][c] = d
                        if solve_sudoku_naive(board):
                            return True
                        board[r][c] = "."
                return False
    return True
```

**Complexity:** up to 9^m placements for `m` empty cells, each checked in O(9) time. It is exponential, but the
board is fixed at 81 cells, so typical puzzles still finish; adversarial ones can take a long time.

## Approach 2: optimal (bitmask constraints and fewest-candidates-first)

Two changes make the search fast in practice.

1. **O(1) checks.** Keep one 9-bit mask per row, column and box, where bit `d - 1` is set if digit `d` is used.
   The digits still available for a cell are the bits missing from all three masks.
2. **Branch on the tightest cell.** Instead of the next empty cell in reading order, choose the empty cell with the
   fewest available digits. A cell with one candidate is filled without guessing; a cell with zero means the current
   path is dead, so the search backs off immediately instead of discovering it many levels later.

```python
def solve_sudoku(board):
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    empty = []
    for r in range(9):
        for c in range(9):
            if board[r][c] == ".":
                empty.append((r, c))
            else:
                bit = 1 << (int(board[r][c]) - 1)
                b = (r // 3) * 3 + c // 3
                if rows[r] & bit or cols[c] & bit or boxes[b] & bit:
                    return False                      # givens already conflict
                rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit

    def search():
        if not empty:
            return True
        best_i, best_free, best_count = -1, 0, 10
        for i, (r, c) in enumerate(empty):
            free = ~(rows[r] | cols[c] | boxes[(r // 3) * 3 + c // 3]) & 0x1FF
            count = bin(free).count("1")
            if count < best_count:
                best_i, best_free, best_count = i, free, count
                if count <= 1:
                    break
        if best_count == 0:
            return False
        r, c = empty[best_i]
        empty[best_i] = empty[-1]
        empty.pop()
        b = (r // 3) * 3 + c // 3
        free = best_free
        while free:
            bit = free & -free                        # lowest available digit
            free ^= bit
            rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit
            board[r][c] = str(bit.bit_length())
            if search():
                return True
            rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit
        board[r][c] = "."
        empty.append((r, c))
        empty[best_i], empty[-1] = empty[-1], empty[best_i]
        return False

    return search()
```

**Why it is correct:** the masks always describe exactly the digits on the board, because every placement sets three
bits and every undo clears the same three. A digit is placed only when it is absent from its row, column and box, so
every full board reached is valid. The search tries every candidate of the chosen cell before giving up, so if a
solution exists below the current state it is found. Restoring the `empty` list to its previous order on failure
keeps the caller's view consistent.

**Complexity:** still exponential in the worst case, since Sudoku generalised to n^2 by n^2 boards is NP-complete,
but each step is O(m) to choose the cell plus O(1) per check, and the fewest-candidates rule cuts the tree so much
that ordinary puzzles need very few guesses. Extra space is O(m) for the empty list and the recursion depth.

## Tests

```python
import copy

def is_solution(original, board):
    for r in range(9):
        for c in range(9):
            if original[r][c] != "." and original[r][c] != board[r][c]:
                return False                          # a given changed
    digits = set("123456789")
    for i in range(9):
        if set(board[i]) != digits or {board[r][i] for r in range(9)} != digits:
            return False
        br, bc = 3 * (i // 3), 3 * (i % 3)
        if {board[br + k // 3][bc + k % 3] for k in range(9)} != digits:
            return False
    return True

puzzle = [list(row) for row in [
    "3.7.26...", ".4.31.2.9", "9.68451.3",
    "....5...1", "..9.7...2", "...2...9.",
    "..46.....", "........7", "....84..6",
]]
for solver in (solve_sudoku, solve_sudoku_naive):
    board = copy.deepcopy(puzzle)
    assert solver(board) is True
    assert is_solution(puzzle, board)

    blank = [["."] * 9 for _ in range(9)]            # empty board: any valid grid
    assert solver(blank) is True and is_solution([["."] * 9 for _ in range(9)], blank)

    one_gap = copy.deepcopy(board)                    # solved board with one hole
    hole = one_gap[4][4]
    one_gap[4][4] = "."
    assert solver(one_gap) is True and one_gap[4][4] == hole

    stuck = [["."] * 9 for _ in range(9)]
    stuck[0][1:] = list("12345678")                   # cell (0, 0) must be 9 ...
    stuck[5][0] = "9"                                 # ... but column 0 already has a 9
    assert solver(stuck) is False

clash = copy.deepcopy(puzzle)
clash[0][1] = "3"                                     # two 3s in row 0
assert solve_sudoku(clash) is False
```

## Edge cases and pitfalls

- Undo every piece of state on backtrack: the cell, and the row, column and box masks. Forgetting one mask makes
  later branches think a digit is still used.
- The box index is `(r // 3) * 3 + c // 3`. Using `r // 3 + c // 3` maps different boxes to the same index.
- LeetCode wants the board modified in place and nothing returned; returning a new board does not count. The
  boolean return here is for the recursion and the tests.
- Plain recursion depth is at most the number of empty cells (81), so Python's recursion limit is not an issue.
- Validate the givens if the input is untrusted. A board whose clues conflict has no solution, and the naive solver
  only finds that out after a long search.

## Where this shows up in data engineering

Sudoku is a small constraint satisfaction problem, and the same ideas drive real schedulers: assigning jobs to time
slots and workers under capacity and dependency rules, or allocating shards to nodes so that no two replicas share a
rack. Practical systems hand these to constraint or integer programming solvers, which build on the same core
ideas: propagate constraints cheaply, branch on the most constrained choice, and back off as soon as a choice is
impossible.

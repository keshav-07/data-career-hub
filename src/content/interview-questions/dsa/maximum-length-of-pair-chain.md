---
title: "Maximum Length of Pair Chain: Greedy by Earliest End"
seoTitle: "Maximum Length of Pair Chain: Greedy by End"
description: "Find the longest chain of pairs where each pair starts after the previous one ends. Sorting by end and picking greedily beats the O(n²) DP with O(n log n)."
technology: ["dsa"]
topic: ["greedy", "intervals", "dynamic-programming"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the pairs by their second value. Walk through them keeping the end of the last pair you chose; take a pair whenever its first value is strictly greater than that end. Choosing the pair that finishes earliest always leaves the most room for the rest, so the greedy is optimal. O(n log n) time, O(1) extra space after sorting. An O(n²) DP over pairs sorted by start also works and is a good stepping stone. Watch the strict comparison: touching pairs do not chain."
followUps: ["Prove that choosing the earliest-ending pair first is safe.", "How would you return the chain itself, not just its length?", "How is this related to Non-overlapping Intervals?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/non-overlapping-intervals", "interview-questions:dsa/longest-increasing-subsequence", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "LeetCode", "number": 646, "title": "Maximum Length of Pair Chain", "url": "https://leetcode.com/problems/maximum-length-of-pair-chain/"}
previous: "interview-questions:dsa/valid-parenthesis-string"
next: "interview-questions:dsa/minimum-add-to-make-parentheses-valid"
---

## Problem

You get n pairs `[left, right]` with `left < right`. Pair `q` can follow pair `p` in a chain when `q.left > p.right` (strictly). You may pick pairs in any order and skip any of them. Return the length of the longest chain you can build. This is LeetCode 646, Maximum Length of Pair Chain.

## Examples

```text
[[1, 2], [3, 4], [2, 3]]           ->  2   ([1, 2] -> [3, 4]; [2, 3] touches both)
[[1, 2], [7, 8], [4, 5]]           ->  3
[[1, 10], [2, 3], [4, 5], [6, 7]]  ->  3   (skip the long pair)
[[5, 6]]                           ->  1
```

## Approach 1: dynamic programming

Sort by left value. `best[i]` is the longest chain ending with pair `i`: one, or one more than the best chain ending at any earlier pair `j` with `pairs[j].right < pairs[i].left`. This is the longest-increasing-subsequence pattern.

```python
def chain_dp(pairs):
    ps = sorted(pairs)
    best = [1] * len(ps)
    for i in range(len(ps)):
        for j in range(i):
            if ps[j][1] < ps[i][0]:
                best[i] = max(best[i], best[j] + 1)
    return max(best, default=0)
```

**Complexity:** O(n²) time, O(n) space.

## Approach 2: optimal (greedy by earliest end)

Think of each pair as a meeting and the chain as a set of meetings one person can attend. To fit the most, always take the meeting that finishes first among those still possible: finishing early never blocks anything that finishing later would allow.

```python
def chain_greedy(pairs):
    count = 0
    last_end = float("-inf")
    for left, right in sorted(pairs, key=lambda p: p[1]):
        if left > last_end:
            count += 1
            last_end = right
    return count
```

**Why it is correct:** take any optimal chain and compare its first pair with the greedy's first pair, which has the smallest right value overall. Replacing the optimal chain's first pair with the greedy one keeps the chain valid, because its end is no later. Repeat the argument on the remaining pairs that start after that end; the greedy never falls behind, so its chain is as long as the optimal one.

**Complexity:** O(n log n) for the sort, O(1) extra space for the scan.

## Tests

```python
import random
from itertools import combinations

def chain_brute(pairs):
    for size in range(len(pairs), 0, -1):
        for combo in combinations(sorted(pairs, key=lambda p: p[1]), size):
            if all(b[0] > a[1] for a, b in zip(combo, combo[1:])):
                return size
    return 0

for f in (chain_greedy, chain_dp, chain_brute):
    assert f([[1, 2], [3, 4], [2, 3]]) == 2
    assert f([[1, 2], [7, 8], [4, 5]]) == 3
    assert f([[1, 10], [2, 3], [4, 5], [6, 7]]) == 3
    assert f([[5, 6]]) == 1
    assert f([]) == 0
    assert f([[1, 2], [2, 3], [3, 4]]) == 2       # touching pairs do not chain
    assert f([[-5, -1], [0, 2], [-3, 4]]) == 2    # negatives

random.seed(12)
for _ in range(300):
    ps = []
    for _ in range(random.randint(0, 7)):
        a = random.randint(-8, 8)
        ps.append([a, a + random.randint(1, 5)])
    expected = chain_brute(ps)
    assert chain_greedy(ps) == expected
    assert chain_dp(ps) == expected
print("ok")
```

## Edge cases and pitfalls

- Sorting by left value and taking greedily is wrong: `[[1, 10], [2, 3], [4, 5]]` would take `[1, 10]` first and stop at 1.
- The comparison is strict (`left > last_end`); pairs that share an endpoint cannot follow each other.
- Start `last_end` at negative infinity, not 0, because values can be negative.
- The pairs may be used in any order, so sorting the input is allowed; it is not a subsequence problem in the original order.

## Where this shows up in data engineering

This is interval scheduling: choose the largest set of non-overlapping jobs, maintenance windows or bookings for one resource. A scheduler that has to fit as many batch jobs as possible onto one exclusive slot (a single-writer table, a licence seat) uses exactly this earliest-finish rule, and the same reasoning tells you how many intervals to drop to remove all overlaps.

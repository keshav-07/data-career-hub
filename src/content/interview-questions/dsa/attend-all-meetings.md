---
title: "Meeting Rooms: Check Whether One Person Can Attend Every Meeting"
seoTitle: "Meeting Rooms: Can You Attend All Meetings?"
description: "Decide whether a list of meetings has any overlap. Sort by start time and compare each meeting with the previous one for an O(n log n) check."
technology: ["dsa"]
topic: ["intervals", "greedy"]
difficulty: "Easy"
questionType: ["coding"]
estimatedMinutes: 8
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the meetings by start time. After sorting, two meetings can only clash if they are neighbours, so walk the list once and return False as soon as a meeting starts before the previous one ends. A meeting that starts exactly when the previous one ends is fine. Sorting dominates: O(n log n) time, O(n) space for the sorted copy (or O(1) extra if you sort in place)."
followUps: ["How many rooms would you need if meetings could run in parallel?", "How would you answer the question for a stream of meetings arriving one at a time?", "What changes if a meeting ending at 10 and another starting at 10 count as a clash?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/greedy-and-intervals"]
practice: {"platform": "GeeksforGeeks", "title": "Meeting Rooms", "url": "https://www.geeksforgeeks.org/problems/attend-all-meetings/1"}
---

## Problem

You are given a list of meetings, each a pair `[start, end]` with `start < end`. One person wants to attend all of them and can only be in one meeting at a time. Return `True` if that is possible and `False` otherwise. A meeting may start at the exact moment the previous one ends. This is GeeksforGeeks: Meeting Rooms (also known as LeetCode 252, which is subscription-only).

## Examples

```text
[[9, 10], [11, 12], [10, 11]]   ->  True    (back-to-back meetings are allowed)
[[1, 5], [4, 6]]                ->  False   (4 is before 5)
[[2, 8], [3, 4]]                ->  False   (one meeting sits inside another)
[]                              ->  True
```

## Approach 1: brute force

Compare every pair of meetings. Two half-open intervals `[a, b)` and `[c, d)` overlap exactly when `a < d` and `c < b`.

```python
def can_attend_brute(meetings):
    n = len(meetings)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = meetings[i]
            c, d = meetings[j]
            if a < d and c < b:
                return False
    return True
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (sort and compare neighbours)

Put the meetings in order of start time. If meeting `i` overlaps any later meeting, it overlaps meeting `i + 1` in particular, because `i + 1` starts earliest among them. So you only need to check adjacent pairs: each meeting must start no earlier than the previous one ends.

```python
def can_attend(meetings):
    ordered = sorted(meetings)
    for prev, cur in zip(ordered, ordered[1:]):
        if cur[0] < prev[1]:
            return False
    return True
```

**Why it is correct:** suppose meetings `p` and `q` overlap, with `p` before `q` in sorted order. Every meeting between them starts at or after `p` starts and at or before `q` starts, which is before `p` ends. So the meeting right after `p` starts before `p` ends, and the adjacent check catches it.

**Complexity:** O(n log n) time for the sort, O(n) space for the sorted copy.

## Tests

```python
import random

for f in (can_attend, can_attend_brute):
    assert f([[9, 10], [11, 12], [10, 11]]) is True
    assert f([[1, 5], [4, 6]]) is False
    assert f([[2, 8], [3, 4]]) is False       # contained
    assert f([]) is True                      # empty
    assert f([[3, 7]]) is True                # single
    assert f([[1, 2], [1, 2]]) is False       # identical meetings
    assert f([[5, 6], [1, 5]]) is True        # touching, unsorted input

random.seed(3)
for _ in range(400):
    ms = []
    for _ in range(random.randint(0, 6)):
        s = random.randint(0, 20)
        ms.append([s, s + random.randint(1, 5)])
    assert can_attend(ms) == can_attend_brute(ms)
print("ok")
```

## Edge cases and pitfalls

- Use `<`, not `<=`, when comparing a start with the previous end, or back-to-back meetings are wrongly rejected. Confirm the boundary rule with the interviewer.
- Sort by start, not by end. Sorting by end also works for this yes/no question, but sorting by start is the habit that carries over to merging and room counting.
- An empty list or a single meeting is always attendable.
- `sorted` leaves the caller's list untouched; `list.sort()` would reorder it.

## Where this shows up in data engineering

The same neighbour check validates that a table of time ranges has no overlaps: slowly changing dimension rows for one key, a job's scheduled maintenance windows, or the booking periods of one resource. In SQL you sort with `LAG(end_ts) OVER (PARTITION BY key ORDER BY start_ts)` and flag any row whose start is earlier than the previous end, which makes a cheap data-quality test.

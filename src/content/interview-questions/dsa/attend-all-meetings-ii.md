---
title: "Meeting Rooms II: Count the Rooms with a Min-Heap or a Sweep Line"
seoTitle: "Meeting Rooms II: Min-Heap and Sweep Line"
description: "Find the fewest rooms that can host every meeting. A min-heap of end times or a sweep over sorted starts and ends finds the peak overlap in O(n log n)."
technology: ["dsa"]
topic: ["intervals", "heaps-priority-queues", "greedy"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "The answer is the largest number of meetings running at the same moment. Sort meetings by start and keep a min-heap of end times for rooms in use: if the earliest-ending room is free by the time the next meeting starts, reuse it (pop), then push the new end. The heap's largest size is the answer. Alternatively, sort starts and ends separately and sweep with two pointers, adding one at each start and subtracting one at each end, processing an end before a start at the same time. Both are O(n log n) time and O(n) space."
followUps: ["Return which room each meeting is assigned to, not just the count.", "How would you answer this when meetings arrive as a stream?", "What changes if a room needs ten minutes of cleaning between meetings?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/attend-all-meetings", "interview-questions:dsa/merge-intervals", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "GeeksforGeeks", "title": "Meeting Rooms II", "url": "https://www.geeksforgeeks.org/problems/attend-all-meetings-ii/1"}
previous: "interview-questions:dsa/interval-list-intersections"
next: "interview-questions:dsa/my-calendar-i"
---

## Problem

You are given n meetings, each with a start time and an end time (some versions pass all starts and all ends as two separate arrays). A room can host one meeting at a time, and a meeting that starts exactly when another ends may use the same room. Return the minimum number of rooms needed so every meeting gets a room. This is GeeksforGeeks: Meeting Rooms II (also known as LeetCode 253, which is subscription-only).

## Examples

```text
[[0, 30], [5, 10], [15, 20]]   ->  2   ([5, 10] and [15, 20] share a room)
[[1, 4], [4, 6], [6, 9]]       ->  1   (back to back)
[[1, 5], [2, 6], [3, 7]]       ->  3   (all three overlap at time 3)
[]                             ->  0
```

## Approach 1: brute force (count at every start)

The number of rooms needed is the largest number of meetings in progress at any moment, and that maximum is always reached at some meeting's start. So for each start time, count how many meetings contain it.

```python
def rooms_brute(meetings):
    best = 0
    for t, _ in meetings:
        live = sum(1 for s, e in meetings if s <= t < e)
        best = max(best, live)
    return best
```

**Complexity:** O(n²) time, O(1) extra space.

## Approach 2: optimal (min-heap of end times)

Process meetings in start order and simulate the rooms. The heap holds the end time of every room currently booked. Before placing a meeting, check the room that frees up earliest: if it is free by this start, reuse it by popping its end time. Then push the new meeting's end. The heap never shrinks below the number of overlapping meetings, and its peak size is the answer.

```python
import heapq

def rooms_heap(meetings):
    ends = []
    best = 0
    for start, end in sorted(meetings):
        if ends and ends[0] <= start:
            heapq.heappop(ends)
        heapq.heappush(ends, end)
        best = max(best, len(ends))
    return best
```

**Complexity:** O(n log n) time, O(n) space.

## Approach 3: sweep over sorted starts and ends

You do not need to know which meeting ends, only when. Sort starts and ends separately and merge them like two sorted lists: each start adds a room in use, each end releases one. On a tie, take the end first so a back-to-back meeting reuses the room.

```python
def rooms_sweep(meetings):
    starts = sorted(s for s, _ in meetings)
    ends = sorted(e for _, e in meetings)
    in_use = best = 0
    j = 0
    for s in starts:
        while j < len(ends) and ends[j] <= s:
            in_use -= 1
            j += 1
        in_use += 1
        best = max(best, in_use)
    return best
```

**Why it is correct:** at any moment the rooms in use equal the meetings that have started but not ended, which is exactly what the counter tracks. A lower bound of "peak overlap" holds for any schedule, and the greedy reuse in the heap version achieves it, so the two agree.

**Complexity:** O(n log n) for the two sorts, O(n) space.

## Tests

```python
import random

cases = [
    ([[0, 30], [5, 10], [15, 20]], 2),
    ([[1, 4], [4, 6], [6, 9]], 1),
    ([[1, 5], [2, 6], [3, 7]], 3),
    ([], 0),
    ([[2, 3]], 1),
    ([[1, 10], [1, 10], [1, 10]], 3),          # identical meetings
    ([[9, 12], [1, 3], [2, 9], [3, 4]], 2),     # unsorted input
]
for f in (rooms_heap, rooms_sweep, rooms_brute):
    for ms, expected in cases:
        assert f(ms) == expected, (f.__name__, ms)

random.seed(16)
for _ in range(500):
    ms = []
    for _ in range(random.randint(0, 8)):
        s = random.randint(0, 15)
        ms.append([s, s + random.randint(1, 6)])
    expected = rooms_brute(ms)
    assert rooms_heap(ms) == expected
    assert rooms_sweep(ms) == expected
print("ok")
```

## Edge cases and pitfalls

- Decide the boundary rule first. With "a room is free at its end time", compare with `<=`; if touching meetings must use different rooms, use `<` and confirm with the interviewer.
- In the sweep, handle ends before starts at the same timestamp, otherwise back-to-back meetings are double counted.
- In the heap version, pop at most one room per meeting. Popping every finished room also gives the right peak, but the single pop keeps the heap equal to "rooms opened so far", which is what you need if you later assign room numbers.
- Merging overlapping meetings and counting the groups answers a different question (how many busy periods), not how many rooms.

## Where this shows up in data engineering

Peak concurrency is a capacity question: how many worker slots a set of scheduled jobs needs, the maximum number of simultaneous database connections from a day of session logs, or how many executors run at once. In SQL the sweep is a `UNION ALL` of +1 at each start and −1 at each end, a running `SUM` ordered by time (ends first on ties), and a `MAX` over the result.

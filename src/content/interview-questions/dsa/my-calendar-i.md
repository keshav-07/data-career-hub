---
title: "My Calendar I: Accept Bookings Only When They Do Not Overlap"
seoTitle: "My Calendar I: Overlap Checks with Bisect"
description: "Design a calendar that accepts a half-open booking only if it overlaps no earlier booking. Compare a linear scan with a sorted list searched by binary search."
technology: ["dsa"]
topic: ["intervals", "binary-search", "design"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Two half-open intervals [s1, e1) and [s2, e2) overlap exactly when s1 < e2 and s2 < e1. The simplest calendar keeps every accepted booking in a list and checks the new one against all of them: O(n) per call. Better: keep bookings sorted by start. Binary-search the position where the new start would go; only the booking just before it and the one at it can clash, so two comparisons decide. With a balanced tree that is O(log n) per booking; with a Python list and bisect the search is O(log n) but the insertion shifts elements, O(n) in the worst case."
followUps: ["How would you allow double bookings but reject triple bookings (My Calendar II)?", "Which data structure gives O(log n) insertion as well as search, and what does Python offer?", "How would you make the calendar safe under concurrent bookings?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/attend-all-meetings", "interview-questions:dsa/insert-interval", "articles:dsa/greedy-and-intervals"]
practice: {"platform": "LeetCode", "number": 729, "title": "My Calendar I", "url": "https://leetcode.com/problems/my-calendar-i/"}
previous: "interview-questions:dsa/attend-all-meetings-ii"
next: "interview-questions:dsa/generate-parentheses"
---

## Problem

Design a calendar object with one method, `book(start, end)`, describing the half-open interval `[start, end)` (it includes `start` but not `end`). If the interval overlaps any booking accepted earlier, reject it and return `False`; otherwise store it and return `True`. Bookings that only touch, such as `[10, 20)` followed by `[20, 30)`, do not overlap. This is LeetCode 729, My Calendar I.

## Examples

```text
book(10, 20)  ->  True
book(15, 25)  ->  False   (15 is inside [10, 20))
book(20, 30)  ->  True    (touches, does not overlap)
book(5, 10)   ->  True
book(5, 15)   ->  False   (rejected bookings are not stored)
```

## Approach 1: brute force (check every booking)

Keep a plain list. A new booking is accepted only if it overlaps none of the stored ones.

```python
class CalendarList:
    def __init__(self):
        self.bookings = []

    def book(self, start, end):
        for s, e in self.bookings:
            if start < e and s < end:
                return False
        self.bookings.append((start, end))
        return True
```

**Complexity:** O(n) per booking, O(n²) for n bookings; O(n) space.

## Approach 2: optimal (sorted bookings plus binary search)

Accepted bookings never overlap, so when they are sorted by start they are also sorted by end. A new booking `[start, end)` can only clash with its neighbours in that order: the last booking that starts before `start` (it must end by `start`) and the first booking that starts at or after `start` (it must start at or after `end`). Find that position with `bisect` and check those two.

```python
from bisect import bisect_left

class CalendarSorted:
    def __init__(self):
        self.starts = []
        self.ends = []

    def book(self, start, end):
        i = bisect_left(self.starts, start)
        if i > 0 and self.ends[i - 1] > start:
            return False
        if i < len(self.starts) and self.starts[i] < end:
            return False
        self.starts.insert(i, start)
        self.ends.insert(i, end)
        return True
```

**Why it is correct:** every stored booking before position `i` starts before `start`, and because the bookings are disjoint and sorted, the one at `i - 1` has the latest end among them; if it ends by `start`, all of them do. Every booking from `i` onwards starts no earlier than the one at `i`; if that one starts at or after `end`, all of them do. So the two checks cover every stored booking.

**Complexity:** O(log n) to find the position. Python list insertion shifts elements, so a booking is O(n) in the worst case, though the shift is a fast memory move. A balanced binary search tree (a `TreeMap` in Java, or `SortedList` from the third-party `sortedcontainers` package in Python) gives O(log n) for both steps.

## Tests

```python
import random

for cls in (CalendarList, CalendarSorted):
    cal = cls()
    assert cal.book(10, 20) is True
    assert cal.book(15, 25) is False
    assert cal.book(20, 30) is True        # touching is fine
    assert cal.book(5, 10) is True
    assert cal.book(5, 15) is False
    assert cal.book(0, 100) is False       # covers existing bookings
    assert cal.book(12, 13) is False       # inside an existing booking
    assert cal.book(30, 31) is True

random.seed(17)
for _ in range(300):
    a, b = CalendarList(), CalendarSorted()
    for _ in range(random.randint(0, 25)):
        s = random.randint(0, 40)
        e = s + random.randint(1, 8)
        assert a.book(s, e) == b.book(s, e)
print("ok")
```

## Edge cases and pitfalls

- The intervals are half-open, so the overlap test uses strict `<` on both sides. Using `<=` would reject back-to-back bookings.
- Do not store rejected bookings; later checks must only see accepted ones.
- A new booking can swallow an existing one entirely (`[0, 100)` around `[10, 20)`). Checking only whether `start` or `end` falls inside a stored booking misses this case; the two-condition test does not.
- In the sorted version, use the neighbour at `i - 1` for the "ends after my start" check and the one at `i` for the "starts before my end" check; mixing them up passes simple tests and fails on adjacent bookings.

## Where this shows up in data engineering

This is the core of any reservation or locking check: booking an exclusive maintenance window, reserving a cluster for a time slot, or making sure two loads do not claim overlapping partitions of a time range. In a database the same rule is enforced with a range overlap test (`new_start < end_ts AND start_ts < new_end`), and PostgreSQL can enforce it declaratively with an exclusion constraint on a range column, which also handles concurrent inserts.

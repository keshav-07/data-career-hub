---
title: "Maximum Frequency Stack: Pop the Most Frequent Value in O(1)"
seoTitle: "Maximum Frequency Stack: O(1) Push and Pop"
description: "Design a stack whose pop removes the most frequent value, breaking ties by recency. Compare a heap with timestamps to O(1) stacks grouped by frequency level."
technology: ["dsa"]
topic: ["heaps-priority-queues", "stack", "design"]
difficulty: "Hard"
questionType: ["coding", "architecture"]
estimatedMinutes: 25
interviewRelevance: "Medium"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Keep a count per value and, for each frequency f, a stack of the values that reached f, in push order. Push x: increment its count to f, append x to the stack for f, and raise the maximum frequency if needed. Pop: take the top of the stack for the maximum frequency, decrement that value's count, and lower the maximum if the stack is now empty. A value with count 3 sits in the stacks for 1, 2 and 3, so popping it from level 3 leaves the right state below. Both operations are O(1). A heap of (-frequency, -time, value) also works in O(log n)."
followUps: ["Why does a value appear in several frequency stacks, and why is that correct?", "How would you support a peek without popping?", "How would you add a remove(x) operation?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/min-stack", "interview-questions:dsa/lru-cache", "articles:dsa/heaps-priority-queues"]
practice: {"platform": "LeetCode", "number": 895, "title": "Maximum Frequency Stack", "url": "https://leetcode.com/problems/maximum-frequency-stack/"}
previous: "interview-questions:dsa/reorganize-string"
next: "interview-questions:dsa/maximum-sum-combination"
---

## Problem

Design a stack-like class with two operations. `push(x)` adds an integer. `pop()` removes and returns the value that currently occurs most often in the structure; if several values share that highest count, it returns the one among them that was pushed most recently. `pop` is only called when the structure is non-empty. This is LeetCode 895, Maximum Frequency Stack.

## Examples

```text
push 5, push 7, push 5, push 7, push 4, push 5
pop  ->  5    (5 occurs three times)
pop  ->  7    (5 and 7 both occur twice; 7 was pushed more recently)
pop  ->  5    (now 5 occurs twice and 7 once)
pop  ->  4    (5, 7 and 4 all occur once; 4 was pushed last)
```

## Approach 1: brute force (scan on every pop)

Keep the raw push history in a list. On pop, count every value, find the highest count, and remove the latest occurrence of a value with that count.

```python
from collections import Counter

class FreqStackScan:
    def __init__(self):
        self.items = []

    def push(self, val):
        self.items.append(val)

    def pop(self):
        counts = Counter(self.items)
        top = max(counts.values())
        for i in range(len(self.items) - 1, -1, -1):
            if counts[self.items[i]] == top:
                return self.items.pop(i)
```

**Complexity:** O(1) push, O(n) pop; O(n) space.

## Approach 2: heap with timestamps

Give each push a sequence number and push `(-frequency_after_push, -sequence, value)` into a heap. The top is always the value with the highest frequency, latest push first. On pop, decrement that value's count; its older heap entries already carry the lower frequencies, so nothing else needs updating.

```python
import heapq
from collections import defaultdict

class FreqStackHeap:
    def __init__(self):
        self.heap = []
        self.freq = defaultdict(int)
        self.seq = 0

    def push(self, val):
        self.freq[val] += 1
        self.seq += 1
        heapq.heappush(self.heap, (-self.freq[val], -self.seq, val))

    def pop(self):
        _, _, val = heapq.heappop(self.heap)
        self.freq[val] -= 1
        return val
```

**Complexity:** O(log n) per operation, O(n) space.

## Approach 3: optimal (a stack per frequency level)

The heap is doing more ordering than you need, because frequencies only change by one at a time. Picture levels: level f holds, in push order, every value at the moment it reached count f. The value to pop is the top of the highest non-empty level. Popping it brings its count down from f to f − 1, and its entry at level f − 1 is still in place from an earlier push, so no other bookkeeping is required.

```python
class FreqStack:
    def __init__(self):
        self.freq = defaultdict(int)
        self.levels = defaultdict(list)
        self.max_freq = 0

    def push(self, val):
        self.freq[val] += 1
        f = self.freq[val]
        self.levels[f].append(val)
        if f > self.max_freq:
            self.max_freq = f

    def pop(self):
        val = self.levels[self.max_freq].pop()
        self.freq[val] -= 1
        if not self.levels[self.max_freq]:
            self.max_freq -= 1
        return val
```

**Why it is correct:** every value with current count c appears exactly once on each of levels 1 to c, and each level lists values in the order they reached it. The highest non-empty level is the highest count, and its top is the value that reached that count most recently, which is the most recent push among the tied values. Because counts move by one, `max_freq` only ever needs to drop by one when its level empties.

**Complexity:** O(1) for push and pop, O(n) space (one level entry per push still in the structure).

## Tests

```python
import random

for cls in (FreqStack, FreqStackHeap, FreqStackScan):
    s = cls()
    for v in (5, 7, 5, 7, 4, 5):
        s.push(v)
    assert [s.pop() for _ in range(4)] == [5, 7, 5, 4]
    t = cls()
    t.push(1)
    assert t.pop() == 1
    t.push(2); t.push(2); t.push(3)
    assert t.pop() == 2 and t.pop() == 3 and t.pop() == 2

random.seed(18)
for _ in range(200):
    stacks = [FreqStack(), FreqStackHeap(), FreqStackScan()]
    size = 0
    for _ in range(random.randint(1, 40)):
        if size and random.random() < 0.4:
            outs = {s.pop() for s in stacks}
            assert len(outs) == 1
            size -= 1
        else:
            v = random.randint(0, 4)
            for s in stacks:
                s.push(v)
            size += 1
print("ok")
```

## Edge cases and pitfalls

- Do not move a value from one level to another on push. Keeping it on every level it has reached is what makes pop O(1).
- Lower `max_freq` only when its level becomes empty, and only by one.
- Ties are broken by recency of reaching that count, which equals the most recent push among tied values; a separate global timestamp is unnecessary in the level version.
- Negative or repeated values need no special handling; the dictionaries key on the value itself.

## Where this shows up in data engineering

Frequency-ordered structures sit behind caches and hot-key detection: deciding which key is hottest right now, or which item to evict under a least-frequently-used policy with recency as a tie-breaker. The "bucket per frequency level" trick is the same one used to build O(1) LFU caches, and it is a good example of replacing a heap with buckets when the priority only ever changes by one step.

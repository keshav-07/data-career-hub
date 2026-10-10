---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is at-least-once delivery and what problems can it create?"
seoTitle: "At-Least-Once Delivery in Kafka: Interview Answer"
description: "Interview answer: Kafka at-least-once delivery loses no messages but may process some twice after failures, so consumers and sinks must be idempotent."
inventoryId: "INT-23"
technology: ["kafka", "data-engineering"]
topic: ["delivery-semantics"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "At-least-once delivery guarantees that every message is processed, but a message may be processed more than once. In Kafka it typically comes from processing a record and then committing its offset: if the consumer crashes after processing but before committing, it reprocesses that record on restart. The problem is duplicates, such as double-counted metrics or repeated side effects, so the processing and the sink must be idempotent, for example by upserting on a unique event id."
followUps: ["How is at-most-once different?", "What does Kafka's exactly-once guarantee cover, and what doesn't it?", "How would you deduplicate in a streaming job?"]
related: ["articles:kafka/consumers-offsets", "articles:kafka/delivery-semantics-exactly-once", "interview-questions:kafka/exactly-once-semantics", "interview-questions:kafka/partitions-and-consumer-groups", "interview-questions:data-engineering/idempotent-batch-pipeline"]
versionContext: "Applies to Apache Kafka 4.x clients. The example runs on plain Python 3.11 with SQLite."
---

## Detailed explanation

```text
poll → process → write to sink → commit offset
                              ↑ crash here → record is processed again after restart
```

Duplicates also arise from producer retries (mitigated by idempotent producers, enabled by default in modern Kafka clients) and from rebalances.

## Example

A crash after the sink write but before the offset commit redelivers the batch. An append-only sink double-counts; an upsert keyed by the event ID does not:

```python
import sqlite3

batch = [("evt-1", 30), ("evt-2", 45)]
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE payments_append (event_id TEXT, amount INT)")
db.execute("CREATE TABLE payments_upsert (event_id TEXT PRIMARY KEY, amount INT)")

for delivery in (1, 2):                      # delivery 2 = redelivery after the crash
    db.executemany("INSERT INTO payments_append VALUES (?, ?)", batch)
    db.executemany("INSERT INTO payments_upsert VALUES (?, ?) "
                   "ON CONFLICT (event_id) DO UPDATE SET amount = excluded.amount", batch)

for table in ("payments_append", "payments_upsert"):
    rows, total = db.execute(f"SELECT COUNT(*), SUM(amount) FROM {table}").fetchone()
    print(f"{table}: {rows} rows, total {total}")
```

```text
payments_append: 4 rows, total 150
payments_upsert: 2 rows, total 75
```

## Making duplicates harmless

- **Idempotent writes**: upsert or `MERGE` on a unique event id.
- **Deduplication**: keep a record of processed ids within a time window (streaming engines support watermark-bounded dedup).
- **Side effects**: record that an email or payment was sent, keyed by event id, before sending again.

## Trade-offs

- At-least-once costs duplicates; at-most-once (commit before processing) costs loss. For data pipelines, duplicates are usually the fixable problem.
- Kafka transactions remove duplicates only for Kafka-to-Kafka processing; they add latency and do not reach external sinks.
- Committing more often shrinks the window of reprocessed records but adds commit overhead; idempotent sinks make the window harmless anyway.

## Common mistakes

1. Using auto-commit and assuming it gives exactly-once.
2. Believing Kafka transactions make writes to an external database exactly-once.
3. Counting events in a sink that appends blindly.

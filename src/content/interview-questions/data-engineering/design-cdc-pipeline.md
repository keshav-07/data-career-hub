---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "How would you design a CDC pipeline?"
seoTitle: "Designing a CDC Pipeline: Interview Answer"
description: "Interview answer: design a CDC pipeline that reads the database log, publishes keyed events, applies them in order with MERGE, and handles snapshots, deletes."
inventoryId: "INT-29"
technology: ["data-engineering", "kafka"]
topic: ["cdc", "architecture"]
difficulty: "Hard"
questionType: ["architecture", "scenario"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "I would use log-based change data capture: a connector reads the database's transaction log and publishes one event per row change, with the operation, row values and log position, to Kafka topics keyed by primary key so each row's changes stay in order. A consumer applies micro-batches to the target table with MERGE, keeping only the latest position per key and ignoring events older than what is stored, which makes replays harmless. I also plan the initial snapshot, delete handling, schema changes and monitoring of lag."
followUps: ["How do you take an initial snapshot without missing changes?", "How do you represent deletes downstream?", "What if the consumer is down longer than Kafka retention?"]
related: ["system-designs:change-data-capture-platform", "articles:kafka/topics-partitions-consumer-groups", "articles:delta-lake/transactions-schema-evolution"]
---

## Detailed explanation

Walk through the design in this order:

1. **Capture**: log-based CDC (reads the transaction log, captures deletes, adds no query load) rather than polling `updated_at` (misses deletes and intermediate changes).
2. **Transport**: Kafka topic per table, keyed by primary key, so ordering holds per row.
3. **Apply**: micro-batch `MERGE` into the target. Deduplicate to the latest log position per key; update only when the incoming position is newer.
4. **Bootstrap**: consistent snapshot plus the log position at snapshot time; stream from that position.
5. **Deletes**: hard delete, or a soft-delete flag if history is needed.
6. **Schema changes**: additive changes flow through; breaking changes pause and alert.
7. **Operations**: monitor connector lag, consumer lag and end-to-end latency; keep Kafka retention longer than the longest expected outage.

See the full [CDC system design case study](/data-engineering/system-design/change-data-capture-platform/).

## Common mistakes

1. Applying events in arrival order without comparing log positions.
2. Forgetting deletes.
3. No plan for the initial load.

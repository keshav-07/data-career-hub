---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Change Data Capture Platform"
description: "A system-design case study for change data capture: reading database changes from the log, streaming them through Kafka, and applying them reliably to a lakehouse."
inventoryId: "SYS-03"
technology: ["data-engineering", "kafka", "delta-lake"]
topic: ["cdc", "streaming", "architecture"]
difficulty: "Advanced"
problem: "Replicate inserts, updates and deletes from an operational relational database into the analytics lakehouse within minutes, without putting query load on the source database."
functionalRequirements: ["Capture inserts, updates and deletes from selected source tables", "Apply changes to analytics tables so they mirror the source", "Keep an optional history of changes for auditing", "Support adding a new table with an initial snapshot"]
nonFunctionalRequirements: ["End-to-end latency under 5 minutes in normal operation", "No lost changes; duplicates must be harmless", "Minimal load on the source database", "Recover automatically after consumer restarts"]
scaleAssumptions: ["Around 30 source tables", "Peak of roughly 5,000 changes per second", "Largest table has about 500 million rows"]
architectureSummary: "Log-based CDC reads the database transaction log and publishes change events to Kafka, keyed by primary key; a streaming job applies them to Delta tables with MERGE, ordered by source log position."
technologies: ["Log-based CDC connector", "Kafka", "Spark Structured Streaming", "Delta Lake"]
tradeoffs: [{"decision": "Log-based CDC", "alternative": "Polling with updated_at queries", "reason": "Captures deletes and every change without querying tables", "consequence": "Requires log access and connector operations"}, {"decision": "Key Kafka topics by primary key", "alternative": "Unkeyed events", "reason": "Keeps all changes for a row in order within one partition", "consequence": "Hot keys can skew partitions"}, {"decision": "MERGE with source log position", "alternative": "Blind upserts in arrival order", "reason": "Out-of-order or duplicate events cannot overwrite newer data", "consequence": "Each event must carry its log position or version"}, {"decision": "Micro-batches every minute", "alternative": "Row-by-row writes", "reason": "Fewer, larger commits keep the table healthy", "consequence": "Latency of about a minute plus processing"}]
interviewFollowUps: ["How do you take the initial snapshot without missing changes made during it?", "How do you handle a schema change in the source table?", "What happens if the consumer is down for a day?", "How do you represent deletes in the analytics table?"]
related: ["articles:kafka/topics-partitions-consumer-groups", "articles:delta-lake/transactions-schema-evolution", "interview-questions:kafka/partitions-and-consumer-groups"]
previous: "system-designs:scalable-batch-pipeline"
---

## Approach

CDC is about **correctness under reordering and duplication**. Design for at-least-once delivery and make the apply step idempotent and order-aware.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Source database</strong> writes every change to its transaction log.</li>
<li><strong>CDC connector</strong> reads the log and emits one event per row change (before/after values, operation, log position).</li>
<li><strong>Kafka</strong> stores events in one topic per table, keyed by primary key.</li>
<li><strong>Streaming job</strong> reads micro-batches, keeps the latest event per key, and applies them with <code>MERGE</code>.</li>
<li><strong>Lakehouse tables</strong> mirror the source; an optional history table keeps every event.</li>
</ol>
<figcaption>Changes flow from the database log to Kafka to the lakehouse; ordering is preserved per primary key.</figcaption>
</figure>

## Data flow details

Each event carries the **operation** (insert, update, delete), the **row values** and a **monotonic position** from the source log. Within a micro-batch, deduplicate to the latest position per key, then `MERGE`: update when the incoming position is newer than the stored one, insert when the key is new, and delete (or mark deleted) for delete events.

## Initial snapshot

For a new table, take a consistent snapshot and record the log position at which it was taken. Start streaming from that position. Events from before the snapshot are ignored by the position check, so nothing is missed or applied twice.

## Reliability

- The consumer commits Kafka offsets only after the Delta commit succeeds (at-least-once).
- Because the apply step compares positions, replayed events are harmless.
- Kafka retention must exceed the longest expected outage, or recovery requires a new snapshot.

## Schema changes

Additive columns can flow through with controlled schema evolution. Breaking changes (renames, type changes) should pause the table's pipeline and alert, rather than silently corrupt data.

## Observability

Monitor connector lag (source log position versus captured position), consumer lag per partition, merge duration and end-to-end latency.

## Security

Personal data in change events lands in Kafka as well as the lakehouse, so apply access control and retention to both.

## Cost

Micro-batch interval trades latency for cost and file health. Compact tables regularly, since frequent merges create many small files.

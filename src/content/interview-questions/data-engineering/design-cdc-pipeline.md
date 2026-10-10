---
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
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
followUps: ["How do you take an initial snapshot without missing changes?", "How do you represent deletes downstream?", "What if the consumer is down longer than Kafka retention?", "What happens to the source database if the connector stops for a day?", "How do you handle a primary key update?"]
related: ["system-designs:change-data-capture-platform", "articles:kafka/topics-partitions-consumer-groups", "articles:delta-lake/transactions-schema-evolution", "articles:etl-elt/cdc-patterns-and-failure-modes", "articles:kafka/kafka-connect-debezium", "interview-questions:data-engineering/schema-evolution-in-pipelines"]
versionContext: "SQL verified on PostgreSQL 16.14"
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

## Example: the apply step

A micro-batch of change events (operation, key, values, log position) is reduced to the latest event per key and merged with a position guard. Deleted rows are kept as soft deletes so a replayed old event cannot bring them back.

```sql
CREATE TABLE changes (lsn bigint, op char(1), id bigint, name text);
CREATE TABLE replica (id bigint PRIMARY KEY, name text, is_deleted boolean NOT NULL DEFAULT false, lsn bigint NOT NULL);
INSERT INTO changes VALUES (10, 'c', 1, 'Kettle'), (12, 'u', 1, 'Electric kettle'), (15, 'c', 2, 'Toaster'), (18, 'd', 2, NULL);

MERGE INTO replica AS t
USING (SELECT DISTINCT ON (id) * FROM changes ORDER BY id, lsn DESC) AS s
ON t.id = s.id
WHEN MATCHED AND s.lsn <= t.lsn THEN DO NOTHING
WHEN MATCHED AND s.op = 'd' THEN UPDATE SET is_deleted = true, lsn = s.lsn
WHEN MATCHED THEN UPDATE SET name = s.name, is_deleted = false, lsn = s.lsn
WHEN NOT MATCHED AND s.op = 'd' THEN INSERT (id, is_deleted, lsn) VALUES (s.id, true, s.lsn)
WHEN NOT MATCHED THEN INSERT (id, name, lsn) VALUES (s.id, s.name, s.lsn);

SELECT * FROM replica ORDER BY id;
```

| id | name | is_deleted | lsn |
|----|------|------------|-----|
| 1 | Electric kettle | f | 12 |
| 2 | | t | 18 |

Replaying the same batch, or an older one, changes nothing.

## Trade-offs

- **Log-based vs query-based**: log-based captures deletes and every change with low source load, but needs replication privileges and someone to operate the connector. Polling is easy to start and misses deletes and late commits.
- **Managed vs self-run**: a managed CDC service removes connector operations but limits control over snapshots, formats and cost.
- **Hard vs soft deletes**: soft deletes protect against resurrection and keep history, at the cost of filtering in every query (use a view).
- **Merge frequency**: frequent small merges give low latency but many small files and commits in lake formats; batch them to minutes and compact.

## Failure modes interviewers like

- A stopped connector keeps its PostgreSQL replication slot, which retains WAL until the primary's disk fills. Set `max_slot_wal_keep_size` and alert on slot lag.
- MySQL binlogs expire on a schedule, so a connector down longer than retention must re-snapshot.
- Primary key updates arrive as a delete plus a create.
- Unchanged large (TOASTed) PostgreSQL values may arrive as placeholders unless replica identity is FULL.

See the [CDC lesson](/etl-elt/cdc-patterns-and-failure-modes/) for the details and the full [CDC system design case study](/data-engineering/system-design/change-data-capture-platform/).

## Common mistakes

1. Applying events in arrival order without comparing log positions.
2. Forgetting deletes.
3. No plan for the initial load.
4. Hard-deleting in the target, so a replayed create resurrects the row.
5. Leaving an unused replication slot on the production database.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Design a CDC Pipeline from an OLTP Database to the Warehouse"
seoTitle: "Design a CDC Pipeline from OLTP to Warehouse"
description: "A system-design case study for change data capture: log-based capture, snapshots, ordering, idempotent MERGE with deletes, schema changes and the failure modes that bite."
inventoryId: "SYS-03"
technology: ["data-engineering", "kafka", "snowflake"]
topic: ["cdc", "streaming", "architecture"]
difficulty: "Advanced"
problem: "Replicate inserts, updates and deletes from a production PostgreSQL (or MySQL) database into the analytics warehouse within minutes, keeping both a current-state copy and a change history, without adding query load to the source or losing a single change."
functionalRequirements:
  - "Capture every insert, update and delete from about 30 selected source tables"
  - "Maintain current-state tables in the warehouse that mirror the source"
  - "Keep an append-only history of changes for audit and SCD Type 2 modelling"
  - "Onboard a new table with an initial snapshot and no gap or overlap with the change stream"
  - "Propagate additive schema changes; stop safely on breaking ones"
  - "Reconcile source and target row counts daily"
nonFunctionalRequirements:
  - "End-to-end latency under 5 minutes at p95 in normal operation"
  - "No lost changes; duplicates and replays must be harmless"
  - "Negligible extra load on the source database; never fill its disk"
  - "Automatic recovery after connector, broker or consumer restarts"
  - "Personal data protected in transit and in every intermediate store"
scaleAssumptions:
  - "Assumption: 30 source tables, the largest about 500 million rows"
  - "Assumption: average 1,500 and peak 5,000 row changes per second"
  - "Assumption: average change event about 1 KB serialised with Avro"
  - "Assumption: Kafka retention of 7 days for CDC topics"
architectureSummary: "Debezium reads the database's write-ahead log (logical replication) and publishes one Avro change event per row change to Kafka, keyed by primary key, with schemas in a schema registry. A sink writes events into an append-only change table in the warehouse; a scheduled or continuous MERGE applies the latest event per key to current-state tables, guarded by the source log sequence number so replays and reordering cannot regress data."
technologies:
  - "PostgreSQL logical decoding (pgoutput) or MySQL row-based binlog"
  - "Debezium on Kafka Connect"
  - "Apache Kafka with a schema registry (Avro)"
  - "Snowflake Kafka connector with Snowpipe Streaming (or Delta Lake via Spark Structured Streaming)"
  - "Warehouse MERGE, scheduled by dbt, a task, or a dynamic table"
tradeoffs:
  - decision: "Log-based CDC"
    alternative: "Query-based polling on an updated_at column"
    reason: "Captures deletes and every intermediate change, adds almost no query load, and does not depend on application discipline about timestamps"
    consequence: "Needs replication privileges, a replication slot or binlog retention, and connector operations"
  - decision: "Kafka between the database and the warehouse"
    alternative: "Managed point-to-point replication into the warehouse"
    reason: "Durable buffer, replay within retention, and several consumers (warehouse, search, cache) from one capture"
    consequence: "Another distributed system to run; a managed service can be simpler if only the warehouse consumes"
  - decision: "Land raw change events, then MERGE into current state"
    alternative: "Upsert directly into current-state tables from the stream"
    reason: "Keeps full history for audit and SCD2, and lets you rebuild current state if the MERGE logic was wrong"
    consequence: "Extra storage and a second step that adds a few minutes of latency"
  - decision: "Order by source log position (LSN), not timestamps"
    alternative: "Last-write-wins on commit timestamp or arrival time"
    reason: "LSN is strictly ordered per database, so the newest change always wins even after replays"
    consequence: "Every event must carry the position, and the guard column must be stored on the target"
  - decision: "Soft deletes in history, hard deletes in current state"
    alternative: "Hard delete everywhere, or soft delete everywhere"
    reason: "Current-state tables match the source exactly while history still records that the row existed"
    consequence: "Personal data in history needs its own erasure process"
interviewFollowUps:
  - "How do you take the initial snapshot without missing or double-applying changes made during it?"
  - "The connector was down for a day and the source database's disk is filling up. What happened, and what do you do?"
  - "A column is renamed in the source table. Walk through what happens end to end."
  - "How do you prove the warehouse table matches the source?"
  - "How do you handle a table with no primary key?"
  - "When would you choose a managed service such as AWS DMS, Datastream or Fivetran instead?"
related:
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "interview-questions:data-engineering/design-cdc-pipeline"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:delta-lake/transactions-schema-evolution"
  - "projects:change-data-capture-pipeline"
  - "system-designs:scalable-lakehouse"
previous: "system-designs:scalable-lakehouse"
next: "system-designs:kafka-ingestion-system"
versionContext: "The apply MERGE was run on PostgreSQL 16 (DISTINCT ON is PostgreSQL syntax; Snowflake would use QUALIFY ROW_NUMBER()). Connector configuration is described, not executed."
sources:
  - { label: "PostgreSQL documentation: logical decoding", url: "https://www.postgresql.org/docs/current/logicaldecoding.html" }
  - { label: "Debezium connector for PostgreSQL", url: "https://debezium.io/documentation/reference/stable/connectors/postgresql.html" }
  - { label: "Debezium: sending signals to a connector (incremental snapshots)", url: "https://debezium.io/documentation/reference/stable/configuration/signalling.html" }
  - { label: "Snowflake: named channels and exactly-once delivery in Snowpipe Streaming", url: "https://docs.snowflake.com/en/user-guide/snowpipe-streaming/snowpipe-streaming-channels" }
  - { label: "Confluent Schema Registry: schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
---

## Approach

CDC looks like plumbing, but interviewers use it to test whether you understand **ordering, duplication, snapshots and source-database safety**. Design for at-least-once delivery everywhere and make the apply step idempotent and order-aware. Clarify first:

- **Which database and version?** PostgreSQL logical decoding and MySQL binlog behave differently; managed databases may restrict replication settings.
- **How fresh, and for whom?** Five-minute warehouse latency is very different from sub-second cache invalidation.
- **Current state, history, or both?** Auditors and SCD2 dimensions need history.
- **Do all tables have primary keys?** Without one you cannot apply updates reliably.
- **Hard deletes in the source?** If yes, query-based extraction cannot see them.
- **Other consumers?** If search indexes or caches will also consume changes, a shared Kafka topic pays off.
- **Who owns the source schema, and how are changes announced?**

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Source database</strong> writes every committed change to its write-ahead log (PostgreSQL) or binlog (MySQL).</li>
<li><strong>Debezium connector</strong> on Kafka Connect reads the log through a replication slot and emits one event per row change: <code>op</code>, <code>before</code>, <code>after</code>, source LSN, transaction id and commit time.</li>
<li><strong>Kafka</strong> stores one topic per table, keyed by primary key, with Avro schemas registered in a schema registry.</li>
<li><strong>Warehouse sink</strong> (Snowflake Kafka connector with Snowpipe Streaming) appends every event to a raw change table, exactly once per partition offset.</li>
<li><strong>Apply step</strong>: a MERGE every few minutes takes the latest event per key since the last run and updates, inserts or deletes current-state rows, guarded by LSN.</li>
<li><strong>Models</strong>: dbt builds SCD2 history and marts from the change table and the current-state tables; a daily reconciliation compares counts with the source.</li>
</ol>
<figcaption>Changes flow from the database log to Kafka to the warehouse. Order is preserved per primary key, and every step can be replayed.</figcaption>
</figure>

A customer updates their email. PostgreSQL commits the transaction and writes it to the WAL. Debezium, reading the logical replication stream from its slot, emits an update event whose key is `customer_id = 10` and whose value holds the before and after images and the LSN. Because the topic is keyed, every change for customer 10 goes to the same partition and stays in order. The sink connector appends the event to `raw.customers_changes`. Within five minutes the apply MERGE picks it up and updates `core.customers`. Debezium confirms the LSN back to PostgreSQL only after Kafka has acknowledged the event, so the database can recycle WAL up to that point.

## Capture: why log-based

| Method | Sees deletes | Source load | Captures every change | Notes |
|---|---|---|---|---|
| Query-based (`WHERE updated_at > last_run`) | No (unless soft deletes) | Repeated scans or index lookups | No: intermediate updates between polls are lost | Depends on every writer setting `updated_at` correctly |
| Trigger-based (audit table) | Yes | Extra write on every transaction | Yes | Adds latency and risk to the OLTP path |
| Log-based (WAL / binlog) | Yes | Reads the log the database already writes | Yes, in commit order | Needs replication privileges and slot or binlog retention |

Log-based capture is the default answer. Mention the source prerequisites: PostgreSQL needs `wal_level = logical`, a replication slot and a publication; MySQL needs row-based binlog with full row images. PostgreSQL only includes unchanged large (TOAST) columns in update events if the table's `REPLICA IDENTITY` is `FULL`, otherwise Debezium emits a placeholder for them, which the apply step must handle by keeping the existing value.

## The change event

Each event should carry enough to apply it correctly without guessing:

- `op`: `c` (create), `u` (update), `d` (delete), `r` (read during snapshot).
- `after` image (and `before` for updates and deletes).
- **Source position**: the LSN for PostgreSQL, binlog file and position (or GTID) for MySQL. This is the ordering key.
- Transaction id and commit timestamp, for debugging and for transaction-consistent reads if needed.
- Primary key as the Kafka message key.

Deletes are followed by a **tombstone** (a null-value message with the same key) so a compacted topic can eventually drop the key.

## Initial snapshot without gaps

A new table needs its existing rows before streaming starts. The classic approach is: create the replication slot (which fixes a log position), take a consistent snapshot at exactly that position, emit snapshot rows as `op = r`, then stream changes from the slot's position. Nothing is missed because the slot holds all changes after the snapshot point, and nothing is double-applied because the LSN guard ignores older positions.

For a 500-million-row table, a blocking snapshot can take hours and holds back WAL while it runs. **Incremental snapshots** avoid this: Debezium reads the table in primary-key chunks while streaming continues, using open/close watermarks written to a signalling table to deduplicate chunk rows against concurrent changes. You trigger one by inserting an `execute-snapshot` signal. This is also how you re-snapshot one table later without restarting the connector.

## Ordering and partitioning

- **Key by primary key.** Kafka guarantees order within a partition, so all changes for one row are ordered.
- **No ordering across keys or tables** is guaranteed downstream. If a consumer needs transaction-consistent state across tables (an order and its lines), group by transaction id or apply both tables in one batch up to a common LSN.
- **Partition count** per topic follows throughput; 5,000 changes/second at 1 KB is only 5 MB/s, so 6–12 partitions per large table is plenty. Avoid increasing partitions later on keyed CDC topics, because existing keys move partition and lose ordering relative to their history.

## Applying changes idempotently

The raw change table is append-only and may contain duplicates (connector restarts replay from the last committed offset). The apply step takes the latest event per key since the last processed position and merges it with a guard. The example runs on PostgreSQL 16; in Snowflake you would replace `DISTINCT ON` with `QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY source_lsn DESC) = 1`.

```sql
CREATE TABLE customers_changes (
  customer_id INT,
  op          CHAR(1),
  email       TEXT,
  tier        TEXT,
  source_lsn  BIGINT
);
INSERT INTO customers_changes VALUES
  (10, 'c', 'a@x.com', 'basic', 1001),
  (10, 'u', 'a@x.com', 'gold',  1005),
  (11, 'u', 'b@y.com', 'basic', 1003),
  (12, 'd', NULL,      NULL,    1007),
  (11, 'u', 'b@y.com', 'basic', 1003);

CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  email       TEXT,
  tier        TEXT,
  source_lsn  BIGINT NOT NULL
);
INSERT INTO customers VALUES
  (11, 'b@old.com', 'basic', 900),
  (12, 'c@z.com',   'gold',  950);

MERGE INTO customers AS t
USING (
  SELECT DISTINCT ON (customer_id) customer_id, op, email, tier, source_lsn
  FROM customers_changes
  ORDER BY customer_id, source_lsn DESC
) AS s
ON t.customer_id = s.customer_id
WHEN MATCHED AND s.source_lsn > t.source_lsn AND s.op = 'd' THEN
  DELETE
WHEN MATCHED AND s.source_lsn > t.source_lsn THEN
  UPDATE SET email = s.email, tier = s.tier, source_lsn = s.source_lsn
WHEN NOT MATCHED AND s.op <> 'd' THEN
  INSERT (customer_id, email, tier, source_lsn)
  VALUES (s.customer_id, s.email, s.tier, s.source_lsn);

SELECT * FROM customers ORDER BY customer_id;
```

```text
 customer_id |  email  | tier  | source_lsn
-------------+---------+-------+------------
          10 | a@x.com | gold  |       1005
          11 | b@y.com | basic |       1003
```

Customer 10 was created and updated in the same batch and lands once with its latest state. The duplicate event for customer 11 had no effect. Customer 12 was deleted. A delete for a key the target has never seen is ignored by `WHEN NOT MATCHED AND s.op <> 'd'`. Run it again and nothing changes.

Two details matter in production. First, keep a **high-water mark** (the maximum LSN or the sink's ingestion time processed) so each run reads only new change rows. Second, if a run fails half way, re-running from the previous high-water mark is safe because of the guard.

## Exactly-once, end to end

There is no single exactly-once switch across a database, Kafka and a warehouse. You compose it:

- Debezium is at-least-once: after a crash it resumes from the last offset it stored, which can replay a few events.
- The Snowflake sink with Snowpipe Streaming **named channels** stores the Kafka offset as an offset token with each commit, so on restart it resumes after the last committed offset without duplicating rows within a channel.
- The MERGE guard makes any remaining duplicates (from the connector side) harmless.

The result is effectively-once state in the target, which is what the business needs.

## Schema evolution

- Debezium registers a new Avro schema version when a column is added. With the registry set to **backward** compatibility (the Confluent default), a consumer on the new schema can still read events written with the previous one, so upgrade consumers first; adding a column with a default is compatible in both directions.
- **Additive nullable columns**: the sink adds the column to the raw table (schema evolution enabled), and a dbt model change adds it to current state.
- **Renames, type narrowing, dropped columns**: treat as breaking. The registry rejects incompatible schemas, the connector stops, an alert fires, and an engineer migrates the target. Pausing is better than silently writing nulls for a column that was renamed.
- Agree a **schema change process** with the source team: announce, deploy additive first, backfill, then remove the old column later.

## Failure modes and recovery

| Failure | What happens | Mitigation |
|---|---|---|
| Connector down for hours | PostgreSQL keeps WAL for the inactive slot; **source disk fills** | Alert on slot lag in bytes; set `max_slot_wal_keep_size`; heartbeat events so idle tables still advance the slot |
| Kafka retention shorter than an outage | Changes are lost before the sink reads them | Retention well above the longest plausible outage (7 days here); otherwise re-snapshot |
| Database failover to a replica | Logical slot may not exist on the new primary | Use failover-capable slots where the database supports them; otherwise re-snapshot affected tables |
| Sink falls behind | Warehouse data stale | Monitor consumer lag; scale connector tasks up to the partition count |
| Breaking schema change | Connector or sink stops | Alert; bronze-style raw table still holds data up to the break; fix and resume |
| Bug in apply MERGE | Wrong current state | Rebuild current state from the full change history |

## Data quality and reconciliation

CDC fails silently more often than loudly. Run a daily reconciliation per table: row counts in source versus target at a fixed LSN or time, plus checksums of key columns over a sample of key ranges. Alert on drift above a small tolerance and investigate before users notice. Also check that the maximum `source_lsn` in the target keeps increasing; a flat line means the pipeline stalled even if nothing errored.

## Security and PII

- The CDC user needs replication privileges only, not read access to the whole database where avoidable; use a publication to limit tables.
- Exclude columns that analytics must never see (password hashes, card data) with the connector's column exclude list, so they never leave the database.
- Encrypt in transit (TLS to Kafka and the warehouse) and restrict topic ACLs: CDC topics contain full row images, including `before` values.
- Set Kafka retention deliberately; seven days of personal data in Kafka is still personal data.
- History tables keep old values, so erasure requests must reach them too.

## Cost

- Kafka and Connect are fixed cost; at 5 MB/s peak a three-broker cluster is mostly idle, so a managed Kafka or a smaller cluster is fine.
- Warehouse cost is dominated by the MERGE frequency. A MERGE every minute on a large table keeps a warehouse running constantly; every 5–15 minutes is often enough. Use incremental filters so each MERGE only scans recent change rows and recent target clusters.
- Compress Avro events and set history retention or tiering for the raw change table.

## Scaling to 10×

At 50,000 changes per second (about 50 MB/s):

- Add partitions to new topics and connector tasks on the sink side. Debezium reads one log per database, so a single connector can become the bottleneck; split very busy tables to a separate connector only if the database supports several slots without overload.
- Switch the apply step to continuous micro-batches (Snowflake dynamic tables or a streaming job into Delta) instead of large periodic MERGEs.
- Cluster target tables by primary key so MERGE touches few micro-partitions or files.
- Consider moving heavy history modelling to the lakehouse and keeping only current state in the warehouse.

## Monitoring and SLAs

- **Source**: replication slot lag in bytes and WAL disk usage (the most important CDC alert).
- **Connector**: status, task failures, milliseconds behind source.
- **Kafka**: consumer lag per partition for the sink group.
- **Warehouse**: time since last successful MERGE, max `source_lsn` applied, end-to-end latency (commit time to apply time).
- **Quality**: reconciliation drift per table.

SLA example: 95% of changes visible in `core` tables within 5 minutes of commit; reconciliation drift below 0.01% daily.

## Capacity estimate

- **Event volume**: 1,500 changes/s average × 86,400 s ≈ 130 million events/day; at 1 KB each ≈ 130 GB/day into Kafka.
- **Kafka storage**: 130 GB/day × 7 days × replication factor 3 ≈ 2.7 TB across the cluster, before compression.
- **Peak throughput**: 5,000 events/s × 1 KB = 5 MB/s, a small load for Kafka.
- **Warehouse raw change table**: 130 GB/day uncompressed; columnar compression typically reduces this several times. Keeping one year is roughly 47 TB uncompressed, so set a retention or tiering policy.
- **Apply step**: a 5-minute MERGE processes about 450,000 events at average load and 1.5 million at peak, deduplicated to fewer keys.
- **Snapshot**: 500 million rows at an assumed 50,000 rows/s read rate takes about 2.8 hours, which is why incremental snapshots that run alongside streaming are preferred.

## What a strong answer includes

- **Log-based capture** and why it beats polling (deletes, intermediate changes, no source load).
- A **gap-free snapshot** strategy, including incremental snapshots for large tables.
- **Ordering by primary key** and an **LSN guard** in an idempotent MERGE, including delete handling.
- **Source safety**: replication slot lag, WAL retention and heartbeats.
- **Schema evolution** with compatibility rules and a stop-on-breaking-change policy.
- **Reconciliation** to prove correctness.
- Awareness of **managed alternatives** (AWS DMS, Google Datastream, Fivetran) and when they are the better choice.

## Common mistakes

- Using `updated_at` polling and then being surprised that deletes never arrive.
- Ordering by arrival time or commit timestamp instead of log position.
- Forgetting that an unconsumed replication slot can take the production database down by filling its disk.
- Applying changes with blind upserts, so a replayed old event overwrites newer data.
- Increasing partitions on a keyed CDC topic and breaking per-key ordering.
- Ignoring tables without primary keys, or TOAST columns that arrive as placeholders.
- Keeping full row images in Kafka and history tables without considering personal data.

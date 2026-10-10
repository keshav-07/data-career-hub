---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How would you stream database changes into Kafka with Debezium?"
seoTitle: "CDC with Debezium and Kafka: Interview Answer"
description: "Interview answer: Debezium reads the database log through a replication slot, snapshots first, keys events by primary key, and sinks apply them with ordered idempotent upserts."
technology: ["kafka", "data-engineering"]
topic: ["cdc", "debezium", "kafka-connect"]
difficulty: "Hard"
questionType: ["architecture", "scenario"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "Run Debezium as a Kafka Connect source connector. For PostgreSQL it uses logical decoding (wal_level=logical, the pgoutput plug-in) through a replication slot, takes an initial snapshot of existing rows, then streams every committed insert, update and delete as an event with before, after, op and source metadata (LSN, transaction ID, timestamp). Each table goes to its own topic keyed by primary key, so all changes to a row stay ordered in one partition, and deletes are followed by tombstones for compacted topics. Downstream, apply events idempotently: upsert or MERGE by key, delete on op=d, and ignore events older than the version already applied. Monitor replication slot lag, because a stopped connector makes the database retain WAL until its disk fills."
followUps: ["What happens to the source database if the connector is down for a weekend?", "Why do update events have no before image by default in PostgreSQL?", "How do you re-snapshot one table without stopping streaming?", "How do you handle a column rename in the source table?"]
related: ["articles:kafka/kafka-connect-debezium", "articles:etl-elt/cdc-patterns-and-failure-modes", "interview-questions:data-engineering/design-cdc-pipeline", "interview-questions:kafka/log-compaction-use-cases", "system-designs:change-data-capture-platform"]
versionContext: "Debezium 3.x PostgreSQL connector on Kafka Connect 4.x. The SQL apply step was run on PostgreSQL 16; the connector configuration needs a Connect cluster and is not executed here."
sources:
  - { label: "Debezium documentation: PostgreSQL connector", url: "https://debezium.io/documentation/reference/stable/connectors/postgresql.html" }
  - { label: "PostgreSQL documentation: Logical decoding", url: "https://www.postgresql.org/docs/16/logicaldecoding.html" }
---

## Detailed explanation

**Why log-based CDC**: polling with `updated_at > last_run` misses deletes, misses intermediate updates and loads the database. Reading the transaction log sees every committed change, in commit order, with low overhead.

**The pipeline**

1. **Source database**: PostgreSQL with `wal_level = logical`. Debezium creates a **replication slot** (its position in the WAL) and a **publication** for the captured tables.
2. **Snapshot**: on first start (`snapshot.mode=initial`), Debezium reads existing rows and emits them as `op: "r"` events, then switches to streaming from the slot. Incremental snapshots (triggered through a signalling table) re-snapshot tables later without stopping the stream.
3. **Events**: one topic per table (`<topic.prefix>.<schema>.<table>`), keyed by the primary key, with an envelope of `before`, `after`, `op` (`c`, `u`, `d`, `r`) and `source` (LSN, transaction ID, commit timestamp). A delete is followed by a tombstone so compacted topics drop the key.
4. **Schemas**: use Avro or Protobuf with a schema registry so column additions evolve safely.
5. **Sink**: a sink connector or stream job applies changes to the lake or warehouse with `MERGE`: upsert `after` for `c`, `u`, `r`; delete for `d`; skip tombstones.

**Correctness rules**

- **Ordering is per key**: Debezium keys by primary key, so one row's changes stay in one partition. Do not repartition by another field before applying.
- **Idempotency**: Connect is at-least-once, so the sink will see duplicates after restarts. Apply only if the event is newer than the stored version (by LSN or commit timestamp).
- **Before images**: PostgreSQL's default `REPLICA IDENTITY` logs only the key for updates and deletes; set `REPLICA IDENTITY FULL` on tables where consumers need the old values.

## Example

Applying change events idempotently with a version guard (PostgreSQL 16). The sink keeps the LSN of the last applied change per row and ignores older or repeated events:

```sql
CREATE TABLE customers_replica (
  id          INT PRIMARY KEY,
  email       TEXT,
  tier        TEXT,
  source_lsn  BIGINT NOT NULL
);

CREATE TABLE cdc_events (op TEXT, id INT, email TEXT, tier TEXT, lsn BIGINT);
INSERT INTO cdc_events VALUES
  ('r', 1, 'asha@example.com', 'bronze', 100),
  ('r', 2, 'ben@example.com',  'silver', 100),
  ('u', 1, 'asha@example.com', 'gold',   210),
  ('c', 3, 'chen@example.com', 'bronze', 220),
  ('d', 2, NULL, NULL,                   230),
  ('u', 1, 'asha@example.com', 'gold',   210),   -- duplicate after a connector restart
  ('u', 3, 'chen@example.com', 'silver', 215);   -- older than the create at 220: stale, must not win

-- Upserts: newest event per key, applied only if newer than what the replica holds
INSERT INTO customers_replica AS t (id, email, tier, source_lsn)
SELECT DISTINCT ON (id) id, email, tier, lsn
FROM cdc_events
WHERE op IN ('r', 'c', 'u')
ORDER BY id, lsn DESC
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, tier = EXCLUDED.tier, source_lsn = EXCLUDED.source_lsn
  WHERE t.source_lsn < EXCLUDED.source_lsn;

-- Deletes: remove rows whose delete is newer than the applied version
DELETE FROM customers_replica t
USING cdc_events e
WHERE e.op = 'd' AND e.id = t.id AND e.lsn > t.source_lsn;

SELECT id, email, tier, source_lsn FROM customers_replica ORDER BY id;
```

```text
 id |      email       |  tier  | source_lsn
----+------------------+--------+------------
  1 | asha@example.com | gold   |        210
  3 | chen@example.com | bronze |        220
```

The duplicate update for row 1 changed nothing, the stale update for row 3 lost to the newer create, and row 2 was deleted. Running the same statements again leaves the table unchanged, which is what makes replays safe.

A minimal connector configuration:

<!-- noexec -->
```json
{
  "name": "shop-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "db.internal", "database.port": "5432",
    "database.user": "debezium", "database.password": "${file:/secrets/db.properties:password}",
    "database.dbname": "shop", "topic.prefix": "shop",
    "plugin.name": "pgoutput", "slot.name": "shop_cdc",
    "table.include.list": "public.customers,public.orders",
    "snapshot.mode": "initial",
    "heartbeat.interval.ms": "60000"
  }
}
```

## Trade-offs and pitfalls

- **WAL retention**: a replication slot holds WAL until the connector confirms it. A connector stopped for days can fill the database disk. Alert on slot lag (`pg_replication_slots`) and drop slots of retired connectors.
- **Quiet tables**: if captured tables rarely change while others do, heartbeats keep the slot advancing.
- **Snapshots are heavy**: the initial snapshot reads whole tables; schedule it, or use incremental snapshots.
- **Schema changes**: added nullable columns flow through; renames and type changes need a coordinated plan with the schema registry.
- **Transactions span tables**: events from one database transaction land in several topics and partitions; consumers that need transaction boundaries can use Debezium's transaction metadata topic.
- **Outbox pattern**: for publishing domain events (rather than table rows), write them to an outbox table in the same transaction and capture that table with Debezium.

## Common mistakes

1. Applying events by arrival time instead of per-key version, so a replayed old event overwrites newer data.
2. Forgetting deletes, or filtering out tombstones before a compacted topic.
3. Leaving a test connector's replication slot behind.

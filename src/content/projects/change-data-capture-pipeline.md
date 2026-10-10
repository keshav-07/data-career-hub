---
previous: "projects:kafka-spark-delta-streaming"
next: "projects:real-time-analytics-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Change Data Capture Pipeline"
description: "Advanced CDC project: capture inserts, updates and deletes from PostgreSQL with log-based CDC, stream via Kafka and apply them to a Delta table with MERGE."
inventoryId: "PROJ-05"
technology: ["kafka", "delta-lake", "spark"]
topic: ["cdc", "streaming"]
level: "Advanced"
problemStatement: "Replicate an operational PostgreSQL table into a lakehouse table within minutes, including updates and deletes, so analysts query current data without touching the production database, and prove that replays, duplicates and out-of-order delivery cannot corrupt the copy."
requirements: ["Run PostgreSQL with logical replication enabled", "Capture changes with Debezium into Kafka, keyed by primary key", "Apply changes to a Delta table with MERGE, ordered and guarded by the source log position (LSN)", "Handle deletes and tombstones", "Take an initial snapshot without missing or double-applying concurrent changes", "Reconcile the target with the source and alert on replication-slot lag"]
technologies: ["PostgreSQL 16", "Debezium (Kafka Connect)", "Apache Kafka (KRaft)", "Spark Structured Streaming", "Delta Lake", "Docker Compose"]
dataset: "Synthetic: your own orders table plus a change generator. The apply logic is first built and tested in plain PostgreSQL with simulated Debezium events, so it runs without Kafka."
steps: ["Start PostgreSQL (wal_level=logical), Kafka and Kafka Connect with Docker Compose", "Create the orders table and register the Debezium PostgreSQL connector", "Inspect change events: op, before, after, source.lsn and tombstones", "Build the apply step in SQL: parse events, keep the latest per key, MERGE with an LSN guard and delete handling", "Test it against duplicates, out-of-order delivery, a snapshot overlap and a full replay", "Port the apply step to Spark foreachBatch with a Delta MERGE", "Reconcile source and target, and monitor connector lag and replication-slot WAL"]
testing: ["Replay every change event and confirm the target is unchanged", "Deliver events out of order and in duplicate; the target must match the source", "Delete a row and confirm it disappears; deliver an older update afterwards and confirm it does not resurrect the row", "Compare row counts and row hashes between source and target after a run"]
dataQuality: ["Primary keys unique in the target", "No rows exist in the target that were deleted in the source", "Maximum applied LSN keeps increasing; a flat line means the pipeline stalled", "Daily reconciliation: count and hash per key range"]
monitoring: ["Replication slot lag in bytes (pg_replication_slots) and WAL disk usage", "Connector status and task failures from the Kafka Connect REST API", "Consumer lag of the apply job", "Time from source commit (source.ts_ms) to target visibility"]
costConsiderations: ["Runs locally in containers", "Kafka retention must cover the longest consumer outage you want to survive; otherwise you re-snapshot", "MERGE frequency drives warehouse or cluster cost; every few minutes is usually enough for analytics"]
interviewQuestions: ["How do you keep updates for the same row in order?", "How did you handle deletes, and why do tombstones exist?", "How does the initial snapshot avoid gaps and double-applying?", "Why are replays safe?", "What happens to the source database if the connector is down for a day?", "Why not poll with updated_at instead?"]
resumeBullets: ["Built a log-based CDC pipeline from PostgreSQL through Debezium and Kafka to Delta Lake that applies inserts, updates and deletes with an LSN-guarded, idempotent MERGE; state the change rate you tested and the commit-to-visible latency you measured", "Proved correctness with replay, out-of-order and duplicate-delivery tests and a source-to-target hash reconciliation; mention the failure you injected (for example a connector restart) and what the checks showed"]
extensions: ["Keep an append-only change-history table and build an SCD Type 2 dimension from it", "Handle an additive schema change in the source and a breaking one (stop and alert)", "Use incremental snapshots (Debezium signals) to re-snapshot one table without restarting", "Replace the self-managed stack with a managed CDC service and compare"]
related: ["system-designs:change-data-capture-platform", "interview-questions:data-engineering/design-cdc-pipeline", "articles:etl-elt/cdc-patterns-and-failure-modes", "articles:kafka/kafka-connect-debezium", "articles:kafka/topics-partitions-consumer-groups"]
versionContext: "The apply, replay and reconciliation SQL was run on PostgreSQL 16 with scripts/verify-examples.py; shown output comes from that run. Docker Compose, Debezium configuration and the Spark/Delta job are described from the Debezium and Delta Lake documentation and were not executed here."
sources:
  - { label: "Debezium documentation: PostgreSQL connector", url: "https://debezium.io/documentation/reference/stable/connectors/postgresql.html" }
  - { label: "PostgreSQL 16: logical replication", url: "https://www.postgresql.org/docs/16/logical-replication.html" }
  - { label: "Delta Lake documentation: table deletes, updates and merges", url: "https://docs.delta.io/latest/delta-update.html" }
---

## What you will build

A replica of an operational table that stays within minutes of the source, including deletes, without querying the production database. The engineering lies in **ordering**, **idempotency**, **deletes** and the **initial snapshot**. You will build the apply logic first in plain SQL, where it is easy to test against every nasty delivery pattern, then run the same logic in Spark against a Delta table.

You are done when:

- every change event can be replayed without changing the target;
- duplicates and out-of-order events leave the target equal to the source;
- a delete followed by a late, older update does not bring the row back;
- a reconciliation query proves source and target match.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>PostgreSQL writes changes to its write-ahead log.</li>
<li>Debezium reads the log through a replication slot and publishes one event per row change to Kafka, keyed by primary key.</li>
<li>A streaming job reads micro-batches and keeps the latest change per key.</li>
<li>MERGE applies inserts, updates and deletes to the Delta table, guarded by the source LSN.</li>
<li>Analysts query the Delta table; a reconciliation job compares it with the source.</li>
</ol>
<figcaption>Changes flow from the database log to the lakehouse with per-key ordering.</figcaption>
</figure>

The design follows the [CDC system design case study](/data-engineering/system-design/change-data-capture-platform/); read it before building.

## Step 1: the local stack

<!-- noexec -->
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    command: ["postgres", "-c", "wal_level=logical", "-c", "max_wal_senders=4", "-c", "max_replication_slots=4"]
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: shop }
    ports: ["5432:5432"]
  kafka:
    image: apache/kafka:4.1.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
  connect:
    image: quay.io/debezium/connect:3.2
    depends_on: [kafka, postgres]
    ports: ["8083:8083"]
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: cdc-connect
      CONFIG_STORAGE_TOPIC: _connect_configs
      OFFSET_STORAGE_TOPIC: _connect_offsets
      STATUS_STORAGE_TOPIC: _connect_status
      CONFIG_STORAGE_REPLICATION_FACTOR: 1
      OFFSET_STORAGE_REPLICATION_FACTOR: 1
      STATUS_STORAGE_REPLICATION_FACTOR: 1
```

Register the connector through the Kafka Connect REST API (`POST http://localhost:8083/connectors`):

<!-- noexec -->
```json
{
  "name": "shop-orders",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "plugin.name": "pgoutput",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "postgres",
    "database.dbname": "shop",
    "topic.prefix": "shop",
    "table.include.list": "public.orders",
    "slot.name": "shop_orders_slot",
    "publication.autocreate.mode": "filtered",
    "snapshot.mode": "initial",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false"
  }
}
```

In a real deployment use a dedicated replication user and a secret store, never the superuser password in a JSON file. Events appear on the topic `shop.public.orders`. Each value is an envelope like this (an update):

<!-- noexec -->
```json
{"before": {"order_id": 7, "status": "paid", "amount": "40.00"},
 "after":  {"order_id": 7, "status": "shipped", "amount": "40.00"},
 "source": {"lsn": 23861720, "txId": 771, "table": "orders"},
 "op": "u", "ts_ms": 1791196800123}
```

`op` is `r` (snapshot read), `c`, `u` or `d`. A delete is followed by a **tombstone**: a message with the same key and a null value, so a compacted topic can eventually forget the key. `before` is populated for updates and deletes only if the table's replica identity provides it; set `ALTER TABLE orders REPLICA IDENTITY FULL` if you need full before-images (it costs extra WAL).

## Step 2: build and test the apply logic in SQL

The apply step must be correct regardless of how events are delivered. Model the Kafka topic as a table of raw JSON events, including everything that goes wrong in practice:

- snapshot rows (`op = r`) overlapping with streamed changes;
- a duplicate delivery (a connector restart replays from its last committed offset);
- an update delivered **after** a newer update for the same key (possible after replays or topic migrations);
- a delete followed by a stale, older update;
- a tombstone.

```sql
-- the source table, as it is after all the changes below
CREATE TABLE orders (order_id int PRIMARY KEY, status text, amount numeric(10, 2));
INSERT INTO orders VALUES (1, 'shipped', 25.00), (3, 'paid', 60.00), (4, 'paid', 15.00);

-- the topic, as a table of raw messages in delivery order
CREATE TABLE cdc_events (kafka_offset bigint PRIMARY KEY, msg_key int, value jsonb);
INSERT INTO cdc_events VALUES
  (1,  1, '{"op":"r","after":{"order_id":1,"status":"paid","amount":"25.00"},"source":{"lsn":100}}'),
  (2,  2, '{"op":"r","after":{"order_id":2,"status":"paid","amount":"10.00"},"source":{"lsn":100}}'),
  (3,  1, '{"op":"u","after":{"order_id":1,"status":"shipped","amount":"25.00"},"source":{"lsn":120}}'),
  (4,  3, '{"op":"c","after":{"order_id":3,"status":"new","amount":"60.00"},"source":{"lsn":130}}'),
  (5,  1, '{"op":"u","after":{"order_id":1,"status":"shipped","amount":"25.00"},"source":{"lsn":120}}'),
  (6,  3, '{"op":"u","after":{"order_id":3,"status":"paid","amount":"60.00"},"source":{"lsn":150}}'),
  (7,  2, '{"op":"d","before":{"order_id":2},"after":null,"source":{"lsn":160}}'),
  (8,  2, null),
  (9,  3, '{"op":"u","after":{"order_id":3,"status":"new","amount":"60.00"},"source":{"lsn":140}}'),
  (10, 2, '{"op":"u","after":{"order_id":2,"status":"refunded","amount":"10.00"},"source":{"lsn":155}}'),
  (11, 4, '{"op":"c","after":{"order_id":4,"status":"paid","amount":"15.00"},"source":{"lsn":170}}');
SELECT count(*) AS messages, count(*) FILTER (WHERE value IS NULL) AS tombstones FROM cdc_events;
```

```text
 messages | tombstones 
----------+------------
       11 |          1
```

Offset 5 is a duplicate of offset 3; offset 9 (LSN 140) arrives after the newer LSN 150; offset 10 (LSN 155) is an update older than the delete at LSN 160.

The target keeps the last applied LSN per key, **including for deleted keys**, so that a stale event for a deleted row can be recognised. Here deleted rows are kept as soft-deleted rows; analysts read a view that hides them.

```sql
CREATE TABLE orders_replica (
  order_id int PRIMARY KEY, status text, amount numeric(10, 2),
  source_lsn bigint NOT NULL, is_deleted boolean NOT NULL DEFAULT false);
CREATE VIEW orders_current AS
  SELECT order_id, status, amount FROM orders_replica WHERE NOT is_deleted;
CREATE TABLE apply_state (consumer text PRIMARY KEY, last_offset bigint);
INSERT INTO apply_state VALUES ('orders_replica', 0);

CREATE PROCEDURE apply_batch(from_offset bigint, to_offset bigint)
LANGUAGE sql AS $$
  MERGE INTO orders_replica AS t
  USING (
    SELECT DISTINCT ON (key_id) key_id, op, status, amount, lsn
    FROM (
      SELECT coalesce((value -> 'after' ->> 'order_id')::int, (value -> 'before' ->> 'order_id')::int) AS key_id,
             value ->> 'op' AS op,
             value -> 'after' ->> 'status' AS status,
             (value -> 'after' ->> 'amount')::numeric(10, 2) AS amount,
             (value -> 'source' ->> 'lsn')::bigint AS lsn
      FROM cdc_events
      WHERE kafka_offset > from_offset AND kafka_offset <= to_offset
        AND value IS NOT NULL                       -- tombstones carry no change
    ) e
    ORDER BY key_id, lsn DESC
  ) AS s
  ON t.order_id = s.key_id
  WHEN MATCHED AND s.lsn > t.source_lsn AND s.op = 'd' THEN
    UPDATE SET is_deleted = true, source_lsn = s.lsn
  WHEN MATCHED AND s.lsn > t.source_lsn THEN
    UPDATE SET status = s.status, amount = s.amount, source_lsn = s.lsn, is_deleted = false
  WHEN NOT MATCHED AND s.op = 'd' THEN
    INSERT (order_id, source_lsn, is_deleted) VALUES (s.key_id, s.lsn, true)
  WHEN NOT MATCHED THEN
    INSERT (order_id, status, amount, source_lsn) VALUES (s.key_id, s.status, s.amount, s.lsn);
  UPDATE apply_state SET last_offset = greatest(last_offset, to_offset) WHERE consumer = 'orders_replica';
$$;

-- apply the topic in three micro-batches, as a stream would
CALL apply_batch(0, 4);
CALL apply_batch(4, 8);
CALL apply_batch(8, 11);
SELECT * FROM orders_replica ORDER BY order_id;
```

```text
 order_id | status  | amount | source_lsn | is_deleted 
----------+---------+--------+------------+------------
        1 | shipped |  25.00 |        120 | f
        2 | paid    |  10.00 |        160 | t
        3 | paid    |  60.00 |        150 | f
        4 | paid    |  15.00 |        170 | f
```

Each micro-batch is reduced to the newest event per key **by LSN**, not by arrival, and the guard `s.lsn > t.source_lsn` rejects anything older than what the target already has. That is why:

- the duplicate at offset 5 changed nothing;
- the late LSN 140 update for order 3 was ignored (the target already had LSN 150);
- order 2 stays deleted although an older update (LSN 155) arrived after the delete (LSN 160).

A hard `DELETE` in the target would have lost the LSN 160 and let offset 10 re-insert order 2. Keeping the key with its LSN (a soft delete, or a separate tombstone table) is what prevents resurrection; purge those rows later, once no older event can still arrive.

## Step 3: replay, snapshot overlap and reconciliation

The snapshot rows were taken at LSN 100 and the stream re-delivered later changes; the guard made the overlap harmless. Now prove the strongest property: **replaying the whole topic from the beginning changes nothing**. Then compare with the source.

```sql
CREATE TEMP TABLE before_replay AS SELECT * FROM orders_replica;
CALL apply_batch(0, 11);                       -- replay everything as one big batch

SELECT count(*) AS rows_changed_by_replay
FROM (SELECT * FROM orders_replica EXCEPT SELECT * FROM before_replay) d;

SELECT (SELECT count(*) FROM orders) AS source_rows,
       (SELECT count(*) FROM orders_current) AS target_rows,
       (SELECT md5(string_agg(order_id || '|' || status || '|' || amount, ',' ORDER BY order_id)) FROM orders)
     = (SELECT md5(string_agg(order_id || '|' || status || '|' || amount, ',' ORDER BY order_id)) FROM orders_current)
       AS hashes_match,
       (SELECT max(source_lsn) FROM orders_replica) AS max_applied_lsn;
```

```text
 rows_changed_by_replay 
------------------------
                      0

 source_rows | target_rows | hashes_match | max_applied_lsn 
-------------+-------------+--------------+-----------------
           3 |           3 | t            |             170
```

In production the reconciliation compares counts and hashes **per key range** (for example per thousand order ids), so a mismatch points at a small range, and it compares at a known point in time: query the source on a replica and the target after the apply job has passed the matching LSN.

## Step 4: run the apply step in Spark against Delta

The SQL above maps directly onto a `foreachBatch` function. Kafka offsets are tracked by the streaming checkpoint; the MERGE is the same.

<!-- noexec -->
```python
from pyspark.sql import functions as F, Window
from delta.tables import DeltaTable

AFTER = "struct<order_id:int,status:string,amount:decimal(10,2)>"
EVENT = f"struct<op:string,before:{AFTER},after:{AFTER},source:struct<lsn:bigint>>"

changes = (spark.readStream.format("kafka")
           .option("kafka.bootstrap.servers", "localhost:9092")
           .option("subscribe", "shop.public.orders")
           .option("startingOffsets", "earliest")
           .load()
           .where(F.col("value").isNotNull())                        # skip tombstones
           .select(F.from_json(F.col("value").cast("string"), EVENT).alias("e"))
           .select(F.coalesce("e.after.order_id", "e.before.order_id").alias("order_id"),
                   "e.op", "e.after.status", "e.after.amount", F.col("e.source.lsn").alias("lsn")))

def apply_changes(batch_df, batch_id):
    latest = (batch_df.withColumn("rn", F.row_number().over(
                  Window.partitionBy("order_id").orderBy(F.col("lsn").desc())))
              .where("rn = 1").drop("rn"))
    (DeltaTable.forName(spark, "lake.orders_replica").alias("t")
        .merge(latest.alias("s"), "t.order_id = s.order_id")
        .whenMatchedUpdate(condition="s.lsn > t.source_lsn AND s.op = 'd'",
                           set={"is_deleted": "true", "source_lsn": "s.lsn"})
        .whenMatchedUpdate(condition="s.lsn > t.source_lsn",
                           set={"status": "s.status", "amount": "s.amount",
                                "source_lsn": "s.lsn", "is_deleted": "false"})
        .whenNotMatchedInsert(condition="s.op = 'd'",
                              values={"order_id": "s.order_id", "source_lsn": "s.lsn", "is_deleted": "true"})
        .whenNotMatchedInsert(values={"order_id": "s.order_id", "status": "s.status", "amount": "s.amount",
                                      "source_lsn": "s.lsn", "is_deleted": "false"})
        .execute())

(changes.writeStream.foreachBatch(apply_changes)
    .option("checkpointLocation", "/lake/_checkpoints/orders_replica")
    .trigger(processingTime="1 minute")
    .start())
```

Delta evaluates multiple `whenMatched` clauses in order and applies the first one whose condition is true, the same as the SQL `MERGE`. Because the guard makes the write idempotent, a micro-batch re-run after a crash is harmless even if Delta's own batch-level idempotency did not apply.

## Step 5: operate it

- **Replication slot lag** is the most important alert: an inactive slot makes PostgreSQL keep WAL, and the source disk can fill. Query `SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) FROM pg_replication_slots;` and alert on bytes, and consider `max_slot_wal_keep_size` as a safety limit.
- **Connector health**: `GET /connectors/shop-orders/status` on the Connect REST API.
- **End-to-end latency**: target write time minus `ts_ms` from the event.
- **Restart test**: stop the Connect container for a few minutes while the change generator runs, start it again, and rerun the reconciliation.

## Common mistakes

- **Ordering by arrival or by `ts_ms`** instead of LSN.
- **Hard deletes in the target**, which let a late older event resurrect the row.
- **Blind upserts** without a version guard, so a replayed old event overwrites newer data.
- **Increasing partitions on the CDC topic** later, which moves keys and breaks per-key ordering.
- **Forgetting the replication slot**, so a stopped connector fills the production database's disk.
- **Polling `updated_at`** and wondering why deletes never arrive.

## Explaining it in an interview

"Debezium reads PostgreSQL's WAL through a replication slot and publishes one event per row change, keyed by primary key, so changes to a row stay in order within a partition. The apply job reduces each micro-batch to the newest event per key by LSN and MERGEs it into Delta with a guard that only applies newer LSNs; deletes become soft deletes that keep the LSN, so a late older update cannot resurrect the row. I tested duplicates, out-of-order events, a snapshot overlap and a full replay, and a reconciliation compares counts and hashes with the source. The main operational risk is the replication slot, so slot lag in bytes is my first alert."

Be ready for: *Why not Kafka transactions for exactly once?* (the sink is Delta, outside Kafka; the LSN guard gives an exactly-once effect). *How does the snapshot avoid gaps?* (the slot is created first, fixing a log position; the snapshot is taken consistently at that point and streaming resumes from it; the guard absorbs any overlap). *What about a table without a primary key?* (configure a message key column or add a key; without one, updates cannot be applied reliably).

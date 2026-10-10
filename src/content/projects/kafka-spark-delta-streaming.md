---
previous: "projects:large-scale-batch-processing"
next: "projects:change-data-capture-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Kafka → Spark → Delta Lake Streaming Pipeline"
description: "An advanced project: stream events from Kafka with Spark Structured Streaming into Delta Lake tables with checkpointing, deduplication and late-data handling."
inventoryId: "PROJ-04"
technology: ["kafka", "spark", "delta-lake"]
topic: ["streaming"]
level: "Advanced"
problemStatement: "An application emits user events to Kafka. Build a streaming pipeline that lands them in Delta Lake within a minute, deduplicates replays, produces per-minute aggregates that tolerate late events, and recovers from restarts without losing or double-counting data."
requirements: ["Consume events from a Kafka topic (a local KRaft broker in Docker)", "Write deduplicated raw events to a Delta table with an idempotent MERGE in foreachBatch", "Deduplicate by event id within a watermark for the streaming aggregation", "Compute per-minute event-time aggregates and upsert them into a second Delta table", "Prove recovery: restart with the same checkpoint and replay with a new one, with unchanged results"]
technologies: ["Apache Kafka 4.x (KRaft)", "Spark Structured Streaming 4.x", "Delta Lake", "Docker Compose"]
dataset: "Synthetic: a producer script emits keyed JSON events, including a retried duplicate and an event that arrives later than the watermark. The core logic is first developed against a local file stream so it runs without Kafka."
steps: ["Start a single-node Kafka broker in KRaft mode with Docker Compose", "Write a producer that emits keyed JSON events with an event id and event time", "Develop the streaming logic against a local file source with the same schema", "Land raw events in Delta with foreachBatch and MERGE on event_id", "Add a watermark, dropDuplicatesWithinWatermark and one-minute windows; upsert aggregates by window", "Restart with the same checkpoint, then replay with a new checkpoint, and reconcile", "Switch the source to Kafka and measure end-to-end latency"]
testing: ["Replay the same events and confirm raw counts and aggregates do not change", "Send an event later than the watermark and confirm it is in the raw table but not in the aggregates, and counted as dropped", "Reconcile aggregate totals with a batch count over the raw table for closed windows"]
dataQuality: ["No duplicate event ids in the raw table", "Aggregates reconcile with raw counts per window, except documented late drops", "Malformed messages go to a dead-letter table instead of failing the query"]
monitoring: ["Consumer lag per partition (Kafka offsets behind latest)", "Batch duration versus trigger interval, input and processed rows per second", "numRowsDroppedByWatermark and state size from the query progress", "Latency from event time to availability in Delta"]
costConsiderations: ["Trigger interval trades latency for cost: one-minute triggers create far fewer commits and files than one-second triggers", "Compact Delta files produced by frequent small commits (OPTIMIZE or auto compaction)", "State size grows with the watermark length and key cardinality"]
interviewQuestions: ["What does the checkpoint store and why is it needed?", "How does a watermark bound state, and what happens to events later than it?", "Is your pipeline exactly-once end to end? Why or why not?", "Why foreachBatch with MERGE instead of the plain Delta sink for raw events?", "What changes would break compatibility with an existing checkpoint?"]
resumeBullets: ["Built a Kafka to Delta Lake pipeline with Spark Structured Streaming using checkpointed foreachBatch MERGE for idempotent landing and watermark-bounded deduplication; state the event rate you tested and the end-to-end latency you measured", "Proved recovery by restarting with the same checkpoint and replaying from the earliest offset with a new one, with raw counts and aggregates unchanged; describe the reconciliation query you used"]
extensions: ["Validate JSON against a schema and route bad messages to a dead-letter Delta table", "Serve the aggregates to a dashboard and show a freshness indicator", "Add a nightly batch job that recomputes closed windows from raw and compares", "Run two consumers on a multi-partition topic and observe rebalancing"]
related: ["articles:kafka/topics-partitions-consumer-groups", "articles:kafka/delivery-semantics-exactly-once", "articles:delta-lake/transactions-schema-evolution", "system-designs:streaming-etl-with-kafka-spark", "projects:real-time-analytics-pipeline"]
versionContext: "Streaming logic was run on PySpark 4.2 with Delta Lake (delta-spark 4.x) in local mode using a file source, with scripts/verify-examples.py; shown output comes from that run. Kafka, Docker Compose and the Kafka source snippet are described, not executed here."
---

## What you will build

A minute-latency pipeline that covers the four hard parts of streaming in a setting small enough to reason about: **state**, **late data**, **duplicates** and **recovery**. Two Delta tables come out of it:

| Table | Grain | How it is written |
|---|---|---|
| `events_raw` | One row per unique `event_id` | `foreachBatch` + `MERGE ... WHEN NOT MATCHED THEN INSERT` |
| `events_per_minute` | One row per (minute window, event type) | Watermarked aggregation in update mode, upserted by key |

You are done when restarts and replays leave both tables unchanged, the late event is visible in raw but excluded (and counted) by the aggregation, and you can explain why.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>A producer sends keyed JSON events to a Kafka topic.</li>
<li>Spark Structured Streaming reads micro-batches and parses JSON with an explicit schema.</li>
<li>Query 1 merges raw events into Delta on <code>event_id</code>; progress is tracked in its checkpoint.</li>
<li>Query 2 deduplicates within a watermark, aggregates one-minute windows and upserts them into a second Delta table.</li>
</ol>
<figcaption>Kafka offsets are recorded in each query's checkpoint before a batch runs; idempotent writes make a re-run batch harmless.</figcaption>
</figure>

## Step 1: run Kafka locally

Kafka 4.x runs only in KRaft mode (no ZooKeeper). A single-node broker for development:

<!-- noexec -->
```yaml
# docker-compose.yml
services:
  kafka:
    image: apache/kafka:4.1.0
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

Create the topic with several partitions, so you can later watch ordering per key and consumer parallelism:

<!-- noexec -->
```text
docker compose up -d
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic user-events --partitions 3 --replication-factor 1
```

## Step 2: the producer

<!-- noexec -->
```python
# producer.py  (pip install confluent-kafka)
import json, time, uuid
from datetime import datetime, timezone
from confluent_kafka import Producer

p = Producer({"bootstrap.servers": "localhost:9092", "enable.idempotence": True, "acks": "all"})

def send(user_id, event_type, event_time=None, event_id=None):
    event = {"event_id": event_id or str(uuid.uuid4()), "user_id": user_id, "event_type": event_type,
             "event_ts": (event_time or datetime.now(timezone.utc)).isoformat()}
    p.produce("user-events", key=user_id, value=json.dumps(event))
    return event

for i in range(1000):
    e = send(f"u{i % 20}", ["view", "click", "purchase"][i % 3])
    if i == 500:
        send(e["user_id"], e["event_type"], event_id=e["event_id"])   # an application-level retry
    time.sleep(0.05)
p.flush()
```

The idempotent producer stops duplicates caused by **producer retries** within a partition. It cannot stop the application sending the same business event twice, which is why every event carries its own `event_id` and the pipeline deduplicates on it.

## Step 3: develop the logic on a local stream

Streaming logic is easier to test against a folder of JSON files, which Spark reads as a stream exactly like a topic: each new file is new input. The same parsing and sinks work unchanged with the Kafka source in Step 6. Three "deliveries" are written:

- batch 1: five events between 10:00 and 10:02;
- batch 2: a **duplicate** of `e3` and a new event at 10:05, which moves the watermark to 10:03;
- batch 3: a new event at 10:06 (watermark 10:04);
- batch 4: `e7`, which happened at 10:01 and is now **later than the watermark**.

```python
import json, os, tempfile, time
from pyspark.sql import SparkSession, functions as F, types as T
from delta import configure_spark_with_delta_pip
from delta.tables import DeltaTable

builder = (SparkSession.builder.master("local[2]").appName("events-stream")
           .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
           .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
           .config("spark.sql.shuffle.partitions", "2")
           .config("spark.sql.session.timeZone", "UTC")
           .config("spark.ui.showConsoleProgress", "false"))
spark = configure_spark_with_delta_pip(builder).getOrCreate()
spark.sparkContext.setLogLevel("ERROR")

BASE = tempfile.mkdtemp()
INBOX = os.path.join(BASE, "inbox")          # stands in for the Kafka topic
os.makedirs(INBOX)
RAW, AGG = os.path.join(BASE, "events_raw"), os.path.join(BASE, "events_per_minute")

def deliver(name, events, mtime):
    path = os.path.join(INBOX, name)
    with open(path, "w") as f:
        f.write("\n".join(json.dumps(e) for e in events) + "\n")
    os.utime(path, (mtime, mtime))           # the file source orders new files by modification time

def ev(eid, ts, etype="view", user="u1"):
    return {"event_id": eid, "user_id": user, "event_type": etype, "event_ts": f"2026-10-05T{ts}:00Z"}

deliver("batch1.json", [ev("e1", "10:00"), ev("e2", "10:00", "click"), ev("e3", "10:01"),
                        ev("e4", "10:01", "click"), ev("e5", "10:02")], 1_000)
deliver("batch2.json", [ev("e3", "10:01"), ev("e6", "10:05")], 2_000)
deliver("batch3.json", [ev("e8", "10:06", "click")], 3_000)
deliver("batch4.json", [ev("e7", "10:01")], 4_000)
print(sorted(os.listdir(INBOX)))
```

```text
['batch1.json', 'batch2.json', 'batch3.json', 'batch4.json']
```

## Step 4: land raw events idempotently

The plain Delta sink is idempotent per micro-batch (it records the batch id), but it appends whatever arrives, so an application retry or a replay from an earlier offset still creates duplicates. Merging on `event_id` inside `foreachBatch` makes the write idempotent **by business key**, whatever happens upstream.

```python
SCHEMA = T.StructType([T.StructField("event_id", T.StringType()), T.StructField("user_id", T.StringType()),
                       T.StructField("event_type", T.StringType()), T.StructField("event_ts", T.TimestampType())])

def source():
    return (spark.readStream.schema(SCHEMA).option("maxFilesPerTrigger", 1).json(INBOX))

DeltaTable.createIfNotExists(spark).location(RAW).addColumns(SCHEMA).execute()

def merge_raw(batch_df, batch_id):
    updates = batch_df.dropDuplicates(["event_id"])          # duplicates inside this micro-batch
    (DeltaTable.forPath(spark, RAW).alias("t")
        .merge(updates.alias("s"), "t.event_id = s.event_id")
        .whenNotMatchedInsertAll()
        .execute())

def run_raw(checkpoint):
    q = (source().writeStream.foreachBatch(merge_raw)
         .option("checkpointLocation", checkpoint)
         .trigger(availableNow=True).start())
    q.awaitTermination()
    return len(q.recentProgress)

batches = run_raw(os.path.join(BASE, "_chk", "raw"))
raw = spark.read.format("delta").load(RAW)
print("micro-batches:", batches, "| raw rows:", raw.count(), "| distinct ids:", raw.select("event_id").distinct().count())
```

```text
micro-batches: 4 | raw rows: 8 | distinct ids: 8
```

`trigger(availableNow=True)` processes everything available and stops, which is handy for tests and for cheap scheduled runs; in production use `processingTime="1 minute"`. `maxFilesPerTrigger=1` makes each file its own micro-batch here, the way Kafka offsets are split into batches by `maxOffsetsPerTrigger`.

## Step 5: watermarked, deduplicated aggregates

The watermark is "maximum event time seen minus 2 minutes". It does two jobs: it lets Spark **drop state** for windows that can no longer change, and it defines which events are **too late** for the aggregation. `dropDuplicatesWithinWatermark` deduplicates by `event_id` with state bounded by the same watermark.

```python
DeltaTable.createIfNotExists(spark).location(AGG) \
    .addColumn("window_start", "TIMESTAMP").addColumn("event_type", "STRING").addColumn("events", "BIGINT").execute()

def upsert_agg(batch_df, batch_id):
    rows = batch_df.select(F.col("window.start").alias("window_start"), "event_type", F.col("count").alias("events"))
    (DeltaTable.forPath(spark, AGG).alias("t")
        .merge(rows.alias("s"), "t.window_start = s.window_start AND t.event_type = s.event_type")
        .whenMatchedUpdate(set={"events": "s.events"})          # update mode emits the new total
        .whenNotMatchedInsertAll()
        .execute())

def run_agg(checkpoint):
    q = (source()
         .withWatermark("event_ts", "2 minutes")
         .dropDuplicatesWithinWatermark(["event_id"])
         .groupBy(F.window("event_ts", "1 minute"), "event_type").count()
         .writeStream.outputMode("update").foreachBatch(upsert_agg)
         .option("checkpointLocation", checkpoint)
         .trigger(availableNow=True).start())
    q.awaitTermination()
    dropped = sum(op.get("numRowsDroppedByWatermark", 0)
                  for p in q.recentProgress for op in p.get("stateOperators", []))
    return dropped

dropped = run_agg(os.path.join(BASE, "_chk", "agg"))
print("rows dropped by watermark:", dropped)
for r in spark.read.format("delta").load(AGG).orderBy("window_start", "event_type").collect():
    print(r.window_start.strftime("%H:%M"), r.event_type, r.events)
```

```text
rows dropped by watermark: 1
10:00 click 1
10:00 view 1
10:01 click 1
10:01 view 1
10:02 view 1
10:05 view 1
10:06 click 1
```

What happened:

- The duplicate `e3` in batch 2 was removed, so 10:01 views is 1, not 2.
- `e7` (10:01) arrived after the watermark had passed 10:03, so the stateful operators ignored it and the progress metrics counted it as dropped. Note the timing: Spark decides which rows are too late using the watermark **from the previous micro-batch**, so an event is dropped only once a whole batch has completed with the watermark beyond it. That is why the late event is delivered in batch 4 here; in batch 3 it would still have been counted. It **is** in `events_raw`, because the raw query has no watermark. A nightly batch over raw can restate closed windows if those events matter.
- Each emitted row is the window's **full new total** (update mode), so the MERGE overwrites the stored value. Appending emissions instead would double count every revised window.

## Step 6: prove recovery and replay

Two different situations to test:

1. **Restart with the same checkpoint** (a crash or deployment). The checkpoint's offset and commit logs say everything was processed, so nothing is reprocessed.
2. **Replay with a new checkpoint** (for example after a bug fix, reading the topic from the earliest offset). Everything is reprocessed, and the MERGE keys make it harmless.

```python
def snapshot():
    r = spark.read.format("delta").load(RAW).count()
    a = sorted((x.window_start.isoformat(), x.event_type, x.events)
               for x in spark.read.format("delta").load(AGG).collect())
    return r, a

before = snapshot()
print("restart, same checkpoint, micro-batches run:", run_raw(os.path.join(BASE, "_chk", "raw")))
run_agg(os.path.join(BASE, "_chk", "agg"))
print("unchanged after restart:", snapshot() == before)

print("replay, new checkpoint, micro-batches run:", run_raw(os.path.join(BASE, "_chk", "raw_replay")))
run_agg(os.path.join(BASE, "_chk", "agg_replay"))
print("unchanged after full replay:", snapshot() == before)

closed = (spark.read.format("delta").load(RAW)
          .filter(F.col("event_id") != "e7")                       # the documented late drop
          .groupBy(F.date_trunc("minute", "event_ts").alias("w"), "event_type").count())
agg = spark.read.format("delta").load(AGG)
mismatch = closed.join(agg, (closed.w == agg.window_start) & (closed.event_type == agg.event_type), "full") \
                 .filter(F.col("count").isNull() | F.col("events").isNull() | (F.col("count") != F.col("events"))).count()
print("aggregate vs raw recount mismatches:", mismatch)
```

```text
restart, same checkpoint, micro-batches run: 1
unchanged after restart: True
replay, new checkpoint, micro-batches run: 4
unchanged after full replay: True
aggregate vs raw recount mismatches: 0
```

The replay produced identical aggregates here because the files are re-read in the same order, so the watermark moves the same way. With Kafka, a replay can read partitions at different speeds and the watermark can then drop a slightly different set of late events. That is the honest answer to "is it exactly once?": raw landing is effectively exactly once by key; windowed aggregates are deterministic only up to the late-data policy, which is why the batch recount (as above) is the reference for closed windows.

## Step 7: switch the source to Kafka

Only the source changes: parse the Kafka `value` with the same schema.

<!-- noexec -->
```python
# spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.13:4.2.0,io.delta:delta-spark_2.13:4.0.0 ...
def source():
    return (spark.readStream.format("kafka")
            .option("kafka.bootstrap.servers", "localhost:9092")
            .option("subscribe", "user-events")
            .option("startingOffsets", "earliest")       # only used when the checkpoint is new
            .option("maxOffsetsPerTrigger", 10000)        # bound each micro-batch after an outage
            .option("failOnDataLoss", "true")
            .load()
            .select(F.from_json(F.col("value").cast("string"), SCHEMA).alias("e"),
                    "partition", "offset")
            .select("e.*", "partition", "offset"))

# then .trigger(processingTime="1 minute") instead of availableNow
```

Match the Kafka connector package to your Spark and Scala versions. Keep `partition` and `offset` on raw rows: they make debugging and reconciliation with the topic exact. Measure end-to-end latency as the difference between `current_timestamp()` at write time and `event_ts`, and record p50 and p95 from your runs.

## Common mistakes

- **Deleting or sharing a checkpoint**: deleting it makes Spark treat the stream as new; two queries must never share one.
- **Plain append for raw events** and assuming the sink's batch-level idempotency removes business duplicates.
- **Appending update-mode aggregate rows**, which double counts revised windows.
- **No watermark**, so deduplication and window state grow forever.
- **Changing the query shape** (grouping keys, stateful operators) and restarting on the old checkpoint; check the Structured Streaming rules on allowed changes, or start a new checkpoint and replay.
- **`failOnDataLoss=false`** to silence an error, which hides data lost to Kafka retention.

## Explaining it in an interview

"Events go from Kafka to two Structured Streaming queries. The raw query merges each micro-batch into Delta on `event_id`, so retries and replays cannot create duplicates. The aggregation query uses a two-minute watermark with `dropDuplicatesWithinWatermark` and one-minute event-time windows, and upserts each window's new total by key. I tested a restart on the same checkpoint, a full replay on a new checkpoint and a late event: raw and aggregates were unchanged, and the late event was in raw but counted as dropped by the aggregation. Closed windows reconcile with a batch recount from raw."

Questions to prepare: *What is in the checkpoint?* (offset log written before each batch, commit log after it, and state store files for stateful operators). *Exactly once?* (source replay + checkpoint + idempotent sink gives exactly-once effect for raw; aggregates also depend on the late-data policy). *Why a 2-minute watermark?* (a latency-versus-completeness trade-off; measure how late events really are and set it from that distribution).

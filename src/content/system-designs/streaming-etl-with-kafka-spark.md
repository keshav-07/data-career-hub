---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Streaming ETL Pipeline with Kafka and Spark"
seoTitle: "Design a Streaming ETL with Kafka and Spark"
description: "A system-design case study for streaming ETL: Kafka ingestion, Spark Structured Streaming, exactly-once writes to Delta, late data, schema changes and recovery."
technology: ["data-engineering", "kafka", "spark"]
topic: ["streaming", "architecture", "exactly-once"]
tags: ["kafka", "spark-structured-streaming", "delta-lake", "checkpointing", "backpressure"]
difficulty: "Advanced"
problem: "Design a streaming ETL pipeline that reads application events from Kafka, cleans, enriches and deduplicates them with Spark Structured Streaming, and lands them in lakehouse tables that analysts can query within a few minutes, without losing or double-counting events."
functionalRequirements:
  - "Consume JSON or Avro events from several Kafka topics (orders, page views, account changes)"
  - "Validate, parse and normalise events into typed bronze and silver tables"
  - "Deduplicate events retried by producers or replayed after failures"
  - "Enrich events with slowly changing reference data (products, accounts)"
  - "Route malformed events to a dead-letter table without stopping the stream"
  - "Support replay of any time range from retained Kafka data or the bronze table"
nonFunctionalRequirements:
  - "Data queryable in silver tables within 5 minutes of the event being produced, for 99% of events"
  - "No data loss and no duplicates in silver tables after restarts or redeploys"
  - "Survive a 3× traffic burst without manual intervention, accepting temporarily higher latency"
  - "Schema changes from producers must not silently corrupt or drop data"
  - "Personal fields encrypted or tokenised before they reach analyst-readable tables"
scaleAssumptions:
  - "Assumption: 50,000 events per second on average, 200,000 at peak"
  - "Assumption: about 1 KB per event before compression, so roughly 4.3 TB of raw events a day"
  - "Assumption: three source topics, 48 partitions each, 3 days of Kafka retention"
  - "Assumption: reference data of a few million rows that changes a few thousand times a day"
architectureSummary: "Producers write keyed events to Kafka. One Spark Structured Streaming job per domain lands raw records in an append-only bronze Delta table; a second job parses, validates, deduplicates and enriches into silver tables using foreachBatch with idempotent MERGE. Checkpoints track offsets, a schema registry governs payloads, and bad records go to a dead-letter table."
technologies: ["Apache Kafka (KRaft mode)", "Schema registry (Avro or Protobuf)", "Spark Structured Streaming", "Delta Lake (or Apache Iceberg)", "Object storage", "Orchestrator for compaction and backfills", "Metrics and alerting stack"]
tradeoffs:
  - decision: "Two hops: raw bronze append, then a separate silver job"
    alternative: "One job that parses and writes the final table directly"
    reason: "Bronze is a cheap, replayable copy of exactly what Kafka delivered, so silver logic can be fixed and rerun without depending on Kafka retention"
    consequence: "Extra storage and a second job to run; end-to-end latency is the sum of two triggers"
  - decision: "Micro-batch triggers of about one minute"
    alternative: "Very short triggers or Spark's lower-latency modes"
    reason: "The requirement is minutes, not seconds; larger batches give bigger files, cheaper commits and simpler MERGE logic"
    consequence: "Not suitable if a later consumer needs sub-second latency"
  - decision: "Deduplicate with MERGE on event_id inside foreachBatch"
    alternative: "dropDuplicatesWithinWatermark on the stream only"
    reason: "MERGE catches duplicates across any time gap, including replays days later"
    consequence: "MERGE cost grows with the target table, so the match condition must prune to recent partitions"
  - decision: "Broadcast-join enrichment against a periodically refreshed reference snapshot"
    alternative: "Stream-stream join with a reference CDC topic"
    reason: "Reference data is small and slowly changing; a static join is simple and stateless"
    consequence: "Enrichment can be stale by up to the refresh interval; late corrections need a reconciliation job"
  - decision: "Dead-letter table for unparseable records"
    alternative: "Fail the query on the first bad record"
    reason: "One malformed producer should not stop all downstream data"
    consequence: "Someone must own and alert on the dead-letter table, or bad data piles up unseen"
interviewFollowUps:
  - "Your silver job has been failing for six hours and Kafka retention is three days. Walk me through recovery."
  - "How do you guarantee no duplicates in silver if the job crashes after writing but before committing the checkpoint?"
  - "A producer adds a required field and renames another. What happens in your pipeline?"
  - "How would you change the design if the business now wants 5-second latency for one topic?"
  - "How do you pick the number of Kafka partitions and Spark shuffle partitions?"
  - "How would you reprocess the last 30 days after fixing a parsing bug?"
related:
  - "system-designs:kafka-ingestion-system"
  - "system-designs:real-time-analytics-pipeline"
  - "projects:kafka-spark-delta-streaming"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "interview-questions:kafka/at-least-once-delivery"
versionContext: "Written against Apache Kafka 4.x (KRaft only), Spark 4.x Structured Streaming and Delta Lake documentation. The PySpark snippet needs a Kafka broker and Delta, so it was not executed here."
next: "system-designs:near-zero-downtime-migration"
sources:
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
  - { label: "Delta Lake: table streaming reads and writes", url: "https://docs.delta.io/delta-streaming/" }
  - { label: "Apache Kafka 4.0.0 release announcement", url: "https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/" }
previous: "system-designs:data-mesh-architecture"
---

## Approach

Streaming ETL questions test whether you can keep data **correct** while it moves continuously: no loss, no duplicates, sensible handling of late and malformed data, and a way to recover. Start by pinning down the requirements, because "real time" means very different things to different people.

Clarifying questions to ask:

- **Latency**: how fresh must the data be, and for whom? Minutes for analysts is a different system from sub-second for fraud scoring.
- **Correctness**: can downstream tolerate duplicates or short gaps? Are there financial numbers built on this data?
- **Volume and shape**: events per second at average and peak, event size, number of topics, and how bursty traffic is.
- **Keys and ordering**: is there a stable unique event id? Does order matter per user or per order?
- **Producers**: who owns them, what serialisation do they use, and how often do schemas change?
- **Late data**: how late can events arrive (mobile clients offline for hours are common)?
- **Retention and replay**: how long does Kafka keep data, and how far back might you need to reprocess?
- **Consumers**: who reads the output, and with which engine?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> serialise events against a registered schema and publish to Kafka, keyed by entity id (order id, user id), with idempotent producer settings.</li>
<li><strong>Kafka</strong> holds each topic in 48 partitions with replication factor 3 and 3 days of retention, giving ordering per key and a replay buffer.</li>
<li><strong>Bronze job</strong> (Spark Structured Streaming) reads all topics and appends raw bytes plus Kafka metadata (topic, partition, offset, timestamp) to a bronze Delta table, partitioned by ingest date.</li>
<li><strong>Silver job</strong> reads bronze as a stream, decodes payloads, validates them, routes failures to a dead-letter table, enriches with reference data and MERGEs into silver tables on event id.</li>
<li><strong>Table maintenance</strong>: scheduled compaction, clustering and old-version clean-up keep files healthy.</li>
<li><strong>Consumers</strong>: analysts, dbt models and downstream jobs read silver tables; gold aggregates are built from silver.</li>
</ol>
<figcaption>Two streaming hops separate "store what arrived" from "make it correct", so silver can always be rebuilt from bronze.</figcaption>
</figure>

Walkthrough:

1. **Producers** are the first line of correctness. With `enable.idempotence=true` and `acks=all` (defaults in current Kafka clients), a producer retry does not create a duplicate within a partition. That does not help if the application itself sends the same business event twice, so every event also carries a **unique `event_id`** generated at the source.
2. **Kafka** decouples producers from the pipeline. If Spark is down for an hour, events wait in Kafka rather than being lost. Kafka 4.0 removed ZooKeeper entirely, so a new cluster runs in KRaft mode.
3. **Bronze** is deliberately dumb. It stores the raw `value` bytes, the key, headers and Kafka coordinates. Because it does no parsing, it almost never fails, and it extends replay beyond Kafka retention.
4. **Silver** is where business rules live. It reads bronze incrementally, so a bug fix means restarting silver from a chosen bronze version, not re-reading Kafka.
5. **Maintenance** jobs run on a schedule outside the streaming jobs so compaction never competes with ingestion latency.

## Data model and storage layout

**Bronze table** (one per domain or one shared):

| Column | Type | Purpose |
|---|---|---|
| `topic`, `partition`, `offset` | string, int, bigint | Exact Kafka position; unique together |
| `kafka_ts` | timestamp | Broker or producer timestamp |
| `key`, `value` | binary | Untouched payload |
| `headers` | array | Schema id, trace id, producer name |
| `ingest_date` | date | Partition column |

**Silver table** (for example `silver.orders`):

- Typed business columns, plus `event_id`, `event_ts` (from the payload), `ingest_ts`, `schema_version` and lineage columns (`src_topic`, `src_partition`, `src_offset`).
- Partitioned or clustered by `event_date` (derived from event time, because that is how analysts filter). Avoid partitioning by high-cardinality columns such as user id.
- Target file sizes in the hundreds of megabytes. One-minute triggers on 48 partitions create many small files; schedule compaction (`OPTIMIZE` in Delta) for recent partitions every hour or so.

Why event date for silver but ingest date for bronze? Bronze is about operations ("replay what arrived on Tuesday"), silver is about analysis ("orders placed on Tuesday").

## Ingestion and backpressure

Kafka is the buffer. Spark does not push back on producers; it simply reads more slowly than they write, and **consumer lag** grows. The design must make that safe and visible:

- **Bound each micro-batch** with `maxOffsetsPerTrigger` so that after an outage the first batch does not try to read three days of data at once and run out of memory. Size it so a batch finishes comfortably within the trigger interval at peak.
- **Parallelism**: Spark creates at least one task per Kafka partition. `minPartitions` can split large partitions further. More Kafka partitions than you need today gives room to scale consumers later, because you cannot easily repartition a keyed topic without breaking per-key ordering.
- **Retention is your outage budget**. With 3 days of retention, the bronze job can be down for less than 3 days before data is lost. Alert long before that, for example when lag exceeds 30 minutes.
- **Catch-up rate**: the cluster must process faster than the peak arrival rate, or lag never recovers. Plan for roughly 2× headroom over peak for catch-up.
- `failOnDataLoss` should stay `true` in production. If offsets you need were deleted by retention, you want the job to stop loudly, not skip data silently.

## Exactly-once and idempotency

"Exactly once" in this pipeline means **each event appears exactly once in silver**, even though individual steps may run more than once.

How it fits together:

1. **Source replay**: Spark records the offset range of each micro-batch in the checkpoint's offset log *before* processing it. After a crash it re-runs the same range.
2. **Sink idempotency**: the built-in Delta sink records the stream's batch id in the table transaction log, so a re-run batch is skipped rather than appended twice.
3. **foreachBatch writes are not idempotent by default**. If silver uses `foreachBatch` (needed for MERGE), pass `txnAppId` and `txnVersion` (the batch id) on Delta writes, or make the write itself idempotent with MERGE on `event_id`.
4. **Business duplicates** (the same event sent twice by the app, or a replay from bronze) are handled by MERGE on `event_id`, which is idempotent no matter how often it runs.

<!-- noexec -->
```python
def upsert_orders(batch_df, batch_id):
    deduped = batch_df.dropDuplicates(["event_id"])  # duplicates inside this batch
    deduped.createOrReplaceTempView("updates")
    batch_df.sparkSession.sql("""
        MERGE INTO silver.orders t
        USING updates s
          ON t.event_id = s.event_id
         AND t.event_date >= date_sub(current_date(), 7)   -- prune: only recent partitions
        WHEN NOT MATCHED THEN INSERT *
    """)

(silver_stream.writeStream
    .foreachBatch(upsert_orders)
    .option("checkpointLocation", "s3://lake/_checkpoints/silver_orders")
    .trigger(processingTime="1 minute")
    .start())
```

The pruning predicate is a deliberate trade-off: duplicates more than seven days apart would slip through. Agree that window with the business, and catch anything older with a daily batch check.

## Late data and event time

Silver keeps **every** event, however late, because it is keyed by `event_id` and partitioned by event date: a late event simply lands in an older partition. Lateness only matters for **stateful** steps:

- In-stream deduplication with `dropDuplicatesWithinWatermark` or windowed aggregations need a **watermark** (for example 2 hours) to bound state.
- Events later than the watermark are dropped by those stateful operators. Count them (Spark reports dropped-by-watermark rows in query progress) and decide whether that is acceptable.
- Downstream gold aggregates that read silver should be recomputed for recent event dates (for example the last 3 days) on each run, so late arrivals are included.

## Schema evolution

Uncontrolled schema change is the most common cause of streaming outages.

- **Contract at the producer**: a schema registry with a compatibility mode (usually backward or full) rejects incompatible schemas at publish time, not at 3 a.m. in Spark.
- **Bronze never breaks**: it stores bytes, so a new field cannot fail it.
- **Silver decodes with the writer's schema id** from the message header, so old and new versions can be read side by side.
- **Additive changes** (new optional field): allow schema evolution on the silver table (for example Delta `mergeSchema` or `withSchemaEvolution` on MERGE) after review, or ignore the field until a model needs it.
- **Breaking changes** (rename, type narrowing): require a new topic or a versioned field, a dual-write period, and a migration plan. Never let a rename land as "old column now null, new column appears" without anyone noticing.

## Data quality and dead letters

Validation in silver separates three outcomes:

| Outcome | Example | Action |
|---|---|---|
| Valid | All required fields present and typed | MERGE into silver |
| Recoverable | Unknown product id (reference data lags) | Insert with `product_name` null and a quality flag; a reconciliation job fills it later |
| Invalid | Unparseable bytes, missing `event_id`, negative quantity | Write to `dlq.orders` with the raw value, error reason and Kafka coordinates |

Alert on the **rate** of dead-lettered records per producer, not just the count. A sudden jump almost always means a deployment changed the payload. Because the dead-letter table keeps coordinates, fixed records can be replayed through the same MERGE.

## Security and PII

- Encrypt in transit (TLS between clients and brokers) and at rest (storage encryption). Authenticate producers and consumers (SASL or mTLS) and use topic ACLs so only the pipeline's service principal can read raw topics.
- Bronze contains raw personal data, so restrict it to the platform team. Silver tokenises or hashes direct identifiers (email, phone) with a keyed hash, and stores the mapping in a separate, tightly controlled table if re-identification is needed.
- Plan for erasure requests: deleting a user from Delta tables needs a `DELETE` followed by removing old file versions after the retention window (`VACUUM`), and Kafka retention must be short enough that raw copies expire.

## Failure modes and recovery

| Failure | What happens | Recovery |
|---|---|---|
| Executor dies mid-batch | Tasks retry on another executor | Automatic |
| Driver or job crashes | Query stops; offsets are in the checkpoint | Restart; it resumes from the last committed batch and the sink skips any batch already committed |
| Bad deploy writes wrong values to silver | Silver is wrong from time T | Fix code, restore or delete affected silver rows, restart silver from bronze at a version or timestamp before T with a **new** checkpoint (and a new `txnAppId`) |
| Kafka partition leader fails | Brief produce or consume errors | Replication (RF 3, `min.insync.replicas=2`) elects a new leader |
| Job down longer than retention | Offsets expired; `failOnDataLoss` stops the job | Recover the gap from producers or the source system; this is why lag alerts matter |
| Checkpoint deleted or corrupted | Job does not know where it was | Restart from a known timestamp; MERGE on `event_id` absorbs the overlap |

Never change stateful query logic and keep the same checkpoint without checking the Structured Streaming rules on which changes are allowed. Some changes (for example to the number of shuffle partitions or the shape of state) are incompatible with an existing checkpoint.

## Monitoring and SLAs

- **Freshness**: `now() - max(event_ts)` in silver, per topic. This is the number the SLA is written against.
- **Consumer lag** in offsets and in time, per partition.
- **Batch duration versus trigger interval**: if batches routinely take longer than the trigger, the job is falling behind.
- **Input versus processed rows per second** from `StreamingQueryProgress`.
- **Dead-letter rate**, rows dropped by watermark, and state store size.
- **Reconciliation**: an hourly count comparison between Kafka offsets consumed, bronze rows and silver rows plus dead letters.

## Cost

- Streaming clusters run all day. Right-size them for the steady state, with autoscaling for bursts, and use longer triggers where latency allows. A one-minute trigger instead of a five-second one dramatically reduces commit and file overhead.
- Compress Kafka topics (zstd or lz4) and keep retention as short as recovery needs.
- Compact small files; many small files make every downstream query slower and more expensive.
- Expire bronze after a defined period (for example 90 days) if it is only used for replay.

## Scaling to 10×

At 500,000 events per second on average:

- **Kafka**: add brokers and partitions per topic. Adding partitions changes key-to-partition mapping, so do it when ordering consumers can tolerate a short reshuffle, or create a new topic with more partitions and migrate.
- **Spark**: split the single job into one job per topic or domain, so a slow topic does not delay others, and scale executors with partitions.
- **MERGE cost**: a MERGE against a huge table becomes the bottleneck. Keep the match condition pruned to recent partitions, cluster by `event_id` or a hash of it, or move deduplication to a stateful stream operator with a watermark and append-only writes.
- **Storage**: compaction becomes a continuous workload of its own; give it a dedicated cluster.

## Capacity estimate

Assumptions: 50,000 events/s average, 200,000 peak, 1 KB per event, compression ratio about 4:1, 3 days Kafka retention, replication factor 3.

- **Ingress**: 50,000 × 1 KB = 50 MB/s average, 200 MB/s peak.
- **Daily raw volume**: 50 MB/s × 86,400 s ≈ 4.3 TB/day uncompressed, about 1.1 TB compressed.
- **Kafka disk**: 1.1 TB × 3 days × 3 replicas ≈ 10 TB, plus about 30% headroom, so plan for around 13 TB across the cluster.
- **Partitions**: if one consumer task comfortably handles about 5 MB/s of parsing and writing (an assumption to validate with a load test), peak needs 200 / 5 = 40 parallel tasks; 48 partitions per topic gives headroom.
- **Spark cores**: at least one core per Kafka partition being read concurrently, plus capacity for MERGE and shuffle, so roughly 48 to 96 cores across both jobs.
- **Delta files**: one minute at average load is about 3 GB raw, around 750 MB compressed. Spread over 48 tasks that is ~16 MB per file per batch, hence the need for compaction.
- **Bronze storage**: about 1.1 TB/day compressed; 90 days of bronze is roughly 100 TB.

## What a strong answer includes

- Clear separation between **raw capture** (bronze) and **correct, business-ready** data (silver), with the reason: replay and bug fixes.
- A precise explanation of exactly-once: replayable source plus checkpointed offsets plus idempotent sink, and why `foreachBatch` needs extra care.
- An `event_id` generated at the source, and deduplication that works across replays, not just within one batch.
- Explicit handling of late data, malformed data (dead letters) and schema changes (registry with compatibility rules).
- Concrete numbers for throughput, partitions and retention, and how retention relates to the outage you can survive.
- Monitoring tied to the SLA: freshness and lag, not just "the job is running".

## Common mistakes

- Claiming Kafka or Spark "gives exactly once" without explaining the sink side.
- Deduplicating only within a micro-batch, so retries or replays still create duplicates.
- Partitioning silver by ingest time, so analysts scanning by business date read everything.
- Letting malformed records fail the whole query, or silently dropping them.
- Setting `failOnDataLoss=false` to "fix" an error and losing data unnoticed.
- Ignoring small files until downstream queries become slow.
- Forgetting that deleting a checkpoint and restarting needs a new idempotency id, or Delta may skip writes you meant to redo.

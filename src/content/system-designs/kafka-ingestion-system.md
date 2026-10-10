---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Real-Time Streaming Platform"
description: "Kafka streaming platform system design: topics, partitions, durability, schemas, stream processing, exactly-once, multi-tenancy and disaster recovery."
inventoryId: "SYS-07"
technology: ["data-engineering", "kafka", "spark"]
topic: ["streaming", "ingestion", "architecture"]
difficulty: "Advanced"
problem: "Design a shared real-time streaming platform where hundreds of services publish domain events, platform users build stream-processing jobs on them, and the results reach the lakehouse, search, caches and alerting within seconds, reliably and with clear ownership."
functionalRequirements:
  - "Services publish domain events (orders, payments, users, devices) through a standard client"
  - "Teams create topics, schemas and consumers through self-service with platform defaults"
  - "Stateful stream processing: filtering, enrichment, windowed aggregation and stream joins"
  - "Managed connectors deliver events to the lakehouse, search, caches and databases"
  - "Consumers can replay any topic within its retention period"
  - "Invalid or unprocessable events are isolated in dead-letter topics with context"
nonFunctionalRequirements:
  - "No acknowledged event is lost when a broker or availability zone fails"
  - "p99 produce latency under 50 ms; end-to-end processing latency of a few seconds"
  - "99.95% availability for producers"
  - "Tenant isolation: one team's spike or bad client cannot starve others"
  - "Recover from a region failure with a documented RPO and RTO"
scaleAssumptions:
  - "Assumption: about 50 production topics at launch, growing to several hundred"
  - "Assumption: 200,000 events/s at peak across topics, 60,000 on average"
  - "Assumption: average event 2 KB before compression"
  - "Assumption: 3 days of local retention, 30 days via tiered storage for replay"
architectureSummary: "A multi-AZ Kafka cluster (KRaft mode, replication factor 3, min.insync.replicas 2) is the central log. Producers use idempotent, acks=all clients and register Avro or Protobuf schemas. Apache Flink (or Spark Structured Streaming) runs stateful jobs with checkpoints and transactional sinks; Kafka Connect runs managed sinks to the lakehouse and other stores. Quotas, ACLs and a self-service portal provide multi-tenancy; tiered storage provides long replay; a second region receives mirrored topics for disaster recovery."
technologies:
  - "Apache Kafka 4.x (KRaft) or a managed service (Amazon MSK, Confluent Cloud)"
  - "Schema registry with Avro or Protobuf"
  - "Apache Flink for stateful processing (Spark Structured Streaming or Kafka Streams as alternatives)"
  - "Kafka Connect for sources and sinks"
  - "Delta Lake or Iceberg as the lakehouse sink"
  - "Kafka tiered storage to object storage"
  - "MirrorMaker 2 or a managed replication feature for DR"
tradeoffs:
  - decision: "Apache Kafka as the central log"
    alternative: "Amazon Kinesis Data Streams or Google Pub/Sub"
    reason: "Open protocol, rich ecosystem (Connect, Streams, Flink), key-based ordering, compaction, transactions, and portability across clouds"
    consequence: "More to operate than a serverless stream unless you buy a managed Kafka; Kinesis is simpler for a small AWS-only team"
  - decision: "acks=all with replication factor 3 and min.insync.replicas=2"
    alternative: "acks=1 or replication factor 2"
    reason: "An acknowledged write survives the loss of any one broker or zone"
    consequence: "Higher produce latency and three times the storage and replication traffic"
  - decision: "Flink for stateful processing"
    alternative: "Spark Structured Streaming"
    reason: "Record-at-a-time processing, mature event-time and state handling, two-phase-commit sinks, low latency"
    consequence: "A second engine if batch is on Spark; Spark Structured Streaming is fine where micro-batch latency of seconds is acceptable and the team already runs Spark"
  - decision: "Schema registry with compatibility enforcement"
    alternative: "Free-form JSON"
    reason: "Producers cannot deploy a change that breaks consumers; payloads are smaller"
    consequence: "Schema changes need a process and the registry becomes a critical service"
  - decision: "Tiered storage for long retention"
    alternative: "Large local disks on every broker"
    reason: "Retention grows without adding brokers; rebalancing moves less data"
    consequence: "Reads of old data come from object storage with higher latency"
  - decision: "Quotas and per-team ACLs on a shared cluster"
    alternative: "One cluster per team"
    reason: "Shared operations and cross-team topics without copying data"
    consequence: "Noisy-neighbour risk must be controlled with quotas and capacity planning"
interviewFollowUps:
  - "How many partitions would you give a 50 MB/s topic, and what happens if you need more later?"
  - "A consumer group has fallen six hours behind. How do you diagnose and recover?"
  - "How do you get exactly-once results from Kafka into a lakehouse table?"
  - "Kafka or Kinesis for this company, and why?"
  - "A producer starts sending malformed events. What protects downstream consumers?"
  - "An availability zone fails. What happens to producers, consumers and in-flight transactions?"
related:
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:kafka/kafka-real-time-data-engineering"
  - "articles:kafka/kafka-vs-message-queues"
  - "interview-questions:kafka/at-least-once-delivery"
  - "projects:kafka-spark-delta-streaming"
  - "system-designs:change-data-capture-platform"
previous: "system-designs:change-data-capture-platform"
next: "system-designs:event-driven-architecture"
versionContext: "Design discussion based on Apache Kafka 4.x (KRaft only) and Apache Flink 2.x behaviour; configuration snippets are illustrative and were not executed."
sources:
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Apache Kafka 3.9.0 release announcement (tiered storage production ready)", url: "https://kafka.apache.org/blog/2024/11/06/apache-kafka-3.9.0-release-announcement/" }
  - { label: "Apache Flink 2.0.0 release announcement", url: "https://flink.apache.org/2025/03/24/apache-flink-2.0.0-a-new-era-of-real-time-data-processing/" }
  - { label: "Kinesis Data Streams FAQs", url: "https://aws.amazon.com/kinesis/data-streams/faqs/" }
  - { label: "Confluent: Kafka transactions and exactly-once", url: "https://developer.confluent.io/courses/architecture/transactions/" }
---

## Approach

A streaming platform is a product used by many teams, so the interviewer is listening for **guarantees, standards and isolation**, not just "put Kafka in the middle". Clarify:

- **What are the main use cases?** Event-driven microservices, analytics ingestion, real-time features, alerting? Each sets different latency and ordering needs.
- **Volume and shape**: events per second at peak, event size, number of topics, number of producing and consuming teams.
- **Latency targets**: sub-second for fraud scoring, seconds for dashboards, minutes for lakehouse ingestion.
- **Durability and ordering**: can any event be lost? Is per-entity ordering required?
- **Retention and replay**: how far back must consumers be able to re-read?
- **Cloud and operations model**: self-managed Kafka, managed Kafka, or a cloud-native stream?
- **Disaster recovery**: is a region failure in scope, and what RPO is acceptable?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong>: services use a platform client library (idempotent, <code>acks=all</code>, compression) and serialise with schemas from the registry.</li>
<li><strong>Kafka cluster</strong>: brokers spread across three availability zones in KRaft mode; topics replicated three times with rack-aware placement; tiered storage for older segments.</li>
<li><strong>Schema registry</strong>: one subject per topic value, compatibility enforced on registration.</li>
<li><strong>Stream processing</strong>: Flink jobs (filter, enrich, aggregate, join) with checkpoints to object storage, writing results to new topics or transactional sinks.</li>
<li><strong>Kafka Connect</strong>: managed sinks to the lakehouse (Delta or Iceberg), search, key-value caches and databases; dead-letter topics for failures.</li>
<li><strong>Control plane</strong>: self-service portal and GitOps for topics, ACLs, quotas and schemas; monitoring and lag alerting; mirroring to a DR region.</li>
</ol>
<figcaption>Kafka is the durable, replayable log; processing and delivery are decoupled consumers that each keep their own position.</figcaption>
</figure>

An order service publishes `orders.order_placed` keyed by `order_id`. The client waits until two of three replicas have the record, then returns. Three consumer groups read it independently: a Flink job that enriches orders with customer data and writes `orders.order_enriched`, a Connect sink that appends to the lakehouse bronze table, and a fraud-scoring job. Each commits its own offsets, so a slow lakehouse sink never slows the fraud job. If the sink is broken for an hour, it resumes from its committed offset when fixed.

## Choosing the log: Kafka, Kinesis or Pub/Sub

| | Apache Kafka (self-managed or MSK / Confluent) | Amazon Kinesis Data Streams | Google Pub/Sub |
|---|---|---|---|
| Scaling unit | Partitions on brokers you size | Shards (each 1 MB/s or 1,000 records/s in, 2 MB/s out) or on-demand mode | Fully managed, no partitions to size |
| Ordering | Per partition, by key | Per shard, by partition key | Per ordering key when enabled |
| Retention | Configurable; long with tiered storage; compacted topics | 24 hours default, up to 365 days | Configurable, shorter by design |
| Ecosystem | Connect, Streams, Flink, Spark, transactions | Strong AWS integration (Lambda, Firehose) | Strong GCP integration (Dataflow) |
| Operations | Highest unless managed | Low | Lowest |

For a multi-team platform with hundreds of topics, compaction, transactions and portability, Kafka is the usual choice. For a small AWS-only team that wants zero broker operations, Kinesis is a perfectly good answer; say so.

## Topic and partition design

- **Naming**: `<domain>.<entity>.<event>` (for example `payments.payment.authorised`), with owner, retention and schema registered in the portal.
- **Keys**: the entity whose events must stay ordered (order id, account id). Never use personal data as a key: keys are visible in logs and tools.
- **Partition count**: size for peak throughput and consumer parallelism with headroom. A useful rule is to plan for a per-partition throughput well below what a single consumer can process (for example 5–10 MB/s), then double for growth. Adding partitions later remaps keys to partitions, breaking ordering for existing keys, so pick generously up front for keyed topics.
- **Retention**: by replay need. Compacted topics (latest value per key) for reference data such as customer profiles.
- **Event envelope**: `event_id` (UUID), `event_type`, `event_time`, `producer`, `schema_version`, plus payload. `event_id` is what consumers deduplicate on.

## Durability and availability

- Replication factor 3, `min.insync.replicas=2`, brokers rack-aware across three zones. A write is acknowledged only when two replicas have it, so one zone can fail without losing acknowledged data and without blocking producers.
- `unclean.leader.election.enable` set to `false`, so an out-of-date replica never becomes leader and silently drops data.
- Producers: idempotence has been the default since Kafka 3.0 (it prevents duplicates from producer retries within a partition); keep `acks=all` and set a bounded `delivery.timeout.ms` so callers learn about failures.
- Kafka 4.x runs only in KRaft mode: metadata lives in a Raft quorum of controllers instead of ZooKeeper. Run three or five controllers across zones.

## Schemas and contracts

Every topic has a registered schema (Avro or Protobuf) with a compatibility mode. **Backward** compatibility (the registry default) lets consumers upgrade first; **full transitive** is safer for long-retention topics read by many consumers, because any old event must stay readable. Breaking changes go to a new topic version (`orders.order_placed.v2`) with a migration period. Validate in CI: a pull request that changes a schema runs a compatibility check against the registry before deploy.

## Stream processing: Flink or Spark Structured Streaming

| | Apache Flink | Spark Structured Streaming | Kafka Streams |
|---|---|---|---|
| Model | Record at a time, continuous | Micro-batch by default; Spark 4.1 added a real-time mode, initially limited to stateless queries | Library inside your service |
| State | Large keyed state, RocksDB or ForSt (disaggregated state in Flink 2.0) | State store per micro-batch, RocksDB provider | Local RocksDB plus changelog topics |
| Event time | Watermarks, allowed lateness, side outputs for late data | Watermarks, append and update output modes | Grace periods on windows |
| Exactly-once | Checkpoints plus two-phase-commit sinks | Checkpoints plus idempotent or transactional sinks | Kafka transactions (`exactly_once_v2` processing guarantee) |
| Best fit | Low-latency stateful pipelines, CEP | Teams already on Spark, unified batch and streaming, lakehouse writes | Kafka-to-Kafka microservices |

Offer Flink as the platform's default stateful engine, Spark Structured Streaming for lakehouse ingestion jobs owned by Spark teams, and Kafka Streams for service teams that want a library. Standardise checkpoint storage, metrics and deployment for all three.

## Exactly-once and idempotency

"Exactly-once" means exactly-once **effect** on state, achieved by combining pieces:

- **Kafka to Kafka**: transactional producers write outputs and consumer offsets atomically; downstream consumers set `isolation.level` to `read_committed` (the default is `read_uncommitted`) so they never see aborted writes.
- **Kafka to lakehouse**: Flink's or Spark's checkpoint records source offsets; the sink commits files to Delta or Iceberg in the same checkpoint cycle, so a restart neither loses nor duplicates a batch.
- **Kafka to external systems** (databases, APIs): use idempotent writes keyed by `event_id` or a natural key, because those systems do not join Kafka transactions.

## Dead letters and poison messages

A consumer that throws on one bad record must not stop the partition forever. Validate at deserialisation, route failures to `<topic>.dlq` with headers (error, original topic, partition, offset, consumer), and continue. Alert on DLQ rate. Provide a replay tool that re-publishes fixed records to the original topic. For transient errors (a downstream API timing out), retry with backoff first; only permanent failures go to the DLQ.

## Multi-tenancy and isolation

- **ACLs** per principal: services may only produce to their own topics and read what they are granted.
- **Quotas** on produce and fetch bytes per client id or user, so a runaway batch job cannot saturate brokers.
- **Separate clusters** for very different workloads (a high-volume logging cluster versus a critical payments cluster), rather than one giant cluster.
- **Chargeback** by bytes in, bytes out and storage per team.

## Security

TLS everywhere, SASL/OAuth or mTLS authentication, per-topic ACLs, encryption at rest on brokers and tiered storage. Classify topics; topics containing personal data have shorter retention and restricted consumers. Audit ACL changes through GitOps.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| One broker fails | Leaders move to replicas in seconds | Automatic; replace broker; reassign partitions |
| One availability zone fails | Two of three replicas remain; `acks=all` still succeeds with `min.insync.replicas=2` | Automatic; capacity must allow the remaining zones to carry full load |
| Consumer lag grows | Stale downstream data | Check per-partition lag; scale consumers up to partition count; look for a hot partition or slow sink |
| Poison message | Consumer crash loop | DLQ handling; skip offset only with an audit record |
| Region failure | Cluster unavailable | Fail producers and consumers over to the mirrored cluster; offsets translated by the mirroring tool; RPO equals mirroring lag |
| Flink job failure | Processing pauses | Restart from last checkpoint; savepoints for upgrades |

## Scaling to 10×

At 2 million events/s (about 4 GB/s before compression):

- Add brokers and spread partitions; split the largest topics across dedicated clusters.
- Use compression (zstd or lz4) and batching (`linger.ms`) on producers, which usually reduces network and disk by several times.
- Keep local retention short and rely on tiered storage for replay.
- Scale Flink with more parallelism; move very large state to Flink 2.0's disaggregated state backend or redesign keys to avoid hot spots.
- Revisit partition counts for keyed topics before the growth arrives, since repartitioning keyed topics later is disruptive.

## Monitoring and SLAs

- Broker: under-replicated partitions, offline partitions, request latency p99, disk and network usage, controller health.
- Producers: error rate, retries, produce latency.
- Consumers: lag per group and partition, and lag **growth rate** (absolute lag can be normal for batch consumers).
- Flink: checkpoint duration and failures, backpressure, watermark delay.
- Platform SLOs: produce availability 99.95%, p99 produce latency under 50 ms, critical pipelines end-to-end under 5 seconds.

## Capacity estimate

- **Peak ingress**: 200,000 events/s × 2 KB = 400 MB/s before compression. Assume producer compression of 3× → about 135 MB/s on the wire.
- **Replicated write load**: 135 MB/s × 3 replicas ≈ 400 MB/s of disk writes across the cluster at peak.
- **Local storage**: average 60,000 events/s × 2 KB ÷ 3 (compression) ≈ 40 MB/s × 86,400 s ≈ 3.5 TB/day; × 3 days × 3 replicas ≈ 31 TB of local disk, plus 30% headroom ≈ 40 TB.
- **Tiered storage**: 3.5 TB/day × 30 days ≈ 105 TB in object storage (stored once, not three times).
- **Brokers**: assume a conservative planning figure of about 40 MB/s of compressed produce per broker to leave room for replication, consumers and failover. 135 MB/s ÷ 40 ≈ 4 brokers at peak; with zone failure tolerance (survive losing a third of brokers) and growth, start with 9 brokers (3 per zone).
- **Partitions**: at about 5 MB/s per partition, 400 MB/s uncompressed peak needs about 80 partitions across the busiest topics; with 50 topics and headroom, roughly 600–1,000 partitions in total, well within KRaft cluster limits.

## What a strong answer includes

- Clear **delivery guarantees** at each hop and how they combine into effectively-once results.
- **Durability settings** (RF 3, `min.insync.replicas=2`, `acks=all`, no unclean election) tied to zone failure.
- **Partition and key design** with the reason partitions are hard to add later.
- **Schemas** with compatibility rules and a CI check.
- A reasoned **processing engine choice** and when the alternative is better.
- **Multi-tenancy**: ACLs, quotas, self-service with defaults, chargeback.
- **Operations**: lag monitoring, DLQs, DR with an explicit RPO.

## Common mistakes

- Saying "Kafka gives exactly-once" without explaining transactions, `read_committed` and sink idempotency.
- Using `acks=1` or replication factor 2 and still claiming no data loss.
- Choosing partitions from today's volume, then needing to add them to a keyed topic.
- Letting one bad record crash-loop a consumer instead of using a DLQ.
- One giant shared cluster with no quotas.
- Alerting on absolute consumer lag only, which pages people for normal batch consumers.
- Forgetting the control plane: topic sprawl without owners becomes unmanageable within a year.

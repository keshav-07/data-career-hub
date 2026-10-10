---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Kafka vs Kinesis vs a message queue: how do you choose?"
seoTitle: "Kafka vs Kinesis vs Message Queue: Interview"
description: "Interview answer: choose a log (Kafka or Kinesis) for replay, fan-out and per-key order, a queue (SQS, RabbitMQ) for per-message work, then decide on operations and cost."
technology: ["kafka"]
topic: ["comparison", "messaging", "architecture"]
difficulty: "Medium"
questionType: ["architecture", "conceptual"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "First choose the model. A log (Kafka, Kinesis Data Streams) retains events for a period, lets many independent consumers read the same data at their own pace, supports replay and keeps order per partition or shard; it suits event streams, CDC and feeding several systems. A queue (SQS, RabbitMQ classic queues) hands each message to one worker, acknowledges and forgets it, and retries per message with a dead-letter queue; it suits units of work like sending emails or resizing images. Between Kafka and Kinesis the choice is operational: Kinesis is fully managed and AWS-native with per-shard limits and up to 365 days of retention; Kafka (self-managed or MSK, Confluent Cloud) adds compaction, transactions, Connect, Kafka Streams, longer cheap retention with tiered storage and portability across clouds."
followUps: ["What are Kafka share groups and do they replace queues?", "How do you scale Kinesis compared with Kafka?", "How would you handle a message that fails repeatedly in each system?", "When would you put a queue behind Kafka?"]
related: ["articles:kafka/kafka-vs-message-queues", "articles:kafka/topics-partitions-consumer-groups", "interview-questions:kafka/poison-messages-dlq", "system-designs:event-driven-architecture"]
versionContext: "Kafka behaviour for Apache Kafka 4.2+ (share groups production-ready). Kinesis Data Streams, SQS and RabbitMQ behaviour as documented by their vendors in October 2026; quotas change, so check them for your region and mode."
sources:
  - { label: "Amazon Kinesis Data Streams developer guide: Quotas and limits", url: "https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html" }
  - { label: "Amazon SQS developer guide: Dead-letter queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" }
  - { label: "Apache Kafka documentation: Introduction", url: "https://kafka.apache.org/intro" }
---

## Detailed explanation

### Step 1: log or queue?

| Question | Log | Queue |
|----------|-----|-------|
| Do several systems need the same events? | Yes: one consumer group each | Needs fan-out per subscriber |
| Do you need to replay history? | Yes, within retention | Generally no |
| Must events for one entity stay in order? | Per partition or shard, by key | Usually lost with several workers (FIFO queues order per message group) |
| Do messages take very uneven time to process? | One slow record delays its partition | Any free worker takes the next message |
| Retry one failed message without blocking others? | Needs a retry or DLQ topic | Built in (visibility timeout, redelivery, DLQ) |

### Step 2: which log?

| | Apache Kafka (self-managed, MSK, Confluent Cloud) | Amazon Kinesis Data Streams |
|--|------|---------|
| Unit of scale | Partition | Shard |
| Ordering | Per partition, by key | Per shard, by partition key |
| Retention | Any duration; tiered storage keeps old segments in object storage | 24 hours by default, extendable up to 365 days |
| Capacity | Brokers, disks and partitions you size (or managed tiers) | Per-shard write and read quotas, or on-demand mode |
| Features beyond the log | Compaction, transactions and exactly-once, Kafka Connect, Kafka Streams, share groups | Enhanced fan-out per consumer; tight integration with AWS services (Lambda, Firehose) |
| Operations | You run brokers and KRaft controllers, or pay for a managed service | Fully managed, no brokers |
| Portability | Any cloud or on-premises | AWS only |

### Step 3: decide for the scenario

- A small team on AWS ingesting clickstream into S3 with Lambda consumers: **Kinesis** (or Firehose) keeps operations minimal.
- A platform where many teams consume CDC from dozens of databases, need compaction, Connect sinks and replays of weeks of data: **Kafka**, often managed.
- An image-processing job triggered by uploads: a **queue** (SQS), because each image is independent work with uneven duration and needs per-message retry.

Kafka 4.2's **share groups** add queue-style consumption to Kafka topics (per-record acknowledgement, more workers than partitions, delivery-attempt limits), so a team that already runs Kafka can serve queue-like workloads without a second system, as long as it does not need ordering.

## Example

A rough sizing comparison an interviewer might ask for, with example figures: 20 MB/s of writes in records of 2 KB.

```python
import math

write_mb_s, record_kb = 20, 2
records_s = write_mb_s * 1024 / record_kb

# Kinesis provisioned mode: per-shard write quota of 1 MB/s or 1,000 records/s
kinesis_shards = max(math.ceil(write_mb_s / 1), math.ceil(records_s / 1000))

# Kafka: partitions from your own measured per-partition and per-consumer throughput (example values)
per_partition_mb_s, per_consumer_mb_s = 10, 3
kafka_partitions = max(math.ceil(write_mb_s / per_partition_mb_s), math.ceil(write_mb_s / per_consumer_mb_s))

print(f"{records_s:,.0f} records/s")
print("Kinesis shards needed (write quota):", kinesis_shards)
print("Kafka partitions needed (example measurements):", kafka_partitions)
```

```text
10,240 records/s
Kinesis shards needed (write quota): 20
Kafka partitions needed (example measurements): 7
```

The point is not the numbers but the method: Kinesis capacity is set by published per-shard quotas (and costs scale with shards or with on-demand throughput), while Kafka capacity depends on your own brokers and consumers, which you measure.

## Trade-offs and pitfalls

- **Managed versus control**: Kinesis and SQS remove operations but impose quotas and AWS lock-in; Kafka gives more features and portability, at an operational cost unless managed.
- **Retention cost**: long retention on Kinesis is billed per shard-hour of extended retention; Kafka with tiered storage moves old segments to object storage.
- **Exactly-once**: Kafka transactions cover Kafka-to-Kafka; Kinesis and SQS consumers need idempotent processing (SQS FIFO adds deduplication within a time window).
- **Hybrid designs are normal**: Kafka as the event backbone, with a queue for per-item work downstream.

## Common mistakes

1. Comparing products before deciding between the log and queue models.
2. Choosing Kafka for a small task queue and taking on brokers to run.
3. Assuming Kinesis or SQS standard queues give global ordering.

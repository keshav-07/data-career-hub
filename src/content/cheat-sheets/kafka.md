---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Kafka Cheat Sheet"
description: "A quick Kafka reference: topics, partitions, keys, replication, consumer groups, offsets, delivery semantics and the CLI commands for inspecting a cluster."
inventoryId: "CHEAT-07"
technology: ["kafka"]
topic: ["reference"]
cheatTopic: "Kafka"
related: ["articles:kafka/topics-partitions-consumer-groups", "interview-questions:kafka/at-least-once-delivery"]
versionContext: "Apache Kafka 3.x and later; CLI script names may be .sh or not depending on your distribution"
---

## Core concepts

| Concept | Remember |
|---------|----------|
| Topic | Named stream, split into partitions |
| Partition | Ordered log; the unit of ordering and parallelism |
| Offset | Position of a record within a partition |
| Key | Same key → same partition (while partition count is unchanged) |
| Replication factor | Copies of each partition across brokers |
| Consumer group | Each partition is read by one consumer in the group |

## Producer settings

| Setting | Effect |
|---------|--------|
| `acks=all` | Write confirmed by all in-sync replicas |
| `enable.idempotence=true` | No duplicates from producer retries (default in modern clients) |
| `linger.ms`, `batch.size` | Batching for throughput |
| `compression.type` | `lz4`, `zstd`, `snappy`, `gzip` |

## Consumer settings

| Setting | Effect |
|---------|--------|
| `group.id` | Which group the consumer joins |
| `auto.offset.reset` | `earliest` or `latest` when no committed offset exists |
| `enable.auto.commit` | Prefer `false` and commit after processing |
| `isolation.level=read_committed` | Read only committed transactional records |

## Delivery semantics

| Guarantee | Pattern | Risk |
|-----------|---------|------|
| At-most-once | Commit, then process | Loss on crash |
| At-least-once | Process, then commit | Duplicates on crash |
| Exactly-once (within Kafka) | Idempotent producer + transactions | External sinks still need idempotency |

## CLI

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 6 --replication-factor 3
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic orders
kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders --from-beginning
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing   # shows lag per partition
```

## Design rules of thumb

- Partitions ≥ the maximum consumers you will run in one group.
- Choose a high-cardinality key that matches your ordering need.
- Avoid adding partitions to keyed topics later.
- Retention longer than your longest expected consumer outage.
- Monitor consumer lag.

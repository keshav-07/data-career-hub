---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Kafka Cheat Sheet"
description: "A quick Kafka 4.x reference: topics, partitions, keys, replication, producer and consumer settings, rebalancing, delivery semantics, compaction and the CLI commands."
inventoryId: "CHEAT-07"
technology: ["kafka"]
topic: ["reference"]
cheatTopic: "Kafka"
related: ["articles:kafka/topics-partitions-consumer-groups", "interview-questions:kafka/at-least-once-delivery", "articles:kafka/producers", "articles:kafka/consumers-offsets"]
versionContext: "Apache Kafka 4.x (KRaft only, ZooKeeper removed in 4.0). Defaults are those of the Java clients and brokers in 4.x; librdkafka-based clients (Python, Go, .NET) differ in places, as noted. CLI script names may have a .sh suffix or not depending on your distribution."
---

## Core concepts

| Concept | Remember |
|---------|----------|
| Topic | Named stream, split into partitions; data is retained, not deleted on read |
| Partition | Ordered log; the unit of ordering and parallelism |
| Offset | Position of a record within one partition; committed offset = next to read |
| Key | Same key → same partition (while partition count is unchanged) |
| Replication factor | Copies of each partition across brokers; RF 3 is the production norm |
| ISR | Replicas caught up with the leader; `acks=all` waits for the current ISR |
| Consumer group | Each partition is read by one member of the group; each group reads everything |
| Share group (4.2+) | Queue-style: members share partitions and acknowledge records one by one, no ordering |
| KRaft | Metadata in a Raft log on 3 or 5 controllers; no ZooKeeper in 4.x |

## Producer settings

| Setting | Default (Java, 4.x) | Effect |
|---------|---------------------|--------|
| `acks` | `all` (since 3.0) | Write confirmed by all in-sync replicas |
| `enable.idempotence` | `true` (since 3.0) | No duplicates or reordering from retries within a producer session |
| `max.in.flight.requests.per.connection` | 5 | Must be ≤ 5 with idempotence; ordering is kept |
| `linger.ms` | 5 (since 4.0) | Wait for fuller batches |
| `batch.size` | 16384 | Per-partition batch target |
| `compression.type` | `none` | `lz4`, `zstd`, `snappy`, `gzip`; per batch |
| `delivery.timeout.ms` | 120000 | Total time for a send, including retries |
| `transactional.id` | unset | Enables transactions and zombie fencing |
| `partitioner` (librdkafka) | `consistent_random` (CRC32) | Set `murmur2_random` to match Java's key hashing |

## Consumer settings

| Setting | Default | Effect |
|---------|---------|--------|
| `group.id` | none | Which group the consumer joins |
| `auto.offset.reset` | `latest` | `earliest`, `latest`, `by_duration:PT6H` (4.0+) or `none` when no committed offset exists |
| `enable.auto.commit` | `true` | Prefer `false` and commit after processing |
| `max.poll.records` | 500 | Records per `poll()` (not a fetch setting) |
| `max.poll.interval.ms` | 300000 | Longest gap between polls before the member is removed |
| `isolation.level` | `read_uncommitted` | Use `read_committed` downstream of transactions |
| `group.protocol` | `classic` | `consumer` = KIP-848 broker-side incremental rebalancing (GA in 4.0) |
| `group.instance.id` | unset | Static membership: restarts within the session timeout skip rebalances |

## Durable topic recipe

```text
replication.factor=3   min.insync.replicas=2   acks=all   unclean.leader.election.enable=false
```

One broker can be down and writes continue; two down and `acks=all` writes are rejected rather than made unsafe.

## Delivery semantics

| Guarantee | Pattern | Risk |
|-----------|---------|------|
| At-most-once | Commit, then process | Loss on crash |
| At-least-once | Process, then commit | Duplicates on crash; make the sink idempotent |
| Exactly-once (within Kafka) | Transactions + `sendOffsetsToTransaction` + `read_committed`, or Streams `exactly_once_v2` | External sinks still need idempotency or offsets stored in the sink |

## Retention and compaction

| Setting | Default | Note |
|---------|---------|------|
| `cleanup.policy` | `delete` | `compact` keeps the latest value per key; `compact,delete` does both |
| `retention.ms` | 7 days | Deletes whole closed segments by their newest timestamp |
| `retention.bytes` | -1 | **Per partition**, not per topic |
| `segment.bytes` / `segment.ms` | 1 GiB / 7 days | Low-volume topics keep data until the segment rolls |
| `delete.retention.ms` | 1 day | How long tombstones survive on compacted topics |

## CLI

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 6 --replication-factor 3 \
  --config min.insync.replicas=2
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic orders
kafka-topics.sh --bootstrap-server localhost:9092 --describe --under-replicated-partitions
kafka-configs.sh --bootstrap-server localhost:9092 --alter --entity-type topics --entity-name orders \
  --add-config retention.ms=259200000
kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders \
  --reader-property parse.key=true --reader-property key.separator=:
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders --from-beginning
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing   # lag per partition
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group billing --reset-offsets \
  --to-datetime 2026-10-08T00:00:00.000 --topic orders --dry-run                     # then --execute
kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic orders --time -1        # latest offsets
kafka-metadata-quorum.sh --bootstrap-server localhost:9092 describe --status         # KRaft quorum
```

## Design rules of thumb

- Partitions ≥ the maximum consumers you will run in one group, and enough for peak throughput with headroom.
- Choose a key that matches your ordering need and has many, evenly used values.
- Avoid adding partitions to keyed topics later; it moves keys.
- Retention longer than your longest expected consumer outage, plus the time to replay.
- Monitor consumer lag in time, not only records; alert on under-min-ISR partitions.
- Register schemas from CI with a compatibility mode (BACKWARD by default); disable auto-registration in production.

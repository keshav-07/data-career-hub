---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you choose retention and size disk for a Kafka topic?"
seoTitle: "Kafka Retention and Disk Sizing: Interview Answer"
description: "Interview answer: size Kafka retention from the longest consumer outage plus replay needs, then disk as write rate x retention x replication, with headroom."
technology: ["kafka"]
topic: ["retention", "capacity-planning", "storage"]
difficulty: "Medium"
questionType: ["architecture", "scenario"]
estimatedMinutes: 10
interviewRelevance: "Medium"
shortAnswer: "Retention is a recovery requirement first: it must exceed the longest time a consumer can be down or behind, plus the window you may need to replay after a bug, because Kafka deletes data on schedule whether or not anyone read it. Then size storage: average write rate after compression × retention × replication factor, plus headroom for peaks, uneven partitions and the active segment, divided across brokers. Remember retention.bytes is per partition, retention deletes whole segments so data can live longer than retention.ms, and tiered storage lets you keep long total retention while only recent data stays on broker disks."
followUps: ["Why might data older than retention.ms still be readable?", "What happens to a consumer whose committed offset was deleted by retention?", "How does tiered storage change the calculation?", "How do compacted topics change disk usage?"]
related: ["articles:kafka/log-storage-retention-compaction", "interview-questions:kafka/choose-partition-count", "interview-questions:kafka/consumer-lag-causes-fixes", "system-designs:kafka-ingestion-system"]
versionContext: "Apache Kafka 4.x retention and tiered storage settings (tiered storage production-ready since 3.9). The sizing calculation is plain Python 3.11 with example inputs, not measurements."
sources:
  - { label: "Apache Kafka documentation: Topic configs", url: "https://kafka.apache.org/documentation/#topicconfigs" }
  - { label: "Apache Kafka documentation: Tiered storage", url: "https://kafka.apache.org/documentation/#tiered_storage" }
---

## Detailed explanation

### Step 1: choose retention from failure scenarios

Ask how long data must stay readable in the worst realistic case:

- The longest consumer outage you will tolerate (a weekend with a broken sink, a holiday freeze).
- Time to detect a bad deployment and replay the affected window.
- Whether a new consumer must bootstrap from Kafka history, or from the lake instead.

If a consumer falls further behind than retention, its committed offset points at deleted data, it resets according to `auto.offset.reset`, and the gap is lost. Retention is therefore set to the outage window plus a margin, commonly several days for pipelines that land data in a lake, longer for topics used as a replay source.

### Step 2: size the storage

```text
disk ≈ write rate (compressed, bytes/s) × retention (s) × replication factor × headroom
```

Headroom covers peak versus average rates, uneven partitions (one hot partition fills its broker first), the active segment and segments waiting for deletion (retention removes whole segments, so up to one segment per partition overshoots), and free space to survive a broker failure while its replicas are rebuilt elsewhere.

### Settings to know

| Setting | Meaning |
|---------|---------|
| `retention.ms` | Time-based retention (default 7 days) |
| `retention.bytes` | Size cap **per partition** (default unlimited) |
| `segment.bytes`, `segment.ms` | When segments roll; data becomes deletable only after its segment closes |
| `local.retention.ms` / `local.retention.bytes` | With tiered storage, how much stays on broker disks |

## Example

Example inputs for one topic: 15 MB/s average after compression, 3 days of retention, RF 3, nine brokers.

```python
avg_write_mb_s = 15
retention_days = 3
replication_factor = 3
brokers = 9
headroom = 1.4          # peaks, skew, segment overshoot, failure recovery

seconds = retention_days * 86_400
logical_tb = avg_write_mb_s * seconds / 1_000_000
total_tb = logical_tb * replication_factor * headroom
print(f"retained once: {logical_tb:.2f} TB | with RF and headroom: {total_tb:.2f} TB "
      f"| per broker: {total_tb / brokers:.2f} TB")

# Tiered storage: 3 days in total but only 12 hours on local disks
local_hours = 12
local_tb = avg_write_mb_s * local_hours * 3600 / 1_000_000 * replication_factor * headroom
remote_tb = logical_tb   # the remote tier stores each closed segment once (durability comes from the object store)
print(f"tiered: local {local_tb:.2f} TB across brokers ({local_tb / brokers:.2f} TB each), remote about {remote_tb:.2f} TB")

# retention.bytes is per partition: a 24-partition topic with retention.bytes=50 GB
partitions, retention_gb = 24, 50
print("retention.bytes cap across all replicas:", partitions * retention_gb * replication_factor / 1000, "TB")
```

```text
retained once: 3.89 TB | with RF and headroom: 16.33 TB | per broker: 1.81 TB
tiered: local 2.72 TB across brokers (0.30 TB each), remote about 3.89 TB
retention.bytes cap across all replicas: 3.6 TB
```

## Trade-offs and pitfalls

- **Longer retention is not free**: more disk, slower broker recovery and reassignment. Tiered storage, or sinking to a lake and keeping Kafka retention short, are the usual answers for long history.
- **Low-volume topics** keep data longer than `retention.ms`, because a segment is only deletable once it has rolled (`segment.ms` defaults to 7 days).
- **Producer timestamps** drive time retention; a producer with a skewed clock can make data expire early or never.
- **Compacted topics** grow with the number of distinct keys, not with time.
- **Tiered storage does not support compacted topics** and needs a remote storage plugin.

## Common mistakes

1. Setting retention from disk capacity alone, without asking how long consumers can be down.
2. Treating `retention.bytes` as a topic-wide limit.
3. Forgetting to multiply by the replication factor.

---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is Kafka log compaction, and when would you use it?"
seoTitle: "Kafka Log Compaction Use Cases: Interview Answer"
description: "Interview answer: compaction keeps at least the latest record per key and deletes keys with tombstones, which suits changelogs, CDC tables, state backups and lookup topics."
technology: ["kafka"]
topic: ["log-compaction", "retention", "tombstones"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "With cleanup.policy=compact, Kafka keeps at least the latest record for every key and removes older records with the same key in the background, instead of deleting data by age. A record with a key and a null value (a tombstone) deletes the key; the tombstone itself is removed after delete.retention.ms. The topic converges to current state per key while staying replayable from the beginning. Use it for changelogs and lookup tables (latest customer profile, latest price), CDC topics keyed by primary key, Kafka Streams state store changelogs and Connect offset and config topics. Do not use it for event streams where every event matters, and remember compaction is not deduplication on read: recent duplicates remain until the cleaner runs."
followUps: ["Why can a consumer still see several values for the same key?", "How do you delete a customer from a compacted topic, and what can go wrong?", "What does cleanup.policy=compact,delete do?", "Why is a null key rejected on a compacted topic?"]
related: ["articles:kafka/log-storage-retention-compaction", "articles:kafka/kafka-connect-debezium", "interview-questions:kafka/retention-sizing", "interview-questions:kafka/cdc-with-debezium"]
versionContext: "Apache Kafka 4.x topic settings and defaults. The compaction model runs on plain Python 3.11 and ignores segment boundaries and timing, which the linked lesson covers."
sources:
  - { label: "Apache Kafka documentation: Log compaction", url: "https://kafka.apache.org/documentation/#compaction" }
  - { label: "Apache Kafka documentation: Topic configs", url: "https://kafka.apache.org/documentation/#topicconfigs" }
---

## Detailed explanation

Kafka has two cleanup policies, chosen per topic:

| `cleanup.policy` | Keeps | Removes |
|------------------|-------|---------|
| `delete` (default) | Everything newer than `retention.ms` / within `retention.bytes` | Whole old segments |
| `compact` | At least the latest record per key | Older records for keys that appear later; tombstones after `delete.retention.ms` |
| `compact,delete` | Latest per key, but only within retention | Both |

How compaction behaves:

- The **log cleaner** rewrites closed segments, keeping only the last record per key. The **active segment is never compacted**, and a partition is only cleaned once its dirty share passes `min.cleanable.dirty.ratio` (0.5) or a record waits longer than `max.compaction.lag.ms`.
- **Offsets never change**: surviving records keep their offsets, leaving gaps.
- **Tombstones** (key plus null value) delete a key. They survive at least `delete.retention.ms` (1 day by default) so slow consumers still see the delete.
- Records **must have keys**; producing a null key to a compacted topic fails.

### Good use cases

1. **Current-state topics**: customer profiles, product prices, account balances, feature flags. A new service can bootstrap the full current state by reading from offset 0, without a database dump.
2. **CDC topics** keyed by primary key (Debezium emits a tombstone after each delete for this reason).
3. **Kafka Streams state changelogs** and `KTable` sources.
4. **Kafka's own internal topics**: `__consumer_offsets` and Connect's config and offset topics are compacted.

### Poor fits

- Event streams (clicks, payments) where each event matters: compaction would drop events that share a key.
- Topics where keys are not the identity of the entity, for example keyed by `country`: compaction keeps one record per country.

## Example

Replaying a compacted customer topic rebuilds the current table; the model applies the cleaner's rule:

```python
log = [  # (offset, key, value); None is a tombstone
    (0, "c1", "bronze"), (1, "c2", "silver"), (2, "c1", "silver"),
    (3, "c3", "bronze"), (4, "c1", "gold"), (5, "c3", None), (6, "c4", "silver"),
]

latest = {}
for offset, key, value in log:
    latest[key] = offset
compacted = [(o, k, v) for o, k, v in log if latest[k] == o]          # keep latest per key
after_tombstone_expiry = [(o, k, v) for o, k, v in compacted if v is not None]

state = {k: v for _, k, v in after_tombstone_expiry}
print("compacted log:", compacted)
print("after delete.retention.ms:", after_tombstone_expiry)
print("state rebuilt by a new consumer:", state)
```

```text
compacted log: [(1, 'c2', 'silver'), (4, 'c1', 'gold'), (5, 'c3', None), (6, 'c4', 'silver')]
after delete.retention.ms: [(1, 'c2', 'silver'), (4, 'c1', 'gold'), (6, 'c4', 'silver')]
state rebuilt by a new consumer: {'c2': 'silver', 'c1': 'gold', 'c4': 'silver'}
```

Creating such a topic:

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic customer-profile \
  --partitions 12 --replication-factor 3 --config cleanup.policy=compact \
  --config min.compaction.lag.ms=3600000 --config delete.retention.ms=86400000
```

`min.compaction.lag.ms` guarantees consumers at least an hour to see every update before older values may be removed.

## Trade-offs and pitfalls

- **Not deduplication**: consumers must treat the last value seen as current, because the head of the log is uncompacted.
- **Slow rebuilders can miss deletes**: a consumer replaying from the start must reach the tombstone within `delete.retention.ms`, or it keeps a deleted row.
- **Null serialisation**: some serialisers write an empty object instead of a real null, which is not a tombstone.
- **GDPR erasure**: a tombstone removes the key from the topic eventually, but copies in sinks, mirrors and backups need deleting too.
- **Tiered storage does not support compacted topics.**
- **Cleaner cost**: aggressive settings (tiny segments, low dirty ratio) make the cleaner rewrite data constantly.

## Common mistakes

1. Expecting a consumer to see exactly one record per key.
2. Compacting an event topic and losing events.
3. Filtering out Debezium tombstones before a compacted topic, so deleted rows never disappear.

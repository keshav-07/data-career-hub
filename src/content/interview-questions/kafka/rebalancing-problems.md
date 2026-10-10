---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What causes consumer group rebalances, and how do you reduce their impact?"
seoTitle: "Kafka Rebalancing Problems: Interview Answer"
description: "Interview answer: rebalances follow joins, leaves, crashes and slow polls; cut them with static membership and soften them with cooperative or KIP-848 protocols."
technology: ["kafka"]
topic: ["rebalancing", "consumer-groups", "static-membership"]
difficulty: "Medium"
questionType: ["debugging", "conceptual"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "A rebalance reassigns partitions when group membership or subscriptions change: a consumer joins or leaves, a consumer misses heartbeats for the session timeout, a consumer does not call poll within max.poll.interval.ms, or partitions are added. With the classic eager protocol every member stops consuming during it, and uncommitted work is redone by the new owner. Reduce how often it happens (keep processing per poll well under max.poll.interval.ms, close consumers cleanly, use static membership with group.instance.id for rolling restarts) and how much it hurts (cooperative-sticky assignment or the KIP-848 consumer protocol, which move only the partitions that change owner, and committing offsets in the revocation callback)."
followUps: ["What is the difference between session.timeout.ms and max.poll.interval.ms?", "Why must onPartitionsLost not commit offsets?", "What does static membership trade away?", "How do you migrate from eager to cooperative rebalancing?"]
related: ["articles:kafka/consumer-groups-rebalancing", "articles:kafka/consumers-offsets", "interview-questions:kafka/consumer-lag-causes-fixes", "interview-questions:kafka/partitions-and-consumer-groups"]
versionContext: "Apache Kafka 4.x: the KIP-848 consumer protocol has been GA since 4.0 and is opt-in on the Java client (group.protocol=consumer). The Python example uses confluent-kafka 2.x (librdkafka) and needs a broker, so it is marked noexec; it was checked against the client documentation."
sources:
  - { label: "Apache Kafka documentation: Consumer rebalance protocol", url: "https://kafka.apache.org/43/operations/consumer-rebalance-protocol/" }
  - { label: "Apache Kafka documentation: Consumer configs", url: "https://kafka.apache.org/documentation/#consumerconfigs" }
---

## Detailed explanation

### What triggers a rebalance

| Trigger | Typical root cause |
|---------|--------------------|
| Member joins | Scale-out, deployment, a crashed pod restarting |
| Member leaves cleanly | Deployment or scale-in (`close()` sends a leave request) |
| Session timeout | Process died or the network partitioned; no heartbeats for `session.timeout.ms` (45 s default) |
| `max.poll.interval.ms` exceeded | Live consumer stuck in processing for longer than 5 minutes (default) between polls |
| Subscription or metadata change | New partitions, or a regex subscription matching a new topic |

The most common production problem is the fourth: a batch of `max.poll.records` (500 by default) takes longer than `max.poll.interval.ms` to process, the member is evicted, its commit fails, it rejoins, receives the same records and is evicted again. Lag grows while the group spends its time rebalancing.

### Why rebalances hurt

- **Eager classic protocol** (range, round-robin, sticky assignors): every member revokes **all** partitions and waits for the new assignment. Nothing is consumed group-wide for the duration.
- **Reprocessing**: the new owner starts at the last committed offset, so work done but not committed is repeated.
- **State reload**: consumers with caches or local state rebuild them for partitions they gain.

### How to reduce frequency

1. Keep per-poll work small and fast: lower `max.poll.records`, batch sink writes, avoid per-record network calls. Raise `max.poll.interval.ms` only deliberately.
2. Close consumers on shutdown (handle SIGTERM), so the group does not wait for a session timeout.
3. **Static membership**: a stable `group.instance.id` per instance (for example the pod name) lets a restart within the session timeout rejoin without a rebalance.

### How to reduce impact

1. **Cooperative incremental rebalancing** (`CooperativeStickyAssignor` in Java, `cooperative-sticky` in librdkafka): only partitions that move are paused.
2. **KIP-848 consumer protocol** (`group.protocol=consumer`): the broker computes assignments and each member reconciles on its heartbeat, with no group-wide barrier.
3. **Commit in the revocation callback** so the next owner starts where you stopped, and never commit in `onPartitionsLost`, because another member may already own those partitions.

## Example

A consumer that commits on revocation, uses cooperative assignment and static membership:

<!-- noexec -->
```python
import os
from confluent_kafka import Consumer

def on_revoke(consumer, partitions):
    # Still the owner: flush in-flight work, then commit what was processed
    flush_sink_buffer()
    consumer.commit(asynchronous=False)

def on_lost(consumer, partitions):
    # Ownership already gone (for example session expired): discard local state, do not commit
    drop_local_state(partitions)

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "orders-loader",
    "group.instance.id": os.environ["POD_NAME"],         # static membership
    "partition.assignment.strategy": "cooperative-sticky",
    "session.timeout.ms": 60000,                         # longer than a normal restart
    "max.poll.interval.ms": 300000,
    "enable.auto.commit": False,
})
consumer.subscribe(["orders"], on_revoke=on_revoke, on_lost=on_lost)
```

`flush_sink_buffer` and `drop_local_state` stand for your own code. With the Java client on Kafka 4.x, the equivalent is `group.protocol=consumer` (which ignores `partition.assignment.strategy` and the client-side session timeout) plus a `ConsumerRebalanceListener`. Newer librdkafka releases also support the consumer protocol; check your client version before switching.

Diagnose a suspected loop with the group's state and the consumer logs:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group orders-loader --state
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group orders-loader --members
```

Repeated `PreparingRebalance` states, changing member IDs and log lines about leaving the group because the poll interval was exceeded confirm it.

## Trade-offs and pitfalls

- **Static membership delays failover**: a crashed static member's partitions sit idle until the session timeout expires.
- **Long session timeouts** have the same cost for dynamic members.
- **Cooperative rebalancing needs a two-step rolling upgrade** from eager assignors; mixing them in one step breaks the group.
- **Revocation callbacks in cooperative mode receive only the moving partitions**; code that clears all state on revoke discards state it still needs.
- **KIP-848 does not fix slow processing**: it makes rebalances cheaper, not evictions rarer.

## Common mistakes

1. Raising `session.timeout.ms` to fix evictions caused by `max.poll.interval.ms`.
2. Committing offsets in `on_lost` / `onPartitionsLost`.
3. Reusing one `group.instance.id` for two running instances, which fences one of them.

---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How does Kafka guarantee message ordering, and where can ordering break?"
seoTitle: "Kafka Message Ordering: Interview Answer"
description: "Interview answer: Kafka orders records only within a partition, so key by the entity needing order, keep idempotence on and the partition count fixed."
technology: ["kafka"]
topic: ["ordering", "partitions", "producers"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Kafka guarantees order only within a partition: records appended to one partition get increasing offsets and every consumer reads them in that order. There is no order across partitions. To keep related events in order, give them the same key (for example order_id) so the partitioner sends them to one partition, keep the idempotent producer on so retries cannot reorder batches, do not change the partition count of a keyed topic, and process each partition sequentially on the consumer side."
followUps: ["What happens to ordering if you add partitions to a keyed topic?", "Why did max.in.flight.requests.per.connection=1 used to be recommended?", "How would you get a global order, and what does it cost?", "Why might a Java producer and a Python producer put the same key in different partitions?"]
related: ["articles:kafka/topics-partitions-consumer-groups", "articles:kafka/producers", "interview-questions:kafka/partitions-and-consumer-groups", "interview-questions:kafka/choose-partition-count"]
versionContext: "Producer defaults are those of the Apache Kafka 4.x Java client (idempotence and acks=all on by default since 3.0). The simulation runs on plain Python 3.11."
sources:
  - { label: "Apache Kafka documentation: Design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Apache Kafka documentation: Producer configs", url: "https://kafka.apache.org/documentation/#producerconfigs" }
---

## Detailed explanation

Ordering in Kafka is a chain of four links, and each must hold:

1. **Partition**: a partition is an append-only log, so records in it have a total order by offset. Across partitions there is none, because different partitions live on different brokers and are read by different consumers in parallel.
2. **Producer to partition**: records with the same key go to the same partition (`hash(key) % partitions`). Without a key, the sticky partitioner spreads records and gives no useful order.
3. **Retries**: without idempotence, a failed batch that is retried can land after a later batch that succeeded. The idempotent producer (the default since Kafka 3.0) attaches sequence numbers, and the broker rejects out-of-order batches, so order survives retries with up to five requests in flight.
4. **Consumer**: a group gives each partition to one member, which reads it in order. Order breaks again if that member hands records to a thread pool and processes them concurrently.

So the answer is: **choose the key so that everything that must be ordered shares a partition**, and protect the other three links.

## Example

All events of one order share a key, so they stay in sequence even though the topic has several partitions; two orders interleave freely, which is fine:

```python
import zlib

PARTITIONS = 3
events = [("order-7", "created"), ("order-9", "created"), ("order-7", "paid"),
          ("order-9", "cancelled"), ("order-7", "shipped")]

# Stand-in hash for the demo; the Java client uses murmur2, librdkafka defaults to CRC32
partitions = {p: [] for p in range(PARTITIONS)}
for key, status in events:
    partitions[zlib.crc32(key.encode()) % PARTITIONS].append((key, status))

for p, records in partitions.items():
    print(f"partition {p}: {records}")

# A consumer per partition sees each order's events in production order
for key in ("order-7", "order-9"):
    seen = [s for recs in partitions.values() for k, s in recs if k == key]
    print(key, "->", seen)
```

```text
partition 0: [('order-9', 'created'), ('order-9', 'cancelled')]
partition 1: []
partition 2: [('order-7', 'created'), ('order-7', 'paid'), ('order-7', 'shipped')]
order-7 -> ['created', 'paid', 'shipped']
order-9 -> ['created', 'cancelled']
```

With 6 partitions instead of 3, `order-7` could map elsewhere; events produced before the change sit in the old partition and newer ones in the new partition, so a consumer can see `shipped` before `created`.

## Trade-offs and pitfalls

- **Key choice is a trade-off between order and balance.** Keying by `customer_id` orders all of a customer's events but one huge customer creates a hot partition. Choose the narrowest entity whose events must stay ordered.
- **Global order means one partition**, which means one consumer per group and the throughput of one partition. Accept it only for small, critical streams.
- **Adding partitions moves keys.** Size keyed topics up front, or migrate to a new topic.
- **Mixed clients hash differently.** librdkafka clients default to CRC32; set `partitioner=murmur2_random` to match Java producers on a shared keyed topic.
- **Consumer-side parallelism** must be per key (for example a worker per key hash) if you add threads.
- **Disabling idempotence** (for example by setting `acks=1` without `enable.idempotence=true`) brings back reordering on retry unless `max.in.flight.requests.per.connection=1`.

## Common mistakes

1. Claiming Kafka orders a whole topic.
2. Relying on timestamps to reconstruct order across partitions.
3. Forgetting that a dead-letter or retry topic takes a record out of its partition's order.

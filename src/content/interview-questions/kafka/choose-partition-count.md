---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you choose the number of partitions for a Kafka topic?"
seoTitle: "Choosing a Kafka Partition Count: Interview Answer"
description: "Interview answer: size partitions from peak throughput per partition and per consumer, maximum consumer parallelism and growth, then weigh the cost of too many partitions."
technology: ["kafka"]
topic: ["partitions", "capacity-planning", "throughput"]
difficulty: "Medium"
questionType: ["architecture", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Work it out from requirements rather than picking a round number. Measure what one partition can absorb from producers and what one consumer instance can process, then take the larger of target peak throughput divided by each, add headroom for growth, and make sure the count is at least the largest number of consumers you will run in one group. Because adding partitions later moves keys and breaks per-key ordering, size keyed topics for a year or two of growth up front, but avoid huge counts: every partition costs files, memory, replication traffic and recovery time."
followUps: ["Why can't you reduce a topic's partition count?", "What happens to ordering if you add partitions later?", "How does the consumer's sink speed affect the answer?", "What are the costs of having too many partitions in a cluster?"]
related: ["articles:kafka/topics-partitions-consumer-groups", "articles:kafka/producers", "interview-questions:kafka/partitions-and-consumer-groups", "interview-questions:kafka/retention-sizing", "system-designs:kafka-ingestion-system"]
versionContext: "Applies to Apache Kafka 4.x. The calculation runs on plain Python 3.11; its throughput figures are example inputs you would replace with your own measurements, not benchmarks."
sources:
  - { label: "Apache Kafka documentation: Design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Apache Kafka documentation: Operations", url: "https://kafka.apache.org/documentation/#operations" }
---

## Detailed explanation

Partitions are the unit of parallelism in Kafka, for writes (each partition has one leader) and for reads (one consumer per partition per group). The count has to satisfy three constraints:

1. **Producer throughput**: peak write rate ÷ what one partition sustains in your cluster (depends on record size, batching, compression, `acks`, disks).
2. **Consumer throughput**: peak rate ÷ what one consumer instance processes. This is usually the binding constraint, because consumers do real work (parsing, enrichment, writing to a database).
3. **Parallelism**: at least the maximum number of consumers you expect in the busiest group, since extra consumers sit idle.

Then add **headroom for growth**, because you cannot reduce partitions, and adding them to a keyed topic remaps keys (`hash(key) % partitions`) and breaks per-key ordering across the change.

Against that, **too many partitions** cost: open file handles and memory per partition replica, more replication requests, more leaders to move when a broker fails or restarts, longer controller work, and smaller producer batches (batching is per partition, so throughput per byte can drop).

## Example

The inputs below are example measurements for one topic. In an interview, say you would measure them with `kafka-producer-perf-test.sh`, `kafka-consumer-perf-test.sh` and a load test of the real consumer.

```python
import math

peak_mb_s = 60              # peak write rate expected next year, MB/s
per_partition_write = 10    # measured: MB/s one partition absorbs with our producer settings
per_consumer_process = 4    # measured: MB/s one consumer instance processes, including the sink write
max_consumers = 12          # largest group we plan to run
headroom = 1.5              # growth and failure headroom

needed_for_writes = math.ceil(peak_mb_s / per_partition_write)
needed_for_reads = math.ceil(peak_mb_s / per_consumer_process)
base = max(needed_for_writes, needed_for_reads, max_consumers)
partitions = math.ceil(base * headroom)

print("for writes:", needed_for_writes, "| for reads:", needed_for_reads, "| for parallelism:", max_consumers)
print("base:", base, "| with headroom:", partitions)

# A count with many divisors lets common group sizes split evenly
for candidate in (partitions, 24):
    even = [n for n in range(1, 13) if candidate % n == 0]
    print(candidate, "partitions split evenly across group sizes", even)
```

```text
for writes: 6 | for reads: 15 | for parallelism: 12
base: 15 | with headroom: 23
23 partitions split evenly across group sizes [1]
24 partitions split evenly across group sizes [1, 2, 3, 4, 6, 8, 12]
```

The consumer, not the broker, decided the answer. Rounding 23 up to 24 costs one partition and lets groups of 2, 3, 4, 6, 8 or 12 consumers share the load evenly.

## Trade-offs and pitfalls

- **Keyed versus unkeyed topics**: unkeyed topics can grow partitions later with little harm; keyed topics should be sized up front or migrated to a new topic.
- **Fix the consumer before adding partitions**: batching sink writes or removing a per-record network call often multiplies per-consumer throughput, which reduces the count you need.
- **Hot keys are not solved by more partitions**: one key always lands in one partition.
- **Cluster-wide limits matter**: the sum of partitions across all topics drives broker resource use. Many small topics with dozens of partitions each add up.
- **Share groups (Kafka 4.2+)** decouple worker count from partition count for queue-style work where ordering is not needed.

## Common mistakes

1. Choosing 100 partitions "to be safe" for a topic that receives a few messages per second.
2. Sizing only for producer throughput and discovering the consumer cannot keep up.
3. Adding partitions to a keyed topic in production without planning for reordering.

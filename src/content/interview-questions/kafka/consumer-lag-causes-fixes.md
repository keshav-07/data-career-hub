---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Consumer lag keeps growing. How do you diagnose and fix it?"
seoTitle: "Kafka Consumer Lag Causes and Fixes: Interview"
description: "Interview answer: measure Kafka consumer lag per partition and in time, separate dead, rebalancing, skewed and slow consumers, fix the bottleneck first."
technology: ["kafka"]
topic: ["consumer-lag", "monitoring", "performance"]
difficulty: "Medium"
questionType: ["debugging", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Lag is the log-end offset minus the group's committed offset, per partition. First find its shape with kafka-consumer-groups --describe and lag metrics: lag on all partitions with no members means the consumers are down; lag that resets and grows with frequent membership changes means rebalance loops; lag on one partition means a hot key or a poison record; steady growth everywhere means the consumers are too slow for the input rate. Fix the cause: restart or fix crashing consumers, stop evictions (max.poll.interval.ms, static membership, cooperative or KIP-848 rebalancing), skip or dead-letter bad records, and speed up processing, usually by batching sink writes, before scaling consumers up to the partition count or adding partitions. Alert on lag in time and on lag approaching retention."
followUps: ["Why is lag in records a poor alert?", "What happens if lag exceeds the topic's retention?", "Why do extra consumers beyond the partition count not help?", "How does consumer lag look on a transactional topic?"]
related: ["articles:kafka/consumers-offsets", "articles:kafka/consumer-groups-rebalancing", "interview-questions:kafka/rebalancing-problems", "interview-questions:kafka/poison-messages-dlq", "articles:etl-elt/pipeline-observability"]
versionContext: "Apache Kafka 4.x tools and consumer metrics. The lag-in-time calculation is a plain Python 3.11 example with made-up sample numbers; the CLI command needs a broker."
sources:
  - { label: "Apache Kafka documentation: Monitoring", url: "https://kafka.apache.org/documentation/#monitoring" }
  - { label: "Apache Kafka documentation: Consumer configs", url: "https://kafka.apache.org/documentation/#consumerconfigs" }
---

## Detailed explanation

Start with **where** the lag is and **how it moves**; each shape points to a different cause.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| All partitions lag, no members in the group | Consumers crashed, failed to deploy, or lost credentials | Restart, check logs and ACLs; alert on group state `Empty` |
| Lag grows, members keep changing, same offsets reprocessed | Rebalance loop: processing exceeds `max.poll.interval.ms`, or restarts trigger rebalances | Smaller `max.poll.records`, faster processing, static membership, cooperative or `group.protocol=consumer` |
| One partition lags, others at zero | Hot key, or a poison record the consumer keeps failing on | Check key distribution; look for repeated errors at one offset; skip to a DLQ |
| Steady growth on every partition | Consumers too slow for the input rate | Profile processing; batch sink writes; then scale out up to the partition count |
| Lag spikes daily then recovers | Batch producers or a slow downstream at certain hours | Capacity for the peak, or accept it if the SLA allows |

Where the time goes is usually the **sink**: one database round trip per record, synchronous HTTP calls, or a small connection pool. Batching writes (for example 500 rows per upsert) often fixes lag without any Kafka change. Only once per-consumer throughput is reasonable do you add consumers (up to the partition count) or partitions.

**Lag in records is a weak alert**: 50,000 records may be two seconds on a busy topic or two days on a quiet one. Alert on **lag in time** (age of the oldest unprocessed record, or how long the backlog takes to drain) and on lag growth, plus a hard alert when lag in time approaches the topic's retention, because records past retention are deleted before they are read.

## Example

Measure per-partition lag from the CLI:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group orders-loader
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group orders-loader --state
```

Convert record lag into time with the input rate, using sample numbers from metrics:

```python
partitions = {          # partition: (lag_records, produce_rate_per_s, consume_rate_per_s)
    0: (1_200, 400, 450),
    1: (950, 380, 450),
    2: (186_000, 1_900, 450),   # hot partition
}
retention_hours = 72

for p, (lag, rate_in, rate_out) in partitions.items():
    behind_s = lag / rate_in                         # roughly how old the oldest unread record is
    drain = "never (falling behind)" if rate_out <= rate_in else f"{lag / (rate_out - rate_in):.0f} s"
    warn = "  <- check retention" if behind_s > retention_hours * 3600 * 0.5 else ""
    print(f"p{p}: lag {lag:>7,} records = {behind_s / 60:5.1f} min behind, drains in {drain}{warn}")
```

```text
p0: lag   1,200 records =   0.1 min behind, drains in 24 s
p1: lag     950 records =   0.0 min behind, drains in 14 s
p2: lag 186,000 records =   1.6 min behind, drains in never (falling behind)
```

Partition 2 is only 1.6 minutes behind now, but it receives four times the traffic of the others and its consumer cannot keep up, so it will fall further behind forever. That is a hot key problem: more consumers do not help, because one partition is read by one consumer. Options are a better key, splitting the hot key (if per-key order allows), or making the processing of that partition faster.

## Trade-offs and pitfalls

- **Adding partitions** helps only if consumers are already efficient, and it moves keys on keyed topics.
- **Raising `max.poll.interval.ms`** stops evictions but also delays detection of genuinely stuck consumers.
- **Auto-scaling consumers on lag** can cause rebalance churn; use cooperative or KIP-848 rebalancing and scale in steps.
- **Transactional topics** never show exactly zero lag in offset-based tools, because commit markers occupy offsets.
- **Lag can look fine while the pipeline is broken**: a consumer that commits offsets but silently drops records has zero lag. Pair lag with output row counts.

## Common mistakes

1. Adding consumers beyond the partition count.
2. Alerting on a fixed record count across all topics.
3. Raising timeouts to hide a slow sink instead of batching writes.

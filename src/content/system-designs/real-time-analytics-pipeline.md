---
publishedDate: "2026-10-04"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
title: "Design a Near-Real-Time Dashboard Backend"
description: "Real-time analytics pipeline system design for live dashboards: event-time aggregation, watermarks, upserts into an OLAP store, caching and batch correction."
inventoryId: "SYS-02"
technology: ["data-engineering", "kafka", "spark"]
topic: ["real-time-analytics", "streaming", "architecture"]
difficulty: "Advanced"
problem: "Design the backend for live business dashboards (orders per minute, revenue, conversion and delivery times by region and category) that show data no more than a minute old, stay fast for hundreds of concurrent viewers, and reconcile with the daily finance numbers."
functionalRequirements:
  - "Ingest order, payment, page-view and delivery events from application services"
  - "Compute per-minute metrics by region, category and channel, by event time"
  - "Serve the last 24 hours at minute grain and the last 90 days at hourly grain, with filters and drill-down"
  - "Push or poll updates to open dashboards every few seconds"
  - "Correct live numbers against the batch source of truth and show which numbers are final"
  - "Keep raw events for reprocessing and new metrics"
nonFunctionalRequirements:
  - "Data freshness under 60 seconds at p95 from event to dashboard"
  - "Dashboard queries under 300 ms at p95 with 500 concurrent viewers"
  - "Correct under duplicates, out-of-order and late events"
  - "Graceful degradation: stale but labelled data rather than errors when the stream lags"
  - "Daily totals match the batch pipeline within an agreed tolerance"
scaleAssumptions:
  - "Assumption: 20,000 events/s on average, 100,000/s at peak sales events"
  - "Assumption: about 1 KB per event"
  - "Assumption: 50 regions × 200 categories × 5 channels of dimensions"
  - "Assumption: 500 concurrent dashboard viewers at peak, each refreshing every 10 seconds"
architectureSummary: "Services publish events to Kafka. A stream processor (Flink or Spark Structured Streaming) deduplicates, aggregates by one-minute event-time windows with a watermark, and emits updated window results; a real-time OLAP store (Apache Pinot, Apache Druid or ClickHouse) ingests both the aggregates and selected raw events with upsert semantics. A thin query API with caching serves dashboards and pushes updates over WebSockets or server-sent events. Raw events also land in the lakehouse, where the batch pipeline recomputes final numbers that overwrite the live ones after the finality window."
technologies:
  - "Apache Kafka"
  - "Apache Flink or Spark Structured Streaming"
  - "Real-time OLAP store: Apache Pinot, Apache Druid or ClickHouse"
  - "Query API with a cache (Redis) and WebSocket or server-sent-event push"
  - "Lakehouse (Delta Lake or Iceberg) and the batch pipeline for corrections"
tradeoffs:
  - decision: "Aggregate by event time with a 2-minute watermark"
    alternative: "Processing-time windows"
    reason: "Late events are counted in the minute they happened"
    consequence: "Recent minutes are revised for up to 2 minutes, and later events are left to batch correction"
  - decision: "Real-time OLAP store for serving"
    alternative: "Precomputed results in a key-value store"
    reason: "Ad-hoc filters and drill-downs across dimensions without precomputing every combination"
    consequence: "Another distributed system to operate; key-value is simpler if dashboards are fixed"
  - decision: "Upserts keyed by window and dimensions"
    alternative: "Append each emitted window result"
    reason: "A revised window replaces the old value instead of double counting"
    consequence: "The store must support upserts or the query must take the latest version per key"
  - decision: "Lambda-style correction from the batch pipeline"
    alternative: "Trust the stream as the only source"
    reason: "Batch handles very late data, bug fixes and reconciliation with finance"
    consequence: "Two computations of the same metric that must share definitions"
  - decision: "Server-side caching and push"
    alternative: "Every viewer queries the store directly"
    reason: "500 viewers asking the same question every 10 seconds become one query per interval"
    consequence: "Cache invalidation tied to window updates; a small staleness window"
interviewFollowUps:
  - "An event arrives 30 minutes late. What does the dashboard show, and when is it corrected?"
  - "How do you avoid double counting when a window result is emitted several times?"
  - "Pinot, Druid, ClickHouse or a key-value store: how do you choose?"
  - "Traffic jumps 10× during a flash sale. What breaks first?"
  - "The live revenue number differs from finance's daily number. Whose is right, and how do you reconcile?"
  - "How do you show users that the last two minutes are still provisional?"
related:
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "projects:real-time-analytics-pipeline"
  - "projects:kafka-spark-delta-streaming"
  - "system-designs:kafka-ingestion-system"
  - "system-designs:metrics-kpi-platform"
previous: "system-designs:log-ingestion-search-platform"
next: "system-designs:slowly-changing-dimension-framework"
versionContext: "The windowing example is plain Python run with Python 3 to show watermark and upsert behaviour; production uses Flink or Spark Structured Streaming. Store configuration is described, not executed."
sources:
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
  - { label: "Apache Pinot: stream ingestion with upsert", url: "https://docs.pinot.apache.org/build-with-pinot/ingestion/upsert-dedup/upsert" }
  - { label: "Apache Flink 2.0.0 release announcement", url: "https://flink.apache.org/2025/03/24/apache-flink-2.0.0-a-new-era-of-real-time-data-processing/" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
---

## Approach

"Real time" needs a number. Here it is one minute, which allows micro-batching and simplifies everything compared with sub-second needs. The risks are **event time and late data**, **duplicates and double counting**, **query load from many viewers**, and **live numbers that disagree with finance**. Ask:

- **Freshness target**: seconds or a minute? This decides the engine and the trigger interval.
- **Metrics and dimensions**: fixed tiles, or free filtering and drill-down?
- **Viewers**: how many, how often do dashboards refresh?
- **Correctness**: are live numbers indicative, or do people make financial decisions on them?
- **History**: how far back do live dashboards go before handing over to the warehouse?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> publish events with an event id and event time to Kafka, keyed by order or user id.</li>
<li><strong>Stream processor</strong> deduplicates by event id within the watermark, aggregates into one-minute event-time windows by dimension, and emits updated results every few seconds.</li>
<li><strong>Real-time OLAP store</strong> ingests window results from Kafka with upserts keyed by window and dimensions, plus selected raw events for drill-down.</li>
<li><strong>Query API</strong>: translates dashboard requests into store queries, caches results per interval, and pushes updates to open dashboards.</li>
<li><strong>Raw sink and batch</strong>: events land in the lakehouse; the batch pipeline recomputes final metrics, which overwrite live values after the finality window.</li>
</ol>
<figcaption>The stream gives freshness, the OLAP store gives fast slicing, and batch gives final, reconciled numbers.</figcaption>
</figure>

An order is placed in Manchester at 12:00:40 and its event reaches Kafka at 12:00:41. The streaming job adds it to the 12:00 window for UK/electronics/web and emits the updated totals within a few seconds. Pinot upserts the row for that key, the query API's cached result for the "orders per minute" tile expires, the next query includes it, and the WebSocket pushes the new value to 300 open dashboards. A phone that was offline sends an order from 11:58 at 12:01:30; it is within the 2-minute watermark, so the 11:58 window is revised and upserted. An order from 11:20 arriving at 12:05 is beyond the watermark: it goes to the raw table and is included when the hourly batch correction recomputes 11:00–12:00.

## Event time, watermarks and late data

Windows are defined by **event time**, so an order is counted in the minute it happened. The **watermark** tracks how far event time has progressed minus an allowed lateness; windows older than the watermark are finalised and their state dropped. Events older than the watermark cannot update the live state and go to a side output (or are simply left for batch).

The Python sketch below mimics what Flink or Spark do: deduplicate, aggregate per window and region, upsert the serving store, and reject events older than the watermark.

```python
from collections import defaultdict

WINDOW = 60          # 1-minute tumbling windows (seconds)
LATENESS = 120       # watermark = max event time seen - 2 minutes

windows = defaultdict(lambda: {"orders": 0, "revenue": 0.0})   # (window_start, region) -> totals
seen = set()
max_event_ts = 0
serving = {}         # what the dashboard store holds: upserted by key

def process(event_id, event_ts, region, amount):
    global max_event_ts
    watermark = max_event_ts - LATENESS
    if event_id in seen:
        return "duplicate"
    if event_ts < watermark:
        return "too late -> side output"
    seen.add(event_id)
    key = (event_ts // WINDOW * WINDOW, region)
    windows[key]["orders"] += 1
    windows[key]["revenue"] += amount
    serving[key] = dict(windows[key])          # upsert: a revised window overwrites the old value
    max_event_ts = max(max_event_ts, event_ts)
    return f"window {key[0]} {region} -> {serving[key]}"

events = [
    ("o1", 0,   "UK", 20.0),
    ("o2", 30,  "UK", 15.0),
    ("o3", 75,  "UK", 40.0),
    ("o2", 30,  "UK", 15.0),   # producer retry
    ("o4", 50,  "UK", 10.0),   # late, but within the watermark: window 0 is revised
    ("o5", 300, "DE", 99.0),   # moves the watermark to 180
    ("o6", 40,  "UK", 5.0),    # older than the watermark
]
for e in events:
    print(e[0], process(*e))
```

```text
o1 window 0 UK -> {'orders': 1, 'revenue': 20.0}
o2 window 0 UK -> {'orders': 2, 'revenue': 35.0}
o3 window 60 UK -> {'orders': 1, 'revenue': 40.0}
o2 duplicate
o4 window 0 UK -> {'orders': 3, 'revenue': 45.0}
o5 window 300 DE -> {'orders': 1, 'revenue': 99.0}
o6 too late -> side output
```

`o4` arrived after `o3` but belonged to the first minute, so that window was revised and its new value **overwrote** the serving row. `o6` was older than the watermark (300 − 120 = 180), so live state no longer accepted it. Choosing the lateness is a trade-off: a longer watermark captures more late data but keeps more state and makes recent minutes provisional for longer.

In Spark Structured Streaming this is `withWatermark("event_ts", "2 minutes")` with a windowed `groupBy` in update output mode and `dropDuplicatesWithinWatermark` on the event id. In Flink it is a watermark strategy with bounded out-of-orderness, keyed tumbling windows, and allowed lateness or side outputs.

## Choosing the serving store

| | Apache Pinot | Apache Druid | ClickHouse | Key-value store (Redis, DynamoDB) |
|---|---|---|---|---|
| Ingestion | Real-time from Kafka; upsert tables keyed by primary key | Real-time from Kafka; rollup at ingestion | Kafka engine or inserts; ReplacingMergeTree-style deduplication | Writes from the stream job |
| Queries | Low-latency OLAP with indexes, high concurrency | Low-latency OLAP, time-centric | Fast SQL analytics, rich functions | Lookups by exact key only |
| Updates | Native upsert (requires stream partitioned by primary key) | Mostly append; re-ingest to correct | Eventually deduplicated merges; use `FINAL` or argMax queries | Overwrite |
| Fit | User-facing and high-concurrency analytics | Time-series OLAP dashboards | Flexible analytics, simpler operations at moderate concurrency | Fixed tiles with no ad-hoc slicing |

For free filtering with hundreds of concurrent viewers and upserts of revised windows, Pinot is a strong fit. If dashboards are a fixed set of tiles, precomputing them in a key-value store is simpler and cheaper.

## Avoiding double counting

A window result is emitted several times as it is revised. If the store appends each emission, sums double. Options:

- **Upsert** by (window start, dimensions): the latest emission replaces earlier ones (Pinot upsert tables, ClickHouse with deduplicating engines, key-value overwrite).
- **Emit deltas** instead of totals and sum them (works for counts and sums, not for distinct counts).
- **Append versions** and query the latest version per key.

Upsert with full totals is the simplest to reason about.

## Query serving, caching and push

- Most viewers ask the same few questions. The query API caches each distinct query result for the update interval (for example 5 seconds) and serves all viewers from cache, so 500 viewers become a handful of store queries per interval.
- Push updates over WebSockets or server-sent events instead of every browser polling.
- Limit query shapes: time range caps (24 hours at minute grain, 90 days at hourly), required time filters, and pre-defined dimensions, so one user cannot launch a full-table scan.
- Return a **freshness timestamp** (latest complete window and current watermark) with every result, and render the last few minutes as provisional.

## Batch correction and reconciliation

- Raw events land in the lakehouse; the batch pipeline recomputes hourly and daily metrics with the same definitions and includes late events and corrections (refunds, cancellations, fraud reversals).
- After the finality window (for example the next hour for live numbers, D+1 for daily), batch results overwrite the live rows in the store. Dashboards beyond 24 hours read batch-computed hourly data.
- Share metric definitions between stream and batch (a semantic layer or shared SQL/library), otherwise the two disagree for reasons that have nothing to do with lateness.
- Reconcile daily: live total versus batch total per region; alert if the difference exceeds the expected late-data share.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Stream job restarts | Gap in updates | Resume from checkpoint; idempotent upserts mean replays do not double count |
| Consumer lag grows (traffic spike) | Dashboard falls behind | Lag alert; autoscale; show staleness banner from the freshness timestamp |
| OLAP store node fails | Slower or partial queries | Replicated segments; API serves cached results with a stale marker |
| Bug in aggregation logic | Wrong live numbers | Fix and redeploy; batch recomputation overwrites the affected period; replay Kafka for the live window |
| Clock-skewed producers | Events in the wrong minute | Sanity bounds on event time relative to ingest time |

## Scaling to 10×

At 1 million events/s: more Kafka partitions and stream parallelism; pre-aggregate earlier (per-partition partial aggregates before the shuffle); reduce dimension cardinality in the live path and leave rare dimensions to batch; scale OLAP servers horizontally with more segment replicas for query concurrency; and lean harder on caching and push for viewers.

## Monitoring and SLAs

- End-to-end freshness: now minus latest complete window per metric.
- Kafka consumer lag, stream processing rate, checkpoint duration, watermark delay.
- Late events beyond the watermark per minute (if this grows, revisit the lateness setting).
- Query latency p95, cache hit rate, concurrent connections.
- Live versus batch reconciliation difference.

## Capacity estimate

- **Ingest**: 20,000 events/s × 1 KB = 20 MB/s average; 100 MB/s at peak. 20,000 × 86,400 ≈ 1.7 billion events/day ≈ 1.7 TB/day raw.
- **Aggregate rows**: at most 50 × 200 × 5 = 50,000 dimension combinations per minute, but most combinations are empty in any given minute; assume 5,000 active ⇒ 5,000 × 1,440 ≈ 7.2 million rows/day at minute grain, about 7 million rows for the 24-hour live window: small for an OLAP store.
- **Hourly history**: 90 days × 24 hours × up to 50,000 combinations ≈ 108 million rows at most.
- **Stream state**: open windows for 2 minutes of lateness plus the current minute ≈ 3 × 5,000 active keys, plus dedup state for event ids seen within the watermark (100,000/s × 120 s ≈ 12 million ids at peak, a few hundred MB with compact keys).
- **Queries**: 500 viewers × one refresh every 10 s = 50 requests/s; with 5-second caching of maybe 30 distinct queries, the store sees about 6 queries/s.

## What a strong answer includes

- A precise **freshness target** and its consequences.
- **Event-time windows, watermarks and an explicit late-data policy**.
- **Deduplication and upserts** to avoid double counting.
- A reasoned **serving-store choice** for the query pattern.
- **Caching, push and query guardrails** for concurrency.
- **Batch correction and reconciliation**, with shared metric definitions and visible finality.
- **Degradation**: stale but labelled data when the stream lags.

## Common mistakes

- Processing-time windows, so a delayed batch of events lands in the wrong minute.
- Appending revised window results and double counting.
- No watermark, so state grows without limit.
- Letting every browser query the database every few seconds.
- Treating live numbers as final and arguing with finance about the difference.
- Separate metric logic in stream and batch.
- Hiding lag: a dashboard that silently shows old data is worse than one that says it is behind.

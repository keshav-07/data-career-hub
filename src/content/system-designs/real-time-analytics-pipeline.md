---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Real-Time Analytics Pipeline"
seoTitle: "Design a Real-Time Analytics Pipeline"
description: "A system-design case study for real-time analytics: event ingestion, stream processing with event-time windows, late data, serving fresh metrics and controlling cost."
inventoryId: "SYS-02"
technology: ["data-engineering", "kafka", "spark"]
topic: ["streaming", "architecture"]
difficulty: "Advanced"
problem: "Design a pipeline that turns application events into business metrics (orders per minute, revenue, conversion) visible on a dashboard within one minute of the events happening."
functionalRequirements: ["Ingest order and page-view events from many application servers", "Compute per-minute metrics by region and product category", "Serve the last 24 hours of metrics to a dashboard", "Make raw events available for later batch analysis"]
nonFunctionalRequirements: ["End-to-end latency under 60 seconds for 99% of minutes", "Correct counts despite duplicates and events arriving up to 10 minutes late", "No data loss on component restarts", "Dashboard queries return in under a second"]
scaleAssumptions: ["Average 20,000 events per second, peaks of 100,000", "About 1 KB per event", "Dashboard used by around 100 people concurrently"]
architectureSummary: "Producers publish events to Kafka; a stream processor aggregates by event time with watermarks and writes results to a low-latency store for the dashboard, while raw events also land in a lakehouse table."
technologies: ["Kafka", "Spark Structured Streaming or Flink", "Delta Lake (raw events)", "A low-latency OLAP store or key-value store for serving"]
tradeoffs: [{"decision": "Aggregate by event time with a 10-minute watermark", "alternative": "Processing-time windows", "reason": "Late events land in the correct minute", "consequence": "Recent minutes may be revised for up to 10 minutes; state must be held that long"}, {"decision": "Separate serving store for metrics", "alternative": "Dashboard queries the raw lakehouse table", "reason": "Sub-second reads on small pre-aggregated data", "consequence": "One more system to operate"}, {"decision": "Upserts keyed by (window, dimensions)", "alternative": "Append each window result", "reason": "Revised windows overwrite earlier values", "consequence": "Serving store must support upserts"}, {"decision": "Keep raw events in a lakehouse", "alternative": "Only keep aggregates", "reason": "Allows reprocessing and new metrics later", "consequence": "Storage cost"}]
interviewFollowUps: ["How would you correct metrics if a bug was found in the aggregation logic last week?", "What happens when an event arrives 30 minutes late?", "How do you deduplicate events retried by producers?", "How would you scale for a 10× traffic spike?"]
related: ["articles:etl-elt/batch-vs-streaming", "articles:kafka/topics-partitions-consumer-groups", "projects:kafka-spark-delta-streaming"]
previous: "system-designs:change-data-capture-platform"
next: "system-designs:scalable-lakehouse"
---

## Approach

Clarify what "real time" means (here, one minute), then design around **event time, late data and duplicates**, which are where real-time systems usually go wrong.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> publish events with an event id and event timestamp to Kafka, keyed by user or order id.</li>
<li><strong>Stream processor</strong> parses, deduplicates by event id within the watermark, and aggregates into one-minute event-time windows.</li>
<li><strong>Serving store</strong> receives upserted window results keyed by window and dimensions.</li>
<li><strong>Dashboard</strong> reads the last 24 hours from the serving store.</li>
<li><strong>Raw sink</strong>: a second query appends raw events to a lakehouse table for batch use.</li>
</ol>
<figcaption>Two outputs from one stream: fresh aggregates for the dashboard and raw events for everything else.</figcaption>
</figure>

## Event time and late data

Aggregate by the timestamp in the event, not arrival time. A 10-minute **watermark** tells the engine how long to keep each window open for late events; results for a window are upserted again as late events arrive, then the window's state is dropped.

## Duplicates

Producers can retry and consumers can reprocess after failure. Deduplicate on event id within the watermark, and make sinks idempotent (upsert by window key).

## Storage

Kafka retains events for several days for replay. Raw events land in a partitioned lakehouse table. Aggregates live in a serving store sized for 24 hours of minute-level rows.

## Reliability

Checkpoint stream state and offsets so restarts resume exactly where they stopped. Monitor consumer lag; if lag grows, the dashboard silently falls behind.

## Reprocessing

To fix a logic bug, rebuild historical aggregates in batch from the raw lakehouse table and overwrite the affected windows.

## Observability

Track input rate, processing rate, consumer lag, watermark delay, end-to-end latency and the number of late events dropped.

## Security

Events may contain personal data: restrict access to raw topics and tables, and aggregate before exposing data to the dashboard.

## Cost

Streaming compute runs continuously. Right-size the cluster for typical load with autoscaling headroom for peaks, and compact the raw table's small files.

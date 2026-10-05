---
previous: "projects:change-data-capture-pipeline"
next: "projects:fraud-detection-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Real-Time Analytics Pipeline"
description: "An advanced project: compute per-minute business metrics from a Kafka event stream with event-time windows and watermarks, and serve them to a live dashboard."
inventoryId: "PROJ-06"
technology: ["kafka", "spark"]
topic: ["streaming", "analytics"]
level: "Advanced"
problemStatement: "Build a pipeline that turns a stream of order events into per-minute revenue and order counts by category, visible on a dashboard within a minute, and correct even when events arrive late."
requirements: ["Produce synthetic order events with event timestamps, including some late events", "Aggregate into one-minute event-time windows with a watermark", "Upsert results into a serving table", "Show a live chart of the last hour", "Recover after restarts without double counting"]
technologies: ["Kafka", "Spark Structured Streaming", "A serving store (PostgreSQL works for a project)", "A simple dashboard (notebook or lightweight web chart)"]
dataset: "Synthetic events from a producer script that deliberately sends some events late and some twice."
steps: ["Write the producer with event ids, timestamps and configurable lateness", "Read the stream and parse with an explicit schema", "Deduplicate by event id within the watermark", "Aggregate by window and category", "Write results with upserts keyed by window and category", "Build the dashboard", "Test restart recovery and late-event handling"]
testing: ["Send duplicate events and confirm counts do not change", "Send events later than the watermark and confirm they are dropped and counted as dropped", "Compare streaming results with a batch recomputation from raw events"]
dataQuality: ["Aggregates reconcile with a batch recount over the same window", "No negative revenue"]
monitoring: ["Input rate and processing rate", "Watermark delay", "End-to-end latency from event time to dashboard"]
costConsiderations: ["Runs locally", "In production, continuous compute is the main cost; trigger interval trades latency for cost"]
interviewQuestions: ["Why event time instead of processing time?", "What does your watermark trade off?", "How do you avoid double counting after a restart?", "How would you fix a bug in historical aggregates?"]
resumeBullets: ["Built a streaming analytics pipeline with Kafka and Spark Structured Streaming using event-time windows, watermarks and deduplication", "Validated streaming aggregates against batch recomputation and tested recovery from restarts"]
extensions: ["Keep raw events in a lakehouse table for reprocessing", "Add alerting when revenue drops sharply"]
related: ["system-designs:real-time-analytics-pipeline", "articles:etl-elt/batch-vs-streaming", "projects:kafka-spark-delta-streaming"]
---

## Business context

Operations teams want to see within a minute when orders spike or stop. The interesting engineering is not the chart; it is producing **correct** numbers when events are late or duplicated.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Producer sends order events with event time and event id.</li>
<li>Spark reads from Kafka, deduplicates within the watermark.</li>
<li>One-minute event-time windows by category.</li>
<li>Upserts into the serving table.</li>
<li>Dashboard polls the serving table.</li>
</ol>
<figcaption>Late events update the right window until the watermark passes.</figcaption>
</figure>

Compare your streaming numbers with a batch recount over the same raw events. Any difference must be explained (for example, events dropped after the watermark).

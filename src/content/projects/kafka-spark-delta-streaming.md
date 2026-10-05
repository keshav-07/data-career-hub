---
previous: "projects:large-scale-batch-processing"
next: "projects:change-data-capture-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Kafka → Spark → Delta Lake Streaming Pipeline"
description: "An advanced project: stream events from Kafka with Spark Structured Streaming into Delta Lake tables with checkpointing, deduplication and late-data handling."
inventoryId: "PROJ-04"
technology: ["kafka", "spark", "delta-lake"]
topic: ["streaming"]
level: "Advanced"
problemStatement: "An application emits user events to Kafka. Build a streaming pipeline that lands them in Delta Lake within a minute, deduplicates replays, and produces per-minute aggregates that tolerate late events."
requirements: ["Consume events from a Kafka topic", "Write raw events to a Delta table with checkpointing", "Deduplicate events by event id within a watermark", "Compute per-minute aggregates with event-time windows", "Recover from restarts without losing or double-counting data"]
technologies: ["Kafka", "Spark Structured Streaming", "Delta Lake", "Docker Compose for local Kafka"]
dataset: "Generate synthetic events with a small producer script."
steps: ["Run Kafka locally and write a producer that emits keyed JSON events", "Read the topic with Structured Streaming and parse the schema", "Write raw events to Delta with a checkpoint location", "Add watermarking and deduplication on event id", "Compute windowed aggregates and write them to a second table", "Kill and restart the job to verify recovery", "Measure end-to-end latency"]
testing: ["Replay the same events and confirm aggregates do not change", "Send late events and check they are included or dropped according to the watermark"]
dataQuality: ["No duplicate event ids in the raw table", "Aggregates reconcile with raw counts per window"]
monitoring: ["Consumer lag", "Batch duration and input rate", "Latency from event time to availability"]
costConsiderations: ["Trigger interval trades latency for cost", "Compact Delta files produced by frequent small commits"]
interviewQuestions: ["What does the checkpoint store and why is it needed?", "How does a watermark bound state?", "Is your pipeline exactly-once end to end? Why or why not?"]
resumeBullets: ["Built a Spark Structured Streaming pipeline from Kafka to Delta Lake with checkpoint-based recovery, watermark-bounded deduplication and event-time aggregates", "Verified recovery by restarting the job mid-stream and reconciling aggregates with raw events"]
extensions: ["Add schema validation with a dead-letter topic", "Serve aggregates to a dashboard"]
related: ["articles:kafka/topics-partitions-consumer-groups", "articles:delta-lake/transactions-schema-evolution", "system-designs:change-data-capture-platform"]
---

## Business context

Teams increasingly need minute-level data for product monitoring. This project covers the hardest parts of streaming in a small setting: state, late data, duplicates and recovery.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>A producer sends keyed events to a Kafka topic.</li>
<li>Spark Structured Streaming reads micro-batches and parses JSON.</li>
<li>Raw events are appended to a Delta table; progress is tracked in a checkpoint.</li>
<li>Deduplicated, windowed aggregates are written to a second Delta table.</li>
</ol>
<figcaption>Kafka offsets and output commits are tracked together in the checkpoint, so restarts resume cleanly.</figcaption>
</figure>

Keep the checkpoint location stable: deleting it makes Spark treat the stream as new.

---
previous: "projects:kafka-spark-delta-streaming"
next: "projects:real-time-analytics-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Change Data Capture Pipeline"
description: "An advanced project: capture inserts, updates and deletes from PostgreSQL with log-based CDC, stream them through Kafka and apply them to a Delta table with MERGE."
inventoryId: "PROJ-05"
technology: ["kafka", "delta-lake", "spark"]
topic: ["cdc", "streaming"]
level: "Advanced"
problemStatement: "Replicate an operational PostgreSQL table into a lakehouse table within minutes, including updates and deletes, so analysts query current data without touching the production database."
requirements: ["Run PostgreSQL with logical replication enabled", "Capture changes with a log-based CDC connector into Kafka", "Apply changes to a Delta table with MERGE, ordered by source log position", "Handle deletes", "Take an initial snapshot without missing concurrent changes"]
technologies: ["PostgreSQL", "A log-based CDC connector (for example Debezium)", "Kafka", "Spark Structured Streaming", "Delta Lake", "Docker Compose"]
dataset: "Create your own orders table and a small script that inserts, updates and deletes rows continuously."
steps: ["Start PostgreSQL, Kafka and the CDC connector with Docker Compose", "Create a table and a change generator script", "Configure the connector and inspect change events in Kafka", "Write a streaming job that parses events and keeps the latest per key per micro-batch", "Apply with MERGE: update when the incoming position is newer, insert when new, delete on delete events", "Verify the Delta table matches PostgreSQL", "Restart components and verify nothing is lost or duplicated"]
testing: ["Compare row counts and checksums between source and target after a run", "Replay a topic from the beginning and confirm the target is unchanged"]
dataQuality: ["Primary keys unique in the target", "No rows exist in the target that were deleted in the source"]
monitoring: ["Connector lag", "Consumer lag", "Time from source commit to target visibility"]
costConsiderations: ["Runs locally in containers", "Kafka retention must cover the longest consumer outage you want to survive"]
interviewQuestions: ["How do you keep updates in order?", "How did you handle deletes?", "How does the initial snapshot avoid gaps?", "Why are replays safe?"]
resumeBullets: ["Built a log-based CDC pipeline from PostgreSQL through Kafka to Delta Lake that applies inserts, updates and deletes with ordered, idempotent MERGE", "Verified correctness by reconciling source and target and by replaying change topics without altering the target"]
extensions: ["Handle schema changes in the source table", "Keep a history table of every change for auditing"]
related: ["system-designs:change-data-capture-platform", "interview-questions:data-engineering/design-cdc-pipeline", "articles:kafka/topics-partitions-consumer-groups"]
---

## Business context

Analysts need current operational data, but querying the production database directly risks slowing the application. CDC keeps an analytical copy up to date from the database's own change log, without extra query load.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>PostgreSQL writes changes to its write-ahead log.</li>
<li>The CDC connector reads the log and publishes change events to Kafka.</li>
<li>A streaming job reads micro-batches and deduplicates to the latest change per key.</li>
<li>MERGE applies inserts, updates and deletes to the Delta table.</li>
<li>Analysts query the Delta table.</li>
</ol>
<figcaption>Changes flow from the database log to the lakehouse with per-key ordering.</figcaption>
</figure>

The design follows the [CDC system design case study](/data-engineering/system-design/change-data-capture-platform/); read it before building.

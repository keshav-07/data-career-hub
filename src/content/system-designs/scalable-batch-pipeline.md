---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Scalable Batch Data Pipeline"
description: "A system-design case study for a daily batch pipeline: requirements, layered storage, idempotent processing, orchestration, data quality, cost and trade-offs."
inventoryId: "SYS-01"
technology: ["data-engineering", "spark", "airflow"]
topic: ["batch", "architecture"]
difficulty: "Intermediate"
problem: "Design a pipeline that ingests daily order and customer extracts from several operational systems and produces reliable, analysis-ready tables for reporting by 07:00 each morning."
functionalRequirements: ["Ingest daily extracts from three source systems (orders, customers, products)", "Clean, deduplicate and conform the data into a star schema", "Publish fact and dimension tables for BI tools", "Support reprocessing any past day after a bug fix"]
nonFunctionalRequirements: ["Tables ready by 07:00 local time on 99% of days", "Reruns and retries must never duplicate data", "Failures alert the on-call engineer within 15 minutes", "Personal data is access-controlled"]
scaleAssumptions: ["Around 50 million order lines per day today, planning for 5× growth", "Two years of history kept in the curated layer", "About 200 analysts querying the published tables"]
architectureSummary: "Object storage holds raw, staging and curated layers in a transactional table format; Spark jobs transform each day's partition; Airflow orchestrates; a warehouse or lakehouse SQL endpoint serves BI."
technologies: ["Object storage", "Delta Lake (or another table format)", "Spark", "Airflow", "SQL warehouse / lakehouse endpoint"]
tradeoffs: [{"decision": "Batch, daily", "alternative": "Streaming", "reason": "Reporting needs data by morning, not within seconds", "consequence": "Simpler and cheaper to run; data is up to a day old"}, {"decision": "Keep raw data unchanged", "alternative": "Transform before storing", "reason": "Allows reprocessing history after a logic change", "consequence": "Extra storage cost; needs retention rules"}, {"decision": "Overwrite by date partition", "alternative": "Append-only loads", "reason": "Makes every run idempotent", "consequence": "Partitioning must align with the processing interval"}, {"decision": "Table format with ACID commits", "alternative": "Plain Parquet files", "reason": "Readers never see half-written partitions", "consequence": "Needs compaction and VACUUM housekeeping"}]
interviewFollowUps: ["How do you handle data that arrives two days late?", "How would the design change if the business wanted data within 5 minutes?", "How do you backfill a year of history without disturbing daily runs?", "Where would you put data-quality checks, and what happens when one fails?"]
related: ["interview-questions:data-engineering/idempotent-batch-pipeline", "articles:airflow/dags-scheduling-retries", "articles:spark/partitions-shuffles-skew", "articles:data-warehousing/star-schema"]
next: "system-designs:change-data-capture-platform"
---

## Approach

Start by clarifying requirements, then sketch the end-to-end flow, then go deep on the parts with real risk: idempotency, late data and quality. State assumptions out loud.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Extract</strong>: each source drops a daily file or table export into a landing area.</li>
<li><strong>Raw layer</strong>: files are copied unchanged into object storage, partitioned by ingestion date.</li>
<li><strong>Staging layer</strong>: Spark parses, types, deduplicates and validates each day's data.</li>
<li><strong>Curated layer</strong>: Spark builds conformed dimensions and the order-line fact table.</li>
<li><strong>Serve</strong>: BI tools query curated tables through a SQL endpoint.</li>
</ol>
<figcaption>Data flows left to right through three storage layers; each step reads only the previous layer and can be rerun on its own.</figcaption>
</figure>

## Storage

Use object storage with a transactional table format (such as Delta Lake). Partition large facts by business date so each daily run writes exactly one partition. Keep the raw layer immutable; it is the source for reprocessing.

## Processing

Each Spark job processes **one logical date** passed in by the orchestrator. Dimensions are updated with `MERGE` on business keys (type 2 history where needed); the fact partition for the date is **overwritten**. Filter and project early to keep shuffles small, and broadcast small dimensions when joining.

## Orchestration

An Airflow DAG per day: wait for sources → stage each source → build dimensions → build facts → run quality checks → publish. Tasks retry on transient errors, and because every write is an overwrite or merge, retries are safe.

## Reliability

- **Idempotency**: overwrite-by-partition and merges make reruns produce the same state.
- **Late data**: if a source delivers late, rerun the affected dates; partitioned overwrites make this routine.
- **Backfills**: run the same DAG for past dates with limited concurrency so daily runs keep priority.

## Data quality

Check row counts against the source, uniqueness of keys, non-null required columns and referential integrity between facts and dimensions. A failed critical check **stops the publish step**, so analysts see yesterday's correct data rather than today's wrong data.

## Observability

Track run duration, rows per stage, check results and freshness (time of the last successful publish). Alert on failure and on freshness breaching the 07:00 target.

## Security

Restrict raw and staging layers to engineers; expose curated tables through role-based access. Mask or separate personal data columns.

## Cost

Use autoscaling or right-sized clusters that run only during the batch window, compact small files, and expire old raw data according to retention policy.

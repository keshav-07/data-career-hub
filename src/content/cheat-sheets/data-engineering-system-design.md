---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Data Engineering System Design Cheat Sheet"
description: "A one-page framework for data engineering system design interviews: requirements, estimates, architecture, storage, processing, reliability, quality and trade-offs."
inventoryId: "CHEAT-10"
technology: ["data-engineering", "system-design"]
topic: ["reference", "system-design"]
cheatTopic: "System design"
related: ["system-designs:scalable-batch-pipeline", "system-designs:change-data-capture-platform", "articles:etl-elt/batch-vs-streaming"]
versionContext: "Technology-neutral framework"
---

## The order to talk in

1. **Clarify requirements**: users, questions to answer, freshness, correctness, retention.
2. **Estimate scale**: events/day, bytes/event, peak rate, history size, query concurrency.
3. **Sketch end to end**: sources → ingestion → storage layers → processing → serving.
4. **Go deep on risk**: late data, duplicates, schema change, backfills, skew.
5. **Reliability and quality**: idempotency, checks, alerting, recovery.
6. **Security and cost**.
7. **Trade-offs and alternatives**.

## Quick estimates

| Quantity | Rule of thumb |
|----------|---------------|
| Seconds per day | ~86,400 (use 10⁵ for mental maths) |
| 1 M events/day | ~12 events/second on average; plan for peaks of several times that |
| 1 KB × 1 B events | ~1 TB raw before compression |
| Columnar compression | Often several times smaller than raw JSON; measure for your data |

## Building blocks

| Need | Options |
|------|---------|
| Event transport | Kafka, managed streaming services |
| Database changes | Log-based CDC connectors |
| Raw storage | Object storage |
| Tables | Delta Lake, Apache Iceberg, Apache Hudi, warehouse tables |
| Batch processing | Spark, warehouse SQL, dbt |
| Stream processing | Spark Structured Streaming, Flink |
| Orchestration | Airflow, platform job schedulers |
| Serving | Warehouse/lakehouse SQL, OLAP stores, caches |

## Reliability checklist

- Each step rerunnable for a given interval (overwrite or merge).
- Late data policy (watermarks, reprocessing windows).
- Duplicate handling (event ids, upserts).
- Schema evolution policy (additive by default).
- Data-quality gates before publishing.
- Freshness and volume monitoring with alerts.
- Backfill path that does not disturb daily runs.

## Trade-offs to name

| Decision | Alternatives |
|----------|--------------|
| Batch vs streaming | Latency vs simplicity and cost |
| ETL vs ELT | Compliance and compute location |
| Normalised vs star schema | Write simplicity vs query simplicity |
| Partition key choice | Pruning vs small files |
| Exactly-once vs at-least-once + idempotency | Complexity vs practicality |
| Managed vs self-hosted | Operations vs control and cost |

## Closing

Summarise the design in three sentences, restate the main risk and how you handled it, and say what you would add with more time.

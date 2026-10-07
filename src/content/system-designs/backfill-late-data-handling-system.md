---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Backfill and Late-Data Handling System"
seoTitle: "Design a Backfill and Late-Data System"
description: "A system-design case study for backfills and late data: idempotent partition rewrites, affected-partition detection, dependency-aware reruns and validation."
technology: ["data-engineering", "airflow", "etl-elt"]
topic: ["batch", "backfill", "late-data", "architecture"]
tags: ["backfill", "late-arriving-data", "idempotency", "partition-overwrite", "watermarks", "airflow"]
difficulty: "Advanced"
problem: "Design the platform capabilities that let a data team handle late-arriving data automatically in daily and hourly pipelines, and run large backfills (after bug fixes, new columns or new pipelines) across months of history and dozens of dependent tables, safely, cheaply and without disturbing production loads or consumers."
functionalRequirements:
  - "Detect which partitions are affected by late-arriving or corrected source data and reprocess only those"
  - "Rerun any pipeline for any date range, with downstream dependencies rerun in the right order"
  - "Make every task idempotent, so reruns and retries produce the same result"
  - "Let backfills run alongside daily production runs without starving them"
  - "Validate backfilled output before it replaces what consumers read"
  - "Record what was reprocessed, why, with which code version"
nonFunctionalRequirements:
  - "Late data within the agreed window (for example 7 days) reflected in outputs by the next scheduled run"
  - "A one-year backfill of a core table finishes within a day or two, with bounded cost"
  - "No partial or duplicated data visible to consumers during a backfill"
  - "Production SLAs met while backfills run"
  - "Every published number traceable to its run and code version"
scaleAssumptions:
  - "Assumption: 300 daily and hourly pipelines producing about 1,200 tables in a lakehouse or warehouse"
  - "Assumption: core fact tables of 1 to 3 TB per year, partitioned by event date"
  - "Assumption: 2% of events arrive more than one day late, and almost all within 7 days"
  - "Assumption: about one large backfill a week and many small reruns a day"
architectureSummary: "Tables are partitioned by event date and written with idempotent partition overwrite or keyed MERGE. Each incremental run reads source rows by ingestion time (a high watermark), computes the set of affected event-date partitions, and rewrites exactly those, plus a fixed lookback. The orchestrator models data dependencies, so a backfill of one table schedules dependent tables for the same partitions. Large backfills run on separate compute with concurrency limits, write to a staging version, pass validation, then swap in atomically."
technologies: ["Orchestrator with backfill support (for example Airflow)", "Lakehouse tables with atomic partition overwrite and time travel (Delta Lake or Iceberg) or a cloud warehouse", "Spark or warehouse SQL", "Data quality checks", "Run metadata store and lineage", "Separate compute pools or queues for backfills"]
tradeoffs:
  - decision: "Rewrite whole affected partitions"
    alternative: "Append late rows as increments"
    reason: "Partition rewrites are idempotent and handle updates and deletes, not just inserts"
    consequence: "Rewriting a large partition for a few late rows costs more compute"
  - decision: "Detect affected partitions from ingestion time"
    alternative: "Always reprocess a fixed lookback of N days"
    reason: "Only partitions that actually received data are rewritten, and very late data is still caught"
    consequence: "Needs a reliable ingestion timestamp and careful watermark handling"
  - decision: "Backfills on separate compute with concurrency limits"
    alternative: "Run backfills on the production pool"
    reason: "Production SLAs are protected, and backfill cost is visible"
    consequence: "More infrastructure to manage; backfills may queue"
  - decision: "Write backfills to a staging version and swap after validation"
    alternative: "Overwrite production partitions directly"
    reason: "Consumers never see half-backfilled history, and rollback is easy"
    consequence: "Temporary double storage and a swap step"
  - decision: "Freeze closed periods and post corrections as adjustments where finance requires it"
    alternative: "Allow restatement of any past period"
    reason: "Reports already filed must not change silently"
    consequence: "Two correction mechanisms to explain to users"
interviewFollowUps:
  - "A source sends a correction for an event from 40 days ago. What happens in your system?"
  - "How do you make an aggregation task idempotent?"
  - "You need to backfill a new column in a 3 TB table and its 15 downstream tables. How do you plan it?"
  - "Why is max(updated_at) a dangerous watermark?"
  - "How do you stop a backfill from breaking the 07:00 SLA?"
  - "How do you prove a backfill did not change numbers it should not have changed?"
related:
  - "system-designs:scalable-batch-pipeline"
  - "system-designs:unified-batch-streaming-lambda-kappa"
  - "articles:airflow/dags-scheduling-retries"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:etl-elt/pipeline-reliability-and-retries"
  - "interview-questions:airflow/retries-and-idempotency"
versionContext: "The restatement SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Airflow backfill options (backfill create with --reprocess-behavior, --max-active-runs and --run-backwards) were checked against the Airflow 3.3 CLI help; lakehouse partition overwrite is described from the Delta Lake documentation."
sources:
  - { label: "Apache Airflow documentation: DAG runs (catchup and backfill)", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "PostgreSQL 16: transaction isolation", url: "https://www.postgresql.org/docs/16/transaction-iso.html" }
previous: "system-designs:ad-bidding-analytics-pipeline"
next: "system-designs:schema-registry-contract-system"
---

## Approach

Late data and backfills are two faces of the same problem: **recomputing the past correctly**. Late data is small, frequent and automatic; backfills are large, occasional and planned. Both depend on the same foundations: tables partitioned by business time, idempotent writes, explicit dependencies, and validation before consumers see results.

Clarifying questions:

- **How late can data be**, and what share arrives late? Is there a hard cut-off after which data is rejected or handled as an adjustment?
- **Which tables matter most**, and who consumes them (finance with closed periods, dashboards, ML)?
- **What triggers backfills**: bug fixes, new columns, new pipelines, source re-deliveries?
- **Platform**: lakehouse or warehouse, and does it support atomic partition overwrite, MERGE and time travel?
- **Constraints**: SLAs during backfills, compute budget, change-freeze periods.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Sources</strong> land raw data with an ingestion timestamp and the business event time.</li>
<li><strong>Change detection</strong>: each run reads rows ingested since its stored high watermark (minus a safety overlap) and lists the event-date partitions they belong to.</li>
<li><strong>Partition rewrite</strong>: the task recomputes each affected partition from all its source rows and atomically replaces it (partition overwrite or keyed MERGE).</li>
<li><strong>Dependency propagation</strong>: affected partitions are passed to downstream tasks, which rewrite the same partitions of their outputs.</li>
<li><strong>Backfill controller</strong>: planned backfills are submitted as date ranges per table; the orchestrator runs them in dependency order on a separate pool with concurrency limits.</li>
<li><strong>Staging and validation</strong>: large backfills write a staging version; checks compare it with the current version; an atomic swap publishes it.</li>
<li><strong>Run log</strong>: every partition write records run id, code version, input watermark and row counts.</li>
</ol>
<figcaption>Small corrections flow automatically through affected partitions; large backfills follow the same path with staging, limits and validation.</figcaption>
</figure>

## Foundations: partitioning and idempotency

- **Partition by event (business) date**, not by load date, for tables people query by business time. A late event then belongs to an old partition, which is exactly what gets rewritten.
- **Idempotent writes**: rerunning a task for a partition produces the same partition, whether it ran zero, one or ten times before. Two patterns:
  - **Partition overwrite**: compute the whole partition and replace it atomically (Delta Lake's `replaceWhere`, Iceberg's dynamic partition overwrite, or a delete-plus-insert in one warehouse transaction).
  - **Keyed MERGE**: upsert by business key; suitable when partitions are huge and few rows change, but it must also handle deletes.
- **Never append blindly** in a task that can be retried: a retry doubles the data.
- **Determinism**: avoid `current_date()`, random sampling or "latest" lookups inside transformations; pass the logical date and versioned reference data explicitly.

## Late data: affected-partition detection

The incremental run uses ingestion time to find what changed, and event time to decide what to rewrite. An example in PostgreSQL, with a high watermark stored per pipeline and the restatement done in one transaction:

```sql
CREATE TABLE events (event_id text PRIMARY KEY, event_date date, ingested_at timestamp, amount numeric(10,2));
CREATE TABLE daily_revenue (event_date date PRIMARY KEY, revenue numeric(12,2), rows_used int, run_id int);
CREATE TABLE pipeline_state (pipeline text PRIMARY KEY, high_watermark timestamp);

INSERT INTO events VALUES
  ('e1', '2026-09-01', '2026-09-01 23:00', 10), ('e2', '2026-09-02', '2026-09-02 12:00', 20),
  ('e3', '2026-09-02', '2026-09-02 18:00', 5);
INSERT INTO daily_revenue VALUES ('2026-09-01', 10, 1, 1), ('2026-09-02', 25, 2, 1);
INSERT INTO pipeline_state VALUES ('daily_revenue', '2026-09-03 00:00');

INSERT INTO events VALUES ('e4', '2026-09-01', '2026-09-04 02:00', 7), ('e5', '2026-09-03', '2026-09-04 03:00', 12);

BEGIN;
CREATE TEMP TABLE affected ON COMMIT DROP AS
  SELECT DISTINCT e.event_date
  FROM events e, pipeline_state s
  WHERE s.pipeline = 'daily_revenue' AND e.ingested_at > s.high_watermark;

DELETE FROM daily_revenue WHERE event_date IN (SELECT event_date FROM affected);
INSERT INTO daily_revenue
SELECT e.event_date, sum(e.amount), count(*), 2
FROM events e
WHERE e.event_date IN (SELECT event_date FROM affected)
GROUP BY e.event_date;

UPDATE pipeline_state SET high_watermark = (SELECT max(ingested_at) FROM events)
WHERE pipeline = 'daily_revenue';
COMMIT;

SELECT * FROM daily_revenue ORDER BY event_date;
```

```text
 event_date | revenue | rows_used | run_id
------------+---------+-----------+--------
 2026-09-01 |   17.00 |         2 |      2
 2026-09-02 |   25.00 |         2 |      1
 2026-09-03 |   12.00 |         1 |      2
```

Run 2 saw two newly ingested rows: `e4` (late, for 1 September) and `e5` (on time, for 3 September). It rewrote exactly those two partitions from **all** their source rows, so 1 September is now 17.00, while 2 September is untouched (still run 1). Because the delete, insert and watermark update share one transaction, a crash leaves either the old state or the new one, never a mix, and a rerun of the same step produces the same table.

**The watermark trap**: setting the watermark to `max(ingested_at)` can skip rows. A transaction that started earlier but commits later can insert rows with an `ingested_at` below the new watermark, and the next run will never see them. Mitigations: re-read with an overlap (watermark minus a safety margin, safe because rewrites are idempotent), use a commit sequence or change-data-feed version from the table format instead of wall-clock timestamps, or combine detection with a fixed lookback (for example always rewrite the last 3 days).

## Propagating to downstream tables

Affected partitions must flow down the dependency graph: if `daily_revenue` for 1 September changed, then `monthly_revenue` for September and any dashboard extract that reads it must be recomputed. Approaches:

- The orchestrator passes the affected partition list as task output to downstream tasks (data-aware scheduling helps here; Airflow, for example, can trigger downstream DAGs from dataset or asset updates).
- Aggregations at coarser grain map partitions upwards (day → month).
- Snapshot-style tables (slowly changing dimensions built from daily snapshots) need special care: correcting an old day can change every later version; either rebuild from the corrected day forward or treat late corrections as new versions.

## Planned backfills

A runbook for "backfill a new column into a 3 TB fact table and its 15 dependants for the last year":

1. **Plan** with lineage: list the downstream tables and the partitions affected. Estimate cost from bytes scanned per partition.
2. **Make the change backward compatible**: add the column as nullable so current runs keep working.
3. **Run on separate compute** with limited concurrency (for example 10 partitions at a time) so production runs keep their resources. In Airflow 3, `airflow backfill create` takes a date range, `--max-active-runs` to cap concurrency, `--reprocess-behavior` to decide whether completed or failed runs are rerun, and `--run-backwards` to process the most recent dates first (not supported when tasks depend on past runs).
4. **Write to staging**: a staging table or a separate branch or version of the table.
5. **Validate**: row counts per partition unchanged (for a column backfill), key metrics unchanged except where the change was intended, new column null rate as expected.
6. **Swap atomically**: replace production partitions from staging in a transaction, or swap table pointers. Keep the previous version (time travel) for rollback.
7. **Propagate** downstream in dependency order, each with the same validation.
8. **Record** the backfill in the run log and tell consumers what changed.

Process **recent dates first** when consumers care most about recent data; process **oldest first** when tasks depend on the previous day's output (cumulative tables).

## Closed periods and adjustments

Finance and regulatory reports often must not change after they are published. For those tables:

- Late data for a closed period is posted to an **adjustments** table or to the current open period, with a reference to the original date.
- Restating a closed period requires an explicit, approved backfill with a new report version.

## Data quality during reprocessing

- Compare old and new partition versions: row counts, sums of key measures, distinct keys. Alert on unexpected differences.
- Check that late-data volume per run is within normal bounds; a spike usually means a source replay or duplicate delivery.
- Block publication when validation fails; never "fix forward" by appending.

## Security and governance

Backfills read large amounts of historical data, possibly including personal data that has since been deleted for erasure requests. The backfill must read from the current (post-erasure) sources, never from old backups or snapshots that still contain deleted data. Restrict who can trigger backfills on sensitive tables, and log them.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Backfill fails halfway | Some partitions done, others not | Idempotent tasks: rerun the failed partitions only; staging keeps consumers unaffected |
| Watermark skipped rows | Late data never processed | Overlap window or table-version-based detection; periodic full reconciliation |
| Backfill saturates the warehouse | Production SLA missed | Separate pool, concurrency caps, pause and resume |
| Non-deterministic task | Different results on rerun | Remove `now()` and random logic; pin reference data versions |
| Wrong backfill published | Bad history visible | Roll back via time travel or previous staging version |

## Monitoring and SLAs

- Late-data share per source and per day, and the age distribution of late rows.
- Partitions rewritten per run; time from ingestion of a late row to its reflection in outputs.
- Backfill progress, cost and remaining partitions.
- Production SLA attainment during backfills.

## Cost

Rewriting a partition costs roughly the cost of reading its inputs. Keep partitions at a sensible size (daily for most facts, hourly only where needed), detect affected partitions instead of rewriting long fixed windows, prune downstream work to affected partitions, and schedule large backfills at off-peak times on discounted compute where available.

## Scaling to 10×

With 3,000 pipelines, manual backfill planning stops working. Invest in lineage-driven automation: request "backfill table X from date A to B" and the platform computes the downstream plan, cost estimate, staging, validation and swap. Partition-level metadata (which run wrote each partition, from which input versions) lets the platform skip partitions whose inputs did not change.

## Capacity estimate

Assumptions: a 3 TB/year fact table, daily partitions of about 8 GB; 15 dependent tables, mostly aggregates at 5% of the fact size; a warehouse or Spark pool that scans about 100 GB per minute for this workload (an assumption to measure).

- **Fact backfill for one year**: 365 × 8 GB ≈ 3 TB read and written; at 100 GB/min that is about 30 minutes of pure scanning, realistically 2 to 3 hours with writes and overhead.
- **Dependants**: 15 × 5% × 3 TB ≈ 2.25 TB to read and rewrite, similar order of time.
- **Concurrency**: limiting the backfill to 25% of the pool's capacity stretches that to roughly half a day, which meets the "within a day or two" target without hurting production.
- **Daily late data**: 2% of events arriving late spread over 7 days means every daily run rewrites around 7 to 8 partitions per table instead of 1, multiplying incremental cost by up to 8× for the largest tables. If that is too expensive, use keyed MERGE for the old partitions instead of full rewrites.

## What a strong answer includes

- Business-date partitioning and idempotent partition rewrite or keyed MERGE.
- Affected-partition detection from ingestion time, with the watermark pitfall and its fixes.
- Propagation of affected partitions through dependencies.
- A planned-backfill runbook: separate compute, concurrency limits, staging, validation, atomic swap, rollback.
- A policy for closed periods.
- Cost and SLA awareness, with numbers.

## Common mistakes

- Appending in retryable tasks, so reruns duplicate data.
- Partitioning by load date and then being unable to correct business dates.
- Using `max(updated_at)` as the watermark with no overlap.
- Backfilling straight into production tables while consumers read them.
- Forgetting downstream tables, so aggregates disagree with the corrected facts.
- Running a year-long backfill on the production pool the night before a deadline.

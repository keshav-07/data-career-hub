---
title: "Design an Idempotent Reprocessing System"
description: "A system-design case study for safe reprocessing and backfills: deterministic jobs, pinned inputs, partition replacement, run ledgers, downstream propagation and replay."
technology: ["data-engineering", "airflow", "delta-lake"]
topic: ["idempotency", "backfill", "reliability"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
problem: "A bug in the revenue logic went unnoticed for three weeks; a source re-sent a month of corrected data; a new metric needs two years of history. Today each of these takes a week of manual work and risks duplicates. Design a reprocessing system that lets engineers re-run any pipeline over any range of history, safely and repeatably, while daily runs continue, and that propagates corrections downstream."
functionalRequirements:
  - "Re-run any batch job for a chosen range of partitions (days, hours) with a chosen code version"
  - "Replay streaming jobs from an earlier offset or rebuild their outputs from the archive"
  - "Propagate reprocessed outputs to downstream tables in dependency order"
  - "Run backfills alongside daily runs without conflicts or resource starvation"
  - "Record what was reprocessed, with which inputs and code, and what changed"
  - "Validate reprocessed output before it replaces production data"
nonFunctionalRequirements:
  - "Running the same job twice for the same partition and inputs gives the same output (idempotent and deterministic)"
  - "A failure half way through leaves either old or new data per partition, never a mix"
  - "Daily SLAs are not missed because of a backfill"
  - "Two years of daily partitions reprocessable within a day for the main tables"
  - "Side effects (emails, API calls, payments) are never repeated by a reprocess"
scaleAssumptions:
  - "Assumption: 800 batch jobs and 40 streaming jobs"
  - "Assumption: main fact tables hold 2 years of daily partitions, about 1 TB per year each"
  - "Assumption: about 10 backfills a month, ranging from 3 days to 2 years"
  - "Assumption: Kafka retention of 7 days; raw events archived indefinitely in the lakehouse"
architectureSummary: "Jobs are written as deterministic functions of a partition and pinned input snapshots, and write with partition replacement or keyed MERGE in a single commit. A run ledger records every run's partition, input versions, code version and output statistics. A backfill controller expands a request into partition tasks, runs them in a separate low-priority pool, optionally writes to a shadow table for validation, publishes atomically, and triggers downstream jobs for the affected partitions using lineage. Streaming jobs are replayed from Kafka within retention or rebuilt from the raw archive in batch mode."
technologies:
  - "Orchestrator with backfill support and pools (Apache Airflow or Dagster)"
  - "Delta Lake or Iceberg (atomic overwrite, MERGE, time travel to pin inputs and roll back)"
  - "Apache Spark for batch reprocessing; Flink or Spark Structured Streaming for replays"
  - "Run ledger in a relational database"
  - "Lineage metadata (OpenLineage or a catalog) to find downstream dependencies"
tradeoffs:
  - decision: "Partition replacement as the default write"
    alternative: "Appends with deduplication later"
    reason: "Re-running a partition replaces exactly its own output, so reruns cannot duplicate"
    consequence: "Job boundaries must align with partitions; late data must be handled by reprocessing whole partitions"
  - decision: "Pin input snapshots for each run"
    alternative: "Read whatever the inputs contain at run time"
    reason: "Reproducible results and explainable differences between runs"
    consequence: "Inputs must be versioned tables and retain history long enough"
  - decision: "Shadow-table validation for large backfills"
    alternative: "Overwrite production partitions directly"
    reason: "Compare old and new output before consumers see it; easy abort"
    consequence: "Double storage during the backfill and an extra publish step"
  - decision: "Separate pool and priority for backfills"
    alternative: "Backfills share capacity with daily runs"
    reason: "Daily SLAs are protected"
    consequence: "Backfills take longer"
  - decision: "Rebuild streaming outputs from the raw archive in batch"
    alternative: "Only replay Kafka"
    reason: "Kafka retention is days; the archive covers years"
    consequence: "The streaming logic must also run in batch mode with identical results"
interviewFollowUps:
  - "What makes a job idempotent, and what makes it deterministic? Are they the same?"
  - "A three-week-old bug has corrupted a revenue table. Walk through the fix end to end."
  - "How do you stop a backfill from making the daily run miss its SLA?"
  - "How do you reprocess a job that sends emails or calls an external API?"
  - "Kafka keeps 7 days. How do you rebuild six months of a streaming job's output?"
  - "How do you know which downstream tables need reprocessing after a fix?"
related:
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "interview-questions:data-engineering/idempotent-batch-pipeline"
  - "interview-questions:airflow/retries-and-idempotency"
  - "articles:etl-elt/pipeline-reliability-and-retries"
  - "system-designs:scalable-batch-pipeline"
  - "system-designs:slowly-changing-dimension-framework"
previous: "system-designs:slowly-changing-dimension-framework"
versionContext: "The partition-replacement example was run on PostgreSQL 16, including a retried backfill. Orchestrator and lakehouse commands are described, not executed."
sources:
  - { label: "Apache Airflow: DAG runs (catchup and backfill)", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "Apache Airflow: best practices", url: "https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "Apache Iceberg table specification", url: "https://iceberg.apache.org/spec/" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
---

## Approach

Every pipeline will need to be re-run: bugs, late corrections, new requirements. The question is whether re-running is a routine operation or an incident. A strong answer separates **idempotency** (running twice has the same effect as once) from **determinism** (the same inputs and code give the same output), shows how writes, inputs and side effects achieve both, and then describes the **operational system** around backfills. Ask:

- **What triggers reprocessing?** Logic bugs, source corrections, late data, new columns or metrics, schema migrations.
- **What is the unit of work?** Daily or hourly partitions, or entity keys?
- **How far back?** Days, months, years? Are raw inputs retained that long?
- **Streaming jobs**: what is Kafka retention, and is there a raw archive?
- **Side effects**: do any jobs send emails, call partner APIs, or move money?
- **Downstream**: how many tables and dashboards depend on the job?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Backfill request</strong>: job, partition range, code version, reason and whether to validate in a shadow table, submitted through a CLI or UI and reviewed.</li>
<li><strong>Planner</strong>: expands the range into partition tasks, pins each task's input snapshots, and finds downstream jobs from lineage.</li>
<li><strong>Execution</strong>: tasks run in a dedicated low-priority pool; each reads pinned inputs and replaces its output partition (or MERGEs by key) in one commit.</li>
<li><strong>Validation</strong>: compare shadow output with production (row counts, key totals, sampled diffs); abort or approve.</li>
<li><strong>Publish</strong>: swap validated partitions into production atomically; record each run in the ledger.</li>
<li><strong>Propagation</strong>: trigger downstream jobs for the affected partitions in dependency order; notify owners of changed numbers.</li>
</ol>
<figcaption>Reprocessing is a planned, ledgered, validated run of the same deterministic jobs, not a one-off script.</figcaption>
</figure>

A bug counted refunded orders as revenue for three weeks. The engineer fixes the code (logic version v2), and submits a backfill of `daily_revenue` for those 21 days with shadow validation. The planner creates 21 partition tasks pinned to today's version of `silver.orders`, and finds 6 downstream tables and 4 dashboards. Tasks run overnight in the backfill pool while the daily run proceeds normally. Validation shows revenue drops by the refunded amount on each day and nothing else changes. The engineer approves; each partition is swapped in atomically, downstream jobs re-run for those days, and finance is notified with the before-and-after totals from the ledger.

## Idempotent writes

The write pattern decides whether a rerun duplicates data:

| Pattern | Idempotent? | Use when |
|---|---|---|
| Append | No | Only with downstream dedup on a unique key |
| Replace partition (overwrite) | Yes | Output partitioned like the work unit (daily aggregates, daily facts) |
| MERGE on a natural or event key | Yes | Updates to entity tables, CDC, late corrections across partitions |
| Full table rebuild | Yes | Small tables |

The example below (PostgreSQL 16) replaces exactly the reprocessed partitions in one transaction and records the run in a ledger. The retried backfill produces the same table, and the ledger does not grow.

```sql
CREATE TABLE orders (order_id INT, order_date DATE, amount NUMERIC(10,2), status TEXT);
INSERT INTO orders VALUES
  (1, '2026-10-01', 100.00, 'paid'),
  (2, '2026-10-01',  50.00, 'refunded'),
  (3, '2026-10-02',  70.00, 'paid'),
  (4, '2026-10-03',  30.00, 'paid');

CREATE TABLE daily_revenue (
  revenue_date  DATE PRIMARY KEY,
  revenue       NUMERIC(12,2),
  logic_version TEXT,
  run_id        TEXT
);

CREATE TABLE run_ledger (
  run_id        TEXT,
  partition_key DATE,
  logic_version TEXT,
  rows_written  INT,
  PRIMARY KEY (run_id, partition_key)
);

-- version 1 of the logic forgot to exclude refunds; it ran on 2026-10-04
INSERT INTO daily_revenue
SELECT order_date, sum(amount), 'v1', 'run-2026-10-04'
FROM orders GROUP BY order_date;

-- reprocess 2026-10-01 .. 2026-10-02 with the fixed v2 logic: replace exactly those partitions, atomically
BEGIN;
DELETE FROM daily_revenue WHERE revenue_date BETWEEN '2026-10-01' AND '2026-10-02';
INSERT INTO daily_revenue
SELECT order_date, sum(amount), 'v2', 'backfill-42'
FROM orders
WHERE status = 'paid' AND order_date BETWEEN '2026-10-01' AND '2026-10-02'
GROUP BY order_date;
INSERT INTO run_ledger
SELECT 'backfill-42', revenue_date, 'v2', 1
FROM daily_revenue WHERE run_id = 'backfill-42'
ON CONFLICT (run_id, partition_key) DO UPDATE SET rows_written = EXCLUDED.rows_written;
COMMIT;

-- the same backfill retried: same partitions, same inputs, same result
BEGIN;
DELETE FROM daily_revenue WHERE revenue_date BETWEEN '2026-10-01' AND '2026-10-02';
INSERT INTO daily_revenue
SELECT order_date, sum(amount), 'v2', 'backfill-42'
FROM orders
WHERE status = 'paid' AND order_date BETWEEN '2026-10-01' AND '2026-10-02'
GROUP BY order_date;
INSERT INTO run_ledger
SELECT 'backfill-42', revenue_date, 'v2', 1
FROM daily_revenue WHERE run_id = 'backfill-42'
ON CONFLICT (run_id, partition_key) DO UPDATE SET rows_written = EXCLUDED.rows_written;
COMMIT;

SELECT * FROM daily_revenue ORDER BY revenue_date;
SELECT count(*) AS ledger_rows FROM run_ledger;
```

```text
 revenue_date | revenue | logic_version |     run_id
--------------+---------+---------------+----------------
 2026-10-01   |  100.00 | v2            | backfill-42
 2026-10-02   |   70.00 | v2            | backfill-42
 2026-10-03   |   30.00 | v1            | run-2026-10-04

 ledger_rows
-------------
           2
```

Only 1 and 2 October were replaced; 3 October still shows v1 because it was outside the backfill range, which the `logic_version` column makes visible. In Delta Lake the equivalent is a single write with `replaceWhere` on the partition predicate (or dynamic partition overwrite); in Iceberg, an overwrite of the matching partitions; in Snowflake or BigQuery, a `MERGE` or delete-and-insert inside a transaction. The important property is **one atomic commit per partition or batch**, so a failure never leaves a partition half replaced.

## Deterministic jobs

Idempotent writes are not enough if the job computes something different each time:

- **No wall-clock time in logic**: use the partition's logical date (Airflow's data interval), not `now()`.
- **Pin inputs**: read input tables at a recorded version (Delta `VERSION AS OF`, Iceberg snapshot id, or a high-water mark), stored in the ledger. Reruns of the same run reproduce the same output; a deliberate reprocess with new inputs records the new versions.
- **Stable ordering and tie-breaking** in window functions and deduplication (`ORDER BY updated_at, event_id`, not just `updated_at`).
- **Versioned reference data**: exchange rates and mappings joined as of the partition date, not "latest".
- **Seeded randomness** for sampling.
- **Code version** recorded per run (git commit), so differences between runs are explainable.

## The run ledger

For every task: job, partition, run id, trigger (schedule or backfill id), code version, input table versions, output version, rows written, key totals, start and end time, status. The ledger answers "which logic produced the numbers in this partition?", powers before-and-after comparisons, and lets the planner skip partitions already produced with the same inputs and code.

## Backfill orchestration

- **Expansion**: one task per partition, so failures retry only that partition.
- **Isolation**: a dedicated pool (Airflow pools or a separate compute cluster) with lower priority and a concurrency cap, so daily runs keep their SLA. Throttle reads from source systems.
- **Ordering**: oldest to newest when partitions depend on previous ones (cumulative tables, SCD); otherwise in parallel.
- **Locks**: a partition being backfilled must not be written by the daily run at the same time. Either the daily run skips partitions under backfill, or the backfill avoids the live window (usually today and yesterday) and leaves that to the normal schedule.
- **Shadow mode** for large or risky backfills: write to a shadow table, validate, then swap partitions in. For small fixes, direct replacement with table time travel as the rollback is enough.

## Downstream propagation

A corrected table is not the end: aggregates, marts, feature tables, extracts and dashboards built from it are still wrong. Use lineage to compute the set of downstream jobs and their partition mapping (same day, or a rolling window that includes the day), then trigger them in dependency order. dbt's graph selectors (`model+`) or Airflow asset-aware scheduling help. Notify owners of affected data products with the change summary.

## Side effects

Jobs that send emails, push to partner APIs or trigger payments must not repeat them on reprocess:

- Separate **pure computation** (idempotent, re-runnable) from **side-effecting delivery**.
- Deliveries use **idempotency keys** derived from the business event (for example `invoice_id`) and an outbox or delivery log; a reprocess recomputes data but the delivery step sees the key already delivered and does nothing.
- Backfills run with deliveries disabled by default.

## Streaming replay

- **Within Kafka retention**: start a new consumer group (or reset offsets) from the desired time, run the fixed job writing to a new output, validate, then switch consumers. Idempotent sinks (upsert by key) make overlapping replays safe.
- **Beyond retention**: rebuild from the raw archive in the lakehouse. The streaming logic must be runnable in batch mode with identical semantics (Spark Structured Streaming jobs can usually run the same transformations as a batch query; Flink supports bounded execution of the same pipeline).
- Event-time logic and deterministic deduplication are what make replayed results match live ones.

## Validation

- Row counts and key totals per partition, old versus new.
- Distribution of differences: a revenue fix should change revenue, not order counts.
- Sampled row-level diff on keys.
- Automatic abort if differences exceed what the reason for the backfill predicts.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Task fails mid-partition | Partition unchanged (atomic commit) | Retry the partition |
| Wrong code version used | Wrong output | Ledger shows version; roll back with table time travel; rerun |
| Input history expired | Cannot reproduce | Retention policy on inputs must cover the reprocessing horizon; otherwise rebuild from raw |
| Backfill collides with daily run | Conflicting writes | Partition locks or exclusion of the live window |
| Downstream not refreshed | Inconsistent numbers | Lineage-driven propagation; consistency checks between layers |

## Scaling to 10×

For 20-year histories or 10× data: reprocess at coarser partitions (monthly) where logic allows, use larger dedicated clusters for big backfills (cost is temporary), skip unchanged partitions using the ledger, and make downstream propagation incremental by mapping affected partitions precisely rather than rebuilding everything.

## Monitoring and SLAs

- Backfills in progress, partitions done and remaining, estimated finish.
- Impact on daily SLAs (queue time of scheduled tasks during backfills).
- Validation outcomes and aborts.
- Partitions in production produced by outdated logic versions (from the ledger).

## Capacity estimate

- **Two-year backfill of one main table**: 730 daily partitions × about 1.4 GB per partition (1 TB/year ÷ 365 × compression-neutral) ≈ 1 TB to read and write. With 20 partitions processed in parallel at, say, 5 minutes each, that is 730 ÷ 20 × 5 ≈ 3 hours, inside the one-day target.
- **Shadow storage**: up to one extra copy of the reprocessed range (1 TB) for the duration of the backfill.
- **Downstream**: if 6 downstream tables each need the same 730 partitions, total work is several times the primary backfill; run them as the primary partitions complete, not after the whole range.
- **Ledger**: 800 jobs × daily partitions plus backfills ≈ under 1 million rows a year, trivial.

## What a strong answer includes

- The difference between **idempotent** and **deterministic**, and how to achieve both.
- **Partition replacement or keyed MERGE in one atomic commit**.
- **Pinned input versions** and a **run ledger**.
- **Isolated, throttled backfills** that protect daily SLAs, with shadow validation for risky changes.
- **Lineage-driven downstream propagation**.
- **Side effects** separated and protected with idempotency keys.
- **Streaming replay** within retention and rebuild from the archive beyond it.

## Common mistakes

- Appending in jobs and hoping nobody re-runs them.
- Using `current_date` or `now()` in transformation logic.
- Reading "latest" reference data when reprocessing old partitions.
- Fixing one table and forgetting everything built from it.
- Running a two-year backfill in the same pool as the daily run.
- Re-sending customer emails or partner files during a backfill.
- Assuming Kafka can replay six months of data.

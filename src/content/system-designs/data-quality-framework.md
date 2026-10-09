---
title: "Design a Data Quality Framework"
description: "A system-design case study for a data quality framework: checks as code, severity and gating, quarantine, producer contracts, results storage and alert routing."
technology: ["data-engineering", "etl-elt", "dbt"]
topic: ["data-quality", "governance", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
problem: "Bad data keeps reaching dashboards and models: duplicated orders after a retry, a source that silently sent half its rows, negative prices after an upstream change. Design a company-wide data quality framework that lets teams declare expectations on their datasets, enforces them at the right points in batch and streaming pipelines, stops bad data from being published, and routes problems to the people who can fix them."
functionalRequirements:
  - "Declare checks as code next to each dataset: schema, keys, nulls, ranges, referential integrity, freshness, volume, custom business rules"
  - "Run checks in batch pipelines (Spark, dbt, warehouse SQL) and on streaming data"
  - "Block publishing when critical checks fail; warn on others"
  - "Quarantine invalid rows with reasons instead of dropping them"
  - "Store every check result with history for trends, audits and dashboards"
  - "Alert dataset owners with context and lineage to the likely cause"
nonFunctionalRequirements:
  - "Checks add no more than 10% to pipeline runtime for large tables"
  - "Results visible within minutes of a run, in the catalog and a quality dashboard"
  - "Adding a check takes minutes for a dataset owner, with no platform ticket"
  - "Few false alarms: alert precision high enough that owners act on alerts"
  - "Works across at least two engines (Spark and the warehouse)"
scaleAssumptions:
  - "Assumption: 2,000 production datasets, 400 of them critical"
  - "Assumption: about 15,000 checks running daily"
  - "Assumption: largest table receives 2 billion rows a day"
  - "Assumption: 30 owning teams"
architectureSummary: "Checks are declared in YAML or code beside each dataset (dbt tests, Great Expectations or Soda checks, Spark-native checks). Pipelines run them at defined gates: ingestion (row-level validation and quarantine), transformation (table-level tests before publish) and consumption (freshness and reconciliation). A write-audit-publish pattern builds data in a staging table or branch, runs blocking checks, and only then swaps it in. All results go to a central results store, which feeds the catalog, a quality dashboard and an alert router that notifies owners."
technologies:
  - "dbt tests and model contracts for warehouse models"
  - "Great Expectations, Soda Core or Deequ for Spark and Python pipelines"
  - "Schema registry for streaming contracts; validation in Flink or Spark Structured Streaming"
  - "Delta Lake or Iceberg (staging tables, branches or time travel) for write-audit-publish"
  - "Central results store (warehouse table) and catalog integration"
  - "Alerting through Slack or PagerDuty with owner routing"
tradeoffs:
  - decision: "Write-audit-publish for critical tables"
    alternative: "Write to production, then test"
    reason: "Consumers never see data that failed blocking checks"
    consequence: "Extra staging step and storage; publish becomes a separate atomic operation"
  - decision: "Severity levels (block, warn, info) per check"
    alternative: "Every failed check fails the pipeline"
    reason: "Only checks that indicate unusable data stop the business; minor issues warn"
    consequence: "Owners must decide severities; mis-set severities either block too much or let bad data through"
  - decision: "Quarantine bad rows at ingestion"
    alternative: "Drop invalid rows or fail the whole batch"
    reason: "Good rows flow on time, bad rows are kept for diagnosis and replay"
    consequence: "Quarantine must be monitored or it becomes a silent data loss"
  - decision: "Use each engine's native tooling behind one results format"
    alternative: "One quality tool for every engine"
    reason: "dbt tests in the warehouse, Spark checks in Spark; no data moves to be checked"
    consequence: "A shared results schema and adapters are needed to see quality in one place"
  - decision: "Data contracts with producing teams for key sources"
    alternative: "Consumers detect upstream breakages after the fact"
    reason: "Breaking changes are caught in the producer's CI, before data is wrong"
    consequence: "Requires buy-in from application teams and contract tooling"
interviewFollowUps:
  - "Where in the pipeline do you put which checks, and why?"
  - "A volume check fires every Monday because weekend traffic is lower. How do you fix the false alarms?"
  - "How do you validate a 2-billion-row table without doubling runtime?"
  - "A blocking check fails at 05:30 and the dashboard SLA is 07:00. What happens?"
  - "How do you get an application team to stop breaking your pipelines?"
  - "How do you measure whether the framework is working?"
related:
  - "articles:etl-elt/data-quality-checks-contracts"
  - "interview-questions:data-engineering/data-quality-checks"
  - "articles:etl-elt/pipeline-observability"
  - "articles:delta-lake/transactions-schema-evolution"
  - "system-designs:elt-pipeline-with-dbt"
  - "system-designs:scalable-batch-pipeline"
previous: "system-designs:scalable-batch-pipeline"
next: "system-designs:data-observability-system"
versionContext: "The check-and-gate SQL was run on PostgreSQL 16. Tool configuration (dbt, Great Expectations, Soda) is described, not executed."
sources:
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "dbt documentation: model contracts", url: "https://docs.getdbt.com/reference/resource-configs/contract" }
  - { label: "Confluent Schema Registry: schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "PostgreSQL documentation: aggregate functions", url: "https://www.postgresql.org/docs/current/functions-aggregate.html" }
---

## Approach

A data quality framework is less about the check library and more about **where checks run, what happens when they fail, and who gets told**. A framework that only produces red dashboards nobody reads is worse than none. Ask:

- **What failures hurt most today?** Duplicates, missing data, late data, wrong values, schema breaks?
- **Which datasets are critical**, and what is the cost of publishing bad data versus publishing late?
- **Engines and tools**: warehouse with dbt, Spark, streaming? Any existing tests?
- **Ownership**: does every dataset have an owner who can act on an alert?
- **Producers**: are upstream application teams willing to own contracts?
- **Regulatory needs**: audit trails of quality for finance or regulated reporting?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Checks as code</strong>: owners declare expectations in YAML next to each model or table; CI validates the definitions.</li>
<li><strong>Ingestion gate</strong>: schema and row-level validation (types, required fields, allowed values); invalid rows go to a quarantine table with a reason.</li>
<li><strong>Transformation gate</strong>: write-audit-publish. Build into a staging table or branch, run table-level checks (keys, nulls, ranges, referential integrity, volume, reconciliation), publish only if blocking checks pass.</li>
<li><strong>Consumption checks</strong>: freshness SLAs and metric reconciliations on published data.</li>
<li><strong>Results store</strong>: every check result (dataset, check, run, observed value, threshold, pass or fail, severity) appended to one table.</li>
<li><strong>Routing and visibility</strong>: alerts to owners with lineage context; badges in the catalog; a quality dashboard with trends.</li>
</ol>
<figcaption>Checks run at three gates, results land in one store, and failures reach owners before consumers notice.</figcaption>
</figure>

Tonight the orders pipeline loads 50 million rows. At ingestion, 1,200 rows have an unknown currency code and are quarantined; the batch continues and a warning records the quarantine rate (0.002%). The silver build writes to a staging table, and checks run: `order_id` unique, `amount >= 0`, every `customer_id` exists in `dim_customer`, row count within 20% of the same weekday's baseline. Everything passes, so the staging version is published atomically. On another night the duplicate check fails: the table is not published, yesterday's version remains, the owning team is paged with the failing check and a sample of duplicate keys, and the dashboard shows a "data delayed" banner.

## Types of checks

| Dimension | Example checks | Typical gate |
|---|---|---|
| Schema | Expected columns and types, contract match | Ingestion, build time |
| Validity | Allowed values, ranges, regex formats | Ingestion (row level) |
| Completeness | Null rates, required fields, all partitions present | Transformation |
| Uniqueness | Primary or grain key unique | Transformation (blocking) |
| Consistency | Foreign keys exist, totals equal sum of lines | Transformation |
| Volume | Row count within a band of a baseline | Ingestion and transformation |
| Freshness | Latest record or load within SLA | Consumption, source freshness |
| Accuracy | Reconciliation with system of record (ledger, source counts) | Consumption |
| Distribution | Mean, quantiles or category mix drift | Monitoring (usually warn) |

## Checks, severity and the publish decision

Each check has a **severity**: `block` (data must not be published), `warn` (publish, alert owner), `info` (record only). The example below runs on PostgreSQL 16: three checks write results, and the publish decision depends only on blocking checks.

```sql
CREATE TABLE orders (
  order_id    INT,
  customer_id INT,
  amount      NUMERIC(10,2),
  loaded_at   TIMESTAMP
);
INSERT INTO orders VALUES
  (1, 10, 25.00, '2026-10-05 02:00'),
  (2, 11, NULL,  '2026-10-05 02:00'),
  (2, 11, 40.00, '2026-10-05 02:00'),
  (3, NULL, -5.00, '2026-10-05 02:00');

CREATE TABLE dq_results (
  dataset    TEXT,
  check_name TEXT,
  severity   TEXT,
  observed   NUMERIC,
  threshold  NUMERIC,
  passed     BOOLEAN
);

INSERT INTO dq_results
SELECT 'orders', 'order_id_unique', 'block',
       count(*) - count(DISTINCT order_id), 0,
       count(*) - count(DISTINCT order_id) = 0
FROM orders
UNION ALL
SELECT 'orders', 'customer_id_null_rate', 'warn',
       round(avg(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END), 3), 0.01,
       avg(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) <= 0.01
FROM orders
UNION ALL
SELECT 'orders', 'amount_non_negative', 'block',
       count(*) FILTER (WHERE amount < 0), 0,
       count(*) FILTER (WHERE amount < 0) = 0
FROM orders;

SELECT check_name, severity, observed, threshold, passed FROM dq_results ORDER BY check_name;

SELECT CASE WHEN bool_and(passed) FILTER (WHERE severity = 'block') THEN 'publish' ELSE 'hold' END AS decision
FROM dq_results;
```

```text
      check_name       | severity | observed | threshold | passed
-----------------------+----------+----------+-----------+--------
 amount_non_negative   | block    |        1 |         0 | f
 customer_id_null_rate | warn     |    0.250 |      0.01 | f
 order_id_unique       | block    |        1 |         0 | f

 decision
----------
 hold
```

In a real framework, these checks are generated from YAML declarations rather than written by hand, and the results row also carries the run id, timestamp, engine and a link to sample failing rows. Storing the **observed value**, not just pass or fail, is what makes trends and threshold tuning possible.

## Write-audit-publish

The safest gate for critical tables:

1. **Write** the new data to a staging location: a staging table, an Iceberg branch (Delta Lake has no branches; use a staging table or a shallow clone), or a new table version that is not yet exposed.
2. **Audit**: run blocking checks against the staged data.
3. **Publish**: atomically swap or merge the staged data into the production table (an `ALTER TABLE ... SWAP WITH` in Snowflake, a fast-forward of an Iceberg branch, or a single MERGE/overwrite commit in Delta).

If audit fails, production still holds the last good version. Pair this with a clear status ("data delayed") for consumers; holding data is only better than publishing it if users know it is held.

## Row-level validation and quarantine

At ingestion, validate each record against the schema and simple rules. Invalid rows go to `<table>_quarantine` with the raw record, the failed rule and the batch id. Rules:

- Quarantine rate is itself a check: above a threshold (say 1%), escalate to blocking, because many invalid rows usually means an upstream change, not a few bad records.
- Quarantined rows are replayable after a fix.
- Quarantine tables have retention and owners, so they do not become a silent dumping ground.

In streaming pipelines, the same idea is a dead-letter topic with error metadata.

## Thresholds without false alarms

Static thresholds ("row count between 1 and 10 million") break on growth and seasonality. Better:

- Compare with the **same weekday** over recent weeks, or a rolling median with a tolerance band.
- Use relative thresholds (within 20% of baseline) for volume, absolute ones for invariants (zero duplicates).
- Let owners snooze or adjust checks with a reason recorded.
- Track **alert precision**: the share of alerts that led to action. Checks that never lead to action are downgraded or removed.

## Large tables: checking cheaply

- Check only **new partitions** (today's load), not the whole table.
- Compute many checks in **one scan**: null counts, min/max, distinct-key counts and range violations can all come from one aggregate query; Deequ-style analysers do this in Spark.
- Use approximate distinct counts for very large uniqueness checks where an exact one is too expensive, and an exact check on the key only where duplicates would be harmful.
- Reuse file and table statistics for min/max and null counts when the format keeps them.

## Contracts with producers

Many quality problems start upstream, when an application team changes a column or an event. A **data contract** is an agreement, in code, on schema, semantics, freshness and quality for a dataset the producer publishes:

- For events: a schema-registry subject with compatibility rules, checked in the producer's CI.
- For tables: a contract file (columns, types, constraints, SLAs) validated against the producer's database migrations in CI.
- Breaking changes need a new version and a migration period.

Contracts move detection from "a dashboard is wrong" to "the pull request is red".

## Ownership and alert routing

- Every dataset has an owning team in the catalog; every check inherits it.
- Alerts include the dataset, the check, observed versus expected values, a sample of failing rows (masked if sensitive), recent changes upstream (from lineage) and a runbook link.
- Route upstream: if a source-volume check fails, the alert goes to the source owner, and downstream owners get an informational notice.
- Incidents for critical datasets follow the normal on-call process.

## Security

Failing-row samples may contain personal data. Store samples in restricted tables, mask sensitive columns in alerts, and keep only identifiers where possible.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Blocking check fails close to SLA | Data held, SLA at risk | Owner paged; options are fix and rerun, or a documented override with sign-off |
| Check itself is wrong | False blocks or missed issues | Checks are code: reviewed, tested, versioned; track false alarms |
| Quarantine grows silently | Hidden data loss | Quarantine rate check with escalation |
| Results store down | No visibility | Pipelines still evaluate checks locally and gate; results are written when the store recovers |
| Upstream breaking change | Mass failures | Contract checks in producer CI; ingestion schema check stops early |

## Scaling to 10×

At 150,000 checks a day: generate standard checks automatically from metadata (every primary key gets a uniqueness check, every foreign key a relationship check, every table a freshness check), so owners only write business rules. Partition the results store by date and dataset. Move anomaly detection on observed values to a scheduled job over the results store rather than per pipeline.

## Monitoring and SLAs

- Share of critical datasets with checks, and checks per dataset.
- Pass rate per dataset and team; mean time to detect and to resolve quality incidents.
- Alert precision and number of overrides.
- Incidents found by consumers before the framework (the number to drive towards zero).

## Capacity estimate

- **Results volume**: 15,000 checks/day × about 200 bytes per result ≈ 3 MB/day; a year is about 1 GB. The results store is tiny; keep it all.
- **Runtime overhead**: a combined profile scan of a 2-billion-row daily partition costs roughly one extra read of that partition. That stays within the 10% target only when the build is much heavier than a scan (joins, shuffles and writes usually are); if it is not, compute the aggregates inside the build's own pass or on a sample. Uniqueness on a large key is the expensive check, so run it on the new partition and keys only.
- **Quarantine**: at 0.01% invalid rows on 2 billion rows, 200,000 rows/day, a small table.
- **Alert load**: with 15,000 checks and a 0.5% daily failure rate, about 75 failures a day; grouping by dataset and run turns them into perhaps 20–30 actionable alerts for 30 teams, which is manageable.

## What a strong answer includes

- **Gates at three points** (ingestion, transformation, consumption) with different check types.
- **Severity levels** and a clear publish decision.
- **Write-audit-publish** so consumers never see data that failed blocking checks.
- **Quarantine** with monitoring, and DLQs for streaming.
- **Adaptive thresholds** and alert-precision tracking to avoid alert fatigue.
- **Results stored with observed values** for trends and audits.
- **Ownership and routing**, and **contracts** with producers to prevent problems.

## Common mistakes

- Running tests after publishing, so consumers see bad data first.
- Failing the whole pipeline for any warning-level issue.
- Dropping invalid rows silently.
- Static volume thresholds that fire every weekend.
- Alerts with no owner, no context and no runbook.
- Checking full history every run on billion-row tables.
- Treating quality as the data team's job alone, with no contracts upstream.

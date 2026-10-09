---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Data SLA and Freshness Monitoring System"
seoTitle: "Design Data SLA and Freshness Monitoring"
description: "A system-design case study for data reliability: SLAs and SLOs per dataset, freshness and volume signals, lineage-aware alerting, status pages and error budgets."
technology: ["data-engineering", "airflow", "etl-elt"]
topic: ["governance", "observability", "data-quality", "architecture"]
tags: ["data-sla", "freshness", "data-observability", "lineage", "alerting", "error-budgets"]
difficulty: "Advanced"
problem: "Design a system that tells a company, for each of its important datasets, whether the data is fresh, complete and correct enough to use right now; alerts the right owner before consumers notice a problem; shows which downstream dashboards and models are affected; and reports SLA attainment over time."
functionalRequirements:
  - "Register SLAs per dataset: freshness, completeness, quality checks, owner, tier and consumers"
  - "Collect signals: last successful update, data time covered, row volumes, schema changes, test results, pipeline run status"
  - "Evaluate SLAs continuously and raise alerts with severity, owner and affected downstream assets"
  - "Suppress duplicate alerts by grouping failures that share a root cause in lineage"
  - "Show a status page per dataset and per data product, and badges in BI tools"
  - "Report monthly SLA attainment and error budget consumption per team"
nonFunctionalRequirements:
  - "A tier-1 freshness breach is detected within 5 minutes of the SLA deadline"
  - "Alert precision high enough that owners trust and act on pages"
  - "Monitoring works when pipelines or the orchestrator are down (it must not depend only on them reporting)"
  - "Adding a dataset to monitoring takes minutes, mostly from defaults"
  - "Signal collection adds negligible cost to the warehouse"
scaleAssumptions:
  - "Assumption: 5,000 tables, 300 of them with explicit SLAs (60 tier 1)"
  - "Assumption: 800 pipelines in one or more orchestrators"
  - "Assumption: 4,000 dashboards and 40 ML models downstream"
  - "Assumption: lineage graph of about 20,000 edges"
architectureSummary: "SLA definitions live as code next to the models they describe. Collectors gather metadata from warehouse system tables, table-format commit logs, orchestrator run events and data-quality results, writing time-series signals to a monitoring store. An evaluator checks each SLA on a schedule and on events, computes status (ok, at risk, breach), and an alert router groups breaches through lineage so only the root asset pages its owner while downstream assets show 'impacted'. Status is published to a catalog, status page and BI badges; attainment is aggregated into monthly reports and error budgets."
technologies: ["Orchestrator events (for example Airflow callbacks, run history API)", "Warehouse metadata and table-format commit history", "Data quality framework results (dbt tests or similar)", "Lineage graph (OpenLineage-style events or parsed from transformation code)", "Time-series or relational monitoring store", "Alerting and on-call tool", "Data catalog and BI integration for status badges"]
tradeoffs:
  - decision: "Measure freshness from the data (time covered) as well as from job success"
    alternative: "Treat 'job succeeded' as fresh"
    reason: "A job can succeed while loading nothing or old data; consumers care about what the data covers"
    consequence: "Needs a reliable event-time or watermark column per dataset"
  - decision: "Independent collectors reading warehouse metadata"
    alternative: "Pipelines push their own status only"
    reason: "Monitoring must catch a scheduler that is down or a job that never started"
    consequence: "Collectors for each platform; some signals arrive with a short delay"
  - decision: "Lineage-aware alert grouping"
    alternative: "Alert on every breached dataset"
    reason: "One late source can breach 50 downstream tables; 50 pages hide the cause"
    consequence: "Depends on lineage being complete and current"
  - decision: "Tiered SLAs with paging only for tier 1"
    alternative: "Same alerting for every table"
    reason: "Keeps alert volume low and trust high"
    consequence: "Owners must classify datasets, and tiers need review as usage changes"
  - decision: "Learned volume baselines alongside fixed thresholds"
    alternative: "Fixed thresholds only"
    reason: "Volumes have weekly and seasonal patterns that fixed thresholds misjudge"
    consequence: "Anomaly detection can be noisy for new or irregular datasets; it needs tuning and suppression"
interviewFollowUps:
  - "What is the difference between an SLA, an SLO and an SLI for a dataset?"
  - "A pipeline succeeded but the dashboard is still showing yesterday. How does your system catch that?"
  - "A source system is late and 40 tables breach. Who gets paged?"
  - "How do you set the right freshness SLA for a table?"
  - "How do you stop monitoring from becoming an expensive workload on the warehouse itself?"
  - "How do you use error budgets to decide between reliability work and new features?"
related:
  - "system-designs:schema-registry-contract-system"
  - "system-designs:self-serve-analytics-platform"
  - "system-designs:backfill-late-data-handling-system"
  - "articles:etl-elt/pipeline-observability"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "interview-questions:data-engineering/data-quality-checks"
versionContext: "The SLA evaluation SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Orchestrator, warehouse and lineage integrations are described generically; check each tool's documentation for the metadata it exposes."
sources:
  - { label: "Apache Airflow documentation: logging and monitoring", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/index.html" }
  - { label: "Apache Airflow documentation: DAG runs", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "Delta Lake documentation: table batch reads and writes (history)", url: "https://docs.delta.io/latest/delta-batch.html" }
previous: "system-designs:vector-embeddings-pipeline"
---

## Approach

Data consumers do not care whether a DAG went green; they care whether **the numbers they are looking at are current and right**. A data SLA system turns that into measurable promises per dataset, watches them independently of the pipelines, and alerts the one owner who can fix the root cause. It borrows directly from service reliability practice:

- **SLI** (indicator): a measurement, such as "minutes between now and the latest event time in `gold.orders_hourly`".
- **SLO** (objective): a target for the SLI, such as "staleness under 2 hours, 99% of the time each month".
- **SLA** (agreement): the promise made to consumers, often with consequences, usually looser than the internal SLO.
- **Error budget**: the allowed failure (1% of the month is about 7.3 hours). When it is spent, reliability work takes priority.

Clarifying questions:

- **Which datasets matter**, and who depends on them (finance close, customer-facing dashboards, ML models)?
- **What do consumers need**: freshness by a time of day, continuous freshness, completeness, accuracy?
- **Where do signals come from**: which warehouses, table formats, orchestrators, quality tools?
- **Is lineage available**, and how complete is it?
- **Who is on call** for data, and what alert volume will they tolerate?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>SLA definitions as code</strong>: next to each model, a file states tier, owner, freshness rule (max staleness or deadline), volume expectations, required tests and consumers.</li>
<li><strong>Collectors</strong>: read warehouse information schemas and query history, table commit logs, orchestrator run events and data quality results on a schedule and from events.</li>
<li><strong>Monitoring store</strong>: time series of signals per dataset (data-through time, commit time, row counts, schema hash, test outcomes).</li>
<li><strong>Evaluator</strong>: computes each SLI and SLA status (ok, at risk, breach, no data) every few minutes and at each deadline.</li>
<li><strong>Alert router</strong>: walks lineage to find the most upstream breached asset, pages its owner, and marks downstream assets as impacted instead of paging their owners.</li>
<li><strong>Publish</strong>: status in the catalog, a status page, badges in BI tools, and messages to consumer channels.</li>
<li><strong>Reporting</strong>: monthly attainment and error budget per dataset and team.</li>
</ol>
<figcaption>Signals are collected independently of pipelines, evaluated against declared SLAs, and routed through lineage to the root cause.</figcaption>
</figure>

## Signals that matter

| Signal | How it is collected | What it catches |
|---|---|---|
| Data-through time | `max(event_time)` or a pipeline-written watermark | Jobs that succeed but load old data |
| Last commit time | Table history, information schema | Jobs that did not run at all |
| Row volume per load or partition | Commit metadata, cheap counts per partition | Partial loads, duplicate loads |
| Schema hash | Information schema | Unannounced column changes |
| Test results | Quality framework output | Nulls, duplicates, broken relationships |
| Run status and duration | Orchestrator events | Failures, slow runs heading towards a deadline |

Prefer **metadata** (commit logs, information schemas) over scanning data. When a count or `max()` is needed, restrict it to the latest partition so monitoring stays cheap.

## Evaluating SLAs

A simple evaluator in SQL: latest data-through time per dataset, compared with its maximum allowed staleness, with an "at risk" band at 80% of the limit. Here "now" is fixed at 09:30 UTC so the output is reproducible.

```sql
CREATE TABLE dataset_sla (dataset text PRIMARY KEY, tier int, max_staleness interval, owner text);
CREATE TABLE dataset_updates (dataset text, data_through timestamptz, committed_at timestamptz);

INSERT INTO dataset_sla VALUES
  ('gold.revenue_daily', 1, interval '26 hours', 'finance-data'),
  ('gold.orders_hourly', 1, interval '2 hours',  'commerce-data'),
  ('silver.web_events',  2, interval '30 minutes', 'platform'),
  ('gold.nps_weekly',    3, interval '8 days', 'cx-analytics');
INSERT INTO dataset_updates VALUES
  ('gold.revenue_daily', '2026-10-08 00:00+00', '2026-10-08 05:40+00'),
  ('gold.orders_hourly', '2026-10-08 06:00+00', '2026-10-08 06:20+00'),
  ('gold.orders_hourly', '2026-10-08 07:00+00', '2026-10-08 07:25+00'),
  ('silver.web_events',  '2026-10-08 09:04+00', '2026-10-08 09:06+00');

WITH latest AS (
  SELECT dataset, max(data_through) AS data_through FROM dataset_updates GROUP BY dataset
)
SELECT s.dataset, s.tier, s.owner,
       timestamptz '2026-10-08 09:30+00' - l.data_through AS staleness,
       s.max_staleness,
       CASE WHEN l.data_through IS NULL THEN 'NO DATA'
            WHEN timestamptz '2026-10-08 09:30+00' - l.data_through > s.max_staleness THEN 'BREACH'
            WHEN timestamptz '2026-10-08 09:30+00' - l.data_through > s.max_staleness * 0.8 THEN 'AT RISK'
            ELSE 'OK' END AS status
FROM dataset_sla s LEFT JOIN latest l USING (dataset)
ORDER BY s.tier, s.dataset;
```

```text
      dataset       | tier |     owner     | staleness | max_staleness | status
--------------------+------+---------------+-----------+---------------+---------
 gold.orders_hourly |    1 | commerce-data | 02:30:00  | 02:00:00      | BREACH
 gold.revenue_daily |    1 | finance-data  | 09:30:00  | 26:00:00      | OK
 silver.web_events  |    2 | platform      | 00:26:00  | 00:30:00      | AT RISK
 gold.nps_weekly    |    3 | cx-analytics  |           | 8 days        | NO DATA
```

Notes:

- Staleness is measured from **data-through** time (what the data covers), not from the commit. `gold.orders_hourly` last committed at 07:25 but only covers up to 07:00; at 09:30 that is 2.5 hours stale, a breach.
- The `LEFT JOIN` keeps datasets with **no updates at all**. An inner join would silently drop the most broken dataset (`gold.nps_weekly`) from the report.
- "At risk" gives owners a chance to act before the breach. For deadline-style SLAs ("ready by 07:00"), also predict lateness from upstream status and typical run duration.
- Daily tables with a 26-hour limit allow for normal run time; agree limits with consumers rather than guessing.

## Lineage-aware alerting

When a source extract is three hours late, every table built from it breaches. Without grouping, dozens of owners are paged for one problem. Instead:

1. For each breached asset, walk lineage **upstream**.
2. If an upstream asset is also breached (or its pipeline failed), mark this asset **impacted**, not root.
3. Page only the owners of **root** breaches; notify downstream owners and consumers with "impacted by X, owned by Y".
4. Include in the alert: the SLI value, the deadline, the upstream status, recent run logs, and the list of affected dashboards and models.

Lineage quality decides how well this works, so lineage collection (from transformation code, from orchestrator events using an open lineage standard, or from query logs) is part of the design, and gaps are treated as monitoring bugs.

## Collecting independently of pipelines

If monitoring only listens for "job finished" events, it cannot notice a job that **never started** (scheduler down, DAG paused, upstream sensor stuck). Collectors therefore poll warehouse metadata and table commit histories on their own schedule, and the evaluator treats "no new data by the deadline" as a breach regardless of orchestrator state. Monitor the collectors themselves with a heartbeat, and run the monitoring system on infrastructure separate from the pipelines it watches.

## Volume and quality anomalies

- Fixed rules where the business defines them ("revenue rows per day must be at least 1,000").
- Baselines for the rest: compare each load's volume with the same weekday over recent weeks, with a tolerance band; suppress during known events (holidays, migrations).
- Schema drift: alert when a schema hash changes without a matching contract change.
- Test failures from the quality framework feed the same evaluator, so "fresh but failing tests" is not reported as healthy.

## Late data and SLA semantics

Define whether freshness means "the latest partition exists" or "the latest partition is complete". For data with late arrivals, publish both: data-through time and an expected completeness (for example "yesterday is 98% complete by 06:00 and final by day +3"). Consumers with strict needs read the "final" signal.

## Security

The monitoring store holds metadata, not data, but row counts and table names can still be sensitive (for example HR tables). Apply the catalog's access rules to status pages; collectors use a read-only metadata role, not broad data access.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Orchestrator down | No job events | Independent metadata collectors still detect missing data |
| Lineage incomplete | Root-cause grouping wrong, alert storm | Fall back to grouping by source and time window; fix lineage gaps |
| Noisy anomaly detection | Owners ignore alerts | Tier-based paging, tuned baselines, suppression windows, alert reviews |
| Monitoring store down | Blind spot | Heartbeat alerting from a separate system; replicate the store |
| Wrong SLA definitions | False breaches or false comfort | Review SLAs with consumers; track breaches nobody acted on |

## Monitoring the monitor and reporting

- Collector heartbeats and signal lag.
- Alert counts per team per week, acknowledgement time, and share of alerts that led to action (alert precision).
- Monthly SLA attainment per dataset and team: the share of time (or of deadlines) the SLO was met.
- Error budgets: when a tier-1 dataset burns its monthly budget, the owning team prioritises reliability fixes (retries, earlier schedules, better upstream contracts) before new features.

## Cost

Use metadata wherever possible; limit data scans to the newest partition; evaluate tier-3 datasets less often; store signals compactly (one row per dataset per check). The monitoring workload should be a rounding error in warehouse cost; if it is not, it is scanning too much.

## Scaling to 10×

At 50,000 tables and 8,000 pipelines: generate default SLAs from usage (any table behind a heavily used dashboard gets a freshness check automatically), push collection to event-driven sources (commit notifications) rather than polling, shard evaluation by domain, and federate ownership so each domain manages its SLAs within central standards.

## Capacity estimate

Assumptions: 5,000 monitored tables, checks every 5 minutes for tiers 1 and 2 (300 tables) and hourly for the rest; about 6 signals per check; 100 bytes per signal row.

- **Checks**: 300 × 288 per day + 4,700 × 24 per day ≈ 86,400 + 112,800 ≈ 200,000 checks a day.
- **Signal rows**: 200,000 × 6 = 1.2 million rows a day ≈ 120 MB/day, about 44 GB a year: tiny.
- **Warehouse load**: if 10% of checks need a data scan of the latest partition at about 50 MB each, that is 20,000 × 50 MB = 1 TB scanned a day. That is the line item to optimise with metadata-only checks.
- **Lineage traversal**: 20,000 edges fit in memory; walking upstream from each breach takes milliseconds.
- **Alert volume target**: with 60 tier-1 datasets and good grouping, a handful of pages a week; more than that suggests either real reliability problems or noisy rules.

## What a strong answer includes

- Clear SLI, SLO, SLA and error budget definitions applied to datasets.
- Freshness measured from data coverage, plus volume, schema and test signals.
- Collection that is independent of pipeline success events, and a heartbeat on the monitor itself.
- Lineage-aware grouping so only root causes page, with impact lists for consumers.
- Tiers, owners and SLAs as code, with status shown where consumers look (catalog, BI badges).
- Attainment reporting and error budgets that drive prioritisation.

## Common mistakes

- Treating "the job succeeded" as "the data is fresh".
- Paging every downstream owner for one upstream failure.
- Monitoring only via the orchestrator, so a stopped scheduler goes unnoticed.
- Inner joins in status queries that hide datasets with no data.
- One threshold for all tables, producing alert fatigue.
- Scanning full tables every few minutes to check freshness.

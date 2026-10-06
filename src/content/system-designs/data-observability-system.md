---
title: "Design a Data Observability System"
description: "A system-design case study for data observability: collecting metadata, freshness and volume monitors, seasonal anomaly detection, lineage-based root cause and incidents."
technology: ["data-engineering", "etl-elt", "airflow"]
topic: ["data-observability", "monitoring", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "A data platform runs 3,000 tables across a warehouse and a lakehouse, fed by Airflow, dbt, Spark and streaming jobs. Problems are usually found by business users hours later. Design a data observability system that monitors pipelines and data automatically, detects freshness, volume, schema and distribution anomalies, finds the likely root cause through lineage, and drives incidents to resolution against defined SLAs."
functionalRequirements:
  - "Collect pipeline run metadata from Airflow, dbt, Spark and streaming jobs"
  - "Collect table metadata (row counts, last update, schema, column profiles) from the warehouse and lakehouse"
  - "Monitor freshness, volume, schema changes and column distributions with automatic baselines"
  - "Build end-to-end lineage from sources to dashboards and use it for impact and root-cause analysis"
  - "Raise, group and route incidents to owners; track them to resolution"
  - "Define and report data SLOs per critical data product"
nonFunctionalRequirements:
  - "Detect a stale or empty critical table within 15 minutes of its expected update"
  - "Monitoring adds negligible load to production compute (metadata first, scans sampled)"
  - "Alert precision high enough that owners trust and act on alerts"
  - "Observability keeps working when pipelines fail (it must not share their failure modes)"
  - "Metadata retained for at least 13 months for trends and seasonality"
scaleAssumptions:
  - "Assumption: 3,000 tables, 400 critical; 1,500 pipelines; 20,000 task runs a day"
  - "Assumption: warehouse query history of about 2 million queries a day"
  - "Assumption: 40 owning teams and 600 dashboards"
  - "Assumption: profiles of up to 50 columns for each critical table"
architectureSummary: "Collectors pull metadata from warehouse system views (information schema, query and load history), lakehouse table logs, and orchestrator APIs, while jobs emit OpenLineage run events. A metadata store keeps time series of table metrics, schemas, run outcomes and a lineage graph. A monitor engine evaluates rules and seasonal anomaly models on those series; an incident service groups related alerts using lineage, routes them to owners, and tracks SLOs. The system runs on separate infrastructure from the pipelines it watches."
technologies:
  - "OpenLineage integrations for Airflow, Spark and dbt, with a lineage backend (Marquez or a catalog)"
  - "Warehouse system views (information schema, query history) and Delta/Iceberg table metadata"
  - "Metrics time-series store (warehouse tables or Prometheus for pipeline metrics)"
  - "Monitor engine with seasonal baselines (scheduled SQL or Python)"
  - "Incident routing via Slack and PagerDuty; catalog for ownership"
  - "Alternatively a commercial data observability product"
tradeoffs:
  - decision: "Metadata-first monitoring"
    alternative: "Scan every table on a schedule"
    reason: "Freshness, volume and schema come almost free from system views and table logs"
    consequence: "Distribution checks still need sampled scans for critical tables"
  - decision: "Learned seasonal baselines"
    alternative: "Hand-set static thresholds"
    reason: "Scales to thousands of tables and handles weekly and daily cycles"
    consequence: "Needs history before it is useful and can learn a slow degradation as normal"
  - decision: "OpenLineage events emitted by jobs"
    alternative: "Lineage parsed only from SQL logs"
    reason: "Covers Spark, Python and streaming jobs, with run-level facets, not just SQL"
    consequence: "Every orchestrator and engine needs the integration installed and maintained"
  - decision: "Group alerts into incidents by lineage"
    alternative: "One alert per failing monitor"
    reason: "One upstream failure that makes 40 tables stale becomes one incident with a root cause"
    consequence: "Requires an accurate lineage graph and grouping logic"
  - decision: "Build on open components"
    alternative: "Buy a commercial observability tool"
    reason: "Full control and no per-table pricing"
    consequence: "More engineering; buying is often faster for teams without platform capacity"
interviewFollowUps:
  - "What is the difference between data quality checks and data observability?"
  - "How do you detect that a table is late if it has no fixed schedule?"
  - "How do you stop Monday-morning volume alerts caused by weekend traffic?"
  - "Forty tables went stale at once. How does your system find the cause?"
  - "How do you define an SLO for a dataset, and what do you do when the error budget runs out?"
  - "How do you keep the observability system from failing at the same time as the pipelines?"
related:
  - "articles:etl-elt/pipeline-observability"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "articles:etl-elt/pipeline-reliability-and-retries"
  - "system-designs:data-quality-framework"
  - "articles:airflow/dags-scheduling-retries"
previous: "system-designs:data-quality-framework"
versionContext: "The volume-anomaly SQL was run on PostgreSQL 16 against generated sample metadata. Collector and integration configuration is described, not executed."
sources:
  - { label: "OpenLineage: object model", url: "https://openlineage.io/docs/spec/object-model/" }
  - { label: "OpenLineage: facets and extensibility", url: "https://openlineage.io/docs/spec/facets/" }
  - { label: "OpenLineage specification on GitHub", url: "https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md" }
  - { label: "Apache Airflow: logging and monitoring", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/index.html" }
  - { label: "PostgreSQL documentation: aggregate functions", url: "https://www.postgresql.org/docs/current/functions-aggregate.html" }
---

## Approach

Data quality checks test what you expected to go wrong. **Observability** watches the system broadly enough to catch what you did not expect, and helps you find why. A strong answer covers what signals to collect, how to detect anomalies without drowning in alerts, how lineage turns many alerts into one cause, and how incidents and SLOs make it operational. Ask:

- **What is the stack?** Warehouse, lakehouse, orchestrators, streaming, BI tools.
- **What is breaking today, and how is it found?** Usually users notice first.
- **Which data products are critical**, and what freshness and correctness do their users need?
- **Ownership**: is there a catalog with owners?
- **Build or buy**: is a commercial tool acceptable?
- **Constraints**: can monitoring read production data, or only metadata?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Collectors</strong>: scheduled readers of warehouse system views (table sizes, last-altered times, query and load history, schemas) and lakehouse table logs; orchestrator APIs for run states and durations.</li>
<li><strong>Lineage events</strong>: Airflow, Spark and dbt emit OpenLineage START/COMPLETE/FAIL events with input and output datasets and facets.</li>
<li><strong>Metadata store</strong>: time series of table metrics, schema versions, run outcomes, column profiles, and a lineage graph of jobs and datasets.</li>
<li><strong>Monitor engine</strong>: rules (SLA deadlines, schema changes) and learned baselines (volume, freshness interval, distributions) evaluated every few minutes.</li>
<li><strong>Incident service</strong>: groups related anomalies through lineage, identifies the most upstream failure, routes to the owner, tracks acknowledgement and resolution.</li>
<li><strong>Surfaces</strong>: catalog badges, SLO dashboards, impact lists of affected dashboards, weekly reliability reports.</li>
</ol>
<figcaption>Collect metadata cheaply, detect anomalies against learned baselines, and use lineage to turn symptoms into one root cause.</figcaption>
</figure>

At 05:40 the monitor engine sees that  normally updates by 05:15 on weekdays and has not updated. It also sees that 38 downstream tables and 12 dashboards depend on it. Lineage shows the job writing  succeeded, but its input  stopped receiving data at 01:10, and the CDC connector run reported a failure. The incident service opens one incident, "bronze.orders_cdc ingestion stopped", assigns it to the ingestion team, links the 38 stale tables as impact, and posts a notice to the owners of the affected dashboards. When the connector recovers and  refreshes, the incident auto-resolves and its duration counts against the orders SLO.

## Signals to collect

| Signal | Source | Cost |
|---|---|---|
| Freshness (last update time) | Information schema, table commit logs | Almost free |
| Volume (rows added, table size) | Load history, commit metrics, row-count deltas | Almost free |
| Schema (columns, types) | Information schema snapshots, schema registry | Almost free |
| Pipeline runs (state, duration, retries) | Orchestrator APIs, OpenLineage events | Almost free |
| Lineage | OpenLineage events, SQL parsing of query history | Low |
| Column distributions (null rate, distinct count, min/max, mean) | Sampled or incremental profiling queries | Moderate; critical tables only |
| Usage (who queries what) | Query history, BI tool logs | Low |

Start with the cheap signals on every table, then add profiling where the impact justifies the compute.

## Lineage with OpenLineage

OpenLineage models **jobs**, **runs** and **datasets**: each run emits events with its inputs and outputs, plus facets (schema, row counts, SQL, data-quality assertions, error messages). Integrations exist for Airflow, Spark and dbt, so most lineage comes from instrumenting the tools rather than parsing code. Use a lineage backend (Marquez, the reference implementation, or a catalog that accepts OpenLineage) to build the graph. Supplement with SQL-parsed lineage from warehouse query history for ad-hoc and BI queries, and BI-tool metadata for dashboard-to-table edges.

Lineage drives three things: **impact** (what breaks downstream), **root cause** (the most upstream anomaly) and **ownership routing**.

## Anomaly detection without alert fatigue

Static thresholds do not scale to 3,000 tables. Learn baselines per table from history, and account for seasonality. The example below (PostgreSQL 16) compares today's row count with the median of the same weekday over the previous four weeks, so normal weekend dips do not alert on Mondays.

```sql
CREATE TABLE table_stats (
  table_name TEXT,
  load_date  DATE,
  row_count  BIGINT
);
INSERT INTO table_stats
SELECT 'silver.orders', d::date,
       CASE WHEN extract(isodow FROM d) IN (6, 7) THEN 60000 ELSE 100000 END
         + (extract(day FROM d)::int % 5) * 1000
FROM generate_series('2026-09-01'::date, '2026-10-04'::date, '1 day') AS d;
INSERT INTO table_stats VALUES ('silver.orders', '2026-10-05', 41000);  -- a Monday

WITH today AS (
  SELECT table_name, load_date, row_count FROM table_stats WHERE load_date = '2026-10-05'
), baseline AS (
  SELECT s.table_name,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY s.row_count) AS median_same_weekday
  FROM table_stats s JOIN today t ON s.table_name = t.table_name
  WHERE s.load_date >= t.load_date - 28
    AND s.load_date <  t.load_date
    AND extract(isodow FROM s.load_date) = extract(isodow FROM t.load_date)
  GROUP BY s.table_name
)
SELECT t.table_name, t.row_count, b.median_same_weekday,
       round((t.row_count / b.median_same_weekday)::numeric, 2) AS ratio,
       t.row_count < 0.7 * b.median_same_weekday AS volume_anomaly
FROM today t JOIN baseline b USING (table_name);
```

```text
  table_name   | row_count | median_same_weekday | ratio | volume_anomaly
---------------+-----------+---------------------+-------+----------------
 silver.orders |     41000 |              102500 |  0.40 | t
```

Monday's 41,000 rows is 40% of a normal Monday, a real anomaly. Compared with a simple 7-day average (pulled down by the weekend), the drop would look smaller and could be missed, while normal Mondays compared with Sunday would raise false alarms.

Further techniques:

- **Freshness**: learn the typical update interval and time of day per table; alert when the gap exceeds a high percentile of past gaps, or when an explicit SLA deadline passes.
- **Distributions**: track null rate, distinct count and category shares per column; alert on large shifts relative to the series' own variability.
- **Schema**: any removed column or type change on a critical table is an alert; additions are informational.
- **Feedback**: owners mark alerts as useful or noise; noisy monitors get wider bands or are disabled, and the alert precision metric is reported.
- **Guard against learned degradation**: a slow decline becomes the new normal for a learned model, so keep explicit SLAs and absolute bounds for critical tables.

## Incidents and SLOs

- **Grouping**: anomalies within a time window that share an upstream ancestor become one incident, rooted at the most upstream anomaly.
- **Routing**: to the owner of the root dataset or job, with downstream owners notified.
- **Severity**: from the impact set (number of critical products and dashboards affected).
- **SLOs**: for each critical data product define indicators such as "fresh by 06:00 on 99% of days" and "no blocking quality failures published". Track the error budget; when it runs out, the owning team prioritises reliability work over new features.
- **Postmortems** for major incidents, feeding new monitors and contracts.

## Data model

- `table_metrics(table_id, ts, row_count, bytes, last_modified, rows_inserted)`
- `schema_versions(table_id, captured_at, columns_json, hash)`
- `column_profiles(table_id, column, ts, null_rate, distinct_count, min, max, mean)`
- `runs(job_id, run_id, state, start_ts, end_ts, inputs, outputs, error)`
- `lineage_edges(from_node, to_node, edge_type, last_seen)`
- `anomalies` and `incidents` with status, owner, root node and impact list.

## Independence from what it monitors

The observability system must keep working when pipelines fail: run collectors on separate compute, store metadata outside the warehouse being monitored (or in a separate account), and have a "dead man's switch": if collectors stop reporting, that itself alerts. Pull-based checks (is the table fresh?) catch failures that push-based events (job reported failure) miss, such as a job that never started.

## Security

Profiles and failing samples can expose sensitive values. Profile only aggregate statistics for personal-data columns, never store raw values, and give the observability service read access to metadata and samples through a restricted role.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Collector stops | Blind spot | Heartbeat monitor on the collectors themselves |
| Lineage incomplete | Wrong root cause or missed impact | Coverage metric (share of runs emitting lineage); add integrations |
| Baseline learns a broken state | Real problem not alerted | Absolute SLAs and bounds on critical tables |
| Alert storm from one cause | Owners ignore alerts | Lineage-based grouping, deduplication, rate limits |
| New table with no history | No baseline | Default rules (freshness SLA from owner) until enough history |

## Scaling to 10×

At 30,000 tables, collect metadata in bulk (one system-view query per schema, not per table), evaluate monitors in batches with vectorised SQL over the metrics store, and profile only critical tables and changed partitions. Partition metadata tables by date. Lineage graphs grow large; store them in a graph-friendly form and cache impact sets for critical nodes.

## Monitoring and SLAs

The observability system has its own health metrics: collector lag, monitor evaluation latency, share of critical tables covered, alert precision, mean time to detect and to resolve incidents, and the share of incidents first reported by users (the key metric to reduce).

## Capacity estimate

- **Table metrics**: 3,000 tables × one sample every 15 minutes = 288,000 rows/day, about 100 million rows over 13 months; narrow rows, so a few GB.
- **Column profiles**: 400 critical tables × 50 columns × daily ≈ 20,000 rows/day.
- **Runs and lineage events**: 20,000 task runs/day × 2–3 events ≈ 60,000 events/day, each a few KB ≈ 200 MB/day.
- **Query history**: 2 million queries/day is the largest input; parse lineage incrementally and keep only edges and usage counts, not full query text, after a short retention.
- **Monitor evaluation**: 3,000 tables × 4 monitor types every 15 minutes ≈ 1.2 million evaluations/day, cheap as set-based SQL over the metrics store.

## What a strong answer includes

- A clear distinction between **quality checks and observability**.
- **Metadata-first collection** and selective profiling.
- **Seasonal baselines** plus explicit SLAs, with a feedback loop for alert precision.
- **Lineage** (OpenLineage) used for impact, root cause and routing.
- **Incident grouping**, ownership and **SLOs with error budgets**.
- **Independence** of the observability system from the pipelines it monitors.

## Common mistakes

- Treating observability as a dashboard of job successes; a job can succeed and write nothing.
- Static thresholds copied across thousands of tables.
- One alert per symptom, so one upstream failure pages ten teams.
- Profiling every column of every table and doubling warehouse cost.
- Running observability inside the same scheduler that fails.
- No owners, so alerts go to a shared channel that nobody reads.

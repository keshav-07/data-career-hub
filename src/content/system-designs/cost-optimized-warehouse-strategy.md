---
title: "Design a Cost-Optimised Warehouse Strategy"
description: "Warehouse cost optimisation system design: reading the bill, workload isolation, right-sizing, pricing models, query and storage tuning, and FinOps."
technology: ["data-engineering", "snowflake", "data-warehousing"]
topic: ["cost-optimisation", "finops", "warehouse"]
difficulty: "Advanced"
publishedDate: "2026-10-08"
updatedDate: "2026-10-08"
reviewedDate: "2026-10-08"
problem: "A company's cloud warehouse bill has tripled in a year to well over the budget, while data volume only doubled. Nobody can say which teams, pipelines or dashboards drive the spend. Design a strategy that makes cost visible and attributable, cuts waste without hurting SLAs, chooses the right pricing model, and keeps cost growing slower than usage from now on."
functionalRequirements:
  - "Attribute compute and storage cost to teams, pipelines, dashboards and individual queries"
  - "Isolate workloads (ingestion, transformation, BI, ad-hoc, data science) on separately sized compute"
  - "Detect and fix waste: idle compute, oversized warehouses, full rebuilds, unpruned scans, unused tables"
  - "Choose and revisit the pricing model (on-demand versus committed capacity)"
  - "Enforce budgets, quotas and alerts per team"
  - "Report unit costs (per dashboard view, per pipeline run, per TB processed) over time"
nonFunctionalRequirements:
  - "No missed data SLAs or dashboard latency targets because of cost changes"
  - "Cost visibility daily, with anomaly alerts within a day"
  - "Changes reversible and measured (before and after)"
  - "Guardrails that stop runaway queries automatically"
  - "Ownership: every cost line has a responsible team"
scaleAssumptions:
  - "Assumption: 400 TB stored, 2,000 users, 1,500 scheduled pipelines"
  - "Assumption: compute is about 80% of the bill, storage about 15%, the rest services and transfer"
  - "Assumption: 12 shared virtual warehouses (or equivalent) today, mostly always-on"
  - "Assumption: 40 teams and 600 dashboards"
architectureSummary: "A cost data model joins the provider's metering and billing data with query history, tags and ownership from the catalog, allocating each compute hour to teams, pipelines and dashboards. Workloads move to dedicated, right-sized compute with aggressive auto-suspend and scale-out only for concurrency. A tuning loop targets the most expensive queries and models (incremental builds, pruning, clustering, materialisation) and the largest storage (retention, lifecycle, unused tables). Budgets, quotas and resource monitors enforce limits; a monthly FinOps review with owners tracks unit costs."
technologies:
  - "Warehouse account usage and billing views (Snowflake ACCOUNT_USAGE, BigQuery INFORMATION_SCHEMA jobs, Redshift system tables)"
  - "Query tags and labels set by dbt, Airflow and BI service accounts"
  - "dbt for incremental models and cost-aware materialisation"
  - "Resource monitors, budgets, quotas and reservations"
  - "Catalog for ownership and usage"
  - "Lakehouse storage for cold or bulk data where cheaper engines fit"
tradeoffs:
  - decision: "Separate compute per workload"
    alternative: "A few large shared warehouses"
    reason: "Right-size each workload, suspend independently, and attribute cost cleanly"
    consequence: "More objects to manage; small warehouses must still meet SLAs"
  - decision: "Allocate shared compute by execution-time share"
    alternative: "Only report cost per warehouse"
    reason: "Teams see their own spend even on shared compute, which changes behaviour"
    consequence: "Allocation is an approximation; idle time is spread proportionally"
  - decision: "Committed capacity for steady base load, on-demand for spikes"
    alternative: "All on-demand, or all reserved"
    reason: "Commitments are cheaper per unit for predictable load; on-demand avoids paying for idle capacity"
    consequence: "Requires forecasting and periodic review of utilisation"
  - decision: "Incremental models and pre-aggregation for the heaviest workloads"
    alternative: "Full rebuilds and live queries on raw facts"
    reason: "Most of the compute in many warehouses goes to rebuilding and rescanning unchanged data"
    consequence: "More complex pipelines with late-data handling"
  - decision: "Guardrails: timeouts, scan limits and budgets"
    alternative: "Trust users"
    reason: "One runaway query or forgotten warehouse can cost more than a month of savings"
    consequence: "Occasional legitimate jobs need exceptions"
interviewFollowUps:
  - "Where does the money actually go in a warehouse bill, and how do you find out?"
  - "Should a slow dashboard get a bigger warehouse or a multi-cluster warehouse?"
  - "When does BigQuery capacity pricing beat on-demand?"
  - "How do you cut cost by 30% without breaking any SLA?"
  - "How do you attribute the cost of a shared BI warehouse to teams?"
  - "What guardrails stop a single query from costing thousands?"
related:
  - "articles:snowflake/architecture-virtual-warehouses"
  - "articles:snowflake/micro-partitions-clustering-pruning"
  - "interview-questions:snowflake/virtual-warehouses"
  - "articles:sql/query-optimization-fundamentals"
  - "system-designs:reporting-analytics-platform"
  - "system-designs:elt-pipeline-with-dbt"
previous: "system-designs:multi-tenant-data-platform"
next: "system-designs:data-mesh-architecture"
versionContext: "The cost-allocation SQL was run on PostgreSQL 16 against sample metering and query-history tables. Prices quoted are list prices seen at the time of writing and change; warehouse settings are described, not executed."
sources:
  - { label: "Snowflake documentation: virtual warehouses", url: "https://docs.snowflake.com/en/user-guide/warehouses" }
  - { label: "Snowflake documentation: micro-partitions and clustering", url: "https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions" }
  - { label: "Snowflake documentation: dynamic tables target lag", url: "https://docs.snowflake.com/en/user-guide/dynamic-tables/target-lag" }
  - { label: "dbt documentation: microbatch incremental models", url: "https://docs.getdbt.com/docs/build/incremental-microbatch" }
  - { label: "Amazon S3 Tables (managed Iceberg tables)", url: "https://aws.amazon.com/s3/features/tables/" }
---

## Approach

Cost work fails when it starts with tactics ("set auto-suspend to 60 seconds") instead of **visibility and ownership**. You cannot cut what you cannot attribute, and savings do not last unless someone owns the number. The strategy has four parts: **see** (attribute cost), **fix** (remove waste), **choose** (pricing model and architecture), and **govern** (guardrails and a review loop). Ask:

- **Which platform and pricing model?** Snowflake credits, BigQuery on-demand or editions, Redshift provisioned or serverless, Databricks DBUs?
- **What is the split** between compute, storage, services and data transfer?
- **What are the SLAs** that must not regress?
- **Is cost shown back to teams today?** Are there tags?
- **What changed in the last year?** New teams, self-service BI, streaming loads, ML?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Collect</strong>: metering (credits or slot-hours per warehouse and hour), billing exports, query history with query tags, storage by table, and ownership from the catalog.</li>
<li><strong>Attribute</strong>: a cost model allocates each compute hour to queries, then to teams, pipelines and dashboards; storage to table owners.</li>
<li><strong>Isolate and right-size</strong>: separate compute per workload and tier, sized to SLA, with short auto-suspend and scale-out for concurrency only.</li>
<li><strong>Tune</strong>: the most expensive queries, models and tables are fixed first: incremental builds, pruning, clustering, pre-aggregation, retention changes.</li>
<li><strong>Guardrails</strong>: resource monitors, budgets, quotas, statement timeouts and scan limits; alerts on cost anomalies.</li>
<li><strong>Review</strong>: a monthly FinOps review with team owners on cost, unit costs and planned changes.</li>
</ol>
<figcaption>Make cost visible, remove waste where it concentrates, then keep it there with guardrails and ownership.</figcaption>
</figure>

The first week's cost model shows that 30% of compute is one transformation warehouse running a full rebuild of a 4-billion-row fact table every hour, 15% is a BI warehouse that never suspends because a dashboard auto-refreshes every minute overnight, and a data-science warehouse sized extra-large is idle 70% of the time. The team converts the fact table to an incremental model with a three-day lookback, changes the overnight refresh to hourly and lets the BI warehouse suspend, and splits data science into a small default warehouse plus a large one used on request. Two weeks later the cost model shows the reduction, and the SLA dashboard shows no regressions.

## Understanding the bill

- **Compute** is usually the largest line: Snowflake bills warehouses per second with a 60-second minimum each time a warehouse resumes; BigQuery bills either bytes scanned (on-demand) or slot capacity (editions); Redshift provisioned clusters bill per node-hour, Redshift Serverless per RPU-hour; Databricks per DBU.
- **Storage**: active data plus time-travel and fail-safe history in Snowflake, long-term storage discounts in BigQuery, snapshots and backups. Frequent updates and deletes on large tables inflate history storage.
- **Services and transfer**: cloud-services compute, cross-region replication and egress, serverless features (automatic clustering, materialised view maintenance, Snowpipe), which are easy to overlook.

## Attribution

Tag everything: dbt sets query tags per model, Airflow per DAG and task, BI tools run as service accounts per dashboard or team, and humans are mapped to teams from the identity provider. Then allocate metered compute to queries. The example below (PostgreSQL 16) allocates each warehouse-hour's credits to teams by their share of execution time in that hour:

```sql
-- metered credits per warehouse per hour (what the bill is based on)
CREATE TABLE warehouse_metering (
  warehouse TEXT, hour TIMESTAMP, credits NUMERIC(10,2)
);
INSERT INTO warehouse_metering VALUES
  ('BI_WH',        '2026-10-05 09:00', 4.00),
  ('BI_WH',        '2026-10-05 10:00', 4.00),
  ('TRANSFORM_WH', '2026-10-05 09:00', 8.00);

-- query history with a team tag set by each tool (dbt, BI service account, notebooks)
CREATE TABLE query_history (
  query_id TEXT, warehouse TEXT, hour TIMESTAMP, team TEXT, exec_seconds INT
);
INSERT INTO query_history VALUES
  ('q1', 'BI_WH',        '2026-10-05 09:00', 'finance',   600),
  ('q2', 'BI_WH',        '2026-10-05 09:00', 'marketing', 200),
  ('q3', 'BI_WH',        '2026-10-05 10:00', 'marketing', 100),
  ('q4', 'TRANSFORM_WH', '2026-10-05 09:00', 'finance',   900),
  ('q5', 'TRANSFORM_WH', '2026-10-05 09:00', 'platform',  300);

-- allocate each warehouse-hour's credits to teams by their share of execution time
SELECT q.team,
       round(sum(m.credits * q.exec_seconds::numeric / t.total_seconds), 2) AS credits
FROM query_history q
JOIN warehouse_metering m USING (warehouse, hour)
JOIN (SELECT warehouse, hour, sum(exec_seconds) AS total_seconds
      FROM query_history GROUP BY warehouse, hour) t USING (warehouse, hour)
GROUP BY q.team
ORDER BY credits DESC;
```

```text
   team    | credits
-----------+---------
 finance   |    9.00
 marketing |    5.00
 platform  |    2.00
```

All 16 metered credits are allocated, including idle time, which is spread in proportion to use. That is a fair default for shared warehouses: teams that keep a warehouse awake pay for it. Dedicated warehouses are attributed directly. Platform views give the raw inputs (Snowflake `ACCOUNT_USAGE` views for metering and query history, BigQuery `INFORMATION_SCHEMA.JOBS` with bytes and slot-milliseconds per job, Redshift system tables).

## Workload isolation and right-sizing

| Workload | Sizing principle | Suspend | Concurrency |
|---|---|---|---|
| Ingestion (Snowpipe, loads) | Small; serverless where available | Immediately | Low |
| Transformation (dbt, Spark SQL) | Size by runtime SLA; larger for big full refreshes only | After the run | Threads within one warehouse |
| BI | Medium; latency target per dashboard | Short idle timeout | Multi-cluster scale-out at peak |
| Ad-hoc analysts | Small default, larger on request | Short | Queue with timeouts |
| Data science | Small default plus a large on-demand option | Short | Per user or team |

Rules of thumb:

- **Scale up** (bigger warehouse) helps single large queries; **scale out** (multi-cluster, more slots) helps many concurrent queries. Using size to fix queueing doubles the cost of every query.
- In Snowflake, doubling warehouse size doubles the per-second rate; if a job then runs in half the time, cost is unchanged and latency halves. If it does not speed up (not enough parallel work, or bound by something else), cost doubles. Measure.
- **Auto-suspend**: Snowflake's default for new warehouses is much longer than most interactive workloads need. Because of the 60-second minimum per resume, very short suspend times can increase cost for workloads with frequent small queries; around one minute is a common starting point for BI, tuned with metering data.
- Remove **always-on keep-alives**: dashboards that refresh every minute overnight, monitoring queries that wake warehouses, and schedulers polling tables.

## Query and model tuning

Concentrate on the top 20 queries and models by cost, which usually account for most of the spend:

- **Incremental instead of full rebuilds** for large facts (dbt incremental or microbatch with a lookback for late data).
- **Pruning**: filter on the clustering or partition column; avoid functions on it in predicates; require partition filters on large BigQuery tables.
- **Select only needed columns**: in columnar engines, `SELECT *` reads every column, and in BigQuery on-demand you pay for it.
- **Clustering** on common filters for very large tables, but watch automatic-clustering cost on tables with heavy churn.
- **Pre-aggregate** for dashboards, and cache results; Snowflake's result cache and BigQuery's cached results make identical queries free or nearly so.
- **Avoid exploding joins and repeated heavy CTEs**; materialise intermediates reused by many models.
- **Right freshness**: an hourly model nobody looks at until 09:00 could be daily. For Snowflake dynamic tables, a longer target lag means fewer refreshes.

## Storage

- Shorten time-travel retention on large, frequently rewritten staging tables; use transient tables for rebuildable intermediates (no fail-safe).
- Drop unused tables (no reads in 90 days per access history) after notifying owners.
- Partition expiry for event tables beyond their analysis window.
- Move cold history to cheaper storage: long-term storage pricing applies automatically in some warehouses; elsewhere, unload to Parquet or Iceberg in object storage and query it with an external engine when needed.

## Choosing the pricing model

- **BigQuery**: on-demand charges per TiB scanned (list price $6.25 per TiB at the time of writing, with a free monthly allowance); editions charge per slot-hour with autoscaling and optional commitments. Steady, high scan volume favours capacity; spiky, low volume favours on-demand. Compare a month of actual slot usage (from job statistics) priced under editions with the same month's on-demand bill.
- **Snowflake**: capacity commitments lower the per-credit price; the main lever remains running fewer warehouse-seconds.
- **Redshift**: reserved nodes for steady provisioned clusters; Serverless for spiky workloads.
- Revisit quarterly: workloads change, and a commitment sized for last year's peak wastes money.

## Architecture-level options

- Push high-volume, low-value processing (raw log parsing, heavy ML feature engineering) to engines priced for batch throughput on open table formats, and keep the warehouse for curated, interactive workloads.
- Use materialised aggregates or a real-time OLAP store for very high-concurrency embedded analytics, where warehouse per-query cost is high.
- Share data instead of copying it between accounts or teams.

These are trade-offs, not automatic savings: a second engine adds operational cost and governance work.

## Guardrails

- **Resource monitors or budgets** per warehouse and team: notify at 75% and 90%, suspend non-critical warehouses at 100%.
- **Statement timeouts** per warehouse (for example 30 minutes for ad-hoc, longer for scheduled jobs).
- **Scan limits** (BigQuery maximum bytes billed per query) and custom quotas per user or project.
- **Anomaly alerts** on daily cost per team and warehouse against a rolling baseline.
- **Change review** for new warehouses and size increases, with an owner and an expiry for temporary upsizes.

## The FinOps loop

Monthly, each team reviews its cost, top queries, unit costs and planned changes. The platform team publishes a leaderboard of the biggest opportunities (idle time, full rebuilds, unused tables). Targets are unit costs, not absolute spend, because healthy growth should increase spend: cost per dashboard view, per pipeline run, per TB ingested.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Downsizing breaks an SLA | Late pipelines or slow dashboards | Change one workload at a time with before-and-after metrics; roll back |
| Aggressive auto-suspend | Higher cost from repeated resumes, cold caches | Tune with metering data per warehouse |
| Runaway query | Large unexpected bill | Timeouts, scan limits, monitors that suspend |
| Untagged workloads | Unattributed cost | Default tags by service account; report "unattributed" as its own team |
| Commitment too large | Paying for unused capacity | Quarterly utilisation review before renewal |

## Scaling to 10×

With 10× data and users, the waste patterns repeat at larger scale, so automation matters: automatic detection of idle warehouses and unused tables, policy-as-code for warehouse sizes, default incremental models in project templates, and cost checks in CI (for example flagging a pull request that changes a model from incremental to full refresh on a large table).

## Monitoring and SLAs

- Daily cost by team, warehouse and workload; unattributed share.
- Idle percentage per warehouse (metered time without queries).
- Top queries and models by cost, week over week.
- Unit costs and their trend.
- SLA dashboard alongside cost, to show that savings did not hurt users.

## Capacity estimate

Illustrative arithmetic for one Snowflake-style warehouse (state your own credit price in the interview):

- A medium warehouse consuming 4 credits per hour, always on: 4 × 24 × 30 = 2,880 credits/month.
- If BI usage is 07:00–19:00 on weekdays (about 260 hours/month) and the warehouse suspends otherwise: 4 × 260 ≈ 1,040 credits, about 64% less for the same daytime performance.
- An hourly full rebuild taking 20 minutes on an 8-credit/hour warehouse: 24 runs × 8 × (20/60) ≈ 64 credits/day ≈ 1,920/month. As an incremental model taking 2 minutes per run: 24 × 8 × (2/60) ≈ 6.4 credits/day ≈ 190/month, about 90% less, plus a weekly full refresh.
- BigQuery on-demand: a dashboard scanning 50 GB per load, opened 2,000 times a month, scans about 100 TB ≈ 91 TiB; at $6.25 per TiB that is roughly $570 a month for one dashboard. A 1 GB pre-aggregated table cuts that by about 50 times.

## What a strong answer includes

- **Attribution first**: tags, metering joined to query history, ownership.
- **Workload isolation and right-sizing**, with the scale-up versus scale-out distinction.
- **Auto-suspend tuned with data**, removing keep-alive traffic.
- **Tuning the top spenders**: incremental models, pruning, pre-aggregation, freshness choices.
- **Storage hygiene**: retention, transient tables, unused tables, cold tiers.
- **Pricing model choice** backed by actual usage data, revisited regularly.
- **Guardrails and a FinOps loop** with unit-cost targets and SLA checks.

## Common mistakes

- Cutting warehouse sizes across the board and breaking SLAs.
- Using bigger warehouses to fix concurrency queues.
- Measuring absolute spend only, so healthy growth looks like failure.
- No tags, so cost reviews become arguments.
- Buying commitments before removing waste.
- Forgetting serverless features, time travel and replication in the bill.
- One-off clean-ups with no guardrails, so cost creeps back within months.

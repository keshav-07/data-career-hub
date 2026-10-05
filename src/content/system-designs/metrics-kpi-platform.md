---
title: "Design a Metrics and KPI Platform"
description: "A system-design case study for a metrics platform: metric definitions as code, additivity, precomputed metric tables, versioning, finality, anomaly alerts and APIs."
technology: ["data-engineering", "data-warehousing", "dbt"]
topic: ["metrics", "semantic-layer", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "Leadership tracks about 80 company KPIs (revenue, active users, conversion, retention, delivery time) in dashboards, spreadsheets, board decks and product experiments, and the numbers rarely agree. Design a metrics platform where every KPI is defined once, computed consistently at any grain and dimension, versioned, monitored for anomalies, and served to every tool through one interface."
functionalRequirements:
  - "Define metrics as code: measure, aggregation, filters, time dimension, allowed dimensions, owner"
  - "Compute metrics at daily, weekly and monthly grain by approved dimensions (region, channel, product line)"
  - "Serve metrics to BI tools, notebooks, spreadsheets, the experimentation platform and applications through one API"
  - "Version definitions, show their history, and restate history when a definition changes"
  - "Alert metric owners on anomalies and on missing or late data"
  - "Show certification status, freshness and lineage for every metric"
nonFunctionalRequirements:
  - "The same metric, filter and period returns the same number in every tool"
  - "Metric queries for dashboards under 2 seconds at p95"
  - "Daily metrics final by 08:00 UTC; intraday metrics no more than 1 hour old"
  - "Every metric value traceable to its definition version and source tables"
  - "Adding a new metric takes a reviewed pull request, not a project"
scaleAssumptions:
  - "Assumption: 80 certified KPIs and 400 supporting metrics"
  - "Assumption: about 30 dimensions, each metric allowing 5 to 10 of them"
  - "Assumption: source facts of several billion rows in the warehouse"
  - "Assumption: 2,000 metric queries per minute at peak from dashboards and APIs"
architectureSummary: "Metric definitions live in a Git repository as semantic models and metric YAML (MetricFlow, Cube or LookML style). A semantic engine compiles metric requests into warehouse SQL over dbt-modelled facts. Frequently used metric and dimension combinations are materialised into metric tables on a schedule; a metric API and BI integrations route queries to them or to the base facts. A metadata service exposes definitions, versions, owners and freshness; an anomaly job checks every certified metric daily."
technologies:
  - "dbt for fact and dimension models"
  - "Semantic layer: dbt Semantic Layer with MetricFlow, Cube or LookML"
  - "Cloud warehouse: Snowflake, BigQuery or Redshift"
  - "Metric tables (materialised aggregates) and caching"
  - "Orchestrator (Airflow or dbt jobs) and a data catalog"
  - "Alerting (Slack, PagerDuty) for anomalies and freshness"
tradeoffs:
  - decision: "Define metrics in a semantic layer and compute at query time"
    alternative: "Precompute every metric into fixed tables"
    reason: "Any allowed slice and grain is available without building a table for each combination"
    consequence: "Needs a semantic engine and good warehouse performance; hot combinations still need materialisation"
  - decision: "Materialise hot metric and dimension combinations"
    alternative: "Always query base facts"
    reason: "Dashboards and APIs get fast, cheap answers for the 20% of slices that receive 80% of queries"
    consequence: "Materialisations must be refreshed in step with facts and checked against the semantic definition"
  - decision: "Store additive components, not ratios or distinct counts"
    alternative: "Store finished ratios and distinct counts per day"
    reason: "Components (numerators, denominators, sketches) can be rolled up correctly to any grain and dimension"
    consequence: "Every ratio and unique-count metric needs a defined component structure"
  - decision: "Versioned definitions with restatement"
    alternative: "Edit definitions in place"
    reason: "Users can see why a historical number changed, and decks can cite the definition version"
    consequence: "Restatements are recomputations that cost compute and need communication"
  - decision: "Explicit finality windows per metric"
    alternative: "Numbers silently change as late data arrives"
    reason: "Users know when yesterday's number stops moving"
    consequence: "Reports before finality are labelled provisional"
interviewFollowUps:
  - "Why can you not average daily conversion rates to get a weekly rate?"
  - "How do you compute weekly active users from daily data?"
  - "The definition of active user changes. What happens to last year's numbers in the board deck?"
  - "How do you make sure the experimentation platform and dashboards use the same metric?"
  - "How do you detect that a metric is wrong before an executive does?"
  - "How do you handle time zones for a global daily metric?"
related:
  - "system-designs:reporting-analytics-platform"
  - "articles:sql/aggregations-group-by-having"
  - "articles:data-warehousing/star-schema"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "interview-questions:data-engineering/data-quality-checks"
previous: "system-designs:feature-store"
versionContext: "The additivity example was run on PostgreSQL 16. Semantic-layer configuration is described, not executed."
sources:
  - { label: "dbt Labs: open-source MetricFlow announcement", url: "https://www.getdbt.com/blog/open-source-metricflow-governed-metrics" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "PostgreSQL documentation: aggregate functions", url: "https://www.postgresql.org/docs/current/functions-aggregate.html" }
  - { label: "Kimball Group: dimensional modelling techniques", url: "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/" }
---

## Approach

A metrics platform is a **contract system**. The difficult parts are not storage or compute but semantics: what exactly a metric means, how it may be aggregated, what happens when its definition changes, and when its value is final. Ask:

- **Who consumes metrics?** Dashboards, finance reporting, experimentation, product features, external reports?
- **Which metrics are hardest today?** Usually ratios, unique counts (active users) and anything with refunds or currency.
- **Grains and dimensions**: daily or hourly? Which dimensions must every metric support?
- **Freshness and finality**: how fresh, and when must numbers stop changing (month-end close)?
- **Ownership**: does each metric have a business owner who can approve changes?
- **Existing stack**: warehouse, dbt, BI tools, any semantic layer already in place?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Modelled facts</strong>: dbt builds tested fact and dimension tables (orders, sessions, subscriptions) with declared grain.</li>
<li><strong>Metric definitions</strong>: semantic models and metrics in YAML in Git, reviewed by the metric owner and the data team, validated in CI.</li>
<li><strong>Semantic engine</strong>: compiles a request (metric, dimensions, grain, filters, period) into warehouse SQL with correct joins and aggregation.</li>
<li><strong>Metric tables</strong>: scheduled materialisations of hot combinations, stored as additive components at daily grain.</li>
<li><strong>Serving</strong>: one metric API plus BI and spreadsheet integrations; queries route to metric tables when they cover the request, otherwise to base facts; results cached.</li>
<li><strong>Metadata and monitoring</strong>: definitions, versions, owners, lineage, freshness, certification; anomaly and completeness checks alert owners.</li>
</ol>
<figcaption>Definitions are code, computation is generated from them, and every tool asks the same engine.</figcaption>
</figure>

An analyst asks for `conversion_rate` by `region`, weekly, for the last quarter. The semantic engine knows `conversion_rate = orders / sessions`, both measured on their own facts, and that `region` is reachable from both. A metric table already holds daily `orders` and `sessions` by region, so it generates `SUM(orders) / SUM(sessions)` grouped by week and region over that table. A board deck pulling the same metric through the spreadsheet integration gets the same SQL and the same number. The experimentation platform calls the API with an experiment-arm dimension and gets the same definition applied to its assignment table.

## Metric definitions as code

Each metric has:

- **Name, description, owner, certification status**.
- **Type**: simple (sum of a measure), ratio (numerator and denominator metrics), derived (expression over metrics), cumulative (running or windowed, such as 28-day active users), conversion (event A followed by event B within a window).
- **Measure and aggregation**: `sum(order_amount)`, `count_distinct(user_id)`.
- **Filters**: `status = 'completed'`, `is_test_account = false`.
- **Time dimension**: which timestamp defines "when" (order date or payment date).
- **Allowed dimensions**: only those that make sense and are joinable without fan-out.
- **Finality window**: for example "final at D+3", "final after month-end close".
- **Version**: incremented on any semantic change.

CI checks that definitions compile, that allowed dimensions are reachable without many-to-many joins, and runs a comparison query against the previous version so reviewers see the numeric impact of a change.

## Additivity: the rule that breaks most metric platforms

Sums are additive: daily revenue can be summed to weekly. Ratios and distinct counts are not. Average daily conversion rates and you weight a small region's day the same as a large region's. The example below runs on PostgreSQL 16:

```sql
CREATE TABLE daily_conversion (
  day      DATE,
  region   TEXT,
  sessions INT,
  orders   INT
);
INSERT INTO daily_conversion VALUES
  ('2026-10-01', 'UK', 10000, 300),
  ('2026-10-01', 'DE',   500,  50),
  ('2026-10-02', 'UK', 12000, 360),
  ('2026-10-02', 'DE',   400,  44);

-- wrong: averaging pre-computed ratios
SELECT round(avg(orders::numeric / sessions), 4) AS avg_of_ratios
FROM daily_conversion;

-- right: ratio of summed components
SELECT round(sum(orders)::numeric / sum(sessions), 4) AS ratio_of_sums
FROM daily_conversion;
```

```text
 avg_of_ratios
---------------
        0.0675

 ratio_of_sums
---------------
        0.0307
```

The wrong method more than doubles the conversion rate because the small German rows (10% and 11%) count as much as the large UK rows (3%). So metric tables store **components**: numerators and denominators, sums and counts, never finished ratios or averages.

**Distinct counts** (active users) cannot be summed either: a user active on Monday and Tuesday is one weekly active user, not two. Options: compute weekly and monthly uniques from the base events for each needed grain, or store mergeable approximate sketches (HyperLogLog) per day and dimension, which can be combined to any period with a small, known error. Warehouses offer HLL functions for this; use exact counts where finance or contracts need them.

## Metric tables and query routing

The semantic engine could compute everything from base facts, but with thousands of dashboard queries a minute that is slow and expensive. Materialise:

- Daily grain, by the 5–10 most-used dimensions, for certified metrics.
- Components only (sums, counts, sketches), so the table can answer any coarser grain and any subset of its dimensions.
- Partitioned by date, refreshed incrementally for the recent window (to absorb late data) after the facts build.

Route a request to a metric table when the table's grain and dimensions cover it, otherwise fall back to facts. Test that the materialised and live paths return the same answer for a sample of requests each day.

## Versioning, restatement and finality

- **Version every definition**. A change (for example excluding refunds from revenue) creates version 2.
- **Restate history** under the new version by recomputing affected metric tables, and keep version 1 available for a transition period so people can reconcile old decks.
- **Show the version** in the API response and dashboards; board materials cite it.
- **Finality**: late data changes recent numbers. Publish per-metric finality ("orders final at D+3"), mark values before that as provisional, and freeze monthly values after the close with corrections handled as explicit adjustments.

## Time zones and calendars

Define the reporting time zone per metric (usually company headquarters or UTC) and offer local-day variants only where needed, because "daily active users" in UTC and in local time are different numbers. Fiscal calendars live in a `dim_date` with fiscal week, month and quarter so every tool uses the same calendar.

## Data quality and anomaly detection

- Upstream: freshness and volume checks on facts; tests on keys and accepted values.
- Metric level: completeness (all regions present for yesterday), reconciliation against systems of record (revenue against the ledger), and day-over-day and seasonal anomaly checks (compare with the same weekday over recent weeks, or a simple forecast with prediction intervals).
- Route alerts to the **metric owner**, not just the data team, with lineage to the upstream tables that changed.

## Security

Some metrics are sensitive before publication (revenue before earnings). Control access per metric and dimension, apply row-level rules (regional managers), and log API access. Approved external figures come from frozen, versioned snapshots.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Facts late | Yesterday's metrics incomplete | Completeness check holds publication; dashboards show provisional status |
| Definition bug merged | Wrong certified numbers | CI comparison should catch it; revert in Git and restate |
| Metric table drift from live definition | Tools disagree | Daily parity test between materialised and live results |
| Fan-out join through a bad dimension | Inflated metrics | Semantic layer forbids non-unique join paths; tests on dimension key uniqueness |
| Warehouse overloaded | Slow dashboards | Routing to metric tables, caching, query timeouts |

## Scaling to 10×

With 800 certified metrics and 20,000 queries per minute: more aggressive materialisation driven by query logs (build the tables the traffic needs), a result cache in front of the API, and domain ownership of metric definitions under platform-wide CI rules. Restatement jobs must be incremental and scheduled off-peak.

## Monitoring and SLAs

- Metric freshness and finality status per metric.
- Query latency p95 by route (metric table, base facts, cache).
- Parity test results and anomaly alerts.
- Definition changes per week and restatements performed.
- Usage per metric to retire unused ones.

## Capacity estimate

- **Metric table size**: 480 metrics × 3 components on average × 365 days × an average of 2,000 dimension combinations per day ≈ 1 billion rows a year. That sounds large, but the rows are narrow; at roughly 30 bytes compressed per row it is about 30 GB a year, and each dashboard query reads a small slice.
- **Query load**: 2,000 queries/minute ≈ 33 queries/s. With most hitting cached results or small metric tables at tens of milliseconds each, one or two warehouse clusters (or a moderate slot reservation) handle it.
- **Daily refresh**: recomputing the last 3 days of components for all metrics scans only recent fact partitions, typically minutes of warehouse time.
- **Restatement**: recomputing two years of one metric touches about 730 daily partitions; run it as a backfill in parallel chunks.

## What a strong answer includes

- **Metrics as code** with owners, versions, filters, time dimension and allowed dimensions.
- **Additivity rules**: components for ratios, sketches or base recomputation for distinct counts.
- **One serving path** for every tool, including experimentation.
- **Materialised metric tables** with routing and parity tests.
- **Versioning, restatement and finality** made visible to users.
- **Anomaly detection** routed to metric owners.

## Common mistakes

- Storing finished ratios or averages and rolling them up.
- Summing daily active users to get monthly active users.
- Letting each tool keep its own copy of metric logic.
- Changing a definition in place with no version or restatement plan.
- Allowing dimensions that fan out joins and inflate sums.
- Ignoring time zones, so the same "daily" metric differs between teams.
- Alerting only on pipeline failures, not on numbers that are wrong but loaded on time.

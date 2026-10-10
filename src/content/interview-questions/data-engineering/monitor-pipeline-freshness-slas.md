---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you monitor pipeline freshness and data SLAs?"
seoTitle: "Monitoring Data Freshness and SLAs: Interview Answer"
description: "Data freshness and SLA monitoring, interview answer: measure table age, agree SLOs with consumers and alert on breaches with lineage context."
technology: ["data-engineering", "airflow"]
topic: ["observability", "sla", "freshness"]
difficulty: "Medium"
questionType: ["scenario", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I measure freshness per table, not per job: the age of the newest data (max event or load timestamp) or of the last successful publish recorded in a run audit table, compared with a target agreed with the consumers, for example 'yesterday complete by 06:00 UTC on 95% of days'. A scheduled check, independent of the pipeline itself so it still fires when the scheduler is down, evaluates every critical table and alerts the owner with the table, expected and actual age, and the upstream status from lineage. I also track SLO attainment over time and keep task-failure alerts, but freshness is the alert that catches failed, stuck, skipped and silently empty runs with one rule."
followUps: ["Why should the freshness check not run inside the same DAG it monitors?", "What is the difference between an SLA, an SLO and an SLI?", "How do you avoid twenty alerts when one upstream source is late?", "How do you show consumers that data is late before they notice?"]
related: ["articles:etl-elt/pipeline-observability", "system-designs:data-sla-freshness-monitoring-system", "interview-questions:data-engineering/data-quality-checks", "interview-questions:data-engineering/investigate-slow-pipeline"]
sources:
  - { label: "Google SRE book: Service Level Objectives", url: "https://sre.google/sre-book/service-level-objectives/" }
  - { label: "dbt documentation: Source freshness", url: "https://docs.getdbt.com/docs/deploy/source-freshness" }
versionContext: "SQL verified on PostgreSQL 16.14"
---

## Detailed explanation

### What to measure

- **Data freshness**: `now() - max(event_time)` or `now() - max(loaded_at)` in the table. It catches runs that "succeeded" but loaded nothing.
- **Publish freshness**: time since the last **successful** publish in a run audit table. It is cheap and works for any table.
- Not the scheduler's "last run" time: a run that failed, or succeeded with zero rows, should not reset the clock.

### What to compare it with

An expectation agreed with the people who use the table:

- **SLI**: the measurement, for example "minutes after midnight UTC when yesterday's partition was published".
- **SLO**: the internal target, "by 06:00 on 95% of days over 30 days".
- **SLA**: the external commitment with consequences, looser than the SLO, "finance can rely on it by 08:00".

Tables differ: a finance mart may be "daily by 06:00", a clickstream table "no older than 15 minutes".

### How to check

A small, independent monitor evaluates every critical table on its own schedule, stores each result, and alerts on breaches. Running it **outside** the pipeline it watches matters: if the scheduler or the DAG is broken, a check inside it never runs. Many teams use dbt `source freshness`, the orchestrator's deadline features, or an observability tool for this; the logic is the same.

## Example

```sql
CREATE TABLE freshness_targets (table_name text PRIMARY KEY, max_age interval NOT NULL, owner text NOT NULL);
CREATE TABLE table_publishes (table_name text, published_at timestamptz, rows_written bigint);

INSERT INTO freshness_targets VALUES
  ('marts.fct_orders',  interval '26 hours',  'orders-team'),
  ('marts.clickstream', interval '15 minutes', 'web-team'),
  ('marts.dim_product', interval '26 hours',  'catalog-team');
INSERT INTO table_publishes VALUES
  ('marts.fct_orders',  '2026-10-10 05:40+00', 1040),
  ('marts.clickstream', '2026-10-10 08:20+00', 5200),
  ('marts.clickstream', '2026-10-10 08:55+00', 0),       -- "succeeded" with zero rows
  ('marts.dim_product', '2026-10-08 05:50+00', 310);

WITH last_good AS (
    SELECT table_name, max(published_at) AS last_success
    FROM table_publishes WHERE rows_written > 0
    GROUP BY table_name
)
SELECT t.table_name, t.owner,
       timestamptz '2026-10-10 09:00+00' - l.last_success AS age,
       t.max_age,
       CASE WHEN timestamptz '2026-10-10 09:00+00' - l.last_success > t.max_age THEN 'BREACH' ELSE 'ok' END AS status
FROM freshness_targets AS t
LEFT JOIN last_good AS l USING (table_name)
ORDER BY status, t.table_name;
```

| table_name | owner | age | max_age | status |
|------------|-------|-----|---------|--------|
| marts.clickstream | web-team | 00:40:00 | 00:15:00 | BREACH |
| marts.dim_product | catalog-team | 2 days 03:10:00 | 26:00:00 | BREACH |
| marts.fct_orders | orders-team | 03:20:00 | 26:00:00 | ok |

The zero-row publish at 08:55 does not count as fresh, so the clickstream breach is caught even though the job "succeeded". (A fixed timestamp stands in for `now()` to make the output reproducible.)

### Alerts people act on

- Route to the owning team with severity based on the table's importance.
- Include the expected and observed age, the last successful run id, and upstream status from lineage.
- Suppress downstream alerts when an upstream table is already breaching, so one late source produces one alert.
- Tell consumers proactively: a status page or a banner on the dashboard ("data delayed, expected by 09:30").

## Trade-offs and pitfalls

- Data freshness needs a trustworthy timestamp column; publish freshness needs every pipeline to write audit records.
- Tight targets on tables nobody uses at night create pages for nothing; agree targets per consumer need.
- Freshness does not mean completeness: a partition can be on time and half empty. Pair it with volume checks.

## Common mistakes

1. Monitoring only task failures.
2. Measuring freshness from scheduler run times.
3. Running the check inside the DAG it monitors.
4. SLAs set without asking consumers, or tighter than the SLO behind them.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design an A/B Testing Data Pipeline"
description: "A system-design case study for experiment analytics: assignment and exposure logging, metric computation, sample ratio checks, CUPED and trustworthy results."
technology: ["data-engineering", "sql", "spark"]
topic: ["experimentation", "analytics", "architecture"]
tags: ["a-b-testing", "experimentation", "srm", "cuped", "metrics-layer"]
difficulty: "Advanced"
problem: "Design the data pipeline behind a company's experimentation platform: record which users saw which variant, join that to behavioural and business events, and produce daily, statistically sound results for hundreds of concurrent experiments."
functionalRequirements:
  - "Log every assignment and the first exposure of each user to each experiment"
  - "Compute pre-defined metrics (conversion, revenue per user, retention, latency guardrails) per experiment and variant"
  - "Run automatic health checks: sample ratio mismatch, multiple exposures, missing data"
  - "Report effect sizes with confidence intervals, refreshed at least daily"
  - "Let analysts add new metrics from a governed definition, not ad-hoc SQL"
  - "Support segment breakdowns (platform, country, new versus returning)"
nonFunctionalRequirements:
  - "Results for the previous day available by 08:00"
  - "Every result reproducible from stored inputs and metric versions"
  - "No user counted in more than one variant of the same experiment without being flagged"
  - "Compute cost grows roughly linearly with the number of experiments, not quadratically with metrics × experiments"
  - "Personal data excluded from result tables"
scaleAssumptions:
  - "Assumption: 20 million daily active users"
  - "Assumption: about 300 experiments running at once, each user in about 10 of them"
  - "Assumption: 2 billion behavioural events a day, about 500 bytes each"
  - "Assumption: about 150 governed metric definitions, 10 to 20 per experiment"
architectureSummary: "A deterministic assignment service and SDKs emit exposure events; exposures and product events land in the lakehouse. A daily batch builds a first-exposure table, joins it to metric source tables within each experiment's analysis window to produce per-user metric values, aggregates to sufficient statistics per variant, then runs health checks and statistics before publishing results."
technologies: ["Feature-flag or assignment service with deterministic hashing", "Event pipeline (Kafka or a managed collector)", "Lakehouse or cloud warehouse", "Spark or warehouse SQL for metric computation", "Orchestrator", "Statistics service (Python)", "Results store and UI"]
tradeoffs:
  - decision: "Log exposures, not just assignments"
    alternative: "Analyse everyone who was assigned"
    reason: "Users who never reached the changed screen dilute the effect and add noise"
    consequence: "Exposure logging must be identical across variants, or it causes sample ratio mismatch"
  - decision: "Aggregate to per-user values, then sufficient statistics per variant"
    alternative: "Run statistics directly on raw events"
    reason: "The user is the randomisation unit; per-user values give correct variance, and sums and sums of squares are small to store"
    consequence: "Some metrics (ratios, quantiles) need extra statistics such as the delta method or bootstrap"
  - decision: "Daily batch recomputation of cumulative results"
    alternative: "Streaming, continuously updated results"
    reason: "Decisions are made over days or weeks; batch is cheaper and easier to make reproducible"
    consequence: "Severe regressions are found by separate real-time guardrail alerts, not the main pipeline"
  - decision: "Central metric definitions with versioning"
    alternative: "Each analyst writes their own query"
    reason: "Same metric means the same thing in every experiment and is auditable"
    consequence: "Governance overhead to add or change a metric"
  - decision: "CUPED variance reduction using pre-period data"
    alternative: "Plain difference in means"
    reason: "Narrower confidence intervals for the same traffic, so shorter experiments"
    consequence: "Needs a pre-experiment covariate per user, which adds a join and more computation"
interviewFollowUps:
  - "Your SRM check fires on an experiment. What are the likely causes and what do you do?"
  - "How do you handle users who log in on a second device mid-experiment?"
  - "The product manager checks results every day and wants to stop as soon as it is significant. What is the problem and how does the platform handle it?"
  - "How would you compute a ratio metric such as average order value correctly?"
  - "How do you make results reproducible six months later?"
  - "How would you support experiments randomised by company account instead of by user?"
related:
  - "system-designs:clickstream-data-platform"
  - "system-designs:reporting-analytics-platform"
  - "articles:sql/aggregations-group-by-having"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "articles:data-warehousing/star-schema"
versionContext: "The metric and SRM SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Statistical methods are described conceptually; check your experimentation tool's documentation for its exact tests."
sources:
  - { label: "GrowthBook documentation: statistics overview (SRM, multiple exposures, guardrails)", url: "https://docs.growthbook.io/statistics/overview" }
  - { label: "GrowthBook documentation: CUPED", url: "https://docs.growthbook.io/statistics/cuped" }
  - { label: "PostgreSQL 16: WITH queries", url: "https://www.postgresql.org/docs/16/queries-with.html" }
previous: "system-designs:near-zero-downtime-migration"
---

## Approach

An experimentation pipeline is judged on **trustworthiness**. A fast pipeline that reports a wrong winner is worse than none. So the design centres on correct attribution of users to variants, correct metric windows, and automatic checks that catch broken experiments before anyone reads the result.

Clarifying questions:

- **Randomisation unit**: user, device, session, or account? The unit decides the grain of every table.
- **Who assigns?** A feature-flag service with deterministic hashing, or something the pipeline must reconstruct?
- **Exposure**: is there an event for "user actually saw the change", or only for "user was assigned"?
- **Metrics**: which ones (conversion, revenue, retention, latency), and are definitions shared across teams?
- **Freshness**: daily results, or near-real-time guardrails for severe regressions?
- **Scale**: concurrent experiments, users per experiment, events per day.
- **Statistics**: fixed-horizon tests, sequential testing, Bayesian? Who owns the methodology?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Assignment</strong>: the SDK hashes (experiment id, user id) into a bucket and returns a variant; no network call or database lookup is needed to be consistent.</li>
<li><strong>Exposure events</strong>: when the user reaches the changed experience, the SDK emits an exposure event (experiment, variant, user, timestamp) to the event pipeline.</li>
<li><strong>Landing</strong>: exposures and product events land in raw lakehouse tables, partitioned by event date.</li>
<li><strong>First exposure table</strong>: a daily job keeps one row per (experiment, user): first variant and first exposure time, plus flags for multiple variants.</li>
<li><strong>Per-user metrics</strong>: metric definitions are compiled to SQL that joins each experiment's users to metric source tables inside the analysis window.</li>
<li><strong>Variant statistics</strong>: per-user values are reduced to counts, sums and sums of squares per variant and segment.</li>
<li><strong>Health checks and statistics</strong>: SRM, multiple exposure rate and data completeness gate the results; then effect sizes and intervals are computed.</li>
<li><strong>Results store and UI</strong>: versioned results per experiment and day.</li>
</ol>
<figcaption>Randomisation happens in the product; the pipeline reconstructs who was exposed and what they did afterwards.</figcaption>
</figure>

Walkthrough:

1. **Deterministic hashing** makes assignment reproducible: the same user always gets the same variant, and the pipeline can recompute it to cross-check the logs. Including the experiment id (or a salt) in the hash keeps experiments independent of each other.
2. **Exposure logging** is the most fragile step. If one variant logs exposures under different conditions (for example, the new page fires the event after a slow load and some users leave first), the two groups are no longer comparable.
3. **First exposure** is the anchor: only behaviour **after** a user's first exposure counts, and only within the experiment's analysis window.
4. **Metric computation** is a big join, so it runs once per day per metric source, for all experiments together, instead of once per experiment per metric.
5. **Sufficient statistics** (n, sum, sum of squares, and for CUPED the covariate sums and cross-products) are all the statistics engine needs. They are tiny, so results are cheap to store and recompute.

## Data model

| Table | Grain | Key columns |
|---|---|---|
| `raw.exposures` | One row per exposure event | experiment_id, variant, user_id, exposed_at, sdk_version |
| `exp.first_exposure` | One row per (experiment, user) | variant, first_exposed_at, multiple_variants flag |
| `exp.metric_definitions` | One row per metric version | source table, aggregation, filter, window, owner, version |
| `exp.user_metrics` | One row per (experiment, user, metric, date) | value, pre_period_value |
| `exp.variant_stats` | One row per (experiment, variant, metric, segment, date) | n, sum, sum_sq, covariate sums |
| `exp.results` | One row per (experiment, metric, comparison, date) | effect, interval, p-value, metric version, pipeline run id |

Partition large tables by date; cluster per-user tables by experiment id so a single experiment's reruns read little data.

## Computing a metric correctly

The example shows the two rules that matter most: count each user once from their first exposure, and only count behaviour **after** exposure and inside the window (seven days here).

```sql
CREATE TABLE exposures (user_id int, experiment_id text, variant text, exposed_at timestamp);
CREATE TABLE purchases (user_id int, purchased_at timestamp, amount numeric(10,2));

INSERT INTO exposures VALUES
  (1,'checkout_v2','control','2026-09-01 10:00'), (1,'checkout_v2','control','2026-09-01 10:05'),
  (2,'checkout_v2','treatment','2026-09-01 11:00'), (3,'checkout_v2','control','2026-09-01 12:00'),
  (4,'checkout_v2','treatment','2026-09-02 09:00'), (5,'checkout_v2','treatment','2026-09-02 09:30'),
  (6,'checkout_v2','control','2026-09-02 10:00');
INSERT INTO purchases VALUES
  (1,'2026-09-01 09:00',50.00),
  (1,'2026-09-01 10:30',20.00), (2,'2026-09-01 11:10',35.00),
  (4,'2026-09-03 08:00',15.00), (4,'2026-09-04 08:00',25.00), (7,'2026-09-02 10:00',99.00);

WITH first_exposure AS (
  SELECT user_id, variant, min(exposed_at) AS first_exposed_at
  FROM exposures
  WHERE experiment_id = 'checkout_v2'
  GROUP BY user_id, variant
), per_user AS (
  SELECT f.user_id, f.variant,
         count(p.user_id) > 0 AS converted,
         coalesce(sum(p.amount), 0) AS revenue
  FROM first_exposure f
  LEFT JOIN purchases p
    ON p.user_id = f.user_id
   AND p.purchased_at >= f.first_exposed_at
   AND p.purchased_at <  f.first_exposed_at + interval '7 days'
  GROUP BY f.user_id, f.variant
)
SELECT variant,
       count(*) AS users,
       round(avg(converted::int), 3) AS conversion_rate,
       round(avg(revenue), 2) AS revenue_per_user
FROM per_user
GROUP BY variant
ORDER BY variant;
```

```text
  variant  | users | conversion_rate | revenue_per_user
-----------+-------+-----------------+------------------
 control   |     3 |           0.333 |             6.67
 treatment |     3 |           0.667 |            25.00
```

Points to notice:

- User 1's 50.00 purchase happened **before** exposure, so it is excluded; counting it would credit the control variant with behaviour the experiment could not have caused.
- User 7 bought something but was never exposed, so they are not in the experiment at all.
- Users 3, 5 and 6 have no purchases but stay in the denominator via the `LEFT JOIN`. An inner join would drop non-converters and inflate both rates.
- `revenue_per_user` averages over **users**, the randomisation unit. Averaging over orders (average order value) is a ratio metric whose variance needs the delta method, because orders from the same user are not independent.

Grouping by `(user_id, variant)` would produce two rows for a user who appears in both variants. The `first_exposure` table in production should keep one row per user and flag users with more than one variant; if that flag rate is more than a fraction of a percent, the experiment has an assignment or logging bug.

## Health checks before results

**Sample ratio mismatch (SRM)** compares observed user counts per variant with the intended split. A chi-square goodness-of-fit test is standard:

```sql
WITH counts AS (
  SELECT variant, count(DISTINCT user_id) AS n FROM exposures GROUP BY variant
), expected AS (
  SELECT variant, n, sum(n) OVER () * 0.5 AS e FROM counts
)
SELECT round(sum((n - e) ^ 2 / e), 3) AS chi_square, count(*) - 1 AS degrees_of_freedom
FROM expected;
```

```text
 chi_square | degrees_of_freedom
------------+--------------------
      0.000 |                  1
```

Here the split is exactly 3 and 3. Platforms typically flag SRM at a very strict threshold (for example p below 0.001, which for one degree of freedom is a chi-square above about 10.83), because with millions of users even tiny real imbalances are detectable, and a false alarm stops a valid experiment. An SRM means the groups are not comparable: **do not read the metric results**; investigate first.

Common causes of SRM: exposure logged differently per variant, bots filtered more in one variant, redirects that lose users, a variant that crashes before logging, or an identifier mismatch between assignment and the warehouse.

Other checks: multiple-exposure rate, days with missing event partitions, a sudden drop in exposure volume, and guardrail metrics (errors, latency, unsubscribe rate) moving the wrong way.

## Statistics the pipeline must support

- **Difference in means with confidence intervals** for per-user metrics, from n, sum and sum of squares.
- **Ratio metrics** (revenue per order, click-through per impression) using the delta method.
- **Variance reduction (CUPED)**: adjust each user's metric with their own pre-experiment value of the same or a correlated metric. Users with no history (new users) need a sensible default covariate.
- **Peeking**: re-reading a fixed-horizon test every day and stopping at the first significant result inflates false positives. Either fix the horizon in advance or use a sequential method designed for continuous monitoring.
- **Multiple comparisons** across many metrics and segments: designate one primary metric per experiment, and treat segment results as exploratory or corrected.

## Late data and reprocessing

Mobile events can arrive days late. Recompute the trailing window (for example the last 3 days of event dates) on each run, and recompute cumulative statistics from per-user tables rather than incrementing yesterday's totals. Results are versioned by run, so a correction is visible rather than silently replacing a number someone already acted on.

## Schema evolution and metric governance

- Exposure events have a strict contract (experiment id, variant, user id, timestamp, SDK version), validated at ingestion.
- Metric definitions are versioned. Changing a definition creates a new version; results record which version produced them. Old experiments are not silently recomputed with new definitions.

## Security and PII

Per-user tables contain user ids and behaviour, so they live in a restricted schema. Published results contain only aggregates. Apply a minimum cell size for segment breakdowns so small segments cannot identify individuals.

## Failure modes and recovery

| Failure | Effect | Mitigation |
|---|---|---|
| Event pipeline drops a day of data | Metrics low for both variants | Completeness check blocks publication; rerun after backfill |
| Exposure event fired after redirect in one variant | SRM | SRM gate; fix logging; usually restart the experiment |
| Metric definition bug | Wrong results across many experiments | Versioned definitions; recompute affected experiments from per-user tables |
| Pipeline late | Results stale | Publish yesterday's results with a "stale" banner rather than nothing |

## Monitoring and SLAs

- Results freshness per experiment against the 08:00 SLA.
- Exposure counts per experiment per day, with alerts on sudden drops.
- SRM and multiple-exposure flags as first-class alerts to experiment owners.
- Pipeline cost per experiment, to spot metrics whose joins have become too expensive.

## Cost and scaling to 10×

The expensive part is joining behaviour events to exposures. Scale by:

- Computing each metric source **once per day for all experiments** (one join of events to a user-to-experiments table), not once per experiment.
- Pre-aggregating events to user-day grain first (2 billion events become about 20 million user-day rows per source).
- Storing only sufficient statistics for results, so statistics and UI reads are cheap.
- At 10× (3,000 experiments), the user-to-experiment table grows to about 200 million rows a day; cluster by user id so the join stays a co-located merge, and drop finished experiments from the daily run.

## Capacity estimate

Assumptions: 20 million daily active users, each in 10 experiments; 2 billion events a day at 500 bytes; 150 metrics; 300 experiments.

- **Raw events**: 2 × 10⁹ × 500 B = 1 TB/day uncompressed, roughly 200 to 250 GB compressed in Parquet.
- **Exposures**: if each active user triggers about 20 exposure events a day, that is 400 million rows, around 40 GB uncompressed.
- **First-exposure table**: active (experiment, user) pairs = 20 million × 10 = 200 million rows; at about 50 bytes each, 10 GB.
- **User-day aggregates**: 20 million users × a handful of metric sources ≈ 100 million rows per day.
- **Per-user metric values**: 200 million pairs × about 15 metrics each = 3 billion values per run if computed naively for cumulative windows, which is why they are stored compactly and partitioned by experiment.
- **Variant statistics**: 300 experiments × 2–3 variants × 15 metrics × ~10 segments ≈ 100,000 rows a day: trivial to store.

## What a strong answer includes

- Deterministic assignment, exposure logging and a first-exposure anchor, with the randomisation unit as the grain.
- Metric windows that start at first exposure, and denominators that keep non-converters.
- SRM and data-completeness checks that **block** results, with a list of usual causes.
- Awareness of peeking, ratio metrics and multiple comparisons, even if a separate team owns the statistics.
- A scalable computation plan: shared joins across experiments, sufficient statistics, versioned metric definitions.

## Common mistakes

- Counting events instead of users, or using an inner join that drops non-converters.
- Including behaviour from before exposure.
- Ignoring SRM, or reading metric results from an experiment that has it.
- Stopping experiments at the first significant daily result.
- Letting each analyst define "conversion" differently.
- Recomputing everything per experiment, so cost scales with experiments × metrics × days.

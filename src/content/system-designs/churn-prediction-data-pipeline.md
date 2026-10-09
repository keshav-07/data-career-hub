---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Churn Prediction Data Pipeline"
description: "A system-design case study for churn prediction data: label definition, point-in-time features, training snapshots, batch scoring, CRM write-back and drift checks."
technology: ["data-engineering", "sql", "spark"]
topic: ["ml-data", "feature-engineering", "architecture"]
tags: ["churn", "feature-store", "point-in-time", "data-leakage", "batch-scoring", "model-monitoring"]
difficulty: "Advanced"
problem: "Design the data pipeline behind a churn prediction model for a subscription business: define churn labels, build leak-free features from product usage, billing and support data, produce reproducible training datasets, score every active customer daily, and deliver the scores to the customer-success team's tools."
functionalRequirements:
  - "Define and compute a churn label consistently for training and evaluation"
  - "Compute customer features (usage trends, billing events, support tickets, plan details) as of any past date"
  - "Produce versioned, reproducible training datasets from historical snapshots"
  - "Score all active customers daily and write scores and top reasons to the CRM"
  - "Monitor feature drift, score distribution and realised model performance"
nonFunctionalRequirements:
  - "No information from after the prediction date may leak into training features"
  - "Training and scoring use the same feature definitions"
  - "Daily scores available in the CRM by 08:00 local time"
  - "Any past training set can be rebuilt exactly from its version id"
  - "Personal data minimised; scores explainable to account managers"
scaleAssumptions:
  - "Assumption: 500,000 active subscription accounts"
  - "Assumption: 3 years of history, about 1.5 billion usage events a year"
  - "Assumption: about 150 features per account"
  - "Assumption: a monthly churn rate of around 2%, so positives are rare"
architectureSummary: "Raw usage, billing, CRM and support data land in the lakehouse. Feature pipelines compute daily feature snapshots per account (an offline feature store) using only data available as of each date. A label job derives churn outcomes from billing over a fixed horizon. A training-set builder joins snapshots to labels point-in-time and writes versioned datasets. A daily scoring job reads today's snapshot, applies the registered model, and writes scores and explanations to a scores table and the CRM; monitoring compares features, scores and realised outcomes over time."
technologies: ["Lakehouse tables (Delta Lake or Iceberg)", "Spark or warehouse SQL for features", "Offline feature store (snapshot tables or a feature-store product)", "Orchestrator", "Model registry and experiment tracking", "Reverse ETL or CRM API connector", "Monitoring and data quality tooling"]
tradeoffs:
  - decision: "Daily feature snapshots per account"
    alternative: "Compute features on demand from raw events for each training date"
    reason: "Snapshots make point-in-time joins trivial and training sets reproducible"
    consequence: "Storage grows with accounts × days × features; old snapshots may be compacted to weekly"
  - decision: "Batch daily scoring"
    alternative: "Real-time scoring on every event"
    reason: "Customer-success teams act on accounts daily or weekly; churn develops over weeks"
    consequence: "Sudden signals (a cancellation page visit) are seen the next day unless a separate trigger exists"
  - decision: "Label from billing outcomes over a fixed 60-day horizon"
    alternative: "Label from a 'cancelled' flag in the CRM"
    reason: "Billing is the source of truth for revenue loss and has precise dates"
    consequence: "The most recent 60 days of snapshots cannot be labelled yet"
  - decision: "Shared feature definitions for training and scoring"
    alternative: "Data scientists rewrite features in notebooks for training"
    reason: "Prevents training-serving skew"
    consequence: "Feature code needs engineering standards, tests and review"
  - decision: "Write scores with reason codes to the CRM"
    alternative: "Publish a dashboard only"
    reason: "Scores are useful only where account managers already work"
    consequence: "Reverse ETL adds API limits and field-mapping maintenance"
interviewFollowUps:
  - "Explain data leakage with a concrete example from this pipeline."
  - "How do you define churn for annual contracts, downgrades and paused accounts?"
  - "Why can't you evaluate last month's predictions yet?"
  - "Your model's AUC was great offline but useless in production. What went wrong?"
  - "How would you add a real-time trigger when a customer visits the cancellation page?"
  - "How do you know whether the customer-success interventions are working, given they change the outcome?"
related:
  - "system-designs:cloud-data-warehouse-platform"
  - "system-designs:a-b-testing-data-pipeline"
  - "articles:data-warehousing/slowly-changing-dimensions"
  - "articles:sql/window-functions"
  - "articles:etl-elt/data-quality-checks-contracts"
versionContext: "The point-in-time feature and label SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Feature-store products and model registries are described generically."
sources:
  - { label: "Delta Lake: table batch reads and writes (time travel)", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "PostgreSQL 16: SELECT", url: "https://www.postgresql.org/docs/16/sql-select.html" }
previous: "system-designs:cloud-data-warehouse-platform"
next: "system-designs:real-time-leaderboard"
---

## Approach

A churn model is only as good as the data pipeline behind it, and the classic failure is not a bad algorithm but **leakage**: features that accidentally contain information from after the moment the prediction would have been made. The data engineer's job is a precise label, point-in-time correct features, reproducible training sets, and a scoring path that uses exactly the same features.

Clarifying questions:

- **What is churn?** Cancellation, non-renewal, downgrade to free, payment failure without recovery? Logo churn or revenue churn?
- **Prediction horizon**: churn within the next 30, 60 or 90 days?
- **Who acts on the scores, how often, and where?** That decides scoring frequency and delivery (CRM, email, dashboard).
- **Data sources**: product usage, billing, support tickets, NPS surveys, CRM notes?
- **Contract types**: monthly self-serve versus annual enterprise contracts behave very differently and may need separate models.
- **Constraints**: explainability for account managers, privacy rules on usage data.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Sources</strong>: usage events, billing (subscriptions, invoices, payments), CRM accounts and support tickets land in lakehouse bronze and silver tables.</li>
<li><strong>Feature pipelines</strong>: a daily job computes one feature row per active account <em>as of</em> that day, appended to a snapshot table partitioned by date.</li>
<li><strong>Label job</strong>: derives for each (account, as-of date) whether the account churned in the following 60 days, once that window has passed.</li>
<li><strong>Training-set builder</strong>: joins snapshots to labels for a chosen date range, samples, splits by time and writes a versioned dataset.</li>
<li><strong>Training and registry</strong>: models are trained, evaluated on later time periods, and registered with the dataset version and feature list.</li>
<li><strong>Daily scoring</strong>: reads today's snapshot, applies the production model, writes scores and reason codes to a scores table.</li>
<li><strong>Delivery and monitoring</strong>: reverse ETL pushes scores to the CRM; monitoring tracks drift, score distribution and realised churn.</li>
</ol>
<figcaption>Features are frozen per day, labels are added once the future is known, and scoring reads the same frozen features.</figcaption>
</figure>

## Labels

A precise, documented label definition:

- **Population**: accounts active (paying) on the as-of date, excluding those already in a notice period if the business cannot influence them.
- **Event**: subscription ends without renewal, or downgrades to free, within 60 days after the as-of date.
- **Exclusions**: involuntary churn from failed payments might be modelled separately, because the intervention (fix the card) is different.
- **Annual contracts**: churn can only happen at renewal; a 60-day horizon labels almost everyone negative except near renewal. Either add "days to renewal" as a feature and restrict the population, or build a separate renewal model.

Labels mature slowly: a snapshot from yesterday cannot be labelled for 60 days. The label job therefore only labels snapshots older than the horizon, and evaluation of production predictions always lags by the horizon.

## Point-in-time features and leakage

Every feature for an as-of date must use **only data that existed before that date**. Leakage examples:

- "Number of logins in the last 30 days" computed from today's data for a snapshot dated three months ago.
- "Plan type" read from the current account table, when the account downgraded **because** it was churning.
- "Support tickets mentioning cancellation" including tickets filed after the as-of date.
- Aggregates over the whole history (average monthly usage over the customer's lifetime) for past snapshots.

A small worked example in PostgreSQL: features and label for each account as of 1 July.

```sql
CREATE TABLE logins (account_id int, login_date date);
CREATE TABLE cancellations (account_id int, cancelled_on date);
CREATE TABLE snapshots (account_id int, as_of date);

INSERT INTO logins VALUES
  (1, '2026-06-02'), (1, '2026-06-20'), (1, '2026-06-28'), (1, '2026-07-15'),
  (2, '2026-06-05'), (2, '2026-07-02'),
  (3, '2026-06-10'), (3, '2026-06-25'), (3, '2026-06-29');
INSERT INTO cancellations VALUES (2, '2026-07-20'), (3, '2026-09-15');
INSERT INTO snapshots VALUES (1, '2026-07-01'), (2, '2026-07-01'), (3, '2026-07-01');

SELECT s.account_id, s.as_of,
       (SELECT count(*) FROM logins l
         WHERE l.account_id = s.account_id
           AND l.login_date >= s.as_of - 30 AND l.login_date < s.as_of) AS logins_last_30d,
       (SELECT s.as_of - max(l.login_date) FROM logins l
         WHERE l.account_id = s.account_id AND l.login_date < s.as_of) AS days_since_login,
       EXISTS (SELECT 1 FROM cancellations c
                WHERE c.account_id = s.account_id
                  AND c.cancelled_on >= s.as_of AND c.cancelled_on < s.as_of + 60) AS churned_next_60d
FROM snapshots s
ORDER BY s.account_id;
```

```text
 account_id |   as_of    | logins_last_30d | days_since_login | churned_next_60d
------------+------------+-----------------+------------------+------------------
          1 | 2026-07-01 |               3 |                3 | f
          2 | 2026-07-01 |               1 |               26 | t
          3 | 2026-07-01 |               3 |                2 | f
```

What to notice:

- Account 1's login on 15 July and account 2's on 2 July are **after** the as-of date, so they are excluded from features. Including them would teach the model that churners log in more than they really did before churning.
- Features look **backwards** from `as_of` (strictly before it); the label looks **forwards** (from `as_of` to `as_of + 60`). Mixing the two directions is how leakage happens.
- Account 3 cancels on 15 September, outside the 60-day window, so it is negative for this snapshot. It would be positive for a snapshot taken in late July or August.
- In production this logic runs once per day for all accounts and writes the feature row into a snapshot table, rather than recomputing correlated subqueries per training run.

Slowly changing attributes (plan, seat count, account owner) must come from SCD Type 2 dimensions joined **as of** the snapshot date, or from the snapshot itself.

## Data model and storage layout

| Table | Grain | Notes |
|---|---|---|
| `features.account_daily` | Account × as-of date | ~150 feature columns plus `feature_set_version`; partitioned by as-of date |
| `labels.churn_60d` | Account × as-of date | Label, label definition version, labelled-at date |
| `training.datasets` | Dataset version | Date range, sampling rule, feature and label versions, row counts, storage path |
| `scores.churn_daily` | Account × score date | Score, model version, top reason codes |
| `monitoring.feature_stats` | Feature × date | Mean, quantiles, null rate, drift statistic |

Training datasets are immutable files (or table versions, via time travel) referenced by id, so a model can always be traced to exactly the rows it saw.

## Training-set builder

- Select snapshot dates (for example weekly snapshots over two years) to avoid near-duplicate rows from consecutive days of the same account.
- **Split by time**, not randomly: train on older periods, validate on later ones. Random splits put the same account's neighbouring days in train and test and overstate performance.
- Handle class imbalance (2% positives) by weighting or sampling negatives, recording the sampling rule in the dataset metadata so evaluation can correct for it.

## Scoring and delivery

- The daily scoring job reads today's snapshot partition, loads the model version marked "production" in the registry, and writes scores with the model version and feature-set version.
- **Reason codes** (top contributing features per account) make scores actionable for account managers.
- Reverse ETL pushes score, band and reasons to CRM fields, coalesced to changed values only, within the CRM's API limits.
- If the snapshot is incomplete (an upstream source is late), the job waits until a cut-off and then either scores with yesterday's features or skips, but never scores with partially null features silently.

## Late data and schema evolution

- Late usage events change recent feature values. Daily snapshots are **frozen** once written, so a training set reflects what the model would have seen at the time; this is deliberate, because production scoring also sees late data late.
- Adding a feature: compute it going forward and backfill historical snapshots with the same point-in-time logic. Bump the feature-set version.
- Renaming or changing a feature's definition is a new feature, not an edit.

## Data quality and monitoring

- **Feature checks**: null rate, ranges, and distribution shift per feature versus a reference window (for example a population stability index), with alerts.
- **Score monitoring**: distribution of scores per day and per segment; a sudden jump in high-risk accounts is more often a data bug than a real churn wave.
- **Realised performance**: once labels mature, compute precision and recall per score band for each past score date.
- **Feedback loop caution**: when account managers successfully save high-risk accounts, those accounts look like false positives. Keep a random holdout of accounts that receive no intervention to measure true model quality and intervention impact.

## Security and privacy

Usage-level data is personal when it relates to identifiable users. Build features at account level, aggregate user activity, exclude free-text support content or process it into non-identifying signals, and restrict access to raw tables. Scores themselves can be sensitive (they affect how customers are treated), so log who can see them.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Upstream usage feed late | Today's features incomplete | Completeness gate; score with yesterday's features and flag |
| Feature bug discovered | Training and scoring affected | Fix, backfill affected snapshots as a new feature-set version, retrain |
| Model performs worse after retrain | Bad scores | Registry rollback to the previous version |
| CRM API outage | Scores not delivered | Retry; scores stay in the scores table and dashboard |
| Leakage found after launch | Offline metrics were overstated | Rebuild the training set with corrected point-in-time logic; re-evaluate |

## Monitoring and SLAs

- Snapshot completeness and freshness by 06:00, scores in CRM by 08:00.
- Feature drift alerts; score distribution alerts.
- Monthly realised performance report once labels mature.

## Cost

Snapshot tables are the main storage cost: 500,000 accounts × 365 days × 150 features. Keep daily snapshots for a limited period and weekly snapshots for older history; store them in compressed columnar format. Compute features incrementally from daily aggregates rather than rescanning raw events.

## Scaling to 10×

At 5 million accounts: compute features with a distributed engine from pre-aggregated daily tables, partition snapshots by date and bucket by account, and score in parallel. Online serving (real-time scores in the product) would add an online feature store fed by the same definitions, which is where training-serving skew risk returns.

## Capacity estimate

Assumptions: 500,000 active accounts, 150 features at about 8 bytes each, 3 years, roughly 5:1 compression for snapshot tables.

- **One daily snapshot**: 500,000 × 150 × 8 B ≈ 600 MB uncompressed, about 120 MB compressed.
- **Three years of daily snapshots**: 1,095 × 120 MB ≈ 130 GB compressed; manageable, but weekly snapshots for older years cut it further.
- **Training set**: 104 weekly snapshots × 500,000 accounts ≈ 52 million rows, with about 1 million positives at 2%; after down-sampling negatives, perhaps 5 to 10 million rows.
- **Daily scoring**: 500,000 rows through a tree model takes minutes on a single machine; the feature computation, not the model, dominates run time.
- **Raw usage**: 1.5 billion events a year at 300 bytes ≈ 450 GB/year raw; daily per-account aggregates reduce this to 500,000 rows a day.

## What a strong answer includes

- A precise label with population, horizon, exclusions and the maturity delay it implies.
- Point-in-time feature computation, with concrete leakage examples and how snapshots prevent them.
- Time-based train and validation splits and versioned, reproducible datasets.
- One feature definition shared by training and scoring.
- Scores delivered where people act, with reason codes.
- Monitoring of drift and realised performance, including a holdout to handle the intervention feedback loop.

## Common mistakes

- Computing historical features from current tables.
- Random train-test splits across time for the same accounts.
- Evaluating last month's predictions before their labels exist.
- Reimplementing features differently in the scoring job.
- Defining churn vaguely ("inactive") so the label changes every quarter.
- Ignoring that successful interventions make the model look worse.

---
title: "Design a Feature Store"
description: "A system-design case study for a feature store: feature definitions, offline and online stores, point-in-time joins, streaming features, skew prevention and governance."
technology: ["data-engineering", "spark", "kafka"]
topic: ["feature-store", "machine-learning", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "Twenty ML teams each build their own feature pipelines, compute the same customer features differently, and regularly ship models whose online features do not match what they were trained on. Design a shared feature store that lets teams define features once, generate point-in-time-correct training data, and serve the same features online with low latency."
functionalRequirements:
  - "Register feature definitions (entity, source, transformation, owner, freshness) as code"
  - "Materialise batch features from the lakehouse and streaming features from Kafka"
  - "Generate training datasets with point-in-time-correct joins for a list of entities and timestamps"
  - "Serve the latest feature values online by entity key with low latency"
  - "Discover, reuse and version features; see which models use which features"
  - "Backfill a new feature over historical data"
nonFunctionalRequirements:
  - "Online reads under 10 ms at p99 for a batch of up to 100 features"
  - "Streaming features fresh within 60 seconds; batch features within their declared SLA"
  - "No training-serving skew: the same definition computes offline and online values"
  - "99.95% availability for online serving"
  - "Access control per feature group, including personal-data features"
scaleAssumptions:
  - "Assumption: 3,000 features in 200 feature groups across customers, items, merchants and devices"
  - "Assumption: 50 million customer entities and 5 million item entities"
  - "Assumption: 20,000 online feature-vector reads per second at peak"
  - "Assumption: training sets of up to 1 billion rows built weekly"
architectureSummary: "A registry holds feature definitions as code. Batch transformations run in Spark on the lakehouse and write timestamped feature values to an offline store (Delta or Iceberg tables) and the latest values to an online key-value store. Streaming transformations in Flink or Spark Structured Streaming write the same two stores. A retrieval SDK performs point-in-time joins for training and low-latency lookups for serving, and monitoring compares offline and online values."
technologies:
  - "Feature registry and SDK (Feast open source, or a managed store such as Databricks Feature Engineering, SageMaker Feature Store or Vertex AI Feature Store)"
  - "Offline store: Delta Lake or Iceberg tables (or a warehouse)"
  - "Online store: Redis, DynamoDB, Cassandra or Bigtable"
  - "Spark for batch features and backfills"
  - "Flink or Spark Structured Streaming with Kafka for streaming features"
  - "Orchestrator such as Airflow for materialisation schedules"
tradeoffs:
  - decision: "Separate offline and online stores"
    alternative: "One database for both"
    reason: "Training needs cheap scans over long history; serving needs millisecond point reads; no single store does both well and cheaply"
    consequence: "Two copies to keep consistent, so materialisation and parity checks are core platform work"
  - decision: "Feature definitions as code in one registry"
    alternative: "Each team writes its own pipelines and tables"
    reason: "One definition computes both offline and online values, preventing skew and duplicated work"
    consequence: "Teams adopt the platform's abstractions and review process"
  - decision: "Point-in-time joins in the retrieval SDK"
    alternative: "Teams write their own as-of joins"
    reason: "As-of joins are easy to get subtly wrong, and a leak silently inflates offline metrics"
    consequence: "The SDK must scale to billion-row joins, which needs careful Spark engineering"
  - decision: "Build on Feast plus existing lakehouse and key-value services"
    alternative: "Buy a managed feature platform"
    reason: "Uses existing storage and engines with an open-source registry and SDK"
    consequence: "The team operates materialisation, streaming and monitoring itself; a managed platform shortens time to value"
  - decision: "Log served feature vectors for important models"
    alternative: "Rely only on offline recomputation"
    reason: "Training on exactly what was served is the strongest guarantee against skew"
    consequence: "Large logs and extra privacy obligations"
interviewFollowUps:
  - "What is a point-in-time join, and what goes wrong without one?"
  - "How do you guarantee a streaming feature is computed the same way for training and serving?"
  - "A team adds a new feature. How do they get two years of history for training?"
  - "Online and offline values for a feature disagree. How do you detect and debug that?"
  - "Which online store would you choose, and how do you size it?"
  - "When is a feature store not worth building?"
related:
  - "system-designs:recommendation-data-pipeline"
  - "system-designs:fraud-detection-pipeline"
  - "articles:pyspark/window-functions"
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:delta-lake/transactions-schema-evolution"
previous: "system-designs:recommendation-data-pipeline"
next: "system-designs:metrics-kpi-platform"
versionContext: "The point-in-time join example was run on PostgreSQL 16 using LEFT JOIN LATERAL; feature-store SDK and store configuration are described, not executed."
sources:
  - { label: "Feast: point-in-time joins", url: "https://docs.feast.dev/getting-started/concepts/point-in-time-joins" }
  - { label: "Feast: feature retrieval", url: "https://docs.feast.dev/getting-started/concepts/feature-retrieval" }
  - { label: "Feast quickstart", url: "https://docs.feast.dev/getting-started/quickstart" }
  - { label: "PostgreSQL documentation: WITH queries and lateral subqueries", url: "https://www.postgresql.org/docs/current/queries-with.html" }
---

## Approach

A feature store solves two specific problems: **features computed differently for training and serving** (skew), and **features leaking future information into training** (time travel done wrong). Reuse and discovery are welcome side effects. Ask:

- **What models and latency classes?** Batch scoring only, or online inference with millisecond budgets?
- **Entities**: customers, items, merchants, devices? Composite keys (customer and merchant)?
- **Freshness**: daily, hourly, or within seconds for streaming features like transaction velocity?
- **Existing stack**: lakehouse or warehouse, Kafka, key-value stores, ML platform?
- **Teams and governance**: how many teams, who owns features, are there personal-data features?
- **Build or buy**: is a managed feature store available on the current cloud or platform?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Registry</strong>: feature views defined in code (entity, source, transformation, TTL, owner, tags) and applied through CI.</li>
<li><strong>Batch materialisation</strong>: Spark jobs compute feature views from lakehouse tables and append timestamped rows to the offline store, then push the latest values to the online store.</li>
<li><strong>Streaming materialisation</strong>: Flink or Spark Structured Streaming jobs consume Kafka, compute windowed features, and write both stores.</li>
<li><strong>Offline store</strong>: Delta or Iceberg tables keyed by entity and feature timestamp, holding full history.</li>
<li><strong>Online store</strong>: a key-value store holding the latest value of each feature per entity.</li>
<li><strong>Retrieval SDK</strong>: point-in-time joins for training sets and batch scoring; low-latency lookups for online inference; served vectors logged for monitoring.</li>
</ol>
<figcaption>One definition, two stores: history for training, latest values for serving, both written by the same pipelines.</figcaption>
</figure>

A churn team defines a feature view `customer_activity_30d` with `orders_30d` and `avg_basket_30d`, keyed by `customer_id`, computed daily from `silver.orders`. CI registers it. The daily job writes a row per customer with `feature_ts` to the offline table and upserts the latest values into Redis. To train, the team passes a table of `(customer_id, event_ts, churned)` to `get_historical_features`; the SDK returns each row with the feature values that were valid at `event_ts`. In production, the churn service calls `get_online_features` for a customer and receives the same features, computed by the same definition.

## Point-in-time correctness

For each training example, you must use the feature value **as it was known at the example's timestamp**, and only if it is still fresh enough (within the feature's TTL). The example below shows the logic in PostgreSQL 16 using `LEFT JOIN LATERAL`; feature-store SDKs implement the same "as of" join at scale.

```sql
CREATE TABLE feature_log (
  customer_id     INT,
  orders_30d      INT,
  avg_basket_30d  NUMERIC(8,2),
  feature_ts      TIMESTAMP
);
INSERT INTO feature_log VALUES
  (1, 2, 40.00, '2026-09-01 00:00'),
  (1, 5, 55.00, '2026-09-15 00:00'),
  (1, 9, 80.00, '2026-10-01 00:00'),
  (2, 1, 20.00, '2026-09-10 00:00');

CREATE TABLE training_events (
  customer_id INT,
  event_ts    TIMESTAMP,
  churned     INT
);
INSERT INTO training_events VALUES
  (1, '2026-09-20 12:00', 0),
  (1, '2026-09-01 00:00', 0),
  (2, '2026-09-05 08:00', 1);

SELECT e.customer_id, e.event_ts, f.orders_30d, f.avg_basket_30d, f.feature_ts, e.churned
FROM training_events e
LEFT JOIN LATERAL (
  SELECT orders_30d, avg_basket_30d, feature_ts
  FROM feature_log fl
  WHERE fl.customer_id = e.customer_id
    AND fl.feature_ts <= e.event_ts
    AND fl.feature_ts >  e.event_ts - INTERVAL '30 days'   -- feature TTL
  ORDER BY fl.feature_ts DESC
  LIMIT 1
) f ON TRUE
ORDER BY e.customer_id, e.event_ts;
```

```text
 customer_id |      event_ts       | orders_30d | avg_basket_30d |     feature_ts      | churned
-------------+---------------------+------------+----------------+---------------------+---------
           1 | 2026-09-01 00:00:00 |          2 |          40.00 | 2026-09-01 00:00:00 |       0
           1 | 2026-09-20 12:00:00 |          5 |          55.00 | 2026-09-15 00:00:00 |       0
           2 | 2026-09-05 08:00:00 |            |                |                     |       1
```

The 20 September example gets the 15 September values, not the later 1 October values. Customer 2's example precedes any feature row, so it gets nulls rather than a value from the future. A plain join on `customer_id` to the latest values would have given every example `orders_30d = 9`, leaking the future.

Two subtleties to mention:

- **Availability time versus event time.** A daily feature for 15 September computed at 03:00 on 16 September was not available to a model at noon on 15 September. Store the time the value became available, or shift `feature_ts` by the pipeline's delay, so training matches what serving could have seen.
- **Scale**: at a billion rows, the as-of join is done in Spark by sorting both sides by entity and time within partitions, or by a range join on time buckets, rather than a correlated subquery.

## Data model and storage layout

- **Offline store**: one table per feature view: `(entity_key, feature_ts, created_ts, feature columns)`, partitioned or clustered by date and entity. Append-only, so history is never overwritten; `created_ts` breaks ties when a backfill rewrites a timestamp.
- **Online store**: key `<feature_view>:<entity_key>`, value a compact record of the latest features plus `feature_ts`, with a TTL equal to the feature's freshness limit so stale values expire rather than mislead.
- **Composite entities** (customer and merchant) use a concatenated key.
- **Registry metadata**: owner, description, type, freshness SLA, PII tag, upstream tables, downstream models.

## Streaming features

Streaming features (counts in the last 10 minutes) must be defined so the **same logic** produces offline history and online values:

- Run the streaming job once and have it write both stores; for history before the job existed, run the same transformation in batch over the event archive (Spark can run the same Structured Streaming logic as a batch query).
- Use event time and watermarks so replays produce the same values as live processing.
- Writes are idempotent upserts keyed by entity and window, so a restart from checkpoint does not double count.
- Push the latest value to the online store on every update, or on a short cadence if write volume is too high.

## Backfills

A new feature needs history for training. The batch definition runs over the historical source data (for example two years of orders) in date-partitioned chunks, writing to the offline store with the correct historical `feature_ts`. Backfills run in a separate compute pool, are idempotent per partition (overwrite that partition), and never touch the online store, which only needs current values.

## Online serving

- Choose the online store by latency, scale and operations: Redis for the lowest latency (memory cost), DynamoDB or Bigtable for managed scale, Cassandra for self-managed multi-region.
- Batch reads: fetch all features for an entity in one call; for multiple entities, pipeline or batch-get requests.
- Co-locate serving with the model service and the store in the same region and zone set.
- Missing or expired values return explicit nulls, and models are trained to handle them.

## Preventing and detecting skew

- One definition in the registry computes both offline and online values.
- Log served feature vectors (sampled for most models, fully for critical ones) and compare them daily with offline values for the same entities and times. Alert on mismatch rates.
- Compare distributions (mean, null rate, quantiles) of training data and served features to catch drift and broken pipelines.

## Governance and security

- Owners and descriptions are mandatory at registration; CI rejects features without them.
- Personal-data features are tagged and access-controlled per feature view; deletion requests remove entity rows from both stores.
- Deprecation process: features unused by any registered model for 90 days are flagged for removal.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Batch materialisation fails | Online values age past TTL | Values expire to null; alert on freshness; rerun is idempotent |
| Streaming job down | Real-time features stale | Restart from checkpoint; models see `feature_ts` age and fall back |
| Online store outage | Inference cannot fetch features | Multi-AZ store; model fallback to defaults or a simpler model |
| Backfill writes wrong history | Training on bad data | Offline tables are versioned; time travel to the previous version; rerun |
| Definition change | Online and offline diverge | Changes create a new feature version; old version kept for existing models |

## Scaling to 10×

At 200,000 reads per second, shard the online store and cache hot entities in the serving process. Materialisation must become incremental (only entities whose inputs changed). Point-in-time joins over 10 billion rows need pre-sorted, clustered offline tables and bucketed time joins. Split the registry by domain with shared conventions so teams are not blocked on one central review.

## Monitoring and SLAs

- Freshness per feature view against its SLA; materialisation success and duration.
- Online store latency p99, error rate and hit rate (missing keys).
- Online/offline parity mismatch rate per feature.
- Distribution drift between training and serving.
- Usage: which models read which features.

## Capacity estimate

- **Online store size**: 50 million customers × 300 customer features × about 8 bytes ≈ 120 GB, plus 5 million items × 200 features × 8 bytes ≈ 8 GB. With key and storage overhead, roughly 250–300 GB: a modest Redis cluster with replicas or a managed key-value table.
- **Online reads**: 20,000 vectors/s; if each vector needs 3 feature-view lookups, 60,000 key reads/s.
- **Batch writes**: refreshing 50 million customers daily ≈ 580 upserts/s on average, done in bulk within a materialisation window of an hour (about 14,000/s).
- **Offline store**: 50 million rows/day per daily customer view × about 100 bytes compressed ≈ 5 GB/day per view; 200 views is up to 1 TB/day if all were daily per entity, so many views should store only changed entities.
- **Training sets**: a 1-billion-row as-of join over a few feature views is a large but routine Spark job when both sides are clustered by entity and time.

## What a strong answer includes

- The **two problems** a feature store solves: skew and point-in-time leakage.
- **Offline and online stores** with the reasons for each, written by the same pipelines.
- A worked explanation of the **as-of join**, including TTL and availability time.
- **Streaming features** with event time and idempotent writes.
- **Backfills** that are idempotent and separate from serving.
- **Parity monitoring** using logged served vectors.
- **Governance**: owners, PII tags, versioning and deprecation.

## Common mistakes

- Describing a feature store as "a database of features" without the point-in-time join.
- Joining latest feature values to historical labels.
- Reimplementing streaming feature logic separately for training in SQL.
- No TTL, so a broken pipeline serves months-old values as if current.
- Changing a feature definition in place and silently changing inputs to deployed models.
- Building a feature store for two batch models that would be fine with well-modelled tables.

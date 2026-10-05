---
title: "Design a Recommendation Data Pipeline"
description: "A system-design case study for the data side of recommendations: impression logging, training labels, features, embeddings, candidate indexes, serving and feedback."
technology: ["data-engineering", "spark", "kafka"]
topic: ["recommendations", "machine-learning", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "An online marketplace wants personalised product recommendations on the home page, product pages and in emails. Design the data pipelines that collect user interactions, build training data and features, produce candidate and ranked recommendations, serve them with low latency, and measure whether they work."
functionalRequirements:
  - "Log impressions (what was shown, where, by which model) and interactions (clicks, add-to-cart, purchases)"
  - "Build labelled training datasets from impressions and outcomes, point-in-time correct"
  - "Compute user, item and context features in batch and near real time"
  - "Train embedding models and build an approximate-nearest-neighbour index for candidate retrieval"
  - "Serve recommendations for web and app requests and produce batch recommendations for email"
  - "Support A/B tests and report online metrics per model version"
nonFunctionalRequirements:
  - "Online recommendation response under 100 ms at p99"
  - "New interactions influence recommendations within minutes for session-based features"
  - "Item catalogue changes (new, out-of-stock, delisted) reflected within 15 minutes"
  - "Training data reproducible: any model can be retrained on the same snapshot"
  - "Respect user privacy choices and exclude restricted items"
scaleAssumptions:
  - "Assumption: 20 million monthly active users, 5 million daily"
  - "Assumption: 2 million items in the catalogue"
  - "Assumption: 1 billion impressions and 50 million clicks per day"
  - "Assumption: 3,000 recommendation requests per second at peak"
architectureSummary: "Clients and services log impressions and interactions to Kafka with a shared request id; a lakehouse stores them and daily jobs join impressions to outcomes to create labels. Batch and streaming jobs compute features into offline and online stores. A two-tower model produces user and item embeddings; item embeddings populate an ANN index. At request time the service retrieves candidates from the index and other sources, filters them, ranks them with a ranking model using online features, logs what it showed, and returns results."
technologies:
  - "Kafka for impression and interaction events"
  - "Lakehouse (Delta Lake or Iceberg) and Spark for labels, features and training sets"
  - "Flink or Spark Structured Streaming for session features"
  - "Feature store with offline and online stores"
  - "ANN index: FAISS or ScaNN library, or a vector database"
  - "Low-latency key-value store for precomputed recommendations"
tradeoffs:
  - decision: "Two-stage retrieval then ranking"
    alternative: "Score every item for every request"
    reason: "Scoring 2 million items per request is impossible in 100 ms; retrieval cuts to a few hundred candidates cheaply"
    consequence: "Two models and an index to maintain; items missed by retrieval can never be ranked"
  - decision: "Log impressions with request id and model version"
    alternative: "Train only on clicks and purchases"
    reason: "Without impressions there are no negatives and no way to correct for position or attribute results to a model"
    consequence: "Impressions are the largest dataset in the system"
  - decision: "Hybrid serving: precomputed for email and cold paths, real-time ranking for web"
    alternative: "Everything precomputed nightly"
    reason: "Session behaviour changes intent within minutes; email does not need real time"
    consequence: "Two serving paths to operate and keep consistent"
  - decision: "ANN library inside the recommendation service"
    alternative: "Managed vector database"
    reason: "Very low latency and no extra network hop for a single, rebuilt-daily index"
    consequence: "Index rebuild and rollout are your problem; a vector database is easier when filters and frequent updates matter"
  - decision: "Point-in-time feature joins for training"
    alternative: "Join current feature values to historical impressions"
    reason: "Avoids leaking future information into training, which inflates offline metrics"
    consequence: "Needs timestamped feature history and as-of joins"
interviewFollowUps:
  - "Why do you need impressions, and what goes in an impression record?"
  - "How do you label an impression as positive or negative?"
  - "How do you handle a brand-new item with no interactions?"
  - "Offline metrics improved but the A/B test shows no gain. What could be wrong in the data?"
  - "How do you stop out-of-stock items being recommended?"
  - "How do you avoid the model only ever recommending what it already recommended?"
related:
  - "articles:pyspark/window-functions"
  - "articles:pyspark/joins-and-join-strategy"
  - "articles:etl-elt/batch-vs-streaming"
  - "system-designs:fraud-detection-pipeline"
  - "system-designs:customer-360-platform"
previous: "system-designs:fraud-detection-pipeline"
versionContext: "The labelling SQL was run on PostgreSQL 16; at scale the same logic runs in Spark SQL. Other components are described, not executed."
sources:
  - { label: "Feast: point-in-time joins", url: "https://docs.feast.dev/getting-started/concepts/point-in-time-joins" }
  - { label: "Feast: feature retrieval", url: "https://docs.feast.dev/getting-started/concepts/feature-retrieval" }
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Spark SQL performance tuning", url: "https://spark.apache.org/docs/latest/sql-performance-tuning.html" }
---

## Approach

In an interview for a data engineer, the model architecture matters less than the **data that feeds it**: what you log, how you turn logs into labels, how features stay consistent between training and serving, and how results reach users fast. Clarify:

- **Surfaces**: home page, "similar items" on product pages, cart, email? Each has different latency and freshness needs.
- **Objective**: clicks, purchases, revenue, long-term retention? This decides labels.
- **Catalogue dynamics**: how fast do items appear, sell out, change price?
- **Scale**: users, items, requests per second.
- **Constraints**: business rules (no out-of-stock, no restricted items for minors), diversity, sponsored placements.
- **Experimentation**: is there an A/B testing platform, and what metrics decide a launch?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Event logging</strong>: the recommendation service logs an impression per item shown (request id, user, item, position, surface, model version, scores); clients log clicks, add-to-cart and purchases with the same request id. All go to Kafka.</li>
<li><strong>Lakehouse</strong>: events land in bronze tables; silver tables deduplicate and join catalogue and user data.</li>
<li><strong>Labels and training sets</strong>: daily Spark jobs join impressions to outcomes within an attribution window and add point-in-time features.</li>
<li><strong>Features</strong>: batch features (item popularity, user category affinities) and streaming session features (items viewed in the last 30 minutes) are written to offline and online stores.</li>
<li><strong>Models and index</strong>: a retrieval model produces item embeddings, loaded into an ANN index; a ranking model is trained on labelled impressions; both are versioned in a registry.</li>
<li><strong>Serving</strong>: retrieve a few hundred candidates (ANN, co-purchase lists, trending), filter by business rules and stock, rank with online features, re-rank for diversity, log impressions, return results.</li>
</ol>
<figcaption>The data loop: what is shown is logged, outcomes become labels, labels train the next models, and models decide what is shown.</figcaption>
</figure>

A user opens the app. The recommendation service reads the user's embedding and session features, asks the ANN index for the 500 nearest items, adds 100 trending items and 100 items co-purchased with the cart contents, removes out-of-stock and already-purchased items, ranks the rest with the ranking model, takes the top 20 with a diversity constraint, and logs 20 impressions with request id `r-77` and model `rank-v12`. The user clicks item 3, and the client logs a click with `r-77`. That night, the label job marks that impression positive and the other 19 negative.

## Event logging: the foundation

Most recommendation data problems are logging problems:

- **Impressions are mandatory.** A click only means something relative to what was shown. Impressions provide negatives, position information and model attribution.
- **Shared request id** between impression and interaction events makes joins exact; joining on user and item within a time window is ambiguous when the same item is shown twice.
- **Log what the model saw**: model version, candidate source, score, and ideally the feature vector or a reference to it.
- **Viewability**: an item rendered below the fold was not really seen. Log visibility events or approximate by position.
- **Schema contracts** across web, iOS and Android, with validation at ingestion; mobile clients send late batches, so keep event time and ingestion time.

## Labels and training data

Labelling turns impressions into examples. The example below (PostgreSQL 16; the same SQL runs in Spark) marks an impression positive if a click on it arrived within 30 minutes. Duplicate click events do not create duplicate rows because the label uses `EXISTS`.

```sql
CREATE TABLE impressions (
  impression_id TEXT PRIMARY KEY,
  user_id       INT,
  item_id       INT,
  position      INT,
  model_version TEXT,
  shown_at      TIMESTAMP
);
CREATE TABLE clicks (
  impression_id TEXT,
  clicked_at    TIMESTAMP
);
INSERT INTO impressions VALUES
  ('i1', 7, 101, 1, 'v12', '2026-10-01 10:00'),
  ('i2', 7, 102, 2, 'v12', '2026-10-01 10:00'),
  ('i3', 7, 103, 3, 'v12', '2026-10-01 10:00'),
  ('i4', 8, 101, 1, 'v12', '2026-10-01 11:00');
INSERT INTO clicks VALUES
  ('i1', '2026-10-01 10:01'),
  ('i1', '2026-10-01 10:01'),   -- duplicate click event
  ('i3', '2026-10-01 11:30'),   -- outside the 30-minute attribution window
  ('i4', '2026-10-01 11:05');

SELECT i.impression_id, i.user_id, i.item_id, i.position,
       CASE WHEN EXISTS (
         SELECT 1 FROM clicks c
         WHERE c.impression_id = i.impression_id
           AND c.clicked_at >= i.shown_at
           AND c.clicked_at <  i.shown_at + INTERVAL '30 minutes'
       ) THEN 1 ELSE 0 END AS label
FROM impressions i
ORDER BY i.impression_id;
```

```text
 impression_id | user_id | item_id | position | label
---------------+---------+---------+----------+-------
 i1            |       7 |     101 |        1 |     1
 i2            |       7 |     102 |        2 |     0
 i3            |       7 |     103 |        3 |     0
 i4            |       8 |     101 |        1 |     1
```

Design points to discuss:

- **Attribution window**: clicks within minutes; purchases within days. Purchase labels are only final after the window closes, so the training job waits for it (a "label delay").
- **Position bias**: items at position 1 get clicked more regardless of relevance. Log position, include it as a training feature (set to a constant at serving), or use randomised exploration traffic to estimate the bias.
- **Point-in-time features**: join each impression to feature values as of `shown_at`. Joining today's popularity to last month's impressions leaks the future and makes offline metrics look better than reality.
- **Sampling**: billions of negatives per day are more than needed; down-sample negatives and record the sampling rate so predictions can be calibrated.
- **Reproducibility**: write each training set as a versioned table (a Delta or Iceberg snapshot) and record its version in the model registry.

## Features

| Family | Examples | Computed | Freshness |
|---|---|---|---|
| Item | Popularity by day, price, category, embeddings, stock | Batch + catalogue CDC | Hourly; stock within minutes |
| User | Category affinities, price sensitivity, long-term embedding | Batch | Daily |
| Session | Items viewed and added in the last 30 minutes | Streaming | Seconds to a minute |
| Context | Time of day, device, surface | Request | Real time |
| Cross | User's past interactions with this item's brand | Batch | Daily |

A feature store keeps the definitions in one place, computes them once, writes both the offline (history for training) and online (latest value for serving) stores, and provides as-of joins. That is the main defence against training-serving skew.

## Candidate generation and the index

- **Embedding retrieval**: a two-tower model maps users and items into the same vector space. Item vectors are computed in batch and loaded into an ANN index (FAISS, ScaNN, or a vector database). The user vector is computed at request time from features.
- **Other sources**: co-purchase and co-view lists (computed in Spark from interaction pairs), trending items, and editorial lists. Mixing sources protects against a single model's blind spots.
- **Index lifecycle**: rebuild daily (or more often), validate recall on a held-out set, then roll out with a version switch so a bad index can be rolled back. New items need vectors before they can be retrieved: compute them from content features (title, category, image) for cold start.

## Serving

- **Online path (web and app)**: candidates, filters, ranking and re-ranking in under 100 ms. Online features come from a key-value store in parallel reads; the ranking model scores a few hundred candidates in a batch.
- **Precomputed path (email, fallback)**: a nightly Spark job ranks candidates for every active user and writes the top N to a key-value store and to the email platform.
- **Fallbacks**: if the ranking service times out, return precomputed recommendations; if those are missing (new user), return popular items for the context.
- **Business rules last**: stock, legal restrictions and user blocks are applied after ranking as hard filters, using fresh catalogue data from CDC.

## Feedback loops and evaluation

- Recommendations shape the data used to train the next model. Reserve a small share of traffic for exploration (randomised or diversified results) so the model learns about items it would not otherwise show.
- **Offline metrics** (recall@k, NDCG) on a time-based holdout guide development; **online A/B tests** decide launches. The impression log's `model_version` and experiment assignment are what make the online analysis possible.
- If offline gains do not appear online, suspect the data first: leakage in training features, skew between offline and online feature computation, or label windows that do not match the business metric.

## Privacy

Respect opt-outs of personalisation (serve non-personalised popular items), avoid sensitive inferred categories, minimise identifiers in logs, and include impression and feature data in erasure processes. Embeddings derived from a user's behaviour are personal data too.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Client stops sending impressions after an app release | Labels vanish or skew | Volume checks per platform and version block training |
| Catalogue feed delayed | Out-of-stock items recommended | Stock filter uses CDC with freshness alert; fail safe by hiding items with stale stock |
| Bad index or model rolled out | Poor or empty results | Versioned rollout, automatic rollback on click-through drop or empty-result rate |
| Streaming session features down | Less relevant results | Ranking model handles missing session features; alert |
| Training data leakage | Offline metrics too good to be true | Point-in-time joins and time-based validation |

## Scaling to 10×

At 10 billion impressions a day, impression storage and label joins dominate: partition by date and hour, cluster by request id, and process labels incrementally per hour. Shard the ANN index or move to a distributed vector service. Cache recommendations per user for a short time to cut ranking cost. Keep negative sampling aggressive in training data.

## Monitoring and SLAs

- Logging health: impressions and clicks per platform and app version; join rate between clicks and impressions.
- Feature freshness and missing-value rates, online versus offline feature distribution comparisons.
- Serving: latency, fallback rate, empty-result rate, candidate-source mix.
- Business: click-through and conversion per surface and model version.

## Capacity estimate

- **Impressions**: 1 billion/day × about 300 bytes ≈ 300 GB/day raw ≈ 110 TB/year; compressed columnar storage is several times smaller.
- **Clicks**: 50 million/day, small in comparison.
- **Training data**: with a 5% click rate and negatives sampled at 10%, a day yields about 50 million positives plus 95 million sampled negatives ≈ 145 million rows.
- **Index**: 2 million items × 128-dimensional float32 vectors = 2 × 10⁶ × 128 × 4 bytes ≈ 1 GB, small enough to hold in memory on every serving instance.
- **Online features**: 5 million daily users × 2 KB ≈ 10 GB; 2 million items × 1 KB ≈ 2 GB.
- **Serving**: 3,000 requests/s × 500 candidates ≈ 1.5 million ranking scores per second, spread across a horizontally scaled ranking service.
- **Precomputed**: 20 million users × 50 items × 8 bytes ≈ 8 GB written nightly.

## What a strong answer includes

- **Impression logging** with request id, position and model version, and why it is essential.
- **Labelling** with attribution windows and label delay.
- **Point-in-time features** and a feature store to prevent skew.
- A **two-stage** retrieval and ranking design with an ANN index and multiple candidate sources.
- **Hybrid serving** with fallbacks and fresh business filters.
- **Feedback loops**: exploration, position bias and A/B attribution.
- **Data-quality checks** on logging, which break more often than models.

## Common mistakes

- Training on clicks alone without impressions.
- Joining current feature values to historical events.
- Random train/test splits instead of time-based ones.
- Recommending out-of-stock or delisted items because filters use a daily snapshot.
- No fallback path, so a ranking timeout shows an empty carousel.
- Ignoring position bias and then rediscovering that the top slot always wins.
- Forgetting cold start for new items and new users.

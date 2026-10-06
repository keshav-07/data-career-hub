---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Social Media Feed Analytics System"
description: "A system-design case study for feed analytics: impression and engagement events, viewability rules, deduplication, creator dashboards, distinct counts and privacy."
technology: ["data-engineering", "kafka", "spark"]
topic: ["analytics", "streaming", "architecture"]
tags: ["feed-analytics", "impressions", "engagement", "hyperloglog", "creator-analytics", "bot-filtering"]
difficulty: "Advanced"
problem: "Design the analytics system for a social app's feed: collect impressions and engagements (likes, comments, shares, watch time) on posts, and give creators near-real-time post statistics, give product teams daily engagement and ranking-quality metrics, and give the ranking team clean training data."
functionalRequirements:
  - "Collect impression, viewability and engagement events from mobile and web clients"
  - "Show creators per-post reach, impressions, engagements and engagement rate, updated within minutes"
  - "Provide daily and weekly product metrics: daily active users, feed sessions, time in feed, engagement per session"
  - "Produce labelled training data (impression joined to engagement outcome) for the ranking models"
  - "Filter bots and invalid traffic from all reported numbers"
nonFunctionalRequirements:
  - "Creator statistics no more than 5 minutes behind; daily metrics by 06:00 UTC"
  - "Creator numbers never decrease visibly without explanation, and match the daily batch within a small tolerance"
  - "Counts deduplicated across client retries and offline uploads"
  - "Withdrawals of consent and account deletions removed from analytics within the policy period"
  - "Cost per billion events tracked and kept within budget"
scaleAssumptions:
  - "Assumption: 100 million daily active users, 200 impressions each, so 20 billion impressions a day"
  - "Assumption: about 1 billion engagements a day"
  - "Assumption: 300 bytes per event after batching and compression on the client"
  - "Assumption: 50 million posts receive at least one impression on a given day"
architectureSummary: "Clients batch events and send them to a collection gateway that writes to Kafka. A streaming job validates, deduplicates by client event id, applies viewability rules and bot signals, and maintains per-post running counters (exact for impressions and engagements, approximate sketches for unique reach) in a serving store for creator dashboards. Raw and cleaned events land in lakehouse tables; daily batch jobs recompute exact metrics, correct the streaming numbers and build training datasets."
technologies: ["Client SDK with batching and event ids", "Collection gateway", "Apache Kafka", "Spark Structured Streaming or Flink", "Lakehouse tables (Delta Lake or Iceberg)", "Serving store for counters (key-value or real-time OLAP)", "Approximate distinct-count sketches (HyperLogLog)", "Orchestrator and warehouse for daily metrics"]
tradeoffs:
  - decision: "Approximate unique reach with HyperLogLog sketches in real time"
    alternative: "Exact distinct viewer sets per post"
    reason: "Sketches take a few kilobytes per post and merge across time and dimensions; exact sets for viral posts take gigabytes"
    consequence: "Real-time reach has a small relative error; the daily batch publishes exact reach"
  - decision: "Viewability threshold for counted impressions"
    alternative: "Count every render"
    reason: "Posts scrolled past in milliseconds were not seen; viewable impressions measure real exposure"
    consequence: "Clients must measure visible time and area, and the definition must be documented"
  - decision: "Streaming numbers corrected by a daily batch"
    alternative: "Streaming as the only source of truth"
    reason: "Batch can apply late events, late bot verdicts and exact distinct counts"
    consequence: "Two code paths with shared definitions; small visible corrections"
  - decision: "Client-generated event ids for deduplication"
    alternative: "Deduplicate on (user, post, timestamp)"
    reason: "Retries resend exactly the same event; tuples collide or differ across retries"
    consequence: "SDK changes across all clients; old app versions need a fallback rule"
  - decision: "Pre-aggregate creator statistics by post and hour"
    alternative: "Query raw events on demand"
    reason: "Millions of creators refreshing dashboards would scan billions of rows"
    consequence: "New breakdowns need new aggregates"
interviewFollowUps:
  - "A post goes viral with 200 million impressions in an hour. Which parts of your system feel it?"
  - "Why can't you add up daily unique viewers to get weekly unique viewers?"
  - "A creator complains their view count dropped overnight. What happened and how do you explain it?"
  - "How do you build training labels when engagements arrive minutes after impressions?"
  - "How do you detect and remove bot engagement after it has been counted?"
  - "How would you add a breakdown of reach by viewer country without blowing up storage?"
related:
  - "system-designs:clickstream-data-platform"
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:a-b-testing-data-pipeline"
  - "articles:spark/partitions-shuffles-skew"
  - "articles:sql/aggregations-group-by-having"
  - "interview-questions:sql/remove-duplicate-records"
versionContext: "The metric SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Streaming and sketch behaviour is described conceptually; check your engine's documentation for its approximate distinct functions."
sources:
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
  - { label: "Delta Lake: table streaming reads and writes", url: "https://docs.delta.io/delta-streaming/" }
  - { label: "PostgreSQL 16: WITH queries", url: "https://www.postgresql.org/docs/16/queries-with.html" }
previous: "system-designs:ride-hailing-surge-pricing-pipeline"
next: "system-designs:video-streaming-analytics-pipeline"
---

## Approach

Feed analytics combines a very high event volume with metrics people argue about. The core design decisions are **definitions** (what is an impression? what is reach?), **deduplication and invalid-traffic filtering**, **distinct counting at scale**, and the **split between fast approximate numbers and slower exact ones**. Everything else (ingestion, storage, dashboards) follows from those.

Clarifying questions:

- **Audiences**: creators, internal product teams, advertisers, the ranking team? Each needs different freshness and accuracy.
- **Definitions**: impression on render or when viewable? Reach per day, per post lifetime? Does a repeat view count?
- **Freshness**: minutes for creators, daily for product reporting?
- **Accuracy**: are approximate unique counts acceptable in real time?
- **Volume** and the shape of the distribution: how viral can a single post get?
- **Privacy**: consent, minimum audience sizes for breakdowns, deletion obligations.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Client SDK</strong>: records impressions (with visible time and area), engagements and session events, each with a unique event id; batches and compresses them; retries until acknowledged.</li>
<li><strong>Collection gateway</strong>: authenticates, attaches server receive time, applies coarse rate limits and writes to Kafka topics keyed by post id (impressions, engagements).</li>
<li><strong>Streaming job</strong>: validates schema, deduplicates by event id within a watermark, applies viewability rules and real-time bot signals.</li>
<li><strong>Real-time aggregates</strong>: per post and hour, exact counters for impressions and engagements, plus HyperLogLog sketches for unique viewers, upserted into a serving store.</li>
<li><strong>Lakehouse</strong>: raw events (bronze) and cleaned events (silver) partitioned by event date and hour.</li>
<li><strong>Daily batch</strong>: recomputes exact metrics with late events and late bot verdicts, overwrites the serving aggregates for closed days, builds product metric tables and ranking training data.</li>
<li><strong>Consumers</strong>: creator dashboard API, BI dashboards, ranking model training jobs.</li>
</ol>
<figcaption>Fast approximate numbers for creators, exact corrected numbers from batch, one set of definitions shared by both.</figcaption>
</figure>

Walkthrough:

1. **The SDK decides data quality.** It measures viewability on the device (for example at least half of the post on screen for at least one second; choose and document a rule), assigns an event id once, and stores unsent events on the device so offline sessions upload later.
2. **Keying by post id** sends all events for a post to one partition, which keeps aggregation local. It also creates hot partitions for viral posts, discussed below.
3. **The streaming job** is the single place where definitions are applied in real time. The batch job imports the same definition code or SQL, so the two paths do not drift.
4. **Serving aggregates** are small: one row per (post, hour) with counters and a sketch. A creator's dashboard sums hours and merges sketches.
5. **The daily batch** is the source of truth for anything that is reported externally or used for decisions.

## Definitions as code

Write the metric definitions down and test them. A small example in PostgreSQL: impressions only count if visible for at least one second, and both impressions and engagements count once per viewer, post and day.

```sql
CREATE TABLE impressions (viewer_id int, post_id int, shown_at timestamp, visible_ms int);
CREATE TABLE engagements (viewer_id int, post_id int, action text, acted_at timestamp);

INSERT INTO impressions VALUES
  (1, 500, '2026-09-01 08:00:00', 2400), (1, 500, '2026-09-01 08:00:05', 3100),
  (2, 500, '2026-09-01 08:01:00',  300), (3, 500, '2026-09-01 09:00:00', 1500),
  (4, 500, '2026-09-01 09:30:00', 5000), (1, 501, '2026-09-01 08:02:00', 1200),
  (2, 501, '2026-09-01 08:03:00', 2200);
INSERT INTO engagements VALUES
  (1, 500, 'like',  '2026-09-01 08:00:10'), (1, 500, 'like', '2026-09-01 08:00:11'),
  (4, 500, 'share', '2026-09-01 09:31:00'), (2, 501, 'comment', '2026-09-01 08:04:00');

WITH viewable AS (
  SELECT DISTINCT viewer_id, post_id, shown_at::date AS day
  FROM impressions
  WHERE visible_ms >= 1000
), engaged AS (
  SELECT DISTINCT viewer_id, post_id, action, acted_at::date AS day
  FROM engagements
)
SELECT v.post_id, v.day,
       count(DISTINCT v.viewer_id) AS reach,
       (SELECT count(*) FROM engaged e WHERE e.post_id = v.post_id AND e.day = v.day) AS engagements,
       round((SELECT count(*) FROM engaged e WHERE e.post_id = v.post_id AND e.day = v.day)::numeric
             / count(DISTINCT v.viewer_id), 3) AS engagement_rate
FROM viewable v
GROUP BY v.post_id, v.day
ORDER BY v.post_id;
```

```text
 post_id |    day     | reach | engagements | engagement_rate
---------+------------+-------+-------------+-----------------
     500 | 2026-09-01 |     3 |           2 |           0.667
     501 | 2026-09-01 |     2 |           1 |           0.500
```

For post 500, viewer 2's 300 ms impression is not viewable, viewer 1's two impressions count once, and the double "like" (a client retry or a double tap) counts once. Without these rules post 500 would report 5 impressions and 3 engagements; both answers are "correct" for some definition, which is exactly why the definition must be explicit and shared.

## Distinct counts at scale

**Reach** (unique viewers) is the expensive metric:

- Distinct counts **do not add up**: daily reach for Monday plus Tuesday double-counts people who saw the post on both days. Weekly reach must be computed from the underlying viewers or from mergeable sketches.
- **HyperLogLog** sketches estimate cardinality with a small, fixed memory footprint (kilobytes) and a relative error that depends on the sketch size (often around 1 to 2%). Crucially, two sketches can be merged into the sketch of the union, so hourly sketches roll up to days and weeks correctly.
- Store sketches in the serving store per (post, hour) for real time, and compute exact daily reach in batch for the official number.

## Ingestion, hot keys and backpressure

- A viral post concentrates millions of events per minute on one Kafka partition and one aggregation task. Mitigate with **two-stage aggregation**: add a salt (for example `hash(event_id) % 16`) to the key for the first aggregation, then combine the 16 partial results per post. Apply salting only to posts detected as hot to keep normal traffic simple.
- Clients batch events (for example every 30 seconds or 50 events), which cuts request rate and lets the gateway write larger Kafka batches.
- If the streaming job falls behind, creator dashboards lag but nothing is lost; Kafka retention must cover the longest expected catch-up.

## Late data and corrections

- **Offline uploads**: phones send events hours or days late. The streaming job accepts events within its watermark (for example 2 hours) for real-time counters; everything else still lands in the lakehouse and is included by the daily batch.
- **Late bot verdicts**: fraud systems often decide hours later that an account was a bot. The batch removes that account's events and recomputes affected posts.
- **Explaining corrections**: creators notice when numbers drop. Keep corrections small (filter obvious bots in real time) and show "numbers for the last 48 hours are preliminary".

## Training data for ranking

The ranking team needs each impression labelled with its outcome (engaged within N minutes or not). This is a delayed join:

- Join impressions to engagements on (viewer, post) where the engagement happens within, say, 30 minutes after the impression.
- In batch this is straightforward; in streaming it needs a stream-stream join with a watermark of at least the label window.
- Record the **features the ranker used at serving time** with the impression (or a reference to them), so training does not suffer from features computed later with information the model did not have.

## Data model and storage layout

| Table | Grain | Partitioning |
|---|---|---|
| `bronze.feed_events` | One row per received event | Event date and hour |
| `silver.impressions` | One deduplicated, viewable impression | Event date; cluster by post id |
| `silver.engagements` | One deduplicated engagement | Event date; cluster by post id |
| `agg.post_hourly` | Post × hour: impressions, engagements by type, reach sketch | Date |
| `agg.post_daily_exact` | Post × day: exact reach and counts | Date |
| `metrics.daily_product` | Day × platform × country: DAU, sessions, time in feed | Date |
| `ml.impression_labels` | Impression with features reference and label | Date |

## Data quality

- Event volume per client version and platform; a new app release that halves impressions is a logging bug.
- Duplicate rate (events dropped by event-id dedup) and the share of non-viewable impressions.
- Batch versus streaming difference per day: alert if creator counts differ by more than the expected correction rate.
- Bot-filter rate per region; sudden spikes suggest an attack or a broken rule.

## Security and privacy

- Viewer-level data is personal data: keep it in restricted silver tables with retention limits. Creator dashboards show aggregates only.
- Apply **minimum thresholds** to breakdowns (for example no country breakdown for fewer than 100 viewers) so individuals cannot be identified.
- Account deletion and consent withdrawal remove the user's events from silver and labels tables, then recompute affected aggregates.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Streaming job down | Creator stats stale | Restart from checkpoint; Kafka retention covers the gap |
| Bad SDK release logs duplicate impressions | Inflated counts | Event-id dedup catches retries; for new-id duplicates, filter by client version and recompute in batch |
| Hot post overwhelms a task | Lag on one partition | Salted two-stage aggregation for hot keys |
| Bot attack inflates a post | Fake reach | Real-time filters plus batch correction |
| Sketch store lost | Real-time reach missing | Rebuild from silver for recent hours |

## Monitoring and SLAs

- Creator stats freshness (event time of the latest counted event per partition).
- Kafka lag; streaming batch duration; state size of the dedup store.
- Daily batch completion versus 06:00; row counts and metric deltas versus the previous day.
- Cost per billion events across gateway, Kafka, streaming, storage and batch.

## Cost

Volume is the cost driver. Batch and compress on the client, keep bronze retention short, store silver in columnar format sorted by post id (so per-post reads are cheap), and pre-aggregate. Dropping non-viewable impressions from silver (keeping them only in short-lived bronze) can remove a large share of rows.

## Scaling to 10×

At 200 billion impressions a day: sample the lowest-value event types for analytics (keep full data only where exactness is needed), sketch-based reach everywhere except official reporting, and regional collection with regional Kafka clusters feeding a global lakehouse. Hot-key handling becomes the norm rather than an exception.

## Capacity estimate

Assumptions: 20 billion impressions and 1 billion engagements per day, 300 bytes per event on the wire, Parquet compression of about 5:1 on silver, 50 million posts with impressions per day.

- **Ingest rate**: 21 × 10⁹ / 86,400 ≈ 243,000 events/s average; assume 3× at peak ≈ 730,000/s.
- **Raw volume**: 21 × 10⁹ × 300 B ≈ 6.3 TB/day; at 5:1 compression ≈ 1.3 TB/day in silver.
- **Kafka**: with 3 days of retention and replication factor 3: 6.3 TB × 3 × 3 ≈ 57 TB before broker-side compression. Retention is the main Kafka cost lever.
- **Serving aggregates**: 50 million posts × an average of perhaps 5 active hours × (counters plus a 2 KB sketch) ≈ 500 GB/day in the hottest form; compact to daily rows after 48 hours.
- **Dedup state**: event ids held for a 2-hour watermark: 243,000/s × 7,200 s ≈ 1.75 billion ids. At about 16 bytes plus overhead that is tens of GB across the cluster, so use a disk-backed state store, or deduplicate only within shorter windows for low-value events.

## What a strong answer includes

- Explicit, shared definitions of impression, viewability, reach and engagement.
- Client event ids, deduplication and invalid-traffic filtering.
- Mergeable sketches for real-time reach and exact batch numbers for official reporting.
- Hot-key handling for viral posts.
- A streaming plus batch-correction design, with an explanation of how corrections are shown to creators.
- Privacy thresholds and deletion handling.

## Common mistakes

- Adding daily unique counts to get weekly uniques.
- Counting every render as an impression without saying so.
- Deduplicating on timestamps instead of event ids.
- Ignoring skew from viral posts.
- Letting streaming and batch use different definitions.
- Showing small-audience breakdowns that identify individuals.

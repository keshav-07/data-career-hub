---
publishedDate: "2026-10-04"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
title: "Design a Clickstream Analytics Pipeline"
description: "A system-design case study for clickstream analytics: event collection, schema contracts, bot filtering, late mobile events, sessionisation, funnels and privacy."
inventoryId: "SYS-06"
technology: ["data-engineering", "kafka", "spark"]
topic: ["clickstream", "streaming", "architecture"]
difficulty: "Advanced"
problem: "Design a pipeline that collects every page view, click and app interaction from a website and mobile apps, and turns it into reliable product analytics: real-time traffic monitoring, sessions, funnels, retention and attribution, while respecting consent and keeping cost under control."
functionalRequirements:
  - "Collect events from web, iOS and Android clients and server-side services"
  - "Validate events against tracking schemas; route invalid events aside without losing them"
  - "Show near-real-time traffic and conversion dashboards (within a minute)"
  - "Build sessions, user-day activity, funnels and retention tables daily"
  - "Filter bots and internal traffic"
  - "Honour consent and deletion requests"
nonFunctionalRequirements:
  - "Collection endpoint available 99.95% and fast (clients must never wait on it)"
  - "No event loss once acknowledged by the collector; duplicates removed downstream"
  - "Late mobile events (up to 3 days) land in the correct sessions and days"
  - "Daily models ready by 06:00 UTC"
  - "Storage and compute cost grow slower than event volume"
scaleAssumptions:
  - "Assumption: 2 billion events per day, peaks of 60,000 events per second"
  - "Assumption: about 0.5 KB per event as JSON, smaller in Avro or Parquet"
  - "Assumption: 25 million daily active users across web and apps"
  - "Assumption: 2 years of history for analysis, 13 months of raw events"
architectureSummary: "Client SDKs batch events and send them to a stateless collector fleet behind a load balancer; collectors enrich with server time and geo, validate against registered schemas, and produce to Kafka (invalid events to a dead-letter topic). A streaming job writes raw events to a lakehouse bronze table and computes per-minute metrics for live dashboards. A daily batch reprocesses a rolling window to deduplicate, filter bots, apply consent, sessionise and build funnel and retention tables in the warehouse or lakehouse."
technologies:
  - "Client tracking SDKs with a shared tracking plan (schemas)"
  - "Stateless collectors behind a load balancer (or a managed collector such as Snowplow)"
  - "Apache Kafka (or Kinesis) with schema registry"
  - "Spark Structured Streaming or Flink for landing and live metrics"
  - "Delta Lake or Iceberg for raw and modelled tables"
  - "Spark or warehouse SQL (dbt) for daily sessionisation and funnels"
tradeoffs:
  - decision: "Own collector writing to Kafka"
    alternative: "Third-party analytics SDK and vendor storage"
    reason: "Full ownership of raw events, schemas and privacy controls; joins with business data"
    consequence: "You run the collection fleet and SDKs; a vendor is faster to start"
  - decision: "Validate at collection with schemas"
    alternative: "Accept anything and clean later"
    reason: "Tracking bugs are caught within minutes of an app release, not weeks later"
    consequence: "Tracking plan changes need coordination across client teams"
  - decision: "Streaming landing plus daily batch modelling"
    alternative: "Fully streaming sessionisation"
    reason: "Fresh raw data and live metrics, with simple, rerunnable session logic that handles late events"
    consequence: "Sessions are final daily, not live"
  - decision: "Partition by event date, cluster by user id"
    alternative: "Partition by user"
    reason: "Daily processing and date pruning; user lookups use clustering"
    consequence: "Streaming small files need compaction"
  - decision: "Pseudonymous user ids and consent filtering in the pipeline"
    alternative: "Store raw identifiers and filter at query time"
    reason: "Less personal data stored and simpler erasure"
    consequence: "Joins to identified data go through a controlled mapping"
interviewFollowUps:
  - "How do you define and compute a session, and what happens with events after midnight?"
  - "A mobile app sends events three days late. How does that affect yesterday's numbers?"
  - "How do you detect a tracking bug introduced by a new app release?"
  - "How would you filter bots?"
  - "How do you compute a funnel where steps must happen in order within a session?"
  - "How do you honour a user's deletion request in two years of events?"
related:
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:data-warehousing/partitioning-clustering-data-layout"
  - "articles:sql/window-functions"
  - "projects:ecommerce-analytics-platform"
  - "system-designs:gdpr-pii-compliant-pipeline"
  - "system-designs:kafka-ingestion-system"
previous: "system-designs:gdpr-pii-compliant-pipeline"
versionContext: "The sessionisation SQL was run on PostgreSQL 16 (DISTINCT ON is PostgreSQL syntax; Spark SQL would use ROW_NUMBER). Collector and streaming configuration is described, not executed."
sources:
  - { label: "PostgreSQL documentation: window functions", url: "https://www.postgresql.org/docs/current/tutorial-window.html" }
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
  - { label: "Confluent Schema Registry: schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
  - { label: "Delta Lake documentation: optimizations", url: "https://docs.delta.io/latest/optimizations-oss.html" }
---

## Approach

Clickstream data is high-volume, messy and generated by code you do not control (browsers, app versions in the field). The key concerns are **cheap, reliable collection**, **schema discipline across clients**, **late and duplicate events**, **bots**, **privacy**, and then **modelling** sessions and funnels correctly. Ask:

- **Which clients and how many app versions in the field?** Old app versions keep sending old schemas for months.
- **What questions must the data answer?** Live traffic, funnels, retention, attribution, experimentation?
- **Freshness**: live dashboards within a minute, or daily is enough?
- **Consent model**: which events may be collected before consent, and in which regions?
- **Build or buy**: own collection, open-source collector, or a vendor?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Client SDKs</strong> generate an event id and client timestamp, batch events, and send them asynchronously; mobile apps queue events offline and retry.</li>
<li><strong>Collectors</strong> (stateless, autoscaled) add server receive time, IP-derived geo (then drop the IP), validate against the tracking plan, and produce to Kafka; invalid events go to a dead-letter topic.</li>
<li><strong>Kafka</strong> topics keyed by pseudonymous user or device id, so a user's events stay in order per partition.</li>
<li><strong>Streaming job</strong> appends raw events to a bronze table partitioned by event date, and computes per-minute traffic and conversion metrics for live dashboards.</li>
<li><strong>Daily batch</strong> reprocesses the last 3 days: deduplicate, filter bots and internal traffic, apply consent, sessionise, and build user-day, funnel and retention tables.</li>
<li><strong>Consumers</strong>: product analytics in the warehouse or BI tool, experimentation platform, marketing attribution.</li>
</ol>
<figcaption>Collection and landing are continuous; modelling is a daily, rerunnable batch over a rolling window.</figcaption>
</figure>

A user taps "add to basket" in the iOS app on a train with no signal. The SDK stores the event with its event id and client timestamp. Two hours later the phone reconnects and sends a batch of 40 events. The collector stamps the receive time, validates the events (version 7 of the `add_to_cart` schema) and writes them to Kafka. Within seconds they are in bronze under their event date. That night the daily batch reprocesses the last three days, so these late events join the right session, and the funnel table counts the add-to-basket in the correct day.

## Collection

- **Never block the user.** SDKs send asynchronously in batches, with retry and an offline queue on mobile, and drop events beyond a bounded queue size rather than consuming unlimited storage.
- **Event id** generated on the client (UUID) makes retries harmless: duplicates are removed downstream.
- **Two timestamps**: client event time (when it happened, but device clocks drift) and server receive time (reliable, but late for offline events). Keep both; correct obviously wrong client times (in the future, or years ago) using receive time.
- **Collectors are stateless**, behind a load balancer, autoscaled on request rate; they acknowledge the client only after Kafka has acknowledged the write.
- **Server-side events** (orders, payments) come from backend services and are more reliable than client events for business outcomes; use them for revenue, and client events for behaviour.

## Tracking plan and schemas

A **tracking plan** lists every event, its properties, types and owners, stored as schemas in a registry. Collectors validate events; invalid events go to a dead-letter topic with the error and app version. Dashboards per app version show invalid rates, so a release that breaks tracking is noticed within minutes. Schema changes are additive where possible; breaking changes create a new event version, and both versions are modelled until old app versions die out.

## Storage layout

- **Bronze**: raw events, partitioned by event date (and hour for large days), clustered by user id. Keep the original payload plus parsed common columns.
- **Silver**: deduplicated, bot-flagged, consent-filtered events with typed properties.
- **Gold**: `sessions`, `user_day_activity`, `funnel_steps`, `retention_cohorts`, plus aggregated tables for dashboards.
- **File health**: streaming writes produce small files; compact recent partitions hourly or daily.

## Sessionisation

A session is commonly defined as a sequence of a user's events with no gap longer than 30 minutes (a convention, so make it configurable). Window functions do the work: find each event's gap from the previous one, flag gaps over the threshold as new sessions, and take a running sum of the flags as the session number. The example runs on PostgreSQL 16 and also removes a duplicate delivery of event `e2`.

```sql
CREATE TABLE page_views (
  event_id   TEXT,
  user_id    TEXT,
  event_ts   TIMESTAMP,
  page       TEXT
);
INSERT INTO page_views VALUES
  ('e1', 'u1', '2026-10-05 09:00:00', '/home'),
  ('e2', 'u1', '2026-10-05 09:05:00', '/product/42'),
  ('e2', 'u1', '2026-10-05 09:05:00', '/product/42'),
  ('e3', 'u1', '2026-10-05 09:50:00', '/home'),
  ('e4', 'u1', '2026-10-05 09:58:00', '/checkout'),
  ('e5', 'u2', '2026-10-05 10:00:00', '/home');

WITH dedup AS (
  SELECT DISTINCT ON (event_id) * FROM page_views ORDER BY event_id
), flagged AS (
  SELECT *,
         CASE WHEN event_ts - LAG(event_ts) OVER (PARTITION BY user_id ORDER BY event_ts)
                   <= INTERVAL '30 minutes'
              THEN 0 ELSE 1 END AS new_session
  FROM dedup
), numbered AS (
  SELECT *,
         SUM(new_session) OVER (PARTITION BY user_id ORDER BY event_ts) AS session_seq
  FROM flagged
)
SELECT user_id,
       user_id || '-' || session_seq AS session_id,
       min(event_ts) AS session_start,
       max(event_ts) AS session_end,
       count(*)      AS page_views
FROM numbered
GROUP BY user_id, session_seq
ORDER BY user_id, session_start;
```

```text
 user_id | session_id |    session_start    |     session_end     | page_views
---------+------------+---------------------+---------------------+------------
 u1      | u1-1       | 2026-10-05 09:00:00 | 2026-10-05 09:05:00 |          2
 u1      | u1-2       | 2026-10-05 09:50:00 | 2026-10-05 09:58:00 |          2
 u2      | u2-1       | 2026-10-05 10:00:00 | 2026-10-05 10:00:00 |          1
```

The 45-minute gap between 09:05 and 09:50 starts a second session for `u1`, and the duplicate `e2` is counted once. At scale, run this in Spark over a rolling window of dates, partitioned by user, and make the session id deterministic (user plus session start time) so reruns produce the same ids.

**Sessions crossing midnight**: process the previous day's events together with today's when building today's sessions, and assign a session to the date it started. **Cross-device sessions** need identity stitching (login id), which belongs in a Customer 360 step, not in raw sessionisation.

## Late and duplicate events

- Deduplicate on event id within a window wide enough to cover retries (several days).
- Reprocess a **rolling window** (for example the last 3 days) every night, overwriting those partitions in silver and gold, so late mobile events land in the correct day and session.
- Events later than the window are counted in a "late beyond window" metric and folded in by a weekly backfill if material.
- Publish finality: daily metrics are final after D+3.

## Bot and internal traffic

- Known bot user agents and data-centre IP ranges (flag at collection, before the IP is dropped).
- Behavioural rules: implausible event rates, no think time between events, never any interaction events.
- Internal and QA traffic by employee network or test accounts.
- Keep a **flag** rather than deleting, so rules can be revised and history recomputed.

## Funnels and retention

- **Funnel**: for each session, the furthest step reached in order (view product, add to basket, checkout, purchase). Compute with ordered conditions on step timestamps within the session, not with independent counts per step, otherwise users who purchase without passing through earlier tracked steps distort conversion.
- **Retention**: cohort users by first-activity date and compute the share active in later periods from `user_day_activity`.
- Pre-aggregate funnel and retention tables by common dimensions for dashboards.

## Real-time metrics

The streaming job computes per-minute counts (page views, active users approximated with HyperLogLog, add-to-baskets, purchases) by event time with a short watermark, writing to a serving store or table that dashboards poll. These numbers are provisional; the daily batch is the source of truth.

## Privacy

- Collect only what the consent state allows; the SDK reads consent before sending non-essential events, and the pipeline enforces it again.
- Drop IP addresses after deriving coarse geo; pseudonymise user ids with a keyed hash.
- Restrict bronze access; erasure by pseudonymous id across bronze, silver and gold, then purge table history.
- Retain raw events for a limited period (13 months here) and keep only aggregated or anonymised data beyond that.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| App release breaks an event | Missing or invalid events | Invalid-rate alert per app version; fix in next release; model both versions |
| Collector overload at a traffic spike | Dropped requests | Autoscaling, client retry with backoff, load shedding of low-priority events |
| Kafka unavailable | Collectors cannot write | Collectors buffer briefly to local disk, then reject so clients retry |
| Streaming job down | Live dashboards stale | Restart from checkpoint; bronze catches up; daily batch unaffected |
| Bot surge | Inflated traffic | Behavioural rules; flags allow recomputation |
| Clock skew on devices | Events on wrong days | Correction using receive time for implausible client times |

## Scaling to 10×

At 20 billion events a day (about 600,000 events/s at peak): more collector instances and Kafka partitions, binary encoding (Avro or Protobuf) from SDK to collector to cut bandwidth, hourly partitions, and incremental sessionisation that only reprocesses users with new events in the window. Sample low-value event types for analytics while keeping full fidelity for key business events.

## Monitoring and SLAs

- Events received per platform and app version versus baseline; invalid-event rate.
- Collector latency and error rate; Kafka lag; streaming landing delay.
- Late-event distribution (share arriving after 1 hour, 1 day, 3 days).
- Daily model completion time; bot share of traffic.

## Capacity estimate

- **Volume**: 2 billion events × 0.5 KB ≈ 1 TB/day of JSON; average 23,000 events/s, peak 60,000 events/s ≈ 30 MB/s.
- **Kafka**: 1 TB/day × 3 days retention × 3 replicas ≈ 9 TB before compression; with compression around a third of that.
- **Bronze storage**: Parquet with compression is often several times smaller than JSON; assume 200 GB/day, so 200 GB × 365 ≈ 73 TB/year, or about 80 TB for 13 months of raw events.
- **Collectors**: if one instance handles 5,000 requests/s with batched events (assumption, measure in load tests), 60,000 events/s at 10 events per request is 6,000 requests/s, so two instances suffice in theory; run at least three per zone for redundancy and spikes.
- **Daily batch**: reprocessing 3 days ≈ 6 billion events per night; with clustering by user, sessionisation is one shuffle by user id per day, a routine Spark job on a moderately sized cluster.

## What a strong answer includes

- **Non-blocking collection** with event ids, two timestamps and offline retry.
- A **tracking plan with schema validation** and monitoring per app version.
- **Streaming landing plus rolling-window batch** modelling for late data.
- Correct **sessionisation** with window functions and deterministic ids.
- **Bot filtering** with flags, and **funnels** computed in order within sessions.
- **Privacy**: consent, IP dropping, pseudonymous ids, retention, erasure.

## Common mistakes

- Using only client timestamps, or only server timestamps.
- Processing "yesterday" once and never revisiting it when late mobile events arrive.
- Deleting bot traffic instead of flagging it.
- Funnels from independent step counts rather than ordered steps per session.
- Storing IP addresses and raw user ids forever.
- Letting each app team invent event names, so the same action has five spellings.

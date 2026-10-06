---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design an Ad-Bidding Analytics Pipeline"
description: "A system-design case study for real-time bidding data: bid request sampling, win and impression joins, budget pacing, billing-grade spend, fraud filtering and cost."
technology: ["data-engineering", "kafka", "spark"]
topic: ["streaming", "advertising", "architecture"]
tags: ["real-time-bidding", "ad-tech", "budget-pacing", "stream-joins", "deduplication", "invalid-traffic"]
difficulty: "Advanced"
problem: "Design the analytics pipeline for a demand-side platform that bids in real-time ad auctions: log bid requests, bids, wins, impressions, clicks and conversions; give the bidder near-real-time spend for budget pacing; give advertisers campaign reports; and produce billing-grade spend and training data for bid models."
functionalRequirements:
  - "Log bid requests (sampled), bids, win notices, impressions, clicks and conversions with shared ids"
  - "Join the funnel: bid → win → impression → click → conversion within defined windows"
  - "Feed spend per campaign back to the bidder within seconds for budget pacing"
  - "Produce hourly advertiser reports and daily billing-grade spend"
  - "Filter invalid traffic (bots, duplicate notifications) before billing"
  - "Build training datasets for win-rate and click-through prediction"
nonFunctionalRequirements:
  - "Pacing spend signal no more than 10 seconds behind; overspend above budget limited to a small tolerance"
  - "Billing numbers exact, deduplicated and reconcilable with exchange reports"
  - "Bid path latency unaffected by logging (logging is asynchronous and non-blocking)"
  - "Handle traffic peaks of several times the average without losing win or impression events"
  - "User identifiers handled under consent rules and retention limits"
scaleAssumptions:
  - "Assumption: 1 million bid requests per second received from exchanges"
  - "Assumption: the bidder responds to 10% (100,000 bids per second) and wins about 10% of bids (10,000 wins per second)"
  - "Assumption: click-through rate around 0.1% of impressions; conversions much rarer and up to 30 days later"
  - "Assumption: 1 KB per bid request log line, 300 bytes per bid, win, impression or click event"
architectureSummary: "Bidders log asynchronously to Kafka: all bids, wins and impressions in full, bid requests only as a sample plus aggregated counters. A streaming job deduplicates win and impression notifications and aggregates spend per campaign and minute into a low-latency store read by the pacing service. A second stream joins impressions to clicks within a window. Raw events land in the lakehouse; hourly and daily batch jobs build exact, invalid-traffic-filtered reports, reconcile with exchange reports and produce model training data."
technologies: ["Bidder services with async Kafka producers", "Apache Kafka", "Stream processor (Flink or Spark Structured Streaming)", "Low-latency key-value store for pacing counters", "Lakehouse tables", "Batch engine and warehouse for reports", "Real-time OLAP store for advertiser dashboards", "Invalid-traffic detection service"]
tradeoffs:
  - decision: "Sample bid requests; log bids, wins and impressions in full"
    alternative: "Log every bid request"
    reason: "Requests are the largest stream by far and mostly unbid; samples plus counters serve analysis and models"
    consequence: "Rare segments in bid requests are seen only through the sample, with sampling weights"
  - decision: "Separate fast pacing path and exact billing path"
    alternative: "One pipeline for both"
    reason: "Pacing needs seconds and tolerates small error; billing needs exactness and can wait hours"
    consequence: "Two numbers that must be reconciled and explained"
  - decision: "Deduplicate notifications by auction and impression id"
    alternative: "Count every notification received"
    reason: "Exchanges and browsers retry win and impression pixels; duplicates inflate spend"
    consequence: "Deduplication state per id for the retry window"
  - decision: "Windowed stream join for impression to click, batch join for conversions"
    alternative: "Stream join everything"
    reason: "Clicks arrive within minutes; conversions up to 30 days later would need huge state"
    consequence: "Conversion metrics are daily, not real-time"
  - decision: "Budget pacing with a safety margin and per-region spend counters"
    alternative: "Single global counter checked synchronously on every bid"
    reason: "A synchronous global check would add latency to every bid; regional counters with a margin keep bids fast"
    consequence: "Small overspend is possible and must be bounded and absorbed"
interviewFollowUps:
  - "Win notices are sometimes sent twice and sometimes not at all. How does that affect spend?"
  - "How do you stop a campaign overspending its daily budget by 20% during a traffic spike?"
  - "Why might your spend and the exchange's invoice differ, and how do you reconcile them?"
  - "How do you build an unbiased training set for a win-rate model when you only see auctions you bid on?"
  - "How do you attribute a conversion that happens 20 days after an impression?"
  - "How do you keep logging from slowing down a bidder with a 100 ms deadline?"
related:
  - "system-designs:marketing-attribution-pipeline"
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:social-media-feed-analytics-system"
  - "system-designs:kafka-ingestion-system"
  - "articles:etl-elt/idempotency-in-data-pipelines"
versionContext: "The funnel SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Exchange protocols, auction types and notification behaviour vary by exchange and are described generically."
sources:
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
  - { label: "PostgreSQL 16: SELECT (DISTINCT ON)", url: "https://www.postgresql.org/docs/16/sql-select.html" }
previous: "system-designs:geospatial-analytics-pipeline"
---

## Approach

Ad-tech analytics is defined by **volume and money**. Bid requests arrive at a rate few other systems see, most of them worthless for analysis, while a small subset (wins and impressions) is literally the invoice. The design separates streams by value, keeps the bidder's latency budget untouched, delivers a fast-but-approximate spend signal for pacing, and an exact, deduplicated, fraud-filtered number for billing.

Clarifying questions:

- **Role**: are we the bidder (demand side), the exchange or the publisher? This design takes the bidder's side.
- **Auction and pricing model**: first-price or second-price, billed per impression (CPM) or per click? Who sends win notices and when?
- **Funnel events**: which ones do we receive (win notice, impression pixel, click redirect, conversion postback)?
- **Latency needs**: pacing within seconds? Advertiser dashboards hourly?
- **Billing**: is our spend the system of record, or the exchange's report? What is the reconciliation process?
- **Privacy**: consent signals in requests, identifiers allowed, retention.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Bidders</strong> handle each bid request within the exchange's deadline and log asynchronously: a sample of requests, every bid, and counters of requests by key dimensions.</li>
<li><strong>Notification endpoints</strong> receive win notices, impression pixels and click redirects, and write them to Kafka keyed by auction id.</li>
<li><strong>Pacing stream</strong>: deduplicates wins and impressions, sums spend per campaign per minute and region, writes counters to a low-latency store.</li>
<li><strong>Pacing service</strong>: reads counters and adjusts each campaign's bid rate or throttle so spend follows its budget curve.</li>
<li><strong>Funnel stream</strong>: joins impressions to clicks within a window and feeds near-real-time advertiser dashboards.</li>
<li><strong>Lakehouse</strong>: all events land in bronze; hourly and daily batch jobs deduplicate, filter invalid traffic, join conversions, reconcile with exchange reports, and publish billing and reporting tables.</li>
<li><strong>Model data</strong>: training sets for win-rate and click prediction built from bids, wins and outcomes.</li>
</ol>
<figcaption>Value decides treatment: requests are sampled, money events are logged in full and deduplicated, and billing is computed twice (fast and exact).</figcaption>
</figure>

Walkthrough:

1. **Asynchronous logging** is non-negotiable. The bidder writes to a local buffer and a background producer ships batches to Kafka. If Kafka is slow, the bidder drops **sampled request logs** first and keeps money events, with metrics on what was dropped.
2. **Notifications** arrive from outside (exchanges, browsers). They are retried and sometimes lost, and some are fraudulent, so they are validated (signed or tokenised URLs tied to the auction id) before being counted.
3. **The pacing stream** trades exactness for speed: it deduplicates within a short window and counts spend from win notices immediately.
4. **Batch jobs** produce the numbers that advertisers are invoiced on.

## Data model and identifiers

All events share an **auction id** (from the bid request) and, after a win, an **impression id**. Each event carries campaign, creative, exchange, timestamps and the price fields.

| Table | Grain | Notes |
|---|---|---|
| `bronze.bid_requests_sample` | Sampled request | Sampling rate stored per row for re-weighting |
| `agg.bid_requests_counts` | Minute × exchange × country × format | Counters from bidders |
| `silver.bids` | Bid | Bid price, campaign, model scores |
| `silver.wins` | Deduplicated win | Clearing price, auction type |
| `silver.impressions` | Deduplicated, validated impression | Viewability where measured |
| `silver.clicks` | Deduplicated click | With invalid-traffic verdict |
| `gold.campaign_hourly` | Campaign × hour | Bids, wins, impressions, clicks, spend |
| `gold.billing_daily` | Advertiser × campaign × day | Final billable spend, version |

## Worked example: funnel and spend

Deduplicating win notices and joining the funnel, in PostgreSQL:

```sql
CREATE TABLE bids (auction_id text PRIMARY KEY, campaign_id int, bid_cpm numeric(10,4), bid_at timestamp);
CREATE TABLE wins (auction_id text, clearing_cpm numeric(10,4), won_at timestamp);
CREATE TABLE clicks (auction_id text, clicked_at timestamp);

INSERT INTO bids VALUES
  ('a1', 7, 2.50, '2026-09-01 10:00:00'), ('a2', 7, 2.50, '2026-09-01 10:00:01'),
  ('a3', 7, 3.00, '2026-09-01 10:00:02'), ('a4', 9, 1.20, '2026-09-01 10:00:02'),
  ('a5', 9, 1.20, '2026-09-01 10:00:03');
INSERT INTO wins VALUES
  ('a1', 2.10, '2026-09-01 10:00:00.2'), ('a1', 2.10, '2026-09-01 10:00:00.9'),
  ('a3', 2.75, '2026-09-01 10:00:02.3'), ('a4', 1.05, '2026-09-01 10:00:02.4');
INSERT INTO clicks VALUES
  ('a1', '2026-09-01 10:00:30'), ('a4', '2026-09-01 10:20:00'), ('a4', '2026-09-01 10:20:01'),
  ('a2', '2026-09-01 10:01:00');

WITH w AS (
  SELECT DISTINCT ON (auction_id) auction_id, clearing_cpm FROM wins ORDER BY auction_id, won_at
), c AS (
  SELECT DISTINCT auction_id FROM clicks
)
SELECT b.campaign_id,
       count(*) AS bids,
       count(w.auction_id) AS wins,
       round(count(w.auction_id)::numeric / count(*), 2) AS win_rate,
       round(sum(w.clearing_cpm) / 1000, 6) AS spend,
       count(c.auction_id) FILTER (WHERE w.auction_id IS NOT NULL) AS clicks_on_wins,
       count(c.auction_id) FILTER (WHERE w.auction_id IS NULL) AS orphan_clicks
FROM bids b
LEFT JOIN w ON w.auction_id = b.auction_id
LEFT JOIN c ON c.auction_id = b.auction_id
GROUP BY b.campaign_id
ORDER BY b.campaign_id;
```

```text
 campaign_id | bids | wins | win_rate |  spend   | clicks_on_wins | orphan_clicks
-------------+------+------+----------+----------+----------------+---------------
           7 |    3 |    2 |     0.67 | 0.004850 |              1 |             1
           9 |    2 |    1 |     0.50 | 0.001050 |              1 |             0
```

What it shows:

- The duplicated win notice for `a1` is counted once; without deduplication, campaign 7's spend would be 0.006950 instead of 0.004850.
- Spend uses the **clearing price**, not the bid price, and CPM means price per thousand impressions, hence the division by 1,000.
- `a4`'s double click counts once.
- `a2` has a click but no win: an **orphan** event. It might be a lost win notice, a late one, or fraud. Orphans are tracked as a data-quality metric and never billed without a matching win or impression.

## Budget pacing: the fast path

- The pacing stream emits spend per campaign per minute within seconds. The pacing service compares cumulative spend with the planned curve (budgets are usually spread across the day) and adjusts bid probability or bid price.
- Bidders run in several regions; each region keeps its own counter and receives an allocation of the remaining budget, refreshed every few seconds. This avoids a synchronous global check per bid.
- Some overspend is unavoidable: wins already in flight when the budget is reached, and lost or late win notices. Reserve a margin near the end of a budget and stop bidding slightly early; make the overspend tolerance an explicit, monitored number.

## Exact spend: the billing path

- Deduplicate wins and impressions by id over the full retry window (hours, not seconds).
- Apply invalid-traffic filters (known bots, data-centre IP ranges, abnormal click patterns), including verdicts that arrive later.
- Decide the billable event (win or rendered impression) per the contract with the exchange and advertiser.
- **Reconcile** daily with exchange reports per exchange, campaign and day. Differences have causes: timezone boundaries, lost notifications, different invalid-traffic rules. Investigate differences above a tolerance.
- Publish billing tables with a version; later corrections create a new version, not silent edits.

## Joins with delayed events

- **Impression → click**: clicks happen within minutes; a stream-stream join with a watermark of, say, 1 hour keeps state bounded.
- **Click or impression → conversion**: conversions can come days later through postbacks. Join in batch daily over the attribution window (for example 30 days) and restate recent days.
- **Bids → outcomes** for model training: every bid gets a label (won or lost, clicked or not). Lost bids have no outcome events, so absence must be inferred after a timeout.

## Training data and selection bias

A win-rate or click model trained only on auctions you bid on and won learns from a biased sample: you never observe what would have happened on auctions you skipped or lost. Mitigations: keep a small exploration budget that bids randomly on a sample of requests, store sampling and exploration flags on each training row, and re-weight. Record model scores at bid time so offline evaluation compares like with like.

## Ingestion and backpressure

- Kafka partitions keyed by auction id spread load evenly and keep an auction's events together.
- Priority by value: separate topics for money events (wins, impressions, clicks) with longer retention and stronger durability settings, and for sampled requests with short retention.
- Bidders must never block on logging. Local disk spooling covers short broker outages for money events.

## Schema evolution

Exchange protocols add fields frequently. Log the raw request extension fields as a semi-structured column, promote fields to typed columns once used, and keep a schema registry for internal event types. Price fields have strict types and currency.

## Security and privacy

- Bid requests contain device identifiers, IP addresses and location. Respect consent signals, truncate or hash IPs after fraud checks, limit retention of request samples, and keep raw identifiers out of advertiser-facing reports.
- Notification endpoints validate signed URLs to prevent forged wins or impressions.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Pacing stream lags | Bidder sees stale spend; overspend risk | Bidder throttles automatically when the pacing signal is stale |
| Win notices lost by an exchange | Under-counted spend in real time | Daily reconciliation with exchange reports; adjust billing |
| Duplicate notifications surge | Inflated real-time spend | Dedup by id; alert on duplicate rate |
| Bot attack on clicks | Inflated clicks, wasted spend | Real-time filters plus later verdicts; refunds per policy |
| Kafka outage | Money events at risk | Local spooling on bidders and endpoints; replay when Kafka returns |

## Monitoring and SLAs

- Pacing signal freshness; overspend per campaign as a percentage of budget.
- Win and impression notification rates versus bids won; orphan-event and duplicate rates.
- Reconciliation differences per exchange.
- Logging drop counts by event class (sampled requests may drop; money events must not).

## Cost

Bid requests dominate: at 1 million per second and 1 KB each, logging everything would be about 86 TB a day. Sampling at 1% plus counters reduces this to under 1 TB. Compress, keep request samples briefly, aggregate early, and store money events for as long as billing and audit require.

## Scaling to 10×

At 10 million requests per second: bidders and pacing counters per region, more Kafka partitions, lower request sampling rates, and the funnel stream split by exchange. The billing path scales as batch and is mostly unaffected.

## Capacity estimate

Assumptions: 1 million requests/s; 10% bid; 10% of bids win; 1 KB per request log, 300 bytes per other event; 1% request sampling; CTR 0.1%.

- **Bids**: 100,000/s × 300 B = 30 MB/s ≈ 2.6 TB/day.
- **Wins and impressions**: 10,000/s each × 300 B = 6 MB/s ≈ 520 GB/day for both.
- **Clicks**: 0.1% of 10,000 impressions/s = 10/s, which is tiny.
- **Request samples**: 1% of 1 million/s × 1 KB = 10 MB/s ≈ 860 GB/day; full logging would be 86 TB/day.
- **Dedup state** for wins and impressions over a 6-hour window: 20,000 ids/s × 21,600 s ≈ 430 million ids; at about 40 bytes each, about 17 GB across the stream cluster, so use a disk-backed state store.
- **Pacing counters**: campaigns × regions × minutes, at most hundreds of thousands of keys: trivial.

## What a strong answer includes

- Treatment by value: sampled requests, full money events, asynchronous logging that never slows bids.
- Shared ids across the funnel, and deduplication of retried notifications.
- A fast pacing path with an explicit overspend tolerance, and an exact billing path with reconciliation.
- Windowed stream joins for short delays and batch joins for long attribution windows.
- Invalid-traffic filtering and its effect on billing.
- Awareness of selection bias in training data.

## Common mistakes

- Logging every bid request in full, or logging synchronously in the bid path.
- Counting duplicate win notices as spend.
- Using bid price instead of clearing price, or forgetting that CPM is per thousand.
- Billing from the real-time pacing numbers.
- Stream-joining 30-day conversion windows.
- Training models only on won auctions without correcting for bias.

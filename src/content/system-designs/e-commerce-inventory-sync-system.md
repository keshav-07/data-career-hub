---
publishedDate: "2026-10-05"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Design an E-Commerce Inventory Sync System"
description: "A system-design case study for multi-channel inventory: CDC from warehouses, available-to-promise, reservations, channel sync and oversell prevention."
technology: ["data-engineering", "kafka", "sql"]
topic: ["cdc", "ingestion", "architecture"]
tags: ["inventory", "cdc", "available-to-promise", "oversell", "reconciliation", "rate-limits"]
difficulty: "Advanced"
problem: "Design a system that keeps product availability consistent across a retailer's website, mobile app, physical stores and third-party marketplaces, using stock data from several warehouse management systems, so that customers rarely see items that cannot be fulfilled and the business does not hide stock it could sell."
functionalRequirements:
  - "Capture stock movements (receipts, picks, adjustments, transfers) from warehouse and store systems"
  - "Maintain on-hand, reserved and available-to-promise quantities per SKU and location"
  - "Reserve stock when an order is placed and release it on cancellation or timeout"
  - "Publish availability to the website and to each marketplace through their APIs"
  - "Detect and correct drift between internal availability and what each channel shows"
  - "Provide inventory history for analytics (stock-outs, ageing, sell-through)"
nonFunctionalRequirements:
  - "Availability changes reach the website within 5 seconds and marketplaces within 2 minutes"
  - "Oversells below an agreed rate (for example a small fraction of a percent of orders)"
  - "Never publish negative or wildly wrong stock because of duplicate or out-of-order events"
  - "Respect each marketplace's API rate limits without falling behind on fast-moving SKUs"
  - "Survive a warehouse system outage without freezing all sales"
scaleAssumptions:
  - "Assumption: 2 million SKUs, 300 stocking locations (warehouses and stores)"
  - "Assumption: 3,000 stock movements per second at peak (sale events)"
  - "Assumption: 5 sales channels, of which 3 are external marketplaces with rate-limited APIs"
  - "Assumption: 10% of SKUs account for most movements"
architectureSummary: "Log-based CDC streams stock movements from warehouse and store systems into Kafka, keyed by SKU. An inventory service owns the availability model: it applies movements idempotently, manages reservations transactionally, and computes available-to-promise per SKU and channel. Availability changes are published as events; channel connectors coalesce them and push absolute quantities to each channel within its rate limits. A reconciliation job compares channel listings and physical counts with the model and repairs drift."
technologies: ["Log-based CDC (for example Debezium) or vendor change feeds", "Apache Kafka", "Inventory service with a transactional database", "Channel connectors (marketplace APIs, website cache)", "Key-value cache for website availability reads", "Lakehouse for inventory history and analytics", "Orchestrator for reconciliation jobs"]
tradeoffs:
  - decision: "One service owns available-to-promise"
    alternative: "Each channel computes availability from raw stock"
    reason: "Reservations, safety stock and channel allocation must be applied consistently in one place"
    consequence: "That service is critical and must be highly available"
  - decision: "Push absolute quantities to channels"
    alternative: "Push deltas (+1, -2)"
    reason: "Absolute values are idempotent: a retried or duplicated update cannot drift the count"
    consequence: "Must guard against out-of-order updates with versions or timestamps"
  - decision: "Coalesce updates per SKU and channel"
    alternative: "Send every change"
    reason: "Marketplace rate limits are far below the change rate on hot SKUs; only the latest value matters"
    consequence: "Channels see slightly delayed values during bursts"
  - decision: "Safety stock and channel allocation"
    alternative: "Publish full availability everywhere"
    reason: "Absorbs sync delay and inaccurate counts; avoids selling the same unit on several channels at once"
    consequence: "Some stock is hidden from customers, lowering sales slightly"
  - decision: "Reservations with expiry"
    alternative: "Deduct stock only at shipment"
    reason: "Prevents several orders claiming the last unit between order and pick"
    consequence: "Abandoned reservations must expire reliably or stock is locked"
interviewFollowUps:
  - "Two customers on different channels buy the last unit at the same second. What happens?"
  - "A marketplace API is down for an hour. What do you do with stock for that channel?"
  - "How do you handle a warehouse count that suddenly shows 200 fewer units?"
  - "Why push absolute quantities instead of deltas, and what new problem does that create?"
  - "How do you choose safety stock per SKU?"
  - "How would you add ship-from-store, where stores sell the same stock in person?"
related:
  - "system-designs:change-data-capture-platform"
  - "system-designs:order-events-processing-system"
  - "system-designs:search-indexing-pipeline"
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "interview-questions:data-engineering/design-cdc-pipeline"
versionContext: "The availability and drift SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Marketplace API limits differ by provider and are described generically."
sources:
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "PostgreSQL 16: transaction isolation", url: "https://www.postgresql.org/docs/16/transaction-iso.html" }
previous: "system-designs:video-streaming-analytics-pipeline"
next: "system-designs:unified-batch-streaming-lambda-kappa"
---

## Approach

Inventory sync is a **consistency problem across systems you do not control**: warehouse systems publish movements at their own pace, marketplaces accept updates at their own rate, and customers buy concurrently everywhere. Perfect consistency is impossible; the design manages the gap with a single owner of availability, idempotent updates, buffers (safety stock and allocation) and continuous reconciliation.

Clarifying questions:

- **Sources of truth**: which systems hold physical stock (warehouse management, store point-of-sale)? Do they offer change feeds, database access or only files?
- **Channels**: which ones, and how fast and how often can each be updated?
- **Reservation model**: when is stock committed: at basket, at order, at payment?
- **Tolerance**: what oversell rate is acceptable, and what does an oversell cost (cancellation, penalty from a marketplace)?
- **Fulfilment**: can any location fulfil any channel's orders, or are some stocks dedicated?
- **Volume** of SKUs, locations and movements, and how skewed it is.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Sources</strong>: warehouse and store systems record receipts, picks, adjustments and transfers.</li>
<li><strong>Capture</strong>: CDC (or vendor change feeds) publishes stock movements to Kafka keyed by SKU, with source sequence numbers.</li>
<li><strong>Inventory service</strong>: applies movements idempotently to on-hand per SKU and location; owns reservations; computes available-to-promise (ATP).</li>
<li><strong>Availability events</strong>: each ATP change is published with a version per SKU and channel.</li>
<li><strong>Channel connectors</strong>: coalesce changes, push absolute quantities to each channel within its rate limits, and record what was published.</li>
<li><strong>Reconciliation</strong>: compares channel listings, physical counts and the model; repairs drift.</li>
<li><strong>Analytics</strong>: all movements and availability changes land in the lakehouse.</li>
</ol>
<figcaption>Movements flow in, one service turns them into availability, connectors push it out, and reconciliation closes the loop.</figcaption>
</figure>

Walkthrough:

1. **Capture** from the warehouse system's database log (or its event feed) avoids polling and captures every movement, including corrections.
2. **Keying by SKU** puts all movements and reservations for a SKU in one partition, so the inventory service updates each SKU in order and without cross-instance conflicts.
3. **The inventory service** is an operational system, not an analytics job: it needs transactions for reservations (two orders must not both take the last unit).
4. **Availability events** decouple the model from channel quirks.
5. **Connectors** are where rate limits, retries and channel-specific formats live.

## The availability model

For each SKU (and location, and channel where allocation applies):

- **On hand**: physical units, from warehouse movements.
- **Reserved**: units promised to open orders not yet picked.
- **Safety stock**: a buffer for sync delay and count inaccuracy, larger for fast-moving SKUs and slower channels.
- **Available to promise (ATP)** = max(on hand − reserved − safety stock, 0).
- **Channel allocation**: a rule for how much of ATP each channel may show (for example 100% on the website, a capped share on marketplaces with slow sync).

A worked example in PostgreSQL that computes ATP and compares it with what each channel currently shows:

```sql
CREATE TABLE on_hand (sku text, warehouse text, qty int, PRIMARY KEY (sku, warehouse));
CREATE TABLE reservations (order_id int, sku text, qty int, status text);
CREATE TABLE sku_rules (sku text PRIMARY KEY, safety_stock int);
CREATE TABLE channel_published (channel text, sku text, qty int, version bigint, PRIMARY KEY (channel, sku));

INSERT INTO on_hand VALUES ('BOOT-42', 'north', 12), ('BOOT-42', 'south', 5), ('TENT-2P', 'north', 3);
INSERT INTO reservations VALUES
  (1, 'BOOT-42', 2, 'open'), (2, 'BOOT-42', 1, 'open'), (3, 'BOOT-42', 4, 'shipped'), (4, 'TENT-2P', 1, 'open');
INSERT INTO sku_rules VALUES ('BOOT-42', 2), ('TENT-2P', 1);
INSERT INTO channel_published VALUES
  ('web', 'BOOT-42', 12, 41), ('marketplace', 'BOOT-42', 9, 38),
  ('web', 'TENT-2P', 1, 40),  ('marketplace', 'TENT-2P', 2, 37);

WITH stock AS (
  SELECT sku, sum(qty) AS on_hand FROM on_hand GROUP BY sku
), reserved AS (
  SELECT sku, sum(qty) AS reserved FROM reservations WHERE status = 'open' GROUP BY sku
), atp AS (
  SELECT s.sku, s.on_hand, coalesce(r.reserved, 0) AS reserved, k.safety_stock,
         greatest(s.on_hand - coalesce(r.reserved, 0) - k.safety_stock, 0) AS available
  FROM stock s
  JOIN sku_rules k USING (sku)
  LEFT JOIN reserved r USING (sku)
)
SELECT a.sku, a.on_hand, a.reserved, a.safety_stock, a.available,
       c.channel, c.qty AS published,
       CASE WHEN c.qty > a.available THEN 'oversell risk'
            WHEN c.qty < a.available THEN 'under-listed'
            ELSE 'in sync' END AS status
FROM atp a JOIN channel_published c USING (sku)
ORDER BY a.sku, c.channel;
```

```text
   sku   | on_hand | reserved | safety_stock | available |   channel   | published |    status
---------+---------+----------+--------------+-----------+-------------+-----------+---------------
 BOOT-42 |      17 |        3 |            2 |        12 | marketplace |         9 | under-listed
 BOOT-42 |      17 |        3 |            2 |        12 | web         |        12 | in sync
 TENT-2P |       3 |        1 |            1 |         1 | marketplace |         2 | oversell risk
 TENT-2P |       3 |        1 |            1 |         1 | web         |         1 | in sync
```

Points to notice:

- Order 3 is shipped, so the warehouse has already deducted it from on hand; counting it as reserved too would double-subtract.
- `LEFT JOIN reserved` keeps SKUs with no open reservations; `coalesce` turns their missing reservation total into 0.
- The marketplace shows 2 tents while only 1 is available: a connector update is lagging or failed. That row should trigger an immediate push.
- Both channels show the full ATP of 1 tent. If both sell it at the same moment, one order oversells. That is the reason for allocation rules on low-stock SKUs (for example show the last units on one channel only).

## Ingestion, ordering and idempotency

- **Movements carry a source sequence or log position.** The inventory service stores the last applied position per source and SKU and skips anything at or below it, so CDC replays and duplicates are harmless.
- **Apply movements as deltas internally, publish absolute values externally.** Internally, deltas are applied exactly once thanks to the sequence check. Externally, absolute quantities with a version make channel updates idempotent; a stale update (lower version) is dropped by the connector before sending.
- **Reservations** use the database's transactions: a conditional update such as "decrement available where available ≥ requested" either succeeds or fails, so two concurrent orders cannot both take the last unit. This must run in the inventory service, not in an analytics pipeline.
- **Reservation expiry**: unpaid reservations expire after a timeout; a scheduled sweep or per-reservation timer releases them and emits availability changes.

## Channel sync and backpressure

- **Coalescing**: keep only the latest pending value per (channel, SKU). If a hot SKU changes 50 times in a minute, the marketplace gets one or two updates.
- **Prioritisation**: when the rate-limit budget is short, send first the updates that **reduce** availability to low numbers (oversell risk), then increases, then small changes on high-stock SKUs.
- **Batch APIs**: many marketplaces offer bulk inventory endpoints; use them for large updates and for reconciliation pushes.
- **Channel outage**: queue updates; if the outage is long, consider pausing listings with low stock on that channel to avoid overselling on stale data.

## Late data and warehouse outages

- A warehouse system offline means movements arrive late. Keep selling from the last known on-hand, but **raise safety stock** for affected locations automatically while their feed is stale.
- Late movements are applied in sequence order when they arrive; the published availability may drop sharply, which is correct.

## Schema evolution

Warehouse systems differ in movement types and units (each, case, pallet). Normalise into one movement model with explicit unit conversion. New movement types are mapped explicitly; unknown types go to a review queue rather than being ignored, since ignoring an adjustment is a silent drift.

## Data quality and reconciliation

- **Channel drift**: periodically read listings from each channel (or the connector's record of the last accepted value) and compare with ATP, as in the example. Push corrections.
- **Physical drift**: cycle counts from warehouses replace modelled on-hand for counted locations; track the size of adjustments as a data-quality metric for each location.
- **Invariants**: on hand never negative; reserved never exceeds on hand; every reservation belongs to an open order.
- **Oversell analysis**: every cancelled-for-no-stock order is traced back to the sync timeline to find the cause (late feed, slow connector, simultaneous sales).

## Security

The inventory service's write paths (reservations, adjustments) are restricted to order services and warehouse integrations. Marketplace credentials live in a secrets manager and are scoped per connector. Manual adjustments are audited with user and reason.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| CDC connector stops | Availability stale | Alert on feed freshness; raise safety stock; connector resumes from its log position |
| Duplicate movement events | Risk of double counting | Sequence check per source makes them no-ops |
| Marketplace API rate-limited | Channel lags on hot SKUs | Coalescing and prioritisation; bulk endpoints |
| Inventory service down | No reservations or ATP changes | Highly available deployment; channels keep last values; orders queue or fail safely |
| Reservation sweep fails | Stock locked by abandoned baskets | Alert on reservation age; idempotent re-run releases them |

## Monitoring and SLAs

- Feed freshness per source location; end-to-end latency from movement to channel update, per channel.
- Pending coalesced updates and rate-limit usage per channel.
- Drift rate per channel from reconciliation; oversell and cancellation rates.
- Share of SKUs with zero ATP that are physically in stock (under-listing costs sales too).

## Cost

The system is mostly operational; costs are database capacity for the inventory service, Kafka, and connector compute. Coalescing reduces both API calls and compute. Analytics storage is modest (movements and availability changes are small events).

## Scaling to 10×

At 20 million SKUs and 30,000 movements per second: partition the inventory service by SKU hash with each partition owning its SKUs (Kafka partition = ownership unit), keep the website's availability reads in a cache fed by availability events, and give hot SKUs dedicated handling (pre-allocated stock per channel during flash sales so channels do not compete for the same units in real time).

## Capacity estimate

Assumptions: 2 million SKUs × 300 locations, but most SKUs are stocked in few locations (assume 10 million active SKU-location pairs); 3,000 movements/s at peak; 500 bytes per movement; channel updates coalesced to an average of one per SKU per minute for changing SKUs.

- **State**: 10 million SKU-location rows × ~100 bytes ≈ 1 GB, plus reservations: fits comfortably in a relational database with indexes.
- **Movements**: peak 3,000/s × 500 B = 1.5 MB/s; a day at an average of 500/s ≈ 43 million movements ≈ 22 GB/day.
- **Channel updates**: if 200,000 distinct SKUs change in a busy hour, sending each one at least once means about 3,300 updates per minute per channel on average; SKUs that keep changing add up to one more update per minute each, because of coalescing. Compare with each marketplace's rate limit; if the limit is lower, prioritisation and bulk endpoints decide what is sent first.
- **Reconciliation**: a full listing read of 2 million SKUs per channel per day through bulk reports or paged APIs; incremental checks for hot SKUs every few minutes.

## What a strong answer includes

- A single owner of available-to-promise, with reservations handled transactionally.
- CDC with sequence numbers and idempotent application of movements.
- Absolute, versioned updates to channels, coalesced and prioritised under rate limits.
- Safety stock and channel allocation as explicit buffers against sync delay and concurrent sales.
- Reconciliation of channels and physical counts, and analysis of oversells.
- Defined behaviour when a source or a channel is down.

## Common mistakes

- Pushing deltas to channels, so one lost or duplicated update drifts forever.
- Letting each channel compute availability differently.
- Subtracting shipped orders twice, or forgetting to release expired reservations.
- Publishing full availability to every channel for the last few units.
- Treating inventory sync as a nightly batch when channels sell continuously.
- No reconciliation, so drift is found by cancelled orders.

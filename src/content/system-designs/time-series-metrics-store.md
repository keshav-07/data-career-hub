---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Time-Series Metrics Store"
description: "A system-design case study for a metrics store: series and label model, cardinality limits, write path, compression, downsampling, retention tiers and queries."
technology: ["data-engineering", "data-warehousing"]
topic: ["storage", "time-series", "architecture"]
tags: ["time-series", "cardinality", "downsampling", "retention", "compression", "observability"]
difficulty: "Advanced"
problem: "Design a store for operational and business metrics (request latency, error counts, CPU, orders per minute) that ingests millions of samples per second from thousands of services, answers dashboard and alerting queries in under a second, and keeps a year of history affordably."
functionalRequirements:
  - "Ingest numeric samples identified by a metric name and a set of labels (service, region, host, status)"
  - "Query by metric and label filters over a time range, with aggregation (sum, average, percentiles, rate)"
  - "Evaluate alert rules every 15 to 60 seconds against recent data"
  - "Keep raw resolution for recent data and downsampled data for long-term trends"
  - "Enforce per-tenant limits on series count and ingestion rate"
nonFunctionalRequirements:
  - "Write availability above read availability: losing monitoring data during an incident is the worst outcome"
  - "Dashboard queries over the last 6 hours return in under 1 second at p95"
  - "Samples visible to queries within about 30 seconds"
  - "Storage cost bounded by retention tiers and compression"
  - "One noisy tenant cannot degrade others"
scaleAssumptions:
  - "Assumption: 20 million active series"
  - "Assumption: one sample per series every 15 seconds, so about 1.3 million samples per second"
  - "Assumption: raw data kept 15 days, 5-minute rollups kept 13 months"
  - "Assumption: a few hundred dashboards and about 20,000 alert rules"
architectureSummary: "Agents scrape or receive metrics and push them through a load-balanced, replicated write path to ingesters sharded by series hash. Ingesters keep recent samples in memory with a write-ahead log and periodically flush compressed, time-partitioned blocks to object storage with a label index. A query layer fans out to ingesters for recent data and to store nodes for older blocks; a compactor merges blocks and produces downsampled rollups; retention deletes expired blocks."
technologies: ["Collection agents (Prometheus-compatible scraping or OpenTelemetry)", "Distributed time-series database (Prometheus-compatible or a columnar store)", "Object storage for blocks", "Write-ahead log on local disks", "Query frontend with caching", "Alerting rule evaluator"]
tradeoffs:
  - decision: "Purpose-built time-series storage with per-series compressed chunks"
    alternative: "Rows in a general-purpose relational or columnar table"
    reason: "Delta and XOR-style encodings compress regular samples to a couple of bytes each, and series-oriented layout makes range reads cheap"
    consequence: "Ad-hoc joins and high-cardinality analytics are weak; those belong in a warehouse"
  - decision: "Hard per-tenant cardinality limits"
    alternative: "Accept any label values"
    reason: "Series count, not sample count, drives memory and index size; one unbounded label (user id) can take the cluster down"
    consequence: "Some teams are blocked until they redesign their labels"
  - decision: "Replicate writes to 3 ingesters, accept on 2"
    alternative: "Single ingester per series"
    reason: "Survives an ingester loss without dropping data"
    consequence: "Three times the in-memory and write-ahead-log cost; queries must deduplicate replicas"
  - decision: "Downsample to 5-minute and 1-hour rollups for long retention"
    alternative: "Keep raw samples for a year"
    reason: "Long-range dashboards read far fewer points; storage drops sharply"
    consequence: "Spikes shorter than the rollup interval are only visible through stored min and max"
  - decision: "Separate metrics store from logs and traces"
    alternative: "One store for all telemetry"
    reason: "Each data type has different access patterns and compression"
    consequence: "Correlating signals needs shared labels and links between tools"
interviewFollowUps:
  - "A team adds a `user_id` label and series count triples in an hour. What happens and how do you protect the system?"
  - "How do you compute a p99 latency across 200 hosts correctly?"
  - "An ingester crashes. Which data is at risk, and how is it recovered?"
  - "How do you handle samples that arrive out of order or late from a buffered agent?"
  - "Why is averaging averages wrong in rollups, and what do you store instead?"
  - "How would you serve a query over the last 13 months in under a second?"
related:
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:kafka-ingestion-system"
  - "articles:etl-elt/pipeline-observability"
  - "articles:data-warehousing/partitioning-clustering-data-layout"
  - "articles:sql/aggregations-group-by-having"
versionContext: "Prometheus storage facts checked against the Prometheus storage documentation (docs/storage.md in the project repository). The rollup SQL was run on PostgreSQL 16 with scripts/verify-examples.py as a stand-in for a time-series engine."
sources:
  - { label: "Prometheus documentation: storage", url: "https://prometheus.io/docs/prometheus/latest/storage/" }
  - { label: "Prometheus remote write specification", url: "https://prometheus.io/docs/specs/remote_write_spec/" }
  - { label: "PostgreSQL: window functions", url: "https://www.postgresql.org/docs/current/functions-window.html" }
previous: "system-designs:financial-reconciliation-pipeline"
---

## Approach

A metrics store is a write-heavy database with a very particular data shape: many series, each a stream of (timestamp, number) pairs, almost always read by recent time range and label filters. The interview is about **series cardinality, the write path, compression and retention**, and about knowing when a time-series store is the wrong tool.

Clarifying questions:

- **What kind of metrics?** Infrastructure and application telemetry, business KPIs, IoT sensors? Telemetry tolerates some loss; billing data does not.
- **How many active series**, and how often is each sampled?
- **Push or pull?** Do agents scrape endpoints, or do services push?
- **Query patterns**: dashboards over hours, alert rules every few seconds, or long-range capacity planning?
- **Retention and resolution** needed at each age.
- **Multi-tenancy**: one company-wide system with many teams? Do limits and chargeback matter?
- **Consistency**: is it acceptable to lose the last few seconds of samples in a crash?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Collect</strong>: agents scrape service endpoints or receive pushed metrics, add standard labels and batch samples.</li>
<li><strong>Distributor</strong>: validates labels, enforces per-tenant limits, hashes each series and sends it to 3 ingesters.</li>
<li><strong>Ingesters</strong>: append samples to a write-ahead log and in-memory chunks per series; every 2 hours they cut a block.</li>
<li><strong>Object storage</strong>: immutable blocks with compressed chunks and an inverted label index.</li>
<li><strong>Compactor</strong>: merges small blocks, removes replica duplicates, writes 5-minute and 1-hour rollups, deletes expired data.</li>
<li><strong>Query layer</strong>: splits queries by time, reads recent data from ingesters and older data from blocks, caches results.</li>
<li><strong>Rule evaluator</strong>: runs alerting and recording rules on a schedule and sends alerts.</li>
</ol>
<figcaption>Recent data lives in memory on ingesters; everything older is immutable, compressed blocks in object storage.</figcaption>
</figure>

Walkthrough:

1. **Collection** batches samples so the network carries thousands of samples per request, not one.
2. **The distributor** is stateless and horizontally scalable. Validation here (label names, value lengths, series limits) protects everything behind it.
3. **Ingesters** hold the "head": the last couple of hours of every active series in memory, protected by a write-ahead log. Prometheus, for example, keeps the WAL in 128 MB segments and cuts persistent blocks roughly every two hours.
4. **Blocks** are immutable, which makes object storage a good fit: cheap, durable, and safe to cache.
5. **The compactor** turns many small blocks into fewer large ones (Prometheus compacts up to 10% of the retention time or 31 days, whichever is smaller) and creates rollups.
6. **The query layer** splits a 7-day query into daily pieces, runs them in parallel, and caches finished pieces so dashboards that refresh every 30 seconds mostly hit cache.

## Data model: series, labels and cardinality

A **series** is a metric name plus a unique set of label key-value pairs:

`http_request_duration_ms{service="checkout", region="eu-west", status="200"}`

- Every distinct label combination is a new series with its own in-memory chunk and index entries.
- **Cardinality** is the number of series. It multiplies: 50 services × 10 regions × 20 endpoints × 5 status codes × 200 pods = 100 million potential series.
- Labels must be **bounded**: status code, region, endpoint template. Never user id, order id, full URL or timestamp; those belong in logs, traces or the warehouse.

**Storage layout**:

| Structure | Contents | Purpose |
|---|---|---|
| Chunks | Compressed samples per series for a time range | Range reads of one series |
| Inverted index | Label pair → list of series ids | Find series matching `service="checkout"` fast |
| Symbol table | Deduplicated label strings | Avoid repeating strings per series |
| Block metadata | Time range, series count, compaction level | Query planning and retention |

Compression relies on regularity: timestamps at a fixed interval are stored as tiny delta-of-delta values, and slowly changing floats compress well with XOR encoding against the previous value. The Prometheus documentation reports an average of only 1 to 2 bytes per sample, which is the number to use in capacity planning.

## Write path, backpressure and limits

- **Batching and compression** on the wire (protobuf plus snappy in the Prometheus remote write protocol).
- **Per-tenant limits**: samples per second, active series, labels per series, label value length. Requests over the limit are rejected with a clear error (HTTP 429), not silently dropped.
- **Agent-side buffering**: when the store rejects or is slow, agents queue samples on disk for a bounded time and retry with backoff. When the buffer fills, they drop the oldest data, because fresh telemetry matters more during an incident.
- **Out-of-order samples**: buffered agents send old data after an outage. Either reject samples older than the head's window, or enable a bounded out-of-order window (which costs memory).

## Downsampling and retention

Long-range dashboards do not need 15-second resolution. Store rollups with enough statistics to keep aggregations correct. Here PostgreSQL's `date_bin` groups samples into 5-minute buckets:

```sql
CREATE TABLE series (series_id int PRIMARY KEY, metric text, labels jsonb);
CREATE TABLE samples (series_id int, ts timestamptz, value double precision, PRIMARY KEY (series_id, ts));

INSERT INTO series VALUES
  (1, 'http_request_duration_ms', '{"service": "checkout", "region": "eu-west"}'),
  (2, 'http_request_duration_ms', '{"service": "search", "region": "eu-west"}');
INSERT INTO samples
SELECT s, timestamptz '2026-09-01 10:00:00+00' + (i * interval '1 minute'),
       CASE WHEN s = 1 THEN 100 + i * 5 ELSE 40 + (i % 3) END
FROM generate_series(1, 2) AS s, generate_series(0, 9) AS i;

SELECT se.labels ->> 'service' AS service,
       date_bin(interval '5 minutes', sa.ts, timestamptz '2026-01-01 00:00:00+00') AS bucket,
       count(*) AS n, sum(value) AS sum, min(value) AS min, max(value) AS max
FROM samples sa JOIN series se USING (series_id)
GROUP BY 1, 2
ORDER BY 1, 2;
```

```text
 service  |         bucket         | n | sum | min | max
----------+------------------------+---+-----+-----+-----
 checkout | 2026-09-01 10:00:00+00 | 5 | 550 | 100 | 120
 checkout | 2026-09-01 10:05:00+00 | 5 | 675 | 125 | 145
 search   | 2026-09-01 10:00:00+00 | 5 | 204 |  40 |  42
 search   | 2026-09-01 10:05:00+00 | 5 | 205 |  40 |  42
```

The rollup stores **count, sum, min and max**, not the average. Averages can be recombined correctly as sum ÷ count at any coarser level (an hourly average is the sum of the twelve 5-minute sums divided by the sum of their counts), while an average of averages is wrong whenever buckets have different sample counts. Min and max preserve spikes that the average would hide.

**Percentiles cannot be rolled up from percentiles.** The p99 of 200 hosts is not the average of their p99s. Store histograms (bucket counts, or a mergeable sketch) and compute percentiles from the merged histogram at query time.

Retention tiers:

| Tier | Resolution | Retention | Used for |
|---|---|---|---|
| Head (memory) | Raw (15 s) | ~2–3 hours | Alerting, live dashboards |
| Raw blocks | Raw | 15 days | Incident investigation |
| 5-minute rollups | 5 min | 13 months | Weekly and monthly dashboards |
| 1-hour rollups | 1 h | Several years | Capacity planning |

## Counters, rates and resets

Most telemetry counters only increase (total requests) and reset to zero when a process restarts. A `rate()` calculation must detect the drop and treat it as a reset rather than a negative rate. That is why you store raw counters and compute rates at query time, instead of storing per-interval deltas computed by each agent.

## Late data and schema evolution

- **Late or out-of-order samples**: bounded acceptance window; anything older goes to a separate backfill path that writes new blocks, then compaction merges them.
- **Renaming metrics or labels** breaks every dashboard and alert using the old name. Use recording rules to publish the new name alongside the old for a transition period.
- **Label governance**: a central list of standard labels (service, environment, region) and a review for new high-cardinality labels.

## Security and multi-tenancy

- Tenant id on every request, from the authenticated agent identity, never from a client-supplied header alone.
- Per-tenant query limits (series touched, samples scanned, time range) so one heavy query cannot starve alert evaluation.
- Metrics can leak sensitive information through label values (customer names, internal hostnames). Validate and restrict labels.

## Failure modes and recovery

| Failure | Impact | Recovery |
|---|---|---|
| Ingester crash | Head data for its series in memory | Other replicas still have the samples; the crashed ingester replays its WAL on restart |
| Cardinality explosion | Ingester memory exhaustion, cascading crashes | Per-tenant series limits reject new series; alert on series growth rate |
| Object storage slow | Long-range queries slow | Recent queries still served from ingesters; caches absorb repeats |
| Compactor stuck | Many small blocks, slower queries, retention not applied | Alert on block count and compaction lag |
| Query of death | Query layer out of memory | Limits on samples per query, query splitting and timeouts |

Monitor the monitoring system from **outside** itself (a small independent instance or a third-party heartbeat). If the metrics store fails, its own alerts cannot fire.

## Monitoring and SLAs

- Ingestion: samples per second accepted versus rejected, per tenant and reason.
- Active series per tenant and growth rate.
- Write latency and replication failures; WAL replay duration.
- Query latency p50 and p95 by time range; cache hit ratio.
- Rule evaluation duration versus interval (rules that take longer than their interval are missed).

## Cost

- Series count drives memory; sample count drives disk. Cardinality limits are the main cost control.
- Object storage for blocks is far cheaper than replicated block storage on ingester disks.
- Rollups make long retention affordable: 5-minute rollups hold 20 times fewer points than 15-second raw data (with 4 stored statistics instead of 1, so storage drops about 5 times, and more for the hourly tier).
- Charge back by active series per team; it changes behaviour quickly.

## Scaling to 10×

At 200 million active series and 13 million samples per second:

- Add distributors and ingesters; the hash ring spreads series evenly.
- Shard by tenant as well as series, so large tenants get dedicated ingesters.
- Shuffle sharding (each tenant on a random subset of ingesters) limits the blast radius of a bad tenant.
- The index becomes the bottleneck for queries matching millions of series; precompute common aggregations with recording rules.

## Capacity estimate

Assumptions: 20 million active series, 15-second interval, 2 bytes per compressed sample, replication factor 3 in ingesters (deduplicated in blocks), about 4 KB of memory per active series in the head (an assumption to validate with your engine).

- **Samples per second**: 20 × 10⁶ / 15 ≈ 1.33 million/s.
- **Samples per day**: 1.33 × 10⁶ × 86,400 ≈ 115 billion.
- **Raw block storage**: 115 × 10⁹ × 2 B ≈ 230 GB/day; 15 days ≈ 3.5 TB, plus index overhead.
- **5-minute rollups**: 20 × 10⁶ series × 288 buckets/day × 4 values × ~2 bytes ≈ 46 GB/day before compression; 13 months ≈ 18 TB at worst, much less in practice because churned series stop producing rollups.
- **Ingester memory**: 20 million series × 3 replicas × 4 KB ≈ 240 GB across the ingester fleet, for example 16 ingesters with 32 GB of RAM each, leaving headroom.
- **WAL write rate**: 1.33 million samples/s × 3 replicas, about 16 bytes per uncompressed WAL entry ≈ 64 MB/s across the fleet.

## What a strong answer includes

- The series and label model, and cardinality as the number one scaling and cost risk, with enforced limits.
- A write path with batching, replication, WAL and backpressure that favours keeping fresh data.
- Compressed, immutable, time-partitioned blocks in object storage with an inverted label index.
- Correct rollups (count, sum, min, max, histograms) and retention tiers.
- Counter resets and percentile aggregation handled correctly.
- Independent monitoring of the monitoring system.

## Common mistakes

- Using user ids or request ids as labels.
- Storing averages in rollups and averaging them again.
- Averaging per-host percentiles.
- Treating the metrics store as an analytics warehouse for joins and high-cardinality questions.
- Designing for read availability first and losing writes during an incident.
- Alerting only from inside the system being monitored.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Video Streaming Analytics Pipeline"
description: "A system-design case study for video analytics: player heartbeats, playback sessions, quality-of-experience metrics, live concurrency, CDN logs and royalties."
technology: ["data-engineering", "kafka", "spark"]
topic: ["analytics", "streaming", "architecture"]
tags: ["video-analytics", "heartbeats", "sessionisation", "quality-of-experience", "concurrency", "cdn-logs"]
difficulty: "Advanced"
problem: "Design the analytics pipeline for a video streaming service: collect player telemetry from apps, TVs and browsers, measure viewing (watch time, completion) and quality of experience (start-up time, rebuffering, bitrate) in near real time for operations and live events, and produce trusted daily content and royalty reporting."
functionalRequirements:
  - "Collect player events and periodic heartbeats from every client platform"
  - "Reconstruct playback sessions and compute watch time, completion and engagement per title"
  - "Compute quality-of-experience metrics by CDN, region, device, app version and title, within a minute"
  - "Show concurrent viewers for live events in near real time"
  - "Join CDN delivery logs for traffic and cost analysis"
  - "Produce daily, auditable watch-time reporting per title and rights holder"
nonFunctionalRequirements:
  - "Operational QoE dashboards no more than 60 seconds behind"
  - "Daily content reports complete by 08:00 and reproducible for royalty audits"
  - "Robust to duplicate, late and missing heartbeats from unreliable networks"
  - "Handle live-event spikes of 10× normal traffic"
  - "Viewer data handled under consent and retention rules, especially for children's profiles"
scaleAssumptions:
  - "Assumption: 20 million concurrent viewers at evening peak, 5 million on average"
  - "Assumption: one heartbeat every 30 seconds per active session, plus a few events per session"
  - "Assumption: about 200 bytes per heartbeat after client batching"
  - "Assumption: 50,000 titles in the catalogue; live events reaching 10 million concurrent viewers"
architectureSummary: "Players send start, error and end events plus heartbeats with cumulative counters through a collection gateway into Kafka, keyed by session id. A streaming job deduplicates, assembles session state and emits one-minute QoE and concurrency aggregates to a real-time OLAP store. Raw heartbeats land in the lakehouse; a daily batch builds final session tables with late and recovered data, joins CDN logs and catalogue metadata, and publishes content and royalty marts."
technologies: ["Player SDK (mobile, web, TV)", "Collection gateway", "Apache Kafka", "Stream processor (Flink or Spark Structured Streaming)", "Real-time OLAP store for QoE dashboards", "Lakehouse tables", "Batch engine (Spark or warehouse SQL)", "CDN log delivery to object storage"]
tradeoffs:
  - decision: "Heartbeats every 30 seconds with cumulative counters"
    alternative: "Only start and stop events"
    reason: "Stop events are often lost when apps crash or lose network; heartbeats bound the loss to one interval"
    consequence: "Heartbeats dominate event volume"
  - decision: "Key events by session id"
    alternative: "Key by title id"
    reason: "Session assembly needs all events of a session together, and session ids spread evenly"
    consequence: "Per-title aggregates require a second, much smaller aggregation step"
  - decision: "Real-time OLAP store for one-minute aggregates"
    alternative: "Query the lakehouse directly"
    reason: "Operations teams slice QoE by many dimensions with second-level response times"
    consequence: "Another system to operate; it holds only recent, aggregated data"
  - decision: "Daily batch is the source of truth for content reporting"
    alternative: "Use streaming totals for royalties"
    reason: "Late uploads from offline downloads and recovered sessions must be included; audits need reproducibility"
    consequence: "Real-time and daily watch time differ slightly; reports say which one they show"
  - decision: "Concurrency from active-session state with timeouts"
    alternative: "Count start events minus end events"
    reason: "Missing end events would make start-minus-end drift upwards forever"
    consequence: "Concurrency lags reality by up to the timeout"
interviewFollowUps:
  - "A heartbeat stops arriving. Did the viewer stop watching, or did the network drop?"
  - "How do you compute concurrent viewers for a live final with 10 million viewers?"
  - "Rebuffering jumps on one CDN in one region. How does your pipeline help find the cause?"
  - "How do you count watch time for downloaded videos watched offline?"
  - "Why is the average bitrate of sessions not the right number to report?"
  - "How do you make royalty reports reproducible if the catalogue metadata changes?"
related:
  - "system-designs:clickstream-data-platform"
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:social-media-feed-analytics-system"
  - "articles:pyspark/window-functions"
  - "articles:etl-elt/batch-vs-streaming"
versionContext: "The session metric SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Player SDK and CDN log formats differ by vendor and are described generically."
sources:
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
  - { label: "PySpark API: session_window", url: "https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.functions.session_window.html" }
  - { label: "PostgreSQL 16: SELECT (DISTINCT ON)", url: "https://www.postgresql.org/docs/16/sql-select.html" }
previous: "system-designs:social-media-feed-analytics-system"
next: "system-designs:e-commerce-inventory-sync-system"
---

## Approach

Video analytics has two very different customers. **Operations** wants to know within a minute whether people are buffering, and where. **Content and finance** want exact, auditable watch time per title, once a day. The design separates those paths while sharing one session model and one set of definitions. The tricky data problem is that clients are unreliable: apps crash, TVs lose Wi-Fi, phones go offline, so the pipeline must reconstruct sessions from partial evidence.

Clarifying questions:

- **Metrics**: watch time, completion, start-up time, rebuffering, bitrate, errors? Which are operational and which are contractual?
- **Live and on-demand**: is there live content with concurrency peaks?
- **Platforms**: which clients, and do we control their SDKs (old smart TVs are hard to update)?
- **Freshness**: one minute for QoE? Daily for content reports?
- **Royalties**: are payments to rights holders based on these numbers? Then auditability is a hard requirement.
- **Privacy**: profiles for children, consent regions, retention.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Player SDK</strong>: emits start, first frame, bitrate change, error and end events, plus a heartbeat every 30 seconds with cumulative counters for the session.</li>
<li><strong>Gateway and Kafka</strong>: events are validated, stamped with receive time and written to Kafka keyed by session id.</li>
<li><strong>Session processor</strong>: deduplicates by (session, sequence), keeps per-session state, closes sessions after an end event or a timeout.</li>
<li><strong>Real-time aggregates</strong>: one-minute QoE metrics and concurrent viewers by CDN, region, device, app version and title, written to a real-time OLAP store.</li>
<li><strong>Lakehouse</strong>: raw events and heartbeats, then closed sessions, partitioned by date.</li>
<li><strong>Daily batch</strong>: rebuilds final sessions including late data, joins catalogue and rights metadata (as of the viewing date) and CDN logs, publishes content and royalty marts.</li>
</ol>
<figcaption>One session model feeds both minute-level operations dashboards and daily contractual reporting.</figcaption>
</figure>

Walkthrough:

1. **Heartbeats with cumulative counters** are the key design choice. Each heartbeat carries totals so far (milliseconds played, buffering time, bytes) or per-interval deltas plus a sequence number. Either way, a lost heartbeat loses at most one interval of detail, and a missing end event does not lose the session.
2. **Session id as key** keeps a session's events in order on one partition.
3. **The session processor** handles duplicates (network retries) by sequence number, and closes sessions that stop sending heartbeats after a timeout (for example 2 heartbeat intervals plus margin).
4. **Real-time aggregates** are computed from heartbeats per minute, not from closed sessions, so the dashboard shows rebuffering while it is happening.
5. **The daily batch** recomputes sessions from the full raw data, including late uploads, so it is the record for reporting.

## Session model and QoE definitions

| Metric | Definition (example) | Pitfall |
|---|---|---|
| Video start time | Time from play request to first frame | Exclude sessions where the user abandons before start; report them as "exits before start" |
| Rebuffering ratio | Buffering time after first frame ÷ (playing + buffering time after first frame) | Do not include start-up buffering |
| Watch time | Sum of playing time (not wall-clock time, not paused time) | Seeking and pauses inflate wall-clock time |
| Average bitrate | Bitrate weighted by time played at that bitrate | A simple mean of samples overweights short intervals |
| Completion | Played position reached at least 90% of duration (for example) | Credits make "100%" rare |
| Concurrent viewers | Sessions active in a given minute | Missing end events inflate naive counts |

A worked example in PostgreSQL over heartbeats that carry per-interval values, including a duplicated heartbeat:

```sql
CREATE TABLE heartbeats (
  session_id text, seq int, sent_at timestamp, state text,
  played_ms int, buffering_ms int, bitrate_kbps int
);
INSERT INTO heartbeats VALUES
  ('s1', 1, '2026-09-01 20:00:10', 'playing',   8000, 2000, 3000),
  ('s1', 2, '2026-09-01 20:00:20', 'playing',  10000,    0, 4500),
  ('s1', 3, '2026-09-01 20:00:30', 'buffering', 4000, 6000, 4500),
  ('s1', 3, '2026-09-01 20:00:30', 'buffering', 4000, 6000, 4500),
  ('s1', 4, '2026-09-01 20:00:40', 'playing',  10000,    0, 1500),
  ('s2', 1, '2026-09-01 20:05:10', 'playing',  10000,    0, 6000),
  ('s2', 2, '2026-09-01 20:05:20', 'ended',     3000,    0, 6000);

WITH dedup AS (
  SELECT DISTINCT ON (session_id, seq) *
  FROM heartbeats
  ORDER BY session_id, seq
)
SELECT session_id,
       count(*) AS heartbeats,
       round(sum(played_ms) / 1000.0, 1) AS watch_s,
       round(sum(buffering_ms) FILTER (WHERE seq = 1) / 1000.0, 1) AS startup_s,
       round(sum(buffering_ms) FILTER (WHERE seq > 1)::numeric
             / nullif(sum(played_ms + buffering_ms) FILTER (WHERE seq > 1), 0), 3) AS rebuffer_ratio,
       round(sum(bitrate_kbps::bigint * played_ms) / nullif(sum(played_ms), 0)) AS avg_kbps
FROM dedup
GROUP BY session_id
ORDER BY session_id;
```

```text
 session_id | heartbeats | watch_s | startup_s | rebuffer_ratio | avg_kbps
------------+------------+---------+-----------+----------------+----------
 s1         |          4 |    32.0 |       2.0 |          0.200 |     3188
 s2         |          2 |    13.0 |       0.0 |          0.000 |     6000
```

Notes:

- The duplicated heartbeat `('s1', 3)` is removed by `DISTINCT ON (session_id, seq)`; without it, watch time and buffering would be inflated.
- Start-up buffering (2 s in the first interval) is reported separately and excluded from the rebuffering ratio: 6 s of buffering out of 30 s after start = 0.200. In a real SDK, the first-frame event gives start-up time precisely; the first-interval approximation here keeps the example small.
- Average bitrate is **time-weighted**: (3000 × 8 + 4500 × 10 + 4500 × 4 + 1500 × 10) ÷ 32 ≈ 3188 kbps. The plain mean of the four samples would be 3375.
- `FILTER (WHERE ...)` is standard SQL that PostgreSQL supports; in engines without it use `sum(CASE WHEN ... END)`.

## Concurrency for live events

Concurrent viewers per minute = sessions with a heartbeat (or start) in that minute and no end before it. In streaming:

- Keep per-session state with "last seen"; a session counts as active until an end event or a timeout of about two heartbeat intervals.
- Aggregate active sessions per minute per event and region. For a 10 million viewer event, that is a count over 10 million keys per minute: partition the counting by session hash and sum partial counts.
- For unique viewers across the event (not concurrent), use mergeable distinct-count sketches.

## Ingestion and backpressure

- Clients batch heartbeats when possible (TV apps often cannot), and the gateway scales horizontally behind a load balancer.
- Live events create predictable spikes: pre-scale the gateway, Kafka partitions and processors before kick-off rather than relying on autoscaling reaction time.
- If the processor falls behind, QoE dashboards lag; operations should see a freshness indicator on every chart so a lagging pipeline is not mistaken for a healthy service.

## Late data, offline viewing and recovery

- **Offline downloads**: playback events are stored on the device and uploaded later, sometimes days later. They bypass real-time dashboards (outside the watermark) but are included by the daily batch, which recomputes the affected viewing dates for a defined lookback (for example 30 days) for content reporting.
- **Crashed sessions** have no end event: the batch closes them at the last heartbeat plus one interval at most.
- **Report versions**: royalty reports are published per period with a version; late data after a period closes goes into an adjustments line in the next period, as agreed with rights holders.

## Joining CDN logs

CDN logs (per request: edge location, bytes, response time, cache status) arrive as files in object storage with some delay. Join them to sessions through a session or request id placed in the segment URL or a header by the player. This lets you attribute rebuffering to a specific CDN, edge and cache-miss rate, and compute delivery cost per title.

## Schema evolution

- Old TV apps cannot be updated quickly, so several SDK schema versions are live at once. Normalise all versions into one session model, and record `sdk_version` on every row.
- New metrics are added as optional fields; definitions are versioned so a change to "completion" does not silently change last year's numbers.

## Data quality

- Heartbeat gaps per platform and app version (a sudden rise suggests an SDK bug).
- Sessions with impossible values (watch time longer than wall-clock time, negative counters).
- Daily reconciliation: total watch time from streaming aggregates versus batch sessions; difference should be within the expected late-data rate.
- Catalogue join completeness: every session maps to a title and rights holder.

## Security and privacy

Viewing history is sensitive. Pseudonymise viewer ids in analytics, restrict session-level tables, apply stricter retention and no personalised analytics for children's profiles where regulations require it, and aggregate before sharing anything with rights holders.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| SDK release stops sending heartbeats on one platform | Watch time drops for that platform | Data-quality alert by platform and version; batch can estimate from start and end events, flagged |
| Session processor restarts | Brief dashboard gap | Restart from checkpoint; state restored |
| Live-event spike exceeds capacity | Dashboards lag | Pre-scaling; sampling for QoE dashboards as a last resort (keep full data in raw storage) |
| CDN logs delayed | Delivery analysis incomplete | Daily batch waits with a cut-off; publishes with a completeness flag |
| Catalogue metadata changed | Historic reports differ | Join to metadata as of the viewing date (slowly changing dimension) |

## Monitoring and SLAs

- Freshness of QoE aggregates; processor lag during live events.
- Heartbeat arrival rate versus expected (active sessions ÷ interval).
- Daily report completion time; late-data volume per day.
- Dashboard query latency in the real-time OLAP store.

## Cost

Heartbeats dominate. Lengthening the interval from 30 to 60 seconds halves volume at the cost of precision; compress and batch on the client; keep raw heartbeats only for a limited period once sessions are built; store real-time aggregates at one-minute grain for a few days and roll them up after.

## Scaling to 10×

At 200 million concurrent viewers: regional collection and processing with global aggregation of small partial results; adaptive heartbeat intervals (longer when playback is stable, shorter during problems); and sampling of detailed QoE events while keeping complete watch-time counters.

## Capacity estimate

Assumptions: 20 million concurrent sessions at peak, 5 million average; one 200-byte heartbeat per 30 seconds; other events add 20%.

- **Peak event rate**: 20 × 10⁶ / 30 ≈ 667,000 heartbeats/s, about 800,000 events/s with other events; at 200 B that is roughly 160 MB/s.
- **Daily volume**: average 5 million sessions / 30 s ≈ 167,000/s × 1.2 ≈ 200,000 events/s × 86,400 ≈ 17 billion events/day ≈ 3.5 TB/day raw, perhaps 0.7 TB compressed.
- **Session state**: 20 million active sessions × ~500 bytes ≈ 10 GB at peak, spread over the processing cluster.
- **Real-time aggregates**: dimensions (CDN × region × device × app version × top titles) might produce around 500,000 rows per minute at peak, 720 million rows a day; keep 7 days at minute grain and roll up.
- **Sessions table**: if the average session lasts 40 minutes, about 5 million × 24 × 60 / 40 ≈ 180 million sessions a day.

## What a strong answer includes

- Heartbeats with sequence numbers and counters, and why start and stop events alone are not enough.
- A session model with timeouts and clear QoE definitions (start-up separate from rebuffering, time-weighted bitrate).
- Concurrency computed from active state, not starts minus ends.
- A real-time path for operations and a batch path as the source of truth for contractual reporting.
- Handling of offline viewing and late data with versioned reports.
- Pre-scaling for live events and freshness indicators on dashboards.

## Common mistakes

- Relying on end events that are often lost.
- Counting wall-clock time as watch time.
- Averaging bitrate samples without weighting by time.
- Including start-up delay in the rebuffering ratio.
- Paying royalties from streaming totals that never include late data.
- Joining sessions to today's catalogue metadata instead of the metadata valid at viewing time.

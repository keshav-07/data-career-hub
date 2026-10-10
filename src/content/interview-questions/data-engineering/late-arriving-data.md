---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How do you handle late-arriving data?"
seoTitle: "Handling Late-Arriving Data: Interview Answer"
description: "Interview answer: handle late-arriving data by separating event time from arrival time, rebuilding affected partitions and setting a lateness policy."
technology: ["data-engineering", "sql"]
topic: ["late-data", "event-time", "incremental-loading"]
difficulty: "Medium"
questionType: ["scenario", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I keep two timestamps on every record: event time (when it happened) and ingestion time (when we received it). Each run selects new rows by ingestion time, so nothing is missed, then finds which event-time partitions those rows belong to and rebuilds just those partitions idempotently. A lateness policy agreed with consumers says how long figures may change (for example three days), what happens to events older than that, and how completeness is communicated. In streaming, the same idea is a watermark with allowed lateness. Late dimension rows are handled with a placeholder member that is updated when the real row arrives."
followUps: ["What changes if consumers need figures to be final at 06:00?", "How do you handle a fact that arrives before its dimension row?", "How does a streaming engine decide an event is too late?", "How do you stop a single very late event from rebuilding a year of partitions?"]
related: ["articles:etl-elt/incremental-loading-watermarks-backfills", "articles:etl-elt/batch-vs-streaming", "system-designs:backfill-late-data-handling-system", "interview-questions:data-engineering/backfill-safely"]
sources:
  - { label: "Spark documentation: Structured Streaming programming guide", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
versionContext: "SQL verified on PostgreSQL 16.14"
---

## Detailed explanation

Data is "late" when it arrives after the period it belongs to was already processed: a mobile app that was offline for two days, a partner who resends yesterday's file, a producer retrying after an outage. If the pipeline partitions by arrival date, late data is never wrong but always misattributed; if it partitions by event date, late data changes partitions that consumers have already seen. A good answer makes that trade-off explicit.

### The batch pattern

1. **Select by ingestion time.** The run's window is "rows that arrived between 00:00 and 24:00 today". This is deterministic and misses nothing.
2. **Find affected event dates.** `SELECT DISTINCT event_date` from those rows.
3. **Rebuild those partitions** from all rows with those event dates, in one transaction (delete and insert, or partition overwrite).

## Example

```sql
CREATE TABLE events (event_id text PRIMARY KEY, event_date date NOT NULL,
                     ingested_at timestamptz NOT NULL, amount numeric NOT NULL);
CREATE TABLE daily_totals (event_date date PRIMARY KEY, total numeric NOT NULL);

-- Yesterday's run already published 4 October
INSERT INTO events VALUES ('a', '2026-10-04', '2026-10-04 12:00+00', 10);
INSERT INTO daily_totals VALUES ('2026-10-04', 10);

-- Today: one on-time event and one late event for the 4th
INSERT INTO events VALUES ('b', '2026-10-05', '2026-10-05 08:00+00', 20),
                          ('c', '2026-10-04', '2026-10-05 09:30+00', 5);

BEGIN;
CREATE TEMP TABLE affected ON COMMIT DROP AS
SELECT DISTINCT event_date FROM events
WHERE ingested_at >= '2026-10-05 00:00+00' AND ingested_at < '2026-10-06 00:00+00';

DELETE FROM daily_totals WHERE event_date IN (SELECT event_date FROM affected);
INSERT INTO daily_totals
SELECT event_date, sum(amount) FROM events
WHERE event_date IN (SELECT event_date FROM affected)
GROUP BY event_date;
COMMIT;

SELECT * FROM daily_totals ORDER BY event_date;
```

| event_date | total |
|------------|-------|
| 2026-10-04 | 15 |
| 2026-10-05 | 20 |

The 4 October total moved from 10 to 15 because a late event arrived; rerunning today's window gives the same result.

### The policy

Technical handling is the easy half. Agree with consumers:

- **A lateness horizon**: "daily figures may change for 3 days, then they are final".
- **What happens beyond it**: events go to a correction process, are booked in the arrival period, or are dropped and counted. Finance usually wants corrections posted in the current period rather than restated history.
- **How completeness is shown**: a "data complete up to" marker or a completeness percentage, rather than silent changes.

### Late dimensions

A fact can arrive before the dimension row it references (an order for a customer created a minute ago in another system). Do not drop the fact or load it with a null key. Insert a placeholder ("inferred") dimension member with the natural key and unknown attributes, point the fact at it, and update the member when the real row arrives. In a type 2 dimension, make sure the update fills in the placeholder rather than opening a new version.

### Streaming

Streaming engines handle the same problem with an **event-time watermark** (latest event time seen minus allowed lateness). Windows stay open until the watermark passes their end; events arriving after that are dropped or routed to a side output. More allowed lateness means more complete results, later output and more state.

## Trade-offs and pitfalls

- Rebuilding affected partitions is cheap when late events are rare; cap it (for example, only the last N days) so one ancient event cannot trigger a rebuild of a year.
- Partitioning by arrival date avoids restating history but makes "sales on 4 October" queries wrong unless they use event time.
- Upstream clocks can be wrong; reject or flag event times in the future or impossibly far in the past.
- Late data breaks naive freshness checks: a partition can be "fresh" and still incomplete.

## Common mistakes

1. Selecting new data by event time, so late events are never picked up.
2. Appending late events to an aggregate instead of rebuilding the partition, which double-counts on rerun.
3. No agreed horizon, so figures change unpredictably.
4. Dropping facts whose dimension row has not arrived yet.

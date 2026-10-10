---
previous: "projects:change-data-capture-pipeline"
next: "projects:fraud-detection-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Real-Time Analytics Pipeline"
description: "An advanced project: compute per-minute business metrics from a Kafka event stream with event-time windows and watermarks, and serve them to a live dashboard."
inventoryId: "PROJ-06"
technology: ["kafka", "spark"]
topic: ["streaming", "analytics"]
level: "Advanced"
problemStatement: "Build a pipeline that turns a stream of order events into per-minute revenue and order counts by category, visible on a dashboard within a minute, correct when events arrive late or twice, and reconciled with a batch recount."
requirements: ["Produce synthetic order events with event ids and event timestamps, including late and duplicated events", "Aggregate into one-minute event-time windows with a watermark and deduplication", "Upsert window totals into a serving table keyed by window and category", "Show a live view of the last hour with a freshness indicator", "Reconcile closed windows with a batch recount and explain every difference"]
technologies: ["Apache Kafka", "Spark Structured Streaming", "PostgreSQL as the serving store", "A notebook or lightweight web chart for the dashboard"]
dataset: "Synthetic: a producer script that deliberately sends some events late and some twice. The windowing logic is first simulated in plain Python so the rules can be tested without a cluster."
steps: ["Write the producer with event ids, timestamps and configurable lateness and duplication", "Simulate the windowing, watermark and dedup rules in plain Python and test them", "Create the serving table and its idempotent upsert", "Run the Spark job from Kafka with withWatermark, dropDuplicatesWithinWatermark and window, writing upserts in foreachBatch", "Build the dashboard query with a freshness indicator", "Reconcile closed windows against a batch recount from raw events", "Test restart recovery and late-event handling"]
testing: ["Send duplicate events and confirm counts do not change", "Send events later than the watermark and confirm they are dropped from live numbers and counted as dropped", "Compare streaming results with a batch recomputation from raw events for closed windows"]
dataQuality: ["Aggregates reconcile with a batch recount over the same windows, except documented late drops", "No negative revenue; every category is a known value", "Every serving row has a computed_at timestamp so staleness is visible"]
monitoring: ["Input rate versus processing rate", "Watermark delay and rows dropped by the watermark", "End-to-end latency from event time to the serving table", "Kafka consumer lag"]
costConsiderations: ["Runs locally", "In production continuous compute is the main cost; the trigger interval trades latency for cost", "Serving queries should hit the small aggregate table, never raw events"]
interviewQuestions: ["Why event time instead of processing time?", "What does your watermark trade off?", "How do you avoid double counting after a restart?", "Why upsert instead of append into the serving table?", "How would you fix a bug in historical aggregates?"]
resumeBullets: ["Built a streaming analytics pipeline with Kafka and Spark Structured Streaming using event-time windows, a watermark and event-id deduplication, upserting per-minute metrics into a serving table; state the event rate you tested and the end-to-end latency you measured", "Validated streaming aggregates against a batch recount and documented the late-event drops the watermark caused; describe how you chose the watermark from observed lateness"]
extensions: ["Keep raw events in a lakehouse table and restate closed windows nightly", "Add alerting when revenue per minute drops sharply against the same minute last week", "Replace PostgreSQL with a real-time OLAP store and compare query latency", "Push updates to the browser with server-sent events instead of polling"]
related: ["system-designs:real-time-analytics-pipeline", "articles:etl-elt/batch-vs-streaming", "projects:kafka-spark-delta-streaming", "articles:kafka/consumers-offsets"]
versionContext: "The Python simulation and the PostgreSQL serving and reconciliation SQL were run with scripts/verify-examples.py (Python 3.11, PostgreSQL 16); shown output comes from that run. The Spark job and producer need a Kafka broker and are described, not executed here; the same watermark logic runs in the Kafka to Delta project."
---

## What you will build

A live "orders per minute by category" dashboard whose numbers are **correct**, not just fast. The interesting engineering is not the chart; it is what happens when a phone sends an order two minutes late, when a producer retries, and when the job restarts.

You are done when:

- duplicates never change a count;
- a late event inside the watermark updates the right minute, and one outside it is dropped and counted;
- the serving table is upserted, so restarts cannot double count;
- closed windows reconcile with a batch recount, with every difference explained.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Producer sends order events with event time and event id to Kafka.</li>
<li>Spark reads from Kafka and deduplicates within the watermark.</li>
<li>One-minute event-time windows by category.</li>
<li>Upserts into the serving table, keyed by window and category.</li>
<li>Dashboard reads the last hour from the serving table, with a freshness indicator.</li>
</ol>
<figcaption>Late events update the right window until the watermark passes.</figcaption>
</figure>

## Step 1: the rules, simulated

Before touching a cluster, write the rules as a tiny simulator. It mirrors what Structured Streaming does: deduplicate by `event_id`, assign each event to the one-minute window of its **event time**, ignore events older than the watermark (latest event time seen minus two minutes, taken from the previous batch), and emit the updated totals of every window that changed.

```python
from collections import defaultdict

LATENESS = 120   # seconds
WINDOW = 60

def minute(ts):
    return ts - ts % WINDOW

def run_stream(batches):
    seen, totals, dropped = set(), defaultdict(lambda: [0, 0.0]), []
    max_ts, watermark, emitted = 0, 0, []
    for b, batch in enumerate(batches, start=1):
        changed = set()
        for eid, ts, cat, amount in batch:
            if ts < watermark:                 # too late for live numbers
                dropped.append(eid)
                continue
            if eid in seen:                    # producer retry or replay
                continue
            seen.add(eid)
            key = (minute(ts), cat)
            totals[key][0] += 1
            totals[key][1] += amount
            changed.add(key)
            max_ts = max(max_ts, ts)
        emitted.append((b, sorted((k, tuple(totals[k])) for k in changed)))
        watermark = max_ts - LATENESS          # used by the next batch
    return totals, dropped, emitted

T0 = 36_000   # 10:00:00 as seconds since midnight, to keep numbers small
batches = [
    [("o1", T0 + 5, "shoes", 80.0), ("o2", T0 + 30, "bags", 55.0), ("o3", T0 + 70, "shoes", 60.0)],
    [("o2", T0 + 30, "bags", 55.0),                      # duplicate
     ("o4", T0 + 50, "shoes", 40.0),                     # late but within the watermark: 10:00 is revised
     ("o5", T0 + 250, "bags", 30.0)],                    # moves the watermark to 10:02:10
    [("o6", T0 + 20, "shoes", 99.0),                     # older than the watermark: dropped
     ("o7", T0 + 260, "shoes", 25.0)],
]
totals, dropped, emitted = run_stream(batches)
for b, rows in emitted:
    print("batch", b, [(f"{(k[0] // 3600):02d}:{(k[0] % 3600) // 60:02d}", k[1], v) for k, v in rows])
print("dropped as late:", dropped)
```

```text
batch 1 [('10:00', 'bags', (1, 55.0)), ('10:00', 'shoes', (1, 80.0)), ('10:01', 'shoes', (1, 60.0))]
batch 2 [('10:00', 'shoes', (2, 120.0)), ('10:04', 'bags', (1, 30.0))]
batch 3 [('10:04', 'shoes', (1, 25.0))]
dropped as late: ['o6']
```

Batch 2 re-emitted the 10:00 shoes window with its **new total** (2 orders, 120.00). That is update output mode, and it is why the serving store must **overwrite** by key: appending emissions would count the first order twice.

## Step 2: the serving table and its upsert

PostgreSQL is a fine serving store at this scale. The key is (window, category); each write carries the total and when it was computed. Replaying emissions in any order must give the same table, so the upsert only accepts a row computed at or after the stored one.

```sql
CREATE TABLE minute_sales (
  window_start timestamptz NOT NULL,
  category     text NOT NULL,
  orders       int NOT NULL,
  revenue      numeric(12, 2) NOT NULL,
  computed_at  timestamptz NOT NULL,
  PRIMARY KEY (window_start, category));

CREATE PROCEDURE upsert_minute(w timestamptz, c text, n int, r numeric, at timestamptz)
LANGUAGE sql AS $$
  INSERT INTO minute_sales VALUES (w, c, n, r, at)
  ON CONFLICT (window_start, category) DO UPDATE
    SET orders = EXCLUDED.orders, revenue = EXCLUDED.revenue, computed_at = EXCLUDED.computed_at
    WHERE minute_sales.computed_at <= EXCLUDED.computed_at;
$$;

-- the emissions from the simulation, batch by batch
CALL upsert_minute('2026-10-05 10:00+00', 'shoes', 1,  80.00, '2026-10-05 10:01:05+00');
CALL upsert_minute('2026-10-05 10:00+00', 'bags',  1,  55.00, '2026-10-05 10:01:05+00');
CALL upsert_minute('2026-10-05 10:01+00', 'shoes', 1,  60.00, '2026-10-05 10:01:05+00');
CALL upsert_minute('2026-10-05 10:00+00', 'shoes', 2, 120.00, '2026-10-05 10:04:15+00');
CALL upsert_minute('2026-10-05 10:04+00', 'bags',  1,  30.00, '2026-10-05 10:04:15+00');
CALL upsert_minute('2026-10-05 10:04+00', 'shoes', 1,  25.00, '2026-10-05 10:04:30+00');
-- a restart replays the first batch's emission: it must not undo the newer total
CALL upsert_minute('2026-10-05 10:00+00', 'shoes', 1,  80.00, '2026-10-05 10:01:05+00');

SELECT to_char(window_start, 'HH24:MI') AS minute, category, orders, revenue
FROM minute_sales ORDER BY window_start, category;
```

```text
 minute | category | orders | revenue 
--------+----------+--------+---------
 10:00  | bags     |      1 |   55.00
 10:00  | shoes    |      2 |  120.00
 10:01  | shoes    |      1 |   60.00
 10:04  | bags     |      1 |   30.00
 10:04  | shoes    |      1 |   25.00
```

With Spark, `foreachBatch` writes each micro-batch's emissions with this upsert (through JDBC into a staging table, then one `INSERT ... ON CONFLICT` statement). The `computed_at` guard matters when two writers or a replay race; with a single writer and a checkpoint, plain overwrite by key is already idempotent.

## Step 3: the Spark job

<!-- noexec -->
```python
import os
from pyspark.sql import functions as F

SCHEMA = "event_id string, category string, amount decimal(10,2), event_ts timestamp"

orders = (spark.readStream.format("kafka")
          .option("kafka.bootstrap.servers", "localhost:9092")
          .option("subscribe", "orders")
          .option("maxOffsetsPerTrigger", 50000)
          .load()
          .select(F.from_json(F.col("value").cast("string"), SCHEMA).alias("o")).select("o.*"))

per_minute = (orders
              .withWatermark("event_ts", "2 minutes")
              .dropDuplicatesWithinWatermark(["event_id"])
              .groupBy(F.window("event_ts", "1 minute").alias("w"), "category")
              .agg(F.count("*").alias("orders"), F.sum("amount").alias("revenue")))

def write_batch(df, batch_id):
    (df.select(F.col("w.start").alias("window_start"), "category", "orders", "revenue",
               F.current_timestamp().alias("computed_at"))
       .write.format("jdbc").mode("overwrite")                      # a per-batch staging table
       .option("url", "jdbc:postgresql://localhost:5432/metrics").option("dbtable", "minute_sales_stage")
       .option("user", "metrics_writer").option("password", os.environ["METRICS_DB_PASSWORD"])
       .save())
    run_sql("""INSERT INTO minute_sales SELECT * FROM minute_sales_stage
               ON CONFLICT (window_start, category) DO UPDATE
               SET orders = EXCLUDED.orders, revenue = EXCLUDED.revenue, computed_at = EXCLUDED.computed_at
               WHERE minute_sales.computed_at <= EXCLUDED.computed_at""")   # your DB helper

(per_minute.writeStream.outputMode("update").foreachBatch(write_batch)
    .option("checkpointLocation", "/chk/minute_sales")
    .trigger(processingTime="10 seconds").start())
```

A ten-second trigger keeps the dashboard within the one-minute target. Spark decides which rows are too late using the watermark from the **previous** micro-batch, as the simulator does; the Kafka to Delta project shows this with a runnable example.

## Step 4: the dashboard query and freshness

The dashboard reads only the small serving table. It shows how old the newest data is, and marks the last two minutes as provisional (they can still change until the watermark passes).

```sql
SELECT to_char(window_start, 'HH24:MI') AS minute,
       sum(orders) AS orders, sum(revenue) AS revenue,
       window_start > timestamptz '2026-10-05 10:05:00+00' - interval '2 minutes' AS provisional
FROM minute_sales
WHERE window_start >= timestamptz '2026-10-05 10:05:00+00' - interval '1 hour'
GROUP BY window_start ORDER BY window_start;

SELECT timestamptz '2026-10-05 10:05:00+00' - max(computed_at) AS data_age FROM minute_sales;
```

```text
 minute | orders | revenue | provisional 
--------+--------+---------+-------------
 10:00  |      3 |  175.00 | f
 10:01  |      1 |   60.00 | f
 10:04  |      2 |   55.00 | t

 data_age 
----------
 00:00:30
```

"Now" is a fixed timestamp here so the output is reproducible; in the dashboard it is `now()`. If `data_age` grows beyond a minute, show a banner: a stale dashboard that looks live is worse than one that says it is behind.

## Step 5: reconcile with a batch recount

Raw events (all of them, including late ones) also land in a raw table. A batch recount over closed windows is the reference; the difference must equal the documented late drops.

```sql
CREATE TABLE raw_orders (event_id text, category text, amount numeric(10, 2), event_ts timestamptz);
INSERT INTO raw_orders VALUES
  ('o1', 'shoes', 80, '2026-10-05 10:00:05+00'), ('o2', 'bags', 55, '2026-10-05 10:00:30+00'),
  ('o3', 'shoes', 60, '2026-10-05 10:01:10+00'), ('o2', 'bags', 55, '2026-10-05 10:00:30+00'),
  ('o4', 'shoes', 40, '2026-10-05 10:00:50+00'), ('o5', 'bags', 30, '2026-10-05 10:04:10+00'),
  ('o6', 'shoes', 99, '2026-10-05 10:00:20+00'), ('o7', 'shoes', 25, '2026-10-05 10:04:20+00');

WITH batch AS (
  SELECT date_trunc('minute', event_ts) AS window_start, category,
         count(*) AS orders, sum(amount) AS revenue
  FROM (SELECT DISTINCT ON (event_id) * FROM raw_orders ORDER BY event_id) d
  GROUP BY 1, 2
)
SELECT to_char(coalesce(b.window_start, s.window_start), 'HH24:MI') AS minute,
       coalesce(b.category, s.category) AS category,
       b.orders AS batch_orders, s.orders AS live_orders,
       b.revenue - coalesce(s.revenue, 0) AS revenue_gap
FROM batch b FULL OUTER JOIN minute_sales s USING (window_start, category)
WHERE b.orders IS DISTINCT FROM s.orders OR b.revenue IS DISTINCT FROM s.revenue
ORDER BY 1, 2;
```

```text
 minute | category | batch_orders | live_orders | revenue_gap 
--------+----------+--------------+-------------+-------------
 10:00  | shoes    |            3 |           2 |       99.00
```

The only gap is 10:00 shoes, short by one order and 99.00: exactly event `o6`, which the simulation dropped as late. If the gap were anything else, the streaming logic and the batch logic would disagree on a definition, which is a bug to fix. Restate closed windows from the batch result when the late volume matters to users.

## Common mistakes

- **Processing-time windows**, so a delayed burst lands in the wrong minute.
- **Appending update-mode output**, which double counts revised windows.
- **No deduplication by event id**, so producer retries inflate revenue.
- **A watermark chosen by guess**: measure how late events really are (the gap between event time and arrival) and pick the lateness from that distribution.
- **Dashboards querying raw events**, which collapses at the first traffic spike.

## Explaining it in an interview

"Order events go through Kafka into Structured Streaming. I deduplicate by event id within a two-minute watermark, aggregate one-minute event-time windows by category in update mode and upsert each window's new total into a serving table keyed by window and category, so revisions and restarts overwrite instead of adding. The dashboard reads only that table, shows data age and marks the last two minutes as provisional. A batch recount from raw events reconciles closed windows; the only differences are events later than the watermark, which I count and can restate."

Prepare for: *Why two minutes?* (from measured lateness; longer means more state and more provisional minutes). *What if Spark restarts?* (it resumes from the checkpoint; re-emitted windows overwrite by key). *How would you fix a bug in yesterday's numbers?* (fix the code, recompute closed windows in batch from raw, upsert them, and keep the streaming job for new data).

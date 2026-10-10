---
previous: "projects:ecommerce-analytics-platform"
next: "projects:kafka-spark-delta-streaming"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Large-Scale Batch Processing Pipeline"
description: "PySpark large-scale batch project: process a multi-gigabyte dataset, fix skew and join problems using the Spark UI, and write idempotent partitioned output."
inventoryId: "PROJ-08"
technology: ["pyspark", "spark"]
topic: ["batch", "performance"]
level: "Intermediate"
problemStatement: "Process a large public dataset (several gigabytes or more) with PySpark into partitioned, query-ready tables, and document, with evidence from the Spark UI and query plans, how you found and fixed the main performance bottleneck."
requirements: ["Read a dataset of at least several gigabytes with an explicit schema", "Clean, join with a lookup table and aggregate to a reporting grain", "Write partitioned Parquet by date and rerun any date without duplicating output", "Show the physical plan before and after choosing a join strategy", "Measure partition skew and fix it, recording before-and-after numbers from your own runs"]
technologies: ["PySpark 4.x", "Parquet (or Delta Lake)", "Local Spark or a small cloud cluster", "Spark UI"]
dataset: "NYC TLC trip records (https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page): monthly Parquet files of taxi trips plus a zone lookup CSV; a year of yellow-taxi data is several gigabytes. Check and record the current terms of use. The page also includes a synthetic generator with built-in skew for developing on a laptop."
steps: ["Explore one month and write an explicit schema", "Write the job as functions: read, clean, enrich, aggregate, write", "Parameterise it by processing month or date", "Join the zone lookup with a broadcast and confirm it in the physical plan", "Measure task and partition sizes; find the skewed key", "Fix skew (AQE skew handling, salting or a separate path for the hot key)", "Write with dynamic partition overwrite and prove a rerun is identical", "Write the performance analysis with screenshots and your measured timings"]
testing: ["Unit tests for the cleaning rules on small DataFrames", "Plan assertions: the lookup join is a BroadcastHashJoin", "Rerun one date and compare row counts and checksums"]
dataQuality: ["Required columns non-null after cleaning; the share of removed rows is recorded by rule", "Row counts reconcile from input to output, accounting for filtered rows", "Every trip joins to a zone, or is counted in an explicit unknown-zone bucket"]
monitoring: ["Job duration, input and output rows per run", "Number and average size of output files per partition", "Maximum versus median task duration in the heaviest stage"]
costConsiderations: ["Develop on a sample locally; run the full year once on a small cluster and shut it down", "Avoid many tiny output files; aim for files of roughly 128 MB to 1 GB", "Broadcasting a small table removes a shuffle of the large one, which is usually the biggest saving"]
interviewQuestions: ["What was the slowest stage and why?", "How did you prove the join was broadcast?", "What is data skew, how did you detect it and what fixed it?", "How did you choose the number of partitions?", "How does your write stay idempotent?", "What would change at 100 times the data?"]
resumeBullets: ["Built a PySpark batch pipeline over a year of NYC taxi trip data (state the size in GB and row count you processed) with explicit schemas, broadcast joins and date-partitioned, idempotent Parquet output", "Diagnosed partition skew from the Spark UI and fixed it with salting or AQE skew handling; quote the before-and-after duration of the heaviest stage from your own runs and link the write-up"]
extensions: ["Switch the output to Delta Lake and handle late corrections with MERGE", "Schedule monthly runs and a one-year backfill with Airflow", "Compare runtime and cost on a cloud cluster with two different executor sizes", "Add a data-quality report per run (rows removed per cleaning rule)"]
related: ["articles:spark/partitions-shuffles-skew", "articles:spark/execution-model-jobs-stages-tasks", "articles:spark/adaptive-query-execution", "articles:pyspark/joins-and-join-strategy", "articles:pyspark/writing-efficient-output"]
versionContext: "Code was run on PySpark 4.2 in local mode (Python 3.11) with scripts/verify-examples.py; partition counts and plan checks shown come from that run. Timings are deliberately not shown: measure your own."
---

## What you will build

Interviewers for Spark roles want evidence that you have processed data bigger than memory and can explain **why** a job is slow. This project produces that evidence: a working, rerunnable job and a short written analysis with plans, partition statistics and timings you measured yourself.

You are done when:

- the job runs on the full dataset with an explicit schema and writes date-partitioned output;
- the plan shows the lookup join as a broadcast hash join;
- you can show the skewed key, the size of its partition before and after your fix, and the stage times;
- rerunning a date produces identical output.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw monthly Parquet files in a <code>raw/</code> folder or bucket.</li>
<li>PySpark job parameterised by processing month: read with schema, clean, enrich.</li>
<li>Broadcast join with the small zone lookup.</li>
<li>Aggregation to zone × day, with skew handling for the hot zones.</li>
<li>Partitioned output with dynamic overwrite for the processed dates.</li>
</ol>
<figcaption>A single rerunnable batch job; each date is processed independently.</figcaption>
</figure>

## Step 1: get the data

For the real run, download a year of yellow-taxi Parquet files and the zone lookup CSV from the [TLC trip record page](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) into `raw/`. Column names and types have changed over the years, so read with an explicit schema and cast:

<!-- noexec -->
```python
trips_raw = spark.read.parquet("raw/yellow_tripdata_2024-*.parquet")
trips = trips_raw.select(
    F.col("tpep_pickup_datetime").cast("timestamp").alias("pickup_ts"),
    F.col("PULocationID").cast("int").alias("pickup_zone"),
    F.col("DOLocationID").cast("int").alias("dropoff_zone"),
    F.col("trip_distance").cast("double").alias("distance_miles"),
    F.col("fare_amount").cast("decimal(10,2)").alias("fare"),
    F.col("passenger_count").cast("int").alias("passengers"))
zones = spark.read.option("header", True).csv("raw/taxi_zone_lookup.csv")
```

To develop quickly, the generator below produces the same columns with a realistic problem built in: 70% of trips start in one zone (think of an airport), which creates a skewed key.

```python
import os, tempfile
from pyspark.sql import SparkSession, functions as F

spark = (SparkSession.builder.master("local[4]").appName("trips-batch")
         .config("spark.sql.shuffle.partitions", "8")
         .config("spark.sql.adaptive.enabled", "false")          # off for the demo, so numbers are predictable
         .config("spark.sql.autoBroadcastJoinThreshold", "-1")   # off, so we can see the default plan first
         .config("spark.sql.sources.partitionOverwriteMode", "dynamic")
         .config("spark.sql.session.timeZone", "UTC")
         .config("spark.ui.showConsoleProgress", "false")
         .getOrCreate())
spark.sparkContext.setLogLevel("ERROR")
BASE = tempfile.mkdtemp()

N = 2_000_000
trips = (spark.range(N).select(
    (F.lit("2026-09-01").cast("timestamp")
     + F.make_interval(days=(F.col("id") % 7).cast("int"), mins=(F.col("id") % 1440).cast("int"))).alias("pickup_ts"),
    F.when(F.col("id") % 10 < 7, F.lit(132)).otherwise((F.col("id") % 263 + 1)).cast("int").alias("pickup_zone"),
    ((F.col("id") * 7) % 263 + 1).cast("int").alias("dropoff_zone"),
    F.when(F.col("id") % 1000 == 0, F.lit(-1.0)).otherwise((F.col("id") % 200) / 10.0).alias("distance_miles"),
    ((F.col("id") % 6000) / 100.0 + 3).cast("decimal(10,2)").alias("fare"),
    F.when(F.col("id") % 500 == 0, F.lit(None)).otherwise(F.col("id") % 4 + 1).cast("int").alias("passengers")))
zones = spark.createDataFrame([(z, f"Zone {z}", "Queens" if z == 132 else "Manhattan") for z in range(1, 264)],
                              "zone_id int, zone_name string, borough string")
trips.write.mode("overwrite").parquet(os.path.join(BASE, "raw"))
trips = spark.read.parquet(os.path.join(BASE, "raw"))
print("rows:", trips.count(), "zones:", zones.count())
```

```text
rows: 2000000 zones: 263
```

## Step 2: write the job as testable functions

```python
def clean(df):
    """Drop rows that cannot be analysed; keep the rules explicit so you can report each one."""
    return (df.filter(F.col("pickup_ts").isNotNull())
              .filter(F.col("distance_miles") >= 0)
              .filter(F.col("fare") >= 0)
              .withColumn("passengers", F.coalesce("passengers", F.lit(1)))
              .withColumn("pickup_date", F.to_date("pickup_ts")))

def enrich(df, zones):
    return (df.join(F.broadcast(zones), df.pickup_zone == zones.zone_id, "left")
              .withColumn("borough", F.coalesce("borough", F.lit("Unknown"))))

def aggregate(df):
    return (df.groupBy("pickup_date", "pickup_zone", "borough")
              .agg(F.count("*").alias("trips"),
                   F.sum("fare").alias("fare_total"),
                   F.round(F.avg("distance_miles"), 2).alias("avg_distance")))

cleaned = clean(trips)
removed = trips.count() - cleaned.count()
print("removed by cleaning:", removed)
```

```text
removed by cleaning: 2000
```

Record **why** each removed row went (negative distance here; in the real data you will also find zero-passenger trips, timestamps outside the month and negative fares from refunds). That table belongs in your README.

## Step 3: choose the join strategy and prove it

Without a broadcast, Spark joins two large-looking inputs with a **sort-merge join**: both sides are shuffled by the join key. The lookup has 263 rows, so broadcasting it to every executor removes the shuffle of the 2 million (or, in the real data, tens of millions of) trips.

```python
def join_strategy(df):
    plan = df._jdf.queryExecution().executedPlan().toString()
    return [s for s in ("BroadcastHashJoin", "SortMergeJoin", "ShuffledHashJoin") if s in plan]

no_hint = cleaned.join(zones, cleaned.pickup_zone == zones.zone_id, "left")
with_hint = enrich(cleaned, zones)
print("without hint:", join_strategy(no_hint))
print("with broadcast():", join_strategy(with_hint))
```

```text
without hint: ['SortMergeJoin']
with broadcast(): ['BroadcastHashJoin']
```

In normal use, leave `spark.sql.autoBroadcastJoinThreshold` at its default (10 MB) and AQE on: Spark broadcasts small tables by itself and can switch a sort-merge join to a broadcast join at runtime once it sees the real sizes. The explicit `broadcast()` hint documents the intent and protects you when the optimiser's size estimate is wrong. Check the plan in the SQL tab of the Spark UI on the real run and screenshot it.

## Step 4: find the skew

Skew shows up in the Spark UI as one task in a stage running far longer than the rest (compare the maximum and median task duration in the stage's summary metrics). You can measure the cause directly: how many rows land in each shuffle partition when data is partitioned by the key.

```python
def partition_sizes(df, *keys):
    sizes = (df.repartition(8, *keys).groupBy(F.spark_partition_id().alias("p")).count()
               .orderBy("p").collect())
    counts = [r["count"] for r in sizes]
    return max(counts), sorted(counts)[len(counts) // 2], counts

mx, median, counts = partition_sizes(with_hint, "pickup_zone")
print("rows per partition by pickup_zone:", counts)
print(f"max / median = {mx / median:.1f}")
top = with_hint.groupBy("pickup_zone").count().orderBy(F.desc("count")).first()
print("hottest key:", top["pickup_zone"], "with", top["count"], "rows")
```

```text
rows per partition by pickup_zone: [61595, 73004, 68441, 100378, 61598, 1491536, 75285, 66163]
max / median = 20.4
hottest key: 132 with 1400281 rows
```

One partition holds the airport zone, so one task does most of the work while the other cores wait. Adding executors does not help: the hot key cannot be split across tasks by hash partitioning.

## Step 5: fix the skew

Three fixes, from least to most code:

1. **Turn on AQE skew-join handling** (`spark.sql.adaptive.enabled` and `spark.sql.adaptive.skewJoin.enabled`, both on by default in recent Spark). It splits oversized partitions in **sort-merge joins**. It does not help a skewed `groupBy`.
2. **Two-stage aggregation with a salt**: add a random-ish salt to the key, aggregate by (key, salt), then aggregate the partial results by key. Sums and counts combine correctly; averages must be rebuilt from sums and counts.
3. **Separate path for the hot key**: process the few hot keys on their own and union the results.

Salting the aggregation:

```python
SALTS = 8
salted = with_hint.withColumn("salt", (F.abs(F.hash("pickup_ts", "dropoff_zone")) % SALTS).cast("int"))

mx_s, median_s, counts_s = partition_sizes(salted, "pickup_zone", "salt")
print("rows per partition by (pickup_zone, salt):", counts_s)
print(f"max / median = {mx_s / median_s:.1f}")

partial = (salted.groupBy("pickup_date", "pickup_zone", "borough", "salt")
           .agg(F.count("*").alias("trips"), F.sum("fare").alias("fare_total"),
                F.sum("distance_miles").alias("distance_total")))
final_salted = (partial.groupBy("pickup_date", "pickup_zone", "borough")
                .agg(F.sum("trips").alias("trips"), F.sum("fare_total").alias("fare_total"),
                     F.round(F.sum("distance_total") / F.sum("trips"), 2).alias("avg_distance")))

direct = aggregate(with_hint)
diff = final_salted.exceptAll(direct).count() + direct.exceptAll(final_salted).count()
print("salted result equals direct aggregation:", diff == 0)
```

```text
rows per partition by (pickup_zone, salt): [249657, 68718, 254640, 252152, 247484, 425235, 66016, 434098]
max / median = 1.7
salted result equals direct aggregation: True
```

Always check that the salted result equals the straightforward one, as above: a salting bug produces plausible but wrong numbers. In your write-up, report the heaviest stage's maximum and median task time before and after, from the Spark UI of **your** run.

## Step 6: write idempotently and prove it

The job is parameterised by the dates it processes. Dynamic partition overwrite replaces exactly those `pickup_date` partitions.

```python
OUT = os.path.join(BASE, "curated", "zone_daily")

def run(dates):
    subset = trips.filter(F.to_date("pickup_ts").isin(dates))
    result = aggregate(enrich(clean(subset), zones))
    (result.repartition("pickup_date")                 # one file per date at this size
           .write.mode("overwrite").partitionBy("pickup_date").parquet(OUT))

def checksum():
    df = spark.read.parquet(OUT)
    r = df.agg(F.count("*").alias("rows"), F.sum("trips").alias("trips"),
               F.sum("fare_total").alias("fare")).first()
    return r["rows"], r["trips"], str(r["fare"])

all_dates = [f"2026-09-0{d}" for d in range(1, 8)]
run(all_dates)
before = checksum()
run(["2026-09-03"])                                    # rerun one date
print("before:", before)
print("after rerun of 2026-09-03:", checksum())
print("files per date:", len([f for f in os.listdir(os.path.join(OUT, "pickup_date=2026-09-03")) if f.endswith(".parquet")]))
```

```text
before: (1841, 1998000, '65894040.00')
after rerun of 2026-09-03: (1841, 1998000, '65894040.00')
files per date: 1
```

`repartition("pickup_date")` before `partitionBy` gives one file per date here; on the full year, use `repartition("pickup_date", ...)` with enough partitions that each output file is roughly 128 MB to 1 GB. The default would write up to `spark.sql.shuffle.partitions` files into every date folder.

## Step 7: unit tests

```python
def test_clean_rules():
    rows = [("2026-09-01 10:00:00", 1, 2, 1.5, "10.00", 1),
            ("2026-09-01 10:00:00", 1, 2, -1.0, "10.00", 1),     # negative distance: removed
            (None, 1, 2, 1.0, "10.00", 1),                       # no timestamp: removed
            ("2026-09-01 11:00:00", 1, 2, 2.0, "8.00", None)]    # missing passengers: defaults to 1
    df = (spark.createDataFrame(rows, "pickup_ts string, pickup_zone int, dropoff_zone int, "
                                      "distance_miles double, fare string, passengers int")
          .withColumn("pickup_ts", F.col("pickup_ts").cast("timestamp"))
          .withColumn("fare", F.col("fare").cast("decimal(10,2)")))
    out = clean(df).collect()
    assert len(out) == 2
    assert sorted(r.passengers for r in out) == [1, 1]

def test_lookup_join_is_broadcast():
    assert join_strategy(enrich(cleaned, zones)) == ["BroadcastHashJoin"]

test_clean_rules()
test_lookup_join_is_broadcast()
print("passed: test_clean_rules, test_lookup_join_is_broadcast")
```

```text
passed: test_clean_rules, test_lookup_join_is_broadcast
```

## Writing the performance analysis

This document is what makes the project stand out. Keep it to one page:

1. **Setup**: data size (GB, rows), cluster or laptop (cores, memory), Spark version and key settings.
2. **Baseline**: total runtime, the slowest stage, its task-duration summary (min, median, max), shuffle read and write sizes. Include the screenshot.
3. **Diagnosis**: what the numbers show (for example "one task processed most of the rows of the aggregation stage; key 132").
4. **Change**: what you changed and why (broadcast hint, salting, file sizing).
5. **Result**: the same measurements after the change, from your runs, plus the equality check of results.
6. **What you would do at 100×**: more partitions sized from input bytes, AQE on, incremental processing by month, a table format with MERGE for corrections.

Only report numbers you measured. "The heaviest stage went from N to M seconds on 8 cores" is credible when you can show the screenshot; a percentage without a setup is not.

## Common mistakes

- **Schema inference** on large data: an extra pass and types that change between months.
- **Tuning before measuring**: changing executor memory when the problem is one hot key.
- **Salting a join without replicating the other side**: salting the large side of a join requires duplicating the small side once per salt value, otherwise matches are lost. For a lookup join, broadcasting is the simpler fix.
- **Averaging partial averages** after salting, instead of dividing summed totals by summed counts.
- **Static overwrite**, which deletes every date when one is rerun.
- **Thousands of tiny files** per partition from the default shuffle partitions.

## Explaining it in an interview

"I processed a year of NYC taxi data with PySpark. The lookup join was a sort-merge join that shuffled every trip; broadcasting the 263-row zone table removed that shuffle, which I confirmed in the physical plan. The aggregation stage had one task far slower than the others because a large share of trips started in one zone (I measured it with a count per zone), so I used two-stage aggregation with a salt and verified the results matched the direct aggregation. Output is partitioned by date with dynamic overwrite, and rerunning a date leaves the checksums unchanged. The write-up has the stage timings before and after."

Prepare for: *Why not just add executors?* (a hot key stays in one task). *Does AQE fix this?* (AQE splits skewed partitions in sort-merge joins and coalesces small partitions; a skewed aggregation still needs salting or a separate path). *How did you pick 8 salts?* (enough to bring the hot partition near the median; measure, as in Step 5).

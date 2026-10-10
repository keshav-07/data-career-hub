---
previous: "projects:csv-to-warehouse-pipeline"
next: "projects:ecommerce-analytics-platform"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "S3 → PySpark → Snowflake Data Pipeline"
description: "An intermediate project: process raw files from object storage with PySpark, write curated Parquet, and load a cloud warehouse with idempotent, date-partitioned loads."
inventoryId: "PROJ-02"
technology: ["pyspark", "aws", "snowflake"]
topic: ["batch", "cloud"]
level: "Intermediate"
problemStatement: "Raw event files arrive in object storage every day. Clean, deduplicate and aggregate them with PySpark, write curated Parquet partitioned by date, and load curated tables into a cloud warehouse for analysts, so that any day can be reprocessed on demand without duplicates."
requirements: ["Read one day of raw JSON files from object storage (a local folder works for development)", "Quarantine malformed records instead of failing or dropping them silently", "Deduplicate on event id and aggregate to a daily user-activity table", "Write curated Parquet partitioned by date, replacing only the processed date", "Load each date into the warehouse idempotently and reconcile counts across layers", "Document IAM and warehouse cost settings"]
technologies: ["PySpark 4.x", "Amazon S3 (or any object storage)", "Snowflake (or another cloud warehouse)", "Airflow (optional)"]
dataset: "Synthetic: the generator on this page writes three days of JSON event files with duplicates, malformed lines and a late event. A public alternative is the NYC TLC trip record data (https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page); record its terms in your README."
steps: ["Define the target tables and their grain", "Generate raw files laid out as raw/dt=YYYY-MM-DD/", "Write a PySpark job that takes the processing date as a parameter and reads only that folder", "Parse with an explicit schema, quarantine corrupt records and deduplicate on event id", "Aggregate and write partitioned Parquet with dynamic partition overwrite", "Run the same date twice and prove the output is unchanged", "Load the date into Snowflake by deleting and copying that date in one transaction", "Reconcile counts raw → curated → warehouse, then schedule daily runs and a backfill"]
testing: ["Unit-test the transformation on a hand-made DataFrame (duplicates, corrupt rows, late events)", "Run the job twice for one date and compare row counts and sums", "Rerun one date after the others and confirm the other partitions are untouched"]
dataQuality: ["Event ids unique per day after deduplication", "Required fields non-null; corrupt records counted per day", "Counts reconcile: raw lines = valid + quarantined; valid − duplicates = curated events"]
monitoring: ["Job duration and row counts per stage, written to a run log", "Quarantine rate per day", "Freshness: the latest date loaded into the warehouse"]
costConsiderations: ["Run Spark only for the processing window; on EMR Serverless or Glue, pay per job run", "Use an X-Small Snowflake warehouse with a short auto-suspend for the load", "Write a few well-sized Parquet files per date instead of hundreds of tiny ones", "Keep raw data on cheaper storage classes after the reprocessing window"]
interviewQuestions: ["Where are the shuffles in your PySpark job?", "How do you make the warehouse load idempotent?", "What happens to an event that arrives a day late?", "Why an explicit schema instead of schema inference?", "How did you scope the job's IAM permissions?"]
resumeBullets: ["Built a PySpark job that processes one day of raw JSON from object storage into date-partitioned Parquet with quarantine of malformed records and dynamic partition overwrite; state the volume you processed and the job runtime you measured", "Loaded curated data into Snowflake with a delete-and-copy per date inside a transaction and reconciliation checks across raw, curated and warehouse layers; mention the backfill you ran to prove reruns are safe"]
extensions: ["Replace Parquet with Delta Lake or Iceberg and use MERGE for late corrections", "Add a data contract and schema-change alerts for the raw JSON", "Use Snowpipe or COPY with a storage integration and event notifications instead of a scheduled COPY", "Add Airflow with a backfill of a whole month and compare runtimes"]
related: ["articles:pyspark/reading-writing-data", "articles:pyspark/writing-efficient-output", "articles:spark/partitions-shuffles-skew", "articles:snowflake/loading-copy-snowpipe", "articles:aws/s3-for-data-engineers", "system-designs:scalable-batch-pipeline"]
versionContext: "PySpark code was run on PySpark 4.2 (local mode, Python 3.11) and the load-pattern SQL on PostgreSQL 16 with scripts/verify-examples.py; shown output is from those runs. Snowflake SQL, S3 access and the Airflow DAG are described, not executed here."
---

## What you will build

The most common production batch pattern: files land in object storage, a distributed job cleans them, and a warehouse serves analysts. You will build it so that **every stage is keyed by processing date**, which makes "rerun Tuesday" a safe, routine command instead of an incident.

You are done when:

- the job processes exactly one date folder and writes exactly one output partition;
- running a date twice changes nothing, and rerunning one date leaves other dates untouched;
- malformed records are quarantined and counted;
- counts reconcile from raw lines to the warehouse table.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw files land in <code>s3://bucket/raw/events/dt=YYYY-MM-DD/</code>.</li>
<li>PySpark reads one date with an explicit schema, quarantines corrupt records, deduplicates and aggregates.</li>
<li>Curated Parquet is written to <code>curated/…/dt=YYYY-MM-DD/</code>, replacing only that partition.</li>
<li>The warehouse rows for that date are replaced in one transaction from the curated files.</li>
<li>A reconciliation step compares counts at each layer and records the run.</li>
</ol>
<figcaption>Every stage is keyed by processing date so any day can be rerun independently.</figcaption>
</figure>

Target tables and grain:

| Table | Grain | Purpose |
|---|---|---|
| `curated/events` | One row per unique event | Clean, typed history |
| `curated/daily_user_activity` | One row per user per day | Analyst-facing aggregate |
| `curated/quarantine` | One row per malformed raw line | Debugging and source feedback |

Develop against a local folder first; the only change for S3 is the path prefix and credentials.

## Step 1: generate raw files

Three days of events, with deliberate problems: a duplicated event (producer retry), a malformed line, a record without an `event_id`, and an event whose timestamp belongs to the previous day (it arrived late, so it sits in the next day's folder).

```python
import json, os, random, tempfile

random.seed(7)
BASE = tempfile.mkdtemp()                      # use s3a://your-bucket in the cloud
RAW = os.path.join(BASE, "raw", "events")

def write_day(dt, n):
    folder = os.path.join(RAW, f"dt={dt}")
    os.makedirs(folder)
    lines = []
    for i in range(n):
        etype = random.choice(["view", "view", "view", "add_to_cart", "purchase"])
        lines.append(json.dumps({
            "event_id": f"{dt}-{i:04d}", "user_id": f"u{random.randint(1, 8)}",
            "event_type": etype, "amount": round(random.uniform(5, 120), 2) if etype == "purchase" else None,
            "event_ts": f"{dt}T{random.randint(0, 23):02d}:{random.randint(0, 59):02d}:00Z"}))
    lines.append(lines[3])                                       # producer retry: exact duplicate
    lines.append('{"event_id": "broken", "user_id": ')           # truncated line
    lines.append(json.dumps({"user_id": "u1", "event_type": "view", "event_ts": f"{dt}T10:00:00Z"}))
    with open(os.path.join(folder, "part-0001.json"), "w") as f:
        f.write("\n".join(lines) + "\n")
    return len(lines)

for dt in ["2026-10-01", "2026-10-02", "2026-10-03"]:
    print(dt, write_day(dt, 40), "raw lines")

# one late event: it happened on 1 October but was delivered with 2 October's files
with open(os.path.join(RAW, "dt=2026-10-02", "part-0002.json"), "w") as f:
    f.write(json.dumps({"event_id": "late-1", "user_id": "u2", "event_type": "purchase",
                        "amount": 30.0, "event_ts": "2026-10-01T23:58:00Z"}) + "\n")
```

```text
2026-10-01 43 raw lines
2026-10-02 43 raw lines
2026-10-03 43 raw lines
```

## Step 2: the job, parameterised by date

Read only the date's folder, with an explicit schema. `PERMISSIVE` mode plus a corrupt-record column keeps malformed lines instead of failing the job or silently nulling them.

```python
from pyspark.sql import SparkSession, functions as F, types as T

spark = (SparkSession.builder.master("local[2]").appName("events-daily")
         .config("spark.sql.shuffle.partitions", "4")
         .config("spark.sql.sources.partitionOverwriteMode", "dynamic")
         .config("spark.sql.session.timeZone", "UTC")
         .config("spark.ui.showConsoleProgress", "false")
         .getOrCreate())
spark.sparkContext.setLogLevel("ERROR")

RAW_SCHEMA = T.StructType([
    T.StructField("event_id", T.StringType()),
    T.StructField("user_id", T.StringType()),
    T.StructField("event_type", T.StringType()),
    T.StructField("amount", T.DecimalType(10, 2)),
    T.StructField("event_ts", T.TimestampType()),
    T.StructField("_corrupt_record", T.StringType()),
])

def read_raw(dt):
    return (spark.read.schema(RAW_SCHEMA)
            .option("mode", "PERMISSIVE")
            .option("columnNameOfCorruptRecord", "_corrupt_record")
            .json(os.path.join(RAW, f"dt={dt}"))
            .cache())                     # Spark requires caching before filtering on the corrupt column

def transform(raw, dt):
    """Return (events, quarantine) DataFrames for one processing date."""
    bad = raw.filter(F.col("_corrupt_record").isNotNull() | F.col("event_id").isNull()
                     | F.col("event_ts").isNull())
    quarantine = bad.select(F.lit(dt).alias("dt"),
                            F.coalesce("_corrupt_record", F.to_json(F.struct("event_id", "user_id", "event_type")))
                            .alias("raw"),
                            F.when(F.col("_corrupt_record").isNotNull(), "unparseable")
                             .otherwise("missing event_id or event_ts").alias("reason"))
    events = (raw.subtract(bad).drop("_corrupt_record")
              .dropDuplicates(["event_id"])
              .withColumn("event_date", F.to_date("event_ts"))
              .withColumn("dt", F.lit(dt)))
    return events, quarantine

def daily_user_activity(events):
    return (events.groupBy("dt", "user_id")
            .agg(F.count(F.when(F.col("event_type") == "view", 1)).alias("views"),
                 F.count(F.when(F.col("event_type") == "add_to_cart", 1)).alias("add_to_carts"),
                 F.count(F.when(F.col("event_type") == "purchase", 1)).alias("purchases"),
                 F.coalesce(F.sum("amount"), F.lit(0)).cast("decimal(12,2)").alias("revenue")))

raw = read_raw("2026-10-02")
events, quarantine = transform(raw, "2026-10-02")
print("raw:", raw.count(), "valid unique:", events.count(), "quarantined:", quarantine.count())
print("late events (event_date before dt):", events.filter(F.col("event_date") < F.to_date(F.col("dt"))).count())
for r in quarantine.select("reason").groupBy("reason").count().orderBy("reason").collect():
    print(r["reason"], r["count"])
```

```text
raw: 44 valid unique: 41 quarantined: 2
late events (event_date before dt): 1
missing event_id or event_ts 1
unparseable 1
```

Where are the shuffles? `dropDuplicates` and `groupBy` each shuffle by key; reading and filtering do not. With one day of data both shuffles are small, so `spark.sql.shuffle.partitions` is set low; leaving the default of 200 would produce 200 tiny output files.

**Late events**: partitioning curated output by **processing date** (`dt`) keeps each run's output self-contained and rerunnable; the event's real date stays in `event_date` for analysts. If analysts need complete totals by event date, rebuild a by-event-date table for a short lookback window, or move to a table format with MERGE (see the extensions).

## Step 3: write curated Parquet idempotently

With `partitionOverwriteMode=dynamic`, `mode("overwrite")` replaces only the partitions present in the DataFrame being written. Running a date twice rewrites the same partition; other dates are untouched.

```python
CURATED = os.path.join(BASE, "curated")

def run(dt):
    raw = read_raw(dt)
    events, quarantine = transform(raw, dt)
    counts = {"raw": raw.count(), "events": events.count(), "quarantine": quarantine.count()}
    events.coalesce(1).write.mode("overwrite").partitionBy("dt").parquet(os.path.join(CURATED, "events"))
    quarantine.coalesce(1).write.mode("overwrite").partitionBy("dt").parquet(os.path.join(CURATED, "quarantine"))
    (daily_user_activity(events).coalesce(1).write.mode("overwrite")
        .partitionBy("dt").parquet(os.path.join(CURATED, "daily_user_activity")))
    raw.unpersist()
    return counts

def curated_totals():
    a = spark.read.parquet(os.path.join(CURATED, "daily_user_activity"))
    return sorted((r["dt"].isoformat() if hasattr(r["dt"], "isoformat") else str(r["dt"]), r["rows"], str(r["revenue"]))
                  for r in a.groupBy("dt").agg(F.count("*").alias("rows"), F.sum("revenue").alias("revenue")).collect())

for dt in ["2026-10-01", "2026-10-02", "2026-10-03"]:
    print(dt, run(dt))
before = curated_totals()
run("2026-10-02")                                    # rerun one date
assert curated_totals() == before
for row in before:
    print(*row)
print("rerun of 2026-10-02 left all partitions identical")
```

```text
2026-10-01 {'raw': 43, 'events': 40, 'quarantine': 2}
2026-10-02 {'raw': 44, 'events': 41, 'quarantine': 2}
2026-10-03 {'raw': 43, 'events': 40, 'quarantine': 2}
2026-10-01 8 278.04
2026-10-02 8 570.06
2026-10-03 8 827.16
rerun of 2026-10-02 left all partitions identical
```

`coalesce(1)` is fine at this size; at real volumes, size output files at roughly 128 MB to 1 GB each with `repartition` on the partition column, so the warehouse and query engines do not open thousands of small files.

## Step 4: unit-test the transformation

The transformation is a pure function of a DataFrame, so it can be tested on a hand-made input without files.

```python
def test_transform_dedups_and_quarantines():
    rows = [("e1", "u1", "view", None, "2026-10-05 10:00:00", None),
            ("e1", "u1", "view", None, "2026-10-05 10:00:00", None),      # duplicate
            (None, "u2", "view", None, "2026-10-05 11:00:00", None),       # no event_id
            (None, None, None, None, None, '{"bad json'),                  # corrupt line
            ("e2", "u2", "purchase", "19.99", "2026-10-05 12:00:00", None)]
    df = (spark.createDataFrame(rows, "event_id string, user_id string, event_type string, "
                                      "amount string, event_ts string, _corrupt_record string")
          .withColumn("amount", F.col("amount").cast("decimal(10,2)"))
          .withColumn("event_ts", F.col("event_ts").cast("timestamp")))
    events, quarantine = transform(df, "2026-10-05")
    assert sorted(r.event_id for r in events.collect()) == ["e1", "e2"]
    assert quarantine.count() == 2
    activity = {r.user_id: r for r in daily_user_activity(events).collect()}
    assert activity["u2"].purchases == 1 and str(activity["u2"].revenue) == "19.99"

test_transform_dedups_and_quarantines()
print("passed: test_transform_dedups_and_quarantines")
```

```text
passed: test_transform_dedups_and_quarantines
```

## Step 5: load the warehouse idempotently

Replace one date in one transaction: delete the date's rows, then load them from that date's curated files. If the load fails, the transaction rolls back and yesterday's good data is still there. In Snowflake (not executed here):

<!-- noexec -->
```sql
-- one-time setup: a storage integration avoids putting AWS keys in SQL
CREATE STAGE curated_stage
  URL = 's3://your-bucket/curated/'
  STORAGE_INTEGRATION = s3_curated_int
  FILE_FORMAT = (TYPE = PARQUET);

CREATE TABLE IF NOT EXISTS analytics.daily_user_activity (
  dt DATE, user_id STRING, views NUMBER, add_to_carts NUMBER, purchases NUMBER, revenue NUMBER(12, 2));

-- per run, for one processing date
BEGIN;
DELETE FROM analytics.daily_user_activity WHERE dt = '2026-10-02';
COPY INTO analytics.daily_user_activity (dt, user_id, views, add_to_carts, purchases, revenue)
  FROM (SELECT TO_DATE('2026-10-02'), $1:user_id::STRING, $1:views, $1:add_to_carts,
               $1:purchases, $1:revenue
        FROM @curated_stage/daily_user_activity/dt=2026-10-02/)
  FORCE = TRUE;              -- reload even if Snowflake's load history says these files were loaded
COMMIT;
```

Two details that interviewers probe:

- The partition column `dt` is in the **folder name**, not inside the Parquet file (Spark removes partition columns from the data files), which is why the `SELECT` supplies it.
- `COPY` skips files it has already loaded (load metadata is kept for 64 days), which protects against accidental double loads but would make a deliberate rerun load nothing after the `DELETE`. `FORCE = TRUE` is safe here **only because** the delete in the same transaction removed the old rows.

The same pattern runs on PostgreSQL, which is a good way to test the logic locally:

```sql
CREATE TABLE daily_user_activity (dt date, user_id text, purchases int, revenue numeric(12, 2));
CREATE TABLE staged_load (dt date, user_id text, purchases int, revenue numeric(12, 2));

INSERT INTO staged_load VALUES ('2026-10-02', 'u1', 1, 40.00), ('2026-10-02', 'u2', 2, 55.50);

-- run the same load twice: the result is the same
BEGIN;
DELETE FROM daily_user_activity WHERE dt = '2026-10-02';
INSERT INTO daily_user_activity SELECT * FROM staged_load WHERE dt = '2026-10-02';
COMMIT;
BEGIN;
DELETE FROM daily_user_activity WHERE dt = '2026-10-02';
INSERT INTO daily_user_activity SELECT * FROM staged_load WHERE dt = '2026-10-02';
COMMIT;

SELECT dt, count(*) AS rows, sum(revenue) AS revenue FROM daily_user_activity GROUP BY dt;
```

```text
     dt     | rows | revenue 
------------+------+---------
 2026-10-02 |    2 |   95.50
```

## Step 6: reconcile and schedule

Record counts per stage in a run log and check the equations that must hold:

- raw lines = valid lines + quarantined lines
- valid lines − duplicates = curated events
- curated rows for the date = warehouse rows for the date

A minimal Airflow 3 DAG that runs the date given by the schedule, so a backfill is just more runs:

<!-- noexec -->
```python
from airflow.sdk import dag, task
import pendulum

@dag(schedule="@daily", start_date=pendulum.datetime(2026, 10, 1, tz="UTC"), catchup=False, max_active_runs=3)
def events_daily():
    @task
    def spark_job(ds=None):
        ...   # submit the PySpark job with --dt {ds} (EMR Serverless, Glue or spark-submit)

    @task
    def load_warehouse(ds=None):
        ...   # run the DELETE + COPY transaction for ds

    @task
    def reconcile(ds=None):
        ...   # compare counts, fail the run if an equation does not hold

    spark_job() >> load_warehouse() >> reconcile()

events_daily()
```

`airflow backfill create --dag-id events_daily --from-date 2026-10-01 --to-date 2026-10-03` then reruns those dates through the same idempotent tasks.

## Security and cost notes for the README

- The job's IAM role can read `raw/`, write `curated/` and nothing else; the Snowflake storage integration gets read-only access to `curated/`. No access keys in code or SQL.
- Use an X-Small warehouse with a 60-second auto-suspend for the load; it runs for seconds per day.
- Lifecycle rules move `raw/` to a cheaper storage class after the reprocessing window you promise.

## Common mistakes

- **Schema inference on raw JSON**: types change when a field is missing in one file, and every run scans the data twice.
- **Static overwrite**: `mode("overwrite")` without dynamic partition overwrite deletes **every** date, not just the one processed.
- **`COPY` alone as the load**: without the delete it appends duplicates on rerun; with the delete but without `FORCE`, a rerun silently loads nothing.
- **Dropping corrupt records** with `DROPMALFORMED`, so nobody can say how much data was lost.
- **Hundreds of tiny Parquet files** per date from the default 200 shuffle partitions.

## Explaining it in an interview

"Files land in S3 by date; a PySpark job parameterised by the processing date reads only that folder with an explicit schema, quarantines malformed lines, deduplicates on event id and aggregates per user and day. It writes Parquet with dynamic partition overwrite, so reruns replace only that date. The warehouse load deletes and copies that date in one transaction. I proved idempotency by rerunning a date and comparing totals for every partition, and every run reconciles counts from raw to warehouse."

Be ready for: *Where are the shuffles?* (dedup and aggregation). *What about late events?* (kept with their real `event_date`; by-event-date totals need a lookback rebuild or MERGE). *Why not Snowpipe?* (a good extension for lower latency; this design favours simple, rerunnable daily batches).

---
previous: "projects:csv-to-warehouse-pipeline"
next: "projects:ecommerce-analytics-platform"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "S3 → PySpark → Snowflake Data Pipeline"
description: "An intermediate project: process raw files from object storage with PySpark, write curated Parquet, and load a cloud warehouse with idempotent, partitioned loads."
inventoryId: "PROJ-02"
technology: ["pyspark", "aws", "snowflake"]
topic: ["batch", "cloud"]
level: "Intermediate"
problemStatement: "Raw event files arrive in object storage every day. Clean and aggregate them with PySpark and load curated tables into a cloud warehouse for analysts, with each day reprocessable on demand."
requirements: ["Read one day of raw JSON or CSV files from object storage", "Clean, deduplicate and aggregate with PySpark", "Write curated Parquet partitioned by date", "Load the curated data into a warehouse table idempotently", "Document cost and access controls"]
technologies: ["PySpark", "Amazon S3 (or any object storage)", "Snowflake (or another cloud warehouse)", "Airflow (optional)"]
dataset: "Use a public event or trip dataset whose licence allows reuse, or generate synthetic events."
steps: ["Define the target tables and their grain", "Write a PySpark job that takes a processing date as a parameter", "Deduplicate on event id and validate required fields", "Write partitioned Parquet with overwrite for that date", "Load into the warehouse by deleting and re-inserting that date in a transaction", "Add checks comparing counts between stages", "Schedule with a daily DAG and test a backfill"]
testing: ["Run the job twice for one date and compare outputs", "Unit-test transformation functions with small DataFrames"]
dataQuality: ["Event ids unique per day", "Required fields non-null", "Counts reconcile from raw to curated to warehouse"]
monitoring: ["Job duration and row counts per stage", "Freshness of the latest loaded date"]
costConsiderations: ["Run Spark only for the processing window", "Use a small warehouse size that suspends automatically when idle", "Compact small files before loading"]
interviewQuestions: ["Where are the shuffles in your PySpark job?", "How do you make the warehouse load idempotent?", "How would you handle late-arriving files?"]
resumeBullets: ["Built a PySpark pipeline that processes daily raw files from object storage into partitioned Parquet and loads a cloud warehouse with idempotent, date-partitioned loads", "Added reconciliation checks between raw, curated and warehouse layers"]
extensions: ["Add incremental processing with a table format such as Delta Lake", "Add a data contract for the raw schema"]
related: ["articles:spark/partitions-shuffles-skew", "articles:pyspark/window-functions", "system-designs:scalable-batch-pipeline"]
---

## Business context

Most production batch pipelines look like this: files land in object storage, a distributed job cleans them, and a warehouse serves analysts. Building it end to end teaches the boundaries between storage, processing and serving.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw files land in <code>s3://bucket/raw/dt=YYYY-MM-DD/</code>.</li>
<li>PySpark reads one date, cleans and aggregates.</li>
<li>Curated Parquet is written to <code>curated/dt=YYYY-MM-DD/</code> with overwrite.</li>
<li>The warehouse table for that date is replaced in a transaction.</li>
</ol>
<figcaption>Every stage is keyed by processing date so any day can be rerun independently.</figcaption>
</figure>

Use least-privilege credentials for the job, never hard-code keys, and keep secrets in your platform's secret manager.

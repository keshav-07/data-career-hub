---
previous: "projects:ecommerce-analytics-platform"
next: "projects:kafka-spark-delta-streaming"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Large-Scale Batch Processing Pipeline"
description: "Intermediate PySpark project: process a multi-gigabyte dataset, tune partitions and joins in the Spark UI, and write idempotent partitioned output."
inventoryId: "PROJ-08"
technology: ["pyspark", "spark"]
topic: ["batch", "performance"]
level: "Intermediate"
problemStatement: "Process a large public dataset (several gigabytes or more) with PySpark into partitioned, query-ready tables, and document how you found and fixed the main performance bottleneck."
requirements: ["Read a dataset of at least several gigabytes", "Clean, join with a lookup table and aggregate", "Write partitioned Parquet or Delta output by date", "Rerun any date without duplicating output", "Record a before-and-after performance analysis from the Spark UI"]
technologies: ["PySpark", "Parquet or Delta Lake", "Local Spark or a small cloud cluster"]
dataset: "Use a large public dataset with a clear licence, such as public trip records or open web-analytics samples. Record the source and licence in your README."
steps: ["Explore a sample and define an explicit schema", "Write the job with a processing-date parameter", "Join with a small lookup table using a broadcast", "Aggregate to the target grain", "Write with partition overwrite for the processed date", "Run on the full data and capture the Spark UI", "Identify the slowest stage and fix its cause (skew, shuffle size or small files)", "Rerun and compare"]
testing: ["Unit tests for transformation functions on small DataFrames", "Rerun a date and compare row counts and checksums"]
dataQuality: ["Required columns non-null after cleaning", "Row counts reconcile from input to output, accounting for filtered rows"]
monitoring: ["Job duration, input and output rows per run", "Number and size of output files"]
costConsiderations: ["Run locally where possible; on cloud, use small clusters and shut them down", "Avoid many tiny output files"]
interviewQuestions: ["What was the slowest stage and why?", "How did you choose the number of partitions?", "How does your write stay idempotent?", "What would change at 100 times the data?"]
resumeBullets: ["Built a PySpark batch pipeline over a multi-gigabyte public dataset with partitioned, idempotent outputs", "Diagnosed the slowest stage in the Spark UI and resolved it by changing the join strategy and partitioning, documenting the analysis"]
extensions: ["Add Delta Lake and MERGE for late-arriving corrections", "Schedule daily runs and backfills with Airflow"]
related: ["articles:spark/partitions-shuffles-skew", "articles:spark/execution-model-jobs-stages-tasks", "articles:pyspark/joins-and-join-strategy"]
---

## Business context

Interviewers for Spark roles want evidence that you have worked with data too big for a laptop's memory and know how to find bottlenecks. This project produces exactly that evidence: a working job and a written performance analysis.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw files in a <code>raw/</code> folder or bucket.</li>
<li>PySpark job parameterised by processing date.</li>
<li>Broadcast join with a small lookup table.</li>
<li>Aggregation to the reporting grain.</li>
<li>Partitioned output with overwrite for the processed date.</li>
</ol>
<figcaption>A single rerunnable batch job; each date is processed independently.</figcaption>
</figure>

Write the performance analysis as you go: screenshots of the stage timeline, the task-duration spread, shuffle sizes and what changed after your fix. Report the timings you actually observed on your hardware.

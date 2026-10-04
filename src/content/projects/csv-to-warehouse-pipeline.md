---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "CSV to Data Warehouse Pipeline"
description: "A beginner project: load daily CSV files into a star schema with an idempotent loader, data-quality checks and tests you can explain in an interview."
inventoryId: "PROJ-01"
technology: ["python", "sql", "data-warehousing"]
topic: ["batch", "modelling"]
level: "Beginner"
problemStatement: "A small online shop exports orders as daily CSV files. Build a pipeline that loads them into a star schema so that sales can be reported reliably, even when files are resent or contain bad rows."
requirements: ["Load daily order CSV files into a local database", "Model the data as a fact table and at least two dimensions", "Reruns must not create duplicates", "Bad rows are logged and counted, not silently dropped", "Automated tests prove idempotency"]
technologies: ["Python", "SQLite or PostgreSQL", "SQL", "pytest"]
dataset: "Generate your own CSV files with a small script, or use any public sample retail dataset whose licence allows reuse."
steps: ["Design the star schema and write down the grain of the fact table", "Write the staging loader (see the idempotent loader tutorial)", "Write SQL to build dimensions from staging with upserts", "Build the fact table by overwriting each loaded date", "Add data-quality checks and an audit table", "Write tests, including a run-twice test", "Write a README with a diagram and how to run it"]
testing: ["Unit tests for row parsing", "A test that loads the same file twice and compares outputs", "A test with a corrected file that updates values"]
dataQuality: ["Row counts match between source file and staging (minus logged bad rows)", "Primary keys unique in every dimension", "Every fact row joins to its dimensions"]
monitoring: ["Log rows read, loaded and rejected per file", "Record each load in an audit table with a timestamp"]
costConsiderations: ["Runs locally at no cost", "Moving to a cloud database adds storage and compute cost; size accordingly"]
interviewQuestions: ["What is the grain of your fact table?", "What happens if the same file is loaded twice?", "How do you handle a bad row?", "How would this change for 100 times more data?"]
resumeBullets: ["Built an idempotent Python and SQL pipeline that loads daily order files into a star schema, with automated tests proving reruns do not duplicate data", "Implemented data-quality checks and an audit log that record rows read, loaded and rejected per file"]
extensions: ["Schedule it with Airflow", "Add slowly changing dimension type 2 for customers", "Move storage to a cloud warehouse"]
related: ["articles:python/idempotent-csv-loader", "articles:data-warehousing/star-schema"]
next: "projects:s3-pyspark-snowflake-pipeline"
---

## Business context

Reports built from hand-edited spreadsheets are slow and error-prone. A small, reliable pipeline with a clear model gives the shop consistent numbers every morning and is a good first project because every Data Engineering concept appears in miniature: modelling, idempotency, quality and testing.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Daily CSV files land in a <code>data/</code> folder.</li>
<li>A Python loader writes them to a staging table with upserts and an audit record.</li>
<li>SQL builds <code>dim_customer</code>, <code>dim_product</code> and <code>fact_order_line</code>.</li>
<li>Quality checks run; failures stop the report refresh.</li>
</ol>
<figcaption>A single-machine batch pipeline with staging, modelling and checks.</figcaption>
</figure>

Start from the [idempotent CSV loader tutorial](/python/idempotent-csv-loader/), then add the modelling layer described in [the star schema guide](/data-warehousing/star-schema/).

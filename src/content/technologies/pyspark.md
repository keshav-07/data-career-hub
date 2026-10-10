---
title: "PySpark for Data Engineers"
shortName: "PySpark"
description: "PySpark is the Python API for Apache Spark. Learn DataFrames, joins, window functions and how partitions and shuffles decide performance."
group: processing
order: 3
keyFacts: ["Python API over Spark’s distributed engine","Transformations are lazy; actions run the job","Shuffles and skew cause most performance problems"]
whatToLearnFirst: ["articles:pyspark/pyspark-fundamentals", "articles:pyspark/dataframes-and-schemas", "articles:pyspark/transformations-vs-actions"]
relatedTechnologies: ["spark","sql","python","delta-lake"]
cheatSheet: "cheat-sheets:pyspark"
monogram: "PS"
lessons: ["articles:pyspark/pyspark-fundamentals", "articles:pyspark/dataframes-and-schemas", "articles:pyspark/transformations-vs-actions", "articles:pyspark/aggregations-pivot-views", "articles:pyspark/joins-and-join-strategy", "articles:pyspark/window-functions", "articles:pyspark/udfs-and-safer-alternatives", "articles:pyspark/nested-data-explode", "articles:pyspark/reading-writing-data", "articles:pyspark/writing-efficient-output"]
updatedDate: 2026-10-09
---

PySpark lets you write distributed data processing in Python. DataFrames look familiar if you know SQL or pandas, but they are executed lazily across a cluster, so how data is partitioned and moved decides whether a job takes minutes or hours.

Start with DataFrames, schemas and lazy evaluation, then aggregations, joins and window functions, then UDF alternatives, nested data, and reading and writing files efficiently. The [Apache Spark course](/spark/) covers the engine underneath: jobs, stages, shuffles, skew, AQE and memory.

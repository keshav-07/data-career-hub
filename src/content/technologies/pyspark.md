---
title: "PySpark for Data Engineers"
shortName: "PySpark"
description: "PySpark is the Python API for Apache Spark. Learn DataFrames, joins, window functions and how partitions and shuffles decide performance."
group: processing
order: 3
keyFacts: ["Python API over Spark’s distributed engine","Transformations are lazy; actions run the job","Shuffles and skew cause most performance problems"]
whatToLearnFirst: ["articles:pyspark/window-functions"]
relatedTechnologies: ["spark","sql","python","delta-lake"]
cheatSheet: "cheat-sheets:pyspark"
updatedDate: 2026-10-04
---

PySpark lets you write distributed data processing in Python. DataFrames look familiar if you know SQL or pandas, but they are executed lazily across a cluster, so how data is partitioned and moved decides whether a job takes minutes or hours.

Learn DataFrames and joins first, then window functions, then the execution model (jobs, stages, tasks) and how to read the Spark UI.

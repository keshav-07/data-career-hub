---
title: "Apache Spark Architecture and Execution Model"
shortName: "Apache Spark"
description: "Understand how Spark turns your code into jobs, stages and tasks, and why partitions, shuffles and data skew drive performance."
group: processing
order: 4
keyFacts: ["Driver plans work; executors run tasks","A shuffle ends a stage and is the usual cost centre","Adaptive Query Execution can fix some skew at run time"]
whatToLearnFirst: ["articles:spark/partitions-shuffles-skew"]
relatedTechnologies: ["pyspark","delta-lake","kafka"]
monogram: "Sp"
lessons: ["articles:spark/apache-spark-architecture", "articles:spark/execution-model-jobs-stages-tasks", "articles:spark/partitions-shuffles-skew", "articles:spark/adaptive-query-execution"]
updatedDate: 2026-10-04
---

Spark is a distributed processing engine. Your code builds a plan; Spark splits it into stages at shuffle boundaries and runs each stage as parallel tasks over partitions. Most tuning comes down to controlling how much data moves between executors and how evenly it is spread.

Start with partitions and shuffles, then move to join strategies and Adaptive Query Execution.

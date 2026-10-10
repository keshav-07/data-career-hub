---
title: "Apache Spark Internals and Performance"
shortName: "Apache Spark"
description: "How Spark works inside: driver and executors, RDDs, jobs and stages, shuffles and skew, caching, Catalyst, AQE, memory tuning, Kubernetes, History Server."
group: processing
order: 4
keyFacts: ["Driver plans work; executors run tasks","A shuffle ends a stage and is the usual cost centre","Adaptive Query Execution is on by default since Spark 3.2","Spark 4 supports standalone, YARN and Kubernetes; Mesos was removed"]
whatToLearnFirst: ["articles:spark/apache-spark-architecture", "articles:spark/execution-model-jobs-stages-tasks", "articles:spark/partitions-shuffles-skew"]
relatedTechnologies: ["pyspark","delta-lake","kafka"]
monogram: "Sp"
lessons: ["articles:spark/apache-spark-architecture", "articles:spark/rdd-fundamentals", "articles:spark/execution-model-jobs-stages-tasks", "articles:spark/partitions-shuffles-skew", "articles:spark/caching-broadcast-accumulators", "articles:spark/catalyst-tungsten-optimizer", "articles:spark/adaptive-query-execution", "articles:spark/memory-executors-tuning", "articles:spark/deployment-monitoring"]
updatedDate: 2026-10-05
---

Spark is a distributed processing engine. Your code builds a plan; Spark splits it into stages at shuffle boundaries and runs each stage as parallel tasks over partitions. Most tuning comes down to controlling how much data moves between executors and how evenly it is spread.

The course runs from the architecture and RDD basics through the execution model, partitions, shuffles and skew, caching and shared variables, the Catalyst optimiser and Adaptive Query Execution, to memory tuning and running Spark on Kubernetes with the History Server. Examples were run on PySpark 4.2 and show real plans and metrics.

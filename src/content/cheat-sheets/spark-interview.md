---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Apache Spark Interview Cheat Sheet"
description: "The Spark concepts interviewers ask about most, in one page: lazy evaluation, stages and shuffles, joins, partitions, skew, AQE, caching and Spark 4 defaults."
inventoryId: "CHEAT-04"
technology: ["spark", "pyspark"]
topic: ["reference", "interview"]
cheatTopic: "Spark interview"
related: ["articles:spark/execution-model-jobs-stages-tasks", "articles:spark/partitions-shuffles-skew", "articles:spark/adaptive-query-execution", "interview-questions:spark/data-skew"]
versionContext: "Defaults checked on Spark 4.2"
---

## Execution model

| Term | One-line answer |
|------|-----------------|
| Transformation | Lazy; describes a new DataFrame |
| Action | Triggers execution (`count`, `collect`, `write`) |
| Job | Created by an action (AQE may run one action as several jobs) |
| Stage | Set of tasks between shuffle boundaries |
| Task | Work on one partition, run by one core |
| Driver | Plans and schedules; receives `collect()` results |
| Executor | Runs tasks, holds cache and shuffle data |

## Narrow vs wide

Narrow: `select`, `filter`, `withColumn`, `union`. Wide (shuffle): `groupBy`, `join` (non-broadcast), `distinct`, `repartition`, `orderBy`, windows with `partitionBy`.

## Joins

| Strategy | When |
|----------|------|
| Broadcast hash | One side ≤ `autoBroadcastJoinThreshold` (10 MB) or hinted |
| Sort-merge | Both sides large |
| Shuffle hash | Some cases via AQE or hints |

`left_anti` = rows with no match; `left_semi` = rows with a match, no right columns.

## Partitions

- Input: from file sizes and `spark.sql.files.maxPartitionBytes` (128 MB).
- Shuffle: `spark.sql.shuffle.partitions` (200), coalesced by AQE.
- `repartition` = full shuffle, up or down; `coalesce` = merge down, no full shuffle.

## Skew

Symptom: a few tasks much slower (max ≫ median in the Spark UI). Fixes: AQE skew join → broadcast small side → filter/isolate hot or NULL keys → salting.

## AQE (on by default)

Coalesces shuffle partitions, switches to broadcast joins at run time, splits skewed join partitions. Does not fix aggregation skew or excessive scanning.

## Caching

`cache()` only when a DataFrame is reused by several actions; `unpersist()` afterwards.

## Spark 4 defaults worth knowing

| Setting | Default |
|---------|---------|
| `spark.sql.ansi.enabled` | `true` (errors on invalid casts and overflow) |
| `spark.sql.adaptive.enabled` | `true` |
| `spark.sql.execution.pythonUDF.arrow.enabled` | `true` (when PyArrow is available) |

## Classic answers in one breath

- **Why is my job slow?** Check the Spark UI: which stage, task-time spread, shuffle size, spill; then fix skew, shuffles or scanning.
- **Why avoid Python UDFs?** Serialisation and an opaque function the optimiser cannot reason about; prefer built-ins or pandas UDFs.
- **Why did a join multiply rows?** Non-unique key on the right side.

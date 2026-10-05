---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "How would you investigate a suddenly slower data pipeline?"
seoTitle: "Investigating a Slow Data Pipeline: Interview Answer"
description: "Interview answer: confirm and scope the slowdown, find which step got slower, compare inputs and plans with a good run, then check data volume, skew, resources and changes."
inventoryId: "INT-30"
technology: ["data-engineering", "spark"]
topic: ["debugging", "performance"]
difficulty: "Medium"
questionType: ["debugging", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "First I confirm and scope it: which run, which step, since when, and whether the output is still correct. Then I compare a slow run with a recent good one: input volume, the execution plan, stage and task timings, and anything that changed (code deploys, configuration, upstream schemas, cluster size). The usual causes are data growth, a new skewed key, small files, a changed join strategy, resource contention or an upstream delay, and I fix the specific cause rather than just adding compute."
followUps: ["What would you look for in the Spark UI?", "How would you prevent this from recurring?", "The job is slow only on Mondays. What might cause that?"]
related: ["articles:spark/execution-model-jobs-stages-tasks", "interview-questions:spark/data-skew", "interview-questions:sql/optimize-slow-query"]
---

## Detailed explanation

### 1. Scope

- Is it every run or one? Since which date? One task or the whole DAG?
- Is the output still correct? (A slowdown caused by a join explosion also produces wrong data.)

### 2. Compare with a good run

| Compare | Where |
|---------|-------|
| Input rows and bytes | Source metrics, audit tables |
| Stage durations and task-time distribution | Spark UI / engine query profile |
| Physical plan (join strategies, shuffles) | SQL tab, `EXPLAIN` |
| Recent changes | Deploy history, config, upstream schema |
| Resources | Cluster size, queueing, concurrency |

### 3. Common causes and fixes

- **Volume growth** → partition pruning, incremental processing, scaling.
- **New skew** → AQE skew join, isolate hot keys, salting.
- **Small files** → compaction.
- **Plan change** (broadcast no longer chosen) → statistics, hints, threshold review.
- **Upstream delay** → it is waiting, not slow; fix the dependency or alerting.

### 4. Prevent recurrence

Track duration and input volume per run, alert on deviation from the recent baseline, and record root causes.

## Common mistakes

1. Adding nodes before understanding the cause.
2. Looking only at total duration instead of per-step and per-task timings.

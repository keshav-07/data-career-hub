---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "How should Airflow retries and idempotency work together?"
seoTitle: "Airflow Retries and Idempotency: Interview Answer"
description: "Interview answer: Airflow retries rerun a failed task, so each task must produce the same result for its data interval however many times it runs."
inventoryId: "INT-24"
technology: ["airflow", "data-engineering"]
topic: ["retries", "idempotency"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "Retries make Airflow rerun a failed task, possibly after it already wrote part of its output, so retries are only safe if the task is idempotent. Each task should process exactly its run's data interval, taken from the run context rather than the current time, and write by overwriting that interval's partition or upserting on a unique key inside a transaction. Then a retry, a manual clear or a backfill all produce the same final state."
followUps: ["Why should a task never use datetime.now() to choose its data?", "How would you make a task that sends an email idempotent?", "What retry settings would you use for a flaky API?"]
related: ["articles:airflow/dags-scheduling-retries", "interview-questions:data-engineering/idempotent-batch-pipeline", "interview-questions:python/exceptions-in-pipelines"]
versionContext: "Concepts apply to Airflow 2.x and 3.x"
---

## Detailed explanation

| Rerun cause | Why idempotency matters |
|-------------|-------------------------|
| Automatic retry | The first attempt may have written partial output |
| Manual "clear" of a task | Someone reruns after a fix |
| Backfill | Old intervals are processed again |

## Design rules

1. **Deterministic input**: use the run's data interval (`data_interval_start`, `data_interval_end`).
2. **Replace, not append**: partition overwrite, `MERGE`, or build-and-swap.
3. **Atomic writes**: transactions or table formats with atomic commits.
4. **Guard side effects**: record that a notification was sent for this run before sending again.
5. **Retry the right failures**: transient errors with backoff; let schema errors fail.

## Example settings

```python
from datetime import timedelta

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
}
```

## Common mistakes

1. Append-only loads with retries enabled.
2. Using the current time instead of the data interval.
3. Very high retry counts that hide a real failure for hours.

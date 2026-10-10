---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How do you backfill a pipeline safely?"
seoTitle: "Backfilling a Pipeline Safely: Interview Answer"
description: "Interview answer: rerun the normal idempotent job for past intervals in small chunks, limit concurrency, leave incremental state alone, validate in a shadow table and communicate."
technology: ["data-engineering", "airflow"]
topic: ["backfills", "idempotency", "operations"]
difficulty: "Medium"
questionType: ["scenario", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "A safe backfill reruns the normal production job for each past interval rather than a one-off script, which only works if the job is idempotent per interval (overwrite the partition or merge on a key). I split the range into small chunks, usually one day, limit concurrency so daily runs and the source are not overloaded, and do not touch the incremental watermark that daily runs depend on. For risky logic changes I build into a shadow table, diff it against production per partition, then swap. Before starting I check that raw data still exists for the range, and I tell consumers which dates will change and why."
followUps: ["How would you backfill three years of data in Airflow 3?", "What if raw data for part of the range has expired?", "How do you backfill a table that downstream incremental models read from?", "How do you know the backfill is finished and correct?"]
related: ["articles:etl-elt/incremental-loading-watermarks-backfills", "articles:airflow/operations-backfills-monitoring", "system-designs:backfill-late-data-handling-system", "interview-questions:data-engineering/idempotent-batch-pipeline", "system-designs:idempotent-reprocessing-system"]
sources:
  - { label: "Apache Airflow documentation: Backfill", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html" }
versionContext: "Python verified on Python 3.11 (standard library). The Airflow command was checked against the Airflow 3.3 CLI help."
---

## Detailed explanation

Backfills happen for good reasons: a bug fix, a new column, a new source, recovery after an outage. They are risky because they rewrite a lot of published data at once, often under time pressure. Cover these points.

### 1. Same code path, idempotent per interval

If the daily job is parameterised by its data interval and overwrites its partition (or merges on a key), then a backfill is just "run the job for each past interval". A hand-written backfill script is a second implementation that will differ from production in some detail.

### 2. Preconditions

- Raw data for the whole range still exists (retention, archived storage tiers).
- The source can handle the read load, or you read from the lake copy instead.
- You know which downstream tables depend on the output and how they will pick up the change. Incremental models downstream may need their own backfill, because they only process "new" rows by their own watermark.

### 3. Chunk and throttle

One day (or one partition) per run makes failures cheap and progress visible. Limit concurrency so the backfill does not starve the daily schedule or the warehouse. Order chunks deliberately: newest first gives consumers the most relevant corrections soonest, oldest first is required when a step depends on the previous day's output.

### 4. Leave incremental state alone

The daily pipeline's watermark says "everything up to here is loaded". A backfill rewrites specific historical intervals and should not reset it, or the next daily run reprocesses or skips data.

### 5. Validate, then publish

For a large logic change, write the backfill to a shadow table, compare it with production per partition (row counts, key counts, sums), review differences, then swap. For a routine rerun after an outage, normal data checks per partition are enough.

### 6. Communicate

Announce the dates that will change, why, and when it will be complete. Silent changes to last quarter's numbers destroy trust faster than the original bug.

## Example: a chunked plan with retries per chunk

```python
from datetime import date, timedelta

def chunks(start: date, end: date, days: int = 1):
    current = start
    while current <= end:
        yield current, min(current + timedelta(days=days), end + timedelta(days=1))
        current += timedelta(days=days)

def backfill(job, start, end, max_attempts=2):
    failed = []
    for lo, hi in chunks(start, end):
        for attempt in range(1, max_attempts + 1):
            try:
                job(lo, hi)                      # the normal, idempotent daily job
                break
            except TimeoutError:
                if attempt == max_attempts:
                    failed.append(lo.isoformat())
    return failed

attempts = {}
def job(lo, hi):
    attempts[lo] = attempts.get(lo, 0) + 1
    if lo == date(2026, 9, 2) and attempts[lo] == 1:
        raise TimeoutError("warehouse queue full")   # succeeds on the second attempt
    if lo == date(2026, 9, 4):
        raise TimeoutError("source unavailable")     # keeps failing

print(backfill(job, date(2026, 9, 1), date(2026, 9, 5)))
print(sum(attempts.values()), "job runs")
```

```text
['2026-09-04']
7 job runs
```

Only 4 September needs attention afterwards; every other day is done and, because each chunk is idempotent, rerunning 4 September later cannot disturb them.

In Airflow 3 the scheduler runs backfills, with a concurrency limit and a choice of whether to rerun dates that already succeeded:

```bash
airflow backfill create --dag-id daily_sales --from-date 2026-07-01 --to-date 2026-09-30 \
  --max-active-runs 3 --reprocess-behavior completed --dry-run
```

Remove `--dry-run` after checking the list of runs it would create.

## Trade-offs and pitfalls

- Shadow-and-swap is safer but doubles storage for the range and needs a swap step; for small corrections direct overwrite per partition is fine.
- Parallel chunks finish sooner but can overload the source or warehouse and break steps that depend on the previous day.
- If the job reads "current" dimension values, a backfill applies today's attributes to old facts. Decide whether that is intended, or join to the dimension as of the event date.
- Track the backfill like a release: a ticket, a list of dates, validation results.

## Common mistakes

1. A one-off script that differs from the production job.
2. Backfilling a non-idempotent (append) job and duplicating history.
3. Resetting the incremental watermark to the start of the backfill range.
4. Unlimited parallelism that takes down the source database.
5. Forgetting downstream incremental tables, which never see the corrected rows.

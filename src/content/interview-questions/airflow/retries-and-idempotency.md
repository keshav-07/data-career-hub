---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How should Airflow retries and idempotency work together?"
seoTitle: "Airflow Retries and Idempotency: Interview Answer"
description: "Interview answer: Airflow retries rerun a failed task, so each task must produce the same result for its data interval however many times it runs."
inventoryId: "INT-24"
technology: ["airflow", "data-engineering"]
topic: ["retries", "idempotency"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Retries make Airflow rerun a failed task, possibly after it already wrote part of its output, so retries are only safe if the task is idempotent. Each task should process exactly its run's slice of data, taken from the run context (logical date or data interval) rather than the current time, and write by overwriting that slice or upserting on a unique key inside one transaction. Then a retry, a manual clear or a backfill all leave the same final state."
followUps: ["Why should a task never use datetime.now() to choose its data?", "How would you make a task that sends an email idempotent?", "What retry settings would you use for a flaky API?", "Which errors should not be retried at all?"]
related: ["articles:airflow/best-practices-testing-cicd", "articles:airflow/operations-backfills-monitoring", "interview-questions:data-engineering/idempotent-batch-pipeline", "interview-questions:python/exceptions-in-pipelines"]
versionContext: "Example run on Apache Airflow 3.3.2 (Task SDK) with Python 3.11 and the standard library sqlite3 module as a stand-in warehouse. The concepts apply to Airflow 2.x too; Airflow 2 took retry_exponential_backoff as True/False."
sources:
  - { label: "Apache Airflow documentation: Best practices", url: "https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html" }
  - { label: "Apache Airflow documentation: Tasks", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html" }
---

## Detailed explanation

A task instance can run more than once for the same DAG run and logical date, for reasons that have nothing to do with your code being wrong:

| Rerun cause | Why idempotency matters |
|-------------|-------------------------|
| Automatic retry | The first attempt may have written partial output before it failed |
| Manual clear of a task | Someone reruns it after fixing a bug or an upstream problem |
| Backfill | Old intervals are processed again, maybe months later |
| Worker lost mid-task | The scheduler marks the task failed and retries it, while the first attempt's side effects remain |

An **idempotent** task leaves the target in the same final state whether it runs once or five times for the same interval. That is what makes all of the above safe. Retries then only decide *how often* and *how quickly* Airflow tries again.

### Design rules

1. **Deterministic input.** Read the slice for the run's own dates (`ds`, `logical_date`, `data_interval_start` and `data_interval_end`), never "the latest file" or `datetime.now()`.
2. **Replace, not append.** Overwrite the partition, `MERGE` on a key, or write to a temporary location and swap.
3. **Atomic writes.** Delete and insert in one transaction, or rely on a table format's atomic commit (Iceberg, Delta). A delete in one transaction and an insert in another leaves an empty partition if the task dies in between.
4. **Guard side effects.** Emails, payments and API calls cannot be rolled back. Record an idempotency key (for example `dag_id + run_id + task_id`) before or with the side effect, and skip it if the key exists.
5. **Retry only what can succeed later.** Timeouts, throttling and connection resets are transient. Schema errors, bad input and permission errors are not; raise `AirflowFailException` so the task fails at once.

## Example

Retry settings usually go in `default_args`. In Airflow 3, `retry_exponential_backoff` is a multiplier (0 disables it); Airflow 2 took a boolean:

```python
from datetime import datetime, timedelta
from airflow.sdk import dag, task
from airflow.exceptions import AirflowFailException

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": 2.0,          # 2, 4, 8 minutes ...
    "max_retry_delay": timedelta(minutes=30),  # ... capped here
    "execution_timeout": timedelta(minutes=20),
}

@dag(schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False, default_args=default_args)
def orders_daily():
    @task
    def load_orders(ds=None):
        if ds is None:
            raise AirflowFailException("no logical date: refuse to guess which day to load")
        ...

    load_orders()

d = orders_daily()
t = d.get_task("load_orders")
print(t.retries, t.retry_delay, t.retry_exponential_backoff, t.max_retry_delay)
```

```text
3 0:02:00 2.0 0:30:00
```

The load itself is idempotent because it replaces its day inside one transaction. Running it twice, as a retry or a clear would, leaves the same rows:

```python
import sqlite3

def load_day(conn, ds, rows):
    """Replace the rows for one logical date in a single transaction."""
    with conn:                                   # commits on success, rolls back on error
        conn.execute("DELETE FROM orders WHERE order_date = ?", (ds,))
        conn.executemany("INSERT INTO orders VALUES (?, ?, ?)", [(ds, oid, amt) for oid, amt in rows])

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE orders (order_date TEXT, order_id INTEGER, amount REAL)")
source = [(1, 40.0), (2, 15.5), (3, 9.0)]

load_day(conn, "2026-03-01", source)
load_day(conn, "2026-03-01", source)            # the retry
print(conn.execute("SELECT COUNT(*), SUM(amount) FROM orders WHERE order_date = '2026-03-01'").fetchone())
```

```text
(3, 64.5)
```

An append (`INSERT` only) would have produced 6 rows and doubled the revenue.

## Trade-offs and pitfalls

- **Partition overwrite** is simple and fast but rewrites the whole slice, so the slice must be small enough to rebuild. **Merge on a key** handles late updates but needs a reliable unique key and costs more per run.
- **Too many retries** hide real failures for hours. Three or four with backoff and a cap is a common starting point; tune it to how long the dependency's outages usually last.
- **Retries without `execution_timeout`**: a hung call never fails, so it is never retried and nobody is alerted.
- **Alerting on every retry** causes alert fatigue. Alert on the final failure (`on_failure_callback` or a notifier) and log retries.
- **Overwriting more than the run's slice** (for example truncating the whole table in a daily task) breaks backfills that run several days in parallel.

## Follow-up answers

- **Why not `datetime.now()`?** A retry an hour later, or a backfill next month, would read a different slice than the original run, so reruns are not reproducible.
- **Idempotent emails?** Insert a row keyed by `run_id` into a "notifications sent" table in the same transaction as the decision to send; skip if it already exists. Or move the email to the very end, after everything that can fail.
- **Flaky API?** Retries 3 to 5, `retry_delay` of a minute or two, exponential backoff with `max_retry_delay`, an `execution_timeout`, and a pool to cap concurrent calls so retries do not stampede the API.
- **Not retried?** Validation failures, missing required configuration, permission denied and schema mismatches: raise `AirflowFailException` for those.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Airflow Cheat Sheet"
description: "A quick Airflow reference: TaskFlow DAGs, schedules and data intervals, retries, templating, sensors, trigger rules and the Airflow 3 CLI commands you use most."
inventoryId: "CHEAT-08"
technology: ["airflow"]
topic: ["reference"]
cheatTopic: "Airflow"
related: ["articles:airflow/dags-scheduling-retries", "interview-questions:airflow/retries-and-idempotency"]
versionContext: "Imports and CLI checked on Airflow 3.3; Airflow 2.x notes included where they differ"
---

## A DAG with TaskFlow

```python
from datetime import datetime, timedelta
from airflow.sdk import dag, task          # Airflow 2.x: from airflow.decorators import dag, task

@dag(
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    default_args={"retries": 3, "retry_delay": timedelta(minutes=5)},
    tags=["orders"],
)
def orders_daily():
    @task
    def extract(ds=None):                  # ds = logical date as YYYY-MM-DD
        return f"s3://bucket/raw/dt={ds}/"

    @task
    def load(path: str):
        print("loading", path)

    load(extract())

orders_daily()
```

## Schedules

| Value | Meaning |
|-------|---------|
| `"@daily"`, `"@hourly"` | Presets |
| `"0 6 * * *"` | Cron |
| `None` | Manual or externally triggered only |

A run for an interval starts **after** the interval ends. Use `data_interval_start`, `data_interval_end` or `ds` to select data.

## Retries

`retries`, `retry_delay`, `retry_exponential_backoff`, `max_retry_delay`. Only safe with idempotent tasks.

## Trigger rules

`all_success` (default), `all_done` (cleanup), `one_failed` (alerting), `none_failed`.

## CLI (Airflow 3)

```bash
airflow dags list
airflow dags test orders_daily 2026-10-01           # run a whole DAG locally for one date
airflow tasks test orders_daily extract 2026-10-01  # run one task, no state recorded
airflow backfill create --dag-id orders_daily --from-date 2026-09-01 --to-date 2026-09-30
```

In Airflow 2.x, backfills used `airflow dags backfill -s START -e END dag_id`.

## Defaults that changed in Airflow 3

| Item | Airflow 2.x | Airflow 3 |
|------|-------------|-----------|
| TaskFlow imports | `airflow.decorators` | `airflow.sdk` |
| `catchup` default | `True` | `False` |
| Backfill CLI | `airflow dags backfill` | `airflow backfill create` |

## Rules of thumb

- Orchestrate, do not process: submit heavy work to Spark or the warehouse.
- Pass file paths or table names between tasks, not data.
- Make tasks idempotent and parameterised by the data interval.
- Set `catchup` explicitly.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Airflow Cheat Sheet"
description: "A quick Airflow 3 reference: TaskFlow DAGs, schedules and data intervals, retries, sensor modes, trigger rules, the CLI and what changed from Airflow 2."
inventoryId: "CHEAT-08"
technology: ["airflow"]
topic: ["reference"]
cheatTopic: "Airflow"
related: ["articles:airflow/dags-scheduling-retries", "interview-questions:airflow/retries-and-idempotency"]
versionContext: "The DAG example was parsed and run with dag.test() on Apache Airflow 3.3.2 (Python 3.11); CLI commands checked against the 3.3.2 CLI help. Airflow 2.x notes included where they differ."
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
| `"@daily"`, `"@hourly"` | Presets (cron shortcuts) |
| `"0 6 * * *"` | Cron: 06:00 every day |
| `timedelta(hours=4)` | Fixed frequency |
| `None` | Manual, API or externally triggered only |
| `[Asset("s3://lake/orders/")]` | Run when an upstream task updates the asset |

In Airflow 3 a cron string becomes a `CronTriggerTimetable`: the run fires **at** the cron time, its logical date is that time, and its data interval is empty (`data_interval_start == data_interval_end`). Airflow 2 used `CronDataIntervalTimetable`, where the run labelled 1 March covered 1 March and started on 2 March. If your tasks rely on the data interval, pass `CronTriggerTimetable(cron, timezone="UTC", interval=timedelta(days=1))` or set `[scheduler] create_cron_data_intervals = True`.

Select data with the run's own dates (`ds`, `logical_date`, `data_interval_start`, `data_interval_end`), never `datetime.now()`.

## Retries

`retries`, `retry_delay`, `retry_exponential_backoff` (a multiplier in Airflow 3, for example `2.0`; 0 disables it), `max_retry_delay`, `execution_timeout`. Raise `AirflowFailException` for errors a retry cannot fix. Only safe with idempotent tasks.

## Sensors

| Mode | Worker slot while waiting | Use for |
|------|---------------------------|---------|
| `mode="poke"` (default) | Held the whole time | Waits of a few minutes |
| `mode="reschedule"` | Released between pokes | Long waits, `poke_interval` of a minute or more |
| `deferrable=True` | Released; the triggerer waits | Long waits at scale (needs a running `airflow triggerer`) |

Set `timeout` (the default is 7 days) and `soft_fail=True` when a missing input should skip rather than fail. Between DAGs, prefer asset-aware scheduling over `ExternalTaskSensor`.

## Trigger rules

`all_success` (default), `all_done` (cleanup), `one_failed` (alerting), `none_failed`, `none_failed_min_one_success` (join after a branch). Prefer `.as_teardown()` tasks for cleanup so failures still show in the run state.

## CLI (Airflow 3)

```bash
airflow dags list
airflow dags test orders_daily 2026-10-01           # run a whole DAG locally for one date
airflow tasks test orders_daily extract 2026-10-01  # run one task, no state recorded
airflow backfill create --dag-id orders_daily --from-date 2026-09-01 --to-date 2026-09-30
```

In Airflow 2.x, backfills used `airflow dags backfill -s START -e END dag_id`.

## What changed in Airflow 3

| Item | Airflow 2.x | Airflow 3 |
|------|-------------|-----------|
| DAG authoring imports | `airflow.decorators`, `airflow.models` | `airflow.sdk` |
| Bash, Python, Empty operators | `airflow.operators.*` | `airflow.providers.standard.*` |
| Schedule argument | `schedule_interval` (renamed in 2.4) | `schedule` only |
| Cron timetable | `CronDataIntervalTimetable` | `CronTriggerTimetable` |
| `catchup` default | `True` | `False` |
| Run date in templates | `execution_date` | `logical_date` (can be `None` for manual runs) |
| Data dependencies | Datasets | Assets |
| Late-run alerting | `sla`, `sla_miss_callback` | Deadline alerts (3.1+) |
| Grouping | SubDAGs or TaskGroups | TaskGroups only |
| Backfill | `airflow dags backfill` in the CLI process | `airflow backfill create`, run by the scheduler |
| Default executor | SequentialExecutor | LocalExecutor |
| REST API | `/api/v1` | `/api/v2` with bearer tokens |

## Rules of thumb

- Orchestrate, do not process: submit heavy work to Spark or the warehouse.
- Pass file paths or table names between tasks, not data.
- Make tasks idempotent and parameterised by the data interval.
- Set `catchup` explicitly.

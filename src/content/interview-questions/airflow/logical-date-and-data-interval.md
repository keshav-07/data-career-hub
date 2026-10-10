---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What are the logical date and data interval in Airflow, and what changed in Airflow 3?"
seoTitle: "Airflow Logical Date and Data Interval Explained"
description: "Interview answer: the Airflow logical date labels the data a run covers; Airflow 3 removed execution_date and cron schedules fire with empty data intervals."
technology: ["airflow"]
topic: ["scheduling", "logical-date", "timetables"]
difficulty: "Medium"
questionType: ["conceptual", "debugging"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Every scheduled run has a logical date that identifies which period of data it owns, a data interval (data_interval_start and data_interval_end) that bounds that period, and a run_after time before which it cannot start. Airflow 2 called the logical date execution_date, and its cron default ran each interval after it ended, so the run labelled 1 March ran on 2 March. Airflow 3 removed execution_date and uses CronTriggerTimetable for cron strings: the run fires at the cron time, its logical date is that time and its data interval is empty unless you opt in."
followUps: ["After upgrading to Airflow 3 a daily job loads today's partition instead of yesterday's. Why?", "How do you get Airflow 2 style intervals back?", "What is the logical date of a manually triggered run?", "Why is ds a better filter than datetime.now()?"]
related: ["articles:airflow/dags-scheduling-retries", "articles:airflow/dag-fundamentals-taskflow", "interview-questions:airflow/catchup-and-backfill"]
versionContext: "Example run on Apache Airflow 3.3.2 with Python 3.11, using the scheduler-side timetable classes in airflow.timetables. Airflow 2 behaviour is described from the Airflow 3 upgrade guide."
sources:
  - { label: "Apache Airflow documentation: Timetables", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/timetable.html" }
  - { label: "Apache Airflow documentation: Dag runs", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "Apache Airflow documentation: Upgrading to Airflow 3", url: "https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html" }
---

## Detailed explanation

Three timestamps describe a scheduled run:

| Value | Meaning | Template variables |
|---|---|---|
| Logical date | The label of the data period the run is responsible for | `{{ logical_date }}`, `{{ ds }}`, `{{ ds_nodash }}` |
| Data interval | Start and end of that period | `{{ data_interval_start }}`, `{{ data_interval_end }}` |
| `run_after` | Earliest moment the scheduler may start the run | (on the DAG run) |

The run's **start date** (`dag_run.start_date`) is when it actually began, which can be much later during catchup or a backfill. Tasks should select data by the logical date or data interval, never by the start time or the wall clock, so a rerun processes the same slice.

### Why the name changed

Airflow 1 and early Airflow 2 called the logical date the **execution date**, and almost everyone read that as "when it executes". Airflow 2.2 introduced `logical_date` and data intervals; Airflow 3 removed `execution_date` and related names (`next_execution_date`, `prev_execution_date`, `yesterday_ds`, `tomorrow_ds`) from the context. A template using `{{ execution_date }}` now fails with an undefined-variable error.

### What changed for cron schedules

- **Airflow 2 default (`CronDataIntervalTimetable`)**: a daily run covers the previous interval. The run labelled 1 March 06:00 covers 1 March 06:00 to 2 March 06:00 and starts on 2 March at 06:00.
- **Airflow 3 default (`CronTriggerTimetable`)**: the run fires at the cron time. Its logical date is the fire time and its data interval is empty (start equals end).

To keep "process the previous day" semantics, either pass `CronTriggerTimetable(cron, timezone=..., interval=timedelta(days=1))`, which fires at the cron time with a data interval covering the previous 24 hours, or set `[scheduler] create_cron_data_intervals = True` to restore the Airflow 2 behaviour for all cron strings.

Runs triggered manually or through the API can have **no logical date** in Airflow 3 (`logical_date=None`), so code that formats `ds` should handle a missing value or the DAG should require one.

## Example

```python
from datetime import timedelta
import pendulum
from airflow.timetables.base import TimeRestriction
from airflow.timetables.interval import CronDataIntervalTimetable
from airflow.timetables.trigger import CronTriggerTimetable

def first_run(timetable, earliest):
    info = timetable.next_dagrun_info(
        last_automated_data_interval=None,
        restriction=TimeRestriction(earliest=earliest, latest=None, catchup=True),
    )
    fmt = lambda d: d.strftime("%d %b %H:%M")
    return (f"logical {fmt(info.logical_date)} | interval {fmt(info.data_interval.start)}"
            f" -> {fmt(info.data_interval.end)} | runs after {fmt(info.run_after)}")

start = pendulum.datetime(2026, 3, 1, tz="UTC")
print("Airflow 2 default:", first_run(CronDataIntervalTimetable("0 6 * * *", timezone="UTC"), start))
print("Airflow 3 default:", first_run(CronTriggerTimetable("0 6 * * *", timezone="UTC"), start))
print("Airflow 3 + 1 day:", first_run(CronTriggerTimetable("0 6 * * *", timezone="UTC",
                                                          interval=timedelta(days=1)), start))
```

```text
Airflow 2 default: logical 01 Mar 06:00 | interval 01 Mar 06:00 -> 02 Mar 06:00 | runs after 02 Mar 06:00
Airflow 3 default: logical 01 Mar 06:00 | interval 01 Mar 06:00 -> 01 Mar 06:00 | runs after 01 Mar 06:00
Airflow 3 + 1 day: logical 28 Feb 06:00 | interval 28 Feb 06:00 -> 01 Mar 06:00 | runs after 01 Mar 06:00
```

Read the first column of each line: with the Airflow 2 default, `ds` on the run that executes on 2 March is `2026-03-01`, the day being processed. With the Airflow 3 default, the run that executes on 1 March has `ds = 2026-03-01`, today. With `interval=timedelta(days=1)` the run that fires on 1 March is labelled 28 February and covers the previous 24 hours.

A query written for Airflow 2 as `WHERE order_date = '{{ ds }}'` therefore silently moves from "yesterday" to "today" after an upgrade. Filtering on the interval makes the intent explicit:

<!-- noexec -->
```sql
SELECT *
FROM raw.orders
WHERE created_at >= '{{ data_interval_start }}'
  AND created_at <  '{{ data_interval_end }}'
```

That filter only works if the interval is not empty, which is why the timetable choice matters.

## Trade-offs and pitfalls

- **Trigger timetables** are easier to reason about ("run at 06:00") and suit jobs that process "everything up to now". **Interval timetables** suit jobs that own a fixed period of data and must be reproducible per period.
- **Mixing styles across DAGs** breaks `ExternalTaskSensor` alignment, because the logical dates differ by one interval.
- **Timezone-naive `start_date`** means UTC. If the business day is in local time, use a timezone-aware start date or a timetable timezone, and remember that cron follows local wall-clock time across daylight saving changes.
- **`logical_date` is not the start time.** Use `dag_run.start_date` when you really need it, for example in an audit column.

## Follow-up answers

- **Today instead of yesterday after the upgrade**: cron strings switched to `CronTriggerTimetable`, so `ds` is now the fire date. Use an `interval=` on the timetable, set `create_cron_data_intervals = True`, or rewrite the query to `macros.ds_add(ds, -1)` deliberately.
- **Airflow 2 intervals back**: `[scheduler] create_cron_data_intervals = True` (and `create_delta_data_intervals` for timedelta schedules), or pass `CronDataIntervalTimetable` explicitly on the DAGs that need it.
- **Manual runs**: the trigger can set a logical date; if it does not, Airflow 3 allows `logical_date=None` and those runs have no data interval to process.
- **`ds` vs `now()`**: `ds` is fixed for the run, so retries and backfills reproduce the same slice; `now()` changes on every attempt.

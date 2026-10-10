---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is the difference between catchup and backfill in Airflow 3?"
seoTitle: "Airflow Catchup vs Backfill: Interview Answer"
description: "Interview answer: catchup lets the scheduler create missed runs automatically; a backfill is a deliberate, scheduler-managed rerun of a date range in Airflow 3."
technology: ["airflow"]
topic: ["catchup", "backfills", "scheduling"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Catchup is a DAG setting: when it is on, the scheduler automatically creates a run for every schedule tick between start_date (or the last run) and now. A backfill is an explicit request to create or rerun runs for a chosen date range. In Airflow 3 catchup defaults to False, and backfills are objects the scheduler runs (airflow backfill create, the UI or POST /api/v2/backfills) with a reprocess behaviour of none, failed or completed, their own max active runs and a dry run. Both are only safe if tasks are idempotent."
followUps: ["You turned on a DAG and it created 300 runs. Why, and how do you stop it?", "A bug corrupted the last two weeks. Walk through the fix.", "How did backfills work in Airflow 2, and what was wrong with that?", "What does depends_on_past do to a backfill?"]
related: ["articles:airflow/dags-scheduling-retries", "articles:airflow/operations-backfills-monitoring", "interview-questions:airflow/retries-and-idempotency", "system-designs:backfill-late-data-handling-system"]
versionContext: "Example run on Apache Airflow 3.3.2 with Python 3.11, using the scheduler's CronTriggerTimetable class to list runs. CLI options checked against the 3.3.2 `airflow backfill create --help`; the backfill commands themselves need a running scheduler and were not executed."
sources:
  - { label: "Apache Airflow documentation: Dag runs (catchup and backfill)", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "Apache Airflow documentation: Upgrading to Airflow 3", url: "https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html" }
---

## Detailed explanation

Both mechanisms produce runs for past logical dates, but they answer different questions.

| | Catchup | Backfill |
|---|---|---|
| What it is | A DAG argument (`catchup=True/False`) | An explicit request for a date range |
| Who triggers it | The scheduler, automatically, whenever it finds missed ticks | A person or a script (CLI, UI, REST API) |
| Which dates | Every tick from `start_date` (or the last run) up to now | Exactly the range you give, both ends inclusive |
| Existing runs | Never re-creates them | `--reprocess-behavior none` (skip), `failed` (rerun failed dates) or `completed` (rerun every date) |
| Default in Airflow 3 | `False` (`[scheduler] catchup_by_default`); it was `True` in Airflow 2 | Not applicable |
| Concurrency | `max_active_runs` of the DAG | Its own `--max-active-runs`, within the DAG's pools and limits |

**Catchup** suits pipelines where every interval must be processed in order and the DAG is meant to fill gaps itself, for example a daily partition load that should catch up after a weekend outage. It is dangerous when you deploy a new DAG with an old `start_date`: the scheduler creates every missing run at once.

**Backfills** are how you reprocess history on purpose: after adding a DAG that should cover last quarter, after fixing a bug, or after an outage when catchup is off. Airflow 3 rebuilt them. They are now **managed by the scheduler**, visible in the UI, and can be paused, unpaused and cancelled. In Airflow 2, `airflow dags backfill` ran inside the CLI process, so the backfill died with your terminal session and could conflict with the scheduler.

A useful Airflow 3 detail: backfill runs use the **latest DAG version** by default (the CLI flag `--run-on-latest-version` is marked experimental in 3.3), so today's code must be able to process old data.

## Example

The scheduler turns a schedule into runs through a timetable. This snippet asks the same timetable class the scheduler uses which runs a backfill of March 2026 would cover:

```python
import pendulum
from airflow.sdk import DAG
from airflow.providers.standard.operators.empty import EmptyOperator
from airflow.timetables.base import TimeRestriction
from airflow.timetables.trigger import CronTriggerTimetable

with DAG("orders_daily", schedule="0 2 * * *",
         start_date=pendulum.datetime(2026, 1, 1, tz="UTC"), max_active_runs=3) as orders:
    EmptyOperator(task_id="load")

print("catchup:", orders.catchup, "| timetable:", type(orders.timetable).__name__)

def runs_between(timetable, start, end):
    """Logical dates the timetable produces between start and end, as a backfill would."""
    last, out = None, []
    while True:
        info = timetable.next_dagrun_info(
            last_automated_data_interval=last,
            restriction=TimeRestriction(earliest=start, latest=end, catchup=True),
        )
        if info is None:
            return out
        out.append(info.logical_date)
        last = info.data_interval

march = runs_between(CronTriggerTimetable("0 2 * * *", timezone="UTC"),
                     pendulum.datetime(2026, 3, 1, tz="UTC"),
                     pendulum.datetime(2026, 3, 31, 23, 59, tz="UTC"))
print(len(march), "runs:", march[0].isoformat(), "...", march[-1].isoformat())
```

```text
catchup: False | timetable: CronTriggerTimetable
31 runs: 2026-03-01T02:00:00+00:00 ... 2026-03-31T02:00:00+00:00
```

With `catchup=True` and `start_date` on 1 January, unpausing this DAG in October would create about 280 runs, three at a time. With the default `catchup=False`, it creates only the latest one, and you backfill deliberately:

<!-- noexec -->
```bash
# See what would happen first
airflow backfill create --dag-id orders_daily \
  --from-date 2026-03-01 --to-date 2026-03-31 \
  --reprocess-behavior failed --max-active-runs 3 --dry-run

# Then run it; the scheduler executes the backfill and it appears in the UI
airflow backfill create --dag-id orders_daily \
  --from-date 2026-03-01 --to-date 2026-03-31 \
  --reprocess-behavior failed --max-active-runs 3
```

## Trade-offs and pitfalls

- **Non-idempotent tasks** turn both catchup and backfills into duplicates. Overwrite or merge per interval before you rerun anything.
- **`--reprocess-behavior completed`** rewrites good data too. Use it when the bug affected successful runs; otherwise `failed` or `none`.
- **Source and warehouse load**: thirty concurrent runs can overload an API or a database. Cap with `--max-active-runs` and pools.
- **`depends_on_past=True`** makes runs strictly sequential, and one failure blocks every later date. `--run-backwards` is not allowed with it.
- **Pausing with catchup off silently skips** the paused period. If the data matters, backfill it after unpausing.
- **Changing `start_date`** does not rewrite history; moving it earlier creates runs only if catchup is on.

## Follow-up answers

- **300 runs on unpause**: catchup was on (explicitly, or the DAG was written for Airflow 2 defaults) with an old `start_date`. Pause the DAG, mark or delete the unwanted queued runs, set `catchup=False`, and backfill the range you actually need with a concurrency limit.
- **Two weeks of corrupted data**: fix and deploy the code, confirm the tasks overwrite their partition, dry-run a backfill of the range with `--reprocess-behavior completed`, run it with limited concurrency, then validate row counts and key metrics against the source.
- **Airflow 2 backfills** ran in the CLI process outside the scheduler, so they stopped if the process died, were not managed objects, and used `airflow dags backfill -s START -e END dag_id`.
- **`depends_on_past`** forces each date to wait for the previous date's task to succeed, so the backfill runs one date at a time in order.

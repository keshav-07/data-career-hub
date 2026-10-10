---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What changed in Airflow 3, and how would you migrate Airflow 2 DAGs?"
seoTitle: "Airflow 2 to 3 Migration: Interview Answer"
description: "Interview answer: the Airflow 3 changes that break DAGs (imports, schedule, execution_date, SubDAGs, SLAs, cron intervals, catchup) and a safe step-by-step migration plan."
technology: ["airflow"]
topic: ["airflow-3", "migration", "upgrades"]
difficulty: "Hard"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Airflow 3 (April 2025) split the architecture (a separate DAG processor, an API server, and workers that talk to the Task Execution API instead of the metadata database) and cleaned up authoring: imports move to airflow.sdk and the standard operators to apache-airflow-providers-standard; schedule_interval, execution_date, SubDAGs, the SLA feature, SequentialExecutor and /api/v1 are gone; Datasets became Assets; catchup defaults to False; and cron strings use CronTriggerTimetable, so data intervals are empty unless you opt in. Migrate by linting with ruff's AIR rules, fixing imports and arguments, deciding the data-interval semantics per DAG, replacing direct database access in tasks, and running both versions side by side on test data before switching."
followUps: ["Which change silently changes results rather than failing loudly?", "Tasks used to query the metadata database directly. What now?", "What replaced SubDAGs and SLAs?", "How would you roll out the upgrade with minimal risk?"]
related: ["articles:airflow/dag-fundamentals-taskflow", "articles:airflow/dags-scheduling-retries", "interview-questions:airflow/logical-date-and-data-interval", "articles:airflow/best-practices-testing-cicd"]
versionContext: "The rewritten DAG was parsed and its settings inspected on Apache Airflow 3.3.2 with Python 3.11. The checker is a small illustrative regex script, not a replacement for ruff's AIR rules or the official upgrade guide."
sources:
  - { label: "Apache Airflow documentation: Upgrading to Airflow 3", url: "https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html" }
  - { label: "Apache Airflow 3.0 release notes", url: "https://airflow.apache.org/docs/apache-airflow/stable/release_notes.html" }
  - { label: "Ruff documentation: Airflow (AIR) rules", url: "https://docs.astral.sh/ruff/rules/#airflow-air" }
---

## Detailed explanation

### Changes that break or change DAGs

| Area | Airflow 2 | Airflow 3 | Fails loudly? |
|---|---|---|---|
| Authoring imports | `airflow.models.DAG`, `airflow.decorators` | `airflow.sdk` (`DAG`, `dag`, `task`, `Asset`, `Variable`, `BaseOperator`) | Deprecated shims for many; some fail |
| Core operators | `airflow.operators.bash`, `.python`, `.empty` | `airflow.providers.standard.*` | Shims warn; `airflow.operators.dummy` fails |
| Schedule argument | `schedule_interval`, `timetable` | `schedule` only | Yes |
| Run date | `execution_date`, `next_ds`, `yesterday_ds` | `logical_date`, `data_interval_*` | Yes (undefined template variable) |
| Cron semantics | `CronDataIntervalTimetable` (run after the interval) | `CronTriggerTimetable` (run at the tick, empty interval) | **No: results shift silently** |
| `catchup` default | `True` | `False` | **No: missed runs are skipped** |
| Data dependencies | Datasets | Assets | Yes (imports) |
| Grouping | SubDAGs | TaskGroups only | Yes |
| Late alerts | `sla`, `sla_miss_callback` | Deadline alerts (3.1+); `sla` is ignored with a warning | **No: alerts stop** |
| Executors | Sequential, Debug, CeleryKubernetes | Local (default), multiple executors | Config error |
| Database access in tasks | Direct ORM sessions allowed | Through the Task Execution API only | Yes, at run time |
| REST API | `/api/v1`, basic auth | `/api/v2`, bearer tokens | Yes (404) |
| Backfill | `airflow dags backfill` | `airflow backfill create` (scheduler-managed) | Yes |
| `retry_exponential_backoff` | Boolean | Multiplier (0 disables) | No |

The dangerous rows are the silent ones: a daily job that used `ds` to mean "yesterday" now processes "today", catchup no longer fills gaps, and SLA emails stop arriving.

### A migration plan

1. **Inventory**: list DAGs, providers, plugins, custom operators and every place that touches the metadata database, the REST API or `execution_date`.
2. **Lint**: run `ruff check --select AIR` (the AIR3 rules target Airflow 3 removals and moves) and fix imports and arguments; the upgrade guide lists the rest.
3. **Decide semantics per DAG**: for cron DAGs that rely on data intervals, pass `CronTriggerTimetable(..., interval=...)` or `CronDataIntervalTimetable` explicitly, or set `[scheduler] create_cron_data_intervals = True` globally; set `catchup` explicitly.
4. **Replace removed features**: SubDAGs with TaskGroups (or separate DAGs connected by assets), SLAs with deadline alerts, direct ORM access with the REST API or Task SDK calls, `/api/v1` clients with `/api/v2`.
5. **Test**: DagBag integrity tests on Airflow 3, `dag.test()` for critical DAGs, and a parallel run that compares outputs for the same logical dates.
6. **Cut over** per DAG group: pause in Airflow 2, unpause in Airflow 3, watch import errors, freshness and failures, and keep a rollback plan for the database migration.

## Example

A tiny checker for the patterns a review should flag, run on an Airflow 2 style file:

```python
import re

AIRFLOW2_DAG = '''
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.subdag import SubDagOperator
from datetime import datetime, timedelta

with DAG("orders", schedule_interval="@daily", start_date=datetime(2026, 1, 1)) as dag:
    BashOperator(task_id="load", bash_command="load.sh {{ execution_date }}",
                 sla=timedelta(hours=2))
'''

CHECKS = [
    (r"schedule_interval\s*=", "schedule_interval removed: use schedule="),
    (r"\{\{\s*(execution_date|next_ds|prev_ds|yesterday_ds|tomorrow_ds)", "removed context variable: use logical_date or data_interval_*"),
    (r"SubDagOperator|airflow\.operators\.subdag", "SubDAGs removed: use TaskGroup"),
    (r"\bsla\s*=|sla_miss_callback", "SLA feature removed: use deadline alerts"),
    (r"from airflow\.operators\.", "core operators moved: import from airflow.providers.standard"),
    (r"from airflow import DAG", "authoring API moved: from airflow.sdk import DAG"),
]
for line_no, line in enumerate(AIRFLOW2_DAG.splitlines(), 1):
    for pattern, message in CHECKS:
        if re.search(pattern, line):
            print(f"line {line_no}: {message}")
if "catchup" not in AIRFLOW2_DAG:
    print("file: catchup not set; Airflow 3 defaults to False (Airflow 2 defaulted to True)")
```

```text
line 2: authoring API moved: from airflow.sdk import DAG
line 3: core operators moved: import from airflow.providers.standard
line 4: SubDAGs removed: use TaskGroup
line 4: core operators moved: import from airflow.providers.standard
line 7: schedule_interval removed: use schedule=
line 8: removed context variable: use logical_date or data_interval_*
line 9: SLA feature removed: use deadline alerts
file: catchup not set; Airflow 3 defaults to False (Airflow 2 defaulted to True)
```

The Airflow 3 version keeps the Airflow 2 meaning of `ds` ("the day that just ended") explicitly:

```python
from datetime import datetime, timedelta
from airflow.sdk import DAG
from airflow.providers.standard.operators.bash import BashOperator
from airflow.timetables.trigger import CronTriggerTimetable

with DAG(
    "orders",
    schedule=CronTriggerTimetable("0 0 * * *", timezone="UTC", interval=timedelta(days=1)),
    start_date=datetime(2026, 1, 1),
    catchup=True,                                   # this DAG must fill gaps, as it did in Airflow 2
) as orders:
    BashOperator(task_id="load", bash_command="load.sh {{ data_interval_start | ds }}")

print(type(orders.timetable).__name__, orders.catchup, orders.get_task("load").bash_command)
```

```text
CronTriggerTimetable True load.sh {{ data_interval_start | ds }}
```

## Trade-offs and pitfalls

- **Global `create_cron_data_intervals = True`** is the fastest way to keep old semantics, but it hides the decision; per-DAG timetables document intent.
- **Relying on deprecation shims** works today but breaks when they are removed, and shims depend on the standard provider being installed.
- **Plugins and custom operators** that import from `airflow.models` or open database sessions need the most work; budget for them.
- **Upgrading Airflow and every provider at once** makes failures hard to attribute; pin with the constraints file and move in steps.
- **Skipping a parallel run** means the silent semantic changes are discovered by the business.

## Follow-up answers

- **Silent changes**: the cron timetable change (data intervals become empty, so `ds` and interval-based filters move by a day), the `catchup` default, and SLAs being ignored.
- **Direct database access**: tasks in Airflow 3 cannot open metadata database sessions; use the Task SDK (`Variable`, connections, XCom through the execution API) or the REST API with a token.
- **SubDAGs and SLAs**: TaskGroups (or assets between DAGs) and deadline alerts plus `execution_timeout`.
- **Rollout**: a staging Airflow 3 environment on a copy of the metadata database, linted and tested DAGs, parallel runs on test outputs, then a per-domain cut-over with Airflow 2 paused but kept for rollback.

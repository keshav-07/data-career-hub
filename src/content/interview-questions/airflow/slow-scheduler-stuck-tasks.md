---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Airflow is slow and tasks sit in scheduled or queued. How do you find the bottleneck?"
seoTitle: "Airflow Scheduler Slow, Tasks Stuck: Interview"
description: "Interview answer: debug a slow Airflow scheduler or stuck tasks by checking task states, DAG parsing, concurrency and pools, executors, then the metadata DB."
technology: ["airflow"]
topic: ["scheduler", "performance", "debugging", "scaling"]
difficulty: "Hard"
questionType: ["debugging", "optimization"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Start from the task states. Tasks stuck in scheduled mean the scheduler is holding them back: parallelism, max_active_tasks, max_active_runs, per-task limits, full pools (including default_pool's 128 slots) or depends_on_past. Tasks stuck in queued mean the executor has no capacity: workers down, a queue nobody serves, pods pending, a broker problem. If DAGs appear late or not at all, look at DAG parsing: top-level code, slow files and import errors. Underneath everything sits the metadata database. Measure with scheduler metrics (loop duration, starving tasks, open slots, parse times) before scaling anything."
followUps: ["Workers are idle but hundreds of tasks are scheduled. What do you check first?", "How do you find which DAG file slows parsing?", "When does adding a second scheduler help?", "What does airflow db clean do and why run it?"]
related: ["articles:airflow/executors-scaling", "articles:airflow/best-practices-testing-cicd", "articles:airflow/operations-backfills-monitoring", "interview-questions:airflow/choosing-an-executor"]
versionContext: "Example run on Apache Airflow 3.3.2 with Python 3.11; DagBag load statistics come from the same parser the DAG processor uses. The diagnosis function is a plain Python summary of the documented behaviour, not an Airflow API."
sources:
  - { label: "Apache Airflow documentation: Scheduler", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/scheduler.html" }
  - { label: "Apache Airflow documentation: Best practices (top-level code)", url: "https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html" }
  - { label: "Apache Airflow documentation: Metrics", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/metrics.html" }
---

## Detailed explanation

The path from file to running task has four stages, and each has its own bottleneck:

| Symptom | Stage | Usual causes | Where to look |
|---|---|---|---|
| DAG missing, late to update, or flagged as import error | **Parsing** (DAG processor) | Top-level API calls, `Variable.get` at module level, heavy imports, huge generated files, `dagbag_import_timeout` (30 s) | Import errors, `dag_processing.total_parse_time`, `dag_processing.last_duration`, `airflow dags report` |
| Runs not created on time | **Scheduling** | Slow scheduler loop, `max_active_runs`, a slow database | `scheduler.scheduler_loop_duration`, `dagrun.schedule_delay` |
| Tasks stay **scheduled** | **Critical section** (scheduler limits) | `[core] parallelism` (32 per scheduler), `max_active_tasks` (16), `max_active_tis_per_dag`, full pools, `depends_on_past`, priority starvation | `scheduler.tasks.starving`, `pool.open_slots.<pool>`, task instance details ("dependencies") |
| Tasks stay **queued** | **Executor** | No workers, unserved Celery queue, broker down, pods pending on quota or image pulls | `executor.queued_tasks`, `executor.open_slots`, worker and pod status; `task_queued_timeout` (600 s) fails them eventually |

The metadata database underlies all four. A small or overloaded instance slows parsing writes, the scheduler's queries and the API server at once.

### The order of fixes

1. **Fix DAG files first.** Move work out of top-level code, split giant files, avoid thousands of trivial tasks. It is usually the cheapest and biggest win.
2. **Raise the right limit**: resize the pool that is full, increase `max_active_tasks` for a DAG that legitimately runs wide, or `parallelism` if executor capacity is higher.
3. **Add capacity where the backlog is**: more Celery workers or cluster capacity for queued tasks; more DAG processors (`[dag_processor] parsing_processes`) for parsing; more schedulers only when the loop itself is the limit and the database can take it.
4. **Keep the database healthy**: connection pooling (PgBouncer), enough CPU and IOPS, and regular `airflow db clean` to purge old task instances, logs and XComs.

## Example

Find the file that slows parsing, the same way the DAG processor measures it:

```python
import os, tempfile, textwrap
from airflow.dag_processing.dagbag import DagBag

dags_dir = tempfile.mkdtemp(prefix="dags_")
template = '''
    import time
    from datetime import datetime
    from airflow.sdk import DAG
    from airflow.providers.standard.operators.empty import EmptyOperator
    time.sleep({delay})          # stands in for an API call or Variable.get at the top level
    with DAG("{dag_id}", schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False):
        EmptyOperator(task_id="noop")
'''
for dag_id, delay in [("fast_dag", 0), ("slow_dag", 1.5)]:
    with open(os.path.join(dags_dir, f"{dag_id}.py"), "w") as fh:
        fh.write(textwrap.dedent(template.format(dag_id=dag_id, delay=delay)))

bag = DagBag(dag_folder=dags_dir)
for stat in sorted(bag.dagbag_stats, key=lambda s: s.duration, reverse=True):
    print(f"{os.path.basename(stat.file):12} {stat.duration.total_seconds():5.1f} s  dags={stat.dag_num}")
```

```text
slow_dag.py    1.5 s  dags=1
fast_dag.py    0.0 s  dags=1
```

The DAG processor reparses each file about every 30 seconds by default (`[dag_processor] min_file_process_interval`), and each task start imports the file again, so 1.5 seconds of top-level work is paid constantly. On a real deployment `airflow dags report` prints the same table.

A compact way to reason about backlog in an interview or a runbook:

```python
def diagnose(scheduled, queued, running, parallelism, open_pool_slots, workers_free_slots):
    if scheduled and running >= parallelism:
        return "parallelism reached: raise [core] parallelism or add schedulers"
    if scheduled and open_pool_slots == 0:
        return "pool full: resize the pool or lower pool_slots on heavy tasks"
    if scheduled:
        return "DAG/task limits or depends_on_past: check max_active_tasks, max_active_tis_per_dag"
    if queued and workers_free_slots == 0:
        return "executor capacity: add workers or cluster capacity"
    if queued:
        return "workers idle but tasks queued: unserved queue, broker or pod start-up problem"
    return "no backlog: look at parsing and run creation instead"

print(diagnose(scheduled=240, queued=0, running=12, parallelism=32, open_pool_slots=0, workers_free_slots=20))
print(diagnose(scheduled=0, queued=85, running=32, parallelism=64, open_pool_slots=40, workers_free_slots=16))
```

```text
pool full: resize the pool or lower pool_slots on heavy tasks
workers idle but tasks queued: unserved queue, broker or pod start-up problem
```

## Trade-offs and pitfalls

- **Adding schedulers when the database or DAG files are the bottleneck** makes things worse: more processes competing for the same rows.
- **Scaling workers to hundreds while `parallelism` stays at 32** changes nothing.
- **`default_pool` at 128 slots** silently caps every task that does not name a pool.
- **Poke-mode sensors** fill slots while waiting; make them deferrable.
- **SQLite or a tiny database instance in production**: only one scheduler can run on SQLite, and every component waits on the database.
- **Measuring nothing**: without StatsD or OpenTelemetry metrics you are guessing.

## Follow-up answers

- **Idle workers, many scheduled tasks**: scheduler-side limits. Check pool open slots, `max_active_tasks` and `max_active_runs` on the DAG, `max_active_tis_per_dag` on the task, `parallelism`, and whether `depends_on_past` is waiting on an older run.
- **Slow parse file**: DagBag stats in a test, `airflow dags report`, and the `dag_processing.last_duration.<file>` metric; then look for top-level calls and heavy imports.
- **A second scheduler** helps when the scheduler loop is saturated (long `scheduler_loop_duration`) on a healthy PostgreSQL or MySQL 8 database; schedulers coordinate with row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`), so SQLite cannot do it.
- **`airflow db clean`** deletes rows older than a cutoff from tables such as task instances, logs, XComs and DAG runs, keeping the database small and queries fast; archive first if you need the history.

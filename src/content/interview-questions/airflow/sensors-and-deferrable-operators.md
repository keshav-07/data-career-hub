---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Poke, reschedule or deferrable: how should an Airflow sensor wait?"
seoTitle: "Airflow Sensors: Poke vs Reschedule vs Deferrable"
description: "Interview answer: poke mode holds a worker slot, reschedule frees it between checks, and deferrable sensors hand the wait to the triggerer, which scales best."
technology: ["airflow"]
topic: ["sensors", "deferrable-operators", "triggerer"]
difficulty: "Medium"
questionType: ["conceptual", "optimization"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "In poke mode a sensor stays running on a worker and sleeps between checks, holding a worker and pool slot for the whole wait; fine for waits of a few minutes. In reschedule mode it gives up the slot after each failed check and is started again after poke_interval, so long waits cost no slot, but every check is a full task start. A deferrable sensor hands the wait to an async trigger in the triggerer process, which can watch thousands of waits on one event loop; it is the best choice for long waits at scale. Always set a realistic timeout, because the default is seven days."
followUps: ["Fifty poke-mode sensors are blocking other DAGs. What is happening?", "What happens to deferred tasks if the triggerer is down?", "What is the difference between timeout and execution_timeout on a sensor?", "When would you avoid a sensor altogether?"]
related: ["articles:airflow/sensors-deferrable-operators", "articles:airflow/executors-scaling", "interview-questions:airflow/cross-dag-dependencies"]
versionContext: "Example run on Apache Airflow 3.3.2 with apache-airflow-providers-standard and Python 3.11. The slot arithmetic is a plain Python model with illustrative inputs, not a measurement."
sources:
  - { label: "Apache Airflow documentation: Sensors", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/sensors.html" }
  - { label: "Apache Airflow documentation: Deferrable operators and triggers", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/deferring.html" }
---

## Detailed explanation

A sensor is an operator whose `poke()` method returns `True` when a condition holds: a file exists, a partition landed, an API says "done". The **mode** decides what happens between checks.

| | Poke | Reschedule | Deferrable |
|---|---|---|---|
| Between checks | Sleeps on the worker | Task ends, state `up_for_reschedule` | Task ends, state `deferred`; a trigger waits |
| Worker and pool slot | Held for the whole wait | Released between checks | Released (pools can still count deferred tasks with `include_deferred`) |
| Cost per check | A function call | A full task start: process, DAG parse, context | An `await` in the triggerer's event loop |
| Good for | Waits of seconds to a few minutes | Long waits with intervals of a minute or more | Long waits, many sensors, any wait a provider supports deferrably |
| Needs | Nothing extra | Nothing extra | A running `airflow triggerer` and a trigger class importable there |

**How deferral works**: `execute()` calls `self.defer(trigger=..., method_name="execute_complete")`. Airflow stores the serialised trigger, ends the worker process and marks the task `deferred`. The triggerer imports the trigger and runs its `async def run()`; when it yields a `TriggerEvent`, the scheduler queues the task again and a worker calls `execute_complete(context, event)`. Many sensors and job operators in the providers accept `deferrable=True` (for example `FileSensor`, `ExternalTaskSensor`, `S3KeySensor`, `TimeDeltaSensor` and most job-submitting operators), and `[operators] default_deferrable` can turn it on by default.

**Timeouts**: `timeout` bounds the whole wait across all pokes and reschedules (default 7 days, `[sensors] default_timeout`); when it passes the sensor fails with `AirflowSensorTimeout` and is not retried, or is skipped if `soft_fail=True`. `execution_timeout` bounds one attempt and normal retries apply.

## Example

Three sensors waiting for the same file, one per mode:

```python
from datetime import datetime
from airflow.sdk import DAG
from airflow.providers.standard.sensors.filesystem import FileSensor

with DAG("wait_demo", schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False) as wait_demo:
    common = dict(filepath="orders_{{ ds }}.csv", fs_conn_id="fs_landing",
                  poke_interval=300, timeout=6 * 3600)
    FileSensor(task_id="poke_mode", mode="poke", **common)
    FileSensor(task_id="reschedule_mode", mode="reschedule", **common)
    FileSensor(task_id="deferred", deferrable=True, **common)

for t in wait_demo.tasks:
    print(f"{t.task_id:16} mode={t.mode:10} deferrable={t.deferrable} timeout={t.timeout}")
```

```text
poke_mode        mode=poke       deferrable=False timeout=21600.0
reschedule_mode  mode=reschedule deferrable=False timeout=21600.0
deferred         mode=poke       deferrable=True timeout=21600.0
```

The deferrable sensor still reports `mode=poke`; deferral replaces the waiting, not the mode attribute. A six-hour timeout matches how late the file can reasonably be, instead of the seven-day default.

Why it matters at scale, with illustrative numbers: 50 sensors per night that each wait about 3 hours for files.

```python
sensors, wait_hours, poke_minutes, check_seconds = 50, 3, 5, 20
poke_slot_hours = sensors * wait_hours                      # slot held the whole time
checks = sensors * wait_hours * 60 // poke_minutes          # every check starts a task
reschedule_slot_hours = checks * check_seconds / 3600
print(f"poke: {poke_slot_hours} slot-hours | reschedule: {checks} task starts, "
      f"{reschedule_slot_hours:.1f} slot-hours | deferrable: 0 worker slot-hours, {sensors} triggers")
```

```text
poke: 150 slot-hours | reschedule: 1800 task starts, 10.0 slot-hours | deferrable: 0 worker slot-hours, 50 triggers
```

With 32 worker slots, 50 poke-mode sensors can occupy every slot, including the ones the producing tasks need: a **sensor deadlock**.

## Trade-offs and pitfalls

- **Poke mode with long waits** wastes slots and can deadlock the deployment. Move to deferrable, or at least reschedule, and give sensors their own pool.
- **Reschedule with a short `poke_interval`** costs more than poke mode, because each check is a full task start.
- **Deferrable needs operations work**: a triggerer must run (and be highly available), triggers must be importable on it, and `run()` must never block (`time.sleep`, synchronous HTTP), or every trigger on that event loop stalls.
- **The file exists but is incomplete**: a sensor fires on the name. Have producers write a temporary name and rename, or wait for a `_SUCCESS` marker.
- **A wall of sensors waiting on another DAG** is often better replaced by asset-aware scheduling, which needs no polling at all.

## Follow-up answers

- **Fifty sensors blocking other DAGs**: they are in poke mode and hold every worker or pool slot, so other tasks (perhaps the producers) cannot start. Switch to `deferrable=True`, put sensors in a small dedicated pool, and set realistic timeouts.
- **Triggerer down**: deferred tasks stay deferred until a triggerer runs again; sensor timeouts still apply. Run at least two triggerers for high availability and alert on triggerer health and capacity.
- **`timeout` vs `execution_timeout`**: the first limits the total wait and does not retry; the second limits a single attempt and retries apply.
- **Avoid a sensor** when the producer can signal completion: update an asset, trigger the consumer through the REST API, or start it from an event (S3 notification to EventBridge).

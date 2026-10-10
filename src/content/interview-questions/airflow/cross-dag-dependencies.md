---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you make one Airflow DAG depend on another?"
seoTitle: "Airflow Cross-DAG Dependencies: Assets and Sensors"
description: "Interview answer: compare asset-aware scheduling, ExternalTaskSensor and TriggerDagRunOperator for cross-DAG dependencies, and why assets are the Airflow 3 default."
technology: ["airflow"]
topic: ["assets", "cross-dag-dependencies", "scheduling"]
difficulty: "Medium"
questionType: ["architecture", "conceptual"]
estimatedMinutes: 9
interviewRelevance: "High"
shortAnswer: "There are three main options. Asset-aware scheduling: the producer task declares an asset in its outlets, and the consumer DAG is scheduled on that asset (or an expression like orders & customers), so it runs when the producer succeeds, with no polling. ExternalTaskSensor: the consumer polls for a task or DAG run in the other DAG with a matching logical date, which breaks when schedules differ. TriggerDagRunOperator: the producer starts the consumer explicitly, which couples the producer to every consumer. Assets (renamed from Datasets in Airflow 3) are usually the best default because the producer does not need to know its consumers."
followUps: ["Why does an ExternalTaskSensor wait forever even though the upstream DAG succeeded?", "Two producers update an asset five times before the consumer runs. How many consumer runs are created?", "Does an asset event prove the data is correct?", "How would an external system mark an asset as updated?"]
related: ["articles:airflow/dags-scheduling-retries", "articles:airflow/sensors-deferrable-operators", "interview-questions:airflow/sensors-and-deferrable-operators"]
versionContext: "Example run on Apache Airflow 3.3.2 (Task SDK) with apache-airflow-providers-standard and Python 3.11; the DAGs were built and their timetables inspected, not scheduled."
sources:
  - { label: "Apache Airflow documentation: Asset definitions", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/assets.html" }
  - { label: "Apache Airflow documentation: Asset-aware scheduling", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/asset-scheduling.html" }
  - { label: "Standard provider documentation: ExternalTaskSensor", url: "https://airflow.apache.org/docs/apache-airflow-providers-standard/stable/sensors/external_task_sensor.html" }
---

## Detailed explanation

| Option | Direction | How it works | Main weakness |
|---|---|---|---|
| **Assets** (data-aware scheduling) | Consumer subscribes | A task with `outlets=[asset]` records an asset event when it succeeds; DAGs with `schedule=[asset]` (or `&`/`|` expressions) are triggered | An event means "the task succeeded", not "the data is good" |
| **ExternalTaskSensor** | Consumer polls | Waits for a task, task group or DAG run in another DAG with the same logical date (shift with `execution_delta` or `execution_date_fn`) | Date alignment; a waiting sensor uses a slot unless deferrable |
| **TriggerDagRunOperator** | Producer pushes | The producer starts a run of the consumer, optionally waiting for it | The producer must know and change for every consumer |
| REST API or asset watchers | External push | Another system calls `POST /api/v2/dags/{dag_id}/dagRuns`, or an `AssetWatcher` turns messages into asset events | Needs authentication and a contract outside Airflow |

**Assets in Airflow 3**: `Dataset` became `Asset` (`airflow.sdk`), `DatasetAlias` became `AssetAlias`, and the UI and API names changed with it. A producer can attach metadata to an event (`outlet_events[asset].extra = {...}`), and the consumer reads `triggering_asset_events`. `@asset` defines an asset and the DAG that materialises it in one decorator. `AssetOrTimeSchedule` combines "daily at 06:00, or earlier when the asset updates".

Assets turn hidden dependencies into a graph the UI can show (the asset view lists producers and consumers), and they remove polling entirely.

## Example

```python
from datetime import datetime
from airflow.sdk import DAG, Asset, dag, task
from airflow.providers.standard.operators.empty import EmptyOperator
from airflow.providers.standard.sensors.external_task import ExternalTaskSensor

orders = Asset("s3://lake/curated/orders/")
customers = Asset("s3://lake/curated/customers/")

@dag(schedule="0 2 * * *", start_date=datetime(2026, 1, 1), catchup=False)
def orders_producer():
    @task(outlets=[orders])
    def publish_orders(*, outlet_events, ds=None):
        # ... write s3://lake/curated/orders/dt=<ds>/ ...
        outlet_events[orders].extra = {"partition": ds}
    publish_orders()

with DAG("sales_mart", schedule=(orders & customers), start_date=datetime(2026, 1, 1)) as mart:
    EmptyOperator(task_id="build_mart")          # runs once both assets have new events

with DAG("legacy_report", schedule="0 2 * * *", start_date=datetime(2026, 1, 1), catchup=False) as legacy:
    ExternalTaskSensor(task_id="wait_for_orders", external_dag_id="orders_producer",
                       external_task_id="publish_orders", deferrable=True,
                       timeout=3 * 3600, check_existence=True)

producer = orders_producer()
print("producer outlets:", [a.uri for a in producer.get_task("publish_orders").outlets])
print("sales_mart:", type(mart.timetable).__name__, type(mart.timetable.asset_condition).__name__)
print("legacy_report:", type(legacy.timetable).__name__)
```

```text
producer outlets: ['s3://lake/curated/orders']
sales_mart: AssetTriggeredTimetable AssetAll
legacy_report: CronTriggerTimetable
```

Airflow normalised the URI (the trailing slash is gone), which is one more reason to define assets once and import them. `sales_mart` has no clock: it runs when both `orders` and `customers` have received events since its last run. `legacy_report` works only because both DAGs fire at 02:00 and therefore share logical dates; move one of them to 03:00 and the sensor looks for a run that never exists.

## Trade-offs and pitfalls

- **Asset URIs are identifiers.** A typo or a different trailing form creates a different asset. Define assets once in a shared module and import them.
- **Several producer updates collapse into one consumer run.** Read `triggering_asset_events` if each event matters (for example, one partition per event).
- **Asset events are not data quality.** Put checks in the producer before the task that declares the outlet succeeds.
- **ExternalTaskSensor alignment**: different schedules, start times, or one DAG with data intervals and the other without, all shift logical dates. Use `execution_delta` or `execution_date_fn`, `check_existence=True`, `failed_states`, and a timeout.
- **TriggerDagRunOperator chains** become a hidden call graph that only the producer's code documents.

## Follow-up answers

- **Sensor waiting forever**: there is no upstream run with the same logical date. Align schedules or shift with `execution_delta`; add `failed_states=["failed"]` so it stops early when upstream fails; or replace it with an asset.
- **Five updates before the consumer runs**: one consumer run, whose `triggering_asset_events` lists the queued events.
- **Asset event and correctness**: no; it records that a task with that outlet succeeded. Validate data before that task finishes.
- **External updates**: call the REST API (`POST /api/v2/assets/events`), or use an `AssetWatcher` with an event-driven trigger (for example a message queue) so messages create asset events.

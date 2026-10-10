---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you choose an orchestrator for data pipelines?"
seoTitle: "Choosing a Data Orchestrator: Interview Answer"
description: "Choosing a data orchestrator, interview answer: compare Airflow, Dagster, Prefect and cloud schedulers on scheduling, backfills, observability and team fit."
technology: ["data-engineering", "airflow"]
topic: ["orchestration", "architecture"]
difficulty: "Medium"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 8
interviewRelevance: "Medium"
shortAnswer: "I choose from requirements, not popularity: what has to be scheduled (time-based, event- or data-driven), how complex the dependencies are, how important backfills and reruns by interval are, what observability and alerting we need, who operates it, and what the team already knows. Airflow is the common default, with a large provider ecosystem and, in Airflow 3, asset-based scheduling and scheduler-managed backfills. Dagster is attractive when you think in data assets and want lineage and asset checks built in; Prefect suits Python-heavy, dynamic workflows. For a few jobs on one platform, its own scheduler (Databricks jobs, dbt Cloud, Step Functions) may be enough. Whatever I pick, tasks must be idempotent and parameterised by interval so the tool can retry and backfill safely."
followUps: ["What is the difference between time-based and asset- or data-aware scheduling?", "What should never run inside an orchestrator's workers?", "How would you migrate from cron scripts to an orchestrator?", "Managed or self-hosted Airflow?"]
related: ["articles:airflow/dags-scheduling-retries", "articles:airflow/dag-fundamentals-taskflow", "articles:etl-elt/modern-data-pipelines", "articles:aws/step-functions"]
sources:
  - { label: "Apache Airflow documentation: Asset definitions", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/assets.html" }
  - { label: "Dagster documentation: Assets", url: "https://docs.dagster.io/guides/build/assets" }
  - { label: "Prefect documentation", url: "https://docs.prefect.io/" }
versionContext: "The Airflow example was parsed with Apache Airflow 3.3.2. Tool descriptions reflect their documentation as of October 2026."
---

## Detailed explanation

An orchestrator decides **when** each task runs, in **what order**, and **what happens on failure**: schedules, dependencies, retries, timeouts, backfills, alerts and a history of runs. It should not do the heavy data processing itself; that belongs in Spark, the warehouse or a container the task launches.

### Criteria

| Criterion | Question |
|-----------|----------|
| Scheduling model | Cron-like intervals only, or also triggers when upstream data (an asset) is updated or an event arrives? |
| Interval semantics | Does each run get a data interval, so reruns and backfills are deterministic? |
| Backfills and reruns | Can you rerun a date range or one failed task without custom scripts? |
| Observability | Run history, logs, lineage, SLA or deadline alerts, integration with your alerting |
| Developer experience | Local testing, typing, unit tests of pipeline code, deploy from CI |
| Operations | Managed service available? Who upgrades, scales and secures it? |
| Ecosystem | Connectors or providers for your warehouse, cloud and tools |
| Team fit | What do people already know; how many pipelines and teams will share it? |

### The main options

- **Apache Airflow**: the most common in job descriptions. Python DAGs, a large provider ecosystem, managed offerings (Amazon MWAA, Google Cloud Composer, Astronomer). Airflow 3 added asset-based scheduling as a first-class concept (renamed from datasets), DAG versioning and bundles, a task SDK that separates task code from the scheduler, and backfills run by the scheduler.
- **Dagster**: centred on software-defined **assets** (the tables and files a pipeline produces) rather than tasks, with lineage, asset checks and partitions built in. Good fit for teams that think in datasets.
- **Prefect**: Python-first flows with dynamic, runtime-defined workflows and a managed control plane; low ceremony for script-like pipelines.
- **Platform schedulers**: Databricks jobs, dbt Cloud, Snowflake tasks, AWS Step Functions, Google Cloud Workflows. Simple to operate when most work lives on one platform, weaker for cross-system dependencies.

## Example: data-aware scheduling in Airflow 3

<!-- noexec -->
```python
import pendulum
from airflow.sdk import Asset, dag, task

raw_orders = Asset("s3://lake/raw/orders/")

@dag(schedule="@daily", start_date=pendulum.datetime(2026, 10, 1, tz="UTC"), catchup=False)
def ingest_orders():
    @task(outlets=[raw_orders], retries=3)
    def land(data_interval_start=None):
        ...                       # write one day of orders to the raw zone
    land()

@dag(schedule=[raw_orders], start_date=pendulum.datetime(2026, 10, 1, tz="UTC"), catchup=False)
def build_order_marts():         # runs whenever the raw orders asset is updated
    @task
    def dbt_build():
        ...
    dbt_build()

ingest_orders()
build_order_marts()
```

The marts DAG no longer guesses when ingestion finishes with a time offset or a sensor; it runs when the asset it depends on is updated. Dagster expresses the same dependency by declaring the marts asset as downstream of the raw asset.

## Trade-offs and pitfalls

- Self-hosting Airflow is flexible but a real operational job (metadata database, scheduler, workers, upgrades); managed services cost money but remove most of it.
- An orchestrator per team creates cross-team dependency problems; one shared platform needs ownership and conventions.
- Switching orchestrators is expensive mainly because of the tasks' assumptions; keep business logic in plain, testable code that the orchestrator calls.
- Cron plus scripts is fine for one job; it fails at dependencies, retries, history and backfills.

## Common mistakes

1. Picking a tool by popularity without stating requirements.
2. Doing heavy processing inside orchestrator workers.
3. Tasks that read "now" instead of their data interval, which makes every orchestrator's backfill feature useless.
4. Heavy top-level code in DAG files that slows parsing for every DAG.

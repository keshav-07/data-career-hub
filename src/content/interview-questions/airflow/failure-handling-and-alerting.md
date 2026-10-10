---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you handle task failures and alerting in Airflow?"
seoTitle: "Airflow Failure Handling and Alerting: Interview"
description: "Interview answer: classify errors, retry transient ones with backoff, fail fast on permanent ones, alert on final failure with callbacks or notifiers, and use deadline alerts for late runs."
technology: ["airflow"]
topic: ["alerting", "callbacks", "retries", "deadline-alerts"]
difficulty: "Medium"
questionType: ["scenario", "conceptual"]
estimatedMinutes: 9
interviewRelevance: "High"
shortAnswer: "Start by classifying failures. Transient ones (timeouts, throttling) get retries with exponential backoff, a cap and an execution_timeout. Permanent ones (bad input, missing permissions) raise AirflowFailException so they fail at once. Alert on the final failure, not every retry, with on_failure_callback or a provider notifier such as SlackNotifier, at task or DAG level. A run that never fails but is late needs a deadline alert (Airflow 3.1+, replacing the removed SLA feature), and Airflow itself needs monitoring of the scheduler heartbeat, import errors and queued tasks, because a dead scheduler produces no task failures at all."
followUps: ["Why not alert in on_retry_callback?", "How do you alert when a DAG did not run at all?", "What happened to sla and sla_miss_callback?", "How do you make cleanup run even when the main task fails?"]
related: ["articles:airflow/operations-backfills-monitoring", "articles:airflow/dags-scheduling-retries", "interview-questions:airflow/retries-and-idempotency", "articles:etl-elt/pipeline-observability"]
versionContext: "Example run on Apache Airflow 3.3.2 (Task SDK) with Python 3.11 and a SQLite metadata database, using dag.test(). The Slack notifier and deadline alert configuration are written from the provider and Airflow documentation and not executed."
sources:
  - { label: "Apache Airflow documentation: Callbacks", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html" }
  - { label: "Apache Airflow documentation: Deadline Alerts", url: "https://airflow.apache.org/docs/apache-airflow/stable/howto/deadline-alerts.html" }
  - { label: "Apache Airflow documentation: Logging and monitoring", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/index.html" }
---

## Detailed explanation

A good failure strategy answers four questions.

1. **Should this error be retried?** Transient: network timeouts, HTTP 429 and 5xx, warehouse queueing, lock timeouts. Permanent: validation failures, schema mismatches, permission denied, missing configuration. Retry the first with `retries`, `retry_delay`, `retry_exponential_backoff` (a multiplier in Airflow 3) and `max_retry_delay`; raise `AirflowFailException` for the second so the task fails immediately without using up retries.
2. **Can a task hang?** Set `execution_timeout` on tasks and `dagrun_timeout` on the DAG. A hung task never fails, so without a timeout nothing retries and nobody is told.
3. **Who is told, and when?** Alert on the **final** failure:
   - Task callbacks: `on_failure_callback`, `on_retry_callback`, `on_success_callback`, `on_execute_callback`, `on_skipped_callback`.
   - DAG callbacks: `on_failure_callback`, `on_success_callback` on the DAG run.
   - **Notifiers**: ready-made callbacks from providers (`SlackNotifier`, `SmtpNotifier` and others), or your own `BaseNotifier` subclass.
4. **What about "it did not fail, it just did not finish"?** That is a deadline alert: a reference time (for example the run's logical date or queue time), an interval, and a callback that fires if the run has not finished by then. The Airflow 2 `sla` argument and `sla_miss_callback` were removed in Airflow 3.0, and deadline alerts arrived in 3.1.

Then monitor Airflow itself: scheduler heartbeat, DAG import errors, tasks stuck in queued, triggerer health, and the `/api/v2/monitor/health` endpoint. Freshness checks on key tables catch the case where nothing ran at all.

## Example

A transient error is retried, a permanent one fails at once, and the failure callback fires only on the final failure:

```python
import contextlib, io, tempfile
from datetime import datetime, timedelta
from airflow.dag_processing.bundles.manager import DagBundlesManager
from airflow.dag_processing.dagbag import DagBag, sync_bag_to_db
from airflow.exceptions import AirflowFailException
from airflow.sdk import dag, task
from airflow.utils.session import create_session

events = []

def alert_on_failure(context):
    ti = context["ti"]
    events.append(f"ALERT {ti.task_id} failed after try {ti.try_number}: {context['exception']}")

def note_retry(context):
    events.append(f"retry {context['ti'].task_id} (try {context['ti'].try_number})")

attempts = {"n": 0}

@dag(schedule=None, start_date=datetime(2026, 1, 1),
     default_args={"retries": 2, "retry_delay": timedelta(seconds=0),
                   "on_failure_callback": alert_on_failure, "on_retry_callback": note_retry})
def failure_demo():
    @task
    def flaky_api():
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise TimeoutError("upstream API timed out")
        return "ok"

    @task
    def validate(_):
        raise AirflowFailException("schema mismatch: column amount missing")

    validate(flaky_api())

def run_dag(d):
    with contextlib.redirect_stdout(io.StringIO()):
        DagBundlesManager().sync_bundles_to_db()
        bag = DagBag(dag_folder=tempfile.mkdtemp())
        bag.dags[d.dag_id] = d
        sync_bag_to_db(bag, "dags-folder", None)
        dr = d.test()
    with create_session() as session:
        return str(dr.state), {ti.task_id: str(ti.state) for ti in dr.get_task_instances(session=session)}

print(run_dag(failure_demo()))
print(*events, sep="\n")
```

```text
('failed', {'flaky_api': 'success', 'validate': 'failed'})
retry flaky_api (try 1)
ALERT validate failed after try 1: schema mismatch: column amount missing
```

`flaky_api` recovered on its second try with only a log-level retry event; `validate` had two retries configured but failed on the first try because the error cannot be fixed by waiting.

In production the callback is usually a notifier, set once in `default_args` or on the DAG:

<!-- noexec -->
```python
from airflow.providers.slack.notifications.slack import SlackNotifier

default_args = {
    "on_failure_callback": SlackNotifier(
        slack_conn_id="slack_alerts",
        text="{{ dag.dag_id }}.{{ ti.task_id }} failed for {{ ds }}: {{ ti.log_url }}",
        channel="#data-alerts",
    ),
}
```

## Trade-offs and pitfalls

- **Alerting on retries** creates noise and alert fatigue. Log retries; page on final failures of critical DAGs; send the rest to a channel.
- **Callbacks that raise or are slow** run inside Airflow components; keep them short, wrap them in try/except, and never let a failed alert hide the original error.
- **`all_done` cleanup tasks as leaves** can make a failed run look successful, because the run state comes from leaf tasks. Use `.as_teardown()` for cleanup.
- **Email alerts without SMTP configured** silently do nothing; most teams use chat or paging notifiers.
- **Retrying non-idempotent tasks** turns a transient failure into duplicate data.

## Follow-up answers

- **Not in `on_retry_callback`**: most retries succeed, so alerting there wakes people for problems that fixed themselves. Use it for metrics or logs.
- **DAG did not run at all**: no task failed, so no callback fires. Use a deadline alert, a freshness check on the output table, and alerts on scheduler heartbeat and import errors.
- **SLAs**: removed in Airflow 3.0 (they were evaluated in the scheduler loop and fired only for scheduled runs); use `DeadlineAlert` with a `DeadlineReference` and an interval, plus `execution_timeout` for single tasks.
- **Cleanup that always runs**: a teardown task (`cleanup.as_teardown(setups=create)`), which runs even if work fails and does not hide the failure, or `trigger_rule="all_done"` with a normal task still as a leaf.

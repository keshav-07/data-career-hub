---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you choose an Airflow executor: Local, Celery, Kubernetes or several?"
seoTitle: "Choosing an Airflow Executor: Interview Answer"
description: "Interview answer: choose an Airflow executor: Local for one machine, Celery for warm workers, Kubernetes for isolation, or combine them in Airflow 3."
technology: ["airflow"]
topic: ["executors", "scaling", "architecture"]
difficulty: "Hard"
questionType: ["architecture", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "The executor decides where task instances run. LocalExecutor (the Airflow 3 default) runs them as processes on the scheduler's machine: simplest, but scales only vertically. CeleryExecutor sends tasks through a broker to long-running workers: low start-up latency and queues for routing, but shared environments and a broker to operate. KubernetesExecutor starts one pod per task: strong isolation, per-task images and resources and no idle workers, but seconds of start-up per task. Since Airflow 2.10 you can configure several executors at once and pick one per task or DAG, which replaced the CeleryKubernetesExecutor removed in Airflow 3."
followUps: ["How would you send only ML training tasks to Kubernetes?", "Tasks pile up in queued. Which executor-side causes do you check?", "Why was the SequentialExecutor removed?", "How is KubernetesPodOperator different from KubernetesExecutor?"]
related: ["articles:airflow/executors-scaling", "articles:airflow/operators-hooks-providers", "interview-questions:airflow/slow-scheduler-stuck-tasks"]
versionContext: "Configuration defaults read from an Apache Airflow 3.3.2 installation (Python 3.11) and the per-task executor argument checked on it. Celery, Kubernetes and multi-executor deployment settings are written from the Airflow and provider documentation and were not executed."
sources:
  - { label: "Apache Airflow documentation: Executor", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/index.html" }
  - { label: "Apache Airflow documentation: Upgrading to Airflow 3", url: "https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html" }
  - { label: "Celery provider documentation: CeleryKubernetes Executor", url: "https://airflow.apache.org/docs/apache-airflow-providers-celery/stable/celery_kubernetes_executor.html" }
---

## Detailed explanation

The scheduler decides *what* is ready; the executor decides *where and how* it runs. A good answer starts from the workload: how many tasks, how heavy, how spiky, how different their dependencies are, and who operates the platform.

| | LocalExecutor | CeleryExecutor | KubernetesExecutor |
|---|---|---|---|
| Where tasks run | Processes on the scheduler host | Long-running Celery workers | One pod per task instance |
| Extra infrastructure | None | Broker (Redis or RabbitMQ), workers | A Kubernetes cluster |
| Start-up latency | Very low | Low (warm workers) | Seconds or more (schedule pod, pull image) |
| Isolation | None; shared machine and Python | Per worker class (queues) | Per task: own image, CPU, memory |
| Scaling | Vertical (bigger box) | Add workers; autoscale on queue length (KEDA in the Helm chart) | Elastic with the cluster |
| Idle cost | One machine | Workers running when idle | Little beyond the cluster itself |
| Logs | Local disk | Remote logging recommended | Remote logging required (pods disappear) |
| Package | Core | `apache-airflow-providers-celery` | `apache-airflow-providers-cncf-kubernetes` |

Other executors exist too, such as the AWS ECS, Batch and Lambda executors in the Amazon provider and the EdgeExecutor for workers in remote locations.

**Airflow 3 changes worth naming**: the SequentialExecutor and DebugExecutor were removed (LocalExecutor is the default, and `dag.test()` replaces debugging); the CeleryKubernetesExecutor and LocalKubernetesExecutor hybrids are not supported, because they abused the `queue` field to pick the sub-executor. Instead, list several executors in `[core] executor` and choose per task or DAG with the `executor` argument; `queue` keeps its normal Celery-routing meaning.

**Rules of thumb**

- Small team, tens of DAGs, heavy work pushed to Spark or the warehouse: **LocalExecutor** with PostgreSQL.
- Many short, frequent tasks with similar dependencies: **Celery**, with queues for heavy or GPU worker classes.
- Many teams with conflicting dependencies, spiky load, strict isolation: **Kubernetes**.
- A mix: **Celery as the default plus Kubernetes for the heavy or unusual tasks**, through multiple executors.

## Example

Read the defaults that bound capacity, and assign one task to a second executor:

```python
from datetime import datetime
from airflow.configuration import conf
from airflow.sdk import dag, task

for section, key in [("core", "executor"), ("core", "parallelism"),
                     ("celery", "worker_concurrency"), ("scheduler", "task_queued_timeout")]:
    print(f"[{section}] {key} = {conf.get(section, key)}")

@dag(schedule=None, start_date=datetime(2026, 1, 1))
def mixed_executors():
    @task
    def small_api_call(): ...

    @task(executor="KubernetesExecutor")      # only this task runs in its own pod
    def train_model(): ...

    small_api_call() >> train_model()

d = mixed_executors()
for t in d.tasks:
    print(f"{t.task_id:15} executor={t.executor} queue={t.queue}")
```

```text
[core] executor = LocalExecutor
[core] parallelism = 32
[celery] worker_concurrency = 16
[scheduler] task_queued_timeout = 600.0
small_api_call  executor=None queue=default
train_model     executor=KubernetesExecutor queue=default
```

`executor=None` means "the default executor", which is the first one listed in configuration. A deployment that uses both would set:

<!-- noexec -->
```ini
[core]
executor = CeleryExecutor,KubernetesExecutor
parallelism = 64

[celery]
worker_concurrency = 16

[kubernetes_executor]
pod_template_file = /opt/airflow/pod_templates/default.yaml
```

Capacity is the smallest of the limits: `parallelism` per scheduler, DAG and task concurrency settings, pool slots, and executor capacity (Celery workers × `worker_concurrency`, or what the cluster can schedule).

## Trade-offs and pitfalls

- **LocalExecutor with heavy tasks** starves the scheduler on the same machine. Keep compute in external engines.
- **Celery's broker is critical infrastructure**: if it loses messages or a queue has no worker, tasks sit in `queued` until `task_queued_timeout` fails them. Broker visibility timeouts shorter than your longest task can cause duplicate execution.
- **One huge Celery worker image** with every library is slow to build and full of conflicts; use queues, virtualenv-based tasks or pods for outliers.
- **KubernetesExecutor with thousands of tiny tasks** pays pod start-up every time; batch the work into fewer tasks.
- **Raising `parallelism` without capacity** (or the reverse) changes nothing; the smallest limit wins.

## Follow-up answers

- **Only training on Kubernetes**: `[core] executor = CeleryExecutor,KubernetesExecutor`, then `@task(executor="KubernetesExecutor", executor_config={"pod_override": ...})` with the memory and GPU requests on the training tasks.
- **Stuck in queued**: workers down or not listening to that queue, broker problems, pods pending on quota or image pulls, or no free worker slots. Queued means the scheduler did its part.
- **SequentialExecutor**: it ran one task at a time and existed because SQLite could not handle concurrent writers; Airflow 3 made LocalExecutor work for local development and removed it.
- **KPO vs KubernetesExecutor**: the executor runs *every* task in a pod running Airflow's task runner; `KubernetesPodOperator` is a single task that runs *your* container, with any executor.

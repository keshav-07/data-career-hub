---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How would you process a variable number of files each day in Airflow?"
seoTitle: "Airflow Dynamic Task Mapping: Interview Answer"
description: "Interview answer: list the inputs in one task, map a processing task over them with expand and partial, reduce the results, and cap fan-out and concurrency."
technology: ["airflow"]
topic: ["dynamic-task-mapping", "taskflow", "fan-out"]
difficulty: "Medium"
questionType: ["coding", "scenario"]
estimatedMinutes: 9
interviewRelevance: "High"
shortAnswer: "Use dynamic task mapping. A listing task returns the inputs known only at run time (file keys, partitions, table names); a processing task is mapped over them with .expand(), with constants fixed by .partial(); a downstream task receives all mapped results as a lazy sequence and reduces them. Each element becomes its own task instance with a map_index, so it retries independently. Map over batches rather than single records, cap fan-out with [core] max_map_length (1024 by default), throttle with max_active_tis_per_dag or a pool, and remember that an empty list skips the mapped task and its downstream tasks."
followUps: ["What happens if the listing task returns an empty list?", "How do you pair two lists instead of getting a cross product?", "How is this different from generating one DAG per source?", "How do you stop 500 mapped tasks from overloading a database?"]
related: ["articles:airflow/dag-fundamentals-taskflow", "articles:airflow/executors-scaling", "interview-questions:airflow/xcom-vs-external-storage"]
versionContext: "Example run on Apache Airflow 3.3.2 (Task SDK) with Python 3.11 and a SQLite metadata database, using dag.test()."
sources:
  - { label: "Apache Airflow documentation: Dynamic Task Mapping", url: "https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html" }
  - { label: "Apache Airflow Task SDK: airflow.sdk API reference", url: "https://airflow.apache.org/docs/task-sdk/stable/api.html" }
---

## Detailed explanation

**Dynamic task mapping** creates copies of a task at run time, one per input element, like `map` in functional programming. The DAG's structure stays fixed at parse time (one mapped task in the graph), but the number of task instances depends on the upstream output.

| API | Effect |
|---|---|
| `task.expand(arg=iterable)` | One task instance per element, each with a `map_index` |
| `task.partial(const=...)` | Arguments shared by every copy; scheduling arguments (`pool`, `retries`, `max_active_tis_per_dag`) also go here |
| Expanding two arguments | Cross product of both lists |
| `task.expand_kwargs(list_of_dicts)` | One instance per dict, arguments varying together |
| `xcom_arg.zip(other)` / `.map(fn)` | Pair or transform upstream outputs before mapping |
| Downstream task receiving the mapped output | Gets every result (a lazy sequence): the "reduce" step |
| `map_index_template` | A readable label per instance in the UI |

Compared with **dynamic DAG generation** (a loop that creates DAGs from configuration at parse time), mapping handles inputs that only exist at run time, keeps one DAG to monitor, and gives per-element retries.

## Example

```python
import contextlib, io, tempfile
from datetime import datetime
from airflow.dag_processing.bundles.manager import DagBundlesManager
from airflow.dag_processing.dagbag import DagBag, sync_bag_to_db
from airflow.models.xcom import XComModel
from airflow.sdk import dag, task
from airflow.utils.session import create_session

@dag(schedule=None, start_date=datetime(2026, 1, 1))
def daily_files():
    @task
    def list_new_files() -> list[str]:            # known only at run time, e.g. an S3 listing
        return ["orders_eu.csv", "orders_us.csv", "orders_apac.csv"]

    @task(max_active_tis_per_dag=2, retries=2, map_index_template="{{ file_name }}")
    def load_file(file_name: str, target_table: str) -> int:
        from airflow.sdk import get_current_context
        get_current_context()["file_name"] = file_name
        return len(file_name) * 100                # stands in for rows loaded into target_table

    @task
    def summarise(row_counts) -> dict:
        counts = list(row_counts)
        return {"files": len(counts), "rows": sum(counts)}

    summarise(load_file.partial(target_table="raw.orders").expand(file_name=list_new_files()))

def run_dag(d):
    with contextlib.redirect_stdout(io.StringIO()):
        DagBundlesManager().sync_bundles_to_db()
        bag = DagBag(dag_folder=tempfile.mkdtemp())
        bag.dags[d.dag_id] = d
        sync_bag_to_db(bag, "dags-folder", None)
        dr = d.test()
    with create_session() as session:
        tis = sorted((ti.task_id, ti.map_index, str(ti.state)) for ti in dr.get_task_instances(session=session))
        xcoms = {(x.task_id, x.map_index): XComModel.deserialize_value(x)
                 for x in session.query(XComModel).filter_by(dag_id=d.dag_id, run_id=dr.run_id)}
    return str(dr.state), tis, xcoms

state, tis, xcoms = run_dag(daily_files())
print(state)
for task_id, map_index, ti_state in tis:
    print(f"{task_id:15} map_index={map_index:2} {ti_state:8} -> {xcoms.get((task_id, map_index))}")
```

```text
success
list_new_files  map_index=-1 success  -> ['orders_eu.csv', 'orders_us.csv', 'orders_apac.csv']
load_file       map_index= 0 success  -> 1300
load_file       map_index= 1 success  -> 1300
load_file       map_index= 2 success  -> 1500
summarise       map_index=-1 success  -> {'files': 3, 'rows': 4100}
```

Three `load_file` instances ran (`dag.test()` runs them one after another; in a deployment `max_active_tis_per_dag=2` would allow at most two at a time), each labelled in the UI by its file name, and `summarise` received all three results. If one file fails, only that instance retries; clearing it later reruns just that file.

## Trade-offs and pitfalls

- **Mapping over records** (one task per row) creates thousands of task instances with seconds of overhead each. Map over files, partitions or batches.
- **`max_map_length`** (1024 by default) fails the expansion when the list is longer; batch the inputs or raise it deliberately.
- **Empty input**: the mapped task has no instances and is marked skipped, and so are downstream tasks under `all_success`. Give a summary task `trigger_rule="none_failed"` (or `all_done`) if it must always run.
- **Cross product by accident**: `expand(a=..., b=...)` multiplies; use `expand_kwargs` or `.zip()` for pairs.
- **Large mapped return values** multiply XCom volume; return counts or paths.
- **Downstream systems**: hundreds of parallel instances can overwhelm a database or API. Use `max_active_tis_per_dag`, `max_active_tis_per_dagrun` or a pool in `partial`.

## Follow-up answers

- **Empty list**: zero instances, the mapped task is `skipped`, and skips propagate to downstream tasks with the default trigger rule.
- **Pairs, not a cross product**: `copy.expand_kwargs([{"src": "a", "dest": "x"}, {"src": "b", "dest": "y"}])`, or `sources.zip(destinations)` from two upstream outputs.
- **One DAG per source**: generation suits independent schedules, owners and SLAs per source; mapping suits a set of inputs discovered at run time that share one schedule.
- **Protecting a database**: put the mapped task in a pool sized to what the database can take (`load_file.partial(pool="warehouse", ...)`), or set `max_active_tis_per_dag`.

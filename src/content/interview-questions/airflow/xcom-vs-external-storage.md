---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "When should Airflow tasks pass data through XCom, and when through external storage?"
seoTitle: "Airflow XCom vs External Storage: Interview Answer"
description: "Interview answer: Airflow XCom is for small metadata like paths, counts and IDs; datasets belong in object storage or a warehouse, passing only a reference."
technology: ["airflow"]
topic: ["xcom", "data-passing", "taskflow"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "XCom is a small key-value store scoped to a DAG run, kept in the metadata database by default, that TaskFlow uses automatically for return values. Use it for metadata: an S3 path, a partition name, a row count, a job ID. Anything that is really data (a data frame, a file, thousands of rows) should be written to object storage or a warehouse table by the producing task, with only its location passed through XCom. If occasional values are larger, the object-storage XCom backend can offload them above a size threshold, but it does not make Airflow a data transport."
followUps: ["A task returns a 500 MB DataFrame and the DAG is slow. What is wrong?", "Does ti.xcom_pull create a dependency?", "How does a custom XCom backend work?", "Where should a secret value go instead of XCom?"]
related: ["articles:airflow/xcom-variables-connections", "articles:airflow/dag-fundamentals-taskflow", "interview-questions:airflow/dynamic-task-mapping"]
versionContext: "Example run on Apache Airflow 3.3.2 (Task SDK) with Python 3.11; the task functions are called through .function so no scheduler or database is needed. The object-storage backend settings come from the apache-airflow-providers-common-io documentation and were not executed."
sources:
  - { label: "Apache Airflow documentation: XComs", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/xcoms.html" }
  - { label: "Common IO provider documentation: Object Storage XCom Backend", url: "https://airflow.apache.org/docs/apache-airflow-providers-common-io/stable/xcom_backend.html" }
---

## Detailed explanation

**XCom** ("cross-communication") stores values identified by `dag_id`, `run_id`, `task_id`, `map_index` and `key`. A TaskFlow task's return value is pushed under `return_value`, and passing it to another task both pulls it and creates the dependency. In Airflow 3, workers read and write XComs through the API server (Task Execution API), and the default backend stores them in the metadata database.

Why large values do not belong there:

- Every value is serialised, sent through the API server and stored in a database table that the scheduler and UI also use. Big rows bloat the database, slow the UI and backups, and can hit size or serialisation limits that depend on the database.
- The downstream worker must download and deserialise the whole value into memory.
- XCom has no partitioning, retention policy or schema; a warehouse or object store has all three.

| Put in XCom | Put in storage, pass the reference |
|---|---|
| `s3://lake/staging/orders/dt=2026-03-01/` | The Parquet files under that prefix |
| `{"rows": 120431, "rejected": 12}` | The rejected rows themselves |
| A Spark or Glue job run ID | The job's output |
| The list of 40 new file keys to map over | The contents of those files |

**Custom and object-storage backends**: `[core] xcom_backend` points at a `BaseXCom` subclass whose `serialize_value` and `deserialize_value` decide what is stored. The common-io provider ships `XComObjectStorageBackend`, which writes values larger than `[common.io] xcom_objectstorage_threshold` bytes to `xcom_objectstorage_path` (for example an S3 prefix) and keeps only a reference in the database. It must be installed and configured on every component that reads or writes XComs.

## Example

The extract task writes its output and returns a small summary; the load task receives only the reference:

```python
import json, os, tempfile
from datetime import datetime
from airflow.sdk import dag, task

LAKE = tempfile.mkdtemp()                     # stands in for s3://lake/staging/

@dag(schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False)
def orders_by_reference():
    @task
    def extract(ds=None) -> dict:
        rows = [{"order_id": i, "amount": i * 1.5} for i in range(100_000)]
        path = os.path.join(LAKE, f"orders_{ds}.jsonl")
        with open(path, "w") as fh:
            fh.writelines(json.dumps(r) + "\n" for r in rows)
        return {"path": path, "rows": len(rows)}          # this is all that goes to XCom

    @task
    def load(meta: dict) -> str:
        with open(meta["path"]) as fh:
            loaded = sum(1 for _ in fh)
        assert loaded == meta["rows"], "row count mismatch"
        return f"loaded {loaded} rows"

    load(extract())

d = orders_by_reference()
print(d.task_ids, sorted(d.get_task("load").upstream_task_ids))

meta = d.get_task("extract").python_callable(ds="2026-03-01")
print("XCom payload under 200 bytes:", len(json.dumps(meta)) < 200)
print("file bytes:", os.path.getsize(meta["path"]))
print(d.get_task("load").python_callable(meta))
```

```text
['extract', 'load'] ['extract']
XCom payload under 200 bytes: True
file bytes: 3914815
loaded 100000 rows
```

A few dozen bytes (the path and a count) travel through XCom while about 3.9 MB stay in storage. Returning the rows instead would have pushed the whole list into the metadata database.

## Trade-offs and pitfalls

- **Passing references couples tasks to a storage layout.** Keep paths deterministic (derived from `ds`) so reruns overwrite the same location and the producer stays idempotent.
- **Cleaning up**: intermediate files need a lifecycle rule or a cleanup task; an object-storage XCom backend also needs one (or a `purge` implementation).
- **`xcom_pull` does not create a dependency.** Without `>>` or a TaskFlow argument, the pulling task may run first and get `None`.
- **Secrets in XCom are visible in the UI.** Use connections or a secrets backend.
- **Mapped tasks** push one XCom per map index; a reduce task that receives them all should get small values, not one data frame per file.

## Follow-up answers

- **500 MB DataFrame**: it is serialised into XCom through the API server and the metadata database, then downloaded again by the next worker. Write it to Parquet in object storage or a staging table and return the path.
- **`xcom_pull` and dependencies**: no; only `>>`, `chain` and passing TaskFlow outputs create edges.
- **Custom backend**: subclass `BaseXCom`, override `serialize_value` (store the object elsewhere and return a reference) and `deserialize_value` (fetch it), optionally `purge`; set `[core] xcom_backend` everywhere.
- **Secrets**: an Airflow connection or a secrets backend such as AWS Secrets Manager, read inside the task.

---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "When would you not use pandas in a data pipeline?"
seoTitle: "When Not to Use pandas: Interview Answer"
description: "When not to use pandas, interview answer: avoid it for data near or above memory, work the warehouse can do in SQL, distributed scale and row-wise logic; use DuckDB, Polars or Spark."
technology: ["python"]
topic: ["pandas", "architecture", "performance"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 6
interviewRelevance: "High"
shortAnswer: "pandas holds the whole dataset in one process's memory and mostly uses one core, so I avoid it when the data is close to or larger than available memory, when the volume will keep growing, and when the data already lives in a warehouse that can transform it in SQL without moving it. For large single-machine work I use DuckDB or Polars, which are columnar, multi-threaded and can stream or spill to disk; for distributed data, Spark; for simple streaming of a huge file, plain Python with generators. pandas remains a good choice for small and medium data, exploration, glue code and tests, as long as types are explicit and joins are validated."
followUps: ["How much memory does a DataFrame need compared with the CSV on disk?", "What does DuckDB do differently from pandas?", "When would you pick Polars over DuckDB?", "How would you migrate a pandas job that has outgrown one machine?"]
related: ["articles:python/pandas-for-data-engineers", "interview-questions:python/process-large-csv-limited-memory", "articles:pyspark/pyspark-fundamentals"]
sources:
  - { label: "pandas documentation: Scaling to large datasets", url: "https://pandas.pydata.org/docs/user_guide/scale.html" }
  - { label: "DuckDB documentation: Python API", url: "https://duckdb.org/docs/stable/clients/python/overview" }
  - { label: "Polars user guide: Lazy API", url: "https://docs.pola.rs/user-guide/lazy/" }
versionContext: "Example runs on Python 3.11 with pandas 3.0.6 and DuckDB"
---

## Detailed explanation

| Situation | Problem with pandas | Better choice |
|-----------|---------------------|---------------|
| Data near or above RAM | Loads everything; intermediate results multiply memory | DuckDB, Polars (lazy or streaming), chunked plain Python |
| Data already in the warehouse | Pulling it out costs time and egress; one machine replaces a scalable engine | SQL in the warehouse, dbt |
| Terabytes, many files | Single process | Spark, warehouse |
| Heavy joins and group-bys on one machine | Mostly single-threaded | DuckDB, Polars |
| Per-row business rules in production | `apply` with Python functions is slow and hard to test | Plain functions, or SQL |
| Low-latency streaming | Batch-oriented | Stream processors, plain consumers |
| Strict schemas | Type inference surprises | Explicit dtypes, or a typed engine |

### Where pandas is the right tool

Small to medium data (thousands to a few million rows), exploration in notebooks, reshaping API responses, small transformations inside an Airflow task, reading Excel files, and tests (`pandas.testing.assert_frame_equal`).

### Signals that a pandas job has outgrown pandas

Memory errors or workers killed for exceeding memory, runtimes growing with every month of data, code full of `chunksize` loops managing cross-chunk state, or a job that pulls a warehouse table out only to aggregate it and write it back.

## Example: same question, two engines

```python
import duckdb
import pandas as pd

orders = pd.DataFrame({"country": ["DE", "FR", "DE", "IN"], "amount": [10.0, 5.0, 2.5, 7.0]})

by_pandas = orders.groupby("country", as_index=False)["amount"].sum().sort_values("country")
by_duckdb = duckdb.sql("SELECT country, sum(amount) AS amount FROM orders GROUP BY country ORDER BY country").df()

print(by_pandas.to_dict("records") == by_duckdb.to_dict("records"))
print(duckdb.sql("SELECT count(*) FROM orders").fetchone()[0])
```

```text
True
4
```

DuckDB queried the pandas DataFrame directly by its variable name and returned a DataFrame. The point for an interview: you do not have to rewrite everything to move the heavy parts to an engine that scales better. Point the same SQL at Parquet files with `read_parquet('path/*.parquet')` and DuckDB streams them without loading everything into memory.

## Trade-offs and pitfalls

- DuckDB and Polars are newer dependencies; check that your platform supports them, and pin versions.
- Moving work into the warehouse is often the biggest win, but it couples the job to warehouse cost and SQL skills.
- Spark has real overhead for small data; do not use it for a 50 MB file.
- Converting between pandas and Arrow-based engines is cheap but not free; avoid ping-ponging in a loop.

## Common mistakes

1. "We use pandas everywhere" without measuring memory headroom.
2. Pulling a warehouse table into pandas to aggregate it.
3. Jumping to Spark for data that fits comfortably on one machine.
4. Rewriting a whole job when moving one heavy step to DuckDB or SQL would do.

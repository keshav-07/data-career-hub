---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How do you test a data pipeline?"
seoTitle: "How to Test a Data Pipeline: Interview Answer"
description: "Testing a data pipeline, interview answer: unit tests for transforms, integration tests on a real engine, data tests and diffs before merging."
technology: ["data-engineering", "python"]
topic: ["testing", "data-quality", "ci-cd"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I test in layers. Unit tests cover transformation logic on small hand-written inputs, including the cases that break pipelines: empty input, duplicate and out-of-order keys, nulls, time zones and interval boundaries. Integration tests run the real SQL on a real engine (DuckDB, a Postgres container or a CI schema in the warehouse) with tiny fixtures, and include a run-twice idempotency test. Data tests (unique, not null, relationships, freshness, volume) run on every production run and in CI. For logic changes I diff the candidate output against production before merging. Code tests catch my bugs before deploy; data tests catch upstream problems at run time."
followUps: ["What would you put in a fixture for a deduplication step?", "How do you test SQL that only runs in Snowflake?", "What is the difference between a dbt unit test and a dbt data test?", "How do you test an Airflow DAG?"]
related: ["articles:etl-elt/testing-data-pipelines-cicd", "articles:etl-elt/data-quality-checks-contracts", "articles:airflow/best-practices-testing-cicd", "interview-questions:data-engineering/data-quality-checks"]
sources:
  - { label: "pytest documentation", url: "https://docs.pytest.org/en/stable/" }
  - { label: "dbt documentation: Unit tests", url: "https://docs.getdbt.com/docs/build/unit-tests" }
versionContext: "Python verified on Python 3.11 with DuckDB; the test functions are written for pytest and were executed by calling them directly"
---

## Detailed explanation

| Layer | Catches | When it runs |
|-------|---------|--------------|
| Unit tests | Logic bugs in transforms: dedup, parsing, rounding, time zones | Every commit |
| Integration tests | SQL errors, type mismatches, join fan-out, read/write problems | Every pull request |
| Idempotency test | Duplicates on retry or backfill | Every pull request |
| Data tests | Bad or unexpected input data, broken assumptions | Every pipeline run, and in CI |
| Regression diff | Unintended changes in output | Pull requests that change logic |
| DAG tests | Import errors, cycles, missing retries | Every commit |

The main point to land in an interview: **code tests and data tests answer different questions**. Unit and integration tests tell you whether your code does what you intended on inputs you thought of. Data tests tell you whether today's real input still matches your assumptions. A pipeline needs both.

### Edge cases worth naming

Empty input; a duplicate key; two versions of the same key out of order; a null in a required field; a timestamp exactly on the interval boundary; a daylight-saving day; non-UTC offsets; float amounts; a dimension row that is missing or duplicated; very large values; non-ASCII text.

## Example

A transformation and an integration test on DuckDB, including the run-twice test:

```python
import duckdb

DEDUP_SQL = """
    CREATE OR REPLACE TABLE customers_clean AS
    SELECT customer_id, email, updated_at
    FROM customers_raw
    QUALIFY row_number() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) = 1
"""

def fixture():
    con = duckdb.connect()
    con.execute("CREATE TABLE customers_raw (customer_id INT, email TEXT, updated_at TIMESTAMP)")
    con.execute("""INSERT INTO customers_raw VALUES
        (1, 'old@example.com', '2026-10-01 09:00'),
        (1, 'new@example.com', '2026-10-02 09:00'),
        (2, 'b@example.com',   '2026-10-01 10:00')""")
    return con

def test_keeps_latest_version():
    con = fixture()
    con.execute(DEDUP_SQL)
    assert con.execute("SELECT email FROM customers_clean WHERE customer_id = 1").fetchall() == [("new@example.com",)]

def test_one_row_per_key():
    con = fixture()
    con.execute(DEDUP_SQL)
    assert con.execute("SELECT count(*) = count(DISTINCT customer_id) FROM customers_clean").fetchone()[0]

def test_rerun_is_idempotent():
    con = fixture()
    con.execute(DEDUP_SQL)
    first = con.execute("SELECT * FROM customers_clean ORDER BY customer_id").fetchall()
    con.execute(DEDUP_SQL)
    assert con.execute("SELECT * FROM customers_clean ORDER BY customer_id").fetchall() == first

for t in (test_keeps_latest_version, test_one_row_per_key, test_rerun_is_idempotent):
    t()
print("3 passed")
```

```text
3 passed
```

In a repository these live in `tests/` and run with `pytest`. If the production SQL is Snowflake- or BigQuery-specific, run the same tests against a CI schema in that warehouse instead of DuckDB.

## Trade-offs and pitfalls

- Local engines are fast but differ in dialect from the production warehouse; use them for portable SQL and a CI schema for the rest.
- Production copies as fixtures are slow, opaque and a privacy risk; small synthetic fixtures with one row per case are better.
- Data tests with no severity policy become noise. Decide which block publishing.
- A regression diff needs a stable key or ordering to be readable; compare per-partition aggregates first on big tables.

## Common mistakes

1. Only data tests, so logic bugs are found in production.
2. Only happy-path unit tests.
3. SQL strings that no test ever executes.
4. No idempotency test, so the first retry in production is the first time anyone ran the step twice.

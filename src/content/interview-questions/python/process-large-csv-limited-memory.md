---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you process a 50 GB CSV file on a machine with 8 GB of RAM?"
seoTitle: "Process a 50 GB CSV With Limited Memory"
description: "Process a huge CSV in Python with limited memory: stream rows with csv and generators, aggregate in small state, write in batches, or push the work into DuckDB or Spark."
technology: ["python"]
topic: ["memory", "generators", "large-files"]
difficulty: "Medium"
questionType: ["scenario", "coding"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "I would never load the whole file. In plain Python I stream it row by row with the csv module and a generator, keep only the state the answer needs (for example a dict of totals per key, which is small if the number of keys is small), and write results or loads in fixed-size batches. If the state itself is too big, such as grouping by a high-cardinality key or sorting, I would let an engine that spills to disk do it: DuckDB can query the CSV directly with a memory limit, and Spark or a warehouse can split it across workers. I would also convert the file to Parquet once if it will be read repeatedly, and make the job restartable by processing chunks with recorded progress."
followUps: ["What if you need the top 10 customers by spend?", "What if you must deduplicate on a key with a billion distinct values?", "How does pandas read_csv with chunksize change memory use?", "Why does gzip make parallel reading harder?"]
related: ["articles:python/iterators-generators", "articles:python/file-io-csv-json", "interview-questions:python/generators-large-datasets", "articles:python/pandas-for-data-engineers"]
sources:
  - { label: "Python documentation: csv", url: "https://docs.python.org/3/library/csv.html" }
  - { label: "Python documentation: tracemalloc", url: "https://docs.python.org/3/library/tracemalloc.html" }
  - { label: "DuckDB documentation: CSV import", url: "https://duckdb.org/docs/stable/data/csv/overview" }
versionContext: "Examples run on Python 3.11 with DuckDB from the system packages, on a generated 200,000-row file standing in for the large one"
---

## Detailed explanation

The question tests whether you think about **what must be in memory** rather than reaching for `pd.read_csv(path)`. Structure the answer in three steps.

### 1. Stream, and keep only the state you need

Reading row by row keeps the input side at constant memory. What remains in memory is the **state** your computation needs:

| Task | State needed | Fits in memory? |
|------|--------------|-----------------|
| Count rows, sum a column | A few numbers | Always |
| Totals per country | One entry per country | Yes |
| Totals per customer | One entry per customer | Depends on the number of customers |
| Top 10 by value | A heap of 10 items | Always |
| Exact distinct count of a high-cardinality key | Every key | Maybe not; use an engine or an approximate sketch |
| Sort the whole file | Everything | No; needs an external sort |

### 2. Batch the output

Insert into a database or call an API in batches of a few thousand rows, never one at a time and never all at once.

### 3. When state does not fit, use an engine that spills

DuckDB reads CSV directly, runs SQL with a memory limit and spills to disk for big aggregations and sorts. Spark splits the file across executors. A warehouse load (`COPY INTO`, `LOAD DATA`) is often the simplest answer if the data is going there anyway.

## Example: stream and aggregate

```python
import csv
import heapq
import random
import tempfile
import tracemalloc
from collections import defaultdict
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "orders.csv"
random.seed(1)
with path.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["order_id", "country", "customer_id", "amount"])
    for i in range(200_000):
        w.writerow([i, random.choice(["DE", "FR", "IN", "US"]), random.randint(1, 5_000), f"{random.uniform(1, 100):.2f}"])

def rows(p):
    with p.open(newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)

tracemalloc.start()
totals = defaultdict(float)
by_customer = defaultdict(float)
for r in rows(path):
    totals[r["country"]] += float(r["amount"])
    by_customer[r["customer_id"]] += float(r["amount"])
top3 = heapq.nlargest(3, by_customer.items(), key=lambda kv: kv[1])
_, streamed_peak = tracemalloc.get_traced_memory()
tracemalloc.stop()

tracemalloc.start()
everything = list(rows(path))
_, list_peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
del everything

print(sorted(totals))
print(len(top3), "top customers")
print("streaming peak at least 20x smaller:", list_peak > 20 * streamed_peak)
```

```text
['DE', 'FR', 'IN', 'US']
3 top customers
streaming peak at least 20x smaller: True
```

The streaming version holds four country totals and one total per customer (5,000 entries); loading the rows as dicts holds all 200,000. On the real 50 GB file the gap is the difference between finishing and being killed by the out-of-memory killer. The exact ratio depends on the data; the shape of the result does not.

## Example: let DuckDB do it

```python
import duckdb

con = duckdb.connect()
con.execute("SET memory_limit = '500MB'")      # DuckDB spills to disk beyond this
result = con.execute(f"""
    SELECT country, count(*) AS orders, round(sum(amount), 2) > 0 AS has_revenue
    FROM read_csv('{path}', header = true)
    GROUP BY country ORDER BY country
""").fetchall()
print(result)
```

```text
[('DE', 50069, True), ('FR', 49992, True), ('IN', 49810, True), ('US', 50129, True)]
```

DuckDB streams the file, parallelises the scan across cores and handles group-bys and sorts larger than memory by spilling. To read the data repeatedly, convert it once: `COPY (SELECT * FROM read_csv(...)) TO 'orders.parquet' (FORMAT parquet)`.

## Trade-offs and pitfalls

- `pd.read_csv(..., chunksize=100_000)` also streams, giving a DataFrame per chunk; it works well for per-chunk transformations, but cross-chunk aggregations still need state you manage yourself.
- One process reading one file is limited to one core's parsing speed in plain Python; DuckDB, Polars or Spark parallelise parsing.
- A gzip file must be decompressed sequentially; splitting the input into many files (or using Parquet) enables parallel reads.
- Make it restartable: process in chunks (byte offsets or row ranges), record completed chunks, and make writes idempotent so a rerun after a crash does not duplicate output.
- Watch the hidden copies: `list(reader)`, `readlines()`, `f.read()` and `json.load` all materialise everything.

## Common mistakes

1. `pd.read_csv(path)` or `f.readlines()` on the whole file.
2. Keeping every row "just in case" when only aggregates are needed.
3. Grouping by a high-cardinality key in a Python dict without estimating its size.
4. Inserting one row per database round trip.

---
title: "SQL at Scale: Window Performance, Skew and Approximate Distinct"
seoTitle: "SQL at Scale: Windows, Skew and HyperLogLog"
description: "Keep big queries fast: tune window functions, handle skewed keys in aggregations with two-phase aggregation and salting, and count distinct values with HyperLogLog."
technology: ["sql"]
topic: ["performance", "window-functions", "data-skew", "hyperloglog"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
learningObjectives:
  - "Explain what a window function costs (sorting and buffering per partition) and reduce that cost"
  - "Rewrite top-N-per-group queries so the engine can stop early"
  - "Recognise skewed keys in GROUP BY and fix them with two-phase aggregation and salting"
  - "Explain how HyperLogLog estimates distinct counts, its error and why sketches can be merged"
  - "Use APPROX_COUNT_DISTINCT and HLL sketch functions in Snowflake, BigQuery and DuckDB"
prerequisites: ["articles:sql/window-functions", "articles:sql/query-optimizer-internals"]
related: ["articles:spark/partitions-shuffles-skew", "interview-questions:spark/data-skew", "articles:sql/gaps-islands-sessionization"]
previous: "articles:sql/query-optimizer-internals"
next: "articles:sql/transactions-isolation-mvcc"
versionContext: "PostgreSQL examples run on PostgreSQL 16.14 (the window run condition needs PostgreSQL 15+); DuckDB example run on DuckDB 1.5.6; Python simulations on Python 3. Snowflake and BigQuery snippets were written from their documentation and not executed."
sources:
  - { label: "PostgreSQL 16 documentation: Window functions", url: "https://www.postgresql.org/docs/16/functions-window.html" }
  - { label: "Snowflake documentation: Estimating the number of distinct values", url: "https://docs.snowflake.com/en/user-guide/querying-approximate-cardinality" }
  - { label: "Snowflake documentation: APPROX_COUNT_DISTINCT", url: "https://docs.snowflake.com/en/sql-reference/functions/approx_count_distinct" }
  - { label: "BigQuery documentation: HyperLogLog++ functions", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/hll_functions" }
  - { label: "BigQuery documentation: Approximate aggregate functions", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/approximate_aggregate_functions" }
  - { label: "Apache Spark documentation: Performance tuning", url: "https://spark.apache.org/docs/latest/sql-performance-tuning.html" }
---

Queries that run fine on a million rows can fall over on a billion, and three patterns cause a large share of the trouble: window functions that sort and buffer huge partitions, aggregations where one key holds most of the data, and exact distinct counts that must remember every value seen. This lesson shows what each costs, how to recognise it in a plan, and the standard fixes, including the HyperLogLog algorithm behind `APPROX_COUNT_DISTINCT`.

## Sample data

300,000 orders. Seller 1 is a marketplace giant with a third of all orders; the other 999 sellers share the rest.

```sql
CREATE TABLE orders (
  order_id    BIGINT PRIMARY KEY,
  customer_id INT NOT NULL,
  seller_id   INT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL
);
INSERT INTO orders
SELECT g,
       1 + (g::bigint * 7919) % 20000,
       CASE WHEN g % 3 = 0 THEN 1 ELSE 2 + g % 999 END,
       ((g::bigint * 37) % 50000) / 100.0,
       TIMESTAMP '2025-01-01' + (g % 525600) * INTERVAL '1 minute'
FROM generate_series(1, 300000) AS g;
VACUUM ANALYZE orders;

CREATE TABLE customers AS SELECT g AS customer_id FROM generate_series(1, 20000) AS g;
ALTER TABLE customers ADD PRIMARY KEY (customer_id);
ANALYZE customers;
```

## Window function performance tuning

### What a window function costs

To evaluate `f() OVER (PARTITION BY p ORDER BY o)`, the engine needs the rows grouped by `p` and ordered by `o`. Unless an index or an earlier step already delivers that order, it **sorts the whole input** on `(p, o)`, then walks it partition by partition, buffering rows as the frame requires. So the cost is roughly:

- one sort per distinct window specification (partition and order);
- memory to buffer a partition or frame (spilling if it does not fit);
- in distributed engines, a **shuffle** that sends every row of a partition to the same worker.

### One sort per window specification

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN SELECT order_id,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn,
       SUM(amount)  OVER (PARTITION BY seller_id   ORDER BY created_at) AS seller_running
FROM orders;
EXPLAIN SELECT order_id,
       ROW_NUMBER() OVER w AS rn,
       SUM(amount)  OVER w AS running,
       LAG(amount)  OVER w AS prev_amount
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY created_at);
```

```text
-- two different specifications: two sorts, two WindowAgg nodes
 WindowAgg  (cost=84248.81..90248.81 rows=300000 width=64)
   ->  Sort  (cost=84248.81..84998.81 rows=300000 width=62)
         Sort Key: customer_id, created_at
         ->  WindowAgg  (cost=39676.40..45676.40 rows=300000 width=62)
               ->  Sort  (cost=39676.40..40426.40 rows=300000 width=30)
                     Sort Key: seller_id, created_at
                     ->  Seq Scan on orders  (cost=0.00..5206.00 rows=300000 width=30)

-- three functions sharing one specification: one sort
 WindowAgg  (cost=39676.40..47176.40 rows=300000 width=92)
   ->  Sort  (cost=39676.40..40426.40 rows=300000 width=26)
         Sort Key: customer_id, created_at
         ->  Seq Scan on orders  (cost=0.00..5206.00 rows=300000 width=26)
```

Three functions over the same window cost little more than one; each extra specification adds a full sort (the second sort above is more expensive because it also carries the first window's output). Reuse a named `WINDOW` where the logic allows, and order specifications so that one sort can serve several (PostgreSQL can reuse a sort when one specification's keys are a prefix of another's).

### Sorts that spill, and indexes that remove them

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn
FROM orders;
CREATE INDEX orders_cust_time_idx ON orders (customer_id, created_at);
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn
FROM orders;
```

```text
-- no suitable index: full sort, which spills with the default 4MB work_mem
 WindowAgg  (cost=38650.90..44650.90 rows=300000 width=28) (actual rows=300000 loops=1)
   ->  Sort  (cost=38650.90..39400.90 rows=300000 width=20) (actual rows=300000 loops=1)
         Sort Key: customer_id, created_at
         Sort Method: external merge  Disk: 10000kB

-- index on (customer_id, created_at): rows arrive in window order, no sort
 WindowAgg  (cost=0.42..23206.34 rows=300000 width=28) (actual rows=300000 loops=1)
   ->  Index Scan using orders_cust_time_idx on orders  (cost=0.42..17956.34 rows=300000 width=20) (actual rows=300000 loops=1)
```

Removing the sort also removes the spill and lets the first rows stream out immediately. Reading a whole table through an index is not always faster than a sequential scan plus an in-memory sort, so compare actual times on your data. In columnar warehouses, clustering or sorting the table by the partition key plays a similar role.

### Top N per group: let the engine stop early

"Latest 3 orders per customer" is usually written with `ROW_NUMBER()` and a filter. PostgreSQL 15+ recognises the filter as a **run condition** and stops computing row numbers for a partition once they exceed 3:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM (
  SELECT order_id, customer_id, amount,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM orders
) t
WHERE rn <= 3;
```

```text
 Subquery Scan on t  (cost=1.63..36233.36 rows=300000 width=26) (actual rows=60000 loops=1)
   ->  WindowAgg  (cost=1.63..33233.36 rows=300000 width=34) (actual rows=60000 loops=1)
         Run Condition: (row_number() OVER (?) <= 3)
         ->  Incremental Sort  (cost=1.63..27983.36 rows=300000 width=26) (actual rows=300000 loops=1)
               Sort Key: orders.customer_id, orders.created_at DESC
               Presorted Key: orders.customer_id
               Full-sort Groups: 6667  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
               ->  Index Scan using orders_cust_time_idx on orders  (actual rows=300000 loops=1)
```

Two optimisations show up: the run condition, and an **incremental sort** that only sorts within each customer because the index already groups by `customer_id`. Still, every one of the 300,000 rows is read. When there is an index on `(partition key, order key)` and a table of partition keys, a `LATERAL` join reads only the rows it returns:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT c.customer_id, o.order_id, o.amount
FROM customers c
CROSS JOIN LATERAL (
  SELECT order_id, amount FROM orders o
  WHERE o.customer_id = c.customer_id
  ORDER BY created_at DESC
  LIMIT 3
) o;
```

```text
 Nested Loop  (cost=0.42..267024.17 rows=60000 width=18) (actual rows=60000 loops=1)
   ->  Seq Scan on customers c  (cost=0.00..328.00 rows=20000 width=4) (actual rows=20000 loops=1)
   ->  Limit  (cost=0.42..13.27 rows=3 width=22) (actual rows=3 loops=20000)
         ->  Index Scan Backward using orders_cust_time_idx on orders o  (actual rows=3 loops=20000)
               Index Cond: (customer_id = c.customer_id)
```

Each customer costs one short index probe returning 3 rows. Here, with 15 orders per customer, the two plans take similar time; the `LATERAL` form pulls ahead when partitions are large (thousands of rows each) and N is small. In warehouses, `QUALIFY ROW_NUMBER() OVER (...) <= 3` is the idiomatic form and the engine applies its own top-N optimisations.

### Window functions in distributed engines

- All rows of one window partition must be on one worker. A skewed partition key (seller 1 here) makes one task do a third of the work.
- A window with **no** `PARTITION BY` (a global `ROW_NUMBER()` or running total) runs on a single worker. Spark logs a warning that it is moving all data to a single partition. Avoid global windows on big tables: number rows within partitions, or use `monotonically_increasing_id`-style ids where gaps are acceptable.
- Frames matter: `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` buffers 7 rows; `RANGE` frames and `UNBOUNDED FOLLOWING` may buffer the whole partition.

### Pitfalls

- Many slightly different window specifications in one query, each adding a sort.
- Computing windows over the whole table and filtering afterwards; filter first when the filter does not change the window's meaning (for example, restrict to the needed date range plus any look-back the window requires).
- Wide rows in the sort: select only needed columns before the window step.
- Using a window to fetch one value per group when a `GROUP BY` would do (`MAX(created_at)` per customer needs no window).

### In interviews

"This query with several window functions is slow; what would you look at?" Explain that each window specification needs its input sorted by partition and order keys, look for sorts and spills in the plan, consolidate specifications, filter and project early, and use indexes or clustering that supply the order. For distributed engines mention skewed partitions and global windows. Knowing the `LATERAL ... LIMIT` alternative for top-N per group is a plus.

## Handling skew in aggregations

### What it is

**Skew** means the data is unevenly distributed over the keys you group or join by: one seller, one country, one `NULL` or one bot account holds a large share of the rows. On one machine skew barely matters for `GROUP BY`. In a distributed engine, rows are sent to workers by a hash of the key, so all rows for the hot key land on **one** worker. The stage takes as long as its slowest task, and that task may also run out of memory and spill.

```sql
SELECT seller_id, count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM orders
GROUP BY seller_id
ORDER BY orders DESC
LIMIT 3;
```

| seller_id | orders | pct |
|---|---|---|
| 1 | 100000 | 33.3 |
| 87 | 301 | 0.1 |
| 184 | 301 | 0.1 |

A query like this (top keys and their share) is the first diagnostic. In Spark or a warehouse profile, the symptom is one task or worker that runs far longer and processes far more rows than the median.

### Simulating the imbalance

Hash-distributing these orders over 4 workers by `seller_id`, and then by `(seller_id, salt)` with 8 salt values:

```python
import random
from collections import Counter

random.seed(1)
N_WORKERS = 4
# 300,000 orders: seller 1 has a third of them, the rest are spread over 999 sellers.
orders = [1 if i % 3 == 0 else 2 + i % 999 for i in range(300_000)]

def worker_for(key):
    return hash(key) % N_WORKERS          # stand-in for the engine's hash partitioning

plain = Counter(worker_for(seller) for seller in orders)
salted = Counter(worker_for((seller, random.randrange(8))) for seller in orders)

print("rows per worker, GROUP BY seller_id:         ", [plain[w] for w in range(N_WORKERS)])
print("rows per worker, GROUP BY seller_id, salt(8): ", [salted[w] for w in range(N_WORKERS)])
```

```text
rows per worker, GROUP BY seller_id:          [50150, 149850, 49850, 50150]
rows per worker, GROUP BY seller_id, salt(8):  [74508, 61987, 88131, 75374]
```

Without salt, one worker gets three times the work of the others. With 8 salt values the hot seller's rows are split into 8 groups that hash to different workers. The result is not perfectly even (8 pieces over 4 workers rarely split exactly), but the worst worker drops from about 150,000 rows to about 88,000. More salt values give a more even spread at the cost of more partial groups.

### Fix 1: two-phase (partial) aggregation

For **decomposable** aggregates (`SUM`, `COUNT`, `MIN`, `MAX`, and `AVG` as sum and count), each worker can aggregate its local rows first and send only one partial row per key, so the hot key costs one row per worker instead of a third of the table. Engines do this automatically. PostgreSQL's parallel plans show it as Partial and Finalize aggregates:

```sql
SET parallel_setup_cost = 0;
SET parallel_tuple_cost = 0;
EXPLAIN SELECT seller_id, SUM(amount), COUNT(*) FROM orders GROUP BY seller_id;
EXPLAIN SELECT seller_id, COUNT(DISTINCT customer_id) FROM orders GROUP BY seller_id;
```

```text
-- SUM and COUNT: workers pre-aggregate, only about 667 partial rows are gathered
 Finalize GroupAggregate  (cost=5333.87..5355.55 rows=667 width=44)
   Group Key: seller_id
   ->  Gather Merge  (cost=5333.87..5340.54 rows=667 width=44)
         ->  Sort
               ->  Partial HashAggregate  (cost=5294.24..5302.58 rows=667 width=44)
                     Group Key: seller_id
                     ->  Parallel Seq Scan on orders

-- COUNT(DISTINCT): no partial step; all 300,000 rows are gathered, sorted and aggregated at the end
 GroupAggregate  (cost=21764.34..25962.19 rows=667 width=12)
   Group Key: seller_id
   ->  Gather Merge  (cost=21764.34..24455.52 rows=300000 width=8)
         ->  Sort
               Sort Key: seller_id, customer_id
               ->  Parallel Seq Scan on orders
```

(The two `SET`s only make parallel plans attractive on this small table.) `COUNT(DISTINCT)`, exact percentiles, `ARRAY_AGG` and `STRING_AGG` cannot simply be pre-aggregated: a partial distinct count from one worker cannot be added to another's, because the same customer may appear in both. Those are the aggregates where skew hurts most, and where the next two fixes come in.

### Fix 2: salting (manual two-stage aggregation)

Add a random or hash-based **salt** to the key, aggregate by `(key, salt)` so the hot key is spread over several groups, then aggregate the partial results by key alone:

```sql
WITH stage1 AS (
  SELECT seller_id, order_id % 8 AS salt,
         SUM(amount) AS part_sum, COUNT(*) AS part_cnt
  FROM orders
  GROUP BY seller_id, order_id % 8
)
SELECT seller_id, SUM(part_sum) AS revenue, SUM(part_cnt) AS orders
FROM stage1
GROUP BY seller_id
ORDER BY orders DESC, seller_id
LIMIT 3;
```

| seller_id | revenue | orders |
|---|---|---|
| 1 | 24999500.00 | 100000 |
| 3 | 74905.87 | 301 |
| 4 | 75017.24 | 301 |

The totals are identical to a direct `GROUP BY seller_id` (checked against it). For a distinct count, salt by the value being counted, or more simply de-duplicate on `(key, value)` first, which distributes the work by both columns:

```sql
WITH pairs AS (
  SELECT seller_id, customer_id FROM orders GROUP BY seller_id, customer_id
)
SELECT seller_id, COUNT(*) AS customers
FROM pairs
GROUP BY seller_id
ORDER BY customers DESC, seller_id
LIMIT 3;
```

Seller 1 has 20,000 distinct customers, the next sellers 301 each, matching `COUNT(DISTINCT customer_id)`. The first stage is shuffled by `(seller_id, customer_id)`, which is even; the second stage handles at most one row per pair.

### Fix 3: treat hot keys separately, or approximate

- **Split the hot keys out**: aggregate the few heavy keys in a separate query (or with a salted path) and the long tail normally, then `UNION ALL`.
- **NULL keys**: a common hidden hot key is `NULL` (unknown customer, missing country). Filter it out, or aggregate it separately, when it does not belong in the result.
- **Approximate**: if an estimate is acceptable, HyperLogLog replaces a skew-sensitive exact distinct count with small mergeable sketches (next section).
- **Engine features**: Spark's Adaptive Query Execution splits skewed partitions in **joins** automatically (`spark.sql.adaptive.skewJoin.enabled`), but that does not apply to aggregations, which rely on partial aggregation and salting.

### Pitfalls

- Salting a non-decomposable aggregate and then summing partial results (summing partial distinct counts double counts values that appear under several salts, unless you salt by the counted value).
- Using a random salt in a pipeline that must be deterministic; derive the salt from a column (`hash(order_id) % n`) instead.
- Too many salts for small keys: they multiply the number of groups for every key. Salt only the hot keys when the key space is large.
- Forgetting that skew changes over time; monitor the top keys' share.

### In interviews

"One key has 40% of the data and the aggregation stage hangs on one task. What do you do?" Confirm the skew (top-key counts, task metrics), then explain partial aggregation, salting with a second aggregation stage, isolating hot keys and `NULL`s, and approximation. Being clear about which aggregates can be combined from partial results (sum, count, min, max) and which cannot (distinct counts, medians) is the key insight.

## Approximate distinct with HyperLogLog

### Why approximate

An exact `COUNT(DISTINCT user_id)` must remember every distinct value it has seen (a hash table or a sort), so its memory grows with the number of distinct values, and in a distributed engine all occurrences of a value must meet in one place. Worse, exact distinct counts **cannot be combined**: daily unique users cannot be added up to weekly unique users. For dashboards and monitoring, an answer within a couple of percent, computed in kilobytes of memory, is usually better.

### How HyperLogLog works

HyperLogLog (HLL) is based on one observation: if you hash values to random-looking bit strings, then seeing a hash that starts with k zero bits is a 1-in-2^k event, so the longest run of leading zeros you have seen hints at how many distinct values you have hashed. Duplicates hash to the same bits, so they do not change anything.

1. **Hash** each value to 64 bits.
2. Use the first **p** bits to choose one of **m = 2^p registers** (buckets).
3. In the remaining bits, find the position of the first 1-bit (the number of leading zeros plus one).
4. Each register keeps the **maximum** position seen.
5. Estimate the count from all registers with a harmonic mean: `alpha x m^2 / sum(2^-register)`, with corrections for small counts (when many registers are still zero) and bias.

Splitting into many registers and averaging them is what turns one very noisy observation into a stable estimate. The standard error is about **1.04 / sqrt(m)**: 4,096 registers (p = 12) give about 1.6%, and each extra bit of precision doubles memory and divides the error by about 1.4. Memory is fixed by `p`, not by the data size: a few kilobytes count billions of values.

The property that matters most for Data Engineers: two sketches built with the same `p` are **merged by taking the register-wise maximum**, and the merged sketch is exactly the sketch you would get from the combined data. So you can store one sketch per day and later combine any range of days into unique counts for a week, a month or a segment, without rescanning raw events.

### A working implementation

```python
import hashlib, math

class HyperLogLog:
    def __init__(self, p=12):
        self.p = p                      # 2**p registers
        self.m = 1 << p
        self.registers = [0] * self.m
        self.alpha = 0.7213 / (1 + 1.079 / self.m)

    def add(self, value):
        h = int.from_bytes(hashlib.blake2b(str(value).encode(), digest_size=8).digest(), "big")
        bucket = h >> (64 - self.p)                 # first p bits choose the register
        rest = h & ((1 << (64 - self.p)) - 1)       # remaining 64 - p bits
        rank = (64 - self.p) - rest.bit_length() + 1  # position of the first 1-bit
        self.registers[bucket] = max(self.registers[bucket], rank)

    def merge(self, other):
        merged = HyperLogLog(self.p)
        merged.registers = [max(a, b) for a, b in zip(self.registers, other.registers)]
        return merged

    def estimate(self):
        raw = self.alpha * self.m ** 2 / sum(2.0 ** -r for r in self.registers)
        zeros = self.registers.count(0)
        if raw <= 2.5 * self.m and zeros:           # small-range correction (linear counting)
            return self.m * math.log(self.m / zeros)
        return raw

monday, tuesday = HyperLogLog(), HyperLogLog()
for user in range(0, 60_000):
    monday.add(f"user-{user}")
for user in range(40_000, 100_000):                  # 20,000 users visit on both days
    tuesday.add(f"user-{user}")

both = monday.merge(tuesday)
for label, sketch, exact in [("Monday", monday, 60_000), ("Tuesday", tuesday, 60_000), ("Mon+Tue", both, 100_000)]:
    est = sketch.estimate()
    print(f"{label:<8} exact {exact:>7,}  estimate {est:>9,.0f}  error {100 * (est - exact) / exact:+.2f}%")
print(f"registers: {monday.m}, expected standard error about {104 / math.sqrt(monday.m):.2f}%")
```

```text
Monday   exact  60,000  estimate    58,173  error -3.04%
Tuesday  exact  60,000  estimate    60,664  error +1.11%
Mon+Tue  exact 100,000  estimate    97,995  error -2.00%
registers: 4096, expected standard error about 1.62%
```

The merged sketch correctly reports about 100,000 unique users over the two days, not 120,000, because users seen on both days set the same registers. The errors are within about two standard errors, as expected for a single run. Production implementations such as HyperLogLog++ (used by BigQuery) add a sparse representation for small counts and better bias correction.

### In SQL engines

**Snowflake** implements HLL with 12 bits of precision; its documentation gives an average relative error of about 1.62%, matching the formula above. `APPROX_COUNT_DISTINCT` is an alias for `HLL`, and the sketch functions let you store and merge states:

<!-- noexec -->
```sql
-- Snowflake
SELECT APPROX_COUNT_DISTINCT(user_id) AS approx_users FROM visits;

-- Store one sketch per day ...
CREATE TABLE daily_user_sketch AS
SELECT visit_date, HLL_ACCUMULATE(user_id) AS users_sketch
FROM visits
GROUP BY visit_date;

-- ... and combine any range later without rescanning raw data
SELECT HLL_ESTIMATE(HLL_COMBINE(users_sketch)) AS weekly_users
FROM daily_user_sketch
WHERE visit_date BETWEEN '2026-09-28' AND '2026-10-04';
```

**BigQuery** has `APPROX_COUNT_DISTINCT` with system-defined precision, and HyperLogLog++ sketch functions with configurable precision (10 to 24, default 15) stored as `BYTES`:

<!-- noexec -->
```sql
-- BigQuery
SELECT APPROX_COUNT_DISTINCT(user_id) AS approx_users FROM analytics.visits;

CREATE TABLE analytics.daily_user_sketch AS
SELECT visit_date, HLL_COUNT.INIT(user_id, 14) AS users_sketch
FROM analytics.visits
GROUP BY visit_date;

SELECT HLL_COUNT.MERGE(users_sketch) AS weekly_users
FROM analytics.daily_user_sketch
WHERE visit_date BETWEEN '2026-09-28' AND '2026-10-04';
-- HLL_COUNT.MERGE_PARTIAL returns a merged sketch; HLL_COUNT.EXTRACT reads a count from one sketch.
```

**DuckDB** provides `approx_count_distinct`:

<!-- engine: duckdb -->
```sql
CREATE TABLE visits AS
SELECT (i % 250000) AS user_id, DATE '2026-10-01' + CAST(i % 7 AS INTEGER) AS visit_date
FROM range(1000000) t(i);

SELECT COUNT(*) AS visits,
       COUNT(DISTINCT user_id) AS exact_users,
       approx_count_distinct(user_id) AS approx_users,
       ROUND(100.0 * (approx_count_distinct(user_id) - COUNT(DISTINCT user_id))
             / COUNT(DISTINCT user_id), 1) AS error_pct
FROM visits;
```

| visits | exact_users | approx_users | error_pct |
|---|---|---|---|
| 1000000 | 250000 | 221487 | -11.4 |

On DuckDB 1.5.6 the error on this data is about 11%, much larger than the roughly 1.6% of a 4,096-register sketch, which suggests a much smaller sketch. Always measure an approximate function's error on your own data and engine version before putting it on a dashboard, and check the documented precision.

PostgreSQL has no built-in HLL; the open-source `postgresql-hll` extension adds an `hll` type with similar accumulate-and-merge functions. Spark has `approx_count_distinct(col, rsd)` with a configurable relative standard deviation.

### Pitfalls

- **Mixing precisions or implementations.** Sketches can only be merged with sketches of the same type and precision; Snowflake and BigQuery sketches are not interchangeable.
- **Small counts.** For a handful of distinct values, use an exact count; approximate functions are designed for large cardinalities (though good implementations are exact or nearly exact for small ones).
- **Presenting estimates as exact.** Label approximate numbers, especially in finance or billing, where exact counts are required.
- **Set operations beyond union.** HLL merges give unions. Intersections ("users active on both days") derived by inclusion-exclusion from HLL estimates can have very large relative error; use exact methods or other sketch types (such as Theta sketches) for that.

### In interviews

"How does APPROX_COUNT_DISTINCT work?" Explain hashing, registers chosen by the first bits, the maximum leading-zero rank per register, the harmonic-mean estimate and an error of about 1.04/sqrt(m). Then the practical part: fixed memory, no shuffle of all values, and mergeable sketches that let you precompute daily sketches and answer weekly or monthly unique counts cheaply. That last point is what interviewers for Data Engineering roles listen for.

## Practice questions

<details><summary>A query computes five window functions with five different PARTITION BY / ORDER BY combinations and is slow. What do you do?</summary>

Each distinct specification needs its own sort (and in distributed engines its own shuffle). Consolidate specifications where the logic allows (a shared named `WINDOW`), filter and select only needed columns before the window step, check the plan for sorts that spill, and provide the order with an index or clustering for the most expensive specification. Consider splitting the query and joining the results if specifications cannot be shared.

</details>

<details><summary>Why can a global window such as ROW_NUMBER() OVER (ORDER BY created_at) be a problem in Spark?</summary>

With no `PARTITION BY`, all rows form one partition, so the whole dataset is sent to a single task to be sorted and numbered. That task becomes the bottleneck and may run out of memory. Number rows within a partition key, or use an id generator that does not need a total order when gaps are acceptable.

</details>

<details><summary>Why does skew hurt COUNT(DISTINCT) more than SUM?</summary>

`SUM` is decomposable: each worker sums its local rows and sends one partial result per key, so the hot key costs one row per worker. A distinct count cannot be combined from partial counts, because the same value may appear on several workers, so all rows of the hot key must meet in one place. Fixes are de-duplicating on (key, value) first, salting by the counted value, or using HLL sketches.

</details>

<details><summary>How does salting work, and what is the risk?</summary>

Add a salt (for example `hash(order_id) % 8`) to the grouping key, aggregate by key and salt so the hot key is split over several workers, then aggregate the partial results by key. The risk is applying it to a non-decomposable aggregate (summing partial distinct counts double counts values), using a non-deterministic random salt in a pipeline that must be reproducible, and multiplying groups for all keys when only a few are hot.

</details>

<details><summary>Explain HyperLogLog in two minutes.</summary>

Hash every value. The first p bits pick one of 2^p registers; in the rest, find the position of the first 1-bit. Each register stores the maximum position it has seen. A long run of leading zeros is rare, so large maxima mean many distinct values. The estimate combines all registers with a harmonic mean plus corrections; the error is about 1.04/sqrt(2^p), so 4,096 registers give about 1.6%. Duplicates do not change registers, memory is fixed, and two sketches merge by taking register-wise maxima.

</details>

<details><summary>Product wants daily, weekly and monthly unique users for any date range and segment. How do you build it cheaply?</summary>

Precompute one HLL sketch per day and segment (`HLL_ACCUMULATE` in Snowflake, `HLL_COUNT.INIT` in BigQuery) in the daily pipeline. For any range, merge the stored sketches (`HLL_COMBINE` plus `HLL_ESTIMATE`, or `HLL_COUNT.MERGE`) and read the estimate. Each query touches a few rows of sketches instead of raw events, and late data only requires rebuilding the affected day's sketch. Document that the numbers are approximate and their expected error.

</details>

## Key takeaways

- Every distinct window specification costs a sort (and a shuffle in distributed engines); share specifications, filter and project first, and supply order with indexes or clustering.
- For top-N per group, use engines' early-stop optimisations (`QUALIFY`, run conditions) or a `LATERAL ... LIMIT` with an index.
- Skewed keys overload one worker; partial aggregation fixes decomposable aggregates, while distinct counts and percentiles need salting, de-duplication on (key, value) or approximation.
- Check the top keys' share (including `NULL`) before tuning an aggregation that stalls on one task.
- HyperLogLog estimates distinct counts in fixed memory with an error of about 1.04/sqrt(m), and its sketches merge by register-wise maximum.
- Store daily HLL sketches to answer unique counts for any range cheaply; measure the error of your engine's approximate functions on your own data.

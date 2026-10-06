---
seoTitle: "SQL Window Functions: Ranking, LAG and LEAD"
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "SQL Window Functions: Ranking, LAG/LEAD and FIRST_VALUE"
description: "Learn SQL window functions: OVER and PARTITION BY, ROW_NUMBER, RANK and DENSE_RANK with ties, NTILE buckets, LAG and LEAD comparisons, and FIRST_VALUE and LAST_VALUE."
inventoryId: "TECH-02"
technology: ["sql"]
topic: ["window-functions", "ranking"]
difficulty: "Intermediate"
featured: true
learningObjectives:
  - "Explain how a window function differs from GROUP BY and where it can be used in a query"
  - "Partition and order windows correctly, including deterministic tiebreakers"
  - "Choose between ROW_NUMBER, RANK and DENSE_RANK based on how ties should behave"
  - "Bucket rows with NTILE and know its edge cases"
  - "Compare rows with LAG and LEAD, and avoid the LAST_VALUE frame trap"
prerequisites: ["articles:sql/aggregations-group-by-having", "articles:sql/ctes-subqueries-temp-tables"]
related: ["articles:pyspark/window-functions", "interview-questions:sql/window-functions-vs-group-by", "interview-questions:sql/second-highest-salary"]
previous: "articles:sql/pivot-unpivot-grouping-sets"
next: "articles:sql/window-frames-running-totals"
sources:
  - { label: "PostgreSQL documentation: Window functions tutorial", url: "https://www.postgresql.org/docs/16/tutorial-window.html" }
  - { label: "PostgreSQL documentation: Window functions reference", url: "https://www.postgresql.org/docs/16/functions-window.html" }
  - { label: "PostgreSQL documentation: Window function calls (syntax and frames)", url: "https://www.postgresql.org/docs/16/sql-expressions.html" }
  - { label: "Snowflake documentation: Window function syntax and usage", url: "https://docs.snowflake.com/en/sql-reference/functions-window-syntax" }
  - { label: "BigQuery documentation: Window function calls", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/window-function-calls" }
versionContext: "Examples run on PostgreSQL 16; QUALIFY and IGNORE NULLS examples run on DuckDB 1.5. Notes on Snowflake, BigQuery and SQL Server were not executed."
---

A window function computes a value for each row using a set of related rows, **without collapsing them into one row** the way `GROUP BY` does. That makes it the right tool for rankings, "latest row per key", previous-row comparisons and per-group context next to each detail row. Window functions appear in most SQL interviews for Data Engineers, so this lesson covers the ranking and offset functions in depth. Running totals, moving averages and percentiles, which depend on window frames, follow in the next lesson.

## Sample data

Orders for five customers in two regions. Several amounts tie on purpose (two orders of 220.00, two of 80.00, two of 150.00), because ties are where window functions differ.

```sql
CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  region      TEXT NOT NULL,
  order_date  DATE NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL
);

INSERT INTO orders VALUES
  (101, 1, 'EU', '2025-06-01', 120.00),
  (102, 1, 'EU', '2025-06-03',  35.50),
  (103, 1, 'EU', '2025-06-10',  80.00),
  (104, 2, 'EU', '2025-06-02', 220.00),
  (105, 2, 'EU', '2025-06-05',  80.00),
  (106, 3, 'US', '2025-06-01', 220.00),
  (107, 3, 'US', '2025-06-04',  64.99),
  (108, 4, 'US', '2025-06-06', 150.00),
  (109, 4, 'US', '2025-06-09', 150.00),
  (110, 5, 'US', '2025-06-08',  45.00);
```

## Window function basics: the OVER clause

Any function followed by `OVER (...)` is a window function. The `OVER` clause defines the **window**: which rows the function looks at for the current row.

<!-- noexec -->
```sql
function(args) OVER (
  PARTITION BY ...   -- split rows into independent groups (optional)
  ORDER BY ...       -- order rows inside each group (required for ranking and offsets)
  frame_clause       -- which rows around the current one to use (aggregates only)
)
```

The simplest window is empty: `OVER ()` means "all rows of the result". It lets you put a grand total next to every row:

```sql
SELECT order_id,
       amount,
       SUM(amount)   OVER () AS total_revenue,
       COUNT(*)      OVER () AS total_orders,
       ROUND(100.0 * amount / SUM(amount) OVER (), 1) AS pct_of_total
FROM orders
ORDER BY order_id
LIMIT 4;
```

| order_id | amount | total_revenue | total_orders | pct_of_total |
|---|---|---|---|---|
| 101 | 120.00 | 1165.49 | 10 | 10.3 |
| 102 | 35.50 | 1165.49 | 10 | 3.0 |
| 103 | 80.00 | 1165.49 | 10 | 6.9 |
| 104 | 220.00 | 1165.49 | 10 | 18.9 |

With `GROUP BY` you would get one row with the total and lose the detail; here every order keeps its row and gains the total.

### How it works

- Window functions are computed **after** `WHERE`, `GROUP BY` and `HAVING`, at the `SELECT` step, and before `DISTINCT`, `ORDER BY` and `LIMIT`. So the `LIMIT 4` above did not change the total: the window saw all ten rows.
- Because of that order, a window function **cannot appear in `WHERE`, `GROUP BY` or `HAVING`**. To filter on one, compute it in a CTE or subquery and filter outside, or use `QUALIFY` where available (see `ROW_NUMBER` below).
- A window function can be used in `ORDER BY`, and it can wrap an aggregate in a grouped query: `SUM(SUM(amount)) OVER ()` gives the grand total of the group totals.
- Three families exist: **aggregates** used as windows (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`), **ranking** functions (`ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`, `PERCENT_RANK`, `CUME_DIST`) and **value/offset** functions (`LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE`).
- When several functions share a window, name it once with a `WINDOW` clause: `... OVER w FROM orders WINDOW w AS (PARTITION BY customer_id ORDER BY order_date)`. Supported in PostgreSQL, MySQL 8, BigQuery and DuckDB, among others.

### Pitfalls

- Filtering on a window result in `WHERE` (an error).
- Expecting `LIMIT` or a later `WHERE` in an outer query to change what the window saw. Filters in the **same** query run first; filters in an **outer** query run after the window was computed.
- Assuming the output is sorted by the window's `ORDER BY`. It is not; add a final `ORDER BY`.

### In interviews

"What is the difference between a window function and `GROUP BY`?" Answer: `GROUP BY` returns one row per group; a window function returns every input row with a value computed over related rows. Mention when each runs in the logical order and that window results must be filtered in an outer query or with `QUALIFY`. The practice page [window functions vs GROUP BY](/interview/sql/window-functions-vs-group-by/) has a worked answer.

## The PARTITION BY clause

`PARTITION BY` splits the rows into independent groups. The function restarts for each partition, as if it ran separately on each group. Unlike `GROUP BY`, the rows are not collapsed.

```sql
SELECT customer_id,
       order_id,
       amount,
       SUM(amount)   OVER (PARTITION BY customer_id) AS customer_total,
       COUNT(*)      OVER (PARTITION BY customer_id) AS customer_orders,
       ROUND(100.0 * amount / SUM(amount) OVER (PARTITION BY customer_id), 1) AS pct_of_customer,
       ROUND(AVG(amount) OVER (PARTITION BY region), 2) AS region_avg
FROM orders
ORDER BY customer_id, order_id;
```

| customer_id | order_id | amount | customer_total | customer_orders | pct_of_customer | region_avg |
|---|---|---|---|---|---|---|
| 1 | 101 | 120.00 | 235.50 | 3 | 51.0 | 107.10 |
| 1 | 102 | 35.50 | 235.50 | 3 | 15.1 | 107.10 |
| 1 | 103 | 80.00 | 235.50 | 3 | 34.0 | 107.10 |
| 2 | 104 | 220.00 | 300.00 | 2 | 73.3 | 107.10 |
| 2 | 105 | 80.00 | 300.00 | 2 | 26.7 | 107.10 |
| 3 | 106 | 220.00 | 284.99 | 2 | 77.2 | 126.00 |
| 3 | 107 | 64.99 | 284.99 | 2 | 22.8 | 126.00 |
| 4 | 108 | 150.00 | 300.00 | 2 | 50.0 | 126.00 |
| 4 | 109 | 150.00 | 300.00 | 2 | 50.0 | 126.00 |
| 5 | 110 | 45.00 | 45.00 | 1 | 100.0 | 126.00 |

### How it works

- Each window function in a query can have its **own** partitioning: the same row can be compared with its customer's orders and its region's orders.
- `PARTITION BY a, b` partitions on the combination of values. `NULL`s form one partition together.
- Without `PARTITION BY`, the whole result is one partition.
- Partitioning by a key with a typical size (customers, days) is cheap. In distributed engines such as Spark, the data is shuffled so each partition sits on one worker, and a window **without** `PARTITION BY` forces all rows onto a single worker, which is slow or fails on big data.

### Pitfalls

- Partitioning by too fine a key (every order) makes each partition one row, so every ranking is 1.
- Forgetting `PARTITION BY` in a "per customer" calculation, so the ranking or total runs over everyone.
- Skewed partitions: one huge customer or a `NULL` key holding most rows creates one very slow task in Spark.

### In interviews

Expect "show each order with its share of the customer's total" or "compare each employee's salary with their department average". Use `PARTITION BY`, keep the detail rows, and mention the single-partition problem if the conversation turns to Spark.

## ROW_NUMBER()

`ROW_NUMBER()` numbers the rows of each partition 1, 2, 3, ... in the window's `ORDER BY` order. Every row gets a **unique** number, even when the sort values tie. It is the workhorse for "first/latest row per key" and de-duplication.

```sql
SELECT customer_id, order_id, order_date, amount,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS recency_rank
FROM orders
ORDER BY customer_id, recency_rank;
```

| customer_id | order_id | order_date | amount | recency_rank |
|---|---|---|---|---|
| 1 | 103 | 2025-06-10 | 80.00 | 1 |
| 1 | 102 | 2025-06-03 | 35.50 | 2 |
| 1 | 101 | 2025-06-01 | 120.00 | 3 |
| 2 | 105 | 2025-06-05 | 80.00 | 1 |
| 2 | 104 | 2025-06-02 | 220.00 | 2 |
| 3 | 107 | 2025-06-04 | 64.99 | 1 |
| 3 | 106 | 2025-06-01 | 220.00 | 2 |
| 4 | 109 | 2025-06-09 | 150.00 | 1 |
| 4 | 108 | 2025-06-06 | 150.00 | 2 |
| 5 | 110 | 2025-06-08 | 45.00 | 1 |

### Filtering on the row number

To keep only each customer's latest order, compute the number in a CTE and filter outside:

```sql
WITH ranked AS (
  SELECT customer_id, order_id, order_date, amount,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS rn
  FROM orders
)
SELECT customer_id, order_id, order_date, amount
FROM ranked
WHERE rn = 1
ORDER BY customer_id;
```

| customer_id | order_id | order_date | amount |
|---|---|---|---|
| 1 | 103 | 2025-06-10 | 80.00 |
| 2 | 105 | 2025-06-05 | 80.00 |
| 3 | 107 | 2025-06-04 | 64.99 |
| 4 | 109 | 2025-06-09 | 150.00 |
| 5 | 110 | 2025-06-08 | 45.00 |

Snowflake, BigQuery, Databricks, DuckDB and Teradata support `QUALIFY`, which filters on window results directly, the way `HAVING` filters on aggregates. It is not available in PostgreSQL, MySQL or SQL Server. In DuckDB:

<!-- engine: duckdb -->
```sql
CREATE TABLE orders (order_id INT, customer_id INT, order_date DATE, amount DECIMAL(10, 2));
INSERT INTO orders VALUES
  (101, 1, '2025-06-01', 120.00), (102, 1, '2025-06-03', 35.50), (103, 1, '2025-06-10', 80.00),
  (104, 2, '2025-06-02', 220.00), (105, 2, '2025-06-05', 80.00);

SELECT customer_id, order_id, order_date
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) = 1
ORDER BY customer_id;
```

| customer_id | order_id | order_date |
|---|---|---|
| 1 | 103 | 2025-06-10 |
| 2 | 105 | 2025-06-05 |

The [top-N and deduplication lesson](/sql/top-n-deduplication-scd-queries/) builds on this pattern.

### Pitfalls

- **Missing tiebreaker.** Customer 4's two orders have different dates, but if they had shared a date, `ORDER BY order_date DESC` alone would let the engine pick either as row 1, and the choice can change between runs. Always end the window's `ORDER BY` with a unique column.
- Using `ROW_NUMBER` when ties should share a position (use `RANK` or `DENSE_RANK`).
- `ROW_NUMBER() OVER ()` with no `ORDER BY` numbers rows in an arbitrary order. It is fine for a surrogate sequence, never for "first".

### In interviews

"Keep the latest record per key" is the most common window-function question in Data Engineering interviews. Write the CTE plus `rn = 1`, add a tiebreaker without being asked, and mention `QUALIFY` for the engine in use.

## RANK() versus DENSE_RANK()

`RANK()` and `DENSE_RANK()` give tied rows the **same** number. They differ in what comes after a tie: `RANK` **skips** numbers (1, 1, 3), like a sports league; `DENSE_RANK` does **not** (1, 1, 2).

```sql
SELECT order_id, amount,
       ROW_NUMBER() OVER (ORDER BY amount DESC, order_id) AS row_number,
       RANK()       OVER (ORDER BY amount DESC)           AS rank,
       DENSE_RANK() OVER (ORDER BY amount DESC)           AS dense_rank
FROM orders
ORDER BY amount DESC, order_id;
```

| order_id | amount | row_number | rank | dense_rank |
|---|---|---|---|---|
| 104 | 220.00 | 1 | 1 | 1 |
| 106 | 220.00 | 2 | 1 | 1 |
| 108 | 150.00 | 3 | 3 | 2 |
| 109 | 150.00 | 4 | 3 | 2 |
| 101 | 120.00 | 5 | 5 | 3 |
| 103 | 80.00 | 6 | 6 | 4 |
| 105 | 80.00 | 7 | 6 | 4 |
| 107 | 64.99 | 8 | 8 | 5 |
| 110 | 45.00 | 9 | 9 | 6 |
| 102 | 35.50 | 10 | 10 | 7 |

### Which one to use

| Question | Function |
|---|---|
| Exactly one row per group, ties broken arbitrarily but deterministically | `ROW_NUMBER` |
| "Top 3" where tied rows should all be included, positions like a leaderboard | `RANK` |
| "The Nth highest **distinct** value" (second-highest salary) | `DENSE_RANK` |

The second-highest distinct amount here is 150.00: `DENSE_RANK() = 2` finds it, while `RANK() = 2` finds nothing, because ranks jump from 1 to 3.

```sql
WITH ranked AS (
  SELECT DISTINCT amount, DENSE_RANK() OVER (ORDER BY amount DESC) AS dr
  FROM orders
)
SELECT amount AS second_highest FROM ranked WHERE dr = 2;
```

| second_highest |
|---|
| 150.00 |

### Pitfalls

- Using `RANK() = N` for "Nth highest": it returns nothing when ties occupy that position.
- Expecting a fixed number of rows from `RANK() <= 3`: ties can return more than three.
- Ranking on a nullable column: `NULL`s sort last in ascending order in PostgreSQL and first in descending order, so a `DESC` ranking puts `NULL` at rank 1. Use `NULLS LAST` in the window's `ORDER BY`.

### In interviews

Be ready to write out the three columns for a small list with ties, as above. The classic follow-up is "second-highest salary"; [this practice question](/interview/sql/second-highest-salary/) walks through it. State how your choice handles ties and an empty result.

## NTILE() bucketing

`NTILE(n)` splits the ordered rows of each partition into `n` buckets of as equal size as possible and returns the bucket number, 1 to n. It is used for quartiles, deciles and splitting work into batches.

```sql
WITH customer_spend AS (
  SELECT customer_id, SUM(amount) AS spend
  FROM orders
  GROUP BY customer_id
)
SELECT customer_id, spend,
       NTILE(2) OVER (ORDER BY spend DESC, customer_id) AS half,
       NTILE(3) OVER (ORDER BY spend DESC, customer_id) AS tercile
FROM customer_spend
ORDER BY spend DESC, customer_id;
```

| customer_id | spend | half | tercile |
|---|---|---|---|
| 2 | 300.00 | 1 | 1 |
| 4 | 300.00 | 1 | 1 |
| 3 | 284.99 | 1 | 2 |
| 1 | 235.50 | 2 | 2 |
| 5 | 45.00 | 2 | 3 |

### How it works

- With 5 rows and 2 buckets, the sizes are 3 and 2: when rows do not divide evenly, the **first** buckets get one extra row each.
- `NTILE` assigns buckets by **position**, not by value. Tied values can land in different buckets, and with fewer rows than buckets some buckets are empty.
- It answers "split into equal-sized groups", not "which values are above the 75th percentile". For value-based cut-offs use `PERCENT_RANK`, `CUME_DIST` or `PERCENTILE_CONT`, covered in the [window frames lesson](/sql/window-frames-running-totals/), or `WIDTH_BUCKET` for fixed value ranges.

### Pitfalls

- Treating `NTILE(4)` as statistical quartiles of the values. Ties across a boundary make that wrong.
- Forgetting a tiebreaker, so rows with equal values swap buckets between runs.
- Small partitions: `NTILE(10)` over 3 rows gives buckets 1, 2 and 3 only.

### In interviews

Typical prompt: "label customers by spend quartile". Use `NTILE(4)`, then point out the tie and uneven-size behaviour and offer `PERCENT_RANK` when the business wants value-based thresholds.

## LAG() and LEAD()

`LAG(expr, offset, default)` returns the value of `expr` from a **previous** row in the window order; `LEAD` returns it from a **following** row. The offset defaults to 1 and the default value to `NULL`. They replace awkward self joins for "compare with the previous row".

```sql
SELECT customer_id, order_id, order_date, amount,
       LAG(amount)  OVER w                     AS prev_amount,
       amount - LAG(amount) OVER w             AS change_vs_prev,
       order_date - LAG(order_date) OVER w     AS days_since_prev,
       LEAD(order_date) OVER w                 AS next_order_date,
       LAG(amount, 1, 0) OVER w                AS prev_amount_or_zero
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY order_date, order_id)
ORDER BY customer_id, order_date;
```

| customer_id | order_id | order_date | amount | prev_amount | change_vs_prev | days_since_prev | next_order_date | prev_amount_or_zero |
|---|---|---|---|---|---|---|---|---|
| 1 | 101 | 2025-06-01 | 120.00 | NULL | NULL | NULL | 2025-06-03 | 0 |
| 1 | 102 | 2025-06-03 | 35.50 | 120.00 | -84.50 | 2 | 2025-06-10 | 120.00 |
| 1 | 103 | 2025-06-10 | 80.00 | 35.50 | 44.50 | 7 | NULL | 35.50 |
| 2 | 104 | 2025-06-02 | 220.00 | NULL | NULL | NULL | 2025-06-05 | 0 |
| 2 | 105 | 2025-06-05 | 80.00 | 220.00 | -140.00 | 3 | NULL | 220.00 |
| 3 | 106 | 2025-06-01 | 220.00 | NULL | NULL | NULL | 2025-06-04 | 0 |
| 3 | 107 | 2025-06-04 | 64.99 | 220.00 | -155.01 | 3 | NULL | 220.00 |
| 4 | 108 | 2025-06-06 | 150.00 | NULL | NULL | NULL | 2025-06-09 | 0 |
| 4 | 109 | 2025-06-09 | 150.00 | 150.00 | 0.00 | 3 | NULL | 150.00 |
| 5 | 110 | 2025-06-08 | 45.00 | NULL | NULL | NULL | NULL | 0 |

### How it works

- The first row of each partition has no previous row, so `LAG` returns `NULL` (or the default you supply); the last row has no next row for `LEAD`.
- Offsets refer to **rows**, not time. `LAG(amount, 7)` is "seven rows back", which equals "seven days back" only if there is exactly one row per day with no gaps. For calendar comparisons, join to a calendar or use a `RANGE` frame (next lesson).
- `LAG` and `LEAD` ignore any frame clause; only `PARTITION BY` and `ORDER BY` matter.
- Some engines (Snowflake, BigQuery, Oracle, DuckDB) support `IGNORE NULLS` to skip `NULL` values and take the last non-null one, which is handy for forward-filling. PostgreSQL 16 does not support it. In DuckDB:

<!-- engine: duckdb -->
```sql
SELECT reading_time, temperature,
       LAG(temperature IGNORE NULLS) OVER (ORDER BY reading_time) AS last_known_before
FROM (VALUES (1, 20.5), (2, NULL), (3, NULL), (4, 21.0)) AS t(reading_time, temperature)
ORDER BY reading_time;
```

| reading_time | temperature | last_known_before |
|---|---|---|
| 1 | 20.5 | NULL |
| 2 | NULL | 20.5 |
| 3 | NULL | 20.5 |
| 4 | 21.0 | 20.5 |

### Common uses

- Change versus previous period (revenue this month versus last month).
- Time between events (days between orders, session gaps).
- Detecting changes in a value, the basis of slowly changing dimension and "gaps and islands" queries: `WHERE status IS DISTINCT FROM LAG(status) OVER (...)`.

### Pitfalls

- No tiebreaker in the `ORDER BY`, so "previous" is ambiguous for rows with the same timestamp.
- Missing `PARTITION BY`, so the first order of customer 2 is compared with the last order of customer 1.
- Treating row offsets as time offsets when there are gaps.

### In interviews

"Month-over-month growth", "days between a user's consecutive logins" and "flag rows where the price changed" are all `LAG` questions. Partition by the entity, order by time with a tiebreaker, and say what the first row returns.

## FIRST_VALUE and LAST_VALUE

`FIRST_VALUE(expr)` returns `expr` from the first row of the window frame, `LAST_VALUE(expr)` from the last row, and `NTH_VALUE(expr, n)` from the nth. Unlike `LAG`, they **do** depend on the window frame, and that causes the most common window-function bug.

```sql
SELECT customer_id, order_id, order_date, amount,
       FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS first_order_amount,
       LAST_VALUE(amount)  OVER (PARTITION BY customer_id ORDER BY order_date) AS last_value_default,
       LAST_VALUE(amount)  OVER (PARTITION BY customer_id ORDER BY order_date
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_order_amount
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY customer_id, order_date;
```

| customer_id | order_id | order_date | amount | first_order_amount | last_value_default | last_order_amount |
|---|---|---|---|---|---|---|
| 1 | 101 | 2025-06-01 | 120.00 | 120.00 | 120.00 | 80.00 |
| 1 | 102 | 2025-06-03 | 35.50 | 120.00 | 35.50 | 80.00 |
| 1 | 103 | 2025-06-10 | 80.00 | 120.00 | 80.00 | 80.00 |
| 2 | 104 | 2025-06-02 | 220.00 | 220.00 | 220.00 | 80.00 |
| 2 | 105 | 2025-06-05 | 80.00 | 220.00 | 80.00 | 80.00 |

### The LAST_VALUE trap

When a window has an `ORDER BY` and no explicit frame, the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`: from the start of the partition **up to the current row** (and its peers). So the "last value" of that frame is the current row itself, as the `last_value_default` column shows. To get the true last value of the partition, extend the frame to `UNBOUNDED FOLLOWING`, or, simpler, use `FIRST_VALUE` with the order reversed:

```sql
SELECT DISTINCT customer_id,
       FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS latest_amount
FROM orders
ORDER BY customer_id;
```

| customer_id | latest_amount |
|---|---|
| 1 | 80.00 |
| 2 | 80.00 |
| 3 | 64.99 |
| 4 | 150.00 |
| 5 | 45.00 |

Frames are covered properly in the [window frames lesson](/sql/window-frames-running-totals/).

### Other details

- `FIRST_VALUE` on a nullable column returns `NULL` if the first row's value is `NULL`. Snowflake, BigQuery, Oracle and DuckDB accept `IGNORE NULLS` to skip them; PostgreSQL 16 does not.
- `NTH_VALUE(amount, 2)` with the default frame returns `NULL` on the first row (the frame has only one row so far). Use a full frame if you want the value on every row.
- Ties in the `ORDER BY` make the first and last values arbitrary among the tied rows; add a tiebreaker.

### In interviews

A favourite trick question: "why does `LAST_VALUE` return the current row's value?" Explain the default frame and give both fixes. `FIRST_VALUE` also appears in "show each order with the customer's first order amount" and in attribution questions (first touch, last touch).

## Practice questions

<details><summary>Given salaries 100, 90, 90, 80, what do ROW_NUMBER, RANK and DENSE_RANK return when ordered descending?</summary>

`ROW_NUMBER`: 1, 2, 3, 4 (the order between the two 90s is arbitrary unless you add a tiebreaker). `RANK`: 1, 2, 2, 4. `DENSE_RANK`: 1, 2, 2, 3.

</details>

<details><summary>Return each customer's most recent order, exactly one row per customer, in PostgreSQL and in Snowflake.</summary>

PostgreSQL: compute `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS rn` in a CTE and select `WHERE rn = 1`. Snowflake: the same, or directly `QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) = 1`. The `order_id` tiebreaker guarantees one deterministic row when two orders share a date.

</details>

<details><summary>Why does SELECT ... WHERE ROW_NUMBER() OVER (...) = 1 fail?</summary>

Window functions are evaluated after `WHERE` (at the `SELECT` step), so their results do not exist when `WHERE` runs. Compute the row number in a subquery or CTE and filter in the outer query, or use `QUALIFY` in engines that support it.

</details>

<details><summary>For each user's login, compute the number of days since their previous login, and flag gaps longer than 30 days.</summary>

```
SELECT user_id, login_date,
       login_date - LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date) AS days_since_prev,
       CASE WHEN login_date - LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date) > 30
            THEN 1 ELSE 0 END AS long_gap
FROM logins;
```

The first login per user has `NULL` days and is not flagged. Partitioning by user prevents comparing one user's login with another's.

</details>

<details><summary>A query uses LAST_VALUE(price) OVER (PARTITION BY product ORDER BY changed_at) to get each product's current price, but it returns a different price on every row. Why?</summary>

With `ORDER BY` and no frame, the frame ends at the current row, so `LAST_VALUE` returns the current row's price. Add `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`, or use `FIRST_VALUE(price) OVER (PARTITION BY product ORDER BY changed_at DESC)`.

</details>

<details><summary>NTILE(4) put two customers with identical spend into different quartiles. Is that a bug?</summary>

No; it is how `NTILE` works. It assigns buckets by row position to make the bucket sizes as equal as possible, so tied values can straddle a boundary. If equal values must share a bucket, derive buckets from `PERCENT_RANK()` or `CUME_DIST()` thresholds, or compute cut-off values with `PERCENTILE_CONT` and compare.

</details>

## Key takeaways

- A window function adds a computed column to every row without collapsing rows; `OVER ()` uses the whole result, `PARTITION BY` restarts per group.
- Window functions run at the `SELECT` step, so filter on them in an outer query or with `QUALIFY`.
- `ROW_NUMBER` gives unique positions, `RANK` shares positions and skips, `DENSE_RANK` shares without gaps; always add a deterministic tiebreaker.
- `NTILE(n)` makes equal-sized buckets by position, not value-based percentiles.
- `LAG` and `LEAD` compare with neighbouring rows by row offset; partition by the entity and remember the first and last rows return `NULL`.
- `LAST_VALUE` with the default frame returns the current row; widen the frame or reverse the order with `FIRST_VALUE`.

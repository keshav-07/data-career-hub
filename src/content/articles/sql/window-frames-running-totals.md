---
title: "Window Frames: Running Totals, Moving Averages and Percentiles"
seoTitle: "SQL Window Frames: Running Totals and Percentiles"
description: "Master SQL window frames: running totals, moving averages with ROWS and RANGE, conditional window aggregates, percent of total, CUME_DIST and median with PERCENTILE_CONT."
technology: ["sql"]
topic: ["window-functions", "window-frames", "running-totals", "percentiles"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Write running totals and explain the default frame and the ROWS versus RANGE difference"
  - "Compute moving averages over a fixed number of rows or a time range"
  - "Combine conditions with window aggregates and choose ROWS, RANGE or GROUPS frames"
  - "Calculate percent of total and cumulative share with window sums"
  - "Use CUME_DIST, PERCENT_RANK and PERCENTILE_CONT, and know each engine's syntax for medians"
prerequisites: ["articles:sql/window-functions"]
related: ["articles:pyspark/window-functions", "interview-questions:sql/window-functions-vs-group-by"]
previous: "articles:sql/window-functions"
sources:
  - { label: "PostgreSQL documentation: Window function calls and frame clauses", url: "https://www.postgresql.org/docs/16/sql-expressions.html" }
  - { label: "PostgreSQL documentation: Window functions (CUME_DIST, PERCENT_RANK)", url: "https://www.postgresql.org/docs/16/functions-window.html" }
  - { label: "PostgreSQL documentation: Ordered-set aggregate functions (PERCENTILE_CONT)", url: "https://www.postgresql.org/docs/16/functions-aggregate.html" }
  - { label: "BigQuery documentation: Navigation functions (PERCENTILE_CONT)", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/navigation_functions" }
  - { label: "Snowflake documentation: Window function syntax and usage", url: "https://docs.snowflake.com/en/sql-reference/functions-window-syntax" }
versionContext: "Examples run on PostgreSQL 16; the MEDIAN and QUALIFY-free percentile example runs on DuckDB 1.5. SQL Server, Snowflake and BigQuery syntax is shown for comparison and was not executed."
---

The [previous lesson](/sql/window-functions/) covered ranking and offset functions, which ignore the window frame. Aggregate window functions (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`) and value functions like `LAST_VALUE` depend on the **frame**: the subset of the partition, relative to the current row, that feeds the calculation. Frames are how SQL computes running totals, moving averages and year-to-date figures. This lesson covers frames properly, then the distribution functions used for shares, percentiles and medians.

## Sample data

Daily revenue for two stores over eight days. Store B was closed on 4 June, so it has no row for that date, and some days were promotion days.

```sql
CREATE TABLE daily_sales (
  sale_date DATE NOT NULL,
  store     TEXT NOT NULL,
  revenue   NUMERIC(10, 2) NOT NULL,
  is_promo  BOOLEAN NOT NULL
);

INSERT INTO daily_sales VALUES
  ('2025-06-01', 'A', 100, false), ('2025-06-02', 'A', 120, false),
  ('2025-06-03', 'A',  90, false), ('2025-06-04', 'A', 150, true),
  ('2025-06-05', 'A', 130, false), ('2025-06-06', 'A', 170, true),
  ('2025-06-07', 'A', 160, false), ('2025-06-08', 'A', 110, false),
  ('2025-06-01', 'B',  80, false), ('2025-06-02', 'B',  60, false),
  ('2025-06-03', 'B',  70, false), ('2025-06-05', 'B',  90, false),
  ('2025-06-06', 'B', 100, true),  ('2025-06-07', 'B', 120, false),
  ('2025-06-08', 'B',  95, false);
```

## Running totals with SUM OVER

A **running total** (cumulative sum) adds each row's value to the sum of all earlier rows. It is a window `SUM` with an `ORDER BY`, usually partitioned by the entity.

```sql
SELECT store, sale_date, revenue,
       SUM(revenue) OVER (
         PARTITION BY store
         ORDER BY sale_date
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_total
FROM daily_sales
WHERE store = 'A'
ORDER BY sale_date;
```

| store | sale_date | revenue | running_total |
|---|---|---|---|
| A | 2025-06-01 | 100.00 | 100.00 |
| A | 2025-06-02 | 120.00 | 220.00 |
| A | 2025-06-03 | 90.00 | 310.00 |
| A | 2025-06-04 | 150.00 | 460.00 |
| A | 2025-06-05 | 130.00 | 590.00 |
| A | 2025-06-06 | 170.00 | 760.00 |
| A | 2025-06-07 | 160.00 | 920.00 |
| A | 2025-06-08 | 110.00 | 1030.00 |

### The frame clause

A frame has a **mode** and two **bounds**:

```
{ ROWS | RANGE | GROUPS } BETWEEN <start> AND <end>
  start/end: UNBOUNDED PRECEDING | n PRECEDING | CURRENT ROW | n FOLLOWING | UNBOUNDED FOLLOWING
```

| Mode | Counts in | `CURRENT ROW` means |
|---|---|---|
| `ROWS` | Physical rows | Exactly this row |
| `RANGE` | Values of the `ORDER BY` column | This row and all its **peers** (rows with the same sort value) |
| `GROUPS` | Groups of peers | This row's peer group (PostgreSQL 11+, SQLite, DuckDB) |

### The default frame, and why ROWS versus RANGE matters

If you write an `ORDER BY` but no frame, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. Without an `ORDER BY`, the default is the whole partition. The default `RANGE` frame gives a different answer from `ROWS` when the order column has **ties**. A company-wide running total ordered by date has two rows per date (one per store):

```sql
SELECT sale_date, store, revenue,
       SUM(revenue) OVER (ORDER BY sale_date)                         AS default_range,
       SUM(revenue) OVER (ORDER BY sale_date, store
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_frame
FROM daily_sales
WHERE sale_date <= DATE '2025-06-03'
ORDER BY sale_date, store;
```

| sale_date | store | revenue | default_range | rows_frame |
|---|---|---|---|---|
| 2025-06-01 | A | 100.00 | 180.00 | 100.00 |
| 2025-06-01 | B | 80.00 | 180.00 | 180.00 |
| 2025-06-02 | A | 120.00 | 360.00 | 300.00 |
| 2025-06-02 | B | 60.00 | 360.00 | 360.00 |
| 2025-06-03 | A | 90.00 | 520.00 | 450.00 |
| 2025-06-03 | B | 70.00 | 520.00 | 520.00 |

With `RANGE`, both rows on 1 June are peers, so both see the full day's total (180). With `ROWS`, the total grows one row at a time. Neither is wrong: `RANGE` answers "cumulative revenue up to and including this date", `ROWS` answers "cumulative revenue up to this row". Write the frame explicitly so the reader knows which you meant, and add a tiebreaker to the `ORDER BY` when you use `ROWS`.

### Pitfalls

- Relying on the default frame and getting `RANGE` behaviour with tied dates.
- `ROWS` with a non-unique `ORDER BY`: the order among ties is arbitrary, so the intermediate running totals can change between runs (the final total does not).
- Forgetting `PARTITION BY`, so store B's running total continues from store A's.
- Performance: in PostgreSQL and most engines, `ROWS ... UNBOUNDED PRECEDING` is computed incrementally and is cheap. In Spark, a window without `PARTITION BY` pulls all rows onto one task.

### In interviews

"Write a running total of revenue per customer" is routine. The differentiating follow-up is "what happens with two orders on the same date?" Explain the default `RANGE` frame and peers, and show the explicit `ROWS` frame with a tiebreaker.

## Moving average with a frame clause

A **moving average** (rolling average) averages the current row with a fixed window of neighbouring rows, smoothing day-to-day noise. A frame with `n PRECEDING` defines the window.

```sql
SELECT store, sale_date, revenue,
       ROUND(AVG(revenue) OVER w, 2) AS avg_3_rows,
       COUNT(*) OVER w               AS rows_in_window,
       ROUND(AVG(revenue) OVER (PARTITION BY store ORDER BY sale_date
                                RANGE BETWEEN INTERVAL '2 days' PRECEDING AND CURRENT ROW), 2) AS avg_3_days
FROM daily_sales
WHERE store = 'B'
WINDOW w AS (PARTITION BY store ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY sale_date;
```

| store | sale_date | revenue | avg_3_rows | rows_in_window | avg_3_days |
|---|---|---|---|---|---|
| B | 2025-06-01 | 80.00 | 80.00 | 1 | 80.00 |
| B | 2025-06-02 | 60.00 | 70.00 | 2 | 70.00 |
| B | 2025-06-03 | 70.00 | 70.00 | 3 | 70.00 |
| B | 2025-06-05 | 90.00 | 73.33 | 3 | 80.00 |
| B | 2025-06-06 | 100.00 | 86.67 | 3 | 95.00 |
| B | 2025-06-07 | 120.00 | 103.33 | 3 | 103.33 |
| B | 2025-06-08 | 95.00 | 105.00 | 3 | 105.00 |

### Rows versus time

Look at 5 June. The `ROWS` frame takes the previous two **rows**, which are 2 and 3 June, because 4 June is missing. The `RANGE` frame takes the previous two **days**, 3 to 5 June, and only finds 3 and 5 June. When the data has gaps, "the last 3 rows" and "the last 3 days" are different windows. For time-based metrics, either use a `RANGE` frame with an interval, or fill the gaps first by joining to a calendar (the time-series lesson that follows shows both). Also decide whether a closed day counts as zero revenue (fill with 0) or as no information (leave it out); the averages differ.

### Incomplete windows

The first rows have fewer than three values, so their "3-day average" is really a 1- or 2-day average. Either show it with the count, as above, or blank it out:

```sql
SELECT sale_date, revenue,
       CASE WHEN COUNT(*) OVER w = 3 THEN ROUND(AVG(revenue) OVER w, 2) END AS avg_3_rows
FROM daily_sales
WHERE store = 'A'
WINDOW w AS (ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY sale_date
LIMIT 4;
```

| sale_date | revenue | avg_3_rows |
|---|---|---|
| 2025-06-01 | 100.00 | NULL |
| 2025-06-02 | 120.00 | NULL |
| 2025-06-03 | 90.00 | 103.33 |
| 2025-06-04 | 150.00 | 120.00 |

### Engine support for frame offsets

| Engine | `ROWS n PRECEDING` | `RANGE` with interval offsets |
|---|---|---|
| PostgreSQL 11+, MySQL 8, DuckDB, Oracle | Yes | Yes |
| SQL Server | Yes | No: `RANGE` accepts only `UNBOUNDED` and `CURRENT ROW` |
| BigQuery | Yes | Numeric offsets only: order by a number such as `UNIX_DATE(sale_date)` |
| Spark SQL | Yes | Numeric offsets; order by a numeric form of the date |

For Snowflake, check the current window frame documentation for which `RANGE` offsets your account supports; the `ROWS` form works everywhere.

### Pitfalls

- A `ROWS` frame over data with missing dates.
- Not partitioning, so one store's days are averaged into another's.
- Centred windows (`1 PRECEDING AND 1 FOLLOWING`) used in a pipeline that loads daily: yesterday's value changes when today arrives, which surprises consumers of an incremental table.

### In interviews

"7-day rolling average of daily active users" is a classic. Ask whether the data has one row per day; if not, explain the gap problem and fix it with a calendar join or a `RANGE` interval frame. Mention how you treat the first six days.

## Conditional window frames

Real metrics often need a **condition** inside the window: count only promotion days, sum only completed orders, or use a frame defined by values rather than rows. There are two tools: conditional expressions inside a window aggregate, and the choice of frame mode and exclusions.

### Conditions inside a window aggregate

Put a `CASE` (or a `FILTER` clause in PostgreSQL) inside the aggregate, exactly as in conditional aggregation, and the window does the rest:

```sql
SELECT store, sale_date, revenue, is_promo,
       SUM(CASE WHEN is_promo THEN revenue ELSE 0 END) OVER w   AS running_promo_revenue,
       COUNT(*) FILTER (WHERE is_promo) OVER w                  AS promo_days_so_far,
       SUM(revenue) FILTER (WHERE NOT is_promo) OVER (PARTITION BY store) AS store_non_promo_total
FROM daily_sales
WHERE store = 'A'
WINDOW w AS (PARTITION BY store ORDER BY sale_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY sale_date;
```

| store | sale_date | revenue | is_promo | running_promo_revenue | promo_days_so_far | store_non_promo_total |
|---|---|---|---|---|---|---|
| A | 2025-06-01 | 100.00 | f | 0 | 0 | 710.00 |
| A | 2025-06-02 | 120.00 | f | 0 | 0 | 710.00 |
| A | 2025-06-03 | 90.00 | f | 0 | 0 | 710.00 |
| A | 2025-06-04 | 150.00 | t | 150.00 | 1 | 710.00 |
| A | 2025-06-05 | 130.00 | f | 150.00 | 1 | 710.00 |
| A | 2025-06-06 | 170.00 | t | 320.00 | 2 | 710.00 |
| A | 2025-06-07 | 160.00 | f | 320.00 | 2 | 710.00 |
| A | 2025-06-08 | 110.00 | f | 320.00 | 2 | 710.00 |

The `FILTER` clause on window aggregates works in PostgreSQL, SQLite and DuckDB; the `CASE` form works everywhere.

A related pattern is the **running count of events**, which is the basis of grouping consecutive rows: a running `SUM(CASE WHEN <new group starts> THEN 1 ELSE 0 END)` assigns a group number that increases each time the condition is met. It underpins sessionisation and "gaps and islands" queries, covered in the advanced part of this course.

### Frames defined by values: RANGE, GROUPS and EXCLUDE

- `RANGE BETWEEN 50 PRECEDING AND 50 FOLLOWING` (ordered by a number) includes every row whose value is within 50 of the current row's: "how many days had revenue within 50 of today's?"
- `GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW` includes the current peer group and the previous one: "today's and the previous trading day's rows, however many rows each date has".
- `EXCLUDE CURRENT ROW` (also `EXCLUDE TIES`, `EXCLUDE GROUP`) removes the current row from its own frame: "average of the **other** days", useful for leave-one-out comparisons.

```sql
SELECT sale_date, revenue,
       COUNT(*) OVER (ORDER BY revenue RANGE BETWEEN 20 PRECEDING AND 20 FOLLOWING) - 1 AS similar_days,
       ROUND(AVG(revenue) OVER (ORDER BY sale_date
                                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                                EXCLUDE CURRENT ROW), 2) AS avg_of_other_days
FROM daily_sales
WHERE store = 'A'
ORDER BY sale_date;
```

| sale_date | revenue | similar_days | avg_of_other_days |
|---|---|---|---|
| 2025-06-01 | 100.00 | 3 | 132.86 |
| 2025-06-02 | 120.00 | 3 | 130.00 |
| 2025-06-03 | 90.00 | 2 | 134.29 |
| 2025-06-04 | 150.00 | 3 | 125.71 |
| 2025-06-05 | 130.00 | 3 | 128.57 |
| 2025-06-06 | 170.00 | 2 | 122.86 |
| 2025-06-07 | 160.00 | 2 | 124.29 |
| 2025-06-08 | 110.00 | 4 | 131.43 |

`GROUPS` and `EXCLUDE` are standard SQL but less widely implemented: PostgreSQL 11+, SQLite and DuckDB support them; SQL Server, Snowflake and BigQuery do not. In those engines, compute "the others" arithmetically: `(SUM(x) OVER () - x) / (COUNT(*) OVER () - 1)`.

### Pitfalls

- `FILTER` on a window aggregate in an engine that does not support it; fall back to `CASE`.
- `CASE ... ELSE 0` inside `AVG` or `MIN` (zeros change the result); use `ELSE NULL` there.
- Expecting a frame to reset when a condition changes. Frames cannot reset; build a group number with a running conditional sum and partition by it.

### In interviews

Conditional windows appear in questions like "running count of failed logins per user", "cumulative revenue from promotional orders" or "compare each value with the average of the others". Show the `CASE`-inside-window pattern and, if relevant, the leave-one-out arithmetic.

## Percent of total

**Percent of total** divides each row's value by the sum over a larger set: the whole result, a partition, or a running total. A window `SUM` provides the denominator without a join or a subquery.

```sql
SELECT store, sale_date, revenue,
       ROUND(100.0 * revenue / SUM(revenue) OVER (PARTITION BY store), 1)  AS pct_of_store,
       ROUND(100.0 * revenue / SUM(revenue) OVER (PARTITION BY sale_date), 1) AS pct_of_day,
       ROUND(100.0 * SUM(revenue) OVER (PARTITION BY store ORDER BY sale_date
                                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             / SUM(revenue) OVER (PARTITION BY store), 1)                 AS cumulative_pct_of_store
FROM daily_sales
WHERE sale_date >= DATE '2025-06-05'
ORDER BY store, sale_date;
```

| store | sale_date | revenue | pct_of_store | pct_of_day | cumulative_pct_of_store |
|---|---|---|---|---|---|
| A | 2025-06-05 | 130.00 | 22.8 | 59.1 | 22.8 |
| A | 2025-06-06 | 170.00 | 29.8 | 63.0 | 52.6 |
| A | 2025-06-07 | 160.00 | 28.1 | 57.1 | 80.7 |
| A | 2025-06-08 | 110.00 | 19.3 | 53.7 | 100.0 |
| B | 2025-06-05 | 90.00 | 22.2 | 40.9 | 22.2 |
| B | 2025-06-06 | 100.00 | 24.7 | 37.0 | 46.9 |
| B | 2025-06-07 | 120.00 | 29.6 | 42.9 | 76.5 |
| B | 2025-06-08 | 95.00 | 23.5 | 46.3 | 100.0 |

Note what the denominators are: the `WHERE` clause runs before the windows, so `pct_of_store` is each day's share of the store's revenue **from 5 June onwards**, not of all its revenue. Also, the displayed shares are rounded independently, so a column of rounded percentages does not always add up to exactly 100; if it must, round only the final presentation and adjust the largest remainder.

### Percent of total after GROUP BY

A window can run on top of an aggregate, because windows are computed after `GROUP BY`:

```sql
SELECT store,
       SUM(revenue) AS store_revenue,
       ROUND(100.0 * SUM(revenue) / SUM(SUM(revenue)) OVER (), 1) AS pct_of_company
FROM daily_sales
GROUP BY store
ORDER BY store;
```

| store | store_revenue | pct_of_company |
|---|---|---|
| A | 1030.00 | 62.6 |
| B | 615.00 | 37.4 |

Read `SUM(SUM(revenue)) OVER ()` from the inside out: the inner `SUM` is the `GROUP BY` aggregate (one store's total), and the outer `SUM ... OVER ()` adds those store totals across the grouped result (1645.00), so each store's share comes out in one pass.

### Pitfalls

- Integer division: `revenue / SUM(revenue) OVER ()` on integer columns returns 0. Multiply by `100.0` first.
- A zero denominator (an empty partition total); guard with `NULLIF`.
- Filters: a `WHERE` clause changes the denominator. "Share of June revenue" computed after `WHERE store = 'A'` is share of store A's revenue.
- Snowflake and Oracle offer `RATIO_TO_REPORT(x) OVER (PARTITION BY ...)` as a shortcut for `x / SUM(x) OVER (...)`.

### In interviews

"Each product's share of its category's revenue" and "Pareto: which products make up 80% of revenue?" are typical. Use `SUM() OVER (PARTITION BY ...)` for the share and a running `SUM` divided by the total for the cumulative share; mention integer division and rounding.

## Cumulative distribution: CUME_DIST and PERCENT_RANK

These functions describe where a row sits in the ordered distribution of its partition, as a fraction between 0 and 1.

| Function | Formula (n rows in partition) | Meaning |
|---|---|---|
| `CUME_DIST()` | (rows with value ≤ current) / n | Fraction of rows at or below this value; never 0 |
| `PERCENT_RANK()` | (`RANK()` − 1) / (n − 1) | Relative rank from 0 (first) to 1 (last); 0 for a single row |

```sql
SELECT sale_date, revenue,
       RANK()                       OVER w      AS rnk,
       ROUND(PERCENT_RANK() OVER w ::NUMERIC, 3) AS pct_rank,
       ROUND(CUME_DIST()    OVER w ::NUMERIC, 3) AS cume_dist
FROM daily_sales
WHERE store = 'B'
WINDOW w AS (ORDER BY revenue)
ORDER BY revenue;
```

| sale_date | revenue | rnk | pct_rank | cume_dist |
|---|---|---|---|---|
| 2025-06-02 | 60.00 | 1 | 0.000 | 0.143 |
| 2025-06-03 | 70.00 | 2 | 0.167 | 0.286 |
| 2025-06-01 | 80.00 | 3 | 0.333 | 0.429 |
| 2025-06-05 | 90.00 | 4 | 0.500 | 0.571 |
| 2025-06-08 | 95.00 | 5 | 0.667 | 0.714 |
| 2025-06-06 | 100.00 | 6 | 0.833 | 0.857 |
| 2025-06-07 | 120.00 | 7 | 1.000 | 1.000 |

### How to use them

- "Days in the top 25% of revenue": `WHERE cume_dist > 0.75` in an outer query. Unlike `NTILE`, tied values always get the same `CUME_DIST`, so they fall on the same side of a threshold.
- `CUME_DIST` treats ties as a group: if two rows tie, both get the fraction including both.
- They describe **row positions**, not interpolated values. "What revenue is the 75th percentile?" is a different question, answered by `PERCENTILE_CONT` below.

### Pitfalls

- Confusing `PERCENT_RANK` (starts at 0) with `CUME_DIST` (starts above 0).
- Forgetting that the result type is double precision; round for display.
- Computing them without `PARTITION BY` when the question is "within each category".

### In interviews

Expect "which customers are in the top 10% by spend?" Show `CUME_DIST` or `PERCENT_RANK` with a threshold and compare with `NTILE(10)`, noting how each handles ties.

## Median and percentiles with PERCENTILE_CONT

A **percentile** is the value below which a given fraction of the data falls; the median is the 50th percentile. SQL has two standard functions:

- `PERCENTILE_CONT(f)` returns a **continuous** (interpolated) value: with an even number of rows, the median is the average of the two middle values.
- `PERCENTILE_DISC(f)` returns an **actual** value from the data: the first value whose cumulative distribution reaches `f`.

In PostgreSQL they are **ordered-set aggregates**, written with `WITHIN GROUP (ORDER BY ...)` and used with `GROUP BY`:

```sql
SELECT store,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue) AS median_cont,
       PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY revenue) AS median_disc,
       PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY revenue) AS p90,
       ROUND(AVG(revenue), 2)                                AS mean
FROM daily_sales
GROUP BY store
ORDER BY store;
```

| store | median_cont | median_disc | p90 | mean |
|---|---|---|---|---|
| A | 125 | 120.00 | 163 | 128.75 |
| B | 90 | 90.00 | 108 | 87.86 |

Store A has eight days, so the continuous median interpolates between the 4th and 5th values (120 and 130) to give 125, while the discrete median returns the actual value 120. Store B has seven days, so both give the middle value, 90.

### Percentiles next to detail rows

In PostgreSQL, `PERCENTILE_CONT` **cannot** be used with `OVER`:

<!-- expect-error -->
```sql
-- ERROR: OVER is not supported for ordered-set aggregate percentile_cont
SELECT store, revenue,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue) OVER (PARTITION BY store)
FROM daily_sales;
```

Compute the percentile per group and join it back:

```sql
WITH medians AS (
  SELECT store, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue) AS median_revenue
  FROM daily_sales
  GROUP BY store
)
SELECT d.store, d.sale_date, d.revenue, m.median_revenue,
       d.revenue > m.median_revenue AS above_median
FROM daily_sales d
JOIN medians m ON m.store = d.store
WHERE d.sale_date >= DATE '2025-06-06'
ORDER BY d.store, d.sale_date;
```

| store | sale_date | revenue | median_revenue | above_median |
|---|---|---|---|---|
| A | 2025-06-06 | 170.00 | 125 | t |
| A | 2025-06-07 | 160.00 | 125 | t |
| A | 2025-06-08 | 110.00 | 125 | f |
| B | 2025-06-06 | 100.00 | 90 | t |
| B | 2025-06-07 | 120.00 | 90 | t |
| B | 2025-06-08 | 95.00 | 90 | t |

### Dialect differences

This is one of the least portable areas of SQL:

| Engine | Median per group | Percentile as a window over rows |
|---|---|---|
| PostgreSQL | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` with `GROUP BY` | Not supported; join back |
| SQL Server | Window only: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g)`, then `DISTINCT` | Yes (that is the only form) |
| Snowflake | `MEDIAN(x)` or `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` | `... OVER (PARTITION BY g)` |
| BigQuery | `APPROX_QUANTILES(x, 2)[OFFSET(1)]` for an approximate median | `PERCENTILE_CONT(x, 0.5) OVER (PARTITION BY g)` (only `PARTITION BY` allowed) |
| DuckDB | `MEDIAN(x)`, `QUANTILE_CONT(x, 0.5)` or the standard form | Yes |
| MySQL | No built-in; compute with `ROW_NUMBER` and `COUNT` | |

In DuckDB, `MEDIAN` is a plain aggregate:

<!-- engine: duckdb -->
```sql
SELECT store, MEDIAN(revenue) AS median_revenue, QUANTILE_CONT(revenue, 0.9) AS p90
FROM (VALUES ('A', 100), ('A', 120), ('A', 90), ('A', 150), ('A', 130), ('A', 170), ('A', 160), ('A', 110),
             ('B', 80), ('B', 60), ('B', 70), ('B', 90), ('B', 100), ('B', 120), ('B', 95)) AS t(store, revenue)
GROUP BY store
ORDER BY store;
```

| store | median_revenue | p90 |
|---|---|---|
| A | 125.0 | 163.0 |
| B | 90.0 | 108.0 |

The portable fallback, which works in any engine with window functions, picks the middle row or rows by position:

```sql
WITH ordered AS (
  SELECT store, revenue,
         ROW_NUMBER() OVER (PARTITION BY store ORDER BY revenue) AS rn,
         COUNT(*)     OVER (PARTITION BY store)                  AS n
  FROM daily_sales
)
SELECT store, AVG(revenue) AS median_revenue
FROM ordered
WHERE rn IN ((n + 1) / 2, (n + 2) / 2)      -- integer division picks 1 or 2 middle rows
GROUP BY store
ORDER BY store;
```

| store | median_revenue |
|---|---|
| A | 125.0000000000000000 |
| B | 90.0000000000000000 |

### Pitfalls

- Using `AVG` when the question says median. Skewed data (a few very large orders) pulls the mean far from the typical value.
- Exact percentiles on huge tables require sorting each group; warehouses offer approximate versions (`APPROX_PERCENTILE` in Snowflake and Databricks, `APPROX_QUANTILES` in BigQuery) that are much cheaper.
- `PERCENTILE_DISC` versus `PERCENTILE_CONT`: they differ for even counts and for values between data points.
- `NULL`s are ignored by percentile functions, like other aggregates.

### In interviews

"Find the median order value per country" is a common hard-ish question, partly because syntax differs so much. Write the standard `PERCENTILE_CONT ... WITHIN GROUP` form, mention your engine's variant (window-only in SQL Server and BigQuery, `MEDIAN` in Snowflake and DuckDB), and be ready to write the `ROW_NUMBER`/`COUNT` fallback for MySQL or for an interviewer who forbids built-ins.

## Practice questions

<details><summary>What is the default window frame when you write SUM(x) OVER (PARTITION BY a ORDER BY d), and when does it differ from ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW?</summary>

The default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. It differs when several rows share the same `d` within a partition: with `RANGE`, all those peer rows are included at once, so they all show the same running total; with `ROWS`, the total grows one row at a time in an arbitrary order among the ties.

</details>

<details><summary>Compute a 7-day moving average of daily revenue when some days have no sales rows.</summary>

Either build a complete calendar and left join the daily totals (filling missing days with 0 if a closed day should count as zero), then use `AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`; or, without a calendar, use a time-based frame: `AVG(revenue) OVER (ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)` in PostgreSQL. The two treat missing days differently (zero versus ignored), so confirm which the business wants.

</details>

<details><summary>Show each product's revenue and its share of its category's revenue, as a percentage with one decimal place.</summary>

`SELECT product_id, category, revenue, ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (PARTITION BY category), 0), 1) AS pct_of_category FROM product_revenue;` The `100.0` avoids integer division and `NULLIF` guards an all-zero category.

</details>

<details><summary>Which products together make up the first 80% of revenue (a Pareto analysis)?</summary>

Order products by revenue descending and compute the cumulative share: `SUM(revenue) OVER (ORDER BY revenue DESC, product_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / SUM(revenue) OVER ()`. Keep rows where the cumulative share **before** the current row is below 0.8 (that is, the running share minus this row's share < 0.8), so the product that crosses the threshold is included.

</details>

<details><summary>What is the difference between PERCENTILE_CONT(0.5) and PERCENTILE_DISC(0.5) for the values 10, 20, 30, 40?</summary>

`PERCENTILE_CONT` interpolates between the two middle values and returns 25. `PERCENTILE_DISC` returns an actual value, the first whose cumulative distribution reaches 0.5, which is 20.

</details>

<details><summary>How do you compute a median per group in MySQL, which has no PERCENTILE_CONT?</summary>

Number the rows within each group with `ROW_NUMBER() OVER (PARTITION BY g ORDER BY x)` and count them with `COUNT(*) OVER (PARTITION BY g)`, then average the rows whose number is `FLOOR((n + 1) / 2)` or `FLOOR((n + 2) / 2)`. For odd n both are the middle row; for even n they are the two middle rows. (In MySQL, `/` returns a decimal, so use `FLOOR` or `DIV`.)

</details>

## Key takeaways

- Aggregate windows depend on the frame; with `ORDER BY` and no frame, the default is `RANGE ... UNBOUNDED PRECEDING AND CURRENT ROW`, which includes tied peers.
- Write frames explicitly: `ROWS` for row counts, `RANGE` with an interval for time windows, and add a tiebreaker for `ROWS`.
- Moving averages over data with gaps need a calendar or a `RANGE` frame, and the first rows have incomplete windows.
- Conditions go inside the window aggregate (`CASE` everywhere, `FILTER` in PostgreSQL and DuckDB); `GROUPS` and `EXCLUDE` exist only in some engines.
- Percent of total is `x / SUM(x) OVER (...)` with `100.0` and `NULLIF`; windows can wrap aggregates after `GROUP BY`.
- `CUME_DIST` and `PERCENT_RANK` locate rows in a distribution; `PERCENTILE_CONT` interpolates values, and its syntax varies more by engine than almost any other function.

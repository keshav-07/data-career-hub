---
seoTitle: "SQL Window Functions: PARTITION BY and Frames"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "SQL Window Functions: PARTITION BY, ORDER BY and Frames"
description: "Learn how SQL window functions compute rankings, running totals and row-to-row comparisons without collapsing rows, including ties and frame behaviour."
inventoryId: "TECH-02"
technology: ["sql"]
topic: ["window-functions"]
difficulty: "Intermediate"
featured: true
prerequisites: ["articles:sql/joins"]
related: ["articles:pyspark/window-functions", "interview-questions:sql/window-functions-vs-group-by"]
next: "articles:pyspark/window-functions"
previous: "articles:sql/joins"
sources: [{"label": "PostgreSQL documentation: Window Functions tutorial", "url": "https://www.postgresql.org/docs/current/tutorial-window.html"}]
versionContext: "Standard SQL; tested with SQLite 3.45"
---

A window function computes a value for each row using a set of related rows, **without collapsing them into one row** the way `GROUP BY` does. That makes it the right tool for rankings, running totals, "previous value" comparisons and de-duplication.

## Anatomy

```sql
function(...) OVER (
  PARTITION BY ...   -- split rows into groups
  ORDER BY ...       -- order rows inside each group
  frame_clause       -- which rows around the current row to include
)
```

- `PARTITION BY` is optional. Without it the whole result set is one partition.
- `ORDER BY` is required for ranking and offset functions, and it changes the default frame for aggregates.

## Sample data

```sql
CREATE TABLE sales (rep TEXT, region TEXT, sale_date TEXT, amount INT);
INSERT INTO sales VALUES
 ('Asha','north','2026-01-01',100), ('Asha','north','2026-01-02',150),
 ('Ben','north','2026-01-01',150),  ('Ben','north','2026-01-03',90),
 ('Chen','south','2026-01-01',200), ('Chen','south','2026-01-02',50);
```

## Ranking: ROW_NUMBER, RANK, DENSE_RANK

```sql
SELECT rep, amount,
       ROW_NUMBER() OVER (ORDER BY amount DESC) AS row_number,
       RANK()       OVER (ORDER BY amount DESC) AS rank,
       DENSE_RANK() OVER (ORDER BY amount DESC) AS dense_rank
FROM sales;
```

Two sales of 150 tie. `ROW_NUMBER` still assigns unique numbers (the order between ties is arbitrary unless you add a tiebreaker), `RANK` gives both the same rank and **skips** the next number (1, 2, 2, 4), and `DENSE_RANK` gives both the same rank without gaps (1, 2, 2, 3).

## Top row per group

A window function cannot appear in `WHERE`, so compute it in a CTE or subquery and filter afterwards:

```sql
WITH ranked AS (
  SELECT rep, region, amount,
         ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC, rep) AS rn
  FROM sales
)
SELECT rep, region, amount FROM ranked WHERE rn = 1;
```

Adding `rep` to the `ORDER BY` makes the result deterministic when amounts tie. Some engines (Snowflake, BigQuery, Databricks) provide a `QUALIFY` clause that filters on window results directly; it is not standard SQL.

## Comparing to the previous row: LAG and LEAD

```sql
SELECT rep, sale_date, amount,
       amount - LAG(amount) OVER (PARTITION BY rep ORDER BY sale_date) AS change_vs_previous
FROM sales;
```

The first row in each partition has no previous row, so `LAG` returns `NULL` (you can supply a default as the third argument).

## Running totals and frames

```sql
SELECT rep, sale_date, amount,
       SUM(amount) OVER (
         PARTITION BY rep
         ORDER BY sale_date
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_total
FROM sales;
```

The **frame** says which rows around the current one feed the aggregate. Two points matter in practice:

- When you give an aggregate window an `ORDER BY` and no frame, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.
- `ROWS` counts physical rows; `RANGE` treats rows with equal `ORDER BY` values (peers) as one unit. With ties, a `RANGE` running total includes **all** tied rows at once, while `ROWS` adds them one at a time. Writing `ROWS` explicitly is usually what people mean by "running total".

<Callout tone="info" title="Window functions versus GROUP BY">

`GROUP BY` returns one row per group. A window function keeps every input row and adds a computed column. Use `GROUP BY` to summarise, and window functions when you need the detail row and the group-level context together.

</Callout>

## Common mistakes

1. Filtering on a window result in `WHERE` instead of a CTE or `QUALIFY`.
2. Forgetting a tiebreaker in `ORDER BY`, so `ROW_NUMBER` changes between runs.
3. Using `RANK` when you need exactly one row per group (use `ROW_NUMBER`).
4. Assuming the default frame is the whole partition when an `ORDER BY` is present.

## Interview relevance

"Top N per group", "remove duplicates keeping the latest row", "running total" and "compare to previous period" are all window-function problems. Be ready to explain `RANK` versus `DENSE_RANK` and `ROWS` versus `RANGE`.

## Key takeaway

Choose the partition (who is compared with whom), the order (in what sequence) and, for aggregates, the frame (how far back or forward to look). Then decide how ties should behave.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "SQL Aggregations: GROUP BY, HAVING and Conditional Aggregation"
seoTitle: "SQL GROUP BY, HAVING and Conditional Aggregation"
description: "How SUM, AVG, MIN, MAX and COUNT treat NULLs, how GROUP BY sets the grain, WHERE versus HAVING, and conditional aggregation for metrics built in one pass."
inventoryId: "TECH-04"
technology: ["sql"]
topic: ["aggregation", "group-by"]
difficulty: "Beginner"
learningObjectives:
  - "Use SUM, AVG, MIN and MAX and predict their results with NULLs and empty input"
  - "Choose between COUNT(*), COUNT(column) and COUNT(DISTINCT column)"
  - "Set the grain of a result with GROUP BY and avoid double counting after joins"
  - "Filter rows with WHERE and groups with HAVING"
  - "Build several metrics in one pass with conditional aggregation"
prerequisites: ["articles:sql/operators-nulls-case"]
related: ["articles:sql/window-functions", "interview-questions:sql/inner-vs-left-join", "interview-questions:sql/window-functions-vs-group-by"]
previous: "articles:sql/functions-strings-dates-types"
sources:
  - { label: "PostgreSQL documentation: Aggregate functions", url: "https://www.postgresql.org/docs/16/functions-aggregate.html" }
  - { label: "PostgreSQL documentation: The GROUP BY and HAVING clauses", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
  - { label: "PostgreSQL documentation: Aggregate expressions (FILTER)", url: "https://www.postgresql.org/docs/16/sql-expressions.html" }
  - { label: "MySQL documentation: MySQL handling of GROUP BY", url: "https://dev.mysql.com/doc/refman/8.4/en/group-by-handling.html" }
versionContext: "Examples run on PostgreSQL 16. Notes on MySQL, SQL Server, Snowflake and BigQuery behaviour were not executed."
---

Most tables a Data Engineer publishes are aggregates: revenue per day, orders per customer, active users per country. `GROUP BY` decides the **grain** (one output row per what?), and aggregate functions summarise the rows in each group. Getting the grain, the treatment of `NULL` and the filter placement right is what separates a correct report from one that is quietly off by a few per cent.

## Sample data

Customers, orders and order lines for the shop used across the course. One order has no amount yet, and order 101 has two lines, which matters when we join.

```sql
CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  country     TEXT NOT NULL
);

INSERT INTO customers VALUES
  (1, 'Asha Patel', 'IN'), (2, 'Ben Carter', 'GB'), (3, 'Chen Wei', 'SG'),
  (4, 'Diana Lopez', 'US'), (5, 'Ethan Brown', 'GB'), (6, 'Farah Khan', 'IN');

CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date  DATE NOT NULL,
  status      TEXT NOT NULL,
  channel     TEXT NOT NULL,
  amount      NUMERIC(10, 2),    -- NULL: not yet priced
  coupon_code TEXT               -- NULL: no coupon used
);

INSERT INTO orders VALUES
  (101, 1, '2025-06-01', 'delivered', 'web', 120.00, 'SUMMER10'),
  (102, 1, '2025-06-03', 'delivered', 'app',  35.50, NULL),
  (103, 2, '2025-06-03', 'cancelled', 'web',  80.00, NULL),
  (104, 3, '2025-06-04', 'shipped',   'app', 220.00, 'SUMMER10'),
  (105, 4, '2025-06-05', 'delivered', 'web', 220.00, NULL),
  (106, 4, '2025-06-07', 'placed',    'web',   NULL, NULL),
  (107, 5, '2025-06-07', 'delivered', 'app',  64.99, 'WELCOME'),
  (108, 2, '2025-06-08', 'delivered', 'web',  80.00, NULL),
  (109, 1, '2025-07-02', 'delivered', 'web',  45.00, NULL),
  (110, 5, '2025-07-03', 'returned',  'app',  64.99, NULL);

CREATE TABLE order_items (
  order_id   INT,
  product_id INT,
  quantity   INT,
  unit_price NUMERIC(10, 2)
);

INSERT INTO order_items VALUES
  (101, 10, 1, 100.00), (101, 11, 2, 10.00), (102, 12, 1, 35.50),
  (104, 10, 2, 110.00), (105, 13, 1, 220.00), (107, 11, 1, 64.99);
```

Farah (customer 6) has no orders.

## Aggregate functions: SUM, AVG, MIN and MAX

An aggregate function takes many rows and returns one value. Without `GROUP BY`, the whole table (after `WHERE`) is one group, so you get exactly one row.

```sql
SELECT COUNT(*)              AS orders,
       SUM(amount)           AS revenue,
       ROUND(AVG(amount), 2) AS avg_order_value,
       MIN(amount)           AS smallest,
       MAX(amount)           AS largest,
       MIN(order_date)       AS first_order,
       MAX(order_date)       AS last_order
FROM orders
WHERE status <> 'cancelled';
```

| orders | revenue | avg_order_value | smallest | largest | first_order | last_order |
|---|---|---|---|---|---|---|
| 9 | 850.48 | 106.31 | 35.50 | 220.00 | 2025-06-01 | 2025-07-03 |

### How NULL and empty input change the result

- `SUM`, `AVG`, `MIN` and `MAX` **ignore `NULL`s**. Order 106 has no amount, so the average above is 850.48 / 8 = 106.31, not 850.48 / 9.
- If you want missing values to count as zero, say so: `AVG(COALESCE(amount, 0))` divides by 9 and gives 94.50. Which is right depends on the question. For "average value of priced orders", ignoring `NULL` is correct.
- On **no rows at all**, `COUNT` returns 0 but `SUM`, `AVG`, `MIN` and `MAX` return `NULL`:

```sql
SELECT COUNT(*) AS orders, SUM(amount) AS revenue, MAX(amount) AS largest
FROM orders
WHERE order_date >= DATE '2026-01-01';
```

| orders | revenue | largest |
|---|---|---|
| 0 | NULL | NULL |

A dashboard that expects 0 revenue for an empty day needs `COALESCE(SUM(amount), 0)`.

### Other details worth knowing

- `MIN` and `MAX` work on any sortable type: numbers, dates and text (using the collation).
- `AVG` of an integer column returns a decimal in PostgreSQL, MySQL, Snowflake and BigQuery, but an **integer** in SQL Server, which truncates: the average of 1 and 2 is 1 there. Cast to a decimal first in T-SQL.
- Other common aggregates: `STRING_AGG` (`LISTAGG` in Snowflake, `GROUP_CONCAT` in MySQL), `ARRAY_AGG`, `STDDEV`, `BOOL_AND`/`BOOL_OR`, and `ANY_VALUE` (PostgreSQL 16+, Snowflake, BigQuery, MySQL) for "any value from the group, I know they are all the same".
- `SUM` of an integer column can overflow its type in some engines; PostgreSQL returns a `BIGINT` or `NUMERIC` to avoid it.

### Pitfalls

- Expecting `SUM` over no rows to be 0.
- Averaging an average. The mean of daily averages is not the overall average unless every day has the same number of rows. Recompute from `SUM` and `COUNT`.
- Summing a column that is already a ratio or a distinct count (users per day summed over a week counts returning users several times).

### In interviews

Expect to predict outputs with `NULL`s: "what does `AVG` return if two of five values are `NULL`?" (the mean of the other three). Mentioning the empty-input case and averaging averages shows care with metrics.

## COUNT, COUNT(column) and COUNT(DISTINCT)

`COUNT` has three forms, and choosing the wrong one is one of the most common metric bugs.

| Form | Counts | `NULL`s |
|---|---|---|
| `COUNT(*)` | Rows | Counted (a row is a row) |
| `COUNT(col)` | Rows where `col` is not `NULL` | Skipped |
| `COUNT(DISTINCT col)` | Distinct non-`NULL` values of `col` | Skipped |

```sql
SELECT COUNT(*)                    AS order_rows,
       COUNT(amount)               AS priced_orders,
       COUNT(coupon_code)          AS orders_with_coupon,
       COUNT(DISTINCT coupon_code) AS distinct_coupons,
       COUNT(DISTINCT customer_id) AS customers_who_ordered
FROM orders;
```

| order_rows | priced_orders | orders_with_coupon | distinct_coupons | customers_who_ordered |
|---|---|---|---|---|
| 10 | 9 | 3 | 2 | 5 |

### How it works

- `COUNT(1)` and `COUNT(*)` are the same thing; neither is faster in modern engines.
- `COUNT(DISTINCT a, b)` (several columns) is MySQL syntax. In PostgreSQL count distinct pairs with `COUNT(DISTINCT (a, b))` or by de-duplicating in a subquery first. Watch `NULL`s: a pair containing `NULL` may be skipped or counted depending on the engine and form.
- `COUNT(DISTINCT)` is expensive on large data because every distinct value must be tracked, and in distributed engines values must be shuffled across the cluster. Warehouses offer approximate versions based on HyperLogLog: `APPROX_COUNT_DISTINCT` in Snowflake, BigQuery, Databricks and SQL Server 2019+. Use them for dashboards where a small error is acceptable, never for billing.
- Distinct counts **do not add up**. Customers per day summed over a month overcounts anyone who ordered on two days. Compute monthly distinct customers from the detail rows.

### The LEFT JOIN counting trap

To count orders per customer, including customers with none, count a column from the **right** table:

```sql
SELECT c.full_name,
       COUNT(*)          AS wrong_count,
       COUNT(o.order_id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name
ORDER BY c.customer_id;
```

| full_name | wrong_count | order_count |
|---|---|---|
| Asha Patel | 3 | 3 |
| Ben Carter | 2 | 2 |
| Chen Wei | 1 | 1 |
| Diana Lopez | 2 | 2 |
| Ethan Brown | 2 | 2 |
| Farah Khan | 1 | 0 |

The left join keeps Farah as one row with `NULL` order columns. `COUNT(*)` counts that row; `COUNT(o.order_id)` skips the `NULL`.

### Pitfalls

- `COUNT(col)` when you meant rows, silently skipping `NULL`s.
- `COUNT(*)` after a left join, counting non-matches as 1.
- Adding up distinct counts across days, regions or partitions.
- `COUNT(DISTINCT)` on huge tables when an approximate answer would do.

### In interviews

"What is the difference between `COUNT(*)`, `COUNT(col)` and `COUNT(DISTINCT col)`?" is asked constantly. Answer with the `NULL` behaviour, then mention the left-join trap and that distinct counts are not additive. For scale questions, mention HyperLogLog-based approximate counts.

## GROUP BY fundamentals

`GROUP BY` puts rows with equal values in the listed columns into one group and returns **one row per group**. The listed columns define the grain of the result.

```sql
SELECT channel,
       status,
       COUNT(*)    AS orders,
       SUM(amount) AS revenue
FROM orders
GROUP BY channel, status
ORDER BY channel, status;
```

| channel | status | orders | revenue |
|---|---|---|---|
| app | delivered | 2 | 100.49 |
| app | returned | 1 | 64.99 |
| app | shipped | 1 | 220.00 |
| web | cancelled | 1 | 80.00 |
| web | delivered | 4 | 465.00 |
| web | placed | 1 | NULL |

### The rule for the SELECT list

Every column in `SELECT` must be either listed in `GROUP BY` or wrapped in an aggregate. Otherwise the engine cannot know which of the group's values to show.

<!-- expect-error -->
```sql
-- ERROR: column "orders.order_date" must appear in the GROUP BY clause
-- or be used in an aggregate function
SELECT channel, order_date, COUNT(*)
FROM orders
GROUP BY channel;
```

Engines vary at the edges:

- PostgreSQL allows a column that is **functionally dependent** on a grouped primary key. `GROUP BY c.customer_id` lets you select `c.full_name` without grouping by it, because the primary key determines the name.
- MySQL with `ONLY_FULL_GROUP_BY` (the default since 5.7) enforces the rule; with that mode switched off, it returns an arbitrary value from the group, which is a source of real bugs in older code.
- Snowflake, Databricks and DuckDB support `GROUP BY ALL`, which groups by every non-aggregated column in the select list.

### Grouping by expressions and NULL groups

You can group by any expression, such as a month or a band. All `NULL`s form **one group** (like `DISTINCT`):

```sql
SELECT DATE_TRUNC('month', order_date)::DATE AS order_month,
       coupon_code,
       COUNT(*) AS orders
FROM orders
GROUP BY DATE_TRUNC('month', order_date), coupon_code
ORDER BY order_month, coupon_code NULLS FIRST;
```

| order_month | coupon_code | orders |
|---|---|---|
| 2025-06-01 | NULL | 5 |
| 2025-06-01 | SUMMER10 | 2 |
| 2025-06-01 | WELCOME | 1 |
| 2025-07-01 | NULL | 2 |

PostgreSQL also lets you write `GROUP BY 1, 2` (positions) or use output aliases in `GROUP BY`. Both are convenient but non-standard and not supported everywhere (SQL Server accepts neither).

### Aggregating after a join: fan-out

Joining a table to a table with several matching rows multiplies rows. If you then sum a column from the "one" side, it is counted once per match:

```sql
SELECT SUM(o.amount)                    AS inflated_revenue,
       SUM(oi.quantity * oi.unit_price) AS item_revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.order_id = 101;
```

| inflated_revenue | item_revenue |
|---|---|
| 240.00 | 120.00 |

Order 101 is worth 120.00 but has two item rows, so its order-level amount is summed twice. Fix it by aggregating each table to the same grain **before** joining, or by summing only columns that belong to the many side. "Order totals doubled after we added a join" is one of the most frequent production bugs.

### Pitfalls

- Not knowing your grain. Write it down: "one row per customer per month".
- Selecting a column that is neither grouped nor aggregated (or relying on MySQL's permissive mode).
- Summing after a fan-out join.
- Assuming groups come back sorted. They do not; add `ORDER BY`.

### In interviews

Interviewers test grain by asking for "the number of orders and revenue per customer, including customers with no orders" or by giving a join that fans out. Say the grain out loud, use `LEFT JOIN` and `COUNT(o.order_id)`, and aggregate before joining when two child tables are involved.

## HAVING versus WHERE

`WHERE` filters **rows before** they are grouped. `HAVING` filters **groups after** aggregation, so it can use aggregate results.

```sql
SELECT customer_id,
       COUNT(*)    AS delivered_orders,
       SUM(amount) AS delivered_revenue
FROM orders
WHERE status = 'delivered'          -- row filter: runs first
GROUP BY customer_id
HAVING COUNT(*) >= 2                -- group filter: runs after grouping
ORDER BY delivered_revenue DESC;
```

| customer_id | delivered_orders | delivered_revenue |
|---|---|---|
| 1 | 3 | 200.50 |

Only Asha has two or more delivered orders. Ben has two orders but one was cancelled, and `WHERE` removed it before counting.

### How it works

| | `WHERE` | `HAVING` |
|---|---|---|
| Runs | Before `GROUP BY` | After `GROUP BY` |
| Filters | Individual rows | Groups |
| Can use aggregates | No | Yes |
| Can use `SELECT` aliases | No (standard) | No in PostgreSQL and SQL Server; MySQL, Snowflake and BigQuery allow it |

- Putting an aggregate in `WHERE` is an error: `WHERE COUNT(*) > 1` fails because counts do not exist yet.
- Putting a row condition in `HAVING` (`HAVING status = 'delivered'`, with `status` grouped) works but does the grouping first and filters afterwards. Optimisers often push it down, but `WHERE` states the intent and is never slower.
- `HAVING` without `GROUP BY` treats the whole result as one group: `SELECT COUNT(*) FROM orders HAVING COUNT(*) > 100` returns one row or none.
- A `WHERE` filter changes what the aggregates see. "Customers whose total spend exceeds 200, counting only delivered orders" and "customers whose total spend exceeds 200, then show only their delivered orders" are different queries.

### Finding duplicates

`HAVING COUNT(*) > 1` is the standard way to find duplicate keys, a common data-quality check:

```sql
SELECT customer_id, order_date, COUNT(*) AS orders_that_day
FROM orders
GROUP BY customer_id, order_date
HAVING COUNT(*) > 1;
```

This returns no rows here. Run the same check on a staging table's business key before every merge.

### In interviews

"Difference between `WHERE` and `HAVING`?" is a staple. Give the order of execution, say aggregates are only available in `HAVING`, and give the duplicate-detection example. Pointing out that row filters belong in `WHERE` for performance is a good extra.

## Conditional aggregation

Conditional aggregation puts a condition **inside** an aggregate, so one pass over the data produces several metrics, one per condition. It is the most useful aggregation pattern in reporting and the basis of manual pivots.

```sql
SELECT customer_id,
       COUNT(*)                                               AS all_orders,
       COUNT(CASE WHEN status = 'delivered' THEN 1 END)       AS delivered,
       SUM(CASE WHEN channel = 'app' THEN amount ELSE 0 END)  AS app_revenue,
       SUM(CASE WHEN channel = 'web' THEN amount ELSE 0 END)  AS web_revenue,
       ROUND(AVG(CASE WHEN coupon_code IS NOT NULL THEN 1.0 ELSE 0 END), 2) AS coupon_rate
FROM orders
GROUP BY customer_id
ORDER BY customer_id;
```

| customer_id | all_orders | delivered | app_revenue | web_revenue | coupon_rate |
|---|---|---|---|---|---|
| 1 | 3 | 3 | 35.50 | 165.00 | 0.33 |
| 2 | 2 | 1 | 0 | 160.00 | 0.00 |
| 3 | 1 | 0 | 220.00 | 0 | 1.00 |
| 4 | 2 | 1 | 0 | 220.00 | 0.00 |
| 5 | 2 | 1 | 129.98 | 0 | 0.50 |

### How it works

- `COUNT(CASE WHEN cond THEN 1 END)` counts rows meeting the condition: the `CASE` returns `NULL` otherwise, and `COUNT` skips `NULL`s. `SUM(CASE WHEN cond THEN 1 ELSE 0 END)` gives the same result.
- `ELSE 0` versus no `ELSE` matters for `AVG` and `MIN`/`MAX`. `AVG(CASE WHEN cond THEN amount END)` averages only matching rows; `AVG(CASE WHEN cond THEN amount ELSE 0 END)` averages across all rows with zeros mixed in. For `SUM`, the only difference is 0 versus `NULL` when nothing matches.
- `AVG` of a 1/0 flag is a rate (coupon usage above). Use `1.0` so integer division cannot creep in.
- Diana's web revenue is 220.00, not `NULL`, because `SUM` ignores the `NULL` amount of order 106.

### The FILTER clause and dialect shortcuts

The SQL standard has a cleaner syntax, `FILTER (WHERE ...)`, supported by PostgreSQL, DuckDB and SQLite:

```sql
SELECT COUNT(*) FILTER (WHERE status = 'delivered')         AS delivered,
       SUM(amount) FILTER (WHERE channel = 'app')           AS app_revenue,
       COUNT(DISTINCT customer_id) FILTER (WHERE coupon_code IS NOT NULL) AS coupon_customers
FROM orders;
```

| delivered | app_revenue | coupon_customers |
|---|---|---|
| 6 | 385.48 | 3 |

| Engine | Count rows matching a condition |
|---|---|
| PostgreSQL, DuckDB, SQLite | `COUNT(*) FILTER (WHERE cond)` |
| Snowflake, Databricks, DuckDB | `COUNT_IF(cond)` |
| BigQuery | `COUNTIF(cond)` |
| MySQL | `SUM(cond)` (a boolean is 1 or 0) |
| All engines | `COUNT(CASE WHEN cond THEN 1 END)` |

The `CASE` form works everywhere, so it is the safe choice in an interview unless the interviewer names an engine. Conditional aggregation by status or month is a manual **pivot**; the PIVOT and GROUPING SETS lesson later in the course compares it with the `PIVOT` operator.

### Pitfalls

- `COUNT(CASE WHEN cond THEN 1 ELSE 0 END)`: 0 is a value, not `NULL`, so `COUNT` counts every row, matching or not. Use `COUNT` with no `ELSE`, or `SUM` with `ELSE 0`.
- Forgetting that a condition on a nullable column is unknown for `NULL`s, which then fall into the `ELSE` branch.
- Integer division when turning conditional counts into rates.

### In interviews

Typical prompts: "for each customer, count delivered and cancelled orders in one query", "compute the cancellation rate per day", "turn statuses into columns". A strong answer uses one `GROUP BY` with several `CASE` expressions, explains `COUNT` versus `SUM` with `CASE`, and guards rates against integer division and division by zero.

## Practice questions

<details><summary>A column has values 10, NULL, 20, NULL, 30. What do COUNT(*), COUNT(col), SUM(col) and AVG(col) return?</summary>

`COUNT(*)` = 5, `COUNT(col)` = 3, `SUM(col)` = 60 and `AVG(col)` = 20, because `SUM` and `AVG` ignore `NULL`s (60 / 3). `AVG(COALESCE(col, 0))` would be 12.

</details>

<details><summary>List each customer with their number of orders, including customers with no orders. Why is COUNT(*) wrong here?</summary>

```
SELECT c.customer_id, COUNT(o.order_id) AS orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id;
```

A customer with no orders still produces one row from the left join, with `NULL`s on the order side. `COUNT(*)` counts that row as 1; `COUNT(o.order_id)` skips the `NULL` and returns 0.

</details>

<details><summary>Find email addresses that appear more than once in a users table.</summary>

```
SELECT LOWER(TRIM(email)) AS email, COUNT(*) AS n
FROM users
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;
```

Normalise before grouping so `A@x.com` and `a@x.com ` count as the same address. `HAVING` is required because the condition uses an aggregate.

</details>

<details><summary>Revenue per order doubled after you joined orders to order_items. What happened and how do you fix it?</summary>

The join fans out: an order with *n* items appears *n* times, so `SUM(orders.amount)` counts it *n* times. Either sum item-level values (`SUM(quantity * unit_price)`), or aggregate order_items to one row per order in a subquery or CTE before joining, so both sides have the same grain.

</details>

<details><summary>In one query, show per day the number of orders, cancelled orders and the cancellation rate as a percentage.</summary>

```
SELECT order_date,
       COUNT(*) AS orders,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
       ROUND(100.0 * COUNT(CASE WHEN status = 'cancelled' THEN 1 END) / COUNT(*), 1) AS cancel_pct
FROM orders
GROUP BY order_date;
```

`100.0` avoids integer division. `COUNT(*)` cannot be 0 inside a group, so no `NULLIF` is needed here, but it would be if the denominator were itself conditional.

</details>

<details><summary>Can you use a SELECT alias in HAVING? Can you use an aggregate in WHERE?</summary>

An aggregate in `WHERE` is never allowed, because `WHERE` runs before grouping. A `SELECT` alias in `HAVING` is not allowed in standard SQL, PostgreSQL or SQL Server (repeat the expression), but MySQL, Snowflake and BigQuery accept it. Repeating the expression is the portable choice.

</details>

## Key takeaways

- `GROUP BY` sets the grain: one output row per distinct combination of the grouped columns. State the grain before writing the query.
- `SUM`, `AVG`, `MIN`, `MAX` and `COUNT(col)` ignore `NULL`s; on empty input `COUNT` gives 0 and the others give `NULL`.
- `COUNT(*)` counts rows, `COUNT(col)` non-null values and `COUNT(DISTINCT col)` distinct non-null values; distinct counts do not add up across groups.
- `WHERE` filters rows before grouping and `HAVING` filters groups after; aggregates only work in `HAVING`.
- Joins that fan out inflate sums; aggregate to a common grain before joining.
- Conditional aggregation (`SUM(CASE ...)`, `COUNT(CASE ...)` or `FILTER`) builds many metrics in one pass and is the portable way to pivot.

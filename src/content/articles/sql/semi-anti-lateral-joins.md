---
title: "Semi-Joins, Anti-Joins and LATERAL Joins in SQL"
seoTitle: "SQL Semi-Joins, Anti-Joins and LATERAL Joins"
description: "Filter with EXISTS and NOT EXISTS instead of joins that duplicate rows, avoid the NOT IN NULL trap, and use LATERAL or CROSS APPLY for per-row top-N and unnesting."
technology: ["sql"]
topic: ["joins", "exists", "anti-join", "lateral"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Write semi-joins with EXISTS and IN and explain why a plain JOIN can duplicate rows"
  - "Write anti-joins with NOT EXISTS or LEFT JOIN ... IS NULL and avoid NOT IN with NULLs"
  - "Use LATERAL joins (CROSS APPLY in SQL Server) for per-row subqueries such as top N per group"
  - "Recognise the equivalent syntax in Spark SQL, DuckDB, Snowflake and BigQuery"
prerequisites: ["articles:sql/joins"]
related: ["articles:pyspark/joins-and-join-strategy", "articles:sql/set-operations"]
previous: "articles:sql/joins"
next: "articles:sql/ctes-subqueries-temp-tables"
sources:
  - { label: "PostgreSQL documentation: Subquery expressions (EXISTS, IN, NOT IN)", url: "https://www.postgresql.org/docs/16/functions-subquery.html" }
  - { label: "PostgreSQL documentation: LATERAL subqueries", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
  - { label: "SQL Server documentation: FROM clause plus JOIN, APPLY, PIVOT", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/from-transact-sql" }
  - { label: "MySQL documentation: Lateral derived tables", url: "https://dev.mysql.com/doc/refman/8.4/en/lateral-derived-tables.html" }
  - { label: "Apache Spark documentation: JOIN (semi and anti joins)", url: "https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-join.html" }
versionContext: "Examples run on PostgreSQL 16, and the SEMI/ANTI JOIN example on DuckDB 1.5. SQL Server APPLY, Snowflake FLATTEN and BigQuery UNNEST examples were not executed."
---

Many questions are not "combine these tables" but "keep the rows of this table that **have** (or **do not have**) a match in that one": customers who ordered, products never sold, users who did not convert. These are **semi-joins** and **anti-joins**. Writing them as ordinary joins either duplicates rows or, with `NOT IN`, can return nothing at all. The third pattern here, the **LATERAL** join, runs a subquery once per row, which is the cleanest way to get "the latest three orders for each customer" or to unpack an array column.

## Sample data

```sql
CREATE TABLE customers (customer_id INT PRIMARY KEY, full_name TEXT NOT NULL, country TEXT NOT NULL);
INSERT INTO customers VALUES
  (1, 'Asha Patel', 'IN'), (2, 'Ben Carter', 'GB'), (3, 'Chen Wei', 'SG'),
  (4, 'Diana Lopez', 'US'), (5, 'Ethan Brown', 'GB'), (6, 'Farah Khan', 'IN');

CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT,                    -- NULL for guest checkout
  order_date  DATE NOT NULL,
  status      TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL
);
INSERT INTO orders VALUES
  (101, 1,    '2025-06-01', 'delivered', 120.00),
  (102, 1,    '2025-06-03', 'delivered',  35.50),
  (103, 2,    '2025-06-03', 'cancelled',  80.00),
  (104, 3,    '2025-06-04', 'shipped',   220.00),
  (105, 4,    '2025-06-05', 'delivered', 220.00),
  (106, 4,    '2025-06-07', 'placed',     15.00),
  (107, 5,    '2025-06-07', 'cancelled',  64.99),
  (108, 2,    '2025-06-08', 'delivered',  80.00),
  (109, NULL, '2025-06-09', 'delivered',  15.00),
  (110, 1,    '2025-06-10', 'shipped',    45.00);

CREATE TABLE products (product_id INT PRIMARY KEY, product_name TEXT, category TEXT, tags TEXT[]);
INSERT INTO products VALUES
  (10, 'Keyboard', 'electronics', ARRAY['wired', 'bestseller']),
  (11, 'Mouse',    'electronics', ARRAY['wireless']),
  (12, 'Notebook', 'stationery',  ARRAY[]::TEXT[]),
  (13, 'Desk',     'furniture',   ARRAY['bulky', 'bestseller']),
  (14, 'Lamp',     'furniture',   NULL);

CREATE TABLE order_items (order_id INT, product_id INT, quantity INT);
INSERT INTO order_items VALUES
  (101, 10, 1), (101, 11, 2), (102, 12, 1), (103, 12, 4),
  (104, 13, 1), (105, 11, 1), (105, 10, 1), (108, 12, 2), (110, 11, 1);
```

Farah has never ordered, Ethan has only a cancelled order, order 109 is a guest checkout, and the lamp has never been sold.

## Semi-join with EXISTS

A **semi-join** returns rows from the left table that have **at least one** match in the right table. Each left row appears **at most once**, however many matches it has, and no columns from the right table are returned. SQL has no `SEMI JOIN` keyword in the standard; you write it with `EXISTS` or `IN`.

```sql
-- Customers who bought at least one electronics product
SELECT c.customer_id, c.full_name
FROM customers c
WHERE EXISTS (
  SELECT 1
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.order_id
  JOIN products p     ON p.product_id = oi.product_id
  WHERE o.customer_id = c.customer_id
    AND p.category = 'electronics'
)
ORDER BY c.customer_id;
```

| customer_id | full_name |
|---|---|
| 1 | Asha Patel |
| 4 | Diana Lopez |

### Why not a plain JOIN?

A join returns one row per match. Asha bought electronics in two orders (three item rows), so a join repeats her:

```sql
SELECT c.customer_id, c.full_name
FROM customers c
JOIN orders o       ON o.customer_id = c.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p     ON p.product_id = oi.product_id
WHERE p.category = 'electronics'
ORDER BY c.customer_id;
```

| customer_id | full_name |
|---|---|
| 1 | Asha Patel |
| 1 | Asha Patel |
| 1 | Asha Patel |
| 4 | Diana Lopez |
| 4 | Diana Lopez |

Adding `DISTINCT` hides the duplicates but makes the engine produce and then remove them, and it also removes legitimate duplicate customer rows if you select fewer columns. `EXISTS` states the intent directly and lets the engine stop at the first match.

### How it works

- `EXISTS (subquery)` is true when the subquery returns at least one row. What it selects does not matter; `SELECT 1` is the convention.
- The subquery is **correlated**: `o.customer_id = c.customer_id` refers to the outer row. Logically it runs once per customer; in practice optimisers turn it into a semi-join (hash or merge) and never loop row by row.
- `IN` is the other way to write a semi-join, and is equivalent for non-`NULL` keys:

```sql
SELECT customer_id, full_name
FROM customers
WHERE customer_id IN (SELECT customer_id FROM orders WHERE status = 'delivered')
ORDER BY customer_id;
```

| customer_id | full_name |
|---|---|
| 1 | Asha Patel |
| 2 | Ben Carter |
| 4 | Diana Lopez |

`IN` reads well for a single key column. `EXISTS` handles multi-column conditions and extra filters naturally, and has no `NULL` surprises, so it is the safer default.

### Dialects with explicit syntax

Spark SQL and DuckDB have explicit keywords: `LEFT SEMI JOIN` in Spark, `SEMI JOIN` in DuckDB. PySpark exposes the same as `how="left_semi"`.

<!-- engine: duckdb -->
```sql
CREATE TABLE c (customer_id INT, full_name TEXT);
CREATE TABLE o (order_id INT, customer_id INT);
INSERT INTO c VALUES (1, 'Asha'), (2, 'Ben'), (6, 'Farah');
INSERT INTO o VALUES (101, 1), (102, 1), (103, 2);

SELECT * FROM c SEMI JOIN o USING (customer_id) ORDER BY customer_id;
```

| customer_id | full_name |
|---|---|
| 1 | Asha |
| 2 | Ben |

### Pitfalls

- Using a join plus `DISTINCT` where a semi-join was meant, which costs more and can collapse rows you wanted.
- Forgetting the correlation condition (`WHERE o.customer_id = c.customer_id`). Without it, `EXISTS` is true for every row as soon as the subquery returns anything.
- Putting filters that belong to the matching rule outside the subquery. "Customers with a delivered order" needs `status = 'delivered'` **inside** `EXISTS`.

### In interviews

"Customers who placed at least one order" is a standard prompt. Write `EXISTS`, explain that a join would duplicate customers with several orders, and mention that `IN` is equivalent for non-null keys. In Spark interviews, name `left_semi`.

## Anti-join with NOT EXISTS or LEFT JOIN ... IS NULL

An **anti-join** returns rows from the left table that have **no** match in the right table: customers who never ordered, products never sold, rows in staging that are not yet in the target. There are three common ways to write it, and one of them is a trap.

### NOT EXISTS (recommended)

```sql
-- Customers with no delivered or shipped order
SELECT c.customer_id, c.full_name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.customer_id
    AND o.status IN ('delivered', 'shipped')
)
ORDER BY c.customer_id;
```

| customer_id | full_name |
|---|---|
| 5 | Ethan Brown |
| 6 | Farah Khan |

Ethan has an order, but it was cancelled; Farah has none. Because the status rule sits inside the subquery, both are found.

### LEFT JOIN ... WHERE right.key IS NULL

The same anti-join with a left join keeps every customer, then keeps only those where nothing matched:

```sql
SELECT p.product_id, p.product_name
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.product_id
WHERE oi.product_id IS NULL;
```

| product_id | product_name |
|---|---|
| 14 | Lamp |

Two rules make this pattern correct:

1. Test a column that **cannot be `NULL` in a matched row**, normally the join key or a primary key of the right table. Testing a nullable column (for example `oi.quantity IS NULL`) also returns matched rows whose value happens to be `NULL`.
2. Put any extra conditions on the right table in `ON`, not `WHERE`. `LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'delivered' WHERE o.order_id IS NULL` finds customers with no delivered order; moving the status test to `WHERE` returns nothing useful.

### NOT IN: the NULL trap

`NOT IN` looks like the natural anti-join, and works until the subquery returns a `NULL`. Order 109 has a `NULL` customer_id:

```sql
SELECT COUNT(*) AS customers_without_orders
FROM customers
WHERE customer_id NOT IN (SELECT customer_id FROM orders);
```

| customers_without_orders |
|---|
| 0 |

Farah has no orders, yet the answer is 0. `customer_id NOT IN (1, 2, ..., NULL)` expands to `customer_id <> 1 AND ... AND customer_id <> NULL`, and the last comparison is unknown for every row. `NOT EXISTS` gives the right answer:

```sql
SELECT COUNT(*) AS customers_without_orders
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
```

| customers_without_orders |
|---|
| 1 |

If you must use `NOT IN`, filter the subquery: `WHERE customer_id IS NOT NULL`. Even then, a `NULL` on the **left** side (a customer row with a `NULL` id) is never returned by `NOT IN`, whereas `NOT EXISTS` returns it.

### Comparing the options

| Pattern | `NULL` in right key | Duplicates in right table | Typical plan |
|---|---|---|---|
| `NOT EXISTS` | Safe | No effect | Anti-join |
| `LEFT JOIN ... IS NULL` | Safe | No effect on the result (matched rows are filtered out) | Anti-join or outer join plus filter |
| `NOT IN (subquery)` | Returns nothing | No effect | Often a slower null-aware anti-join |
| `EXCEPT` | Treats `NULL`s as equal | Removes duplicates on the left too | Set difference; only returns the compared columns |

Modern optimisers usually produce the same anti-join plan for `NOT EXISTS` and `LEFT JOIN ... IS NULL`, so choose by readability. `NOT EXISTS` is the safest default in interviews and code review. Spark SQL spells it `LEFT ANTI JOIN` (`how="left_anti"` in PySpark) and DuckDB `ANTI JOIN`.

### Pipeline uses

- **Incremental loads**: insert staging rows whose key is not in the target (`INSERT ... SELECT ... WHERE NOT EXISTS (...)`), the simplest idempotent append.
- **Referential checks**: fact rows whose dimension key does not exist (orphan orders), reported before publishing.
- **Churn and inactivity**: users with no event in the last 30 days.

### Pitfalls

- `NOT IN` with a nullable subquery column.
- Testing a nullable right-hand column in the `IS NULL` check.
- Filtering the right table in `WHERE` instead of `ON` with the left-join form.
- Anti-joining against a table that is still loading, so rows look missing when they are only late. In pipelines, make the comparison against a consistent snapshot or with a time boundary.

### In interviews

"Find customers who never ordered" is one of the most common SQL questions. Give `NOT EXISTS`, offer `LEFT JOIN ... IS NULL` as an alternative, and explain the `NOT IN` `NULL` trap unprompted. That last point is often what the question is really testing.

## LATERAL joins and CROSS APPLY

A **LATERAL** subquery in `FROM` can refer to columns of tables listed **before** it, so it is evaluated once per outer row, like a correlated subquery that can return **several rows and several columns**. SQL Server and Oracle call the same idea `CROSS APPLY` and `OUTER APPLY`.

### Top N per row: latest two orders per customer

```sql
SELECT c.full_name, recent.order_id, recent.order_date, recent.amount
FROM customers c
CROSS JOIN LATERAL (
  SELECT o.order_id, o.order_date, o.amount
  FROM orders o
  WHERE o.customer_id = c.customer_id
  ORDER BY o.order_date DESC, o.order_id DESC
  LIMIT 2
) AS recent
ORDER BY c.customer_id, recent.order_date DESC;
```

| full_name | order_id | order_date | amount |
|---|---|---|---|
| Asha Patel | 110 | 2025-06-10 | 45.00 |
| Asha Patel | 102 | 2025-06-03 | 35.50 |
| Ben Carter | 108 | 2025-06-08 | 80.00 |
| Ben Carter | 103 | 2025-06-03 | 80.00 |
| Chen Wei | 104 | 2025-06-04 | 220.00 |
| Diana Lopez | 106 | 2025-06-07 | 15.00 |
| Diana Lopez | 105 | 2025-06-05 | 220.00 |
| Ethan Brown | 107 | 2025-06-07 | 64.99 |

`CROSS JOIN LATERAL` behaves like an inner join: Farah, whose subquery returns no rows, is dropped. To keep her, use `LEFT JOIN LATERAL ... ON true`:

```sql
SELECT c.full_name, last_order.order_date AS last_order_date, last_order.amount
FROM customers c
LEFT JOIN LATERAL (
  SELECT o.order_date, o.amount
  FROM orders o
  WHERE o.customer_id = c.customer_id
  ORDER BY o.order_date DESC
  LIMIT 1
) AS last_order ON true
WHERE c.country IN ('IN', 'GB')
ORDER BY c.customer_id;
```

| full_name | last_order_date | amount |
|---|---|---|
| Asha Patel | 2025-06-10 | 45.00 |
| Ben Carter | 2025-06-08 | 80.00 |
| Ethan Brown | 2025-06-07 | 64.99 |
| Farah Khan | NULL | NULL |

The same per-group top N can be written with `ROW_NUMBER()`, covered in the [window functions lesson](/sql/window-functions/). The lateral form shines when there is an index on `(customer_id, order_date)` and you want only a few rows for each of a few outer rows: the engine can read just those rows instead of ranking the whole orders table. For "top N across every group in a big table", the window function version is usually as fast or faster, especially in columnar warehouses.

### Unnesting arrays

Lateral joins are also how you turn an array column into rows. In PostgreSQL, a set-returning function in `FROM` is implicitly lateral:

```sql
SELECT p.product_name, t.tag
FROM products p
CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
ORDER BY p.product_id, t.tag;
```

| product_name | tag |
|---|---|
| Keyboard | bestseller |
| Keyboard | wired |
| Mouse | wireless |
| Desk | bestseller |
| Desk | bulky |

Products with an empty or `NULL` array (Notebook, Lamp) disappear; `LEFT JOIN LATERAL unnest(p.tags) AS t(tag) ON true` keeps them with a `NULL` tag. This is the same "explode versus explode_outer" choice you make in Spark.

### Dialect translation

| Engine | Per-row subquery | Keep rows with no result | Unnest an array |
|---|---|---|---|
| PostgreSQL | `CROSS JOIN LATERAL (...)` | `LEFT JOIN LATERAL (...) ON true` | `CROSS JOIN LATERAL unnest(arr)` |
| MySQL 8.0.14+ | `JOIN LATERAL (...) ON true` | `LEFT JOIN LATERAL (...) ON true` | `JSON_TABLE` for JSON arrays |
| SQL Server, Oracle 12c+ | `CROSS APPLY (...)` | `OUTER APPLY (...)` | `CROSS APPLY OPENJSON(...)` (SQL Server) |
| Snowflake | `, LATERAL (...)` | | `, LATERAL FLATTEN(input => arr)` (`OUTER => TRUE` keeps empties) |
| BigQuery | Correlated subqueries; window functions for top N | | `CROSS JOIN UNNEST(arr)` / `LEFT JOIN UNNEST(arr)` |
| Spark SQL, Databricks | `LATERAL (...)` subqueries (recent versions) | | `LATERAL VIEW explode(arr)` / `explode_outer` |

The SQL Server version of the top-two query:

<!-- noexec -->
```sql
-- SQL Server (T-SQL)
SELECT c.full_name, recent.order_id, recent.order_date
FROM customers AS c
CROSS APPLY (
  SELECT TOP (2) o.order_id, o.order_date
  FROM orders AS o
  WHERE o.customer_id = c.customer_id
  ORDER BY o.order_date DESC, o.order_id DESC
) AS recent;
```

And Snowflake flattening an array column:

<!-- noexec -->
```sql
-- Snowflake
SELECT p.product_name, f.value::STRING AS tag
FROM products p,
     LATERAL FLATTEN(input => p.tags) f;
```

### Pitfalls

- Using `CROSS JOIN LATERAL` (or `CROSS APPLY`) when rows with no match must be kept; use the `LEFT`/`OUTER` form.
- A missing `ORDER BY` inside a `LIMIT 1` lateral subquery: "latest order" becomes "any order".
- Lateral subqueries over large outer tables without a supporting index, which can turn into a slow nested loop.
- Unnesting two arrays in one query with two lateral joins, which produces their cartesian product rather than pairing elements by position. Use `unnest(a, b)` with several arguments in PostgreSQL, or `WITH ORDINALITY`, to zip them.

### In interviews

LATERAL is asked less often than semi- and anti-joins, but it impresses when used well. Typical prompts: "latest order per customer", "top 3 products per category" (show both `ROW_NUMBER()` and `LATERAL`/`CROSS APPLY` and say when each wins), and "explode an array column into rows". Know the SQL Server names `CROSS APPLY` and `OUTER APPLY`.

## Practice questions

<details><summary>Find products that have never been ordered. Give two correct queries and one incorrect one, and explain the difference.</summary>

Correct: `SELECT p.* FROM products p WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.product_id);` and `SELECT p.* FROM products p LEFT JOIN order_items oi ON oi.product_id = p.product_id WHERE oi.product_id IS NULL;`. Incorrect when `order_items.product_id` can be `NULL`: `WHERE p.product_id NOT IN (SELECT product_id FROM order_items)`, which returns no rows as soon as one `NULL` appears in the subquery.

</details>

<details><summary>Why can SELECT c.* FROM customers c JOIN orders o ON ... return more rows than the customers table, and how do you list each customer with at least one order exactly once?</summary>

The join returns one row per matching order, so a customer with three orders appears three times. Use a semi-join: `SELECT c.* FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);`. `IN` also works for a non-null key. `DISTINCT` after a join gives the same rows but does extra work.

</details>

<details><summary>Find customers who have orders, but none of them delivered.</summary>

```
SELECT c.customer_id
FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id)
  AND NOT EXISTS (SELECT 1 FROM orders o
                  WHERE o.customer_id = c.customer_id AND o.status = 'delivered');
```

A semi-join for "has any order" combined with an anti-join for "has no delivered order". In the sample data this returns Chen (shipped only) and Ethan (cancelled only).

</details>

<details><summary>Load only new rows from staging into a target table so that the job can be rerun safely.</summary>

```
INSERT INTO target (id, ...)
SELECT s.id, ...
FROM staging s
WHERE NOT EXISTS (SELECT 1 FROM target t WHERE t.id = s.id);
```

The anti-join skips rows already loaded, so a rerun inserts nothing twice. It does not apply updates to existing rows; for that use `MERGE` or `INSERT ... ON CONFLICT`. Under concurrent writers, add a unique constraint on the key as well.

</details>

<details><summary>What does CROSS APPLY do in SQL Server, and what is the PostgreSQL equivalent?</summary>

`CROSS APPLY` evaluates a table expression once per row of the left input, letting it reference that row's columns, and returns the combined rows; rows for which the expression returns nothing are dropped. `OUTER APPLY` keeps them with `NULL`s. PostgreSQL's equivalents are `CROSS JOIN LATERAL (...)` and `LEFT JOIN LATERAL (...) ON true`.

</details>

<details><summary>When would you choose LATERAL with LIMIT over ROW_NUMBER() for top N per group?</summary>

When you need a few rows for a modest number of outer rows and an index supports the inner query (for example on `(customer_id, order_date)`): each lateral lookup reads only N rows from the index. `ROW_NUMBER()` ranks every row in the table first, which is usually better when you need the top N for every group in a large table, especially in columnar warehouses without row-level indexes.

</details>

## Key takeaways

- A semi-join keeps left rows that have a match, once each: write it with `EXISTS` (or `IN` for a non-null key), not a join plus `DISTINCT`.
- An anti-join keeps left rows with no match: use `NOT EXISTS` or `LEFT JOIN ... WHERE right.key IS NULL`.
- `NOT IN` returns nothing if the subquery yields a `NULL`; avoid it for anti-joins or filter the `NULL`s.
- Conditions that define the match belong inside the `EXISTS` subquery or the `ON` clause, not the outer `WHERE`.
- `LATERAL` (or `CROSS APPLY`/`OUTER APPLY`) runs a subquery per row: ideal for top N per row with an index and for unnesting arrays.
- Spark and DuckDB have explicit semi and anti join keywords; the logic is the same.

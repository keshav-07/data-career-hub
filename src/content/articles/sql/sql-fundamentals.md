---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "SQL Fundamentals: SELECT, WHERE, DISTINCT, ORDER BY and LIMIT"
seoTitle: "SQL Fundamentals: SELECT, WHERE, ORDER BY, LIMIT"
description: "Learn the core of every SQL query: SELECT and WHERE, aliases, DISTINCT, multi-column ORDER BY and LIMIT, TOP or FETCH FIRST across PostgreSQL, MySQL and SQL Server."
inventoryId: "PILLAR-02"
technology: ["sql"]
topic: ["fundamentals", "select", "filtering", "sorting"]
difficulty: "Beginner"
pillar: true
featured: false
learningObjectives:
  - "Write SELECT queries that return exactly the columns and rows you need"
  - "Explain the logical order in which a query is evaluated and why it decides where aliases work"
  - "Remove exact duplicate rows with DISTINCT and know when DISTINCT hides a bug"
  - "Sort on several columns with explicit NULL placement and deterministic tiebreakers"
  - "Limit and page results with LIMIT, TOP or FETCH FIRST in the main SQL dialects"
related: ["articles:sql/joins", "articles:sql/window-functions", "articles:sql/query-optimization-fundamentals", "cheat-sheets:sql-data-engineering"]
next: "articles:sql/operators-nulls-case"
sources:
  - { label: "PostgreSQL documentation: SELECT", url: "https://www.postgresql.org/docs/16/sql-select.html" }
  - { label: "PostgreSQL documentation: LIMIT and OFFSET", url: "https://www.postgresql.org/docs/16/queries-limit.html" }
  - { label: "SQL Server documentation: TOP (Transact-SQL)", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/top-transact-sql" }
  - { label: "SQL Server documentation: ORDER BY clause with OFFSET and FETCH", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql" }
  - { label: "Snowflake documentation: ORDER BY", url: "https://docs.snowflake.com/en/sql-reference/constructs/order-by" }
  - { label: "BigQuery documentation: Query syntax", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax" }
versionContext: "Examples run on PostgreSQL 16. SQL Server, MySQL, Snowflake and BigQuery variants are shown for comparison and were not executed."
---

Every SQL query you will write as a Data Engineer, from a quick check on a staging table to a 300-line transformation model, is built on the same five clauses: `SELECT`, `FROM`, `WHERE`, `ORDER BY` and a row limit. This first lesson of the SQL course covers them properly, including the details interviewers probe: the order in which a query is evaluated, how `DISTINCT` treats `NULL`, where `NULL`s sort, and why `LIMIT` without `ORDER BY` returns arbitrary rows.

## Sample data

All examples use a small online shop: customers and their orders. Run this once in PostgreSQL (or any SQL sandbox) to follow along.

```sql
CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  email       TEXT,
  country     TEXT NOT NULL,
  city        TEXT,
  signup_date DATE NOT NULL
);

INSERT INTO customers VALUES
  (1, 'Asha Patel',  'asha@example.com',  'IN', 'Mumbai',    '2025-01-14'),
  (2, 'Ben Carter',  'ben@example.com',   'GB', 'London',    '2025-02-03'),
  (3, 'Chen Wei',    NULL,                'SG', 'Singapore', '2025-02-20'),
  (4, 'Diana Lopez', 'diana@example.com', 'US', 'Austin',    '2025-03-11'),
  (5, 'Ethan Brown', 'ethan@example.com', 'GB', 'Leeds',     '2025-03-11'),
  (6, 'Farah Khan',  'farah@example.com', 'IN', NULL,        '2025-04-02');

CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date  DATE NOT NULL,
  status      TEXT NOT NULL,           -- placed, shipped, delivered, cancelled
  channel     TEXT NOT NULL,           -- web or app
  amount      NUMERIC(10, 2) NOT NULL
);

INSERT INTO orders VALUES
  (101, 1, '2025-06-01', 'delivered', 'web', 120.00),
  (102, 1, '2025-06-03', 'delivered', 'app',  35.50),
  (103, 2, '2025-06-03', 'cancelled', 'web',  80.00),
  (104, 3, '2025-06-04', 'shipped',   'app', 220.00),
  (105, 4, '2025-06-05', 'delivered', 'web', 220.00),
  (106, 4, '2025-06-07', 'placed',    'web',  15.00),
  (107, 5, '2025-06-07', 'delivered', 'app',  64.99),
  (108, 2, '2025-06-08', 'delivered', 'web',  80.00);
```

Chen has no email address and Farah has no city. Those `NULL`s matter later.

## SELECT and WHERE: choosing columns and filtering rows

`SELECT` chooses the **columns** you want and `WHERE` chooses the **rows**. `FROM` names the table they come from. Together they answer most "show me" questions about a table.

```sql
SELECT order_id, customer_id, amount
FROM orders
WHERE status = 'delivered';
```

| order_id | customer_id | amount |
|---|---|---|
| 101 | 1 | 120.00 |
| 102 | 1 | 35.50 |
| 105 | 4 | 220.00 |
| 107 | 5 | 64.99 |
| 108 | 2 | 80.00 |

### How it works

- The `WHERE` condition is evaluated once per row. Rows for which it is **true** are kept. Rows for which it is false **or unknown** (because a `NULL` was involved) are dropped.
- Combine conditions with `AND`, `OR` and `NOT`. `AND` binds more tightly than `OR`, so use brackets whenever you mix them.
- String literals use **single quotes**: `'delivered'`. Double quotes are for identifiers (column or table names) in standard SQL and PostgreSQL. MySQL accepts double-quoted strings by default, which is a common source of confusion when moving between engines.
- In PostgreSQL, Snowflake and BigQuery, `=` on text is case-sensitive: `'Delivered'` does not match `'delivered'`. MySQL and SQL Server usually compare case-insensitively because of their default collations.
- Date literals are best written in ISO form, `DATE '2025-06-05'`, so the engine never has to guess the format.

```sql
SELECT order_id, order_date, channel, amount
FROM orders
WHERE order_date >= DATE '2025-06-05'
  AND (channel = 'app' OR amount >= 200);
```

| order_id | order_date | channel | amount |
|---|---|---|---|
| 105 | 2025-06-05 | web | 220.00 |
| 107 | 2025-06-07 | app | 64.99 |

Without the brackets, the condition would read `(order_date >= ... AND channel = 'app') OR amount >= 200`, which also returns order 104 from 4 June.

### The logical order of a query

You write a query in one order but the engine evaluates it, logically, in another. Knowing this order explains most beginner errors.

| Step | Clause | What happens |
|---|---|---|
| 1 | `FROM` / `JOIN` | Build the input rows |
| 2 | `WHERE` | Keep rows that pass the filter |
| 3 | `GROUP BY` | Collapse rows into groups |
| 4 | `HAVING` | Keep groups that pass the filter |
| 5 | `SELECT` | Compute output columns and aliases (window functions run here) |
| 6 | `DISTINCT` | Remove duplicate output rows |
| 7 | `ORDER BY` | Sort the result |
| 8 | `LIMIT` / `FETCH` | Return only part of the result |

The optimiser is free to execute things in a different physical order (it pushes filters down, for example), but the result must be as if this order had been followed.

### Pitfalls

- **`SELECT *` in pipelines.** It is fine for exploring, but in a production model it reads every column (expensive in columnar warehouses, which charge or slow down by columns scanned) and silently changes shape when a column is added upstream. Name the columns.
- **`= NULL` never matches.** `WHERE email = NULL` returns no rows, even for Chen. Use `IS NULL`; the [next lesson](/sql/operators-nulls-case/) covers this properly.
- **Mixed `AND`/`OR` without brackets**, as shown above.
- **Filtering on a function of a column**, such as `WHERE EXTRACT(YEAR FROM order_date) = 2025`, can stop the engine using an index or partition pruning. Prefer a range: `order_date >= DATE '2025-01-01' AND order_date < DATE '2026-01-01'`.

### In interviews

Expect to be asked for the logical order of evaluation, often disguised as "why can't I use my alias in `WHERE`?" A strong answer names the steps, explains that `WHERE` runs before `SELECT`, and mentions that the physical plan can differ from the logical order.

## Aliases and column naming

An **alias** is a temporary name for a column or table, given with `AS`. Column aliases name computed values and make output readable. Table aliases shorten long names and are required when the same table appears twice in one query.

```sql
SELECT o.order_id,
       o.amount              AS order_amount,
       o.amount * 0.2        AS vat_amount,
       o.status              AS "Order Status"
FROM orders AS o
WHERE o.customer_id = 4;
```

| order_id | order_amount | vat_amount | Order Status |
|---|---|---|---|
| 105 | 220.00 | 44.000 | delivered |
| 106 | 15.00 | 3.000 | placed |

### How it works

- `AS` is optional for both column and table aliases in PostgreSQL, MySQL and SQL Server (`amount total` works), but writing `AS` for columns makes a missing comma easy to spot: `SELECT order_id amount` silently renames `order_id` to `amount`.
- Unquoted identifiers are case-insensitive. PostgreSQL folds them to lower case, while Snowflake and Oracle fold them to upper case. A quoted alias such as `"Order Status"` keeps its exact case and may contain spaces, but then it must be quoted every time it is used. MySQL quotes identifiers with backticks and SQL Server with square brackets (both also accept double quotes in their ANSI modes).
- Because `SELECT` runs after `WHERE`, a column alias **cannot** be used in `WHERE` in standard SQL. It **can** be used in `ORDER BY`, which runs after `SELECT`.

<!-- expect-error -->
```sql
-- Fails in PostgreSQL: column "vat_amount" does not exist
SELECT order_id, amount * 0.2 AS vat_amount
FROM orders
WHERE vat_amount > 20;
```

Repeat the expression in `WHERE`, or compute it in a subquery or CTE and filter outside. Ordering by the alias is fine:

```sql
SELECT order_id, amount * 0.2 AS vat_amount
FROM orders
WHERE amount * 0.2 > 20
ORDER BY vat_amount DESC;
```

| order_id | vat_amount |
|---|---|
| 104 | 44.000 |
| 105 | 44.000 |
| 101 | 24.000 |

Some engines, including Snowflake and DuckDB, relax the rule and let you reference a `SELECT` alias in `WHERE`. Do not rely on that in an interview or in code that must run elsewhere. Note also that the order of 104 and 105 above is not guaranteed, because they tie; the ORDER BY section explains how to fix that.

### Naming conventions that save time later

- Use `snake_case`, lower-case names without spaces, so nobody has to quote them.
- Name measures with their unit or meaning (`amount_gbp`, `order_count`), and booleans as questions (`is_cancelled`).
- Avoid reserved words as names (`order`, `user`, `date`). `order` is why the table here is `orders`.
- Give every computed column an alias. Unnamed expressions get engine-generated names such as `?column?` (PostgreSQL) or none at all, and a view or `CREATE TABLE AS` built on them is painful to use.

### In interviews

Aliases rarely get their own question, but they show up as the "alias in `WHERE`" trap and in self-joins, where two aliases of the same table are essential. Mention that a quoted alias is case-sensitive.

## DISTINCT and removing duplicate rows

`SELECT DISTINCT` removes **duplicate output rows**: two rows are duplicates when every selected column is equal. It is the simplest form of de-duplication.

```sql
SELECT DISTINCT country
FROM customers
ORDER BY country;
```

| country |
|---|
| GB |
| IN |
| SG |
| US |

### How it works

- `DISTINCT` applies to the **whole selected row**, not to the first column. `SELECT DISTINCT country, city` returns one row per distinct pair, so both GB rows survive because their cities differ.
- For `DISTINCT`, two `NULL`s count as duplicates of each other, even though `NULL = NULL` is not true in a `WHERE` clause. `SELECT DISTINCT city` returns one `NULL` row.
- `DISTINCT` happens after `SELECT`, so it de-duplicates computed values: `SELECT DISTINCT EXTRACT(MONTH FROM order_date)` returns each month once.
- `COUNT(DISTINCT col)` counts distinct non-`NULL` values; it is covered in the [aggregations lesson](/sql/aggregations-group-by-having/).

```sql
SELECT DISTINCT customer_id, amount
FROM orders
WHERE status <> 'placed'
ORDER BY customer_id, amount;
```

| customer_id | amount |
|---|---|
| 1 | 35.50 |
| 1 | 120.00 |
| 2 | 80.00 |
| 3 | 220.00 |
| 4 | 220.00 |
| 5 | 64.99 |

Ben's two orders of 80.00 (103 and 108) collapse into one row, because `order_id` is not selected.

### DISTINCT ON in PostgreSQL

PostgreSQL adds `DISTINCT ON (expr)`, which keeps the **first row of each group** according to the `ORDER BY`. It is a compact way to get each customer's latest order:

```sql
SELECT DISTINCT ON (customer_id) customer_id, order_id, order_date
FROM orders
ORDER BY customer_id, order_date DESC, order_id DESC;
```

| customer_id | order_id | order_date |
|---|---|---|
| 1 | 102 | 2025-06-03 |
| 2 | 108 | 2025-06-08 |
| 3 | 104 | 2025-06-04 |
| 4 | 106 | 2025-06-07 |
| 5 | 107 | 2025-06-07 |

`DISTINCT ON` is not standard SQL (DuckDB supports it too). The portable version uses `ROW_NUMBER()`, covered in [top-N per group and deduplication](/sql/top-n-deduplication-scd-queries/).

### Pitfalls

- **Using `DISTINCT` to hide a join bug.** If a join returns duplicate rows because a key is not unique, `DISTINCT` makes the output look right while sums and counts computed earlier are still inflated. Find the fan-out instead.
- **`DISTINCT` is not free.** The engine must sort or hash the whole result to find duplicates. On large tables, only use it when duplicates are genuinely possible.
- **Wanting "one row per key", not "no identical rows".** If two rows share a key but differ in another column, `DISTINCT` keeps both. That is a job for `ROW_NUMBER()` or `DISTINCT ON`.

### In interviews

"How do you remove duplicates?" is a classic. A strong answer separates **exact duplicates** (`DISTINCT`, or `GROUP BY` on every column) from **duplicates by business key** (keep one row per key with `ROW_NUMBER()` and a deterministic order), and asks which row should survive.

## ORDER BY: sorting on several columns

`ORDER BY` sorts the final result. Without it, **SQL guarantees no order at all**: the same query can return rows in a different order tomorrow, after a table is rewritten, or when a parallel plan is chosen.

```sql
SELECT customer_id, order_date, order_id, amount
FROM orders
ORDER BY customer_id ASC, amount DESC, order_id;
```

| customer_id | order_date | order_id | amount |
|---|---|---|---|
| 1 | 2025-06-01 | 101 | 120.00 |
| 1 | 2025-06-03 | 102 | 35.50 |
| 2 | 2025-06-03 | 103 | 80.00 |
| 2 | 2025-06-08 | 108 | 80.00 |
| 3 | 2025-06-04 | 104 | 220.00 |
| 4 | 2025-06-05 | 105 | 220.00 |
| 4 | 2025-06-07 | 106 | 15.00 |
| 5 | 2025-06-07 | 107 | 64.99 |

### How it works

- Columns are compared left to right: the second column only breaks ties in the first, the third only breaks ties in the first two.
- `ASC` (the default) and `DESC` apply to **one column each**. `ORDER BY customer_id, amount DESC` sorts customers ascending and amounts descending.
- You can sort by an expression (`ORDER BY amount * 0.2`), by an alias, or by a column that is not selected (except with `DISTINCT`, where the sort columns must be in the select list).
- `ORDER BY 2` sorts by the second selected column. It is handy in ad hoc queries but fragile in code: reorder the select list and the sort silently changes.
- Text sorts according to the column's **collation**, so upper/lower case and accented characters may not sort the way a byte-by-byte comparison would.

### Where NULLs go

Engines disagree about where `NULL` sorts by default, which matters for "latest" and "top" queries.

| Engine | Default with `ASC` | Default with `DESC` | Explicit control |
|---|---|---|---|
| PostgreSQL, Oracle, Snowflake (default setting) | `NULL`s last | `NULL`s first | `NULLS FIRST` / `NULLS LAST` |
| MySQL, SQL Server, SQLite | `NULL`s first | `NULL`s last | SQL Server and MySQL lack `NULLS LAST`: sort on `CASE WHEN col IS NULL THEN 1 ELSE 0 END` first |
| BigQuery | `NULL`s first | `NULL`s last | `NULLS FIRST` / `NULLS LAST` |

PostgreSQL treats `NULL` as larger than any value, which is why sorting `DESC` puts it first. If you sort customers by city descending to show cities, Farah's missing city comes first unless you say otherwise:

```sql
SELECT full_name, city
FROM customers
ORDER BY city DESC NULLS LAST;
```

| full_name | city |
|---|---|
| Chen Wei | Singapore |
| Asha Patel | Mumbai |
| Ben Carter | London |
| Ethan Brown | Leeds |
| Diana Lopez | Austin |
| Farah Khan | NULL |

### Pitfalls

- **Ties make results non-deterministic.** Orders 104 and 105 both have amount 220.00. `ORDER BY amount DESC` may return them in either order, and combined with a row limit it can return a different "top" row on each run. Add a unique column as the final tiebreaker: `ORDER BY amount DESC, order_id`.
- **`ORDER BY` in a subquery or view does not order the final result.** Only the outermost `ORDER BY` counts. SQL Server rejects `ORDER BY` in views and derived tables unless `TOP`, `OFFSET` or `FOR XML` is also present.
- **Sorting is expensive on big data.** In Spark or a warehouse, a global sort needs every row compared across the cluster. Sort only for presentation, or for row limits, not "just in case".

### In interviews

Interviewers often check whether you add a tiebreaker, and whether you know that unsorted results have no defined order. When a question asks for "the latest" or "the highest", say how you handle ties and `NULL`s before writing the query.

## LIMIT, TOP and FETCH FIRST

A row limit returns only the first *n* rows of the result. It is used for "top 5" questions, for sampling during development and for paging through results. Every engine supports it, but the syntax differs, and interviewers like to ask about that.

```sql
SELECT order_id, amount
FROM orders
ORDER BY amount DESC, order_id
LIMIT 3;
```

| order_id | amount |
|---|---|
| 104 | 220.00 |
| 105 | 220.00 |
| 101 | 120.00 |

The SQL standard form, `FETCH FIRST`, also works in PostgreSQL:

```sql
SELECT order_id, amount
FROM orders
ORDER BY amount DESC, order_id
OFFSET 3 ROWS FETCH FIRST 2 ROWS ONLY;
```

| order_id | amount |
|---|---|
| 103 | 80.00 |
| 108 | 80.00 |

### Dialect comparison

| Engine | Top 3 | Skip 3, take 2 | Include ties |
|---|---|---|---|
| PostgreSQL | `LIMIT 3` or `FETCH FIRST 3 ROWS ONLY` | `LIMIT 2 OFFSET 3` | `FETCH FIRST 3 ROWS WITH TIES` (PostgreSQL 13+) |
| MySQL | `LIMIT 3` | `LIMIT 2 OFFSET 3` or `LIMIT 3, 2` | Not available; use `RANK()` |
| SQL Server | `SELECT TOP (3) ...` | `ORDER BY ... OFFSET 3 ROWS FETCH NEXT 2 ROWS ONLY` | `TOP (3) WITH TIES` |
| Oracle 12c+ | `FETCH FIRST 3 ROWS ONLY` | `OFFSET 3 ROWS FETCH NEXT 2 ROWS ONLY` | `FETCH FIRST 3 ROWS WITH TIES` |
| Snowflake | `LIMIT 3`, `TOP 3` or `FETCH FIRST 3 ROWS ONLY` | `LIMIT 2 OFFSET 3` | Not available; use `RANK()` and `QUALIFY` |
| BigQuery | `LIMIT 3` | `LIMIT 2 OFFSET 3` | Not available; use `RANK()` and `QUALIFY` |

The SQL Server version looks like this:

<!-- noexec -->
```sql
-- SQL Server (T-SQL)
SELECT TOP (3) WITH TIES order_id, amount
FROM orders
ORDER BY amount DESC;

-- Paging: OFFSET/FETCH needs an ORDER BY, and cannot be combined with TOP
SELECT order_id, amount
FROM orders
ORDER BY amount DESC, order_id
OFFSET 3 ROWS FETCH NEXT 2 ROWS ONLY;
```

`WITH TIES` returns extra rows that tie with the last one. In PostgreSQL it needs an `ORDER BY`:

```sql
SELECT order_id, amount
FROM orders
ORDER BY amount DESC
FETCH FIRST 3 ROWS WITH TIES;
```

| order_id | amount |
|---|---|
| 104 | 220.00 |
| 105 | 220.00 |
| 101 | 120.00 |

Here the third row has no tie, so three rows come back. Ask for the top 1 and you get both 220.00 orders.

### Pitfalls

- **A limit without `ORDER BY` returns arbitrary rows.** `LIMIT 10` on its own is a sample, not "the first ten", and it can change between runs.
- **Ties at the boundary.** "Top 3 orders by amount" is ambiguous when the third and fourth tie. Decide whether you want exactly three rows (add a tiebreaker) or every tied row (`WITH TIES` or `RANK()`).
- **Large `OFFSET`s are slow.** The engine still produces and discards every skipped row, so page 10,000 costs far more than page 1. For deep paging use **keyset pagination**: remember the last key you returned and ask for `WHERE order_id > :last_id ORDER BY order_id LIMIT 50`.
- **A limit does not always reduce cost.** `SELECT * FROM big_table LIMIT 10` can be cheap, but in BigQuery a `LIMIT` does not reduce the bytes billed for a full column scan, and with `ORDER BY` the engine must still sort or scan everything to find the top rows. Use partition filters to cut the data read.

### In interviews

- Know at least `LIMIT`, `TOP` and `FETCH FIRST`, and that SQL Server's `OFFSET ... FETCH` requires `ORDER BY`.
- "Top N **per group**" cannot be solved with a single `LIMIT`; it needs a window function. Say so and reach for `ROW_NUMBER()` or `RANK()`.
- Mentioning keyset pagination when paging comes up shows production experience.

## Where this course goes next

These clauses are the frame that everything else hangs on. The rest of the course adds the pieces in this order:

| Lesson | What it adds |
|---|---|
| [Operators, NULLs and CASE](/sql/operators-nulls-case/) | Richer `WHERE` conditions, three-valued logic and conditional expressions |
| [Functions: strings, dates, casting, arithmetic](/sql/functions-strings-dates-types/) | Cleaning and converting values row by row |
| [Aggregations, GROUP BY and HAVING](/sql/aggregations-group-by-having/) | Summarising rows into metrics at a chosen grain |
| [Set operations](/sql/set-operations/) | Stacking and comparing results, and reconciling loads |
| [Joins](/sql/joins/) | Combining tables while predicting the row count |
| [Semi-joins, anti-joins and LATERAL](/sql/semi-anti-lateral-joins/) | "Has a match", "has no match" and per-row subqueries |
| [Subqueries and CTEs](/sql/ctes-subqueries-temp-tables/) | Building answers in named, testable steps |
| [PIVOT, UNPIVOT and GROUPING SETS](/sql/pivot-unpivot-grouping-sets/) | Reshaping data and producing subtotals |
| [Window functions](/sql/window-functions/) | Rankings, previous-row comparisons and group context per row |
| [Window frames](/sql/window-frames-running-totals/) | Running totals, moving averages and percentiles |
| [Time-series SQL](/sql/dates-calendars-time-series/) | Date buckets, calendars, MoM, YoY and rolling metrics |
| [Top-N, deduplication and SCD queries](/sql/top-n-deduplication-scd-queries/) | The three patterns behind most pipeline SQL |

When you have finished these, [query optimisation](/sql/query-optimization-fundamentals/) shows how to read plans and reduce the data scanned. The [SQL cheat sheet](/resources/cheat-sheets/sql-data-engineering/) summarises syntax for revision.

## Practice questions

<details><summary>In what order does the engine logically evaluate SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY and LIMIT?</summary>

`FROM` (and joins), `WHERE`, `GROUP BY`, `HAVING`, `SELECT` (including window functions), `DISTINCT`, `ORDER BY`, then `LIMIT`/`FETCH`. This is why a `SELECT` alias cannot be used in `WHERE` but can be used in `ORDER BY`, and why a window function cannot be filtered in `WHERE`. The physical plan may reorder work (for example, pushing filters into the scan) as long as the result is the same.

</details>

<details><summary>What does SELECT DISTINCT a, b return when two rows have the same a but different b? And how are NULLs treated?</summary>

Both rows are returned, because `DISTINCT` compares the whole selected row. For `DISTINCT` (and `GROUP BY`), `NULL`s are treated as equal to each other, so all rows with `NULL` in the same positions collapse into one, even though `NULL = NULL` is not true in a `WHERE` clause.

</details>

<details><summary>A dashboard query uses ORDER BY revenue DESC LIMIT 1 and shows a different "top product" on different days although the data has not changed. Why?</summary>

Two or more products tie on revenue, and the engine is free to return tied rows in any order. Parallel plans or a rewritten table change that order. Fix it by adding a unique tiebreaker (`ORDER BY revenue DESC, product_id`), or decide that ties should all be shown and use `FETCH FIRST 1 ROW WITH TIES` or `RANK()`.

</details>

<details><summary>Write "the three most recent orders" for PostgreSQL, SQL Server and Oracle.</summary>

PostgreSQL: `SELECT * FROM orders ORDER BY order_date DESC, order_id DESC LIMIT 3;`
SQL Server: `SELECT TOP (3) * FROM orders ORDER BY order_date DESC, order_id DESC;`
Oracle 12c+ (also PostgreSQL): `SELECT * FROM orders ORDER BY order_date DESC, order_id DESC FETCH FIRST 3 ROWS ONLY;`
The tiebreaker on `order_id` makes the result deterministic when two orders share a date.

</details>

<details><summary>Why is WHERE email = NULL wrong, and what should you write?</summary>

Any comparison with `NULL` using `=` returns unknown, not true, so the filter drops every row. Use `WHERE email IS NULL` (or `IS NOT NULL`).

</details>

<details><summary>You are asked to page through 50 million rows, 1,000 at a time. Why is OFFSET a poor choice and what is the alternative?</summary>

`OFFSET n` makes the engine produce and throw away *n* rows before returning the page, so later pages get progressively slower, and rows inserted between requests can shift pages so rows are skipped or repeated. Keyset pagination remembers the last key returned and filters on it: `WHERE order_id > :last_seen ORDER BY order_id LIMIT 1000`. With an index on the key each page costs about the same.

</details>

## Key takeaways

- `SELECT` picks columns, `WHERE` picks rows, and a row survives `WHERE` only if the condition is true, not unknown.
- The logical order is `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `SELECT`, `DISTINCT`, `ORDER BY`, `LIMIT`; it explains where aliases and window functions can be used.
- `DISTINCT` removes identical rows across all selected columns; de-duplicating by a business key needs `ROW_NUMBER()` or `DISTINCT ON`.
- Without `ORDER BY` there is no order. Add a unique tiebreaker and state where `NULL`s go, because defaults differ by engine.
- `LIMIT` (PostgreSQL, MySQL, Snowflake, BigQuery), `TOP` (SQL Server) and `FETCH FIRST` (standard) do the same job; only some support `WITH TIES`.
- Use keyset pagination instead of large `OFFSET`s.

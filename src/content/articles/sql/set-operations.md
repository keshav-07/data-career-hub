---
title: "SQL Set Operations: UNION, UNION ALL, INTERSECT and EXCEPT"
seoTitle: "SQL UNION, UNION ALL, INTERSECT and EXCEPT"
description: "SQL UNION, UNION ALL, INTERSECT and EXCEPT explained: how duplicates and NULLs are handled, column matching rules and data reconciliation patterns."
technology: ["sql"]
topic: ["set-operations", "union", "reconciliation"]
difficulty: "Beginner"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Choose between UNION and UNION ALL and explain the cost of removing duplicates"
  - "Line up columns correctly when stacking results from different tables"
  - "Use INTERSECT and EXCEPT to find overlaps and differences between datasets"
  - "Reconcile a source table against a warehouse table with EXCEPT in both directions"
prerequisites: ["articles:sql/aggregations-group-by-having"]
related: ["articles:sql/joins", "articles:sql/sql-fundamentals"]
previous: "articles:sql/aggregations-group-by-having"
next: "articles:sql/joins"
sources:
  - { label: "PostgreSQL documentation: Combining queries (UNION, INTERSECT, EXCEPT)", url: "https://www.postgresql.org/docs/16/queries-union.html" }
  - { label: "MySQL documentation: Set operations with UNION, INTERSECT and EXCEPT", url: "https://dev.mysql.com/doc/refman/8.4/en/set-operations.html" }
  - { label: "BigQuery documentation: Query syntax (set operators)", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax" }
versionContext: "Examples run on PostgreSQL 16. Dialect notes for MySQL, SQL Server, Snowflake, BigQuery and Oracle were not executed."
---

Joins combine tables side by side, adding columns. Set operations stack or compare whole result sets, row against row. You use them to merge data from several sources into one table, to find customers who appear in two systems, and above all to **reconcile**: proving that what landed in the warehouse matches what left the source. They are short to write, but duplicates, `NULL`s and column order all behave differently from joins.

## Sample data

Customers sign up on the web or in the mobile app, so their emails live in two tables. A second pair of tables holds the same orders as seen by the source system and by the warehouse after a load.

```sql
CREATE TABLE web_signups (email TEXT, signup_date DATE, country TEXT);
CREATE TABLE app_signups (email TEXT, signup_date DATE, country TEXT);

INSERT INTO web_signups VALUES
  ('asha@example.com',  '2025-01-14', 'IN'),
  ('ben@example.com',   '2025-02-03', 'GB'),
  ('chen@example.com',  '2025-02-20', 'SG'),
  ('ben@example.com',   '2025-02-03', 'GB');   -- duplicate row from a retried export

INSERT INTO app_signups VALUES
  ('ben@example.com',   '2025-03-01', 'GB'),
  ('diana@example.com', '2025-03-11', 'US'),
  ('chen@example.com',  '2025-02-20', 'SG'),
  (NULL,                '2025-04-02', 'IN');   -- app user who never gave an email

CREATE TABLE source_orders    (order_id INT, status TEXT, amount NUMERIC(10, 2), coupon TEXT);
CREATE TABLE warehouse_orders (order_id INT, status TEXT, amount NUMERIC(10, 2), coupon TEXT);

INSERT INTO source_orders VALUES
  (101, 'delivered', 120.00, 'SUMMER10'), (102, 'delivered', 35.50, NULL),
  (103, 'cancelled',  80.00, NULL),       (104, 'shipped',  220.00, NULL),
  (105, 'delivered', 220.00, NULL);

INSERT INTO warehouse_orders VALUES
  (101, 'delivered', 120.00, 'SUMMER10'), (102, 'delivered', 35.50, NULL),
  (103, 'placed',     80.00, NULL),       (104, 'shipped',  220.00, NULL),
  (106, 'placed',     15.00, NULL);
```

Ben appears in both systems with different signup dates, Chen appears identically in both, and the warehouse is out of date for order 103, is missing 105 and has an extra order 106.

## UNION versus UNION ALL

`UNION` and `UNION ALL` stack the rows of two queries into one result. The difference is duplicates: **`UNION` removes duplicate rows, `UNION ALL` keeps every row**.

```sql
SELECT email, 'web' AS source FROM web_signups
UNION ALL
SELECT email, 'app' AS source FROM app_signups
ORDER BY email NULLS LAST, source;
```

| email | source |
|---|---|
| asha@example.com | web |
| ben@example.com | app |
| ben@example.com | web |
| ben@example.com | web |
| chen@example.com | app |
| chen@example.com | web |
| diana@example.com | app |
| NULL | app |

All eight rows come back, including the duplicated Ben row from the web export. Now the distinct list of emails:

```sql
SELECT email FROM web_signups
UNION
SELECT email FROM app_signups
ORDER BY email NULLS LAST;
```

| email |
|---|
| asha@example.com |
| ben@example.com |
| chen@example.com |
| diana@example.com |
| NULL |

### How it works

- **Columns are matched by position, not by name.** Both queries must return the same number of columns with compatible types. The output column names come from the **first** query.
- `UNION` removes duplicates across the **whole combined result**, including duplicates that were inside one input (the two identical Ben web rows collapse too). It is `UNION ALL` followed by `DISTINCT`.
- For duplicate detection, two `NULL`s count as equal, so the result has one `NULL` email row. This differs from joins and `WHERE`, where `NULL = NULL` is not true.
- `ORDER BY` and `LIMIT` at the end apply to the **combined** result. To sort or limit one branch, put it in brackets or a subquery.
- Removing duplicates needs a sort or hash of every row. On large tables `UNION` can be far slower than `UNION ALL`, and in distributed engines it adds a shuffle.

### Stacking tables with different shapes

When sources have different columns, line them up explicitly and fill gaps with typed `NULL`s or constants. Adding a literal source column keeps lineage and stops `UNION` from merging rows that came from different systems:

```sql
SELECT email, signup_date, country, 'web' AS source_system FROM web_signups
UNION ALL
SELECT email, signup_date, country, 'app' FROM app_signups
ORDER BY signup_date, source_system;
```

| email | signup_date | country | source_system |
|---|---|---|---|
| asha@example.com | 2025-01-14 | IN | web |
| ben@example.com | 2025-02-03 | GB | web |
| ben@example.com | 2025-02-03 | GB | web |
| chen@example.com | 2025-02-20 | SG | app |
| chen@example.com | 2025-02-20 | SG | web |
| ben@example.com | 2025-03-01 | GB | app |
| diana@example.com | 2025-03-11 | US | app |
| NULL | 2025-04-02 | IN | app |

### Dialect notes

| Engine | Notes |
|---|---|
| PostgreSQL, MySQL, SQL Server, Snowflake, Oracle | `UNION` means distinct; `UNION ALL` keeps duplicates |
| BigQuery | You must write `UNION ALL` or `UNION DISTINCT`; a bare `UNION` is an error |
| Snowflake, DuckDB, Databricks | Also offer `UNION [ALL] BY NAME`, which matches columns by name instead of position |

### Pitfalls

- **Using `UNION` by habit.** If the inputs cannot overlap (different months, different source systems with a source column), `UNION` wastes a sort. If they can overlap, `UNION` may hide duplicates you should have found. Choose deliberately.
- **Columns in a different order.** `SELECT email, country ... UNION ALL SELECT country, email ...` runs without error when both are text and silently swaps the values. List columns explicitly in every branch, never `SELECT *`.
- **Type mismatches.** `NULL` without a type, or text unioned with numbers, can fail or be coerced. Cast: `CAST(NULL AS DATE)`.
- **Expecting `UNION` to de-duplicate by key.** Ben's two signups differ in date, so both survive. De-duplicating by key needs `ROW_NUMBER()`, covered in the [top-N and deduplication lesson](/sql/top-n-deduplication-scd-queries/).

### In interviews

"Difference between `UNION` and `UNION ALL`?" is a warm-up question. A strong answer covers duplicates, the performance cost of de-duplication, positional column matching and the fact that `UNION ALL` is the default choice in pipelines unless de-duplication is the goal. Mentioning BigQuery's mandatory `DISTINCT`/`ALL` shows breadth.

## INTERSECT and EXCEPT

`INTERSECT` returns rows that appear in **both** results. `EXCEPT` returns rows from the first result that do **not** appear in the second (Oracle and Snowflake also call it `MINUS`). Like `UNION`, both compare entire rows and remove duplicates by default.

### INTERSECT: what is in both

```sql
SELECT email FROM web_signups
INTERSECT
SELECT email FROM app_signups
ORDER BY email;
```

| email |
|---|
| ben@example.com |
| chen@example.com |

Compare whole rows and Ben drops out, because his signup dates differ:

```sql
SELECT email, signup_date FROM web_signups
INTERSECT
SELECT email, signup_date FROM app_signups;
```

| email | signup_date |
|---|---|
| chen@example.com | 2025-02-20 |

### EXCEPT: what is only in the first

```sql
SELECT email FROM web_signups
EXCEPT
SELECT email FROM app_signups;
```

| email |
|---|
| asha@example.com |

Order matters: `EXCEPT` is not symmetric. `app EXCEPT web` returns Diana and the `NULL` email instead.

### Reconciliation: EXCEPT in both directions

The most valuable use of `EXCEPT` in Data Engineering is checking a load. Rows in the source but not in the warehouse were lost or changed; rows in the warehouse but not in the source are extra or stale. Run both directions and label them:

```sql
(SELECT 'missing_or_changed_in_warehouse' AS issue, s.*
 FROM (SELECT order_id, status, amount, coupon FROM source_orders
       EXCEPT
       SELECT order_id, status, amount, coupon FROM warehouse_orders) s)
UNION ALL
(SELECT 'unexpected_in_warehouse' AS issue, w.*
 FROM (SELECT order_id, status, amount, coupon FROM warehouse_orders
       EXCEPT
       SELECT order_id, status, amount, coupon FROM source_orders) w)
ORDER BY order_id, issue;
```

| issue | order_id | status | amount | coupon |
|---|---|---|---|---|
| missing_or_changed_in_warehouse | 103 | cancelled | 80.00 | NULL |
| unexpected_in_warehouse | 103 | placed | 80.00 | NULL |
| missing_or_changed_in_warehouse | 105 | delivered | 220.00 | NULL |
| unexpected_in_warehouse | 106 | placed | 15.00 | NULL |

An order that appears on both sides (103) changed; one that appears only on the left (105) is missing; one only on the right (106) is extra. Notice that orders 102 and 104, whose `coupon` is `NULL` on both sides, correctly match: set operations treat `NULL`s as equal. A naive join on every column (`s.coupon = w.coupon`) would wrongly report them as different, because `NULL = NULL` is unknown.

### EXCEPT versus NOT EXISTS

| | `EXCEPT` | `NOT EXISTS` / anti-join |
|---|---|---|
| Compares | Every selected column | Only the columns in the condition |
| `NULL`s | Treated as equal | `NULL = NULL` is unknown, so no match |
| Duplicates | Removed (unless `EXCEPT ALL`) | Left-side rows kept as they are |
| Returns | Only the compared columns | Any columns of the outer table |

Use `EXCEPT` to compare full rows, and `NOT EXISTS` when you match on a key but need other columns in the output. The [semi-joins and anti-joins lesson](/sql/semi-anti-lateral-joins/) covers the second pattern.

### ALL variants and precedence

`INTERSECT ALL` and `EXCEPT ALL` keep duplicates by counting them: if a row appears three times on the left and once on the right, `EXCEPT ALL` returns it twice.

```sql
SELECT email FROM web_signups
EXCEPT ALL
SELECT email FROM app_signups
ORDER BY email;
```

| email |
|---|
| asha@example.com |
| ben@example.com |

Ben appears twice in the web table and once in the app table, so one copy is left over, which is exactly the duplicate a reconciliation should flag. PostgreSQL, MySQL (8.0.31 and later) and DuckDB support the `ALL` forms; SQL Server, Snowflake and BigQuery offer only the distinct forms (BigQuery requires the keyword: `INTERSECT DISTINCT`, `EXCEPT DISTINCT`).

When you chain operators, `INTERSECT` binds more tightly than `UNION` and `EXCEPT`, which are evaluated left to right. Use brackets rather than relying on that.

### Engine support

| Engine | `INTERSECT` | `EXCEPT` |
|---|---|---|
| PostgreSQL, SQL Server, DuckDB | Yes | `EXCEPT` |
| MySQL | 8.0.31 and later | 8.0.31 and later |
| Oracle | Yes | `MINUS` (and `EXCEPT` in recent versions) |
| Snowflake | Yes | `EXCEPT` or `MINUS` |
| BigQuery | `INTERSECT DISTINCT` | `EXCEPT DISTINCT` |

On MySQL before 8.0.31, emulate them with `EXISTS` and `NOT EXISTS`.

### Pitfalls

- **Reconciling in one direction only.** `source EXCEPT target` finds missing rows but never finds extras or duplicates in the target.
- **Comparing columns with different precision or formatting**, for example a `TIMESTAMP` against a `TIMESTAMPTZ`, or `NUMERIC(10,2)` against a float. Every row looks different. Cast both sides to the same types first.
- **Comparing wide tables row by row** on billions of rows is expensive. Compare counts and per-partition checksums first, then run `EXCEPT` only on partitions that disagree.
- **Forgetting that duplicates disappear** with plain `EXCEPT`. Use `EXCEPT ALL` (where supported) or compare `GROUP BY` counts.

### In interviews

Expect "find customers who bought in 2024 but not in 2025" (`EXCEPT` or `NOT EXISTS`) and "how would you check that a migration copied a table correctly?" For the second, describe counts, then `EXCEPT` in both directions on the full row, cast to identical types, with `NULL`-safe comparison as a reason to prefer set operations over joins.

## Practice questions

<details><summary>Table A has 100 rows and table B has 50 rows, all with the same columns. What are the minimum and maximum row counts of A UNION ALL B and A UNION B?</summary>

`UNION ALL` always returns exactly 150 rows. `UNION` returns at least 1 row (if every row in both tables is identical) and at most 150 (if all 150 rows are distinct, including within each table).

</details>

<details><summary>Why might UNION be much slower than UNION ALL on large tables?</summary>

`UNION` must remove duplicates across the whole result, which needs a sort or a hash table over every row and, in a distributed engine, a shuffle so identical rows meet on the same worker. `UNION ALL` simply appends the inputs. When the inputs cannot overlap, `UNION ALL` gives the same answer for less work.

</details>

<details><summary>Write a query listing customer ids who ordered in 2024 but not in 2025.</summary>

```
SELECT customer_id FROM orders
WHERE order_date >= DATE '2024-01-01' AND order_date < DATE '2025-01-01'
EXCEPT
SELECT customer_id FROM orders
WHERE order_date >= DATE '2025-01-01' AND order_date < DATE '2026-01-01';
```

`NOT EXISTS` with a correlated subquery is equivalent here and lets you return other columns. In MySQL before 8.0.31 `NOT EXISTS` is the only option.

</details>

<details><summary>You join source and target tables on all columns to find differences, and rows with NULLs are always reported as different. Why, and what is the fix?</summary>

In a join condition, `NULL = NULL` is unknown, so rows containing a `NULL` never match themselves. Use `EXCEPT` in both directions, which treats `NULL`s as equal, or compare with `IS NOT DISTINCT FROM` in the join condition.

</details>

<details><summary>A query stacks two tables with UNION ALL and the country column contains email addresses. What went wrong?</summary>

Set operations match columns by position, not name. One branch listed the columns in a different order, and because both were text the engine raised no error. List columns explicitly in the same order in every branch, or use `UNION ALL BY NAME` in engines that support it.

</details>

## Key takeaways

- `UNION ALL` appends results; `UNION` also removes duplicate rows across the combined result, at the cost of a sort or hash.
- Columns are matched by position, names come from the first query, and types must be compatible.
- `INTERSECT` returns rows in both results; `EXCEPT` (or `MINUS`) returns rows only in the first, and its order matters.
- Set operations treat `NULL`s as equal, which makes `EXCEPT` the right tool for full-row comparisons.
- Reconcile loads with `EXCEPT` in both directions, after casting both sides to the same types.
- The `ALL` forms of `INTERSECT` and `EXCEPT` exist in PostgreSQL, MySQL 8.0.31+ and DuckDB, but not in SQL Server, Snowflake or BigQuery.

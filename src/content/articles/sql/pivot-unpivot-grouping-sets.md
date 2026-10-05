---
title: "PIVOT, UNPIVOT, GROUPING SETS, ROLLUP and CUBE"
seoTitle: "SQL PIVOT, UNPIVOT, GROUPING SETS, ROLLUP, CUBE"
description: "Reshape data in SQL: pivot rows to columns, unpivot columns to rows, handle dynamic pivot columns, and compute subtotals with GROUPING SETS, ROLLUP and CUBE."
technology: ["sql"]
topic: ["pivot", "unpivot", "grouping-sets", "reporting"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Pivot rows into columns with conditional aggregation and with the PIVOT operator"
  - "Unpivot wide tables into long form with UNPIVOT or a LATERAL VALUES list"
  - "Handle pivots whose column list is not known in advance"
  - "Produce several grouping levels in one query with GROUPING SETS, ROLLUP and CUBE"
  - "Tell subtotal rows apart from real NULLs with GROUPING()"
prerequisites: ["articles:sql/aggregations-group-by-having", "articles:sql/ctes-subqueries-temp-tables"]
related: ["articles:sql/semi-anti-lateral-joins", "articles:data-warehousing/star-schema"]
previous: "articles:sql/ctes-subqueries-temp-tables"
sources:
  - { label: "PostgreSQL documentation: GROUPING SETS, CUBE and ROLLUP", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
  - { label: "PostgreSQL documentation: tablefunc (crosstab)", url: "https://www.postgresql.org/docs/16/tablefunc.html" }
  - { label: "DuckDB documentation: PIVOT statement", url: "https://duckdb.org/docs/current/sql/statements/pivot" }
  - { label: "Snowflake documentation: PIVOT", url: "https://docs.snowflake.com/en/sql-reference/constructs/pivot" }
  - { label: "SQL Server documentation: Using PIVOT and UNPIVOT", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/from-using-pivot-and-unpivot" }
  - { label: "MySQL documentation: GROUP BY modifiers (WITH ROLLUP)", url: "https://dev.mysql.com/doc/refman/8.4/en/group-by-modifiers.html" }
versionContext: "Examples run on PostgreSQL 16 (with the tablefunc extension for crosstab) and DuckDB 1.5 for PIVOT and UNPIVOT. Snowflake and SQL Server examples were written from the official documentation and not executed."
---

Reports and machine-learning features often need data in a different **shape** from how it is stored: one column per month instead of one row per month, or one row per metric instead of one column per metric. Reports also need **subtotals and grand totals** alongside the detail. This lesson covers both reshaping (pivot and unpivot, including the dynamic-column problem) and multi-level aggregation with `GROUPING SETS`, `ROLLUP` and `CUBE`. PostgreSQL has no `PIVOT` keyword, so the portable techniques come first, followed by the `PIVOT` operators of DuckDB, Snowflake and SQL Server.

## Sample data

Monthly revenue by region and sales channel, already aggregated from orders. EU had no app sales in February.

```sql
CREATE TABLE monthly_sales (
  sales_month TEXT NOT NULL,       -- 'YYYY-MM'
  region      TEXT NOT NULL,
  channel     TEXT NOT NULL,
  revenue     NUMERIC(10, 2) NOT NULL
);

INSERT INTO monthly_sales VALUES
  ('2025-01', 'EU', 'web', 1200), ('2025-01', 'EU', 'app',  300),
  ('2025-01', 'US', 'web', 2000), ('2025-01', 'US', 'app',  800),
  ('2025-02', 'EU', 'web', 1100),
  ('2025-02', 'US', 'web', 2100), ('2025-02', 'US', 'app',  950),
  ('2025-03', 'EU', 'web', 1300), ('2025-03', 'EU', 'app',  400),
  ('2025-03', 'US', 'web', 2300), ('2025-03', 'US', 'app', 1000);
```

## PIVOT: turning rows into columns

**Pivoting** turns the distinct values of one column (here, months) into separate output columns, aggregating a measure into each cell. The result is a wide table, the shape of a spreadsheet report.

### Portable pivot with conditional aggregation

Every engine can pivot with `GROUP BY` and one `CASE` (or `FILTER`) per output column:

```sql
SELECT region,
       SUM(CASE WHEN sales_month = '2025-01' THEN revenue END) AS jan,
       SUM(CASE WHEN sales_month = '2025-02' THEN revenue END) AS feb,
       SUM(CASE WHEN sales_month = '2025-03' THEN revenue END) AS mar,
       SUM(revenue)                                            AS q1_total
FROM monthly_sales
GROUP BY region
ORDER BY region;
```

| region | jan | feb | mar | q1_total |
|---|---|---|---|---|
| EU | 1500.00 | 1100.00 | 1700.00 | 4300.00 |
| US | 2800.00 | 3050.00 | 3300.00 | 9150.00 |

- The `GROUP BY` columns become the rows; each `CASE` defines one column.
- With no `ELSE`, a cell with no data is `NULL`; with `ELSE 0` it is 0. `NULL` means "no data" and 0 means "zero sales", so pick deliberately.
- You can add extra columns (`q1_total`) and several measures in the same pass, which the `PIVOT` operator makes awkward.

PostgreSQL's `FILTER` clause reads more cleanly: `SUM(revenue) FILTER (WHERE sales_month = '2025-01') AS jan`.

### PostgreSQL crosstab

The `tablefunc` extension provides `crosstab`, which pivots the output of a query. You must declare the output columns and their types, and supply the category list so that missing cells land in the right column:

```sql
CREATE EXTENSION IF NOT EXISTS tablefunc;

SELECT *
FROM crosstab(
  $$SELECT region, sales_month, SUM(revenue) FROM monthly_sales GROUP BY 1, 2 ORDER BY 1, 2$$,
  $$VALUES ('2025-01'), ('2025-02'), ('2025-03')$$
) AS ct(region TEXT, jan NUMERIC, feb NUMERIC, mar NUMERIC);
```

| region | jan | feb | mar |
|---|---|---|---|
| EU | 1500.00 | 1100.00 | 1700.00 |
| US | 2800.00 | 3050.00 | 3300.00 |

Conditional aggregation is usually easier to read and needs no extension, so `crosstab` is mostly met in existing code.

### The PIVOT operator

DuckDB, Snowflake, SQL Server, Oracle, BigQuery and Databricks have a `PIVOT` operator. In DuckDB (the standard-style syntax also works in Snowflake):

<!-- engine: duckdb -->
```sql
CREATE TABLE monthly_sales (sales_month TEXT, region TEXT, channel TEXT, revenue DECIMAL(10, 2));
INSERT INTO monthly_sales VALUES
  ('2025-01', 'EU', 'web', 1200), ('2025-01', 'EU', 'app',  300),
  ('2025-01', 'US', 'web', 2000), ('2025-01', 'US', 'app',  800),
  ('2025-02', 'EU', 'web', 1100),
  ('2025-02', 'US', 'web', 2100), ('2025-02', 'US', 'app',  950),
  ('2025-03', 'EU', 'web', 1300), ('2025-03', 'EU', 'app',  400),
  ('2025-03', 'US', 'web', 2300), ('2025-03', 'US', 'app', 1000);

SELECT *
FROM (SELECT region, sales_month, revenue FROM monthly_sales)
PIVOT (SUM(revenue) FOR sales_month IN ('2025-01' AS jan, '2025-02' AS feb, '2025-03' AS mar))
ORDER BY region;
```

| region | jan | feb | mar |
|---|---|---|---|
| EU | 1500.00 | 1100.00 | 1700.00 |
| US | 2800.00 | 3050.00 | 3300.00 |

The important rule: **every column of the input that is not the pivot column or the aggregated value becomes an implicit grouping column.** That is why the input is narrowed to `region, sales_month, revenue` first. Feed it the whole table and `channel` would become a grouping column too, giving one row per region and channel.

The SQL Server form needs an alias for the source and bracketed column names:

<!-- noexec -->
```sql
-- SQL Server (T-SQL)
SELECT region, [2025-01] AS jan, [2025-02] AS feb, [2025-03] AS mar
FROM (SELECT region, sales_month, revenue FROM monthly_sales) AS src
PIVOT (SUM(revenue) FOR sales_month IN ([2025-01], [2025-02], [2025-03])) AS p
ORDER BY region;
```

### Pitfalls

- Extra columns in the pivot input silently becoming grouping columns.
- Pivoting on values that are not known to be complete: a month missing from the `IN` list is simply dropped, with no error.
- Mixing `NULL` (no data) with 0 (zero sales) in the output without deciding which you want.
- Pivoting inside a pipeline. Wide tables are good for presentation but awkward to filter, join and extend. Store data long and pivot at the reporting layer.

### In interviews

"Show revenue per region with a column per month" is a common prompt. Write the `SUM(CASE ...)` version first, because it works everywhere, then mention the `PIVOT` operator in the interviewer's engine and the implicit-grouping trap. Saying that pivots belong at the presentation layer shows design sense.

## UNPIVOT: turning columns into rows

**Unpivoting** is the reverse: it turns several columns into rows of (name, value) pairs. You need it when a source arrives wide, such as a spreadsheet with a column per month, or a sensor table with a column per metric, and you want the long, tidy shape that SQL aggregates easily.

Here is a wide table, as a finance team might upload it:

```sql
CREATE TABLE region_targets (region TEXT, jan NUMERIC, feb NUMERIC, mar NUMERIC);
INSERT INTO region_targets VALUES ('EU', 1400, 1400, NULL), ('US', 2700, 3000, 3200);
```

EU has not set a March target yet.

### Portable unpivot with LATERAL VALUES

PostgreSQL has no `UNPIVOT` keyword. A `LATERAL` list of `VALUES` does the job, and works in any engine with lateral joins:

```sql
SELECT t.region, v.month_name, v.target
FROM region_targets t
CROSS JOIN LATERAL (
  VALUES ('jan', t.jan), ('feb', t.feb), ('mar', t.mar)
) AS v(month_name, target)
ORDER BY t.region, v.month_name;
```

| region | month_name | target |
|---|---|---|
| EU | feb | 1400 |
| EU | jan | 1400 |
| EU | mar | NULL |
| US | feb | 3000 |
| US | jan | 2700 |
| US | mar | 3200 |

Each input row produces one output row per listed column. Note that EU's missing March target is kept as a `NULL` row; add `WHERE v.target IS NOT NULL` to drop it. The older portable alternative is one `SELECT` per column glued together with `UNION ALL`, which scans the table once per column.

### The UNPIVOT operator

In DuckDB:

<!-- engine: duckdb -->
```sql
CREATE TABLE region_targets (region TEXT, jan DECIMAL(10, 2), feb DECIMAL(10, 2), mar DECIMAL(10, 2));
INSERT INTO region_targets VALUES ('EU', 1400, 1400, NULL), ('US', 2700, 3000, 3200);

SELECT *
FROM region_targets
UNPIVOT (target FOR month_name IN (jan, feb, mar))
ORDER BY region, month_name;
```

| region | month_name | target |
|---|---|---|
| EU | feb | 1400.00 |
| EU | jan | 1400.00 |
| US | feb | 3000.00 |
| US | jan | 2700.00 |
| US | mar | 3200.00 |

The `UNPIVOT` operator **drops `NULL` values by default**, so EU's March row is gone. DuckDB, Snowflake and BigQuery accept `UNPIVOT INCLUDE NULLS (...)` to keep them; SQL Server's `UNPIVOT` always drops them, so use `CROSS APPLY (VALUES ...)` there if you need the `NULL` rows. DuckDB also accepts a shorter form, `UNPIVOT region_targets ON jan, feb, mar INTO NAME month_name VALUE target`, and `ON COLUMNS(* EXCLUDE (region))` to unpivot every other column.

### Pitfalls

- Losing `NULL` rows unintentionally with the `UNPIVOT` operator, or keeping them unintentionally with `LATERAL VALUES`.
- Unpivoting columns of different types (a number and a text column): the value column needs one type, so cast first.
- Hard-coding month names as text when the target needs a date: map `'jan'` to `DATE '2025-01-01'` in the `VALUES` list instead.

### In interviews

Unpivot comes up as "this table has a column per quarter; produce one row per quarter" or as a data-modelling question about wide versus long tables. Show the `UNION ALL` or `LATERAL VALUES` approach, mention the operator in Snowflake, SQL Server or DuckDB, and state how `NULL` cells are handled.

## Pivoting dynamic columns

Every pivot so far listed its output columns explicitly. In real data the values change: a new month or a new product category appears. SQL needs to know a query's columns **before** it runs, so a truly dynamic pivot requires either an engine feature that discovers them or **dynamic SQL**: a first query that builds the second query's text.

### Engines that discover the columns

DuckDB's simplified `PIVOT` finds the distinct values itself when you leave out `IN`:

<!-- engine: duckdb -->
```sql
PIVOT monthly_sales ON sales_month USING SUM(revenue) GROUP BY region ORDER BY region;
```

| region | 2025-01 | 2025-02 | 2025-03 |
|---|---|---|---|
| EU | 1500.00 | 1100.00 | 1700.00 |
| US | 2800.00 | 3050.00 | 3300.00 |

Snowflake supports dynamic pivots with `ANY` or a subquery in the `IN` clause:

<!-- noexec -->
```sql
-- Snowflake
SELECT *
FROM (SELECT region, sales_month, revenue FROM monthly_sales)
  PIVOT (SUM(revenue) FOR sales_month IN (ANY ORDER BY sales_month))
ORDER BY region;
```

Snowflake documents some limits: a view built on a dynamic pivot can break when the data changes the output columns, and dynamic pivot is not supported inside a stored procedure or UDF body.

### Dynamic SQL everywhere else

In SQL Server, PostgreSQL, BigQuery (`EXECUTE IMMEDIATE`) and others, generate the column list from the data, then run the generated statement. In PostgreSQL you can build the text with `string_agg`:

```sql
SELECT 'SELECT region, '
       || string_agg(
            format('SUM(revenue) FILTER (WHERE sales_month = %L) AS %I', sales_month, 'm_' || replace(sales_month, '-', '_')),
            ', ' ORDER BY sales_month)
       || ' FROM monthly_sales GROUP BY region ORDER BY region' AS generated_sql
FROM (SELECT DISTINCT sales_month FROM monthly_sales) m;
```

| generated_sql |
|---|
| SELECT region, SUM(revenue) FILTER (WHERE sales_month = '2025-01') AS m_2025_01, SUM(revenue) FILTER (WHERE sales_month = '2025-02') AS m_2025_02, SUM(revenue) FILTER (WHERE sales_month = '2025-03') AS m_2025_03 FROM monthly_sales GROUP BY region ORDER BY region |

In `psql` you can run the result directly with `\gexec`; in application or orchestration code you execute the string; in a PL/pgSQL function you use `EXECUTE`. `format()` with `%L` (literal) and `%I` (identifier) quotes values safely. In SQL Server, the equivalent builds the bracketed column list with `STRING_AGG(QUOTENAME(col), ',')` and runs it with `sp_executesql`.

### Avoiding dynamic columns altogether

Often the cleaner answer is to **not** produce dynamic columns in SQL:

- Return the data long and let the BI tool or pandas pivot it (`df.pivot_table(...)`).
- Return one row per region with a map or JSON object of month to value:

```sql
SELECT region, jsonb_object_agg(sales_month, revenue ORDER BY sales_month) AS revenue_by_month
FROM (SELECT region, sales_month, SUM(revenue) AS revenue FROM monthly_sales GROUP BY 1, 2) t
GROUP BY region
ORDER BY region;
```

| region | revenue_by_month |
|---|---|
| EU | {"2025-01": 1500.00, "2025-02": 1100.00, "2025-03": 1700.00} |
| US | {"2025-01": 2800.00, "2025-02": 3050.00, "2025-03": 3300.00} |

The schema stays fixed however many months arrive.

### Pitfalls

- SQL injection: generated SQL that pastes raw values into the statement. Always quote with `format('%L')`/`%I`, `QUOTENAME` or parameters.
- Downstream breakage: tables or views whose columns change every month break dashboards and contracts. Prefer long tables for anything stored.
- Unbounded width: a pivot over a high-cardinality column (customer id) can hit engine column limits.

### In interviews

"How would you pivot when you don't know the values in advance?" The strong answer names the engine feature (DuckDB automatic pivot, Snowflake `ANY`), explains dynamic SQL with safe quoting for other engines, and then questions the requirement: store long, pivot in the presentation layer, or use a map/JSON column.

## GROUPING SETS

`GROUPING SETS` runs several `GROUP BY`s in one query and stacks the results. Each set in the list is one grouping; columns not in a set are `NULL` in that set's rows.

```sql
SELECT region, channel, SUM(revenue) AS revenue
FROM monthly_sales
GROUP BY GROUPING SETS ((region), (channel), ())
ORDER BY region NULLS LAST, channel NULLS LAST;
```

| region | channel | revenue |
|---|---|---|
| EU | NULL | 4300.00 |
| US | NULL | 9150.00 |
| NULL | app | 3450.00 |
| NULL | web | 10000.00 |
| NULL | NULL | 13450.00 |

This is the same as three `GROUP BY` queries combined with `UNION ALL` (by region, by channel, and the grand total `()`), but the engine scans the data once and the query is shorter.

### Telling subtotals from real NULLs: GROUPING()

In those rows, `NULL` means "all values", but a real `NULL` in the data would look the same. `GROUPING(col)` returns 1 when the column is aggregated away in that row and 0 when it is a real grouping value. Use it to label rows:

```sql
SELECT CASE WHEN GROUPING(region)  = 1 THEN 'All regions'  ELSE region  END AS region,
       CASE WHEN GROUPING(channel) = 1 THEN 'All channels' ELSE channel END AS channel,
       SUM(revenue) AS revenue,
       GROUPING(region, channel) AS grouping_id
FROM monthly_sales
GROUP BY GROUPING SETS ((region, channel), (region), ())
ORDER BY GROUPING(region), region, GROUPING(channel), channel;
```

| region | channel | revenue | grouping_id |
|---|---|---|---|
| EU | app | 700.00 | 0 |
| EU | web | 3600.00 | 0 |
| EU | All channels | 4300.00 | 1 |
| US | app | 2750.00 | 0 |
| US | web | 6400.00 | 0 |
| US | All channels | 9150.00 | 1 |
| All regions | All channels | 13450.00 | 3 |

With several arguments, `GROUPING(a, b)` returns a bit mask (here 0 = detail, 1 = region subtotal, 3 = grand total), handy for filtering or sorting levels. SQL Server and others also offer `GROUPING_ID(...)` for the same purpose.

### Pitfalls

- Treating subtotal `NULL`s as missing data, or real `NULL`s as subtotals. Use `GROUPING()`.
- Applying `COALESCE(region, 'All')` to label subtotals, which mislabels genuine `NULL` regions.
- Summing the whole output: it contains detail rows **and** subtotals, so the sum double counts. Filter to one level first.

### In interviews

`GROUPING SETS` comes up as "produce totals by region, by channel and overall in one query". Explain the `UNION ALL` equivalence, the single scan, and `GROUPING()` for distinguishing subtotal rows.

## ROLLUP and CUBE

`ROLLUP` and `CUBE` are shorthands for common grouping-set lists.

| Shorthand | Expands to | Use for |
|---|---|---|
| `ROLLUP (a, b, c)` | `(a, b, c), (a, b), (a), ()` | Hierarchies: year > month > day, region > country > city |
| `CUBE (a, b)` | `(a, b), (a), (b), ()` | Every combination, for cross-tab analysis |

`ROLLUP (a, b, c)` produces n + 1 levels; `CUBE` over n columns produces 2^n groupings, which grows quickly.

### ROLLUP: subtotals along a hierarchy

```sql
SELECT region, sales_month, SUM(revenue) AS revenue
FROM monthly_sales
GROUP BY ROLLUP (region, sales_month)
ORDER BY region NULLS LAST, sales_month NULLS LAST;
```

| region | sales_month | revenue |
|---|---|---|
| EU | 2025-01 | 1500.00 |
| EU | 2025-02 | 1100.00 |
| EU | 2025-03 | 1700.00 |
| EU | NULL | 4300.00 |
| US | 2025-01 | 2800.00 |
| US | 2025-02 | 3050.00 |
| US | 2025-03 | 3300.00 |
| US | NULL | 9150.00 |
| NULL | NULL | 13450.00 |

Order matters: `ROLLUP (region, sales_month)` gives region subtotals, while `ROLLUP (sales_month, region)` gives month subtotals. There is never a "month across all regions" row here; that would need `CUBE` or an explicit grouping set.

### CUBE: every combination

```sql
SELECT region, channel, SUM(revenue) AS revenue
FROM monthly_sales
WHERE sales_month = '2025-03'
GROUP BY CUBE (region, channel)
ORDER BY GROUPING(region), region, GROUPING(channel), channel;
```

| region | channel | revenue |
|---|---|---|
| EU | app | 400.00 |
| EU | web | 1300.00 |
| EU | NULL | 1700.00 |
| US | app | 1000.00 |
| US | web | 2300.00 |
| US | NULL | 3300.00 |
| NULL | app | 1400.00 |
| NULL | web | 3600.00 |
| NULL | NULL | 5000.00 |

### Engine support

| Engine | `GROUPING SETS` | `ROLLUP` | `CUBE` |
|---|---|---|---|
| PostgreSQL, SQL Server, Oracle, Snowflake, DuckDB, Databricks | Yes | Yes | Yes |
| MySQL 8 | No | `WITH ROLLUP` or `ROLLUP (...)`, with `GROUPING()` | No |

MySQL documents `CUBE` and `GROUPING SETS` only for its HeatWave engine; in standard MySQL emulate them with `UNION ALL` of separate `GROUP BY` queries. Check BigQuery's current documentation before relying on these clauses there.

### Pitfalls

- Choosing the wrong column order in `ROLLUP`.
- `CUBE` over many columns producing far more rows (2^n groupings) than anyone reads.
- Mixing `ROLLUP` with `ORDER BY` that interleaves subtotal rows unpredictably; sort by `GROUPING()` first, as above.
- Materialising all levels in one fact table and then double counting when a dashboard sums across them.

### In interviews

Expect to explain the difference: `ROLLUP` follows a hierarchy (n + 1 levels), `CUBE` gives every combination (2^n), and `GROUPING SETS` lets you list exactly the levels you want. Mention `GROUPING()`, the MySQL limitation and the `UNION ALL` fallback.

## Practice questions

<details><summary>Pivot an orders table into one row per customer with columns delivered_count, cancelled_count and total_amount. Make it work in any engine.</summary>

```
SELECT customer_id,
       COUNT(CASE WHEN status = 'delivered' THEN 1 END) AS delivered_count,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_count,
       SUM(amount) AS total_amount
FROM orders
GROUP BY customer_id;
```

Conditional aggregation is the portable pivot, and it allows extra measures such as `total_amount` in the same pass.

</details>

<details><summary>A PIVOT query in Snowflake returns more rows than expected, one per region and channel instead of one per region. Why?</summary>

Every input column that is neither the pivot column nor the aggregated value becomes an implicit grouping column. The source still contained `channel`. Select only the needed columns in a subquery or CTE before applying `PIVOT`.

</details>

<details><summary>A wide table has columns q1, q2, q3 and q4. Turn it into one row per quarter, keeping NULL quarters, in PostgreSQL and in SQL Server.</summary>

PostgreSQL: `SELECT t.id, v.quarter, v.value FROM t CROSS JOIN LATERAL (VALUES ('q1', t.q1), ('q2', t.q2), ('q3', t.q3), ('q4', t.q4)) AS v(quarter, value);`
SQL Server: the same with `CROSS APPLY (VALUES ...)`. SQL Server's `UNPIVOT` operator would drop the `NULL` quarters.

</details>

<details><summary>How do you pivot when new category values keep appearing?</summary>

Use an engine that discovers the values (DuckDB's `PIVOT` without `IN`, Snowflake's `IN (ANY)`), or generate the SQL from `SELECT DISTINCT category` and execute it, quoting values and identifiers safely. Better still for stored data, keep the table long, or aggregate into a map/JSON column, and let the reporting tool pivot, so the schema does not change every time a value appears.

</details>

<details><summary>What rows does GROUP BY ROLLUP (year, month, day) produce, and how is it different from CUBE (year, month, day)?</summary>

`ROLLUP` gives four levels: (year, month, day), (year, month), (year) and the grand total. `CUBE` gives all 2^3 = 8 combinations, including ones like (month, day) across all years and (day) alone, most of which make no sense for a date hierarchy.

</details>

<details><summary>In a ROLLUP result, how do you distinguish a subtotal row from a row where the data itself has a NULL region?</summary>

Use `GROUPING(region)`: it is 1 on rows where region was rolled up (subtotal or total) and 0 where region is a real grouping value, including a genuine `NULL`. Label with `CASE WHEN GROUPING(region) = 1 THEN 'All regions' ELSE region END`, not `COALESCE`.

</details>

## Key takeaways

- Conditional aggregation (`SUM(CASE ...)` or `FILTER`) is the portable pivot; `PIVOT` operators in DuckDB, Snowflake, SQL Server and others are shorthands with an implicit-grouping trap.
- Unpivot with `LATERAL (VALUES ...)` or `UNION ALL` anywhere, or the `UNPIVOT` operator, which drops `NULL`s unless told otherwise.
- Dynamic pivots need engine support or generated SQL with safe quoting; storing data long avoids the problem.
- `GROUPING SETS` computes several groupings in one scan; `ROLLUP` follows a hierarchy and `CUBE` covers every combination.
- Use `GROUPING()` to label subtotal rows, and never sum across levels.
- MySQL supports only `ROLLUP`; emulate the rest with `UNION ALL`.

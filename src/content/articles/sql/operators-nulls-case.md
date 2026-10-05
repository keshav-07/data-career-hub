---
title: "SQL Operators, NULL Handling and CASE Expressions"
description: "Write correct SQL filters: comparison and logical operators, IN, BETWEEN and LIKE, three-valued NULL logic with COALESCE and NULLIF, and CASE WHEN expressions."
technology: ["sql"]
topic: ["operators", "nulls", "case-expressions", "filtering"]
difficulty: "Beginner"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Combine comparison and logical operators with correct precedence"
  - "Use IN, BETWEEN and LIKE, and avoid the NOT IN and BETWEEN-with-timestamps traps"
  - "Reason about NULL with three-valued logic and handle it with IS NULL, COALESCE and NULLIF"
  - "Write simple and searched CASE expressions and know how they evaluate"
prerequisites: ["articles:sql/sql-fundamentals"]
related: ["articles:sql/aggregations-group-by-having", "cheat-sheets:sql-data-engineering"]
previous: "articles:sql/sql-fundamentals"
sources:
  - { label: "PostgreSQL documentation: Comparison functions and operators", url: "https://www.postgresql.org/docs/16/functions-comparison.html" }
  - { label: "PostgreSQL documentation: Pattern matching", url: "https://www.postgresql.org/docs/16/functions-matching.html" }
  - { label: "PostgreSQL documentation: Conditional expressions", url: "https://www.postgresql.org/docs/16/functions-conditional.html" }
  - { label: "SQL Server documentation: IS [NOT] DISTINCT FROM", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/is-distinct-from-transact-sql" }
versionContext: "Examples run on PostgreSQL 16 (psql prints booleans as t and f). Function names for MySQL, SQL Server, Snowflake and BigQuery are given for comparison and were not executed."
---

Most wrong numbers in a pipeline do not come from exotic features. They come from a filter that quietly drops rows: a `NOT IN` against a list containing `NULL`, a `BETWEEN` that misses the last day, or a `<>` that never matches missing values. This lesson covers the operators you use in `WHERE`, how `NULL` really behaves, and `CASE`, the expression that turns business rules into SQL.

## Sample data

A product catalogue for the same online shop used across the course, with some deliberately missing values.

```sql
CREATE TABLE products (
  product_id   INT PRIMARY KEY,
  sku          TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category     TEXT NOT NULL,
  list_price   NUMERIC(10, 2),          -- NULL: price not set yet
  discount_pct NUMERIC(5, 2),           -- NULL: no discount configured
  stock_qty    INT,                     -- NULL: stock count unknown
  is_active    BOOLEAN
);

INSERT INTO products VALUES
  (1, 'KB-100', 'Mechanical Keyboard',   'electronics',  89.00,   10,   25, true),
  (2, 'MS-200', 'Wireless Mouse',        'electronics',  25.00, NULL,    0, true),
  (3, 'MN-270', '27in Monitor',          'electronics', 249.00,   15,    8, true),
  (4, 'DK-001', 'Standing Desk',         'furniture',   399.00, NULL,    3, true),
  (5, 'CH-010', 'Office Chair',          'furniture',   179.00,    5, NULL, false),
  (6, 'NB-A5',  'A5 Notebook',           'stationery',    4.50,    0,  500, true),
  (7, 'PN-50',  'Gel Pens 50% Off Pack', 'stationery',    6.00,   50, NULL, NULL),
  (8, 'CB-USB', 'USB-C Cable',           'electronics',  NULL,  NULL,  120, true);
```

## Comparison and logical operators

Comparison operators compare two values and return a boolean. Logical operators combine those booleans. Together they make up almost every `WHERE` clause.

| Operator | Meaning | Notes |
|---|---|---|
| `=` | equal | Single `=`, not `==` |
| `<>` or `!=` | not equal | `<>` is the standard form; `!=` works in every major engine |
| `<`, `>`, `<=`, `>=` | ordering | Work on numbers, dates and text (text uses the collation) |
| `AND`, `OR`, `NOT` | logic | Precedence: `NOT` first, then `AND`, then `OR` |
| `IS [NOT] DISTINCT FROM` | null-safe equality | Treats two `NULL`s as equal; MySQL spells it `<=>` |

```sql
SELECT product_id, product_name, category, list_price
FROM products
WHERE list_price >= 50
  AND category <> 'furniture'
  AND is_active;
```

| product_id | product_name | category | list_price |
|---|---|---|---|
| 1 | Mechanical Keyboard | electronics | 89.00 |
| 3 | 27in Monitor | electronics | 249.00 |

A boolean column can be used directly as a condition (`AND is_active`); `= true` is redundant. SQL Server has no boolean column type: it uses `BIT`, so you write `is_active = 1` there.

### Three-valued logic

SQL comparisons do not return just true or false. When either side is `NULL`, the result is **unknown** (itself shown as `NULL`). `WHERE` keeps only rows where the condition is **true**, so unknown rows disappear, and `NOT` cannot rescue them because `NOT unknown` is still unknown.

```sql
SELECT product_id,
       stock_qty,
       stock_qty > 0         AS in_stock,
       NOT (stock_qty > 0)   AS not_in_stock
FROM products
ORDER BY product_id;
```

| product_id | stock_qty | in_stock | not_in_stock |
|---|---|---|---|
| 1 | 25 | t | f |
| 2 | 0 | f | t |
| 3 | 8 | t | f |
| 4 | 3 | t | f |
| 5 | NULL | NULL | NULL |
| 6 | 500 | t | f |
| 7 | NULL | NULL | NULL |
| 8 | 120 | t | f |

Products 5 and 7 are returned neither by `WHERE stock_qty > 0` nor by `WHERE NOT (stock_qty > 0)`. The two filters together cover six rows, not eight. That is the most important fact about `NULL` in SQL.

The logic tables, with U for unknown:

| A | B | A AND B | A OR B |
|---|---|---|---|
| true | U | U | true |
| false | U | false | U |
| U | U | U | U |

`false AND unknown` is false and `true OR unknown` is true, because the answer does not depend on the unknown side.

### Null-safe comparison

`discount_pct <> 10` silently skips products with no discount. If "different from 10, including not set" is what you mean, use `IS DISTINCT FROM`:

```sql
SELECT product_id, discount_pct
FROM products
WHERE discount_pct IS DISTINCT FROM 10
ORDER BY product_id;
```

| product_id | discount_pct |
|---|---|
| 2 | NULL |
| 3 | 15.00 |
| 4 | NULL |
| 5 | 5.00 |
| 6 | 0.00 |
| 7 | 50.00 |
| 8 | NULL |

`IS DISTINCT FROM` works in PostgreSQL, Snowflake, BigQuery, DuckDB and SQL Server 2022 or later. MySQL uses `NOT (a <=> b)`. It is especially useful in change detection, where you compare an incoming row with the stored one column by column and a change from `NULL` to a value must count as a change.

### Pitfalls

- Mixing `AND` and `OR` without brackets. `WHERE category = 'furniture' OR category = 'stationery' AND is_active` means `furniture OR (stationery AND active)`.
- Comparing with `= NULL` or `<> NULL`: always unknown, so no rows.
- Assuming a filter and its negation partition the table. They do not when the column is nullable.
- Comparing values of different types (`'10' = 10`). PostgreSQL resolves this by type rules; MySQL converts strings to numbers, so `'10abc' = 10` can be true there with a warning. Cast explicitly.

### In interviews

Expect "what does `NULL = NULL` return?" (unknown, so the row is not returned) and "why does this query lose rows?" A strong answer explains three-valued logic in one sentence and fixes the query with `IS NULL`, `COALESCE` or `IS DISTINCT FROM`, depending on the intended meaning.

## IN, BETWEEN and LIKE

These three operators are shorthands that make filters shorter and clearer. Each has one trap worth knowing.

### IN and NOT IN

`x IN (a, b, c)` means `x = a OR x = b OR x = c`. The list can be literal values or a subquery.

```sql
SELECT product_id, product_name, category
FROM products
WHERE category IN ('furniture', 'stationery')
ORDER BY product_id;
```

| product_id | product_name | category |
|---|---|---|
| 4 | Standing Desk | furniture |
| 5 | Office Chair | furniture |
| 6 | A5 Notebook | stationery |
| 7 | Gel Pens 50% Off Pack | stationery |

`NOT IN` is where it goes wrong. `x NOT IN (a, b, NULL)` means `x <> a AND x <> b AND x <> NULL`, and the last comparison is always unknown, so the whole condition is never true:

```sql
CREATE TABLE discontinued (sku TEXT);
INSERT INTO discontinued VALUES ('CH-010'), (NULL);

SELECT COUNT(*) AS still_sold
FROM products
WHERE sku NOT IN (SELECT sku FROM discontinued);
```

| still_sold |
|---|
| 0 |

One stray `NULL` in the subquery empties the result. Use `NOT EXISTS`, which only asks whether a matching row exists:

```sql
SELECT COUNT(*) AS still_sold
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM discontinued d WHERE d.sku = p.sku);
```

| still_sold |
|---|
| 7 |

`IN` with a `NULL` in the list is harmless: matches are still found, the `NULL` just never matches anything. The semi-joins and anti-joins lesson later in the course covers these patterns in depth.

### BETWEEN

`x BETWEEN low AND high` means `x >= low AND x <= high`. **Both ends are included.**

```sql
SELECT product_id, list_price
FROM products
WHERE list_price BETWEEN 25 AND 179
ORDER BY list_price;
```

| product_id | list_price |
|---|---|
| 2 | 25.00 |
| 1 | 89.00 |
| 5 | 179.00 |

The trap is timestamps. `BETWEEN DATE '2025-06-01' AND DATE '2025-06-30'` compares a timestamp with midnight on 30 June, so an event at 14:00 on the 30th falls outside:

```sql
SELECT TIMESTAMP '2025-06-30 14:00:00'
       BETWEEN DATE '2025-06-01' AND DATE '2025-06-30' AS included;
```

| included |
|---|
| f |

For time ranges, use a **half-open interval**: `ts >= DATE '2025-06-01' AND ts < DATE '2025-07-01'`. It never misses the last day, never double-counts a boundary when you stack months together, and works the same for dates and timestamps. Also note that `BETWEEN 179 AND 25` (low and high reversed) returns nothing; PostgreSQL offers `BETWEEN SYMMETRIC` if you cannot control the order.

### LIKE and ILIKE

`LIKE` matches a text pattern. `%` matches any run of characters (including none) and `_` matches exactly one character.

```sql
SELECT sku, product_name
FROM products
WHERE product_name LIKE '%Desk%'
   OR sku LIKE 'M_-%'
ORDER BY sku;
```

| sku | product_name |
|---|---|
| DK-001 | Standing Desk |
| MN-270 | 27in Monitor |
| MS-200 | Wireless Mouse |

How case is handled depends on the engine:

| Engine | `LIKE` case-sensitive? | Case-insensitive option |
|---|---|---|
| PostgreSQL | Yes | `ILIKE`, or `LOWER(col) LIKE ...` |
| Snowflake | Yes | `ILIKE` |
| BigQuery | Yes | `LOWER(col) LIKE ...` |
| MySQL | Usually no (default collations are case-insensitive) | Already insensitive; use a binary collation for sensitive |
| SQL Server | Depends on collation; default installs are usually case-insensitive | `COLLATE` a case-sensitive collation for sensitive |

```sql
SELECT sku, product_name
FROM products
WHERE product_name ILIKE '%usb%';
```

| sku | product_name |
|---|---|
| CB-USB | USB-C Cable |

To match a literal `%` or `_`, escape it. The `ESCAPE` clause makes the escape character explicit and portable:

```sql
SELECT product_name
FROM products
WHERE product_name LIKE '%50!%%' ESCAPE '!';
```

| product_name |
|---|
| Gel Pens 50% Off Pack |

For anything more complex than `%` and `_`, use regular expressions (`~` in PostgreSQL, `REGEXP_LIKE` in Snowflake and MySQL, `REGEXP_CONTAINS` in BigQuery).

### Pitfalls

- `NOT IN` with a nullable subquery returns nothing. Prefer `NOT EXISTS`.
- `BETWEEN` on timestamps misses most of the last day. Prefer half-open ranges.
- A leading wildcard (`LIKE '%desk'`) cannot use an ordinary B-tree index, so it scans the whole table. A trailing wildcard (`LIKE 'DK-%'`) can, given a suitable index.
- `_` in a pattern is a wildcard, so `LIKE 'NB_A5'` also matches `NBXA5`. Escape it when you mean an underscore.

### In interviews

The `NOT IN` with `NULL` question is one of the most common SQL trick questions. Explain why it returns nothing (the `x <> NULL` term) and give `NOT EXISTS` as the fix. For `BETWEEN`, mention inclusivity and the half-open range for timestamps.

## Handling NULL: IS NULL, COALESCE and NULLIF

`NULL` means "no value": unknown, missing or not applicable. It is not zero and not an empty string. Any comparison with it is unknown, and most arithmetic and string operations involving it return `NULL`.

### Testing for NULL

`IS NULL` and `IS NOT NULL` are the only correct tests:

```sql
SELECT product_id, product_name
FROM products
WHERE list_price IS NULL OR stock_qty IS NULL
ORDER BY product_id;
```

| product_id | product_name |
|---|---|
| 5 | Office Chair |
| 7 | Gel Pens 50% Off Pack |
| 8 | USB-C Cable |

### How NULL spreads through expressions

```sql
SELECT 5 + NULL            AS add_null,
       'SKU-' || NULL      AS concat_operator,
       CONCAT('SKU-', NULL) AS concat_function;
```

| add_null | concat_operator | concat_function |
|---|---|---|
| NULL | NULL | SKU- |

In PostgreSQL the `||` operator returns `NULL` if either side is `NULL`, but `CONCAT()` skips `NULL` arguments. SQL Server's `CONCAT` also skips them, while MySQL's `CONCAT` returns `NULL` if any argument is `NULL`. Be explicit with `COALESCE` when building keys or labels from nullable columns.

### COALESCE: the first non-NULL value

`COALESCE(a, b, c)` returns the first argument that is not `NULL`. Use it to supply defaults:

```sql
SELECT product_id,
       list_price,
       discount_pct,
       ROUND(list_price * (1 - COALESCE(discount_pct, 0) / 100), 2) AS sale_price
FROM products
ORDER BY product_id;
```

| product_id | list_price | discount_pct | sale_price |
|---|---|---|---|
| 1 | 89.00 | 10.00 | 80.10 |
| 2 | 25.00 | NULL | 25.00 |
| 3 | 249.00 | 15.00 | 211.65 |
| 4 | 399.00 | NULL | 399.00 |
| 5 | 179.00 | 5.00 | 170.05 |
| 6 | 4.50 | 0.00 | 4.50 |
| 7 | 6.00 | 50.00 | 3.00 |
| 8 | NULL | NULL | NULL |

Treating a missing discount as 0 is a sensible business rule. Treating a missing price as 0 would not be: product 8 correctly stays `NULL`.

Equivalent functions in other engines take exactly two arguments: `IFNULL` (MySQL, BigQuery, Snowflake), `ISNULL` (SQL Server) and `NVL` (Oracle, Snowflake). `COALESCE` is standard and works everywhere, so prefer it. One difference worth knowing: SQL Server's `ISNULL` returns the type of its first argument and can truncate the fallback, while `COALESCE` uses normal type precedence.

### NULLIF: turn a value into NULL

`NULLIF(a, b)` returns `NULL` when `a = b`, otherwise `a`. Its main use is avoiding division by zero:

```sql
SELECT product_id,
       stock_qty,
       ROUND(100.0 / NULLIF(stock_qty, 0), 2) AS pct_of_100_units
FROM products
WHERE product_id IN (1, 2, 5);
```

| product_id | stock_qty | pct_of_100_units |
|---|---|---|
| 1 | 25 | 4.00 |
| 2 | 0 | NULL |
| 5 | NULL | NULL |

Without `NULLIF`, product 2 raises a division-by-zero error and the whole query fails. `NULLIF(TRIM(col), '')` is another common use: it turns empty strings from CSV files into proper `NULL`s.

### Pitfalls

- Using `COALESCE(x, 0)` everywhere. Replacing unknowns with zero changes averages and can hide data-quality problems. Decide per column.
- Forgetting that aggregates skip `NULL`s (`AVG` divides by the non-null count). This is covered in the [aggregations lesson](/sql/aggregations-group-by-having/).
- `NULL` join keys never match, so rows with missing keys vanish from inner joins.
- Treating empty string and `NULL` as the same. In PostgreSQL, Snowflake and most engines they are different values (Oracle is the exception, treating `''` as `NULL`).

### In interviews

Be ready to explain the difference between `COUNT(*)` and `COUNT(col)`, `COALESCE` versus `ISNULL`, and how `NULLIF` prevents division by zero. Saying when *not* to default a `NULL` to zero shows good judgement.

## CASE expressions

`CASE` is SQL's if-then-else. It returns a value, so you can use it anywhere an expression is allowed: in `SELECT`, `WHERE`, `ORDER BY`, `GROUP BY` and inside aggregates.

### Searched and simple CASE

The **searched** form tests a list of conditions:

```sql
SELECT product_id,
       list_price,
       CASE
         WHEN list_price IS NULL THEN 'unpriced'
         WHEN list_price < 20    THEN 'budget'
         WHEN list_price < 200   THEN 'mid'
         ELSE 'premium'
       END AS price_band
FROM products
ORDER BY product_id;
```

| product_id | list_price | price_band |
|---|---|---|
| 1 | 89.00 | mid |
| 2 | 25.00 | mid |
| 3 | 249.00 | premium |
| 4 | 399.00 | premium |
| 5 | 179.00 | mid |
| 6 | 4.50 | budget |
| 7 | 6.00 | budget |
| 8 | NULL | unpriced |

The **simple** form compares one expression with a list of values:

```sql
SELECT product_id,
       CASE category
         WHEN 'electronics' THEN 'Tech'
         WHEN 'furniture'   THEN 'Home office'
       END AS department
FROM products
WHERE product_id IN (1, 4, 6);
```

| product_id | department |
|---|---|
| 1 | Tech |
| 4 | Home office |
| 6 | NULL |

### How it works

- Branches are checked **top to bottom and the first true one wins**. That is why the bands above only need upper bounds: a price of 25 fails `< 20` and then matches `< 200`. Put the most specific conditions first.
- With no `ELSE`, unmatched rows get `NULL` (product 6 above). Write an explicit `ELSE` so the gap is a decision, not an accident.
- A simple `CASE x WHEN NULL` never matches, because it uses `=`. Test for `NULL` with the searched form: `WHEN x IS NULL`.
- All branches must return compatible types. PostgreSQL resolves the result type from the branches (here integer, from the `ELSE`) and then fails to convert the text:

<!-- expect-error -->
```sql
-- ERROR: invalid input syntax for type integer: "in stock"
SELECT CASE WHEN stock_qty > 0 THEN 'in stock' ELSE 0 END
FROM products;
```

### CASE in ORDER BY and WHERE

A `CASE` in `ORDER BY` gives a custom sort order, for example a business order for categories:

```sql
SELECT product_name, category
FROM products
ORDER BY CASE category
           WHEN 'furniture'   THEN 1
           WHEN 'electronics' THEN 2
           ELSE 3
         END,
         product_name;
```

| product_name | category |
|---|---|
| Office Chair | furniture |
| Standing Desk | furniture |
| 27in Monitor | electronics |
| Mechanical Keyboard | electronics |
| USB-C Cable | electronics |
| Wireless Mouse | electronics |
| A5 Notebook | stationery |
| Gel Pens 50% Off Pack | stationery |

In `WHERE`, a `CASE` is legal but usually a sign that plain `AND`/`OR` would be clearer. Its most powerful use is inside aggregates (`SUM(CASE WHEN ... THEN amount ELSE 0 END)`), which is the conditional aggregation pattern in the [aggregations lesson](/sql/aggregations-group-by-having/).

### Dialect shorthands

| Engine | Shorthand | Equivalent `CASE` |
|---|---|---|
| SQL Server | `IIF(cond, a, b)` | `CASE WHEN cond THEN a ELSE b END` |
| MySQL | `IF(cond, a, b)` | same |
| BigQuery | `IF(cond, a, b)` | same |
| Snowflake | `IFF(cond, a, b)`, `DECODE(x, v1, r1, ..., default)` | same; note `DECODE` treats two `NULL`s as equal |

`CASE` is standard and works in all of them; the shorthands save typing but not much else.

### Pitfalls

- Overlapping conditions in the wrong order, so a broad branch catches rows meant for a later one.
- A missing `ELSE` producing unexpected `NULL`s that then disappear from filters.
- Relying on `CASE` to stop an error. Branches are usually evaluated lazily, but PostgreSQL documents that constant sub-expressions may be simplified at planning time, so `CASE WHEN x = 0 THEN 0 ELSE 1/0 END` can still fail. Guard divisions with `NULLIF` instead.

### In interviews

`CASE` appears in bucketing questions ("classify customers by spend"), in custom sorting, and above all in conditional aggregation and pivots. State that the first matching branch wins and that a missing `ELSE` means `NULL`.

## Practice questions

<details><summary>A table has 100 rows. WHERE score > 50 returns 40 rows and WHERE score <= 50 returns 45 rows. Where are the other 15?</summary>

They have `score IS NULL`. Comparisons with `NULL` are unknown, so those rows fail both filters. To include them, add `OR score IS NULL` to whichever side they belong to, or replace the `NULL` with a deliberate default using `COALESCE`.

</details>

<details><summary>Why can SELECT * FROM a WHERE id NOT IN (SELECT id FROM b) return no rows even though a has ids missing from b?</summary>

If `b.id` contains a `NULL`, `id NOT IN (..., NULL)` expands to `... AND id <> NULL`, which is unknown for every row, so nothing passes. Use `NOT EXISTS (SELECT 1 FROM b WHERE b.id = a.id)`, a `LEFT JOIN ... WHERE b.id IS NULL`, or filter `NULL`s out of the subquery.

</details>

<details><summary>You need all orders placed in March 2025 from a column called created_at (a timestamp). Write the filter.</summary>

`WHERE created_at >= TIMESTAMP '2025-03-01' AND created_at < TIMESTAMP '2025-04-01'`. A half-open range includes all of 31 March, works for dates and timestamps alike, and lets the engine use an index or partition pruning, unlike wrapping the column in a function.

</details>

<details><summary>What is the difference between COALESCE and NULLIF? Give a typical use of each.</summary>

`COALESCE(a, b, ...)` returns the first non-`NULL` argument: use it to supply a default, such as `COALESCE(discount_pct, 0)`. `NULLIF(a, b)` returns `NULL` when `a = b` and `a` otherwise: use it to avoid division by zero, `revenue / NULLIF(orders, 0)`, or to turn empty strings into `NULL`.

</details>

<details><summary>How do you find rows where a column changed between two versions of a record, when either value may be NULL?</summary>

Use `old.col IS DISTINCT FROM new.col`. Plain `old.col <> new.col` is unknown when either side is `NULL`, so a change from `NULL` to a value (or back) would be missed. In MySQL write `NOT (old.col <=> new.col)`; in engines without either, `COALESCE` both sides to a sentinel value that cannot occur.

</details>

<details><summary>What does this return for a price of 150: CASE WHEN price > 100 THEN 'high' WHEN price > 140 THEN 'very high' END?</summary>

`'high'`. `CASE` evaluates branches in order and returns the first true one, so the `> 140` branch is never reached for any price above 100. Put the stricter condition first.

</details>

## Key takeaways

- SQL uses three-valued logic: comparisons with `NULL` are unknown, and `WHERE` keeps only true rows, so a filter and its negation can both skip `NULL`s.
- Test for missing values with `IS NULL`; compare nullable columns with `IS DISTINCT FROM`.
- `NOT IN` against a list or subquery containing `NULL` returns nothing; use `NOT EXISTS`.
- `BETWEEN` includes both ends; use half-open ranges (`>= start AND < end`) for timestamps.
- `LIKE` case-sensitivity depends on the engine and collation; `ILIKE` exists in PostgreSQL and Snowflake.
- `COALESCE` supplies defaults and `NULLIF` prevents division by zero; default a `NULL` only when the business meaning is clear.
- `CASE` returns the first matching branch, and `NULL` when nothing matches and there is no `ELSE`.

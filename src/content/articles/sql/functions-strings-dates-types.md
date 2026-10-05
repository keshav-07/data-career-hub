---
title: "SQL Functions: Strings, Dates, Type Casting and Arithmetic"
seoTitle: "SQL Functions: Strings, Dates, CAST, Arithmetic"
description: "Clean and convert data in SQL: string functions, date arithmetic, CAST and safe casting, integer division and rounding, with names for each major SQL dialect."
technology: ["sql"]
topic: ["functions", "strings", "dates", "casting", "data-cleaning"]
difficulty: "Beginner"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Clean text with TRIM, UPPER/LOWER, REPLACE, SUBSTRING and SPLIT_PART, and combine it safely with CONCAT"
  - "Extract parts of dates, add intervals and compute differences between dates and timestamps"
  - "Convert between types with CAST and handle bad input without failing the whole load"
  - "Avoid integer division and rounding surprises in metrics"
  - "Translate the common functions between PostgreSQL, MySQL, SQL Server, Snowflake and BigQuery"
prerequisites: ["articles:sql/operators-nulls-case"]
related: ["articles:sql/sql-fundamentals", "cheat-sheets:sql-data-engineering"]
previous: "articles:sql/operators-nulls-case"
next: "articles:sql/aggregations-group-by-having"
sources:
  - { label: "PostgreSQL documentation: String functions and operators", url: "https://www.postgresql.org/docs/16/functions-string.html" }
  - { label: "PostgreSQL documentation: Date/time functions and operators", url: "https://www.postgresql.org/docs/16/functions-datetime.html" }
  - { label: "PostgreSQL documentation: Mathematical functions and operators", url: "https://www.postgresql.org/docs/16/functions-math.html" }
  - { label: "PostgreSQL documentation: System information functions (pg_input_is_valid)", url: "https://www.postgresql.org/docs/16/functions-info.html" }
  - { label: "SQL Server documentation: Date and time data types and functions", url: "https://learn.microsoft.com/en-us/sql/t-sql/functions/date-and-time-data-types-and-functions-transact-sql" }
  - { label: "BigQuery documentation: Date functions", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/date_functions" }
versionContext: "Examples run on PostgreSQL 16; the TRY_CAST example runs on DuckDB 1.5. Function names for MySQL, SQL Server, Snowflake and BigQuery are listed for comparison and were not executed."
---

Raw data rarely arrives clean. Order references come with stray spaces, names in random case, amounts as text with thousands separators, and timestamps that need turning into days and months. This lesson covers the scalar functions you use to clean and reshape values row by row, and the type and arithmetic rules that decide whether your metrics are right. Function names differ more between engines than any other part of SQL, so each section ends with a translation table.

## Sample data

A raw order extract as it might land in a staging table, before cleaning.

```sql
CREATE TABLE raw_orders (
  order_ref     TEXT,
  customer_name TEXT,
  email         TEXT,
  ordered_at    TIMESTAMP,
  shipped_at    TIMESTAMP,
  amount_text   TEXT,          -- amount as received from the source system
  quantity      INT,
  unit_price    NUMERIC(10, 2)
);

INSERT INTO raw_orders VALUES
  ('  ord-1001 ', '  asha PATEL ', 'Asha.Patel@Example.com', '2025-06-01 09:15', '2025-06-03 17:40', '120.50',   2,  60.25),
  ('ORD-1002',    'ben carter',    'ben@example.co.uk',      '2025-06-03 23:05', '2025-06-04 08:00', '35.5',     1,  35.50),
  ('ord-1003 ',   'Chen  Wei',     'chen.wei@example.sg',    '2025-06-30 14:00', NULL,               '1,200.00', 3, 400.00),
  ('ORD-1004',    'diana lopez',   NULL,                     '2025-07-01 00:30', '2025-07-06 12:00', 'n/a',      7,   2.99),
  ('ORD-1005',    'Ethan Brown',   'ethan@example.com',      '2025-12-31 22:10', '2026-01-02 09:00', '64.99',    1,  64.99);
```

## String functions: CONCAT, SUBSTRING, TRIM and friends

String functions clean, split and combine text. In pipelines they mostly do three jobs: **normalise** values so they match (trim, fix case), **extract** a part (a domain from an email, a prefix from a code) and **build** keys or labels from several columns.

### Cleaning: TRIM, UPPER, LOWER, INITCAP and REPLACE

```sql
SELECT order_ref,
       UPPER(TRIM(order_ref))                              AS clean_ref,
       INITCAP(TRIM(customer_name))                        AS clean_name,
       REGEXP_REPLACE(TRIM(customer_name), '\s+', ' ', 'g') AS single_spaced
FROM raw_orders
ORDER BY clean_ref;
```

| order_ref | clean_ref | clean_name | single_spaced |
|---|---|---|---|
|   ord-1001  | ORD-1001 | Asha Patel | asha PATEL |
| ORD-1002 | ORD-1002 | Ben Carter | ben carter |
| ord-1003  | ORD-1003 | Chen  Wei | Chen Wei |
| ORD-1004 | ORD-1004 | Diana Lopez | diana lopez |
| ORD-1005 | ORD-1005 | Ethan Brown | Ethan Brown |

- `TRIM(s)` removes leading and trailing spaces; `LTRIM` and `RTRIM` remove one side. In PostgreSQL `TRIM(BOTH 'x' FROM s)` removes other characters too. `TRIM` does not touch spaces **inside** the string, which is why "Chen  Wei" keeps its double space until the regular expression collapses it.
- `UPPER` and `LOWER` exist everywhere. `INITCAP` (title case) exists in PostgreSQL, Snowflake, Oracle and BigQuery, but not in MySQL or SQL Server. Title case is naive: it produces "Mcdonald" from "mcdonald".
- `REPLACE(s, from, to)` replaces every occurrence of a fixed substring. For patterns, use `REGEXP_REPLACE`.

### Extracting: SUBSTRING, LEFT, RIGHT, POSITION and SPLIT_PART

```sql
SELECT email,
       LOWER(SPLIT_PART(email, '@', 2))                      AS domain,
       SUBSTRING(email FROM 1 FOR POSITION('@' IN email) - 1) AS local_part,
       RIGHT(TRIM(order_ref), 4)                             AS ref_number,
       LENGTH(TRIM(order_ref))                               AS ref_length
FROM raw_orders
ORDER BY order_ref;
```

| email | domain | local_part | ref_number | ref_length |
|---|---|---|---|---|
| Asha.Patel@Example.com | example.com | Asha.Patel | 1001 | 8 |
| ben@example.co.uk | example.co.uk | ben | 1002 | 8 |
| NULL | NULL | NULL | 1004 | 8 |
| ethan@example.com | example.com | ethan | 1005 | 8 |
| chen.wei@example.sg | example.sg | chen.wei | 1003 | 8 |

The odd row order is deliberate: the query sorts on the raw `order_ref`, so leading spaces and lower case decide the order. This database uses the byte-wise `C` collation, where a space sorts before letters and upper case before lower case, which puts `'ord-1003 '` last. A database with a linguistic collation such as `en_US` orders the same values differently. Always sort and join on the **cleaned** value.

- SQL positions start at **1**, not 0. `SUBSTRING(s FROM 2 FOR 3)` (standard) and `SUBSTRING(s, 2, 3)` (PostgreSQL, MySQL, SQL Server) both return three characters starting at the second.
- `POSITION('@' IN s)` returns the 1-based position, or 0 if not found. A missing `@` makes `POSITION(...) - 1` equal to -1, so guard it with a `CASE` in real code.
- `SPLIT_PART(s, delimiter, n)` returns the *n*th piece. It is PostgreSQL and Snowflake syntax; BigQuery returns an array from `SPLIT(s, '@')`, and SQL Server needs `STRING_SPLIT` or `CHARINDEX` arithmetic.
- `LENGTH` counts characters in PostgreSQL. SQL Server's `LEN` ignores trailing spaces, and MySQL's `LENGTH` counts **bytes** (use `CHAR_LENGTH` for characters), which differ for accented or non-Latin text.

### Combining: CONCAT, || and CONCAT_WS

```sql
SELECT CONCAT(UPPER(TRIM(order_ref)), '-', quantity)  AS line_key,
       TRIM(order_ref) || ' / ' || email              AS with_operator,
       CONCAT_WS(' | ', TRIM(customer_name), email)   AS with_separator
FROM raw_orders
WHERE TRIM(order_ref) IN ('ORD-1002', 'ORD-1004');
```

| line_key | with_operator | with_separator |
|---|---|---|
| ORD-1002-1 | ORD-1002 / ben@example.co.uk | ben carter \| ben@example.co.uk |
| ORD-1004-7 | NULL | diana lopez |

The `||` operator returns `NULL` when any part is `NULL`, while PostgreSQL's `CONCAT` and `CONCAT_WS` skip `NULL` arguments. `CONCAT` also converts numbers to text for you. When you build a **surrogate or hash key** from several columns, wrap each nullable column in `COALESCE` and use a separator: without a separator, `('ab', 'c')` and `('a', 'bc')` produce the same key.

### Dialect translation

| Task | PostgreSQL | MySQL | SQL Server | Snowflake | BigQuery |
|---|---|---|---|---|---|
| Join strings | `\|\|`, `CONCAT` | `CONCAT` (`\|\|` means OR by default) | `+`, `CONCAT` | `\|\|`, `CONCAT` | `\|\|`, `CONCAT` |
| Length in characters | `LENGTH` | `CHAR_LENGTH` | `LEN` (ignores trailing spaces) | `LENGTH` | `LENGTH` |
| Substring | `SUBSTRING`, `SUBSTR` | `SUBSTRING`, `SUBSTR` | `SUBSTRING` | `SUBSTR`, `SUBSTRING` | `SUBSTR` |
| Find position | `POSITION`, `STRPOS` | `LOCATE`, `INSTR` | `CHARINDEX` | `POSITION`, `CHARINDEX` | `STRPOS`, `INSTR` |
| Split and take part | `SPLIT_PART` | `SUBSTRING_INDEX` | `STRING_SPLIT` / `PARSENAME` | `SPLIT_PART` | `SPLIT(...)[OFFSET(n)]` |
| Aggregate strings | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` | `LISTAGG` | `STRING_AGG` |

`NULL` behaviour also differs: MySQL's `CONCAT` returns `NULL` if any argument is `NULL`, whereas PostgreSQL and SQL Server skip `NULL` arguments.

### Pitfalls

- Joining on uncleaned text: `'ORD-1001'` and `'  ord-1001 '` never match. Normalise both sides in staging, once.
- Applying functions to a column in `WHERE` or `JOIN` (`WHERE UPPER(email) = ...`) prevents ordinary index use and partition pruning. Store a cleaned column instead.
- Counting bytes instead of characters with MySQL `LENGTH`.
- Building keys by concatenating nullable columns without `COALESCE` and a separator.

### In interviews

String questions are usually data-cleaning tasks: "extract the domain from an email", "standardise these names", "find codes that do not match a pattern". Name the function you would use in the interviewer's dialect, handle `NULL` and the "delimiter not found" case, and say that you would clean once in a staging layer.

## Date and time functions

Dates drive almost every metric: daily revenue, time to ship, monthly active users. The basic toolkit is getting the current date, extracting parts, adding intervals, computing differences and truncating to a period. Truncation and calendars get a full treatment in the time-series lesson later in this course; this section covers the building blocks.

### Types first

| Type | Holds | Example |
|---|---|---|
| `DATE` | A calendar day | `2025-06-01` |
| `TIMESTAMP` (without time zone) | Date and time, no zone | `2025-06-01 09:15:00` |
| `TIMESTAMPTZ` / `TIMESTAMP WITH TIME ZONE` | An absolute instant, shown in the session time zone | `2025-06-01 09:15:00+00` |
| `INTERVAL` | A duration | `3 days 08:25:00` |

Store event times as an absolute instant (UTC or a time-zone-aware type) and convert to local time only for reporting. "Which day did this order happen on?" depends on the time zone: order 1002 at 23:05 UTC is already 4 June in India.

### Extracting parts and formatting

```sql
SELECT TRIM(order_ref)                     AS ref,
       ordered_at,
       CAST(ordered_at AS DATE)            AS order_day,
       EXTRACT(YEAR FROM ordered_at)       AS yr,
       EXTRACT(MONTH FROM ordered_at)      AS mon,
       EXTRACT(ISODOW FROM ordered_at)     AS iso_weekday,
       TO_CHAR(ordered_at, 'Dy DD Mon')    AS label,
       DATE_TRUNC('month', ordered_at)     AS month_start
FROM raw_orders
ORDER BY ordered_at;
```

| ref | ordered_at | order_day | yr | mon | iso_weekday | label | month_start |
|---|---|---|---|---|---|---|---|
| ord-1001 | 2025-06-01 09:15:00 | 2025-06-01 | 2025 | 6 | 7 | Sun 01 Jun | 2025-06-01 00:00:00 |
| ORD-1002 | 2025-06-03 23:05:00 | 2025-06-03 | 2025 | 6 | 2 | Tue 03 Jun | 2025-06-01 00:00:00 |
| ord-1003 | 2025-06-30 14:00:00 | 2025-06-30 | 2025 | 6 | 1 | Mon 30 Jun | 2025-06-01 00:00:00 |
| ORD-1004 | 2025-07-01 00:30:00 | 2025-07-01 | 2025 | 7 | 2 | Tue 01 Jul | 2025-07-01 00:00:00 |
| ORD-1005 | 2025-12-31 22:10:00 | 2025-12-31 | 2025 | 12 | 3 | Wed 31 Dec | 2025-12-01 00:00:00 |

`ISODOW` numbers Monday as 1 and Sunday as 7. Plain `DOW` in PostgreSQL numbers Sunday as 0, and other engines have their own conventions (SQL Server's `DATEPART(weekday, ...)` even depends on the `DATEFIRST` setting). Check before you hard-code day numbers.

### Adding intervals and computing differences

```sql
SELECT TRIM(order_ref)                                  AS ref,
       ordered_at + INTERVAL '30 days'                  AS return_deadline,
       shipped_at - ordered_at                          AS time_to_ship,
       CAST(shipped_at AS DATE) - CAST(ordered_at AS DATE) AS calendar_days,
       ROUND(EXTRACT(EPOCH FROM shipped_at - ordered_at) / 3600, 1) AS hours_to_ship
FROM raw_orders
ORDER BY ordered_at;
```

| ref | return_deadline | time_to_ship | calendar_days | hours_to_ship |
|---|---|---|---|---|
| ord-1001 | 2025-07-01 09:15:00 | 2 days 08:25:00 | 2 | 56.4 |
| ORD-1002 | 2025-07-03 23:05:00 | 08:55:00 | 1 | 8.9 |
| ord-1003 | 2025-07-30 14:00:00 | NULL | NULL | NULL |
| ORD-1004 | 2025-07-31 00:30:00 | 5 days 11:30:00 | 5 | 131.5 |
| ORD-1005 | 2026-01-30 22:10:00 | 1 day 10:50:00 | 2 | 34.8 |

Two kinds of "difference" are in this table, and they answer different questions. Order 1002 shipped 8 hours 55 minutes after it was placed, but on the next calendar day, so it counts as 1 calendar day. Order 1005 took under 35 hours but crossed two midnights. Decide which one the business means by "days to ship".

Month arithmetic clamps to the end of the month:

```sql
SELECT DATE '2025-01-31' + INTERVAL '1 month' AS one_month_later,
       DATE '2025-03-01' - DATE '2025-02-01'  AS days_in_feb;
```

| one_month_later | days_in_feb |
|---|---|
| 2025-02-28 00:00:00 | 28 |

In PostgreSQL, `date - date` returns an integer number of days, `timestamp - timestamp` returns an `INTERVAL`, and adding an interval to a date returns a timestamp.

### Dialect translation

| Task | PostgreSQL | MySQL | SQL Server | Snowflake | BigQuery |
|---|---|---|---|---|---|
| Today / now | `CURRENT_DATE`, `NOW()` | `CURDATE()`, `NOW()` | `CAST(GETDATE() AS date)`, `SYSDATETIME()` | `CURRENT_DATE`, `CURRENT_TIMESTAMP` | `CURRENT_DATE()`, `CURRENT_TIMESTAMP()` |
| Add 7 days | `d + INTERVAL '7 days'` | `DATE_ADD(d, INTERVAL 7 DAY)` | `DATEADD(day, 7, d)` | `DATEADD(day, 7, d)` | `DATE_ADD(d, INTERVAL 7 DAY)` |
| Days between | `d2 - d1` | `DATEDIFF(d2, d1)` | `DATEDIFF(day, d1, d2)` | `DATEDIFF(day, d1, d2)` | `DATE_DIFF(d2, d1, DAY)` |
| Part of a date | `EXTRACT(MONTH FROM d)` | `EXTRACT`, `MONTH(d)` | `DATEPART(month, d)`, `MONTH(d)` | `EXTRACT`, `MONTH(d)` | `EXTRACT(MONTH FROM d)` |
| Truncate to month | `DATE_TRUNC('month', d)` | `DATE_FORMAT(d, '%Y-%m-01')` | `DATETRUNC(month, d)` (2022+) | `DATE_TRUNC('MONTH', d)` | `DATE_TRUNC(d, MONTH)` |
| Format as text | `TO_CHAR(d, 'YYYY-MM')` | `DATE_FORMAT(d, '%Y-%m')` | `FORMAT(d, 'yyyy-MM')` | `TO_CHAR(d, 'YYYY-MM')` | `FORMAT_DATE('%Y-%m', d)` |

Note the argument order: MySQL's `DATEDIFF(end, start)` and BigQuery's `DATE_DIFF(end, start, part)` put the later date first, while SQL Server's and Snowflake's `DATEDIFF(part, start, end)` put it last. SQL Server and Snowflake count **boundaries crossed**, so `DATEDIFF(year, '2025-12-31', '2026-01-01')` is 1.

### Pitfalls

- `BETWEEN` on timestamps misses the last day; use half-open ranges (covered in the [previous lesson](/sql/operators-nulls-case/)).
- Wrapping the column in a function in `WHERE` (`WHERE EXTRACT(YEAR FROM ordered_at) = 2025`) blocks pruning. Filter on a range of the raw column.
- Mixing time zones: comparing a UTC timestamp with a local-time literal, or truncating to a day in UTC when the business reports in local time.
- Formatting dates as text too early. `TO_CHAR(d, 'Mon YYYY')` sorts alphabetically ("Apr" before "Jan"). Keep a real date for sorting and format at the end.

### In interviews

Expect "days between two dates", "orders in the last 30 days" and "group by month". A strong answer uses the right function for the stated dialect, mentions time zones and the boundary-counting behaviour of `DATEDIFF`, and filters with a sargable range.

## CAST and data type conversion

Every value has a type, and many bugs are type bugs: text that should be a number, a timestamp compared with a string, or an integer that silently drops decimals. `CAST(value AS type)` converts explicitly; PostgreSQL also offers the shorthand `value::type`.

### Explicit and implicit conversion

```sql
SELECT CAST('2025-06-01' AS DATE)                 AS text_to_date,
       '42'::INT + 1                               AS text_to_int,
       CAST(ordered_at AS DATE)                    AS ts_to_date,
       CAST(unit_price AS INT)                     AS numeric_to_int,
       TO_DATE('03/06/2025', 'DD/MM/YYYY')         AS parsed_uk_date
FROM raw_orders
WHERE TRIM(order_ref) = 'ORD-1004';
```

| text_to_date | text_to_int | ts_to_date | numeric_to_int | parsed_uk_date |
|---|---|---|---|---|
| 2025-06-01 | 43 | 2025-07-01 | 3 | 2025-06-03 |

- Casting a timestamp to a date drops the time.
- Casting `2.99` to an integer **rounds** in PostgreSQL (giving 3) but **truncates** in SQL Server (giving 2). If you mean "drop the decimals", say so with `TRUNC` or `FLOOR`.
- For text dates in a non-ISO format, parse with an explicit format: `TO_DATE` (PostgreSQL, Snowflake, Oracle), `STR_TO_DATE` (MySQL), `PARSE_DATE` (BigQuery) or `CONVERT` with a style number (SQL Server). Guessing between `03/06` as 3 June and 6 March is exactly the bug to avoid.
- Engines also convert **implicitly** in some comparisons. MySQL converts freely (`'10abc' = 10` can be true), PostgreSQL much less so. Write explicit casts in pipeline code so behaviour does not depend on the engine.

### When a cast fails

A plain `CAST` stops the whole query on the first bad value:

<!-- expect-error -->
```sql
-- ERROR: invalid input syntax for type numeric: "1,200.00"
SELECT CAST(amount_text AS NUMERIC(10, 2)) FROM raw_orders;
```

In a pipeline you usually want to keep the good rows and quarantine the bad ones. The tools differ by engine:

| Engine | Returns `NULL` instead of failing |
|---|---|
| SQL Server, Snowflake, DuckDB, Databricks | `TRY_CAST(x AS type)` (Snowflake also has `TRY_TO_NUMBER`, `TRY_TO_DATE`) |
| BigQuery | `SAFE_CAST(x AS type)` |
| PostgreSQL 16+ | No `TRY_CAST`; test first with `pg_input_is_valid(x, 'type')` |
| MySQL | `CAST` returns a warning and a best-effort value in non-strict contexts; validate with `REGEXP` first |

In DuckDB, `TRY_CAST` handles the bad rows directly:

<!-- engine: duckdb -->
```sql
SELECT amount_text,
       TRY_CAST(REPLACE(amount_text, ',', '') AS DECIMAL(10, 2)) AS amount
FROM (VALUES ('120.50'), ('1,200.00'), ('n/a')) AS t(amount_text);
```

| amount_text | amount |
|---|---|
| 120.50 | 120.50 |
| 1,200.00 | 1200.00 |
| n/a | NULL |

In PostgreSQL 16, combine `pg_input_is_valid` with `CASE`, and keep the original text so you can report what failed:

```sql
SELECT TRIM(order_ref) AS ref,
       amount_text,
       CASE WHEN pg_input_is_valid(REPLACE(amount_text, ',', ''), 'numeric')
            THEN CAST(REPLACE(amount_text, ',', '') AS NUMERIC(10, 2))
       END AS amount,
       NOT pg_input_is_valid(REPLACE(amount_text, ',', ''), 'numeric') AS is_bad_amount
FROM raw_orders
ORDER BY UPPER(TRIM(order_ref));
```

| ref | amount_text | amount | is_bad_amount |
|---|---|---|---|
| ord-1001 | 120.50 | 120.50 | f |
| ORD-1002 | 35.5 | 35.50 | f |
| ord-1003 | 1,200.00 | 1200.00 | f |
| ORD-1004 | n/a | NULL | t |
| ORD-1005 | 64.99 | 64.99 | f |

### Choosing numeric types

| Type | Use for | Watch out |
|---|---|---|
| `INT` / `BIGINT` | Counts, ids | Integer division; `INT` overflows at about 2.1 billion |
| `NUMERIC(p, s)` / `DECIMAL` | Money and anything that must add up exactly | Slower than floats; set precision deliberately |
| `REAL` / `DOUBLE PRECISION` / `FLOAT` | Measurements, scientific values, ML features | Binary floating point cannot represent 0.1 exactly |

```sql
SELECT 0.1::FLOAT8 + 0.2::FLOAT8 AS float_sum,
       0.1::NUMERIC + 0.2::NUMERIC AS numeric_sum;
```

| float_sum | numeric_sum |
|---|---|
| 0.30000000000000004 | 0.3 |

Never store money in a float: summing millions of float amounts drifts by fractions of a cent, and reconciliation against the source system fails.

### Pitfalls

- Casting in a join condition (`ON a.id = CAST(b.id AS INT)`) hides a modelling problem and usually prevents index use. Fix the types in staging.
- Relying on implicit string-to-date conversion with an ambiguous format.
- Using `TRY_CAST` and never looking at the `NULL`s it produced. Count and log them.
- Shrinking types (`VARCHAR(10)`, `NUMERIC(5,2)`) without checking the longest value; the cast fails or, in some engines, truncates.

### In interviews

You might be asked how to load a column that has a few bad values. Mention the safe-cast function for the dialect, keeping the raw value, counting rejects and routing them to a quarantine table rather than silently converting them to `NULL`. "Why not `FLOAT` for money?" is also common.

## Arithmetic and rounding

Arithmetic in SQL looks obvious, but integer division, rounding rules and `NULL` propagation regularly produce wrong ratios and percentages.

### Operators and integer division

```sql
SELECT 7 / 2         AS int_division,
       7 / 2.0       AS decimal_division,
       7 % 3         AS modulo,
       -7 / 2        AS negative_int_division,
       quantity * unit_price AS line_total
FROM raw_orders
WHERE TRIM(order_ref) = 'ord-1003';
```

| int_division | decimal_division | modulo | negative_int_division | line_total |
|---|---|---|---|---|
| 3 | 3.5000000000000000 | 1 | -3 | 1200.00 |

When both operands are integers, PostgreSQL and SQL Server perform **integer division**, discarding the remainder (towards zero, so -7 / 2 is -3). MySQL, Snowflake, BigQuery, Oracle and DuckDB return a decimal 3.5 instead. This is the classic bug in ratio metrics:

```sql
SELECT COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) / COUNT(*)         AS wrong_ratio,
       COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) * 1.0 / COUNT(*)   AS right_ratio,
       ROUND(100.0 * COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) / COUNT(*), 1) AS pct_shipped
FROM raw_orders;
```

| wrong_ratio | right_ratio | pct_shipped |
|---|---|---|
| 0 | 0.80000000000000000000 | 80.0 |

Four of five orders shipped, but integer division returns 0. Multiply by `1.0` (or `100.0` for a percentage) **before** dividing, or cast one side to `NUMERIC`. (`FILTER` is PostgreSQL's way of counting a subset; the [aggregations lesson](/sql/aggregations-group-by-having/) shows the portable `CASE` form.) MySQL and BigQuery offer `DIV` for deliberate integer division, and DuckDB uses `//`.

### Rounding functions

| Function | 2.567 | -2.567 | Notes |
|---|---|---|---|
| `ROUND(x, 2)` | 2.57 | -2.57 | Second argument can be negative: `ROUND(1234.5, -2)` is 1200 |
| `TRUNC(x, 2)` | 2.56 | -2.56 | Drops digits towards zero (`TRUNCATE` in MySQL) |
| `FLOOR(x)` | 2 | -3 | Largest integer not above x |
| `CEIL(x)` / `CEILING(x)` | 3 | -2 | Smallest integer not below x |

How halves round depends on the type. In PostgreSQL, `NUMERIC` rounds half away from zero, while `DOUBLE PRECISION` follows the platform, which is round-half-to-even on most systems:

```sql
SELECT ROUND(2.5::NUMERIC) AS numeric_half,
       ROUND(2.5::FLOAT8)  AS float_half,
       ROUND(3.5::FLOAT8)  AS float_three_half,
       ROUND(-2.5::NUMERIC) AS negative_half;
```

| numeric_half | float_half | float_three_half | negative_half |
|---|---|---|---|
| 3 | 2 | 4 | -3 |

DuckDB, by contrast, rounds a `DOUBLE` 2.5 to 3. When reconciling totals with another system, compare rounding rules, not only formulas.

### Round at the end

Round only the value you present, not the intermediate steps. Rounding each line before summing gives a different total from rounding the sum, and the difference grows with row count. Also prefer `ROUND(SUM(x), 2)` over `SUM(ROUND(x, 2))` unless the business rule says each line is rounded (as invoices often are, in which case follow the rule exactly).

### Other useful functions

`ABS`, `POWER`, `SQRT`, `LN` and `EXP` are available almost everywhere. `GREATEST(a, b, ...)` and `LEAST(...)` pick the largest or smallest of several columns in PostgreSQL, MySQL, Snowflake, BigQuery and SQL Server 2022 or later. Watch the `NULL` behaviour: PostgreSQL's `GREATEST` ignores `NULL`s, while MySQL and Snowflake return `NULL` if any argument is `NULL`.

### Pitfalls

- Integer division in ratios and percentages.
- Division by zero: guard with `NULLIF(denominator, 0)`.
- `NULL` in any operand makes the result `NULL`: `quantity * unit_price` is `NULL` if either is missing.
- Rounding intermediate values, then wondering why totals do not reconcile.
- Comparing floats with `=`. Compare with a tolerance (`ABS(a - b) < 0.0001`) or use `NUMERIC`.

### In interviews

"Why does my conversion rate show 0?" is integer division. "Why is the total off by a cent?" is rounding order or floats. State the fix in one line (`* 1.0` or a cast, round at the end, `NUMERIC` for money) and mention that engines differ on `/`.

## Practice questions

<details><summary>Extract the email domain in lower case, returning NULL when the email is NULL or has no @ sign. Use PostgreSQL.</summary>

```
CASE WHEN POSITION('@' IN email) > 0
     THEN LOWER(SPLIT_PART(email, '@', 2))
END AS domain
```

`POSITION` returns 0 when the `@` is missing, so the `CASE` returns `NULL`; a `NULL` email makes the condition unknown, which also gives `NULL`. In Snowflake the same `SPLIT_PART` works; in BigQuery use `SPLIT(email, '@')[SAFE_OFFSET(1)]`.

</details>

<details><summary>SELECT clicks / impressions returns 0 for every row in PostgreSQL. Why, and how do you fix it?</summary>

Both columns are integers, so PostgreSQL performs integer division and truncates any result below 1 to 0. Convert before dividing: `clicks * 1.0 / NULLIF(impressions, 0)` or `CAST(clicks AS NUMERIC) / NULLIF(impressions, 0)`. `NULLIF` also prevents a division-by-zero error. SQL Server behaves the same way; MySQL, Snowflake and BigQuery return a decimal.

</details>

<details><summary>A text column holds amounts such as "1,200.00", "35.5" and "n/a". How do you load it into a NUMERIC column without failing the job or losing information?</summary>

Strip the thousands separator with `REPLACE`, then use a safe cast: `TRY_CAST` in SQL Server, Snowflake or DuckDB, `SAFE_CAST` in BigQuery, or a `CASE` with `pg_input_is_valid` in PostgreSQL 16. Keep the original text column, count the rows where the cast returned `NULL` but the input was not `NULL`, and route them to a quarantine table or alert. Silently loading `NULL`s hides upstream problems.

</details>

<details><summary>How many days between 2025-12-31 23:00 and 2026-01-01 01:00? Give two defensible answers.</summary>

As elapsed time, 2 hours, which is 0 whole days. As calendar days, 1, because the dates differ by one day; SQL Server's and Snowflake's `DATEDIFF(day, ...)` return 1 because one day boundary is crossed. Ask which meaning the metric needs, and remember the result also depends on the time zone in which you take the date.

</details>

<details><summary>Why should money be stored as NUMERIC/DECIMAL rather than FLOAT?</summary>

Binary floating point cannot represent most decimal fractions exactly (0.1 + 0.2 is 0.30000000000000004), so sums drift and totals fail to reconcile with source systems. `NUMERIC` stores exact decimal values at a fixed scale. Floats are fine for measurements where tiny relative errors do not matter.

</details>

<details><summary>What is the difference between ROUND(SUM(amount), 2) and SUM(ROUND(amount, 2))?</summary>

The first sums exact values and rounds once; the second rounds every row and then sums, so rounding errors accumulate and the totals can differ. Use the first unless a business rule says each line is rounded (for example on invoices), in which case the second matches the documents.

</details>

## Key takeaways

- Clean text once in staging with `TRIM`, `UPPER`/`LOWER` and `REPLACE`, and join and sort on the cleaned values.
- `||` returns `NULL` if any part is `NULL`; `CONCAT` skips `NULL`s in PostgreSQL and SQL Server but not in MySQL. Use `COALESCE` and a separator for keys.
- Know your engine's names for date add, date difference and truncation, and their argument order; `DATEDIFF` counts boundaries crossed.
- Cast explicitly; use `TRY_CAST`/`SAFE_CAST` (or `pg_input_is_valid` in PostgreSQL 16) to quarantine bad values instead of failing or hiding them.
- Integer division truncates in PostgreSQL and SQL Server: multiply by `1.0` before dividing.
- Use `NUMERIC` for money, round once at the end, and know that halves round differently for `NUMERIC` and floats.

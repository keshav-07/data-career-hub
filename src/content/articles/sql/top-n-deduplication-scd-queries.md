---
title: "Top-N per Group, Deduplication and SCD Queries"
seoTitle: "SQL Top-N per Group, Deduplication and SCD"
description: "Three SQL pipeline patterns: top N rows per group with ties, deduplicating to the latest record per key, and querying Type 2 slowly changing dimensions."
technology: ["sql"]
topic: ["window-functions", "deduplication", "scd", "top-n"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Return the top N rows per group and choose how ties are handled"
  - "Deduplicate a change feed to the latest record per key, deterministically and idempotently"
  - "Build a Type 2 slowly changing dimension from a change log with LAG and LEAD"
  - "Query current rows, as-of versions and point-in-time joins against a Type 2 dimension"
  - "Validate SCD tables for overlaps, gaps and duplicate current rows"
prerequisites: ["articles:sql/window-functions", "articles:sql/semi-anti-lateral-joins"]
related: ["articles:data-warehousing/slowly-changing-dimensions", "interview-questions:sql/remove-duplicate-records", "articles:etl-elt/cdc-patterns-and-failure-modes"]
previous: "articles:sql/dates-calendars-time-series"
sources:
  - { label: "PostgreSQL documentation: Window functions", url: "https://www.postgresql.org/docs/16/functions-window.html" }
  - { label: "PostgreSQL documentation: SELECT (DISTINCT ON)", url: "https://www.postgresql.org/docs/16/sql-select.html" }
  - { label: "PostgreSQL documentation: MERGE", url: "https://www.postgresql.org/docs/16/sql-merge.html" }
  - { label: "Snowflake documentation: Window function syntax and usage", url: "https://docs.snowflake.com/en/sql-reference/functions-window-syntax" }
versionContext: "Examples run on PostgreSQL 16 (MERGE needs PostgreSQL 15 or later); the QUALIFY example runs on DuckDB 1.5. Notes on Snowflake, BigQuery and SQL Server were not executed."
next: "articles:sql/recursive-ctes-hierarchies"
---

Three query patterns come up in almost every Data Engineering job and interview: **top N per group** ("the three best-selling products in each category"), **deduplication** ("keep only the latest version of each customer from a change feed"), and **slowly changing dimension (SCD) queries** ("what tier was this customer in when they placed that order?"). All three are built from window functions, and all three go wrong in the same places: ties, non-deterministic ordering and `NULL`s. This lesson works through each with the edge cases that matter in production.

## Sample data

Product revenue by category (for top N), a change feed of customer records with duplicates and late arrivals (for deduplication), and orders to join against customer history (for SCD).

```sql
CREATE TABLE product_sales (category TEXT, product TEXT, revenue NUMERIC(10, 2));
INSERT INTO product_sales VALUES
  ('electronics', 'Keyboard', 900), ('electronics', 'Mouse',   900),
  ('electronics', 'Monitor',  700), ('electronics', 'Webcam',  400),
  ('electronics', 'Cable',    150),
  ('furniture',   'Desk',    1200), ('furniture',   'Chair',  1100),
  ('furniture',   'Lamp',     300),
  ('stationery',  'Notebook', 250);

-- Every change to a customer, as delivered by a CDC tool.
-- ingested_at is when the row reached the warehouse; op: I = insert, U = update, D = delete.
CREATE TABLE customer_changes (
  customer_id INT,
  email       TEXT,
  city        TEXT,
  tier        TEXT,
  updated_at  TIMESTAMP,
  ingested_at TIMESTAMP,
  op          CHAR(1)
);
INSERT INTO customer_changes VALUES
  (1, 'asha@example.com',  'Mumbai',    'bronze', '2025-01-10 09:00', '2025-01-10 09:05', 'I'),
  (1, 'asha@example.com',  'Mumbai',    'silver', '2025-03-01 12:00', '2025-03-01 12:02', 'U'),
  (1, 'asha@example.com',  'Pune',      'silver', '2025-05-20 08:30', '2025-05-20 08:31', 'U'),
  (1, 'asha@example.com',  'Pune',      'silver', '2025-05-20 08:30', '2025-05-20 09:00', 'U'),  -- redelivered
  (2, 'ben@example.com',   'London',    'bronze', '2025-02-01 10:00', '2025-02-01 10:01', 'I'),
  (2, 'ben@example.com',   'London',    'gold',   '2025-04-15 16:00', '2025-04-18 07:00', 'U'),  -- arrived 3 days late
  (2, 'ben@example.com',   'London',    'silver', '2025-04-10 11:00', '2025-04-10 11:01', 'U'),
  (3, 'chen@example.com',  'Singapore', 'bronze', '2025-02-20 14:00', '2025-02-20 14:01', 'I'),
  (3, 'chen@example.com',  'Singapore', 'bronze', '2025-06-01 00:00', '2025-06-01 00:01', 'D');

CREATE TABLE orders (order_id INT, customer_id INT, ordered_at TIMESTAMP, amount NUMERIC(10, 2));
INSERT INTO orders VALUES
  (101, 1, '2025-02-15 10:00', 120.00), (102, 1, '2025-04-02 18:30', 80.00),
  (103, 1, '2025-06-10 09:15', 45.00),  (104, 2, '2025-04-12 13:00', 220.00),
  (105, 2, '2025-04-16 08:00', 60.00),  (106, 3, '2025-03-05 11:00', 30.00);
```

## Top-N per group

"The top 2 products by revenue in each category" cannot be answered with `ORDER BY ... LIMIT 2`, which limits the whole result, not each group. The standard solution ranks rows **within each partition** with a window function and filters on the rank in an outer query.

```sql
WITH ranked AS (
  SELECT category, product, revenue,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC, product) AS rn,
         RANK()       OVER (PARTITION BY category ORDER BY revenue DESC)          AS rnk,
         DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC)          AS drnk
  FROM product_sales
)
SELECT category, product, revenue, rn, rnk, drnk
FROM ranked
WHERE category = 'electronics'
ORDER BY revenue DESC, product;
```

| category | product | revenue | rn | rnk | drnk |
|---|---|---|---|---|---|
| electronics | Keyboard | 900.00 | 1 | 1 | 1 |
| electronics | Mouse | 900.00 | 2 | 1 | 1 |
| electronics | Monitor | 700.00 | 3 | 3 | 2 |
| electronics | Webcam | 400.00 | 4 | 4 | 3 |
| electronics | Cable | 150.00 | 5 | 5 | 4 |

### Choosing how ties behave

Keyboard and Mouse tie at 900. "Top 2" now has three defensible answers:

| Filter | Electronics result | Meaning |
|---|---|---|
| `rn <= 2` | Keyboard, Mouse | Exactly 2 rows per group; ties broken by the tiebreaker (`product`) |
| `rnk <= 2` | Keyboard, Mouse | Every row whose rank is in the top 2 positions; here the tie fills both |
| `drnk <= 2` | Keyboard, Mouse, Monitor | The top 2 **distinct revenue values**, with every row at those values |

The difference shows with `<= 1`: `rn` returns one product, `rnk` and `drnk` return both. Ask which the business wants; if they say "exactly N", use `ROW_NUMBER` with a meaningful tiebreaker.

```sql
WITH ranked AS (
  SELECT category, product, revenue,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC, product) AS rn
  FROM product_sales
)
SELECT category, product, revenue
FROM ranked
WHERE rn <= 2
ORDER BY category, rn;
```

| category | product | revenue |
|---|---|---|
| electronics | Keyboard | 900.00 |
| electronics | Mouse | 900.00 |
| furniture | Desk | 1200.00 |
| furniture | Chair | 1100.00 |
| stationery | Notebook | 250.00 |

Stationery has only one product, so it returns one row: top N returns **at most** N rows per group.

### QUALIFY, LATERAL and other forms

In Snowflake, BigQuery, Databricks and DuckDB, `QUALIFY` removes the CTE:

<!-- engine: duckdb -->
```sql
CREATE TABLE product_sales (category TEXT, product TEXT, revenue DECIMAL(10, 2));
INSERT INTO product_sales VALUES
  ('electronics', 'Keyboard', 900), ('electronics', 'Mouse', 900), ('electronics', 'Monitor', 700),
  ('electronics', 'Webcam', 400), ('electronics', 'Cable', 150), ('furniture', 'Desk', 1200),
  ('furniture', 'Chair', 1100), ('furniture', 'Lamp', 300), ('stationery', 'Notebook', 250);

SELECT category, product, revenue
FROM product_sales
QUALIFY DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC) <= 2
ORDER BY category, revenue DESC, product;
```

| category | product | revenue |
|---|---|---|
| electronics | Keyboard | 900.00 |
| electronics | Mouse | 900.00 |
| electronics | Monitor | 700.00 |
| furniture | Desk | 1200.00 |
| furniture | Chair | 1100.00 |
| stationery | Notebook | 250.00 |

Other ways to write top N per group, and when they fit:

- `LATERAL` (or `CROSS APPLY` in SQL Server) with `ORDER BY ... LIMIT N` per group, efficient when an index supports it and there are few groups. See the [LATERAL joins lesson](/sql/semi-anti-lateral-joins/).
- A correlated count, `WHERE (SELECT COUNT(*) FROM t t2 WHERE t2.category = t.category AND t2.revenue > t.revenue) < 2`, which works in engines without window functions but is quadratic per group.
- For N = 1, `DISTINCT ON` in PostgreSQL, or `MAX_BY`/`ARG_MAX`-style aggregates in some warehouses (Snowflake `MAX_BY`, Databricks `max_by`, DuckDB `arg_max`).

### Top N plus "everything else"

Reports often show the top N and lump the rest together:

```sql
WITH ranked AS (
  SELECT category, product, revenue,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC, product) AS rn
  FROM product_sales
)
SELECT category,
       CASE WHEN rn <= 2 THEN product ELSE 'Other' END AS product_group,
       SUM(revenue) AS revenue
FROM ranked
WHERE category = 'electronics'
GROUP BY category, CASE WHEN rn <= 2 THEN product ELSE 'Other' END
ORDER BY MIN(rn);
```

| category | product_group | revenue |
|---|---|---|
| electronics | Keyboard | 900.00 |
| electronics | Mouse | 900.00 |
| electronics | Other | 1250.00 |

### Pitfalls

- Ranking raw rows when the question is about totals: "top customers by revenue" needs `GROUP BY customer` first, then the ranking.
- Filtering before ranking (`WHERE` runs first), which changes who is in the top N. Filter inside the CTE only if the filter is part of the question.
- No tiebreaker with `ROW_NUMBER`, so the Nth row changes between runs.
- Assuming exactly N rows per group, when ties (`RANK`) or small groups change the count.

### In interviews

Top N per group is the single most common window-function question. Write the CTE with `ROW_NUMBER`, filter in the outer query, then say what happens with ties and offer `RANK` or `DENSE_RANK` depending on the requirement. Mention `QUALIFY` if the interviewer uses Snowflake or BigQuery.

## Deduplicate keeping the latest record

Pipelines receive duplicates all the time: CDC tools redeliver events after a restart, files are loaded twice, and sources send every version of a record. The usual target is **one row per business key, the latest version**. Doing that correctly means defining "latest" precisely and making the result the same every time you run it.

### Find the duplicates first

```sql
SELECT customer_id, COUNT(*) AS versions, COUNT(DISTINCT updated_at) AS distinct_versions
FROM customer_changes
GROUP BY customer_id
HAVING COUNT(*) > 1
ORDER BY customer_id;
```

| customer_id | versions | distinct_versions |
|---|---|---|
| 1 | 4 | 3 |
| 2 | 3 | 3 |
| 3 | 2 | 2 |

Customer 1 has four rows but only three distinct versions: one change was delivered twice.

### Keep the latest row per key

```sql
WITH ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id
           ORDER BY updated_at DESC, ingested_at DESC     -- source time first, then load time as tiebreaker
         ) AS rn
  FROM customer_changes
)
SELECT customer_id, email, city, tier, updated_at, op
FROM ranked
WHERE rn = 1
ORDER BY customer_id;
```

| customer_id | email | city | tier | updated_at | op |
|---|---|---|---|---|---|
| 1 | asha@example.com | Pune | silver | 2025-05-20 08:30:00 | U |
| 2 | ben@example.com | London | gold | 2025-04-15 16:00:00 | U |
| 3 | chen@example.com | Singapore | bronze | 2025-06-01 00:00:00 | D |

Three decisions make this correct:

1. **Order by the source's change time, not the load time.** Ben's gold record arrived after the silver one (`ingested_at` 18 April) but happened later at the source (`updated_at` 15 April versus 10 April), so gold is correct. Ordering by `ingested_at` would also give gold here by luck; with the arrival order reversed it would keep a stale version. Where the source provides a log sequence number or version column, prefer it over timestamps.
2. **Add a deterministic tiebreaker.** Customer 1's redelivered row has the same `updated_at`, so `ingested_at` (or a unique load id) decides. Without one, `ROW_NUMBER` may pick either row, and a rerun can produce a different table.
3. **Handle deletes.** Chen's latest change is a delete (`op = 'D'`). For a "current customers" table, keep the latest row per key **and then** drop keys whose latest operation is a delete: add `AND op <> 'D'` in the outer query, not in the CTE. Filtering deletes before ranking would resurrect Chen's older insert.

```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
  FROM customer_changes
)
SELECT customer_id, city, tier
FROM ranked
WHERE rn = 1 AND op <> 'D'
ORDER BY customer_id;
```

| customer_id | city | tier |
|---|---|---|
| 1 | Pune | silver |
| 2 | London | gold |

### Shorter forms

`DISTINCT ON` in PostgreSQL (and DuckDB) keeps the first row per key according to `ORDER BY`:

```sql
SELECT DISTINCT ON (customer_id) customer_id, city, tier, op
FROM customer_changes
ORDER BY customer_id, updated_at DESC, ingested_at DESC;
```

| customer_id | city | tier | op |
|---|---|---|---|
| 1 | Pune | silver | U |
| 2 | London | gold | U |
| 3 | Singapore | bronze | D |

In Snowflake, BigQuery and Databricks the idiom is `QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC, ingested_at DESC) = 1`.

### Removing duplicates from a table in place

Sometimes duplicates are already in a target table and must be deleted. When rows are completely identical, there is no column to say which to keep, so you need a physical or surrogate row id. In PostgreSQL, the system column `ctid` identifies a row version:

```sql
CREATE TABLE customer_changes_copy AS SELECT * FROM customer_changes;
INSERT INTO customer_changes_copy SELECT * FROM customer_changes WHERE customer_id = 2;  -- exact duplicates

DELETE FROM customer_changes_copy a
USING customer_changes_copy b
WHERE a.customer_id = b.customer_id
  AND a.updated_at  = b.updated_at
  AND a.ingested_at = b.ingested_at
  AND a.ctid > b.ctid;                     -- keep the physically first copy

SELECT COUNT(*) AS rows_left FROM customer_changes_copy;
```

| rows_left |
|---|
| 9 |

The three exact copies of Ben's rows were deleted and the nine original rows remain. `ctid` is PostgreSQL-specific and changes after updates and `VACUUM FULL`, so use it only within a single statement like this. In warehouses without row ids, the usual approach is to rebuild: `CREATE OR REPLACE TABLE t AS SELECT ... QUALIFY ROW_NUMBER() ... = 1` (or `INSERT OVERWRITE`), which is also easier to make atomic and repeatable.

### Making it idempotent

A deduplication step should give the same output whether it runs once or five times, and whether a batch arrives once or twice:

- Deduplicate the incoming batch **and** merge it on the business key (`MERGE` or `INSERT ... ON CONFLICT`), so a reloaded batch updates rather than duplicates.
- Only apply a change if it is newer than what the target holds (`WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE`), so a late, older record cannot overwrite a newer one.
- Enforce uniqueness with a primary key or unique constraint where the engine supports it. Snowflake and BigQuery accept primary key declarations but do not enforce them, so run a duplicate check (the `HAVING COUNT(*) > 1` query above) as a data-quality test.

### Pitfalls

- "Latest" by load time instead of source time, which lets late-arriving old versions win.
- No tiebreaker, so reruns keep different rows.
- Filtering deletes before ranking, which brings deleted records back.
- `SELECT DISTINCT *` as deduplication: it removes only exact duplicates, and Ben's three different versions all survive.
- Deduplicating only the new batch, not against what is already in the target.

### In interviews

"Remove duplicates, keeping the latest record per id" appears in nearly every Data Engineering SQL round (see the practice page [remove duplicate records](/interview/sql/remove-duplicate-records/)). Write the `ROW_NUMBER` CTE, explain your ordering columns and tiebreaker, say how deletes and late data are handled, and describe how the step stays idempotent with `MERGE`.

## Slowly changing dimension queries

A **slowly changing dimension** (SCD) is a dimension table whose attributes change over time: a customer moves city or changes tier. The two types you must know:

| Type | On change | History | Typical columns |
|---|---|---|---|
| Type 1 | Overwrite the row | Lost | `updated_at` |
| Type 2 | Close the current row, insert a new version | Kept, one row per version | `valid_from`, `valid_to`, `is_current`, a surrogate key |

Type 2 lets you answer "what was true **at the time**": the tier a customer had when they placed an order, which is what correct historical reporting needs. The modelling side is covered in [slowly changing dimensions](/data-warehousing/slowly-changing-dimensions/); this section is about the SQL.

### Building a Type 2 table from a change log

Deduplicate the change log to one row per real version, keep only rows where tracked attributes actually changed, and derive each version's end from the next version's start with `LEAD`:

```sql
CREATE TABLE dim_customer AS
WITH versions AS (                         -- 1. one row per real version (drop redeliveries)
  SELECT DISTINCT ON (customer_id, updated_at)
         customer_id, email, city, tier, updated_at, op
  FROM customer_changes
  ORDER BY customer_id, updated_at, ingested_at DESC
),
changes AS (                               -- 2. keep rows where a tracked attribute changed
  SELECT *,
         LAG(city) OVER w AS prev_city,
         LAG(tier) OVER w AS prev_tier,
         LAG(op)   OVER w AS prev_op
  FROM versions
  WINDOW w AS (PARTITION BY customer_id ORDER BY updated_at)
)
SELECT ROW_NUMBER() OVER (ORDER BY customer_id, updated_at)       AS customer_sk,
       customer_id, email, city, tier,
       updated_at                                                 AS valid_from,
       COALESCE(LEAD(updated_at) OVER (PARTITION BY customer_id ORDER BY updated_at),
                TIMESTAMP '9999-12-31')                           AS valid_to,
       LEAD(updated_at) OVER (PARTITION BY customer_id ORDER BY updated_at) IS NULL AS is_current,
       op = 'D'                                                   AS is_deleted
FROM changes
WHERE prev_op IS NULL                                   -- first version
   OR city IS DISTINCT FROM prev_city
   OR tier IS DISTINCT FROM prev_tier
   OR op = 'D';

SELECT customer_sk, customer_id, city, tier, valid_from, valid_to, is_current, is_deleted
FROM dim_customer
ORDER BY customer_id, valid_from;
```

| customer_sk | customer_id | city | tier | valid_from | valid_to | is_current | is_deleted |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Mumbai | bronze | 2025-01-10 09:00:00 | 2025-03-01 12:00:00 | f | f |
| 2 | 1 | Mumbai | silver | 2025-03-01 12:00:00 | 2025-05-20 08:30:00 | f | f |
| 3 | 1 | Pune | silver | 2025-05-20 08:30:00 | 9999-12-31 00:00:00 | t | f |
| 4 | 2 | London | bronze | 2025-02-01 10:00:00 | 2025-04-10 11:00:00 | f | f |
| 5 | 2 | London | silver | 2025-04-10 11:00:00 | 2025-04-15 16:00:00 | f | f |
| 6 | 2 | London | gold | 2025-04-15 16:00:00 | 9999-12-31 00:00:00 | t | f |
| 7 | 3 | Singapore | bronze | 2025-02-20 14:00:00 | 2025-06-01 00:00:00 | f | f |
| 8 | 3 | Singapore | bronze | 2025-06-01 00:00:00 | 9999-12-31 00:00:00 | t | t |

- Ranges are **half-open**: a version is valid from `valid_from` (inclusive) to `valid_to` (exclusive). The next version starts exactly where the previous one ends, so a timestamp belongs to exactly one version.
- The open-ended current version uses a far-future `valid_to` (`9999-12-31`) rather than `NULL`, so range conditions need no special case. Some teams prefer `NULL`; then every query needs `valid_to IS NULL OR ...`.
- `IS DISTINCT FROM` detects changes to and from `NULL`, which `<>` would miss.
- Ben's late-arriving gold change is placed correctly because versions are ordered by `updated_at`, not by arrival.
- `LEAD` is computed after the `WHERE` filter here, because the filter is in the same query as the final `SELECT`. That is what we want: each kept version ends where the next **kept** version starts.

### Query 1: the current version

```sql
SELECT customer_id, city, tier
FROM dim_customer
WHERE is_current AND NOT is_deleted
ORDER BY customer_id;
```

| customer_id | city | tier |
|---|---|---|
| 1 | Pune | silver |
| 2 | London | gold |

### Query 2: as of a point in time

"What did the customer table look like on 1 April 2025?"

```sql
SELECT customer_id, city, tier
FROM dim_customer
WHERE TIMESTAMP '2025-04-01' >= valid_from
  AND TIMESTAMP '2025-04-01' <  valid_to
  AND NOT is_deleted
ORDER BY customer_id;
```

| customer_id | city | tier |
|---|---|---|
| 1 | Mumbai | silver |
| 2 | London | bronze |
| 3 | Singapore | bronze |

### Query 3: point-in-time join of facts to the dimension

Each order should be reported with the customer attributes **valid when the order was placed**. Join on the key **and** the time range:

```sql
SELECT o.order_id, o.ordered_at, o.amount, d.customer_sk, d.city, d.tier AS tier_at_order
FROM orders o
LEFT JOIN dim_customer d
  ON  d.customer_id = o.customer_id
  AND o.ordered_at >= d.valid_from
  AND o.ordered_at <  d.valid_to
ORDER BY o.order_id;
```

| order_id | ordered_at | amount | customer_sk | city | tier_at_order |
|---|---|---|---|---|---|
| 101 | 2025-02-15 10:00:00 | 120.00 | 1 | Mumbai | bronze |
| 102 | 2025-04-02 18:30:00 | 80.00 | 2 | Mumbai | silver |
| 103 | 2025-06-10 09:15:00 | 45.00 | 3 | Pune | silver |
| 104 | 2025-04-12 13:00:00 | 220.00 | 5 | London | silver |
| 105 | 2025-04-16 08:00:00 | 60.00 | 6 | London | gold |
| 106 | 2025-03-05 11:00:00 | 30.00 | 7 | Singapore | bronze |

Joining on `customer_id` alone would multiply each order by the number of versions (three rows for each of Asha's orders). Joining to `is_current` only would report every historical order with today's tier, so revenue "by tier" would move every time a customer is upgraded. In a star schema, this lookup usually happens once at load time: the fact table stores `customer_sk`, and reports join on the surrogate key alone.

Revenue by the tier customers held at the time:

```sql
SELECT d.tier, SUM(o.amount) AS revenue
FROM orders o
JOIN dim_customer d
  ON d.customer_id = o.customer_id AND o.ordered_at >= d.valid_from AND o.ordered_at < d.valid_to
GROUP BY d.tier
ORDER BY d.tier;
```

| tier | revenue |
|---|---|
| bronze | 150.00 |
| gold | 60.00 |
| silver | 345.00 |

### Applying a new change with MERGE

When a new change arrives, close the current version and insert the new one. PostgreSQL 15+, SQL Server, Snowflake, BigQuery and Databricks support `MERGE`, but a single `MERGE` cannot both update a matched row and insert a new version for the same source row in most engines, so a common pattern is an `UPDATE` followed by an `INSERT` in one transaction:

```sql
CREATE TABLE incoming (customer_id INT, email TEXT, city TEXT, tier TEXT, updated_at TIMESTAMP);
INSERT INTO incoming VALUES (2, 'ben@example.com', 'Leeds', 'gold', '2025-07-01 09:00');

BEGIN;

-- 1. Close the current version if a tracked attribute changed
UPDATE dim_customer d
SET valid_to = i.updated_at, is_current = false
FROM incoming i
WHERE d.customer_id = i.customer_id
  AND d.is_current
  AND i.updated_at > d.valid_from
  AND (d.city IS DISTINCT FROM i.city OR d.tier IS DISTINCT FROM i.tier);

-- 2. Insert the new version for keys that no longer have a current row
INSERT INTO dim_customer (customer_sk, customer_id, email, city, tier, valid_from, valid_to, is_current, is_deleted)
SELECT (SELECT MAX(customer_sk) FROM dim_customer) + ROW_NUMBER() OVER (ORDER BY i.customer_id),
       i.customer_id, i.email, i.city, i.tier, i.updated_at, TIMESTAMP '9999-12-31', true, false
FROM incoming i
WHERE NOT EXISTS (SELECT 1 FROM dim_customer d WHERE d.customer_id = i.customer_id AND d.is_current);

COMMIT;

SELECT customer_sk, city, tier, valid_from, valid_to, is_current
FROM dim_customer WHERE customer_id = 2 ORDER BY valid_from;
```

| customer_sk | city | tier | valid_from | valid_to | is_current |
|---|---|---|---|---|---|
| 4 | London | bronze | 2025-02-01 10:00:00 | 2025-04-10 11:00:00 | f |
| 5 | London | silver | 2025-04-10 11:00:00 | 2025-04-15 16:00:00 | f |
| 6 | London | gold | 2025-04-15 16:00:00 | 2025-07-01 09:00:00 | f |
| 9 | Leeds | gold | 2025-07-01 09:00:00 | 9999-12-31 00:00:00 | t |

Running the same batch again changes nothing: the `UPDATE` finds no change against the new current row, and the `INSERT` finds a current row already present. That idempotency is what makes the job safe to retry. Production versions use a sequence or identity column for the surrogate key instead of `MAX + ROW_NUMBER`, and dbt's snapshots or Delta Lake/Snowflake `MERGE` with a staged "union of updates and inserts" are common ways to package the same logic.

### Validating a Type 2 table

Three checks catch most SCD bugs:

```sql
SELECT 'multiple current rows' AS problem, customer_id
FROM dim_customer WHERE is_current GROUP BY customer_id HAVING COUNT(*) > 1
UNION ALL
SELECT 'overlapping versions', a.customer_id
FROM dim_customer a JOIN dim_customer b
  ON a.customer_id = b.customer_id AND a.customer_sk < b.customer_sk
 AND a.valid_from < b.valid_to AND b.valid_from < a.valid_to
UNION ALL
SELECT 'gap between versions', customer_id
FROM (SELECT customer_id, valid_to,
             LEAD(valid_from) OVER (PARTITION BY customer_id ORDER BY valid_from) AS next_from
      FROM dim_customer) t
WHERE next_from IS NOT NULL AND next_from <> valid_to;
```

| problem | customer_id |
|---|---|

No rows means no problems. Run these as data-quality tests after every load.

### Pitfalls

- Joining facts to a Type 2 dimension on the natural key only (fan-out) or on `is_current` only (history rewritten).
- Closed ranges (`<=` on both ends) that let a timestamp match two versions at a boundary.
- Creating a new version when nothing tracked changed, for example on every redelivered CDC event; compare attributes with `IS DISTINCT FROM`.
- Ordering versions by load time, so late-arriving changes produce a wrong history.
- Not handling deletes: a deleted customer should stop being current, not vanish from history.

### In interviews

SCD questions range from "explain Type 1 versus Type 2" to "write the query that finds each order's customer tier at order time". Give the half-open range join, explain why `is_current` alone is wrong for historical facts, and describe how a new change closes the old version and inserts a new one idempotently. Validation checks for overlaps and duplicate current rows are a strong finish.

## Practice questions

<details><summary>Return the top 3 earners per department, including everyone tied with the third.</summary>

```
WITH r AS (
  SELECT *, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rnk
  FROM employees
)
SELECT * FROM r WHERE rnk <= 3;
```

`RANK` keeps everyone tied at the boundary; use `ROW_NUMBER` with a tiebreaker for exactly three rows, or `DENSE_RANK` for the top three distinct salaries.

</details>

<details><summary>Find the most expensive product in each category, returning exactly one row per category.</summary>

`ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC, product_id)` in a CTE, then `WHERE rn = 1`. The `product_id` tiebreaker makes the choice deterministic when two products share the top price. In PostgreSQL, `SELECT DISTINCT ON (category) ... ORDER BY category, price DESC, product_id` is equivalent.

</details>

<details><summary>A CDC feed contains several versions of each order and occasional redeliveries. Write a query for the current state of each order, excluding deleted orders.</summary>

```
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id
                               ORDER BY source_lsn DESC, ingested_at DESC) AS rn
  FROM order_changes
)
SELECT * FROM ranked WHERE rn = 1 AND op <> 'D';
```

Order by the source's sequence (or change timestamp), not arrival time, break ties deterministically, and filter deletes after picking the latest row, otherwise an older version of a deleted order comes back.

</details>

<details><summary>Why is SELECT DISTINCT * not enough to deduplicate a customer feed?</summary>

`DISTINCT` removes only rows that are identical in every column. Different versions of the same customer (a new city, a later timestamp) are not identical, so all of them survive. Deduplicating by business key needs `ROW_NUMBER()` (or `DISTINCT ON`) with an explicit rule for which version wins.

</details>

<details><summary>Write the join that attaches to each order the customer segment valid at the time of the order, given dim_customer(customer_id, segment, valid_from, valid_to).</summary>

```
SELECT o.*, d.segment
FROM orders o
LEFT JOIN dim_customer d
  ON d.customer_id = o.customer_id
 AND o.ordered_at >= d.valid_from
 AND o.ordered_at <  d.valid_to;
```

Half-open ranges guarantee one match per order. A `LEFT JOIN` keeps orders whose customer has no version covering that time, which you should then investigate (often a late-arriving dimension record).

</details>

<details><summary>How would you check that a Type 2 dimension is consistent?</summary>

Check that no key has more than one current row (`GROUP BY key HAVING COUNT(*) > 1` on current rows), that no two versions of a key overlap (self join on `a.valid_from < b.valid_to AND b.valid_from < a.valid_to`), and that consecutive versions have no gaps (`LEAD(valid_from)` equals `valid_to`). Also check that every fact row finds exactly one version in a point-in-time join.

</details>

## Key takeaways

- Top N per group is a ranking window function in a CTE (or `QUALIFY`), filtered outside; choose `ROW_NUMBER`, `RANK` or `DENSE_RANK` by how ties should behave.
- Deduplicate to the latest record with `ROW_NUMBER() OVER (PARTITION BY key ORDER BY source_time DESC, tiebreaker DESC) = 1`, and drop deletes after ranking.
- Order by the source's change time or sequence, not load time, so late-arriving data cannot win.
- Make deduplication idempotent: merge on the business key and only apply newer changes.
- A Type 2 dimension stores half-open validity ranges; query current rows with `is_current`, history with an as-of filter, and facts with a point-in-time range join.
- Detect real changes with `IS DISTINCT FROM`, and test SCD tables for duplicate current rows, overlaps and gaps.

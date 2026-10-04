---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "SQL Data Engineering Cheat Sheet"
description: "A quick SQL reference for Data Engineers: join types, aggregation, window functions, deduplication, upserts and the mistakes that change row counts."
inventoryId: "CHEAT-01"
technology: ["sql"]
topic: ["reference"]
cheatTopic: "SQL"
related: ["articles:sql/joins", "articles:sql/window-functions"]
versionContext: "Standard SQL; QUALIFY and MERGE syntax vary by engine"
---

## Joins

| Join | Returns |
|------|---------|
| `INNER JOIN` | Only matching rows |
| `LEFT JOIN` | All left rows; `NULL` where no match |
| `FULL OUTER JOIN` | All rows from both sides |
| `CROSS JOIN` | Every combination (rows × rows) |
| `WHERE NOT EXISTS (...)` | Anti-join: left rows with no match |

Conditions on the right table of a `LEFT JOIN` belong in `ON`, not `WHERE`.

## Aggregation

```sql
SELECT customer_id, COUNT(*) AS orders, SUM(amount) AS revenue
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 1000;   -- HAVING filters groups, WHERE filters rows
```

## Window functions

```sql
ROW_NUMBER() OVER (PARTITION BY k ORDER BY ts DESC)  -- unique sequence
RANK()       OVER (ORDER BY score DESC)              -- ties share, gaps after
DENSE_RANK() OVER (ORDER BY score DESC)              -- ties share, no gaps
LAG(x)  OVER (PARTITION BY k ORDER BY ts)            -- previous row
LEAD(x) OVER (PARTITION BY k ORDER BY ts)            -- next row
SUM(x)  OVER (PARTITION BY k ORDER BY ts
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)  -- running total
```

## Keep the latest row per key

```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn
  FROM raw_customers
)
SELECT * FROM ranked WHERE rn = 1;
```

## Idempotent writes

```sql
-- Replace one day
DELETE FROM fact_orders WHERE order_date = DATE '2026-10-03';
INSERT INTO fact_orders SELECT * FROM staging WHERE order_date = DATE '2026-10-03';

-- Upsert (syntax varies by engine)
MERGE INTO dim_customer t
USING staging_customer s ON t.customer_id = s.customer_id
WHEN MATCHED THEN UPDATE SET name = s.name
WHEN NOT MATCHED THEN INSERT (customer_id, name) VALUES (s.customer_id, s.name);
```

## Row-count traps

- Joining on a non-unique key multiplies rows.
- `NULL` never equals `NULL` in a join condition.
- `NOT IN` with a `NULL` in the subquery returns nothing; prefer `NOT EXISTS`.
- `COUNT(col)` skips `NULL`s; `COUNT(*)` does not.

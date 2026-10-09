---
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Snowflake Cheat Sheet"
description: "A quick Snowflake reference: warehouses, loading, streams and tasks, dynamic tables, Time Travel, cloning, clustering, caches, security and cost-control habits."
inventoryId: "CHEAT-05"
technology: ["snowflake"]
topic: ["reference"]
cheatTopic: "Snowflake"
related: ["articles:snowflake/architecture-virtual-warehouses", "articles:snowflake/micro-partitions-clustering-pruning", "articles:snowflake/streams-and-tasks", "articles:snowflake/cost-optimization"]
versionContext: "Describes Snowflake behaviour as documented in October 2026; SQL examples were not executed against a Snowflake account. Edition-specific features are noted"
---

## Warehouses

<!-- noexec -->
```sql
CREATE WAREHOUSE etl_wh WAREHOUSE_SIZE = 'SMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;
ALTER WAREHOUSE etl_wh SET WAREHOUSE_SIZE = 'MEDIUM';          -- scale up: heavy queries, spilling
ALTER WAREHOUSE bi_wh SET MIN_CLUSTER_COUNT = 1 MAX_CLUSTER_COUNT = 4
  SCALING_POLICY = 'STANDARD';                                -- scale out: queueing (Enterprise+)
ALTER WAREHOUSE etl_wh SUSPEND;
```

| Fact | Value |
|------|-------|
| Credits per hour (standard Gen1) | XS 1, S 2, M 4, L 8, XL 16, doubling per size |
| Billing | Per second while running, 60-second minimum per resume |
| Default `AUTO_SUSPEND` (SQL) | 600 seconds |
| Cloud services | Billed only above 10% of daily warehouse credits |

## Loading files

<!-- noexec -->
```sql
CREATE STAGE raw_stage URL = 's3://bucket/raw/' STORAGE_INTEGRATION = my_integration;
COPY INTO raw.orders
FROM @raw_stage/orders/
FILE_FORMAT = (TYPE = 'CSV' SKIP_HEADER = 1)
ON_ERROR = 'ABORT_STATEMENT';

CREATE PIPE raw.orders_pipe AUTO_INGEST = TRUE AS
  COPY INTO raw.orders FROM @raw_stage/orders/ FILE_FORMAT = (TYPE = 'CSV' SKIP_HEADER = 1);
```

| | Bulk `COPY` | Snowpipe | Snowpipe Streaming |
|--|-------------|----------|--------------------|
| Input | Staged files | Staged files, on notification | Rows through an SDK or the Kafka connector |
| Compute | Your warehouse | Serverless | Serverless |
| Latency | Your schedule | About a minute | Seconds |
| Load history | 64 days, on the table | 14 days, on the pipe | Offset tokens per channel |
| `ON_ERROR` default | `ABORT_STATEMENT` | `SKIP_FILE` | n/a |

`COPY INTO` skips files already loaded (same name and checksum) unless `FORCE = TRUE`.

## Upsert

<!-- noexec -->
```sql
MERGE INTO dim_customer t
USING stg_customer s ON t.customer_id = s.customer_id
WHEN MATCHED THEN UPDATE SET t.city = s.city
WHEN NOT MATCHED THEN INSERT (customer_id, city) VALUES (s.customer_id, s.city);
```

## Streams, tasks and dynamic tables

<!-- noexec -->
```sql
CREATE STREAM raw.customers_stream ON TABLE raw.customers;        -- APPEND_ONLY = TRUE for inserts only
CREATE TASK apply_customers
  WAREHOUSE = transform_wh SCHEDULE = '5 MINUTE'                   -- omit WAREHOUSE for serverless
  WHEN SYSTEM$STREAM_HAS_DATA('raw.customers_stream')
AS MERGE INTO analytics.dim_customer t
   USING (SELECT * FROM raw.customers_stream
          WHERE NOT (METADATA$ACTION = 'DELETE' AND METADATA$ISUPDATE)) s   -- drop update before-images
   ON t.customer_id = s.customer_id
   WHEN MATCHED AND s.METADATA$ACTION = 'DELETE' THEN DELETE
   WHEN MATCHED AND s.METADATA$ACTION = 'INSERT' THEN UPDATE SET t.tier = s.tier
   WHEN NOT MATCHED AND s.METADATA$ACTION = 'INSERT' THEN INSERT (customer_id, tier) VALUES (s.customer_id, s.tier);
ALTER TASK apply_customers RESUME;                                 -- tasks are created suspended

CREATE DYNAMIC TABLE analytics.sku_daily TARGET_LAG = '15 minutes' WAREHOUSE = transform_wh
AS SELECT sku, SUM(qty) AS units FROM analytics.order_items GROUP BY sku;
```

- A stream's offset moves only when a DML statement that reads it commits; one stream per consumer.
- Streams go stale outside retention (extended up to `MAX_DATA_EXTENSION_TIME_IN_DAYS`, default 14).

## Time Travel and cloning

<!-- noexec -->
```sql
SELECT * FROM orders AT (OFFSET => -60 * 60);           -- one hour ago
SELECT * FROM orders BEFORE (STATEMENT => '<query_id>');
UNDROP TABLE orders;
CREATE TABLE orders_backup CLONE orders;                 -- zero-copy clone
CREATE TABLE orders_fix CLONE orders BEFORE (STATEMENT => '<query_id>');
```

| Table type | Time Travel | Fail-safe |
|------------|-------------|-----------|
| Permanent | 1 day default; up to 1 (Standard) or 90 days (Enterprise+) | 7 days, Snowflake Support only |
| Transient | 0 or 1 day | None |
| Temporary | 0 or 1 day, ends with the session | None |

## Clustering and search optimization

<!-- noexec -->
```sql
ALTER TABLE sales CLUSTER BY (sale_date);
SELECT SYSTEM$CLUSTERING_INFORMATION('sales', '(sale_date)');
ALTER TABLE events ADD SEARCH OPTIMIZATION ON EQUALITY(customer_id);   -- Enterprise+
```

Cluster large tables on columns used in selective range filters; use search optimization for needle-in-a-haystack lookups.

## Caches

| Cache | Needs a warehouse? | Invalidated by |
|-------|--------------------|----------------|
| Result cache | No | Any change to the underlying tables; 24 hours unused (max 31 days) |
| Warehouse (local disk) cache | Yes | Warehouse suspend or resize |
| Metadata | No | Always current; answers `COUNT(*)`, `MIN`/`MAX` on some types |

## Semi-structured data

<!-- noexec -->
```sql
SELECT payload:customer.id::STRING AS customer_id, f.value:sku::STRING AS sku
FROM raw.events, LATERAL FLATTEN(INPUT => payload:items, OUTER => TRUE) f;
```

## Security

| Tool | Use |
|------|-----|
| Access roles + functional roles under `SYSADMIN` | Scalable RBAC |
| Future grants, managed access schemas | Consistent grants on new objects |
| Masking policy (Enterprise+) | Column values by role, with `IS_ROLE_IN_SESSION` |
| Row access policy (Enterprise+) | Rows by role or account, one per table |
| Network policy + network rules | Restrict client origins; user level overrides account |

## Cost habits

| Habit | Why |
|-------|-----|
| Auto-suspend on every warehouse | Stop paying when idle |
| One warehouse per workload | Size and attribute cost separately |
| Check "partitions scanned" in the query profile | Fix pruning before scaling up |
| Transient tables for rebuildable staging | No Fail-safe storage |
| Resource monitors on warehouses, budgets for serverless | Monitors do not cover serverless features |

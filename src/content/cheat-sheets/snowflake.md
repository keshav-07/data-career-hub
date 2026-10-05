---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Snowflake Cheat Sheet"
description: "A quick Snowflake reference: warehouses, loading data, time travel, cloning, clustering, query profiling and the habits that keep compute costs under control."
inventoryId: "CHEAT-05"
technology: ["snowflake"]
topic: ["reference"]
cheatTopic: "Snowflake"
related: ["articles:snowflake/architecture-virtual-warehouses", "articles:snowflake/micro-partitions-clustering-pruning"]
versionContext: "Describes Snowflake behaviour as documented in 2026; SQL examples were not executed against a Snowflake account. Edition-specific features are noted"
---

## Warehouses

```sql
CREATE WAREHOUSE etl_wh WAREHOUSE_SIZE = 'SMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
ALTER WAREHOUSE etl_wh SET WAREHOUSE_SIZE = 'MEDIUM';
ALTER WAREHOUSE etl_wh SUSPEND;
USE WAREHOUSE etl_wh;
```

## Loading files

```sql
CREATE STAGE raw_stage URL = 's3://bucket/raw/' STORAGE_INTEGRATION = my_integration;
COPY INTO raw.orders
FROM @raw_stage/orders/
FILE_FORMAT = (TYPE = 'CSV' SKIP_HEADER = 1)
ON_ERROR = 'ABORT_STATEMENT';
```

`COPY INTO` tracks which files were already loaded and skips them on rerun by default.

## Upsert

```sql
MERGE INTO dim_customer t
USING stg_customer s ON t.customer_id = s.customer_id
WHEN MATCHED THEN UPDATE SET t.city = s.city
WHEN NOT MATCHED THEN INSERT (customer_id, city) VALUES (s.customer_id, s.city);
```

## Time Travel and cloning

```sql
SELECT * FROM orders AT (OFFSET => -60 * 60);           -- one hour ago
SELECT * FROM orders BEFORE (STATEMENT => '<query_id>');
UNDROP TABLE orders;
CREATE TABLE orders_backup CLONE orders;                 -- zero-copy clone
```

Retention depends on edition and table settings.

## Clustering

```sql
ALTER TABLE sales CLUSTER BY (sale_date);
SELECT SYSTEM$CLUSTERING_INFORMATION('sales', '(sale_date)');
```

## Semi-structured data

```sql
SELECT payload:customer.id::STRING AS customer_id
FROM raw.events;                       -- VARIANT path access with a cast
```

## Cost habits

| Habit | Why |
|-------|-----|
| Auto-suspend on every warehouse | Stop paying when idle |
| One warehouse per workload | Size and attribute cost separately |
| Check "partitions scanned" in the query profile | Fix pruning before scaling up |
| Resource monitors | Alert or suspend at credit limits |

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Databricks Cheat Sheet"
description: "A quick Databricks reference: Unity Catalog names and grants, Delta table operations, medallion layers, job design and the compute choices that keep costs down."
inventoryId: "CHEAT-06"
technology: ["databricks", "delta-lake"]
topic: ["reference"]
cheatTopic: "Databricks"
related: ["articles:databricks/workspace-jobs-lakehouse", "articles:databricks/unity-catalog-governance", "articles:delta-lake/transactions-schema-evolution"]
versionContext: "Describes Databricks as documented in 2026; Databricks renames products frequently, so check current names. Examples were not executed in a Databricks workspace"
---

## Unity Catalog names and grants

```sql
USE CATALOG prod;
CREATE SCHEMA IF NOT EXISTS prod.sales;
GRANT USE CATALOG ON CATALOG prod TO `analysts`;
GRANT USE SCHEMA  ON SCHEMA prod.sales TO `analysts`;
GRANT SELECT      ON TABLE prod.sales.orders TO `analysts`;
SHOW GRANTS ON TABLE prod.sales.orders;
```

## Delta table operations

```sql
CREATE TABLE prod.sales.orders (order_id BIGINT, amount DECIMAL(12,2), order_date DATE);
MERGE INTO prod.sales.orders t USING updates s ON t.order_id = s.order_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *;
DESCRIBE HISTORY prod.sales.orders;
SELECT * FROM prod.sales.orders VERSION AS OF 12;
OPTIMIZE prod.sales.orders;
VACUUM prod.sales.orders;          -- removes unreferenced files past retention
```

## PySpark against Unity Catalog

```python
df = spark.table("prod.sales.orders")
(df.filter("order_date = '2026-10-01'")
   .write.mode("overwrite")
   .option("replaceWhere", "order_date = '2026-10-01'")
   .saveAsTable("prod.sales.orders_daily"))
```

`replaceWhere` overwrites only the matching slice, which keeps daily reloads idempotent.

## Medallion layers

| Layer | Contents |
|-------|----------|
| Bronze | Raw, append-only, with ingestion metadata |
| Silver | Cleaned, typed, deduplicated |
| Gold | Business aggregates and models |

## Jobs and compute

- Production: job compute or serverless jobs, never a shared interactive cluster.
- Pass the processing date as a job parameter; make every task idempotent.
- Enable auto-termination on interactive clusters.
- Run jobs as a service principal with minimal grants.

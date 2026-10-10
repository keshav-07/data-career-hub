---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What caches does Snowflake use, and when does each one help?"
seoTitle: "Snowflake Caching Layers: Interview Answer"
description: "Interview answer: the result cache returns repeated results without a warehouse, the warehouse cache keeps read data on local SSD until suspend, and metadata answers some queries."
technology: ["snowflake"]
topic: ["caching", "performance", "virtual-warehouses"]
difficulty: "Easy"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "Snowflake has three caching layers. The result cache, in cloud services, stores each query's result for 24 hours after last use (up to 31 days) and returns it without any warehouse when the same query runs again, the underlying data has not changed and the role has access; any change to the tables invalidates it. The warehouse (local disk) cache keeps micro-partition data a running warehouse has read on its nodes' SSD and memory, so later queries on that warehouse read locally; it is lost when the warehouse suspends or is resized. The metadata cache holds micro-partition statistics used for pruning and can answer queries such as an unfiltered COUNT(*) without a warehouse. Turn the result cache off with USE_CACHED_RESULT = FALSE when benchmarking."
followUps: ["Why might a dashboard never hit the result cache?", "How does AUTO_SUSPEND interact with the warehouse cache?", "Does the result cache work across users?", "Why is the second run of a query faster even after the data changed?"]
related: ["articles:snowflake/architecture-virtual-warehouses", "articles:snowflake/cost-optimization", "interview-questions:snowflake/virtual-warehouses"]
versionContext: "Snowflake behaviour as documented in October 2026. Snowflake SQL is not executed here (noexec)."
sources:
  - { label: "Snowflake documentation: Using persisted query results", url: "https://docs.snowflake.com/en/user-guide/querying-persisted-results" }
  - { label: "Snowflake documentation: Optimizing the warehouse cache", url: "https://docs.snowflake.com/en/user-guide/performance-query-warehouse-cache" }
---

## Detailed explanation

| Cache | Lives in | Needs a running warehouse | Invalidated by |
|-------|----------|---------------------------|----------------|
| Result cache | Cloud services | No | A change to any table the query reads; 24 hours without reuse (31 days maximum) |
| Warehouse (local disk) cache | The warehouse's nodes | Yes | Suspend, resize |
| Metadata | Cloud services | No | Always current |

**Result cache reuse conditions** (simplified): the new query matches the earlier one, the data has not changed, it does not use functions evaluated at run time such as `CURRENT_TIMESTAMP()` or excluded features, and the role has the required privileges. It is shared across users and warehouses.

**Warehouse cache** helps when similar queries hit the same warehouse in a short period, typical for BI. It explains why a query is faster the second time even after a table change: the result cache is invalidated, but most micro-partitions are still on local SSD. The profile shows "Percentage scanned from cache".

**Metadata** answers some aggregates (unfiltered `COUNT(*)`, `MIN`/`MAX` on some types) and powers pruning.

## Example

A dashboard query takes 8 s, then 50 ms, then 3 s after a small insert:

<!-- noexec -->
```sql
SELECT region, SUM(amount) FROM sales.orders WHERE order_date >= '2026-10-01' GROUP BY region;
-- run 1: 8 s, warehouse reads from remote storage (cold cache)
-- run 2: 50 ms, result cache, no warehouse used
INSERT INTO sales.orders VALUES (...);   -- invalidates the cached result
-- run 3: 3 s, executes again, mostly from the warehouse's local cache

ALTER SESSION SET USE_CACHED_RESULT = FALSE;   -- for honest benchmarks
```

Design implications:

- **BI warehouses**: a few minutes of `AUTO_SUSPEND` keeps the local cache warm and avoids resume delays.
- **Dashboards over trickle-fed tables**: per-minute inserts invalidate the result cache every minute. Refresh the mart in batches (a dynamic table target lag or a scheduled task) so dashboards hit the cache in between.
- **Tools that add comments or changing literals** to each query defeat reuse.

## Trade-offs and pitfalls

- **Short auto-suspend** saves idle credits but empties the warehouse cache on every suspend.
- **Separate warehouses do not share local caches**, so splitting one BI workload across many warehouses lowers hit rates.
- **Benchmarking with caches on** produces unrealistically fast numbers.

## Common mistakes

1. Naming only the result cache.
2. Expecting the result cache to survive a table change.
3. Assuming the warehouse cache helps another warehouse.

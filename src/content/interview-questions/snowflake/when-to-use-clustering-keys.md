---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "When should you define a clustering key on a Snowflake table?"
seoTitle: "Snowflake Clustering Keys: When to Use Them"
description: "Interview answer: cluster only large, often-queried tables whose selective filters prune poorly today, choose coarse keys from real filters, and weigh reclustering cost."
technology: ["snowflake"]
topic: ["clustering", "micro-partitions", "performance"]
difficulty: "Medium"
questionType: ["optimization", "scenario"]
estimatedMinutes: 9
interviewRelevance: "High"
shortAnswer: "A clustering key is worth it when the table is large (many micro-partitions, typically multi-terabyte), important queries filter or join selectively on columns that are not naturally clustered, the query profile shows poor pruning (most partitions scanned for few rows), and the table is read far more often than it changes, so Automatic Clustering's serverless cost is repaid by query savings. Choose the key from real filter columns, coarsen high-cardinality ones (TO_DATE(event_ts) rather than the raw timestamp), keep it to a few columns ordered from lower to higher cardinality, estimate the cost first and measure partitions scanned before and after. For needle-in-a-haystack lookups, search optimization usually fits better."
followUps: ["What does SYSTEM$CLUSTERING_INFORMATION tell you?", "Why is clustering on a unique ID a bad idea?", "How does natural clustering arise?", "How do you decide between a clustering key and search optimization?"]
related: ["articles:snowflake/micro-partitions-clustering-pruning", "interview-questions:snowflake/micro-partitions-performance", "articles:data-warehousing/partitioning-clustering-data-layout"]
versionContext: "Snowflake behaviour as documented in October 2026, including the Optima Clustering engine used for newly clustered tables from September 2026. Snowflake SQL is not executed here (noexec); the pruning model runs on plain Python 3.11."
sources:
  - { label: "Snowflake documentation: Clustering keys and clustered tables", url: "https://docs.snowflake.com/en/user-guide/tables-clustering-keys" }
  - { label: "Snowflake documentation: Automatic Clustering", url: "https://docs.snowflake.com/en/user-guide/tables-auto-reclustering" }
---

## Detailed explanation

Snowflake prunes micro-partitions by comparing a query's filter with each micro-partition's min/max metadata. Data loaded in time order is **naturally clustered** on its time columns, so date filters prune well for free. Filters on other columns (customer, region, product) often prune badly because every micro-partition contains the full range of values.

A clustering key asks **Automatic Clustering**, a serverless service, to keep rows with similar key values together. It costs credits (proportional to how much the table changes) and creates new micro-partitions, which temporarily adds Time Travel and Fail-safe storage. So the decision is a cost-benefit one:

| Condition | Why it matters |
|-----------|----------------|
| Large table | Few micro-partitions means little to prune anyway |
| Frequent, selective filters on the candidate columns | The saving repeats on every query |
| Poor pruning today | Evidence the layout, not the warehouse, is the bottleneck |
| High read-to-write ratio | Churn de-clusters the table and drives reclustering cost |

**Choosing the key**: columns from real `WHERE` and join clauses; coarsen high-cardinality columns with expressions; at most three or four columns; lower cardinality first. Avoid unique IDs, booleans and columns nobody filters on.

## Example

<!-- noexec -->
```sql
-- 1. Evidence: partitions scanned versus total for the important query (query profile or history)
SELECT query_id, partitions_scanned, partitions_total, total_elapsed_time / 1000 AS seconds
FROM snowflake.account_usage.query_history
WHERE query_parameterized_hash = '<hash of the dashboard query>'
ORDER BY start_time DESC LIMIT 10;

-- 2. How well is the table clustered on the candidate key today?
SELECT SYSTEM$CLUSTERING_INFORMATION('sales.orders', '(TO_DATE(order_ts), region)');

-- 3. What would it cost?
SELECT SYSTEM$ESTIMATE_AUTOMATIC_CLUSTERING_COSTS('sales.orders', '(TO_DATE(order_ts), region)');

-- 4. Apply, let it settle, then re-measure step 1 and track the cost
ALTER TABLE sales.orders CLUSTER BY (TO_DATE(order_ts), region);
SELECT SUM(credits_used) FROM snowflake.account_usage.automatic_clustering_history
WHERE table_name = 'ORDERS' AND start_time >= DATEADD('day', -14, CURRENT_TIMESTAMP());
```

Why ordering the data matters, as a small model of min/max pruning on 20 micro-partitions:

```python
import random

random.seed(7)
rows = [(day, random.choice(["EU", "US", "APAC", "LATAM"])) for day in range(20) for _ in range(500)]

def parts(data, size=500):
    return [data[i:i + size] for i in range(0, len(data), size)]

def scanned(partitions, region):
    # a partition is skipped only if its min..max range of region cannot contain the value
    return sum(1 for p in partitions if min(r for _, r in p) <= region <= max(r for _, r in p))

by_load_order = parts(rows)                               # naturally clustered on day only
by_region = parts(sorted(rows, key=lambda r: (r[1], r[0])))  # what clustering on region achieves
print("filter region = 'EU': load order scans", scanned(by_load_order, "EU"),
      "of 20 | clustered on region scans", scanned(by_region, "EU"), "of 20")
```

```text
filter region = 'EU': load order scans 20 of 20 | clustered on region scans 7 of 20
```

## Trade-offs and pitfalls

- **Churn**: tables with constant scattered updates de-cluster continuously and reclustering never stops.
- **Bigger warehouse instead**: costs more on every query and still scans everything.
- **One key per table**: you cannot cluster for every filter. Pick the most valuable pattern; add search optimization for selective lookups on other columns, or a materialized view with a different clustering.
- **Billing changed in 2026**: newly clustered tables use Optima Clustering, billed by data ingested into the clustered table; older ones stay on Clustering Classic. Check which applies before estimating.

## Common mistakes

1. Clustering small tables.
2. Clustering on a raw timestamp or unique ID.
3. Not measuring before and after.

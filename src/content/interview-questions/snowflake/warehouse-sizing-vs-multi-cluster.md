---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Should you scale a Snowflake warehouse up or out?"
seoTitle: "Snowflake Scale Up vs Multi-Cluster: Interview"
description: "Interview answer: scale up for slow, heavy queries that spill or barely parallelise, scale out with multi-cluster warehouses for queueing, and fix pruning before either."
technology: ["snowflake"]
topic: ["virtual-warehouses", "concurrency", "cost"]
difficulty: "Medium"
questionType: ["optimization", "scenario"]
estimatedMinutes: 9
interviewRelevance: "High"
shortAnswer: "Scaling up (a larger size) gives each query more CPU, memory and local disk, so it helps individual heavy queries: big joins, sorts, spilling to remote storage. Scaling out (a multi-cluster warehouse, Enterprise Edition or higher) adds clusters of the same size when queries queue, so it helps concurrency but never speeds up one query. Diagnose first: a query that is slow even when run alone, with spilling, points to scaling up; queries that are fast alone but wait in QUEUED_OVERLOAD_TIME at busy hours point to scaling out; queries that scan almost every micro-partition need better pruning, not more compute. Cost is size × running time, so a bigger size is only free if it roughly halves the run time."
followUps: ["What are the Standard and Economy scaling policies?", "Why can MIN_CLUSTER_COUNT above 1 be expensive?", "What does TRANSACTION_BLOCKED_TIME tell you?", "How would you size a warehouse for a new dbt project?"]
related: ["articles:snowflake/virtual-warehouses-scaling", "interview-questions:snowflake/virtual-warehouses", "interview-questions:snowflake/reduce-snowflake-costs", "articles:snowflake/cost-optimization"]
versionContext: "Credit rates are the documented rates for first-generation standard warehouses (October 2026); other warehouse types and generations differ. Snowflake SQL is not executed here (noexec); the cost comparison runs on plain Python 3.11 with example timings."
sources:
  - { label: "Snowflake documentation: Warehouse considerations", url: "https://docs.snowflake.com/en/user-guide/warehouses-considerations" }
  - { label: "Snowflake documentation: Multi-cluster warehouses", url: "https://docs.snowflake.com/en/user-guide/warehouses-multicluster" }
---

## Detailed explanation

| Symptom | Evidence | Lever |
|---------|----------|-------|
| One query is slow even alone | Query profile shows large `bytes spilled to remote storage`, long join or sort operators | Scale **up** one size and compare |
| Queries are fast alone but slow at 9 a.m. | `QUEUED_OVERLOAD_TIME` in `QUERY_HISTORY`, queued load in `WAREHOUSE_LOAD_HISTORY` | Scale **out**: multi-cluster auto-scale |
| Queries scan nearly all partitions | `partitions_scanned` close to `partitions_total` | Neither: fix filters, clustering or the model |
| Long `TRANSACTION_BLOCKED_TIME` | Lock waits on the same table | Neither: fix conflicting DML |

**Multi-cluster settings**: `MIN_CLUSTER_COUNT` and `MAX_CLUSTER_COUNT` (equal for maximized mode, different for auto-scale), and `SCALING_POLICY`: `STANDARD` starts clusters as soon as queries queue (BI), `ECONOMY` waits until there is enough work to keep a new cluster busy for about six minutes (batch).

**Cost arithmetic**: each size doubles credits per hour (X-Small 1, Small 2, Medium 4, Large 8 for standard Gen1). Billing is per second with a 60-second minimum per resume. Each running cluster of a multi-cluster warehouse bills at the warehouse size.

## Example

Example timings for one nightly job measured at three sizes:

```python
rates = {"MEDIUM": 4, "LARGE": 8, "XLARGE": 16}        # credits per hour, standard Gen1
minutes = {"MEDIUM": 40, "LARGE": 21, "XLARGE": 17}    # measured elapsed time of the job

for size, mins in minutes.items():
    credits = rates[size] * mins / 60
    print(f"{size:7} {mins:3} min  {credits:5.2f} credits")
```

```text
MEDIUM   40 min   2.67 credits
LARGE    21 min   2.80 credits
XLARGE   17 min   4.53 credits
```

Large almost halves the time for about the same credits, so it is a good choice if the deadline matters. X-Large saves four more minutes for 60% more credits: the job no longer parallelises well, so stop there.

For a BI warehouse that queues at peak:

<!-- noexec -->
```sql
ALTER WAREHOUSE bi_wh SET
  WAREHOUSE_SIZE = 'SMALL'
  MIN_CLUSTER_COUNT = 1
  MAX_CLUSTER_COUNT = 4
  SCALING_POLICY = 'STANDARD'
  AUTO_SUSPEND = 300;
```

Four Small clusters cost as much per hour as one Large, but they only run while the queue needs them.

## Trade-offs and pitfalls

- **Scaling up for concurrency** works a little (a bigger cluster runs more at once) but doubles the price of every minute, even off-peak.
- **`MIN_CLUSTER_COUNT` above 1** runs the extra clusters whenever the warehouse is on.
- **Memory-bound work**: lowering `MAX_CONCURRENCY_LEVEL` on a dedicated warehouse gives each query more memory, as an alternative to a size step.
- **Separate workloads** onto their own warehouses before tuning either lever.
- **Edition**: multi-cluster warehouses need Enterprise Edition or higher.

## Common mistakes

1. Adding clusters to speed up a single ETL query.
2. Upsizing before checking pruning.
3. Ignoring the queue metrics and guessing.

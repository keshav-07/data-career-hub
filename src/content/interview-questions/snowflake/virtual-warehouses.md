---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "What are Snowflake virtual warehouses?"
seoTitle: "Snowflake Virtual Warehouses: Interview Answer"
description: "Interview answer: Snowflake virtual warehouses are independent compute over shared storage, billed per use, scaled up for heavy queries, out for concurrency."
inventoryId: "INT-20"
technology: ["snowflake"]
topic: ["compute", "cost"]
difficulty: "Easy"
questionType: ["conceptual"]
estimatedMinutes: 6
interviewRelevance: "High"
shortAnswer: "A virtual warehouse is an independent compute cluster that runs queries against Snowflake's shared storage. You choose its size, and it is billed only while running, with auto-suspend and auto-resume to stop paying when idle. Because warehouses are independent, different workloads can use separate warehouses without slowing each other down; you scale up a warehouse for heavy queries and scale out with multi-cluster warehouses for many concurrent users."
followUps: ["When would you scale up versus scale out?", "How would you reduce Snowflake compute cost?", "What happens to the warehouse cache when it suspends?"]
related: ["articles:snowflake/architecture-virtual-warehouses"]
versionContext: "Describes Snowflake behaviour as documented in 2026; SQL examples were not executed against a Snowflake account. Edition-specific features are noted"
---

## Detailed explanation

- **Independent**: each warehouse has its own compute; a heavy transformation on one does not affect dashboards on another.
- **Shared data**: all warehouses read the same storage, so no data is copied.
- **Elastic**: resize at any time; suspend when idle.

| Problem | Response |
|---------|----------|
| Single large query is slow | Larger warehouse, after checking pruning |
| Many users, queries queueing | Multi-cluster (scale out) |
| High idle cost | Shorter auto-suspend, separate small warehouses |

## Common mistakes

1. Using one warehouse for everything.
2. Scaling up to fix queueing.
3. Forgetting that suspending clears the local cache, so the first queries after resume may be slower.

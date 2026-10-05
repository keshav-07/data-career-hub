---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "How do micro-partitions affect Snowflake query performance?"
seoTitle: "Snowflake Micro-Partitions: Interview Answer"
description: "Interview answer: Snowflake prunes micro-partitions using per-column min/max metadata, so data layout and clustering decide how much a query must scan."
inventoryId: "INT-21"
technology: ["snowflake"]
topic: ["micro-partitions", "performance"]
difficulty: "Medium"
questionType: ["conceptual", "optimization"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "Snowflake stores each table as many small immutable micro-partitions and keeps metadata such as the minimum and maximum value of every column in each one. When a query filters on a column, Snowflake skips micro-partitions whose ranges cannot match, which is called pruning. So performance depends on data layout: if values of the filtered column are well clustered, most partitions are skipped; if they are scattered, the query scans almost everything, and a clustering key may help on very large tables."
followUps: ["How can you tell from the query profile whether pruning worked?", "When is a clustering key worth its cost?", "Why might a query on a well-clustered table still scan everything?"]
related: ["articles:snowflake/micro-partitions-clustering-pruning", "articles:data-warehousing/partitioning-clustering-data-layout"]
versionContext: "Describes Snowflake behaviour as documented in 2026; SQL examples were not executed against a Snowflake account. Edition-specific features are noted"
---

## Detailed explanation

1. Each micro-partition has per-column min/max metadata.
2. Filters are compared against that metadata before any data is read.
3. Well-clustered data means narrow, non-overlapping ranges, so more is skipped.

Check **partitions scanned versus total** in the query profile. Poor pruning on a large table with a frequent filter is the signal to consider `CLUSTER BY`.

## Why pruning might fail

- Filter wraps the column in a function or casts it.
- Values are scattered (for example, loads not ordered by the filtered column).
- The filter is on a column joined from another table rather than the scanned table.

## Common mistakes

1. Clustering small or rarely queried tables.
2. Choosing a unique-id clustering key.

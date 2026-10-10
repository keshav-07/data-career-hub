---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "OPTIMIZE, Z-ORDER or liquid clustering: which would you use on a Delta table?"
seoTitle: "Delta Z-ORDER vs Liquid Clustering: Interview"
description: "Delta OPTIMIZE, Z-ORDER and liquid clustering interview answer: what each does to file layout, how they enable data skipping, and when to use each."
technology: ["delta-lake", "spark"]
topic: ["performance", "data-layout"]
difficulty: "Medium"
questionType: ["conceptual", "optimization", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "OPTIMIZE alone compacts small files into larger ones; it fixes file count but not which rows share a file. Z-ORDER BY sorts rows along a space-filling curve across one to three columns during OPTIMIZE, so each file covers a narrow range and filters can skip files using the min/max statistics in the log; it rewrites everything in scope each run. Liquid clustering declares clustering columns on the table, clusters incrementally on each OPTIMIZE, lets you change the keys without rewriting data, and replaces both partitioning and Z-order, with which it cannot be combined. For a new table on a recent Delta version I would use liquid clustering on the main filter and merge columns, and keep coarse date partitioning only where engines or retention jobs need it."
followUps: ["Why do queries still scan every file after OPTIMIZE?", "Why is Z-ordering on many columns less effective?", "How does clustering on the MERGE key help merges?", "What does OPTIMIZE do to a streaming reader of the table?"]
related: ["articles:delta-lake/optimize-zorder-vacuum-liquid-clustering", "articles:data-warehousing/partitioning-clustering-data-layout", "interview-questions:delta-lake/vacuum-retention-risks"]
versionContext: "Behaviour checked with PySpark 4.2.0 and delta-spark 4.4.0 (open-source Delta)"
sources:
  - { label: "Delta Lake documentation: Optimizations", url: "https://docs.delta.io/optimizations-oss/" }
  - { label: "Delta Lake documentation: Liquid clustering", url: "https://docs.delta.io/delta-clustering/" }
---

## Detailed explanation

Data skipping in Delta compares a query's filter with each file's min/max statistics stored in the transaction log. It can only skip a file whose range excludes the value, so the layout of rows across files decides how much is read.

| | Compaction (`OPTIMIZE`) | `OPTIMIZE ... ZORDER BY` | Liquid clustering (`CLUSTER BY`) |
|---|---|---|---|
| Changes | File sizes | File sizes and row order across files | File sizes and row order across files |
| Incremental | Yes | No, rewrites all data in scope | Yes, only files not yet clustered |
| Change the key | Not applicable | Choose different columns next run | `ALTER TABLE ... CLUSTER BY`, no rewrite |
| Combine with partitioning | Yes | Yes (Z-order within partitions) | No |

## Example

In a local test with 100,000 rows in 40 small files, every file covered almost the full `customer_id` range of -999 to 999 before and after compaction. After `OPTIMIZE ... ZORDER BY (customer_id)` each output file covered roughly 140 values, so a lookup for one customer reads one or two files. Creating the table with liquid clustering gives the same effect on each `OPTIMIZE`:

<!-- noexec -->
```sql
CREATE TABLE events (event_id BIGINT, customer_id INT, event_date DATE, amount DOUBLE)
USING delta CLUSTER BY (customer_id);

OPTIMIZE events;                                   -- clusters incrementally
ALTER TABLE events CLUSTER BY (event_date, customer_id);   -- change keys later
```

## Trade-offs and pitfalls

- Z-ordering several columns spreads the clustering benefit thinner on each; keep to the few most selective filter columns.
- Clustering only helps on columns that have statistics (the first 32 columns by default) and appear in filters or merge conditions.
- New writes land unclustered until the next `OPTIMIZE`, so schedule it.
- Liquid clustering is a table feature: every engine reading or writing the table must support it.
- `OPTIMIZE` commits are marked as not changing data, so streaming readers do not reprocess them, but they can conflict with concurrent `DELETE`, `UPDATE` or `MERGE` on the same files.

## Common mistakes

1. Partitioning by a high-cardinality column such as user ID, which creates millions of tiny files.
2. Expecting compaction alone to make selective filters fast.
3. Trying to `ZORDER BY` on a liquid-clustered table (Delta rejects it).

---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you choose a partitioning strategy for a large table?"
seoTitle: "Partitioning a Large Table: Interview Answer"
description: "Table partitioning strategy, interview answer: partition by the column most queries filter on, usually a date, keep partitions large, and cluster or sort by high-cardinality keys."
technology: ["data-engineering", "sql"]
topic: ["partitioning", "performance", "data-layout"]
difficulty: "Medium"
questionType: ["architecture", "optimization"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I look at how the table is queried and written. I partition by the column that most queries filter on and that the pipeline writes by, which for event and fact tables is almost always a date, so queries prune to a few partitions and each run can overwrite its own partition idempotently. I keep the column low-cardinality so partitions stay large (hundreds of megabytes to gigabytes of data each, not thousands of tiny files), and I handle high-cardinality filters such as customer_id with clustering, sorting or Z-ordering inside partitions instead. I check the choice against real query plans, and on modern formats consider liquid clustering or the warehouse's automatic micro-partitioning before adding manual partitions."
followUps: ["Why is partitioning by customer_id usually a mistake?", "What is the small-files problem and how do you fix it?", "How do partitioning and clustering differ?", "How do you change the partitioning of an existing large table?"]
related: ["articles:data-warehousing/partitioning-clustering-data-layout", "interview-questions:snowflake/micro-partitions-performance", "interview-questions:spark/partition-count-performance", "articles:etl-elt/idempotency-in-data-pipelines"]
sources:
  - { label: "PostgreSQL documentation: Table partitioning", url: "https://www.postgresql.org/docs/current/ddl-partitioning.html" }
  - { label: "Delta Lake documentation: Liquid clustering", url: "https://docs.delta.io/latest/delta-clustering.html" }
versionContext: "SQL verified on PostgreSQL 16.14"
---

## Detailed explanation

Partitioning splits a table into separate physical parts by the value of a column, so that a query filtering on that column reads only the matching parts (**partition pruning**) and a pipeline can replace one part without touching the others. A good choice speeds up both reads and writes; a bad one creates thousands of tiny files and makes everything slower.

### Questions to ask

1. **Which filters appear in most queries?** For facts and events, almost always a date range.
2. **How is the table written?** Daily or hourly loads map naturally to date partitions, and partition overwrite gives idempotent reruns and cheap backfills.
3. **What is the cardinality and size per value?** Aim for partitions large enough to be efficient (in lake formats, typically at least hundreds of megabytes each, with files of roughly 128 MB to 1 GB). Years of daily partitions are fine; a partition per customer is not.
4. **What about retention?** Dropping an old partition is instant compared with deleting rows.

### Partitioning vs clustering

| | Partitioning | Clustering / sorting / Z-order |
|--|--------------|-------------------------------|
| Granularity | Separate directories or child tables | Data ordered within files |
| Best column | Low cardinality, used in most filters and in writes | High cardinality, used in many filters (customer_id, product_id) |
| Too fine | Small files, metadata overhead, slow planning | Little downside beyond maintenance cost |
| Changing it | Rewrite the table | Recluster incrementally |

Many platforms reduce the need for manual partitioning: Snowflake micro-partitions every table automatically and adds optional clustering keys; Delta Lake's liquid clustering and Iceberg's hidden partitioning let you change layout without rewriting queries. In BigQuery, a date partition plus clustering columns is the usual pattern.

## Example: pruning in PostgreSQL

```sql
CREATE TABLE events (
    event_id    bigint,
    customer_id bigint,
    event_date  date NOT NULL,
    amount      numeric
) PARTITION BY RANGE (event_date);

CREATE TABLE events_2026_09 PARTITION OF events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE events_2026_10 PARTITION OF events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE INDEX ON events (customer_id);   -- the high-cardinality filter, served by an index

INSERT INTO events
SELECT g, g % 1000, DATE '2026-09-01' + (g % 60), g % 50
FROM generate_series(1, 6000) AS g;

EXPLAIN (COSTS OFF)
SELECT sum(amount) FROM events WHERE event_date BETWEEN '2026-10-05' AND '2026-10-06';
```

```text
 Aggregate
   ->  Seq Scan on events_2026_10 events
         Filter: ((event_date >= '2026-10-05'::date) AND (event_date <= '2026-10-06'::date))
```

Only the October partition is scanned. A filter on `customer_id` alone would scan every partition (using the index on each), which is why a column like that should not be the partition key but can still be served by an index, clustering or sort order.

### Changing the strategy later

Repartitioning a large table means rewriting it: build a new table with the new layout (in chunks, through the normal job), backfill, validate counts per partition, swap readers, then drop the old table. That cost is why the choice deserves thought upfront, and why layout features that can evolve (liquid clustering, Iceberg partition evolution) are attractive.

## Trade-offs and pitfalls

- Hourly partitions help when queries really filter by hour and volume is high; otherwise they multiply small files.
- Partition by event date, not ingestion date, if users query by when things happened, and handle late data by rebuilding affected partitions.
- Queries that wrap the partition column in a function (`WHERE date_trunc('month', event_date) = ...`) can defeat pruning in some engines; filter on the raw column.
- Too many partitions slow down query planning and metadata operations, even when each query touches few.

## Common mistakes

1. Partitioning by a high-cardinality column such as user id.
2. Tiny partitions and thousands of small files, with no compaction.
3. Choosing a partition column that queries never filter on.
4. Partitioning small tables that would be faster as one.

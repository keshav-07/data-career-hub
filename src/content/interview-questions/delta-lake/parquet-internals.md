---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How is a Parquet file organised, and how does that speed up queries?"
seoTitle: "Parquet File Internals: Interview Answer"
description: "Parquet internals interview answer: row groups, column chunks, pages and the footer, and how pruning, statistics and encodings make scans cheap."
technology: ["delta-lake", "spark"]
topic: ["file-formats", "parquet"]
difficulty: "Medium"
questionType: ["conceptual", "optimization"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "A Parquet file is split into row groups (horizontal slices, about 128 MB each by default in Spark), each holding one column chunk per column, and each chunk is made of pages that are encoded (dictionary, run-length, bit-packing) and then compressed. The footer at the end holds the schema and, for every column chunk, its location and statistics such as min, max and null count. A reader reads the footer first, fetches only the column chunks it needs (column pruning) and skips row groups whose statistics cannot satisfy the filter (predicate pushdown). Skipping is most effective when data is sorted or clustered on the filtered column."
followUps: ["What happens to Parquet performance with thousands of 1 MB files?", "Why does predicate pushdown not help on a randomly distributed column?", "How do Delta and Iceberg add file-level statistics on top of Parquet?", "Why can Parquet be split even with Snappy or zstd, when gzip CSV cannot?"]
related: ["articles:delta-lake/parquet-vs-avro-vs-orc", "articles:delta-lake/json-vs-parquet", "articles:delta-lake/optimize-zorder-vacuum-liquid-clustering"]
versionContext: "Footer and plan output checked with PySpark 4.2.0 and PyArrow 25"
sources:
  - { label: "Apache Parquet documentation: File format", url: "https://parquet.apache.org/docs/file-format/" }
  - { label: "Spark documentation: Parquet files", url: "https://spark.apache.org/docs/latest/sql-data-sources-parquet.html" }
---

## Detailed explanation

| Level | What it is | Why it matters |
|---|---|---|
| File | Data plus a footer; the magic bytes `PAR1` at both ends | The footer is read first, so planning needs no full read |
| Row group | A horizontal slice of rows | Unit of parallelism (one task can read one group) and of skipping |
| Column chunk | One column's values within a row group | Read only the columns a query uses |
| Page | Sub-unit of a chunk, around 1 MB | Unit of encoding and compression; page-level indexes allow finer skipping |

**Encodings** come before compression: a low-cardinality column (country, status) becomes a small dictionary plus bit-packed indexes, and repeated values become runs. Compression codecs (Snappy by default in Spark, zstd as a common alternative) then work on already compact data. Because compression is per page, a file stays splittable at row-group boundaries whatever the codec.

## Example

Reading the footer with PyArrow for a file sorted by `order_id`:

<!-- noexec -->
```python
import pyarrow.parquet as pq
meta = pq.ParquetFile("orders.parquet").metadata
for g in range(meta.num_row_groups):
    s = meta.row_group(g).column(0).statistics
    print(g, s.min, s.max)
# 0 0 75378
# 1 75379 150757
# 2 150758 199999
```

`WHERE order_id >= 180000` reads only group 2. In Spark's plan this shows as `PushedFilters: [GreaterThanOrEqual(order_id,180000)]` and a `ReadSchema` listing only the selected columns. Spark still applies the filter to the rows it reads, because statistics only rule groups out.

## Trade-offs and pitfalls

- **Small files.** Each file has a footer to fetch and tiny row groups that compress and skip poorly. Compact them.
- **Unsorted data.** If every row group spans the full range of a column, statistics skip nothing. Sort, Z-order or cluster on common filter columns.
- **Wide row groups vs parallelism.** Very large row groups reduce parallelism and skipping granularity; very small ones add overhead.
- **Table formats add a layer.** Delta stores per-file min/max in its log, so it can skip whole files before opening any footer.

## Common mistakes

1. Saying Parquet "stores data by column" without mentioning row groups, which are what make it splittable and skippable.
2. Expecting a filter on any column to skip data regardless of layout.
3. Comparing Parquet and ORC sizes without noticing different default codecs.

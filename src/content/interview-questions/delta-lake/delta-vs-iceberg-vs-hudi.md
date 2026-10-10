---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Delta Lake vs Apache Iceberg vs Apache Hudi: how do they differ?"
seoTitle: "Delta Lake vs Iceberg vs Hudi: Interview Answer"
description: "Delta Lake vs Iceberg vs Hudi interview answer: how each table format commits, partitions and updates rows, and how to choose between them."
technology: ["delta-lake", "data-engineering"]
topic: ["table-formats", "comparison", "lakehouse"]
difficulty: "Medium"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "All three are open table formats that add a metadata layer over Parquet files to give atomic commits, snapshots and time travel, schema evolution and row-level updates. Delta keeps an ordered log of JSON commits with Parquet checkpoints and is strongest in Spark and Databricks. Iceberg keeps a tree of metadata files, manifest lists and manifests, commits by swapping a pointer in a catalog, tracks columns by ID and offers hidden partitioning with partition evolution, which makes it popular for multi-engine platforms. Hudi is built around a timeline, record keys and indexes, with copy-on-write and merge-on-read tables, and suits upsert-heavy streaming ingestion. I choose by which engines must read and write, the catalog, and the write pattern."
followUps: ["What is Iceberg hidden partitioning?", "What does merge-on-read trade off against copy-on-write?", "What is Delta UniForm, and does it remove the need to choose?", "How does each format make a commit atomic on object storage?"]
related: ["articles:delta-lake/delta-vs-traditional-lake-tables", "interview-questions:delta-lake/what-delta-lake-solves", "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse"]
versionContext: "Describes Delta Lake 4.x, the Iceberg v2/v3 specification and Hudi 1.x; check current documentation for specific features"
sources:
  - { label: "Delta Lake documentation", url: "https://docs.delta.io/" }
  - { label: "Apache Iceberg table specification", url: "https://iceberg.apache.org/spec/" }
  - { label: "Apache Hudi documentation: Overview", url: "https://hudi.apache.org/docs/overview" }
---

## Detailed explanation

| | Delta Lake | Apache Iceberg | Apache Hudi |
|---|---|---|---|
| Metadata | `_delta_log/` JSON commits plus Parquet checkpoints | Table metadata file, snapshots, manifest lists, manifests | Timeline of instants in `.hoodie/` plus a metadata table |
| Atomic commit | Atomic creation of the next log file, or a catalog that coordinates commits | Catalog compare-and-swap of the current metadata pointer | Timeline transitions, with a lock provider for multiple writers |
| Partitioning | Partition columns, or liquid clustering | Hidden partitioning via transforms, with partition evolution | Partition paths, plus clustering |
| Column renames and drops | With column mapping (protocol upgrade) | Native, columns tracked by ID | Supported by schema evolution |
| Row-level changes | Copy-on-write; deletion vectors for merge-on-read | Copy-on-write, or delete files (v2) and deletion vectors (v3) | Copy-on-write or merge-on-read tables with record-level indexes |
| Incremental reads | Change data feed | Incremental snapshot reads | Incremental queries, a core feature |

### Points worth making precisely

- **Hidden partitioning (Iceberg).** The table declares `days(event_ts)` or `bucket(16, user_id)`. Queries filter on `event_ts` and the engine prunes partitions; users never write a partition column, and the spec can change for new data without rewriting old data.
- **Merge-on-read (Hudi, and Delta and Iceberg in their own forms).** Updates are written as small log, delete or deletion-vector files and merged at read time until compaction. Writes are cheap; reads pay until maintenance runs. Copy-on-write is the opposite.
- **Interoperability.** Delta UniForm writes Iceberg metadata alongside the Delta log so Iceberg readers can query a Delta table; Apache XTable (incubating) translates metadata between formats. One format is still the writer of record.

## Example: how you would answer a design prompt

"We run Spark for ETL, Trino and a cloud warehouse for queries, and Flink writes some tables." A good answer: multi-engine writes and a shared catalog point to Iceberg with a REST catalog; if the platform is Databricks-centred with Spark doing all writes, Delta (optionally with UniForm for Iceberg readers) is simpler; if the core workload is high-rate upserts from CDC with record-level indexing needs, evaluate Hudi's merge-on-read tables.

## Trade-offs and pitfalls

- No format is faster in general. File sizes, clustering, statistics and the engine matter more than the format.
- Feature support differs by engine and version: a table using deletion vectors or Iceberg v3 features can be unreadable by an older connector.
- All three need maintenance: compaction, snapshot or log expiry, and orphan file removal (`VACUUM` in Delta, `expire_snapshots` and `remove_orphan_files` in Iceberg, cleaning and compaction services in Hudi).

## Common mistakes

1. Calling any of them a storage engine or database. They are table formats: specifications for files plus metadata.
2. Claiming one "does ACID" and the others do not. All three provide atomic commits and snapshot isolation per table.
3. Choosing by benchmark blog posts instead of by engines, catalog and write pattern.

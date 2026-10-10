---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How would you design the S3 layout and partitioning for a data lake?"
seoTitle: "S3 Data Lake Layout and Partitioning: Interview"
description: "Interview answer: zone prefixes, Hive-style date partitions, Parquet or Iceberg, target file sizes, compaction and partition registration for an S3 data lake."
technology: ["aws", "data-lakes"]
topic: ["s3", "partitioning", "data-lake", "file-layout"]
difficulty: "Medium"
questionType: ["architecture", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Separate zones by prefix or bucket (raw, curated, analytics) so permissions, lifecycle rules and retention differ per zone. Inside each dataset, partition by the column most queries filter on, usually event date (dt=YYYY-MM-DD, sometimes hour), never a high-cardinality key such as user_id. Store curated data as compressed Parquet or as Iceberg tables, aim for files of roughly 128 MB to 1 GB, compact small files from streaming writers, and register partitions with partition projection, the writing job or a table format instead of hourly crawlers. Then check the layout against the real queries: pruning only helps if queries filter on the partition column."
followUps: ["How do you avoid the small files problem with Firehose or streaming writers?", "When would you use Iceberg instead of plain Hive-style partitions?", "Why is partitioning by user_id a bad idea?", "How do new partitions become visible to Athena?"]
related: ["articles:aws/s3-for-data-engineers", "articles:aws/athena", "articles:aws/modern-aws-data-services", "articles:data-warehousing/partitioning-clustering-data-layout", "system-designs:data-lake-on-cloud-object-storage"]
versionContext: "S3 behaviour checked against the Amazon S3 User Guide in October 2026. The layout and file-size calculations are plain Python (3.11) with illustrative volumes, not measurements; no AWS account was used."
sources:
  - { label: "Amazon S3 User Guide: Organizing objects using prefixes", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html" }
  - { label: "Amazon S3 User Guide: Best practices design patterns: optimizing Amazon S3 performance", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html" }
  - { label: "Amazon Athena: Partitioning data", url: "https://docs.aws.amazon.com/athena/latest/ug/partitions.html" }
---

## Detailed explanation

### Zones

| Zone | Contents | Format | Typical rules |
|---|---|---|---|
| `raw/` (bronze) | Data as received: JSON, CSV, CDC files | Original | Write-once, short access for few roles, lifecycle to colder classes, long retention for replay |
| `curated/` (silver) | Cleaned, typed, de-duplicated tables | Parquet or Iceberg | Read by engineers and jobs, compaction, schema managed |
| `analytics/` (gold) | Business-ready aggregates and marts | Parquet or Iceberg | Read by analysts and BI through Athena or Redshift, Lake Formation permissions |

Separate buckets per zone (or per domain) make IAM, KMS keys, replication and cost reporting simpler than one bucket with prefixes; prefixes are fine for small teams.

### Inside a dataset

```text
s3://acme-lake-curated-prod/sales/orders/dt=2026-10-01/part-00000-3f2a.snappy.parquet
\________ bucket ________/ \_domain_/ \table/ \partition/ \____ data file ________/
```

- **Hive-style partitions** (`column=value`) let Athena, Glue, EMR and Redshift Spectrum map the path to a partition column and **prune** prefixes that cannot match a filter.
- **Partition by the dominant filter**, usually event date. Add `hour=` only for very high volume with hourly queries. Avoid `user_id`, `order_id` or anything with millions of values.
- **File size**: aim for roughly 128 MB to 1 GB of compressed Parquet per file; thousands of small files cost more in S3 requests and query planning than they save.
- **Columnar and compressed**: Parquet with Snappy or ZSTD lets engines read only needed columns and skip row groups using min/max statistics.
- **Table formats**: for tables with updates, deletes, late data or many writers, use **Iceberg** (in a general purpose bucket with the Glue Data Catalog, or in S3 Tables). It gives atomic commits, hidden partitioning (partition by `day(event_ts)` without a `dt` column), partition evolution and compaction.

S3 itself scales request rates per prefix (at least 3,500 writes and 5,500 reads per second per partitioned prefix), and it has been strongly consistent for reads and listings since December 2020, so the old workarounds for eventual consistency are no longer needed.

## Example

How many files and partitions does a design produce? Illustrative volumes for a clickstream table:

```python
def layout(daily_gb_compressed, days, partition_by_hour, target_file_mb):
    partitions = days * (24 if partition_by_hour else 1)
    gb_per_partition = daily_gb_compressed / (24 if partition_by_hour else 1)
    files_per_partition = max(1, round(gb_per_partition * 1024 / target_file_mb))
    avg_file_mb = gb_per_partition * 1024 / files_per_partition
    return partitions, files_per_partition, round(avg_file_mb)

for name, args in {
    "daily, 512 MB files": (60, 365, False, 512),
    "hourly, 512 MB files": (60, 365, True, 512),
    "small daily table, hourly": (2, 365, True, 512),
}.items():
    partitions, files, size = layout(*args)
    print(f"{name:26} partitions={partitions:5} files/partition={files:3} avg file={size} MB")
```

```text
daily, 512 MB files        partitions=  365 files/partition=120 avg file=512 MB
hourly, 512 MB files       partitions= 8760 files/partition=  5 avg file=512 MB
small daily table, hourly  partitions= 8760 files/partition=  1 avg file=85 MB
```

At 60 GB a day, hourly partitions still give healthy files; for a 2 GB-a-day table, hourly partitions create 8,760 partitions a year of undersized files for no benefit. Pick the granularity from data volume and query patterns together.

A streaming writer that flushes every minute produces 1,440 files a day per writer. Fix it with larger buffers (Firehose buffering hints, Spark trigger intervals), a scheduled compaction job that rewrites a closed partition into a few large files, or Iceberg with `OPTIMIZE` or S3 Tables' automatic compaction.

New partitions must also become visible to query engines: **partition projection** in Athena for predictable keys, the writing Glue job updating the catalogue (`enableUpdateCatalog`), `ALTER TABLE ADD PARTITION` from the pipeline, or a table format that tracks files itself. Hourly crawlers over the whole bucket are the slow, expensive option.

## Trade-offs and pitfalls

- **Over-partitioning** (by minute, by customer) gives millions of prefixes and tiny files; **under-partitioning** makes every query scan everything. Check the actual `WHERE` clauses.
- **Filtering on an expression** (`date(event_ts) = ...`) instead of the partition column may not prune in Hive-style tables. Iceberg's hidden partitioning avoids this.
- **Lifecycle expiration on table prefixes** can delete files a live Iceberg snapshot still references; use the table format's snapshot expiry.
- **Renaming "folders" is a copy plus delete** of every object, not atomic; never design commits around renames.
- **Mixed schemas or file types under one prefix** confuse crawlers and readers. One dataset per prefix.

## Follow-up answers

- **Small files**: buffer more before writing (Firehose 64 to 128 MB buffers, longer micro-batch triggers), compact closed partitions on a schedule, or let Iceberg or S3 Tables compaction do it.
- **Iceberg instead of Hive-style**: when the table has updates or deletes (CDC, GDPR erasure), late data, concurrent writers, a need for time travel, or partition schemes that will change.
- **`user_id` partitions**: millions of prefixes, one tiny file each, slow listing and planning, and most queries do not filter on a single user anyway.
- **Visibility in Athena**: partition projection, the job registering partitions, `ALTER TABLE ADD PARTITION` or `MSCK REPAIR TABLE`, or an Iceberg table.

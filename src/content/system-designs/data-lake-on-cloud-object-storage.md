---
title: "Design a Data Lake on Cloud Object Storage"
description: "Cloud data lake system design on S3, GCS or ADLS: zones, key layout, file and table formats, catalog, security, lifecycle cost and recovery from mistakes."
technology: ["data-engineering", "data-lakes", "aws"]
topic: ["data-lake", "storage", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
problem: "Design a central data lake on cloud object storage that receives files, database extracts and event streams from dozens of sources, keeps raw data cheaply for years, and lets analysts, Spark jobs and data scientists query curated data with SQL without the lake turning into an ungoverned swamp."
functionalRequirements:
  - "Land data from batch files, database extracts and streaming sinks into a raw zone without modifying it"
  - "Convert raw data into typed, partitioned, query-ready tables in a curated zone"
  - "Register every dataset in a catalog with schema, owner and location so engines can find it"
  - "Query the curated data from several engines (Spark, a serverless SQL engine, the warehouse)"
  - "Restrict access by dataset and column, and isolate personal data"
  - "Expire or archive data according to a retention policy per dataset"
nonFunctionalRequirements:
  - "Durable: no acknowledged file is ever lost, and accidental deletes are recoverable"
  - "Readers never see half-written data"
  - "Storage cost grows slower than data volume through tiering and compression"
  - "Scales to petabytes and thousands of datasets without a redesign"
  - "Every file is traceable to its source, load time and producing job"
scaleAssumptions:
  - "Assumption: about 1 TB/day of compressed raw input across roughly 60 sources"
  - "Assumption: curated Parquet is roughly 40% of raw size after typing, dedup and columnar compression"
  - "Assumption: raw retained 3 years, curated retained 7 years for finance and audit"
  - "Assumption: about 150 analysts and 40 scheduled Spark jobs read the lake daily"
architectureSummary: "Sources land unchanged into a raw zone in object storage, partitioned by source and ingestion date; Spark jobs convert raw files into Apache Iceberg (or Delta) tables in a curated zone; one catalog registers every table and enforces access; Spark, a serverless SQL engine and the warehouse query the same tables; lifecycle rules tier old raw data to cheaper storage classes."
technologies:
  - "Amazon S3 (or Google Cloud Storage / Azure Data Lake Storage Gen2)"
  - "Apache Parquet files"
  - "Apache Iceberg (Delta Lake as the alternative)"
  - "Iceberg REST catalog such as AWS Glue Data Catalog or Apache Polaris"
  - "Apache Spark for conversion and compaction"
  - "Trino / Athena for serverless SQL"
  - "Cloud KMS, IAM and fine-grained access control (Lake Formation or catalog grants)"
tradeoffs:
  - decision: "Open table format (Iceberg) over plain Parquet folders"
    alternative: "Hive-style Parquet directories registered in a metastore"
    reason: "Atomic commits, snapshot isolation, schema evolution and hidden partitioning; readers never see partial writes"
    consequence: "Snapshots, manifests and orphan files need regular maintenance jobs"
  - decision: "Keep raw data immutable and separate from curated tables"
    alternative: "Transform on the way in and keep only clean data"
    reason: "Any curated table can be rebuilt after a bug fix or a new requirement"
    consequence: "Roughly double the storage, controlled with lifecycle tiering of raw"
  - decision: "Partition by date, cluster or sort by common filter columns"
    alternative: "Partition by high-cardinality keys such as customer id"
    reason: "Bounded partition count, good pruning for time-based queries, healthy file sizes"
    consequence: "Point lookups by key rely on sort order and file statistics, not partition pruning"
  - decision: "One shared catalog for all engines"
    alternative: "Each engine keeps its own table definitions"
    reason: "One schema, one set of permissions, no drift between engines"
    consequence: "The catalog becomes a critical dependency that needs high availability and backups"
  - decision: "Lifecycle rules to infrequent-access and archive classes for raw data"
    alternative: "Everything in the standard class"
    reason: "Raw data older than a few months is read rarely, so cheaper classes cut cost substantially"
    consequence: "Retrieval fees and minimum storage durations make large re-reads of old raw data more expensive"
interviewFollowUps:
  - "How do you stop the lake becoming a data swamp?"
  - "A job wrote corrupt Parquet files into a curated table yesterday. How do you recover?"
  - "How would you lay out keys and partitions for a table queried mostly by date and by customer?"
  - "How do you delete one customer's data from three years of immutable raw files?"
  - "Why not just put everything in the warehouse?"
  - "What happens to query performance after a year of streaming writes, and what do you do about it?"
related:
  - "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse"
  - "articles:delta-lake/parquet-vs-avro-vs-orc"
  - "articles:data-warehousing/partitioning-clustering-data-layout"
  - "articles:delta-lake/delta-vs-traditional-lake-tables"
  - "interview-questions:data-engineering/lake-warehouse-lakehouse"
next: "system-designs:scalable-lakehouse"
versionContext: "Design discussion; the single Spark SQL snippet is illustrative Iceberg DDL and was not executed. Storage prices are approximate AWS us-east-1 list prices at the time of writing and change over time."
sources:
  - { label: "Amazon S3: strong consistency", url: "https://aws.amazon.com/s3/consistency/" }
  - { label: "Apache Iceberg table specification", url: "https://iceberg.apache.org/spec/" }
  - { label: "Amazon S3 Tables (managed Iceberg tables)", url: "https://aws.amazon.com/s3/features/tables/" }
  - { label: "Amazon S3 strong read-after-write consistency announcement", url: "https://aws.amazon.com/about-aws/whats-new/2020/12/amazon-s3-now-delivers-strong-read-after-write-consistency-automatically-for-all-applications" }
  - { label: "Apache Parquet documentation", url: "https://parquet.apache.org/docs/" }
---

## Approach

A data lake is easy to start and hard to keep useful. Anyone can create a bucket and copy files into it. The design questions are how data is organised so people can find and trust it, how writes stay consistent, and how cost stays under control when you keep everything. Ask these before drawing anything:

- **What arrives, and how?** Daily CSV drops, database extracts, CDC streams, application events, third-party APIs? The mix decides the landing patterns.
- **Who reads it, and with which engines?** Analysts with SQL, Spark jobs, ML notebooks, the warehouse? Several engines push you towards an open table format and a shared catalog.
- **What are the freshness needs?** Daily is batch conversion; minutes means streaming writes and small-file management.
- **What are the retention and compliance rules?** How long must raw data be kept, is there personal data, and do deletion requests apply (GDPR, CCPA)?
- **Single cloud or several, single region or several?** This changes the catalog, replication and egress-cost story.
- **Is there an existing warehouse?** If so, the lake is often the raw and archival layer that feeds it, not a replacement.

State the scope you will design for: object storage as the system of record, raw and curated zones, an open table format, one catalog, and SQL plus Spark access.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Sources</strong>: file drops (SFTP, partner buckets), database extracts and CDC, and event streams through a streaming sink.</li>
<li><strong>Landing / raw zone</strong>: files written unchanged under a <code>raw/</code> prefix per source, dataset and ingestion date, with a manifest recording source, row count and checksum.</li>
<li><strong>Conversion jobs</strong> (Spark): parse, type, deduplicate and validate raw files, then commit them to Iceberg tables.</li>
<li><strong>Curated zone</strong>: Iceberg tables in Parquet, partitioned by date and sorted by common filter columns; a separate restricted zone for personal data.</li>
<li><strong>Catalog</strong>: one Iceberg REST catalog (Glue Data Catalog, Polaris or similar) holding table metadata pointers, owners and grants.</li>
<li><strong>Consumers</strong>: Spark for engineering and ML, Trino/Athena for ad-hoc SQL, the warehouse reading the same tables through its Iceberg support.</li>
<li><strong>Housekeeping</strong>: compaction, snapshot expiry, orphan-file removal, and lifecycle rules that tier old raw data.</li>
</ol>
<figcaption>Object storage holds every byte; the table format and catalog turn folders of files into tables that several engines can share safely.</figcaption>
</figure>

Data enters in step 2 and is never edited there. That rule is what makes the rest recoverable: if a conversion job has a bug, you fix the job and rebuild the curated table from raw. Conversion jobs in step 3 are the only writers to curated tables, and they commit through the table format, so a reader sees either the old snapshot or the new one, never a half-written partition. The catalog in step 5 is the single source of truth for which files make up a table; engines never list folders to discover data. Consumers in step 6 authenticate against the catalog, which hands out access to tables and columns rather than to raw bucket paths.

## Storage layout and naming

Object storage has no real directories. A "folder" is a key prefix. Layout still matters, because it decides how permissions, lifecycle rules and request throughput are applied.

**Separate buckets (or accounts) by zone and sensitivity**, not just prefixes. Lifecycle rules, encryption keys, replication and IAM policies are simplest at bucket level:

| Bucket | Contents | Writers | Lifecycle |
|---|---|---|---|
| `acme-lake-raw` | Unchanged source files | Ingestion services only | Standard, then infrequent access at 30 days, archive at 180 days |
| `acme-lake-curated` | Iceberg tables | Conversion and modelling jobs | Standard; table maintenance removes old files |
| `acme-lake-restricted` | Tables containing personal data | Approved jobs only | Standard; separate KMS key |
| `acme-lake-sandbox` | User scratch space | Analysts | Expire objects after 30 days |

**Raw key pattern**:

```text
raw/<source>/<dataset>/
  ingest_date=2026-10-05/
    <batch_id>/part-0001.json.gz
```

Partition raw data by **ingestion date**, not business date: you know the ingestion date at write time, it never changes, and it makes "reprocess everything that arrived on Tuesday" a prefix operation. Business dates are applied later in curated tables.

**Request throughput.** S3 supports at least 3,500 write and 5,500 read requests per second per prefix and scales by adding prefixes, so a well-spread key space rarely hits limits. What does hurt is millions of tiny objects: each one is a request to write, list and read. Aim for curated data files of roughly 128 MB to 1 GB.

## File formats and table formats

**File format.** Land whatever the source produces (JSON, CSV, Avro). Store curated data as **Parquet**: columnar, compressed, with min/max statistics per column chunk that let engines skip data. Avro suits row-oriented streaming payloads with a schema; JSON is only for raw landing.

**Table format.** Plain Parquet folders registered in a Hive metastore have three serious problems: no atomic commit (readers can see a partially written partition), schema changes are fragile, and listing large folders is slow. Open table formats fix this by keeping a metadata layer that lists exactly which files belong to each snapshot.

| | Apache Iceberg | Delta Lake | Apache Hudi |
|---|---|---|---|
| Commit model | Metadata files plus manifests; catalog swaps the current-metadata pointer atomically | Ordered JSON transaction log with checkpoints | Timeline of commits; copy-on-write or merge-on-read |
| Partitioning | Hidden partitioning with transforms such as `days(ts)`; partition spec can evolve | Explicit partition columns, or liquid clustering | Explicit partition path |
| Engine support | Very broad: Spark, Flink, Trino, Snowflake, BigQuery, Athena | Strongest in Spark and Databricks; growing elsewhere | Spark and Flink centred |
| Row-level deletes | Position deletes; deletion vectors in format v3 | Deletion vectors | Built for upserts |

Choose **Iceberg** when several engines from different vendors must read and write the same tables, which is the usual data-lake case. Choose **Delta** when the platform is Databricks-centred. Both are sound; what matters is picking one per table and running its maintenance.

<!-- noexec -->
```sql
-- Spark SQL with the Iceberg runtime: hidden partitioning on event time
CREATE TABLE lake.curated.orders (
  order_id     BIGINT,
  customer_id  BIGINT,
  amount       DECIMAL(12, 2),
  order_ts     TIMESTAMP,
  _ingest_date DATE,
  _source_file STRING
)
USING iceberg
PARTITIONED BY (days(order_ts))
TBLPROPERTIES ('write.target-file-size-bytes' = '536870912');
```

Readers filter on `order_ts` and Iceberg prunes by day without anyone needing to know a separate partition column exists.

## Catalog and metadata

The catalog does two jobs: it is the **commit point** for the table format (the atomic pointer to the current metadata) and the **discovery and permission layer** for people. Options:

- **AWS Glue Data Catalog**: managed, integrates with Athena, EMR and Lake Formation permissions; tied to AWS.
- **Apache Polaris** or another **Iceberg REST catalog**: engine-neutral, the direction most multi-engine platforms are taking.
- **Unity Catalog**: strongest in Databricks; the open-source version is an LF AI & Data project.
- **Managed Iceberg storage** such as Amazon S3 Tables, which adds automatic compaction and snapshot management on top of a table bucket.

Whatever you choose, enrich it with business metadata: owner, description, freshness SLA, sensitivity tags and a link to the producing job. A table without an owner is the first sign of a swamp.

## Ingestion and write consistency

- **Write-then-commit.** Batch loaders write to a temporary prefix and only then commit (an Iceberg append, or for raw files a manifest written last). Readers and downstream jobs look for the manifest or commit, never for "files in a folder".
- **Idempotent loads.** Each batch has a deterministic `batch_id` (source, dataset, extract time). Re-running a load overwrites the same raw prefix and the conversion job uses `MERGE` or partition overwrite, so retries do not duplicate rows.
- **Streaming sinks** (Kafka Connect S3 sink, Flink, Spark Structured Streaming) commit on checkpoints. A one-minute checkpoint with 50 writers can create 72,000 files a day for one table, so plan compaction from day one.
- **Lineage columns.** Every curated row carries `_ingest_date`, `_source_file` and `_batch_id`, which makes it possible to find and remove everything a bad batch produced.

## Security and personal data

- **Block public access** at the account level, require TLS, and reach storage through private VPC endpoints.
- **Encrypt** with customer-managed KMS keys, a separate key for the restricted zone. Revoking a key is a last-resort kill switch.
- **Grant at table and column level through the catalog** (Lake Formation, Polaris or Unity Catalog grants) instead of handing out bucket paths. Direct bucket access should be limited to the service roles that write.
- **Keep personal data in the restricted zone** and pseudonymise identifiers in curated tables. Deleting a person from immutable raw files is expensive; minimising where identifiers live is the cheaper design. For data that must be erasable, consider per-subject encryption keys (crypto-shredding) at ingestion.
- **Audit** with access logs or CloudTrail data events on the restricted buckets.

## Cost

Storage is cheap per gigabyte but nothing in a lake is ever deleted by default, so cost compounds.

- **Lifecycle tiering for raw data.** At the time of writing, AWS list prices in us-east-1 put S3 Standard at about $0.023 per GB-month for the first 50 TB, while Glacier Instant Retrieval is about $0.004. Raw data older than a few months is rarely read, so tiering cuts its storage cost by around five times. Prices change, so check the current S3 pricing page and each class's minimum storage duration and retrieval fee before quoting numbers.
- **Compression and columnar files.** Parquet with zstd or snappy shrinks curated data and, more importantly, lets queries read only the columns they need.
- **Fewer, larger files.** Request charges and listing time scale with object count.
- **Snapshot expiry and orphan-file cleanup.** Without it, an Iceberg or Delta table keeps every old file version forever.
- **Avoid cross-region and cross-cloud egress.** Keep compute in the bucket's region.
- **Tag buckets and jobs by team** for chargeback.

## Avoiding the data swamp

A swamp is a lake where nobody knows what a dataset means, whether it is current, or whether it is safe to use. The fixes are organisational as much as technical:

1. Nothing reaches the curated zone without an owner, a description and a schema in the catalog.
2. Curated tables have quality checks (row counts against the source manifest, key uniqueness, null rates) that block the commit when they fail.
3. Freshness is published per table, so users can see when it last updated.
4. Unused tables are found from access logs and deprecated after notice.
5. The sandbox expires automatically, so scratch data does not leak into production use.

## Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| Bad job writes wrong data to a curated table | Quality checks, row-count drift | Roll back to the previous snapshot (Iceberg `rollback_to_snapshot`, Delta `RESTORE`), fix the job, rebuild from raw |
| Someone deletes raw objects | Access-log alert, missing manifest | Bucket versioning restores previous versions; Object Lock for compliance-critical data |
| Catalog outage | Commit and query failures | Managed catalog with multi-AZ availability; back up catalog metadata; data files are untouched |
| Concurrent writers to one table | Commit conflicts | Table format's optimistic concurrency retries; design one writer per table or partition |
| Region outage | Cloud status, errors | Cross-region replication for raw and critical curated buckets, with a documented restore drill |
| Small files degrade queries | File-count and average-size metrics | Scheduled compaction; larger trigger intervals for streaming writers |

## Scaling to 10×

At 10 TB/day the layout still works because object storage scales by prefix and tables scale by files, not by servers. What changes:

- **Metadata becomes the bottleneck.** Manifests and snapshot history grow; run snapshot expiry and manifest rewrites regularly.
- **Compaction becomes a real workload** with its own budget and schedule.
- **Partition granularity** may move from daily to hourly for the largest tables. Iceberg's partition evolution lets you change this without rewriting history.
- **Conversion jobs** move from one nightly run to many per-source jobs or continuous streaming writes.
- **Cost governance** becomes essential: per-team budgets, storage-class reports, and alerts on unexpected growth.

## Monitoring and SLAs

- Freshness per curated table (time since last commit) against its SLA.
- Ingestion volume per source per day versus a rolling baseline, to catch silent drops.
- Files per table, average file size and snapshot count.
- Failed and retried conversion jobs, and commit conflicts.
- Storage by bucket, class and team; request counts.
- Access denials and reads of restricted data.

A typical published SLA: curated daily tables complete by 06:00 UTC for 99% of days, raw files queryable within 15 minutes of arrival.

## Capacity estimate

Assumptions are stated in the scale section; the arithmetic below follows from them.

- **Raw volume**: 1 TB/day × 365 ≈ 365 TB/year, about 1.1 PB over three years of retention.
- **Curated volume**: 40% of raw ≈ 0.4 TB/day ≈ 146 TB/year, about 1 PB over seven years.
- **Raw storage cost, year one, no tiering**: average about 180 TB held over the year × ~$0.022/GB-month ≈ 180,000 GB × 0.022 ≈ $4,000 a month on average, rising to about $8,000 a month by year end.
- **With tiering** (Standard for 30 days, then infrequent access, then archive after 180 days), most raw data sits in the cheapest class, cutting raw storage cost by roughly 60–80% once the lake is mature.
- **Files**: 0.4 TB/day of curated data at 512 MB per file ≈ 800 new files a day, which is healthy. The same data written by a streaming job every minute from 20 tasks would be 28,800 files a day, which is why compaction is planned in.
- **Requests**: even 10,000 files per hour of writes is under 3 requests per second, far below per-prefix limits. Read-side listing is avoided because the table format lists files in its metadata.

## What a strong answer includes

- A clear separation of **raw (immutable)** and **curated (rebuildable)** zones, and why.
- An **open table format** for atomic commits, with a reasoned Iceberg-versus-Delta choice.
- A **catalog** as the single source of truth for tables, schemas, owners and permissions.
- **Key and partition layout** that bounds partition count and produces large files.
- **Security** at bucket, table and column level, with personal data isolated.
- **Lifecycle tiering and maintenance** (compaction, snapshot expiry) as part of the design, not an afterthought.
- A **recovery story**: versioning, snapshot rollback and rebuild from raw.

## Common mistakes

- Treating the lake as "a bucket with folders" and letting engines discover data by listing prefixes.
- Partitioning by customer id or another high-cardinality key, producing millions of tiny partitions.
- Writing curated data in place without a table format, so readers see half-finished loads.
- Giving analysts bucket-wide read access instead of table and column grants.
- Keeping everything in the standard storage class forever.
- Never running compaction or snapshot expiry, then blaming the query engine for slow scans.
- Copying personal data into every zone and only thinking about deletion when the first request arrives.

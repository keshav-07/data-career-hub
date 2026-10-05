---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Lakehouse with Bronze, Silver and Gold Layers"
seoTitle: "Design a Bronze/Silver/Gold Lakehouse"
description: "A system-design case study for a medallion lakehouse: what each layer guarantees, idempotent merges, late data, schema evolution, governance, compaction and cost."
inventoryId: "SYS-04"
technology: ["data-engineering", "delta-lake", "spark"]
topic: ["lakehouse", "medallion-architecture", "architecture"]
difficulty: "Advanced"
problem: "Design a company-wide lakehouse in which many teams ingest batch files, database changes and event streams; data is refined through bronze, silver and gold layers; analysts query gold tables with SQL and data scientists train models from silver and gold, all on one governed copy of the data."
functionalRequirements:
  - "Ingest batch files, CDC streams and application events into bronze tables with no data loss"
  - "Produce typed, deduplicated, conformed silver tables per business entity"
  - "Publish gold data products (star schemas, aggregates, feature tables) owned by domain teams"
  - "Serve BI through a SQL endpoint and ML through direct table reads from the same tables"
  - "Rebuild any silver or gold table from bronze after a logic change"
  - "Find any table's owner, schema, lineage and freshness in a catalog"
nonFunctionalRequirements:
  - "ACID commits: readers never see partial writes; concurrent writers do not corrupt tables"
  - "Freshness: streaming-fed silver within 5 minutes, daily gold by 06:00 local time"
  - "Fine-grained access control with column masking and row filters"
  - "Scales to petabytes and thousands of tables without re-architecture"
  - "Personal-data deletion requests honoured across all layers within the legal deadline"
scaleAssumptions:
  - "Assumption: about 500 TB stored today, growing about 50% a year"
  - "Assumption: about 0.5 TB/day of new bronze data, of which 30% arrives by streaming"
  - "Assumption: around 3,000 tables across 25 domain teams"
  - "Assumption: 300 concurrent SQL users at peak and 200 scheduled jobs a day"
architectureSummary: "All data lives once in object storage as Delta Lake (or Iceberg) tables in three layers: bronze keeps raw records append-only with ingestion metadata, silver holds cleaned and deduplicated entities maintained by idempotent MERGE, and gold holds business-level models owned by domains. Spark handles batch and streaming transformations, a SQL warehouse serves BI, and a central catalog provides access control, lineage and discovery."
technologies:
  - "Object storage (S3, ADLS Gen2 or GCS)"
  - "Delta Lake (Apache Iceberg as the alternative)"
  - "Apache Spark: Structured Streaming and batch"
  - "Orchestrator such as Airflow or Databricks Jobs"
  - "SQL warehouse endpoint (Databricks SQL, Trino, or a warehouse reading the tables)"
  - "Unity Catalog or another central catalog with lineage"
tradeoffs:
  - decision: "Three layers with explicit contracts"
    alternative: "One layer of tables transformed in place"
    reason: "Raw data stays replayable, messy data is isolated, and each layer has a clear promise to its readers"
    consequence: "More storage and more pipelines; extra latency between layers"
  - decision: "Bronze is append-only and keeps the source payload"
    alternative: "Clean data before the first write"
    reason: "Any bug in cleaning logic can be fixed and replayed from bronze"
    consequence: "Bronze grows fast and contains personal data that deletion requests must reach"
  - decision: "Silver maintained by idempotent MERGE on business keys with a version guard"
    alternative: "Append every change and deduplicate at query time"
    reason: "Readers get one current row per key; replays and out-of-order events cannot regress data"
    consequence: "MERGE rewrites files, so tables need clustering and compaction"
  - decision: "Domain teams own gold tables"
    alternative: "A central team builds every gold table"
    reason: "Owners understand the business meaning; the platform scales with the organisation"
    consequence: "Needs shared standards, naming rules and a catalog to stay coherent"
  - decision: "Delta Lake with liquid clustering"
    alternative: "Apache Iceberg with a REST catalog"
    reason: "Deep Spark and Databricks integration, deletion vectors and simple clustering"
    consequence: "Non-Spark engines need Delta support or a compatibility layer; choose Iceberg if engine neutrality matters most"
interviewFollowUps:
  - "What exactly is the contract of each layer, and who can read bronze?"
  - "An upstream system sends a record three days late. What happens in each layer?"
  - "How would you handle a GDPR deletion request across bronze, silver and gold?"
  - "Two pipelines need to write the same silver table. How do you avoid conflicts?"
  - "A logic bug corrupted a silver table last week. Walk through the recovery."
  - "When would you skip the medallion pattern?"
related:
  - "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse"
  - "articles:delta-lake/transactions-schema-evolution"
  - "articles:delta-lake/schema-evolution-patterns"
  - "articles:databricks/unity-catalog-governance"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "system-designs:data-lake-on-cloud-object-storage"
previous: "system-designs:data-lake-on-cloud-object-storage"
next: "system-designs:change-data-capture-platform"
versionContext: "The MERGE example was run on PostgreSQL 16 (MERGE syntax is close to Delta Lake's Spark SQL MERGE). Delta-specific commands are described, not executed."
sources:
  - { label: "Databricks: What is the medallion lakehouse architecture?", url: "https://docs.databricks.com/en/lakehouse/medallion.html" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "Delta Lake documentation: deletion vectors", url: "https://docs.delta.io/delta-deletion-vectors/" }
  - { label: "Databricks: liquid clustering", url: "https://docs.databricks.com/aws/en/tables/clustering" }
  - { label: "Unity Catalog documentation", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
---

## Approach

The medallion pattern is simple to name and easy to get wrong. The interviewer wants to hear what each layer **promises**, how data moves between them **safely and repeatably**, and how the platform stays fast and governed as thousands of tables accumulate. Ask first:

- **What are the sources and their latency needs?** CDC and events need streaming into bronze; partner files can be daily.
- **Who consumes which layer?** BI on gold only? Data scientists on silver? Nobody outside the platform team on bronze?
- **How many teams write tables?** Central team or domain teams changes ownership and governance.
- **Engines**: is this Databricks-centred, or must Trino, Snowflake or Flink also read the tables? That decides Delta versus Iceberg.
- **Regulatory scope**: personal data, deletion requests, data residency?
- **Freshness and history**: do consumers need current state, full history (SCD Type 2), or both?

Then state the plan: a three-layer lakehouse on one storage account, open table format, one catalog, streaming into bronze and silver, batch and incremental builds for gold.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion</strong>: CDC connectors and event streams via Kafka, plus file loaders for batch drops, write to bronze.</li>
<li><strong>Bronze</strong>: append-only Delta tables, one per source dataset, storing the original payload plus <code>_ingested_at</code>, <code>_source</code> and <code>_batch_id</code>.</li>
<li><strong>Silver</strong>: typed, validated, deduplicated entity tables (customers, orders, payments) maintained by idempotent <code>MERGE</code>; rejected rows go to quarantine tables.</li>
<li><strong>Gold</strong>: star schemas, aggregates and feature tables built by domain teams, with tests and documented owners.</li>
<li><strong>Serving</strong>: a SQL warehouse for BI and ad-hoc analysis, direct reads for ML training, all authorised through the catalog.</li>
<li><strong>Platform services</strong>: orchestration, catalog with lineage, quality checks, table maintenance, cost reporting.</li>
</ol>
<figcaption>Each layer is a set of transactional tables on the same object storage; only the contract and the audience change.</figcaption>
</figure>

A change in an operational database is captured by the CDC connector, lands in Kafka and is appended to a bronze table within seconds. A Structured Streaming job reads new bronze rows, validates and types them, and merges them into the silver `orders` table every minute. Rows that fail validation are written to `silver.orders_quarantine` with the reason, so the stream never stops for one bad record. Overnight (or incrementally through the day), domain jobs build gold tables such as `gold.fct_orders` and `gold.daily_revenue` from silver. BI users only have grants on gold; data scientists also have read access to silver. Bronze is restricted to platform engineers and replay jobs.

## Layer contracts

The layers are only useful if each one makes a specific, testable promise.

| Layer | Contract | Write pattern | Typical readers |
|---|---|---|---|
| Bronze | Every record received, unchanged, with ingestion metadata. Duplicates allowed. | Append only | Replay jobs, debugging |
| Silver | One row per business key (or per version for history), typed, validated, conformed codes, PII tagged | `MERGE` on business key with version guard | Data scientists, gold builders |
| Gold | Business-meaningful, documented, tested, stable schema; owned by a domain | Overwrite by partition or `MERGE`; incremental | BI, finance, ML features |

Two rules keep the contracts honest. First, **data only moves forward**: gold never reads bronze directly, so cleaning logic lives in one place. Second, **every layer is rebuildable from the one before**: if silver is wrong, you fix the job and replay from bronze.

## Data model and storage layout

- **Bronze**: partition (or cluster) by ingestion date. You know it at write time and replays are usually "everything that arrived in this window".
- **Silver**: cluster by the business key and the main time column. With Delta, liquid clustering replaces fixed partitioning and Z-ordering, which avoids choosing partition columns that are wrong a year later. Keep partitions coarse if you use them (daily or monthly, never by customer).
- **Gold**: model for the query. Star schemas for BI, wide denormalised tables for ML features, small aggregate tables for dashboards.
- **File sizes**: target hundreds of megabytes per file. Streaming merges create small files; schedule `OPTIMIZE` (or enable auto-compaction) per table.
- **Naming**: `<layer>.<domain>_<entity>` or catalog/schema per layer, applied by templates so nobody invents their own.

## Idempotent merges into silver

Everything upstream is at least once: CDC connectors replay after restarts, Kafka consumers re-read after failures, and file loads get retried. Silver must therefore be correct no matter how often a record arrives or in which order. The pattern is: deduplicate the batch to the latest version per key, then `MERGE` with a guard so older versions never overwrite newer ones.

The example below runs on PostgreSQL 16, whose `MERGE` is close to Delta Lake's Spark SQL `MERGE`. Order 1 arrives twice with the same version (a replay); order 2 arrives with an older version than silver already holds.

```sql
CREATE TABLE bronze_orders (
  order_id    INT,
  status      TEXT,
  amount      NUMERIC(10,2),
  updated_at  TIMESTAMP,
  _ingested_at TIMESTAMP
);
INSERT INTO bronze_orders VALUES
  (1, 'placed',  20.00, '2026-10-01 09:00', '2026-10-01 09:05'),
  (1, 'shipped', 20.00, '2026-10-01 15:00', '2026-10-01 15:02'),
  (1, 'shipped', 20.00, '2026-10-01 15:00', '2026-10-01 15:40'),
  (2, 'placed',  35.50, '2026-10-01 10:00', '2026-10-01 10:01');

CREATE TABLE silver_orders (
  order_id   INT PRIMARY KEY,
  status     TEXT,
  amount     NUMERIC(10,2),
  updated_at TIMESTAMP
);
INSERT INTO silver_orders VALUES (2, 'cancelled', 35.50, '2026-10-01 11:00');

MERGE INTO silver_orders AS t
USING (
  SELECT order_id, status, amount, updated_at
  FROM (
    SELECT b.*,
           ROW_NUMBER() OVER (PARTITION BY order_id
                              ORDER BY updated_at DESC, _ingested_at DESC) AS rn
    FROM bronze_orders b
  ) ranked
  WHERE rn = 1
) AS s
ON t.order_id = s.order_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN
  UPDATE SET status = s.status, amount = s.amount, updated_at = s.updated_at
WHEN NOT MATCHED THEN
  INSERT (order_id, status, amount, updated_at)
  VALUES (s.order_id, s.status, s.amount, s.updated_at);

SELECT * FROM silver_orders ORDER BY order_id;
```

```text
 order_id |  status   | amount |     updated_at
----------+-----------+--------+---------------------
        1 | shipped   |  20.00 | 2026-10-01 15:00:00
        2 | cancelled |  35.50 | 2026-10-01 11:00:00
```

The duplicate for order 1 collapsed to one row, and the stale `placed` event for order 2 did not undo the newer `cancelled` state. Running the same `MERGE` again changes nothing, which is the definition of idempotent. In production, prefer a source version that is strictly ordered (a CDC log sequence number) over a timestamp, because two updates can share a timestamp.

In a streaming job, run this inside `foreachBatch`. Delta's transaction log records each commit, and you can set the `txnAppId`/`txnVersion` writer options so a retried micro-batch is skipped rather than applied twice.

## Late and out-of-order data

- **Bronze** does not care: late records are appended with their real ingestion time.
- **Silver** handles them through the version guard: a late older version is ignored, a late newer version wins.
- **Gold aggregates** are where late data hurts. Rebuild a **rolling window** of recent partitions (for example the last 3 days) on each run, rather than only "yesterday". Records later than the window are counted in a reconciliation report and trigger a targeted backfill.
- Publish the policy: "daily revenue for day D is final after D+3". Consumers can then trust the numbers.

## Schema evolution

- **Bronze** stores the raw payload (or a schema-on-read variant column), so new source fields never break ingestion.
- **Silver** uses controlled evolution: additive, nullable columns can be merged automatically (`mergeSchema` or `autoMerge` on MERGE); type changes, renames and dropped columns stop the pipeline and alert the owner.
- **Gold** has a contract: its schema changes through code review, with a deprecation period for removed columns. Delta's column mapping lets you rename or drop columns without rewriting data files, but consumers still need notice.

## Data quality

Quality checks sit at each boundary, and their failure behaviour differs:

- **Bronze → silver**: row-level checks (types, required fields, valid codes). Bad rows go to quarantine; the batch continues. Alert when the quarantine rate crosses a threshold.
- **Silver**: table-level checks (unique keys, referential integrity to dimensions, freshness).
- **Silver → gold**: blocking checks. Build gold into a staging table or new version, run tests, then publish. A failed check keeps yesterday's good gold table visible instead of publishing wrong numbers.
- Record results in the catalog so users can see a table's last check status.

## Governance and security

- One catalog for all three layers. Grants by group: platform engineers on bronze, data scientists on silver, everyone else on gold.
- Tag PII columns in silver; apply column masks and row filters centrally rather than per dashboard.
- Production tables are written only by service principals from CI-deployed jobs, never by users from notebooks.
- Lineage captured automatically from jobs, so impact analysis ("what breaks if I change `silver.orders`?") is a lookup.

## Deletion requests (GDPR)

A deletion request must reach every layer, including append-only bronze:

1. Keep an index from subject identifier to the tables that hold it (from PII tags and lineage).
2. Delete or redact matching rows in bronze, silver and gold with `DELETE` or `MERGE`. With deletion vectors, the delete only marks rows, so it is cheap.
3. Make the deletion physical: purge deletion vectors (`REORG TABLE ... APPLY (PURGE)`) and run `VACUUM` once the retention window passes, otherwise old file versions and time travel still contain the data.
4. Log completion for audit.

An alternative that scales better for large bronze tables is to encrypt personal fields with a per-subject key at ingestion and delete the key (crypto-shredding).

## Cost

- Separate compute per workload: streaming clusters, batch job clusters, and SQL warehouses that auto-stop.
- Lifecycle tiering for bronze older than its replay window.
- `VACUUM` and snapshot retention tuned per layer: long for gold (audit), short for bronze.
- Incremental gold builds instead of full rebuilds where the logic allows.
- Tag clusters, warehouses and storage by domain for chargeback, and publish a monthly cost per data product.

## Scaling to 10×

- **Storage** scales without change; the table format and catalog become the hot spots. Run `OPTIMIZE` and `VACUUM` as a managed platform service, and watch the transaction log size and checkpoint frequency.
- **Streaming**: more Kafka partitions and more executors; split very large bronze tables per source.
- **MERGE cost** grows with table size. Liquid clustering on the merge key and deletion vectors keep merges touching few files; for the largest tables, merge only recent clusters by adding a time predicate to the `ON` clause.
- **Concurrency**: more SQL users means more warehouse clusters (scale-out), not bigger ones.
- **People**: more domains means templates, CI checks and naming rules enforced by the platform.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Streaming job crashes | Silver goes stale | Restarts from checkpoint; idempotent MERGE absorbs replayed batches |
| Logic bug writes wrong silver rows | Wrong gold numbers | `RESTORE` silver to the last good version, fix code, replay bronze from that point |
| Concurrent writers conflict | Commit fails with a concurrency exception | Retry; partition the work so writers touch disjoint data; one owner per table |
| Upstream schema break | Silver pipeline stops | Bronze keeps landing; fix mapping and replay |
| `VACUUM` with too short retention | Time travel and long-running readers fail | Keep retention at least as long as the longest query and recovery window |

## Monitoring and SLAs

- Freshness per table versus its SLA, shown in the catalog.
- Streaming lag (Kafka offsets behind) and micro-batch duration.
- Quarantine rate per silver table.
- Small-file count and average file size; time since last `OPTIMIZE`.
- Job success rate and duration trends; SQL warehouse queueing.
- Cost per domain and per data product.

## Capacity estimate

Using the assumptions above:

- **Daily growth**: 0.5 TB/day into bronze would be consistent with the stated 50% yearly growth; this section uses that figure. Silver is usually smaller than bronze after deduplication and columnar compression; assume 50% (0.25 TB/day). Gold aggregates are small; assume 0.05 TB/day.
- **Yearly growth**: (0.5 + 0.25 + 0.05) × 365 ≈ 290 TB/year. If bronze older than 13 months is expired or archived, net growth of hot storage is roughly 250 TB/year, which matches 50% of 500 TB.
- **Streaming**: 30% of 0.5 TB/day ≈ 150 GB/day ≈ 1.7 MB/s on average; with a 5× peak factor about 9 MB/s, comfortably within a small Kafka cluster and a few streaming executors.
- **Files**: a silver table merged every minute by 8 tasks writes up to 11,520 files/day before compaction; daily `OPTIMIZE` brings that back to tens of files per partition.
- **SQL serving**: 300 concurrent users at roughly 10 concurrent queries per warehouse cluster suggests 3–4 clusters at peak with auto-scaling, scaled back to one off-peak.

## What a strong answer includes

- A precise **contract for each layer** and who may read it.
- **Idempotent, order-aware merges** into silver, with the reasoning for the version guard.
- A clear **late-data policy** for gold, including when numbers become final.
- **Schema evolution rules** that differ by layer.
- **Quality gates** that quarantine rows early and block bad gold publishes.
- **Governance**: one catalog, grants by layer, PII tagging, deletion across all layers including time travel.
- **Maintenance and cost** (compaction, clustering, vacuum, auto-stopping compute).
- A **recovery story** using table versions and replay from bronze.

## Common mistakes

- Describing the layers as "raw, clean, aggregated" without saying what each guarantees.
- Letting BI tools read silver or bronze, so cleaning logic gets copied into dashboards.
- Blind upserts in arrival order, which let replays and late events overwrite newer data.
- Forgetting that a `DELETE` in Delta or Iceberg is not physical until files are vacuumed or expired.
- Partitioning silver by a high-cardinality key and drowning in small files.
- Only processing "yesterday" in gold and silently missing late records.
- Treating the medallion pattern as mandatory. For a small, single-source use case, two layers or a warehouse alone can be the right answer.

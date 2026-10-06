---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Batch Ingestion Framework"
description: "A system-design case study for a metadata-driven batch ingestion framework: source registry, watermarks, idempotent landing, schema drift, orchestration and backfills."
inventoryId: "SYS-01"
technology: ["data-engineering", "spark", "airflow"]
topic: ["batch", "ingestion", "architecture"]
difficulty: "Intermediate"
problem: "A data team writes a new pipeline by hand for every source, and now runs 150 slightly different jobs pulling from databases, SFTP drops, object storage and REST APIs. Design a reusable, metadata-driven batch ingestion framework that onboards a new source through configuration, lands data reliably and idempotently in the lakehouse, and is easy to operate, backfill and monitor."
functionalRequirements:
  - "Onboard a source through a reviewed config entry, without new pipeline code for standard source types"
  - "Support JDBC databases (full and incremental), files from SFTP and object storage, and paginated REST APIs"
  - "Land raw data unchanged with metadata, then load typed bronze tables"
  - "Track watermarks and file manifests so each record or file is processed once"
  - "Detect schema drift and handle it according to a per-source policy"
  - "Backfill any source over a date range without disturbing daily runs"
nonFunctionalRequirements:
  - "All daily sources landed by 04:00 UTC so downstream models finish by 07:00"
  - "Reruns and retries never create duplicates or gaps"
  - "Source systems are protected from excessive load (connection and rate limits)"
  - "A failure in one source does not block the others"
  - "Every load is auditable: what was read, when, how many rows, from which file or window"
scaleAssumptions:
  - "Assumption: 150 sources today, 400 within two years"
  - "Assumption: 2 TB/day in total; the largest database table adds 50 million rows a day"
  - "Assumption: about 5,000 files a day from SFTP and partner buckets"
  - "Assumption: 2 data engineers operate the framework; 10 teams onboard sources"
architectureSummary: "A source registry (YAML in Git) describes each source: type, connection, schedule, extraction mode, cursor, schema policy, owner and SLA. An orchestrator generates one task group per source from the registry. Generic extractors (Spark JDBC, file, API) read within a recorded window or file manifest, write raw data to a batch-specific location, and load bronze Delta or Iceberg tables idempotently. A state store holds watermarks, batch windows and file checksums; quality checks, metrics and alerts are built in."
technologies:
  - "Source registry: YAML or a small database, validated by JSON Schema in CI"
  - "Apache Airflow (dynamic task mapping) or Dagster as orchestrator"
  - "Apache Spark for JDBC and file extraction; lightweight Python workers for APIs"
  - "Object storage raw zone and Delta Lake or Iceberg bronze tables"
  - "State store: a relational table (PostgreSQL) for watermarks, batches and manifests"
  - "Secrets manager for credentials"
tradeoffs:
  - decision: "Metadata-driven framework"
    alternative: "One hand-written pipeline per source"
    reason: "Consistent reliability, monitoring and conventions; onboarding becomes configuration"
    consequence: "Framework code becomes a product to maintain; unusual sources still need custom plugins"
  - decision: "Record each batch's extraction window before reading"
    alternative: "Compute the window from the current watermark on every attempt"
    reason: "Retries re-read exactly the same window, so outputs are reproducible"
    consequence: "A state store with batch records to manage"
  - decision: "Land raw data before loading tables"
    alternative: "Load straight into typed tables"
    reason: "Raw files allow replay after parsing bugs and prove what the source sent"
    consequence: "Extra storage and one more step"
  - decision: "Batch-level overwrite or MERGE for idempotency"
    alternative: "Plain appends"
    reason: "Rerunning a batch replaces its own output instead of duplicating it"
    consequence: "Tables need batch id or partition columns aligned with the load unit"
  - decision: "Per-source concurrency limits and pools"
    alternative: "Maximum parallelism everywhere"
    reason: "Protects production databases and partner APIs from overload"
    consequence: "Some sources load more slowly; scheduling must account for it"
interviewFollowUps:
  - "How do you make an incremental JDBC load safe to retry?"
  - "Updated rows in the source have no reliable updated_at. What are your options?"
  - "A partner drops the same file twice with different names. How do you avoid loading it twice?"
  - "A source adds a column and changes another column's type. What happens?"
  - "How do you backfill a year of one source without affecting the daily run?"
  - "How does a new team onboard a source, and what stops them misconfiguring it?"
related:
  - "interview-questions:data-engineering/idempotent-batch-pipeline"
  - "articles:airflow/dags-scheduling-retries"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:etl-elt/pipeline-reliability-and-retries"
  - "articles:python/idempotent-csv-loader"
  - "projects:large-scale-batch-processing"
previous: "system-designs:elt-pipeline-with-dbt"
next: "system-designs:data-quality-framework"
versionContext: "The watermark example is plain Python run with Python 3; the YAML registry entry is illustrative and was not executed."
sources:
  - { label: "Apache Airflow: best practices", url: "https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html" }
  - { label: "Apache Airflow: DAG runs (catchup and backfill)", url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html" }
  - { label: "Spark SQL performance tuning", url: "https://spark.apache.org/docs/latest/sql-performance-tuning.html" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
---

## Approach

The interviewer wants to see that you can turn a pile of one-off jobs into a **platform**: configuration instead of code, guarantees built in once (idempotency, watermarks, schema handling), and operations that scale with the number of sources rather than with the number of engineers. Clarify:

- **Source types and counts**: databases, files, APIs, and how many of each?
- **Frequency and SLAs**: daily, hourly? When must data be ready?
- **Change detection**: do database tables have reliable `updated_at` or increasing ids? Are deletes needed? (If deletes matter, CDC may be the better tool for those tables.)
- **Volumes**: largest tables and files, total per day.
- **Who onboards sources?** Central team or domain teams via self-service?
- **Target**: lakehouse tables, warehouse, or both?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Source registry</strong>: one YAML entry per source (type, connection secret, schedule, mode, cursor, schema policy, owner, SLA), validated in CI.</li>
<li><strong>Orchestrator</strong>: generates a task group per source from the registry; pools limit concurrency per source system.</li>
<li><strong>Plan</strong>: for each run, create a batch record with a fixed extraction window (incremental) or a file list (files) in the state store.</li>
<li><strong>Extract and land</strong>: generic extractors read exactly that window or file list and write raw data to <code>raw/&lt;source&gt;/&lt;batch_id&gt;/</code>, overwriting on retry.</li>
<li><strong>Load bronze</strong>: parse, apply the schema policy, add metadata columns, and write to the bronze table by batch-level overwrite or MERGE.</li>
<li><strong>Validate and commit</strong>: row counts, checksums and basic quality checks; then advance the watermark and mark the batch complete; emit metrics and lineage.</li>
</ol>
<figcaption>Every source runs through the same planned, landed, loaded and committed steps; only the configuration differs.</figcaption>
</figure>

At 01:00 the orchestrator runs `crm.accounts`. The plan step reads the committed watermark (`updated_at` up to 2026-10-04 23:59:59), queries the source for the current maximum, and records batch `crm.accounts/2026-10-05` with that window. A Spark JDBC job reads the window in 8 parallel slices on the primary key, writes Parquet to the batch's raw folder, and MERGEs into `bronze.crm_accounts` on the primary key. Row counts match, so the watermark advances and the batch is marked complete. If the job fails half way, the retry finds the existing batch record and re-reads the same window into the same location.

## The source registry

<!-- noexec -->
```yaml
- name: crm.accounts
  type: jdbc
  connection: secret://crm-replica
  table: public.accounts
  mode: incremental            # full | incremental | files | api
  cursor: updated_at
  primary_key: [account_id]
  lookback: 2h                 # overlap for late commits on the source
  parallelism: { column: account_id, partitions: 8 }
  schedule: "0 1 * * *"
  schema_policy: additive      # additive | strict | ignore
  pii: [email, phone]
  owner: sales-data
  sla: "04:00 UTC"
  pool: crm_db                 # max 2 concurrent tasks against this database
```

The registry is validated in CI against a JSON Schema (required fields, valid schedules, existing secrets, a known owner), so a typo fails a pull request instead of a production run. Teams onboard sources by pull request; the framework team reviews only unusual entries.

## Extraction modes

| Mode | When | How change is detected | Deletes |
|---|---|---|---|
| Full snapshot | Small tables, or no reliable change column | Read everything each run; compare to previous if needed | Detected by comparing snapshots |
| Incremental by cursor | Large tables with reliable `updated_at` or increasing id | `low < cursor <= high` per batch | Not seen; use soft-delete flags or CDC |
| Files | SFTP drops, partner buckets | File manifest with path, size and checksum | Not applicable |
| API | SaaS and partner APIs | Updated-since parameter or pagination cursor | Depends on the API |

**Cursor pitfalls**: `updated_at` set by the application may be missing on some writes; long-running source transactions can commit rows with an `updated_at` earlier than the last watermark. A **lookback overlap** (re-read the last hour or two) plus a MERGE on primary key handles the second case. If `updated_at` is unreliable, use CDC or periodic full snapshots for that table.

## Idempotency and watermarks

The key idea: **record the batch window before extracting, reuse it on retry, and advance the watermark only after the load commits**. The Python sketch below simulates that state handling; the retry on 6 October reads exactly the same rows even though a new row arrived in between.

```python
# Source registry entries: the framework is driven by config, not code per source.
SOURCES = {
    "crm.accounts": {"mode": "incremental", "cursor": "updated_at"},
    "erp.products": {"mode": "full"},
}

# Simulated source tables (cursor values are integers for brevity)
SOURCE_DATA = {
    "crm.accounts": [{"id": 1, "updated_at": 5}, {"id": 2, "updated_at": 7}, {"id": 3, "updated_at": 9}],
    "erp.products": [{"sku": "A"}, {"sku": "B"}],
}

watermark = {}   # source -> highest cursor value committed
batches = {}     # batch_id -> (low, high) window, recorded before extraction
landed = {}      # batch_id -> rows; a rerun overwrites the same location

def run(name, run_date):
    cfg, rows = SOURCES[name], SOURCE_DATA[name]
    batch_id = f"{name}/{run_date}"
    if cfg["mode"] == "incremental":
        if batch_id not in batches:              # first attempt: fix the window
            low = watermark.get(name, 0)
            high = max(r[cfg["cursor"]] for r in rows)
            batches[batch_id] = (low, high)
        low, high = batches[batch_id]            # retries reuse the same window
        rows = [r for r in rows if low < r[cfg["cursor"]] <= high]
    landed[batch_id] = rows
    if cfg["mode"] == "incremental":
        watermark[name] = max(watermark.get(name, 0), batches[batch_id][1])  # commit last
    return batch_id, [r.get("id", r.get("sku")) for r in rows]

print(run("crm.accounts", "2026-10-05"))
print(run("erp.products", "2026-10-05"))
SOURCE_DATA["crm.accounts"] += [{"id": 2, "updated_at": 11}, {"id": 4, "updated_at": 12}]
print(run("crm.accounts", "2026-10-06"))
SOURCE_DATA["crm.accounts"].append({"id": 5, "updated_at": 13})   # arrives during the retry
print(run("crm.accounts", "2026-10-06"))                            # retry: same window, same rows
print("watermark:", watermark)
```

```text
('crm.accounts/2026-10-05', [1, 2, 3])
('erp.products/2026-10-05', ['A', 'B'])
('crm.accounts/2026-10-06', [2, 4])
('crm.accounts/2026-10-06', [2, 4])
watermark: {'crm.accounts': 12}
```

Row 5 is not lost: it falls in the next day's window. On the load side, bronze writes are idempotent per batch: either overwrite the partition or files tagged with the batch id, or MERGE on the primary key so re-loading the same rows changes nothing.

## Files: manifests and duplicates

- List new files, then record each in a **manifest** (path, size, modification time, SHA-256 checksum, status).
- Skip files whose checksum is already loaded, which catches the same file re-sent under a new name.
- Wait for completeness: a `_SUCCESS` or control file from the partner, or a stable size across two listings, before reading a file that may still be uploading.
- Move or tag processed files rather than deleting them, so a reload is possible.

## Schema drift

Per-source policy, applied when loading bronze:

- **Additive** (default): new columns are added to the bronze table as nullable; alert for information.
- **Strict**: any change fails the batch and alerts the owner (finance sources, contracted feeds).
- **Type changes**: never cast silently. Widening (int to bigint) can be allowed; narrowing or incompatible changes fail.
- Raw files keep the original payload, so after a fix the batch is replayed from raw without re-extracting.

## Protecting sources

- Read from replicas, not primaries, wherever possible.
- Orchestrator **pools** cap concurrent tasks per source system; Spark JDBC `numPartitions` caps connections per job.
- API extractors respect rate limits with backoff and resume from the last page cursor.
- Schedule heavy extracts away from the source's peak hours.

## Orchestration

- One DAG (or task group) per source generated from the registry; Airflow's dynamic task mapping handles lists of files or table partitions.
- Retries with exponential backoff for transient errors; non-retryable errors (authentication, schema strict failure) fail fast.
- Failures isolated per source; downstream models depend on the specific sources they use (data-aware scheduling such as Airflow Assets), not on "all ingestion finished".
- SLA alerts when a source has not completed by its deadline.

## Backfills

Backfills create batches with explicit historical windows (for example one per day for a year), run in a separate pool with lower priority, write to the same idempotent targets, and never move the live watermark backwards. Run them in chunks so a failure only repeats one chunk, and throttle them to protect the source.

## Data quality and audit

- Compare extracted and loaded row counts per batch; for full loads, compare with the source's `COUNT(*)`.
- Basic checks on bronze: primary key not null, unique within the batch, expected columns present.
- Volume anomaly detection per source (today's rows versus a rolling baseline).
- An audit table per batch: source, window or files, rows read, rows written, checksums, duration, status, framework version.

## Security

Credentials in a secrets manager referenced from the registry, never in config files. Least-privilege read-only source accounts. Columns tagged as PII in the registry are hashed or routed to restricted tables at load time. Raw zone access limited to the framework's service role.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Task fails mid-extract | Partial raw data | Retry re-reads the recorded window into the same location |
| Load succeeds but watermark update fails | Next run would re-read | Idempotent MERGE makes the re-read harmless |
| Source late or unavailable | SLA risk | Sensor waits until a cutoff, then alerts; other sources continue |
| File re-sent with a new name | Possible duplicate | Checksum manifest skips it |
| Strict schema change | Batch fails | Owner updates mapping; replay from raw |
| Bug in parser | Bad bronze rows | Fix and replay affected batches from raw |

## Scaling to 10×

From 150 to 1,500 sources: generate DAGs efficiently (avoid slow parsing of thousands of DAG files; use a few generic DAGs with mapped tasks), shard the orchestrator or use separate deployments per domain, move the state store to a highly available database, and make onboarding fully self-service with templates and automated validation. At 20 TB/day, extraction parallelism and object-storage write patterns (file sizes) matter more than orchestration.

## Monitoring and SLAs

- Per source: last successful batch, data freshness, duration trend, rows per batch versus baseline.
- Framework: queued and running tasks per pool, failure rate by error type, retry counts.
- SLA dashboard: sources completed by 04:00, with owners for misses.

## Capacity estimate

- **Volume**: 2 TB/day ≈ 23 MB/s averaged over a day, but compressed into a 3-hour overnight window it is about 185 MB/s, which needs tens of parallel extract tasks spread across sources.
- **Largest table**: 50 million rows × 500 bytes ≈ 25 GB/day. At an assumed 50,000 rows/s per JDBC connection, 8 parallel slices take about 2 minutes; the real limit is what the source replica can serve.
- **Files**: 5,000 files/day ≈ 3.5 files per minute on average; manifests are tiny (5,000 rows/day).
- **State store**: 150 sources × 24 batches/day worst case ≈ 3,600 batch records/day, trivial for PostgreSQL.
- **Orchestrator**: a few thousand task instances a day is well within a single Airflow deployment.

## What a strong answer includes

- A **registry-driven design** where onboarding is configuration, validated in CI.
- **Plan, land, load, commit** steps with batch records, so retries are reproducible.
- **Watermarks** advanced only after commit, with lookback overlap and MERGE for safety.
- **File manifests with checksums** and completeness checks.
- **Schema drift policies** per source and replay from raw.
- **Source protection** through replicas, pools and rate limits.
- **Backfills** that are chunked, throttled and separate from live runs.

## Common mistakes

- Computing the extraction window from "now" on every retry, so retries read different data.
- Advancing the watermark before the load commits, creating gaps on failure.
- Appending loads, so every retry duplicates rows.
- Trusting `updated_at` blindly and missing long-running transactions or rows without timestamps.
- Reading partner files while they are still uploading.
- Running 50 parallel extracts against one production database.
- Building a framework so generic that every source needs custom code anyway.

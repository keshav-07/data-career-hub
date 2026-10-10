---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Auto Loader vs COPY INTO: how would you ingest files on Databricks?"
seoTitle: "Auto Loader vs COPY INTO: Interview Answer"
description: "Auto Loader vs COPY INTO interview answer: how each tracks loaded files, schema evolution and rescued data, triggers, scale limits and which to choose."
technology: ["databricks", "delta-lake", "spark"]
topic: ["ingestion", "streaming"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Both load each new file into a Delta table once. COPY INTO is an idempotent SQL batch command that remembers which files it has loaded into the target table; it suits simple loads of up to thousands of files. Auto Loader is a Structured Streaming source (cloudFiles) that records processed files in its checkpoint, scales to millions of files with directory listing or file notifications, infers and evolves the schema, and keeps unparseable values in a rescued data column. For a growing landing directory I would use Auto Loader with availableNow on a schedule, or continuously if latency matters."
followUps: ["What happens if you delete the Auto Loader checkpoint?", "How does Auto Loader handle a new column in the source files?", "What is the difference between directory listing and file notification mode?", "How would you reprocess one bad file?"]
related: ["articles:databricks/auto-loader-declarative-pipelines", "articles:spark/structured-streaming", "articles:etl-elt/incremental-loading-watermarks-backfills"]
sources:
  - {"label": "Databricks documentation: What is Auto Loader?", "url": "https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/"}
  - {"label": "Databricks documentation: Configure schema inference and evolution in Auto Loader", "url": "https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/schema"}
  - {"label": "Databricks documentation: COPY INTO", "url": "https://docs.databricks.com/aws/en/sql/language-manual/delta-copy-into"}
versionContext: "Describes Databricks as documented in October 2026. The examples need a Databricks workspace and were checked against the documentation, not executed; the open-source equivalent of the Auto Loader checkpoint behaviour is run in the linked lesson."
---

## Detailed explanation

| | `COPY INTO` | Auto Loader |
|---|---|---|
| Interface | SQL command, run from a job or warehouse | `spark.readStream.format("cloudFiles")`, or `read_files` in a streaming table |
| Remembers loaded files in | The target Delta table's metadata | The stream's checkpoint (RocksDB) |
| Discovery | Lists the source path each run | Directory listing, or file notifications / file events for large, busy directories |
| Schema | Fixed or inferred per run; `mergeSchema` option | Inferred, stored in `schemaLocation`, evolved by mode (`addNewColumns` default, `rescue`, `failOnNewColumns`, `none`) |
| Bad values | Fail or `NULL` depending on options | Kept in `_rescued_data` |
| Scale | Thousands of files per load | Millions of files |
| Re-run behaviour | Already-loaded files are skipped (unless `force`) | Files recorded in the checkpoint are skipped |

## Example

`COPY INTO`, rerunnable as often as you like:

<!-- noexec -->
```sql
CREATE TABLE IF NOT EXISTS prod.bronze.orders;

COPY INTO prod.bronze.orders
FROM '/Volumes/prod/landing/orders/'
FILEFORMAT = JSON
FORMAT_OPTIONS ('inferSchema' = 'true')
COPY_OPTIONS ('mergeSchema' = 'true');
```

Auto Loader, scheduled hourly as an incremental batch:

<!-- noexec -->
```python
(spark.readStream.format("cloudFiles")
    .option("cloudFiles.format", "json")
    .option("cloudFiles.schemaLocation", "/Volumes/prod/bronze/_schemas/orders")
    .load("/Volumes/prod/landing/orders/")
    .writeStream
    .option("checkpointLocation", "/Volumes/prod/bronze/_checkpoints/orders")
    .trigger(availableNow=True)
    .toTable("prod.bronze.orders"))
```

With `addNewColumns`, a file with a new column stops the stream after the new schema is recorded; a job retry restarts it with the column added. That is designed behaviour, so configure retries on the task.

## Trade-offs and pitfalls

- **The checkpoint is the memory.** Deleting it, or pointing a new query at the same target with a new checkpoint, reloads every file. To reprocess one file, delete or fix the affected rows and load that file with a separate batch read, rather than resetting the stream.
- **Files changed in place** are not picked up again by default; landing zones should be write-once (new files, new names).
- **Listing cost.** Directory listing on a huge prefix is slow and costs storage API calls; switch to notifications or file events, or partition the landing path by date.
- **Simplicity.** For a few files a day and a SQL-only team, `COPY INTO` (or a streaming table with `read_files`) is simpler to operate.

## Common mistakes

1. Using plain `spark.read` on the whole landing folder every run and deduplicating afterwards.
2. Sharing one checkpoint between two streams.
3. Ignoring `_rescued_data`, so values that failed to parse silently vanish from downstream metrics.
4. Treating the schema-change stop as an outage instead of configuring retries.

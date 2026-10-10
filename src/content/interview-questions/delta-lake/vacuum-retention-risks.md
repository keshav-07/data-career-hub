---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What does VACUUM do in Delta Lake, and what can go wrong?"
seoTitle: "Delta Lake VACUUM and Retention Risks"
description: "Delta Lake VACUUM interview answer: what it deletes, how retention limits time travel and long readers, why short retention is blocked, and safe usage."
technology: ["delta-lake", "spark"]
topic: ["maintenance", "time-travel"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 6
interviewRelevance: "High"
shortAnswer: "VACUUM permanently deletes data files that the current table version no longer references and that are older than the retention threshold, 7 days by default (delta.deletedFileRetentionDuration), including orphans from failed writes. It does not touch the transaction log. Once it runs, time travel and RESTORE to versions that needed those files fail, and readers or streams still using an older snapshot can hit missing files. Delta refuses a retention below the threshold unless you disable a safety check. The retention must exceed the longest-running reader, the maximum stream lag and the restore window you promise."
followUps: ["Why can a version listed in DESCRIBE HISTORY fail to read?", "Is DELETE plus VACUUM enough for GDPR erasure on a table with deletion vectors?", "What is VACUUM LITE?", "Does VACUUM run automatically?"]
related: ["articles:delta-lake/optimize-zorder-vacuum-liquid-clustering", "articles:delta-lake/transactions-schema-evolution", "interview-questions:delta-lake/time-travel-use-cases-limits"]
versionContext: "Behaviour checked with PySpark 4.2.0 and delta-spark 4.4.0 (open-source Delta)"
sources:
  - { label: "Delta Lake documentation: Table utility commands", url: "https://docs.delta.io/delta-utility/" }
  - { label: "Delta Lake documentation: Table properties reference", url: "https://docs.delta.io/table-properties/" }
---

## Detailed explanation

`DELETE`, `UPDATE`, `MERGE`, `OPTIMIZE` and overwrites never delete data files; they add `remove` actions to the log, so older versions can still read the files. `VACUUM` is the step that actually frees the storage. It deletes files that are:

1. not referenced by the current version, and
2. older than the retention threshold.

It is not automatic in open-source Delta; schedule it. `VACUUM ... DRY RUN` lists what would be deleted. `VACUUM LITE` (Delta 3.3 and later) finds candidates from the log rather than listing the whole directory, which is much cheaper on large object-store tables.

## Example

In a local test, `t.vacuum(0)` failed with `DELTA_VACUUM_RETENTION_PERIOD_TOO_SHORT`. After disabling `spark.databricks.delta.retentionDurationCheck.enabled` and running `VACUUM ... RETAIN 0 HOURS`, the current version still read correctly, but reading version 0 failed with `FAILED_READ_FILE.FILE_NOT_EXIST`.

<!-- noexec -->
```sql
VACUUM events DRY RUN;                       -- inspect first
VACUUM events;                               -- default 7-day retention
ALTER TABLE events SET TBLPROPERTIES ('delta.deletedFileRetentionDuration' = 'interval 14 days');
```

## Trade-offs and pitfalls

- **Long readers and streams.** A job that started before a compaction still reads the pre-compaction files; a lagging stream may need files from days ago. Retention must cover both.
- **Restore window.** If you promise "we can roll back a week", keep at least a week, and keep `delta.logRetentionDuration` (30 days by default) at least as long.
- **Cost.** Longer retention keeps more removed files in storage, especially on tables rewritten often by `MERGE` or `OPTIMIZE`.
- **Erasure.** With deletion vectors, deleted rows remain in the Parquet files until they are rewritten (`REORG TABLE ... APPLY (PURGE)` or compaction); only then can `VACUUM` remove the old files after the retention period.

## Common mistakes

1. Disabling the retention check to "save storage" while jobs are running.
2. Assuming a `count()` on an old version proves its files exist; Delta can answer it from log statistics without opening files.
3. Treating time travel as long-term backup.

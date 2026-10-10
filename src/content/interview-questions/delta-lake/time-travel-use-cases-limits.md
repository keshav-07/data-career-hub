---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is Delta Lake time travel good for, and what are its limits?"
seoTitle: "Delta Lake Time Travel: Uses and Limits"
description: "Delta Lake time travel interview answer: querying and restoring old versions, audit and reproducibility uses, and why retention, VACUUM and streams limit it."
technology: ["delta-lake", "spark"]
topic: ["time-travel", "lakehouse"]
difficulty: "Easy"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 6
interviewRelevance: "High"
shortAnswer: "Every Delta commit creates a version, and old data files are kept until VACUUM removes them, so you can read an earlier version with VERSION AS OF or TIMESTAMP AS OF and roll back with RESTORE, which writes a new commit and keeps history. It is useful for debugging a bad load, comparing before and after a job, rolling back mistakes and pinning a dataset for a report or model. Its limits: it only works while both the log entries (30 days by default) and the data files (removable after 7 days by default) still exist, it is per table, and a RESTORE looks like new data to downstream streams. It is a short-term safety net, not an archive."
followUps: ["How would you find what a job changed yesterday?", "What happens to a streaming consumer when you RESTORE its source?", "How would you keep month-end snapshots for seven years?", "How does the change data feed differ from time travel?"]
related: ["articles:delta-lake/transactions-schema-evolution", "interview-questions:delta-lake/vacuum-retention-risks", "interview-questions:delta-lake/what-delta-lake-solves"]
versionContext: "Behaviour checked with PySpark 4.2.0 and delta-spark 4.4.0 (open-source Delta)"
sources:
  - { label: "Delta Lake documentation: Table batch reads and writes", url: "https://docs.delta.io/delta-batch/" }
  - { label: "Delta Lake documentation: Table utility commands", url: "https://docs.delta.io/delta-utility/" }
---

## Detailed explanation

A version is just the set of files listed by the log at that commit. Reading an old version replays the log up to it and reads those files.

| Use | How |
|---|---|
| Debug a bad load | Compare the version before and after the job |
| Roll back | `RESTORE TABLE t TO VERSION AS OF n` |
| Reproducibility | Record the version number a report or training set used |
| Audit | `DESCRIBE HISTORY` shows who ran which operation with which metrics |

## Example

<!-- noexec -->
```sql
DESCRIBE HISTORY orders;                                    -- find the bad version, say 42
SELECT * FROM orders VERSION AS OF 41
EXCEPT
SELECT * FROM orders VERSION AS OF 42;                      -- rows the job removed or changed
RESTORE TABLE orders TO VERSION AS OF 41;                   -- new commit 43, history kept
```

## Trade-offs and pitfalls

- **Retention.** `delta.logRetentionDuration` (30 days by default) bounds the history; `VACUUM` with `delta.deletedFileRetentionDuration` (7 days by default) removes the files older versions need. A version can appear in `DESCRIBE HISTORY` and still fail to read.
- **Per table.** There is no consistent multi-table time travel; restoring a fact table does not restore its dimensions.
- **Streams.** `RESTORE` is a data change; a streaming consumer of the table sees the restored files as new data and may produce duplicates.
- **Cost.** Long retention on frequently rewritten tables keeps a lot of removed data in storage.
- **Long-term history** belongs in the data model: periodic snapshot tables, Type 2 dimensions or an append-only log, not in time travel.

## Common mistakes

1. Promising auditors years of history from time travel.
2. Restoring a table that feeds streams without warning the consumers.
3. Forgetting that a schema change is also versioned: an old version may have different columns.

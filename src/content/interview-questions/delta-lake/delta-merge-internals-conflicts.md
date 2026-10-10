---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How does Delta Lake MERGE work, and why do concurrent MERGEs fail?"
seoTitle: "Delta Lake MERGE Internals and Conflicts"
description: "Delta Lake MERGE interview answer: how it finds and rewrites touched files, why duplicate source rows fail, and how to avoid ConcurrentAppendException."
technology: ["delta-lake", "spark"]
topic: ["merge", "concurrency"]
difficulty: "Medium"
questionType: ["conceptual", "debugging"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "MERGE joins the source to the target to find which target files contain matching rows, rewrites only those files (updated, deleted and unchanged rows from them) plus new files for inserts, and commits the removes and adds in one transaction. Its cost is the number of target files touched, so the condition should include a partition or clustering column. It fails if several source rows match one target row, so deduplicate the source first. Two MERGEs conflict when one commits files into data the other read, raising ConcurrentAppendException; make the jobs touch disjoint partitions and put that column in both conditions, or run them in sequence."
followUps: ["How do deletion vectors change what MERGE rewrites?", "How would you make a CDC MERGE safe against out-of-order events?", "Do two concurrent appends ever conflict?", "What does WHEN NOT MATCHED BY SOURCE do and when is it dangerous?"]
related: ["articles:delta-lake/merge-upserts-change-data-feed", "articles:delta-lake/transactions-schema-evolution", "interview-questions:data-engineering/design-cdc-pipeline"]
versionContext: "Behaviour checked with PySpark 4.2.0 and delta-spark 4.4.0"
sources:
  - { label: "Delta Lake documentation: Table deletes, updates and merges", url: "https://docs.delta.io/delta-update/" }
  - { label: "Delta Lake documentation: Concurrency control", url: "https://docs.delta.io/concurrency-control/" }
---

## Detailed explanation

A Delta `MERGE` runs in two phases inside one transaction:

1. **Find touched files.** An inner join between the source and the target on the merge condition identifies which target data files contain at least one matching row. File statistics and partition values in the transaction log let Delta skip files that cannot match.
2. **Rewrite.** Each touched file is rewritten: matched rows are updated or dropped, unmatched rows in the same file are copied as they are. Rows from `WHEN NOT MATCHED` go to new files. The commit removes the old files and adds the new ones atomically.

With **deletion vectors** enabled, step 2 marks matched rows as deleted in a small side file instead of copying the rest of the file, which makes merges that touch a few rows in many files much cheaper.

### Why duplicate source rows fail

If two source rows match the same target row, the result would depend on which one is applied last, so Delta raises `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE`. CDC batches often contain several changes per key; keep the latest per key by the source's sequence number (log sequence number or commit timestamp) first.

### Why concurrent MERGEs conflict

Delta uses optimistic concurrency. Each writer records the version it read, writes its files, and then tries to commit the next version. If another commit landed first, Delta checks whether that commit changed data the current transaction read:

| Exception | Meaning |
|---|---|
| `ConcurrentAppendException` | The other commit added files to data this transaction read (for example both merged into the same partition) |
| `ConcurrentDeleteReadException` | The other commit removed a file this transaction read |
| `ConcurrentDeleteDeleteException` | Both removed the same file (two merges, or a merge racing `OPTIMIZE`) |

Pure appends never conflict with each other.

## Example

A partitioned target where two jobs each load one region. Including the partition column in the condition lets Delta prove the jobs touch disjoint files:

<!-- noexec -->
```sql
MERGE INTO sales AS t
USING sales_updates_eu AS s
ON t.region = 'EU' AND t.region = s.region AND t.sale_id = s.sale_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

The `s.updated_at > t.updated_at` guard makes a replayed or out-of-order batch harmless: an older change never overwrites a newer one.

## Trade-offs and pitfalls

- A condition on the key alone can make every file a candidate, so a 10,000-row batch rewrites most of the table. Add a partition or clustering column, or cluster the table on the merge key.
- Retrying on a conflict is safe only if the merge is idempotent (guarded updates, deduplicated source).
- `WHEN NOT MATCHED BY SOURCE THEN DELETE` deletes every target row absent from the source; use it only when the source is a complete snapshot of the scope, and restrict it with a condition.
- Source rows with a NULL key never match, so they are inserted again on every run.

## Common mistakes

1. Saying MERGE updates rows in place. Parquet files are immutable; files are rewritten (or rows marked deleted with deletion vectors).
2. Fixing conflicts with blind retries of a non-idempotent job.
3. Forgetting to deduplicate the source.

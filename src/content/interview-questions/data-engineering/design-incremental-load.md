---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How would you design an incremental load for a large table?"
seoTitle: "Designing an Incremental Load: Interview Answer"
description: "Interview answer: pick a reliable change signal, keep a watermark that moves atomically with the data, re-read a lookback through an idempotent MERGE, and handle deletes."
technology: ["data-engineering", "sql"]
topic: ["incremental-loading", "watermarks", "idempotency"]
difficulty: "Medium"
questionType: ["architecture", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "First I find a reliable change signal: CDC from the database log if updates and deletes must be exact, otherwise an updated_at column that every write maintains. Each run reads rows above the stored high watermark and up to a fixed upper bound, re-reading a lookback window to catch late commits, and merges them into the target on the natural key with a guard that only newer versions win. The watermark is advanced to the newest change actually loaded, in the same transaction as the merge. Deletes come from soft-delete flags, CDC or a periodic key reconciliation, and a scheduled full refresh or row-count reconciliation catches drift."
followUps: ["Why not set the watermark to now() at the end of the run?", "How long should the lookback window be?", "How do you detect hard deletes without CDC?", "How does dbt implement incremental models?", "How would you backfill if the merge logic had a bug for three months?"]
related: ["articles:etl-elt/incremental-loading-watermarks-backfills", "articles:etl-elt/idempotency-in-data-pipelines", "interview-questions:data-engineering/design-cdc-pipeline", "interview-questions:data-engineering/idempotent-batch-pipeline"]
sources:
  - { label: "PostgreSQL documentation: MERGE", url: "https://www.postgresql.org/docs/current/sql-merge.html" }
  - { label: "dbt documentation: Configure incremental models", url: "https://docs.getdbt.com/docs/build/incremental-models" }
versionContext: "SQL verified on PostgreSQL 16.14"
---

## Detailed explanation

A full refresh is always correct but its cost grows with the whole table. An incremental load processes only what changed, which means the pipeline now has **state** (where it stopped) and every way that state can be wrong becomes a data bug. Structure the answer around five decisions.

### 1. The change signal

| Signal | Works for | Blind spots |
|--------|-----------|-------------|
| Increasing id | Append-only tables | Updates and deletes |
| `updated_at` | Mutable rows where every write sets it | Deletes, writes that skip the column, late commits |
| CDC (database log) | Everything, including deletes | Operating the connector |

Ask the source team how `updated_at` is maintained (application code, trigger, ORM) before trusting it.

### 2. A bounded, reproducible window

Read `updated_at > low AND updated_at <= high`, where `low` comes from a state table and `high` is fixed for the run (the end of the data interval, or now minus a small safety lag). A retry then reads exactly the same rows.

### 3. An idempotent, order-safe merge

Deduplicate the window to one row per key (latest version), then `MERGE` on the natural key, updating only when the incoming version is newer. This is what makes re-reading safe.

### 4. Atomic state

Advance the watermark **in the same transaction** as the merge, and to the newest `updated_at` actually loaded, never to `now()`. If the run fails, the watermark has not moved and the next run retries the same window.

### 5. The lookback

A row's `updated_at` is set when it is written but it becomes visible when its transaction commits. A long transaction can commit a row stamped earlier than the current watermark. Re-reading a lookback (for example 30 minutes, longer than the longest source transaction) catches those rows; the guarded merge ignores the ones already loaded.

## Example

```sql
CREATE TABLE src (id bigint PRIMARY KEY, val text, updated_at timestamptz NOT NULL);
CREATE TABLE tgt (id bigint PRIMARY KEY, val text, updated_at timestamptz NOT NULL);
CREATE TABLE etl_state (pipeline text PRIMARY KEY, high_watermark timestamptz NOT NULL);
INSERT INTO etl_state VALUES ('src_to_tgt', '2026-10-05 10:00+00');
INSERT INTO src VALUES (1, 'a', '2026-10-05 09:50+00'),   -- committed late, inside the lookback
                       (2, 'b', '2026-10-05 10:10+00');

BEGIN;
CREATE TEMP TABLE batch ON COMMIT DROP AS
SELECT DISTINCT ON (id) s.*
FROM src AS s, etl_state AS st
WHERE st.pipeline = 'src_to_tgt'
  AND s.updated_at >  st.high_watermark - interval '30 minutes'   -- lookback
  AND s.updated_at <= timestamptz '2026-10-05 11:00+00'           -- fixed upper bound
ORDER BY id, updated_at DESC;

MERGE INTO tgt AS t USING batch AS b ON t.id = b.id
WHEN MATCHED AND b.updated_at > t.updated_at THEN UPDATE SET val = b.val, updated_at = b.updated_at
WHEN NOT MATCHED THEN INSERT VALUES (b.id, b.val, b.updated_at);

UPDATE etl_state
SET high_watermark = GREATEST(high_watermark, COALESCE((SELECT max(updated_at) FROM batch), high_watermark))
WHERE pipeline = 'src_to_tgt';
COMMIT;

SELECT (SELECT count(*) FROM tgt) AS target_rows, high_watermark AT TIME ZONE 'UTC' AS watermark_utc FROM etl_state;
```

| target_rows | watermark_utc |
|-------------|---------------|
| 2 | 2026-10-05 10:10:00 |

Row 1 is older than the stored watermark but is still loaded thanks to the lookback. Running the same block again leaves the target unchanged.

## Deletes

`updated_at` never shows a hard delete. Options, in order of preference: CDC; a soft-delete column in the source; a periodic **key reconciliation** that compares the full key list from the source with the target and flags missing keys. State which one you would use and how often.

## Trade-offs and pitfalls

- A long lookback is safer but re-reads more data every run; size it from evidence about source transactions.
- Merge cost grows with the target unless it is clustered or partitioned on the merge key or on a column you can prune by (for example, only merge into the last 90 days of partitions if older rows never change).
- Time zones: compare `timestamptz` values; a local-time column jumps at daylight-saving changes.
- Keep a safety net: a weekly full refresh, or a daily count and checksum reconciliation per partition.
- In dbt the same design is an incremental model with `unique_key`, a `merge` or `delete+insert` strategy and an explicit lookback in the `is_incremental()` filter.

## Common mistakes

1. Setting the watermark to `now()` instead of the newest loaded change.
2. Updating the watermark in a separate transaction from the load.
3. A strict `>` with no lookback.
4. Merging a window that contains several versions of the same key.
5. Claiming the design handles deletes when it only reads `updated_at`.

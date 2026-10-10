---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you build an incremental pipeline with Snowflake streams and tasks?"
seoTitle: "Snowflake Streams and Tasks Pipeline: Interview"
description: "Interview answer: a Snowflake stream tracks source changes, a task gated by SYSTEM$STREAM_HAS_DATA runs a MERGE, and the offset moves only on commit."
technology: ["snowflake"]
topic: ["streams", "tasks", "cdc", "incremental-loading"]
difficulty: "Medium"
questionType: ["architecture", "coding"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "Create a standard stream on the source table; it stores an offset into the table's version history and returns net inserts, updates and deletes with METADATA$ACTION and METADATA$ISUPDATE. Create a task (on a warehouse or serverless) with WHEN SYSTEM$STREAM_HAS_DATA so empty runs are skipped without resuming compute, whose body is one MERGE that drops update before-images, deletes on DELETE rows, and upserts INSERT rows, deduplicating business keys if needed. The stream's offset advances only when that DML commits, so a failed run leaves the changes for the next one: exactly-once application. Resume the task (tasks start suspended), give each consumer its own stream, and monitor task failures and stream staleness."
followUps: ["When does a stream's offset advance?", "What happens if the task is suspended for a month?", "Why must you filter update before-images in the MERGE?", "When would a dynamic table be a better choice?"]
related: ["articles:snowflake/streams-and-tasks", "articles:etl-elt/cdc-patterns-and-failure-modes", "articles:data-warehousing/slowly-changing-dimensions"]
versionContext: "Snowflake behaviour as documented in October 2026. Snowflake SQL is not executed here (noexec). The net-change logic was reproduced on PostgreSQL 16 in the linked lesson."
sources:
  - { label: "Snowflake documentation: Introduction to streams", url: "https://docs.snowflake.com/en/user-guide/streams-intro" }
  - { label: "Snowflake documentation: Introduction to tasks", url: "https://docs.snowflake.com/en/user-guide/tasks-intro" }
---

## Detailed explanation

**The stream**

- A stream on a table stores an **offset**, not data. Querying it returns the rows changed between the offset and now, with `METADATA$ACTION` (`INSERT` or `DELETE`), `METADATA$ISUPDATE` and `METADATA$ROW_ID`.
- A **standard** stream returns **net** changes: an update appears as a `DELETE` (old values) plus an `INSERT` (new values), both with `ISUPDATE = TRUE`; a row inserted and deleted in between does not appear. An **append-only** stream returns only inserts and is cheaper for event tables.
- The offset advances **only when a DML statement that reads the stream commits**, and then it consumes all changes, even rows your `WHERE` clause filtered out. A plain `SELECT` never advances it. One stream per consumer.
- A stream goes **stale** if its offset falls outside the table's retention; Snowflake extends retention for unconsumed streams up to `MAX_DATA_EXTENSION_TIME_IN_DAYS` (default 14).

**The task**

- Runs SQL on a schedule (`'5 MINUTE'` or `USING CRON ... UTC`), after another task, or (triggered tasks) when a stream has data.
- `WHEN SYSTEM$STREAM_HAS_DATA('...')` is evaluated in cloud services: if the stream is empty, the run is skipped and no warehouse resumes.
- Created **suspended**; runs as its **owner role**; serverless if `WAREHOUSE` is omitted.

## Example

<!-- noexec -->
```sql
CREATE OR REPLACE STREAM raw.customers_stream ON TABLE raw.customers;

CREATE OR REPLACE TASK analytics.apply_customer_changes
  WAREHOUSE = transform_wh
  SCHEDULE = '5 MINUTE'
  SUSPEND_TASK_AFTER_NUM_FAILURES = 3
  WHEN SYSTEM$STREAM_HAS_DATA('raw.customers_stream')
AS
MERGE INTO analytics.dim_customer AS t
USING (
  SELECT *
  FROM raw.customers_stream
  WHERE NOT (METADATA$ACTION = 'DELETE' AND METADATA$ISUPDATE)        -- drop update before-images
  QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id, METADATA$ACTION
                             ORDER BY updated_at DESC) = 1             -- one row per key and action
) AS s
ON t.customer_id = s.customer_id
WHEN MATCHED AND s.METADATA$ACTION = 'DELETE' THEN DELETE
WHEN MATCHED AND s.METADATA$ACTION = 'INSERT' THEN
  UPDATE SET t.name = s.name, t.tier = s.tier, t.updated_at = s.updated_at
WHEN NOT MATCHED AND s.METADATA$ACTION = 'INSERT' THEN
  INSERT (customer_id, name, tier, updated_at) VALUES (s.customer_id, s.name, s.tier, s.updated_at);

ALTER TASK analytics.apply_customer_changes RESUME;

-- Monitoring
SHOW STREAMS LIKE 'CUSTOMERS_STREAM' IN SCHEMA raw;      -- check stale and stale_after
SELECT name, state, error_message, scheduled_time
FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(TASK_NAME => 'APPLY_CUSTOMER_CHANGES'))
ORDER BY scheduled_time DESC LIMIT 20;
```

Each `WHEN` clause handles one case: a real delete, an update or insert of an existing key, and a new key. Without the before-image filter, every update would match the `DELETE` branch and remove the row.

For multi-step pipelines, chain tasks into a **task graph** (`AFTER parent_task`) with a **finalizer** for cleanup and alerts, and set `TASK_AUTO_RETRY_ATTEMPTS` on the root.

## Trade-offs and pitfalls

- **Exactly-once comes from transactions**: consume the stream in one DML statement, or in one explicit transaction if several statements read it (they all see the same changes).
- **Testing by hand consumes changes**: running the `MERGE` manually advances the offset the task needed.
- **Silent stops**: a task auto-suspended after repeated failures does not fail again; alert on suspension and on `STALE_AFTER`.
- **Duplicate business keys** in the source make `MERGE` fail or behave nondeterministically; deduplicate in the `USING` clause.
- **Serverless versus warehouse**: serverless suits short, frequent runs (no idle time or 60-second minimum); warehouses suit heavy runs and can be capped by resource monitors.
- **Dynamic tables** replace many of these pipelines declaratively when the logic is a plain query.

## Common mistakes

1. Two tasks reading one stream.
2. Forgetting `ALTER TASK ... RESUME` after `CREATE OR REPLACE`.
3. Using an append-only stream where updates and deletes matter.

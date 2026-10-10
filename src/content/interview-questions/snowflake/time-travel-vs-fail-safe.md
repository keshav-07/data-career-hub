---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is the difference between Snowflake Time Travel and Fail-safe?"
seoTitle: "Snowflake Time Travel vs Fail-safe: Interview"
description: "Interview answer: Time Travel is self-service history you query, clone or undrop within retention; Fail-safe is 7 more days only Snowflake Support can recover, for permanent tables."
technology: ["snowflake"]
topic: ["time-travel", "fail-safe", "data-recovery"]
difficulty: "Easy"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "Time Travel keeps the micro-partitions replaced by changes and drops for a retention period (DATA_RETENTION_TIME_IN_DAYS, default 1 day; up to 1 day on Standard Edition and up to 90 days on Enterprise for permanent objects), and you use it yourself: query with AT or BEFORE, UNDROP objects and clone a point in time. Fail-safe starts when Time Travel ends, lasts a fixed 7 days, applies only to permanent tables, cannot be queried or configured, and only Snowflake Support can recover from it on a best-effort basis after a disaster. Both are billed as storage. Transient and temporary tables have no Fail-safe and at most 1 day of Time Travel, which is why rebuildable staging tables are made transient."
followUps: ["How do you recover from an accidental CREATE OR REPLACE TABLE?", "Why can a staging table's storage be several times its size?", "What is the difference between AT and BEFORE with a statement ID?", "Is Time Travel a backup strategy?"]
related: ["articles:snowflake/time-travel-fail-safe-cloning", "interview-questions:snowflake/zero-copy-clone-uses", "articles:snowflake/cost-optimization"]
versionContext: "Snowflake behaviour as documented in October 2026. Snowflake SQL is not executed here (noexec)."
sources:
  - { label: "Snowflake documentation: Understanding and using Time Travel", url: "https://docs.snowflake.com/en/user-guide/data-time-travel" }
  - { label: "Snowflake documentation: Understanding and viewing Fail-safe", url: "https://docs.snowflake.com/en/user-guide/data-failsafe" }
---

## Detailed explanation

```text
change or drop        retention ends            7 days later
   |---- Time Travel ----|------ Fail-safe ------|  purged
   (you: query, clone,      (Snowflake Support
    undrop)                  only, best effort)
```

| | Time Travel | Fail-safe |
|--|-------------|-----------|
| Who uses it | You, with SQL | Snowflake Support only |
| Length | `DATA_RETENTION_TIME_IN_DAYS`: default 1; 0 to 1 on Standard; 0 to 90 on Enterprise+ for permanent objects | Fixed 7 days |
| Applies to | Permanent, transient (0 or 1 day), temporary (0 or 1, ends with the session) | Permanent tables only |
| Operations | `AT`/`BEFORE` queries, `UNDROP`, `CLONE ... AT` | Recovery request |
| Billed | Yes, as storage | Yes, as storage |

Related facts interviewers probe:

- Retention is set at account, database, schema or table level; the most specific wins. `MIN_DATA_RETENTION_TIME_IN_DAYS` at account level enforces a floor.
- Unconsumed streams can temporarily extend a table's retention (up to `MAX_DATA_EXTENSION_TIME_IN_DAYS`).
- `TABLE_STORAGE_METRICS` shows `TIME_TRAVEL_BYTES` and `FAILSAFE_BYTES` per table.

## Example

Recovering from a bad `UPDATE` at 03:00 and from an accidental replace:

<!-- noexec -->
```sql
-- What did the rows look like just before the bad statement?
CREATE TABLE analytics.orders_restore
  CLONE analytics.orders BEFORE (STATEMENT => '<query id of the bad UPDATE>');

-- Put back only the damaged values, keeping legitimate writes made since
UPDATE analytics.orders AS t
SET status = r.status
FROM analytics.orders_restore AS r
WHERE t.order_id = r.order_id AND t.status IS DISTINCT FROM r.status
  AND t.updated_at < '2026-10-09 03:00:00'::TIMESTAMP_LTZ;    -- not touched since the incident

-- Someone ran CREATE OR REPLACE TABLE customers ...: the old table counts as dropped
ALTER TABLE crm.customers RENAME TO crm.customers_bad;
UNDROP TABLE crm.customers;
```

## Trade-offs and pitfalls

- **Longer retention costs storage**, especially on high-churn tables, where every rewrite keeps a full old copy for the retention period plus 7 days of Fail-safe.
- **Transient staging tables** avoid Fail-safe storage, at the cost of no recovery after a day.
- **Not a backup**: both live in the same account and follow the object's lifecycle. Use replication to another account or region, or exports, for disaster recovery; for long-lived snapshots, a clone retains old micro-partitions (and their cost).
- **Do not plan around Fail-safe**: recovery is best effort and not self-service.

## Common mistakes

1. Calling Fail-safe "seven more days of Time Travel".
2. Expecting 30-day Time Travel on Standard Edition.
3. Using `OFFSET` in a recovery script that may run later than planned; prefer `STATEMENT` or a timestamp.

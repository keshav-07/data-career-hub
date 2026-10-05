---
title: "Gaps and Islands, Streaks and Sessionization in SQL"
seoTitle: "Gaps and Islands, Streaks and Sessions in SQL"
description: "Solve gaps-and-islands problems with window functions: find missing values, group consecutive rows, measure streaks and split clickstreams into sessions."
technology: ["sql"]
topic: ["window-functions", "gaps-and-islands", "sessionization"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Find gaps in sequences of numbers and dates with LEAD and calendar anti-joins"
  - "Group consecutive rows into islands with the row-number difference and the change-flag running sum"
  - "Measure the longest, current and minimum-length streaks per user, handling duplicate days"
  - "Sessionize event streams with an inactivity timeout and summarise each session"
prerequisites: ["articles:sql/window-functions"]
related: ["articles:sql/recursive-ctes-hierarchies", "articles:pyspark/window-functions", "system-designs:clickstream-data-platform"]
next: "articles:sql/retention-cohort-funnel-analysis"
previous: "articles:sql/recursive-ctes-hierarchies"
versionContext: "All SQL examples run on PostgreSQL 16.14. The techniques use standard window functions; date arithmetic syntax differs by engine and is noted where it matters."
sources:
  - { label: "PostgreSQL 16 documentation: Window functions", url: "https://www.postgresql.org/docs/16/functions-window.html" }
  - { label: "PostgreSQL documentation: Window functions tutorial", url: "https://www.postgresql.org/docs/current/tutorial-window.html" }
  - { label: "Apache Spark documentation: Window functions (SQL reference)", url: "https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-window.html" }
---

"Gaps and islands" is the name for a family of problems about **runs of consecutive rows**: which values are missing from a sequence (gaps), which rows belong to the same unbroken run (islands), how long the runs are (streaks) and where activity pauses long enough to start a new run (sessions). They are among the most common advanced SQL interview questions, and the same patterns power user engagement metrics, SLA reporting and clickstream pipelines.

All of them rest on two window-function tricks, which this lesson builds up step by step.

## Sample data

```sql
CREATE TABLE logins (user_id INT, login_date DATE);
INSERT INTO logins VALUES
  (1,'2026-03-01'),(1,'2026-03-02'),(1,'2026-03-02'),(1,'2026-03-03'),
  (1,'2026-03-05'),(1,'2026-03-06'),
  (2,'2026-03-01'),(2,'2026-03-03'),(2,'2026-03-04'),(2,'2026-03-05'),(2,'2026-03-06');

CREATE TABLE invoices (invoice_no INT PRIMARY KEY);
INSERT INTO invoices VALUES (1001),(1002),(1003),(1006),(1007),(1010);

CREATE TABLE server_status (check_time TIMESTAMP, status TEXT);
INSERT INTO server_status VALUES
  ('2026-03-01 10:00','up'),('2026-03-01 10:05','up'),('2026-03-01 10:10','down'),
  ('2026-03-01 10:15','down'),('2026-03-01 10:20','up'),('2026-03-01 10:25','down'),
  ('2026-03-01 10:30','up');

CREATE TABLE clicks (user_id INT, event_time TIMESTAMP, page TEXT);
INSERT INTO clicks VALUES
  (1,'2026-03-01 09:00','home'),(1,'2026-03-01 09:10','search'),(1,'2026-03-01 09:25','product'),
  (1,'2026-03-01 10:30','home'),(1,'2026-03-01 10:31','cart'),
  (2,'2026-03-01 09:05','home'),(2,'2026-03-01 09:50','home'),(2,'2026-03-01 09:55','product');
```

Note that user 1 logged in twice on 2 March. Real event data has duplicates like this, and they break the naive streak query later on.

## The gaps and islands problem

### What it is

Given an ordered column (ids, dates, timestamps), a **gap** is a stretch of expected values that is missing, and an **island** is a maximal run of values with no gap inside it. Invoices 1001 to 1003 form an island, 1004 to 1005 are a gap, and so on. The same idea applies to non-numeric runs: a sequence of status checks that all say `down` is an island of downtime.

### Finding gaps with LEAD

Compare each row with the next one. If the difference is more than one step, the values in between are missing.

```sql
SELECT invoice_no + 1 AS gap_start, next_no - 1 AS gap_end
FROM (
  SELECT invoice_no, LEAD(invoice_no) OVER (ORDER BY invoice_no) AS next_no
  FROM invoices
) t
WHERE next_no - invoice_no > 1;
```

| gap_start | gap_end |
|---|---|
| 1004 | 1005 |
| 1008 | 1009 |

### Finding missing dates with a calendar

`LEAD` only finds gaps *between* existing rows. To find missing days at the start or end of a period, or to list every missing day, anti-join a generated calendar:

```sql
SELECT d::date AS missing_date
FROM generate_series(DATE '2026-03-01', DATE '2026-03-06', INTERVAL '1 day') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM logins l WHERE l.user_id = 2 AND l.login_date = d::date
);
```

Result: one row, `2026-03-02`. Warehouses without `generate_series` use a calendar (date dimension) table, `GENERATOR` in Snowflake or `GENERATE_DATE_ARRAY` with `UNNEST` in BigQuery.

### Islands, method 1: value minus row number

For values that should increase by exactly one step per row, subtract a `ROW_NUMBER()` from the value. Inside an island both go up by one per row, so the difference is constant; after a gap the value jumps but the row number does not, so the difference changes.

```sql
SELECT invoice_no,
       ROW_NUMBER() OVER (ORDER BY invoice_no) AS rn,
       invoice_no - ROW_NUMBER() OVER (ORDER BY invoice_no) AS grp
FROM invoices;
```

| invoice_no | rn | grp |
|---|---|---|
| 1001 | 1 | 1000 |
| 1002 | 2 | 1000 |
| 1003 | 3 | 1000 |
| 1006 | 4 | 1002 |
| 1007 | 5 | 1002 |
| 1010 | 6 | 1004 |

`grp` means nothing on its own; it is only a label that is equal within an island. Group by it:

```sql
SELECT MIN(invoice_no) AS island_start, MAX(invoice_no) AS island_end, COUNT(*) AS size
FROM (
  SELECT invoice_no, invoice_no - ROW_NUMBER() OVER (ORDER BY invoice_no) AS grp
  FROM invoices
) t
GROUP BY grp
ORDER BY island_start;
```

| island_start | island_end | size |
|---|---|---|
| 1001 | 1003 | 3 |
| 1006 | 1007 | 2 |
| 1010 | 1010 | 1 |

### Islands, method 2: change flag plus running sum

Method 1 needs a fixed step. When islands are defined by "the value stayed the same" (status, price, owner) or by "the gap was small enough" (timestamps), use two steps instead:

1. Flag a row with `1` when it **starts** a new island (it differs from the previous row), else `0`.
2. A running `SUM` of the flag numbers the islands.

```sql
WITH flagged AS (
  SELECT check_time, status,
         CASE WHEN status = LAG(status) OVER (ORDER BY check_time) THEN 0 ELSE 1 END AS is_new
  FROM server_status
), grouped AS (
  SELECT *, SUM(is_new) OVER (ORDER BY check_time) AS island_id
  FROM flagged
)
SELECT island_id, status, MIN(check_time) AS started, MAX(check_time) AS last_seen, COUNT(*) AS checks
FROM grouped
GROUP BY island_id, status
ORDER BY island_id;
```

| island_id | status | started | last_seen | checks |
|---|---|---|---|---|
| 1 | up | 2026-03-01 10:00:00 | 2026-03-01 10:05:00 | 2 |
| 2 | down | 2026-03-01 10:10:00 | 2026-03-01 10:15:00 | 2 |
| 3 | up | 2026-03-01 10:20:00 | 2026-03-01 10:20:00 | 1 |
| 4 | down | 2026-03-01 10:25:00 | 2026-03-01 10:25:00 | 1 |
| 5 | up | 2026-03-01 10:30:00 | 2026-03-01 10:30:00 | 1 |

The first row's `LAG` is `NULL`, so the comparison is not true and the `CASE` falls through to `1`, correctly starting island 1. This "flag and running sum" pattern is the more general of the two, and it is the basis of sessionization below.

### Pitfalls

- **Ties in the ORDER BY.** If two rows share a timestamp, their order is arbitrary and islands can change between runs. Add a tiebreaker column.
- **NULL values.** `status = LAG(status)` is not true when either side is `NULL`, so every `NULL` row starts a new island. Decide whether that is right, or use `IS NOT DISTINCT FROM`.
- **Partitions.** For per-entity islands, put the entity in `PARTITION BY` of every window, or islands leak across users.
- **Method 1 with a different step.** For timestamps every 5 minutes, divide first (`epoch / 300`) or use method 2.

### In interviews

Typical prompts: "find missing ids", "group consecutive rows with the same value", "report each outage with start, end and duration". Explain the trick before writing it: "inside an island the value and the row number grow together, so their difference is constant". Then cover ties, NULLs and partitions. Many candidates know the row-number trick; explaining *why* it works and when to switch to the running-sum method is what stands out.

## Detecting consecutive streaks

### What it is

A streak is an island measured in calendar units: consecutive days with a login, consecutive months with a purchase, consecutive wins. Questions ask for the longest streak, the current streak, or users with a streak of at least N.

### All streaks per user

Dates are method 1 with a step of one day: subtract the row number (as days) from the date. **De-duplicate first**, because two logins on one day must count as one day.

```sql
WITH days AS (
  SELECT DISTINCT user_id, login_date FROM logins
), grp AS (
  SELECT user_id, login_date,
         login_date - CAST(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS INT) AS streak_key
  FROM days
)
SELECT user_id, MIN(login_date) AS streak_start, MAX(login_date) AS streak_end, COUNT(*) AS days
FROM grp
GROUP BY user_id, streak_key
ORDER BY user_id, streak_start;
```

| user_id | streak_start | streak_end | days |
|---|---|---|---|
| 1 | 2026-03-01 | 2026-03-03 | 3 |
| 1 | 2026-03-05 | 2026-03-06 | 2 |
| 2 | 2026-03-01 | 2026-03-01 | 1 |
| 2 | 2026-03-03 | 2026-03-06 | 4 |

In PostgreSQL, `date - integer` returns a date. Elsewhere use `DATEADD(day, -rn, login_date)` (Snowflake, SQL Server) or `DATE_SUB(login_date, INTERVAL rn DAY)` (BigQuery).

### Why the DISTINCT matters

Without it, user 1's duplicate row shifts every later row number by one:

```sql
SELECT user_id, login_date,
       login_date - CAST(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS INT) AS streak_key
FROM logins
WHERE user_id = 1
ORDER BY login_date;
```

| user_id | login_date | streak_key |
|---|---|---|
| 1 | 2026-03-01 | 2026-02-28 |
| 1 | 2026-03-02 | 2026-02-28 |
| 1 | 2026-03-02 | 2026-02-27 |
| 1 | 2026-03-03 | 2026-02-27 |
| 1 | 2026-03-05 | 2026-02-28 |
| 1 | 2026-03-06 | 2026-02-28 |

The 1 to 3 March streak is split in two, and 5 to 6 March is glued onto 1 March because it happens to share the key `2026-02-28`. The result is silently wrong. Using `DENSE_RANK()` instead of `ROW_NUMBER()` also fixes it, because duplicates get the same rank.

### Longest and current streak

```sql
WITH days AS (
  SELECT DISTINCT user_id, login_date FROM logins
), grp AS (
  SELECT user_id, login_date,
         login_date - CAST(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS INT) AS streak_key
  FROM days
), streaks AS (
  SELECT user_id, COUNT(*) AS len, MIN(login_date) AS s, MAX(login_date) AS e
  FROM grp GROUP BY user_id, streak_key
)
SELECT DISTINCT ON (user_id) user_id, len AS longest_streak, s AS streak_start, e AS streak_end
FROM streaks
ORDER BY user_id, len DESC, s DESC;
```

| user_id | longest_streak | streak_start | streak_end |
|---|---|---|---|
| 1 | 3 | 2026-03-01 | 2026-03-03 |
| 2 | 4 | 2026-03-03 | 2026-03-06 |

`DISTINCT ON` is PostgreSQL-specific; elsewhere rank the streaks with `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY len DESC, s DESC)` and keep row 1 (or use `QUALIFY`). The **current** streak is the streak whose `streak_end` equals today (or yesterday, if today is not over yet): filter `streaks` on `e = CURRENT_DATE`. As of 6 March, user 1's current streak is 2 days and user 2's is 4.

### "At least N in a row" with LAG

For a yes/no question ("who logged in on 3 consecutive days?"), look back N-1 rows. On de-duplicated dates, if the row two back is exactly two days earlier, the three days are consecutive.

```sql
WITH days AS (SELECT DISTINCT user_id, login_date FROM logins)
SELECT DISTINCT user_id
FROM (
  SELECT user_id, login_date,
         LAG(login_date, 2) OVER (PARTITION BY user_id ORDER BY login_date) AS two_back
  FROM days
) t
WHERE login_date - two_back = 2;
```

Both users qualify. This is shorter than building every streak, but it only answers the threshold question.

### Pitfalls

- **Duplicates** (shown above): always de-duplicate to one row per entity per unit.
- **Time zones.** A "day" depends on the time zone. Convert timestamps to the user's or the business's zone before casting to a date.
- **Streaks of conditions.** For "consecutive wins", filter to wins first only if losses are absent rows; if a loss is a row, use the change-flag method on the result column instead.
- **Open streaks at the edge of the data.** A streak ending on the last loaded day may still be growing; label it as current rather than final.

### In interviews

"Find users who logged in on 3 or more consecutive days" and "longest winning streak per team" are very common. Strong answers de-duplicate first, explain the date minus row-number key, and mention the time-zone question. If you are asked to make it incremental (daily pipeline), say you would store each user's current streak and update it from the new day's data rather than recomputing history.

## Sessionization of events

### What it is

A **session** is a burst of activity separated from the next burst by a period of inactivity. Web analytics commonly uses a 30-minute inactivity timeout; the right value is a product decision. Sessionization turns a raw clickstream into rows you can count: sessions per user, session length, pages per session, conversion per session.

### How it works

It is the change-flag method with a time condition:

1. `LAG(event_time)` per user gives the previous event.
2. Flag a new session when there is no previous event or the gap exceeds the timeout.
3. A running `SUM` of the flag per user numbers the sessions.

```sql
WITH ordered AS (
  SELECT user_id, event_time, page,
         LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) AS prev_time
  FROM clicks
), flagged AS (
  SELECT *,
         CASE WHEN prev_time IS NULL
                OR event_time - prev_time > INTERVAL '30 minutes' THEN 1 ELSE 0 END AS new_session
  FROM ordered
)
SELECT user_id, event_time, page,
       SUM(new_session) OVER (PARTITION BY user_id ORDER BY event_time
                              ROWS UNBOUNDED PRECEDING) AS session_no
FROM flagged
ORDER BY user_id, event_time;
```

| user_id | event_time | page | session_no |
|---|---|---|---|
| 1 | 2026-03-01 09:00:00 | home | 1 |
| 1 | 2026-03-01 09:10:00 | search | 1 |
| 1 | 2026-03-01 09:25:00 | product | 1 |
| 1 | 2026-03-01 10:30:00 | home | 2 |
| 1 | 2026-03-01 10:31:00 | cart | 2 |
| 2 | 2026-03-01 09:05:00 | home | 1 |
| 2 | 2026-03-01 09:50:00 | home | 2 |
| 2 | 2026-03-01 09:55:00 | product | 2 |

The gap is measured from the **previous event**, not from the session start, so a session can last longer than 30 minutes as long as no single pause does. `ROWS UNBOUNDED PRECEDING` makes the running sum count row by row even if two events share a timestamp.

### Summarising sessions

```sql
WITH ordered AS (
  SELECT user_id, event_time, page,
         LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) AS prev_time
  FROM clicks
), flagged AS (
  SELECT *,
         CASE WHEN prev_time IS NULL
                OR event_time - prev_time > INTERVAL '30 minutes' THEN 1 ELSE 0 END AS new_session
  FROM ordered
), sessions AS (
  SELECT *, SUM(new_session) OVER (PARTITION BY user_id ORDER BY event_time
                                   ROWS UNBOUNDED PRECEDING) AS session_no
  FROM flagged
)
SELECT user_id, session_no,
       MIN(event_time) AS session_start,
       MAX(event_time) - MIN(event_time) AS duration,
       COUNT(*) AS events,
       STRING_AGG(page, ' > ' ORDER BY event_time) AS journey
FROM sessions
GROUP BY user_id, session_no
ORDER BY user_id, session_no;
```

| user_id | session_no | session_start | duration | events | journey |
|---|---|---|---|---|---|
| 1 | 1 | 2026-03-01 09:00:00 | 00:25:00 | 3 | home > search > product |
| 1 | 2 | 2026-03-01 10:30:00 | 00:01:00 | 2 | home > cart |
| 2 | 1 | 2026-03-01 09:05:00 | 00:00:00 | 1 | home |
| 2 | 2 | 2026-03-01 09:50:00 | 00:05:00 | 2 | home > product |

A globally unique session id is usually `user_id || '-' || session_no`, or a hash of the user and session start time. `STRING_AGG` is `LISTAGG` in Snowflake and `STRING_AGG` in BigQuery.

### Engine and pipeline notes

- Spark has a built-in `session_window` function for exactly this (gap-based windows, in batch and Structured Streaming).
- Timestamp differences are written differently: `event_time - prev_time > INTERVAL '30 minutes'` in PostgreSQL, `DATEDIFF('minute', prev_time, event_time) > 30` in Snowflake, `TIMESTAMP_DIFF(event_time, prev_time, MINUTE) > 30` in BigQuery.
- In a daily batch, a session can cross midnight. Reprocess a lookback window (for example, the previous day's last hour) or carry each user's last event time forward, otherwise sessions are cut at the partition boundary.

### Pitfalls

- **Single-event sessions** have a duration of zero. Decide whether to report them, add a nominal duration, or exclude them from averages.
- **Late or out-of-order events** change session boundaries after the fact. Sessionize on event time, and allow late-arriving data to trigger a recompute for the affected users.
- **Bots and very long sessions.** Some definitions also start a new session at midnight, after a maximum length, or when the traffic source changes. Add those as extra `OR` conditions in the flag.
- **Clock skew between devices** can produce negative gaps. Order by a server-side timestamp if you have one.

### In interviews

"Assign a session id to each event where a session ends after 30 minutes of inactivity" is a classic. Write the three steps (LAG, flag, running sum), then talk about late data, sessions spanning partition boundaries and how you would make it incremental. Saying that this is the same pattern as general islands shows you understand it rather than memorised it.

## Practice questions

<details><summary>Explain why "value minus ROW_NUMBER()" identifies islands.</summary>

Within a run of consecutive values, both the value and the row number increase by one per row, so their difference stays the same. When a gap occurs, the value jumps by more than one but the row number still increases by one, so the difference changes. Grouping by the difference therefore groups each run. It requires a fixed step and de-duplicated values.

</details>

<details><summary>Find each period of downtime (consecutive "down" checks) with start time, end time and number of checks.</summary>

Flag rows where the status differs from the previous row (`LAG`), number islands with a running `SUM` of the flag, then group by island and status, keeping only `status = 'down'`. On the sample data this returns two outages: 10:10 to 10:15 (2 checks) and 10:25 (1 check).

</details>

<details><summary>Your streak query gives a user a 5-day streak although they skipped a day. What is the likely bug?</summary>

Duplicate rows for the same day. A duplicate advances `ROW_NUMBER()` without advancing the date, which shifts the key for later rows and can make a later, separate run share a key with an earlier one. De-duplicate to one row per user per day first, or use `DENSE_RANK()`.

</details>

<details><summary>How do you sessionize events with a 30-minute inactivity timeout?</summary>

Per user and ordered by event time: get the previous event time with `LAG`, set a flag to 1 when it is `NULL` or the gap exceeds 30 minutes, then take a running `SUM` of the flag as the session number. Group by user and session number for session-level metrics.

</details>

<details><summary>How would you sessionize incrementally in a daily pipeline?</summary>

Process the new day's events together with each user's last known event time and session number (from a state table, or by reading a short lookback from the previous day). Continue the numbering from the stored state, and rewrite sessions that started before midnight if new events extend them. Handle late events by recomputing affected users within an allowed lateness window.

</details>

<details><summary>How do you list every missing date for each user between their first and last login?</summary>

Generate a calendar per user from their minimum to maximum login date (a calendar table join or `generate_series` in a `LATERAL` subquery), then anti-join the de-duplicated logins with `NOT EXISTS` or `LEFT JOIN ... WHERE l.login_date IS NULL`. `LEAD` can give gap ranges instead of individual dates.

</details>

## Key takeaways

- Gaps come from comparing a row with its neighbour (`LEAD`/`LAG`) or anti-joining a calendar.
- For fixed-step sequences, `value - ROW_NUMBER()` is constant within an island and makes a grouping key.
- For "same value" or "small enough gap" islands, flag the start of each island and take a running `SUM`.
- De-duplicate before computing streaks; duplicates silently corrupt the row-number trick.
- Sessionization is the flag-and-sum pattern with a time-out condition; watch for midnight boundaries, late events and ties.
- Always partition by the entity and order deterministically.

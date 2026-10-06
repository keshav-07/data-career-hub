---
title: "Time-Series SQL: Date Buckets, Calendars, YoY, MoM and Rolling Metrics"
seoTitle: "Time-Series SQL: Calendars, YoY, MoM, Rolling"
description: "Build time-series metrics in SQL: truncate and bucket dates, generate calendars to fill gaps, and compute month-over-month, year-over-year and rolling 7 and 30 day figures."
technology: ["sql"]
topic: ["dates", "time-series", "calendar-table", "growth-metrics"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Bucket timestamps into days, weeks, months and custom intervals, in the right time zone"
  - "Generate a date series or calendar table and use it to fill missing periods"
  - "Compute month-over-month and year-over-year change safely, including missing periods"
  - "Calculate rolling 7 and 30 day sums, averages and active-user counts"
prerequisites: ["articles:sql/window-frames-running-totals", "articles:sql/functions-strings-dates-types"]
related: ["articles:sql/window-functions", "articles:data-warehousing/star-schema"]
previous: "articles:sql/window-frames-running-totals"
sources:
  - { label: "PostgreSQL documentation: Date/time functions (date_trunc, date_bin)", url: "https://www.postgresql.org/docs/16/functions-datetime.html" }
  - { label: "PostgreSQL documentation: Set returning functions (generate_series)", url: "https://www.postgresql.org/docs/16/functions-srf.html" }
  - { label: "SQL Server documentation: GENERATE_SERIES", url: "https://learn.microsoft.com/en-us/sql/t-sql/functions/generate-series-transact-sql" }
  - { label: "SQL Server documentation: DATETRUNC", url: "https://learn.microsoft.com/en-us/sql/t-sql/functions/datetrunc-transact-sql" }
  - { label: "BigQuery documentation: Date functions", url: "https://cloud.google.com/bigquery/docs/reference/standard-sql/date_functions" }
versionContext: "Examples run on PostgreSQL 16 against a generated, deterministic dataset; the range() example runs on DuckDB 1.5. Snowflake, BigQuery, SQL Server and MySQL variants were not executed."
---

Most dashboards a Data Engineer feeds are time series: revenue per day, orders per week, active users over the last 30 days, growth versus last month and last year. The SQL is a combination of three skills: **bucketing** timestamps into periods, making sure **every period exists** even when nothing happened, and **comparing** periods with window functions. Each step has a classic bug, and this lesson shows all of them.

## Sample data

Eighteen months of orders, generated deterministically so you get exactly the same numbers. There are one to three orders on most days, no orders on every 13th day of the year (so there are gaps), and 2025 prices are 15% higher than 2024, which gives the year-over-year comparison something to find.

```sql
CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  ordered_at  TIMESTAMP NOT NULL,       -- stored in UTC
  amount      NUMERIC(10, 2) NOT NULL
);

INSERT INTO orders
SELECT ROW_NUMBER() OVER (ORDER BY d, n)                      AS order_id,
       1 + (EXTRACT(DOY FROM d)::INT * 7 + n * 3) % 25         AS customer_id,
       d + MAKE_INTERVAL(hours => 8 + n * 5, mins => n * 7)    AS ordered_at,
       ROUND((20 + (EXTRACT(DOY FROM d)::INT * 37 + n * 11) % 90)
             * CASE WHEN EXTRACT(YEAR FROM d) = 2025 THEN 1.15 ELSE 1 END, 2) AS amount
FROM generate_series(DATE '2024-01-01', DATE '2025-06-30', INTERVAL '1 day') AS g(d)
CROSS JOIN generate_series(0, 2) AS s(n)
WHERE n <= EXTRACT(DOY FROM d)::INT % 3
  AND EXTRACT(DOY FROM d)::INT % 13 <> 0;

SELECT COUNT(*) AS orders, COUNT(DISTINCT ordered_at::DATE) AS days_with_orders,
       MIN(ordered_at) AS first_order, MAX(ordered_at) AS last_order
FROM orders;
```

| orders | days_with_orders | first_order | last_order |
|---|---|---|---|
| 1012 | 506 | 2024-01-01 08:00:00 | 2025-06-30 13:07:00 |

The range covers 547 days, but only 506 have orders.

## Date truncation and bucketing

**Truncation** rounds a timestamp down to the start of its period: 2025-06-18 14:35 becomes 2025-06-01 for a month, 2025-06-16 (a Monday) for a week, or 2025-06-18 00:00 for a day. Grouping by the truncated value puts each row in its bucket.

```sql
SELECT DATE_TRUNC('month', ordered_at)::DATE AS month_start,
       COUNT(*)                              AS orders,
       SUM(amount)                           AS revenue
FROM orders
WHERE ordered_at >= TIMESTAMP '2025-01-01'
GROUP BY 1
ORDER BY 1;
```

| month_start | orders | revenue |
|---|---|---|
| 2025-01-01 | 57 | 4154.95 |
| 2025-02-01 | 54 | 4028.45 |
| 2025-03-01 | 57 | 4123.90 |
| 2025-04-01 | 54 | 3977.85 |
| 2025-05-01 | 57 | 4172.20 |
| 2025-06-01 | 57 | 4267.65 |

### Weeks, quarters and custom intervals

```sql
SELECT ordered_at,
       DATE_TRUNC('day', ordered_at)                                AS day_start,
       DATE_TRUNC('week', ordered_at)::DATE                         AS iso_week_start,
       DATE_TRUNC('quarter', ordered_at)::DATE                      AS quarter_start,
       DATE_BIN(INTERVAL '15 minutes', ordered_at, TIMESTAMP '2000-01-01') AS quarter_hour,
       TO_CHAR(ordered_at, 'IYYY-"W"IW')                            AS iso_week_label
FROM orders
WHERE order_id IN (300, 301, 302);
```

| ordered_at | day_start | iso_week_start | quarter_start | quarter_hour | iso_week_label |
|---|---|---|---|---|---|
| 2024-06-10 08:00:00 | 2024-06-10 00:00:00 | 2024-06-10 | 2024-04-01 | 2024-06-10 08:00:00 | 2024-W24 |
| 2024-06-11 08:00:00 | 2024-06-11 00:00:00 | 2024-06-10 | 2024-04-01 | 2024-06-11 08:00:00 | 2024-W24 |
| 2024-06-11 13:07:00 | 2024-06-11 00:00:00 | 2024-06-10 | 2024-04-01 | 2024-06-11 13:00:00 | 2024-W24 |

- PostgreSQL's `DATE_TRUNC('week', ...)` uses ISO weeks, which start on **Monday**. Other engines default differently: BigQuery's `WEEK` starts on Sunday (use `WEEK(MONDAY)` or `ISOWEEK`), SQL Server depends on the `DATEFIRST` setting, and Snowflake has a `WEEK_START` parameter. State the week definition in every weekly metric.
- ISO week numbers belong to an **ISO year**, which can differ from the calendar year around 1 January (31 December 2024 is in ISO week 1 of 2025). Label weeks with `IYYY` and `IW` together, never `YYYY` with `IW`.
- `DATE_BIN` (PostgreSQL 14+) buckets into any fixed interval, such as 15 minutes or 6 hours, aligned to an origin you choose. Elsewhere, use arithmetic on epoch seconds, `TIME_SLICE` in Snowflake or `TIMESTAMP_BUCKET` in BigQuery.

The 13:07 order lands in the 13:00 quarter-hour bucket, and both 10 and 11 June 2024 fall in the ISO week that starts on Monday 10 June.

### Truncating in the right time zone

Timestamps stored in UTC give **UTC days**. A customer in India who orders at 22:00 UTC on 30 June ordered on 1 July local time. Convert before truncating when the business reports in local time:

```sql
SELECT utc_time,
       utc_time::DATE                                                  AS utc_day,
       (utc_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::DATE AS india_day,
       (utc_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::DATE AS new_york_day
FROM (VALUES (TIMESTAMP '2025-06-30 22:00'), (TIMESTAMP '2025-07-01 02:30')) AS t(utc_time);
```

| utc_time | utc_day | india_day | new_york_day |
|---|---|---|---|
| 2025-06-30 22:00:00 | 2025-06-30 | 2025-07-01 | 2025-06-30 |
| 2025-07-01 02:30:00 | 2025-07-01 | 2025-07-01 | 2025-06-30 |

The double `AT TIME ZONE` first declares the naive timestamp to be UTC, then converts it to local time. With a `TIMESTAMPTZ` column, a single `AT TIME ZONE 'Asia/Kolkata'` is enough. Daylight saving time means some local days have 23 or 25 hours, another reason to bucket in local time rather than add a fixed offset.

### Dialect translation

| Bucket | PostgreSQL | Snowflake | BigQuery | SQL Server 2022+ | MySQL |
|---|---|---|---|---|---|
| Month start | `DATE_TRUNC('month', t)` | `DATE_TRUNC('MONTH', t)` | `DATE_TRUNC(d, MONTH)` / `TIMESTAMP_TRUNC(t, MONTH)` | `DATETRUNC(month, t)` | `DATE_FORMAT(t, '%Y-%m-01')` |
| Week start | `DATE_TRUNC('week', t)` (Monday) | `DATE_TRUNC('WEEK', t)` (`WEEK_START`) | `DATE_TRUNC(d, WEEK(MONDAY))` | `DATETRUNC(week, t)` (`DATEFIRST`) | `t - INTERVAL WEEKDAY(t) DAY` |
| 15-minute bucket | `DATE_BIN('15 minutes', t, origin)` | `TIME_SLICE(t, 15, 'MINUTE')` | `TIMESTAMP_BUCKET(t, INTERVAL 15 MINUTE)` | `DATE_BUCKET(minute, 15, t)` | Epoch arithmetic |

### Pitfalls

- Grouping by `EXTRACT(MONTH FROM t)` alone, which merges January 2024 with January 2025. Truncate, or group by year and month together.
- Formatting buckets as text (`'Jun 2025'`) before sorting, which sorts alphabetically.
- Filtering with `WHERE DATE_TRUNC('month', ordered_at) = ...` instead of a range on the raw column, which blocks partition pruning.
- Comparing a partial current period (this month so far) with complete past periods.

### In interviews

"Weekly active users" and "orders per month" start with truncation. Say how weeks are defined, which time zone defines a day, and that you filter on raw-column ranges. Mentioning the ISO year problem shows real experience.

## Generating a date series and calendar table

`GROUP BY` only returns periods that have data. Days without orders simply vanish, and a chart then draws a straight line across the gap, a running total skips nothing but a 7-row moving average quietly covers 8 or 9 days. The fix is to start from a **complete list of periods** and left join the data onto it.

### generate_series

```sql
WITH days AS (
  SELECT d::DATE AS day
  FROM generate_series(DATE '2024-01-10', DATE '2024-01-16', INTERVAL '1 day') AS g(d)
),
daily AS (
  SELECT ordered_at::DATE AS day, COUNT(*) AS orders, SUM(amount) AS revenue
  FROM orders
  GROUP BY 1
)
SELECT d.day,
       COALESCE(x.orders, 0)  AS orders,
       COALESCE(x.revenue, 0) AS revenue
FROM days d
LEFT JOIN daily x ON x.day = d.day
ORDER BY d.day;
```

| day | orders | revenue |
|---|---|---|
| 2024-01-10 | 2 | 71.00 |
| 2024-01-11 | 3 | 234.00 |
| 2024-01-12 | 1 | 104.00 |
| 2024-01-13 | 0 | 0 |
| 2024-01-14 | 3 | 207.00 |
| 2024-01-15 | 1 | 35.00 |
| 2024-01-16 | 2 | 155.00 |

13 January (day 13 of the year) had no orders and now appears as a zero row. Notice the order of operations: aggregate the facts to one row per day **first**, then left join to the series. Joining raw orders to the series and aggregating afterwards also works, but is easier to get wrong with fan-out and `COUNT(*)`.

### A calendar table

A **calendar** (date dimension) is a permanent table with one row per day and the attributes reports need: week, month, quarter, fiscal period, weekday or weekend, holidays. Build it once and join to it everywhere, so every report agrees on what a week or a fiscal quarter is.

```sql
CREATE TABLE calendar AS
SELECT d::DATE                                   AS calendar_date,
       EXTRACT(YEAR FROM d)::INT                 AS year,
       EXTRACT(QUARTER FROM d)::INT              AS quarter,
       EXTRACT(MONTH FROM d)::INT                AS month,
       DATE_TRUNC('month', d)::DATE              AS month_start,
       DATE_TRUNC('week', d)::DATE               AS iso_week_start,
       EXTRACT(ISODOW FROM d)::INT               AS iso_weekday,
       EXTRACT(ISODOW FROM d) IN (6, 7)          AS is_weekend,
       -- fiscal year starting 1 April, labelled by the year it ends in
       EXTRACT(YEAR FROM d + INTERVAL '9 months')::INT AS fiscal_year
FROM generate_series(DATE '2024-01-01', DATE '2025-12-31', INTERVAL '1 day') AS g(d);

ALTER TABLE calendar ADD PRIMARY KEY (calendar_date);

SELECT * FROM calendar WHERE calendar_date IN ('2024-03-31', '2024-04-01', '2024-12-30');
```

| calendar_date | year | quarter | month | month_start | iso_week_start | iso_weekday | is_weekend | fiscal_year |
|---|---|---|---|---|---|---|---|---|
| 2024-03-31 | 2024 | 1 | 3 | 2024-03-01 | 2024-03-25 | 7 | t | 2024 |
| 2024-04-01 | 2024 | 2 | 4 | 2024-04-01 | 2024-04-01 | 1 | f | 2025 |
| 2024-12-30 | 2024 | 4 | 12 | 2024-12-01 | 2024-12-30 | 1 | f | 2025 |

In production, add holiday flags from a reference source, keep the table a few years ahead of today, and expose it as a shared dimension (`dim_date`).

### Generating dates in other engines

| Engine | Date series |
|---|---|
| PostgreSQL | `generate_series(start, end, INTERVAL '1 day')` |
| DuckDB | `range(start, end, INTERVAL 1 DAY)` (end exclusive) or `generate_series` (end inclusive) |
| SQL Server 2022+ | `GENERATE_SERIES(0, n)` of integers, then `DATEADD(day, value, start)`; earlier versions use a numbers table or recursive CTE |
| Snowflake | `TABLE(GENERATOR(ROWCOUNT => n))` with `ROW_NUMBER()` or `SEQ4()`, then `DATEADD` |
| BigQuery | `UNNEST(GENERATE_DATE_ARRAY(start, end, INTERVAL 1 DAY))` |
| MySQL 8 | Recursive CTE adding one day per step |
| Spark SQL | `explode(sequence(start, end, interval 1 day))` |

In DuckDB, note that `range` excludes the end:

<!-- engine: duckdb -->
```sql
SELECT CAST(range AS DATE) AS day
FROM range(DATE '2025-01-01', DATE '2025-01-04', INTERVAL 1 DAY);
```

| day |
|---|
| 2025-01-01 |
| 2025-01-02 |
| 2025-01-03 |

Snowflake's generator, written from the documentation (not executed here):

<!-- noexec -->
```sql
-- Snowflake: one row per day for 2025
SELECT DATEADD(day, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, '2025-01-01'::DATE) AS calendar_date
FROM TABLE(GENERATOR(ROWCOUNT => 365));
```

Use `ROW_NUMBER()` rather than `SEQ4()` alone for the offset: Snowflake documents that `SEQ4` can have gaps.

### Pitfalls

- Inner joining the calendar to the facts, which removes the empty days again.
- `COUNT(*)` after a left join from the calendar, which counts empty days as 1; count a fact column instead.
- A series that stops at the last day with data rather than today, hiding a pipeline outage at the end of the range.
- Building weekly or monthly grids from daily dates without truncating consistently.

### In interviews

"Show revenue for every day this month, including days without orders" is a frequent prompt, and the expected answer is a date series or calendar left-joined to pre-aggregated facts with `COALESCE`. Mention a shared calendar dimension for fiscal periods and holidays.

## Month-over-month change

**Month-over-month (MoM)** change compares each month with the previous one: the absolute difference and the percentage change. Aggregate to one row per month, then use `LAG`.

```sql
WITH monthly AS (
  SELECT DATE_TRUNC('month', ordered_at)::DATE AS month_start,
         SUM(amount) AS revenue
  FROM orders
  GROUP BY 1
)
SELECT month_start,
       revenue,
       LAG(revenue) OVER (ORDER BY month_start)            AS prev_month,
       revenue - LAG(revenue) OVER (ORDER BY month_start)  AS mom_change,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month_start))
             / NULLIF(LAG(revenue) OVER (ORDER BY month_start), 0), 1) AS mom_pct
FROM monthly
WHERE month_start >= DATE '2024-10-01'
ORDER BY month_start;
```

| month_start | revenue | prev_month | mom_change | mom_pct |
|---|---|---|---|---|
| 2024-10-01 | 3671.00 | NULL | NULL | NULL |
| 2024-11-01 | 3765.00 | 3671.00 | 94.00 | 2.6 |
| 2024-12-01 | 3377.00 | 3765.00 | -388.00 | -10.3 |
| 2025-01-01 | 4154.95 | 3377.00 | 777.95 | 23.0 |
| 2025-02-01 | 4028.45 | 4154.95 | -126.50 | -3.0 |
| 2025-03-01 | 4123.90 | 4028.45 | 95.45 | 2.4 |
| 2025-04-01 | 3977.85 | 4123.90 | -146.05 | -3.5 |
| 2025-05-01 | 4172.20 | 3977.85 | 194.35 | 4.9 |
| 2025-06-01 | 4267.65 | 4172.20 | 95.45 | 2.3 |

October 2024 shows `NULL` although September 2024 exists. The `WHERE` clause is in the same query as the window function, so it runs first and the window never sees September. Compute the change in one step and filter in the next. This is the template to use:

```sql
WITH monthly AS (
  SELECT DATE_TRUNC('month', ordered_at)::DATE AS month_start, SUM(amount) AS revenue
  FROM orders
  GROUP BY 1
),
with_change AS (
  SELECT month_start, revenue,
         LAG(revenue) OVER (ORDER BY month_start) AS prev_month
  FROM monthly
)
SELECT month_start, revenue, prev_month,
       ROUND(100.0 * (revenue - prev_month) / NULLIF(prev_month, 0), 1) AS mom_pct
FROM with_change
WHERE month_start >= DATE '2024-10-01'
ORDER BY month_start
LIMIT 3;
```

| month_start | revenue | prev_month | mom_pct |
|---|---|---|---|
| 2024-10-01 | 3671.00 | 3537.00 | 3.8 |
| 2024-11-01 | 3765.00 | 3671.00 | 2.6 |
| 2024-12-01 | 3377.00 | 3765.00 | -10.3 |

### Missing months and partial months

`LAG` looks at the previous **row**, not the previous calendar month. If a month has no data at all, `LAG` silently compares with two months earlier. Generate the months from a calendar first (as in the previous section) so every month has a row, then `LAG`. Alternatively, join each month to `month_start - INTERVAL '1 month'` explicitly, which is correct by construction.

The current month is usually incomplete. Compare it with the same number of days of the previous month (month-to-date versus previous month-to-date), or exclude it until it closes.

### Pitfalls

- Filtering in the same query as `LAG`, so the first visible row has no previous value.
- Missing months making `LAG` compare with the wrong month.
- Integer division or division by zero in the percentage.
- Averaging monthly percentages to get a period growth rate; compute it from the first and last values (or a compound rate) instead.

### In interviews

MoM growth is one of the most common analytics SQL prompts. Show the aggregate-then-`LAG` pattern, compute the percentage with `100.0` and `NULLIF`, and raise the missing-month and partial-month issues yourself.

## Year-over-year growth

**Year-over-year (YoY)** compares a period with the same period a year earlier, which removes seasonality: June against last June, not against May. There are two ways to find "the same period last year".

### Method 1: LAG over a complete monthly series

With exactly one row per month and no gaps, last year's value is 12 rows back:

```sql
WITH monthly AS (
  SELECT DATE_TRUNC('month', ordered_at)::DATE AS month_start, SUM(amount) AS revenue
  FROM orders
  GROUP BY 1
),
with_ly AS (
  SELECT month_start, revenue,
         LAG(revenue, 12) OVER (ORDER BY month_start) AS revenue_last_year
  FROM monthly
)
SELECT month_start, revenue, revenue_last_year,
       ROUND(100.0 * (revenue - revenue_last_year) / NULLIF(revenue_last_year, 0), 1) AS yoy_pct
FROM with_ly
WHERE month_start >= DATE '2025-01-01'
ORDER BY month_start;
```

| month_start | revenue | revenue_last_year | yoy_pct |
|---|---|---|---|
| 2025-01-01 | 4154.95 | 3613.00 | 15.0 |
| 2025-02-01 | 4028.45 | 3583.00 | 12.4 |
| 2025-03-01 | 4123.90 | 3506.00 | 17.6 |
| 2025-04-01 | 3977.85 | 3644.00 | 9.2 |
| 2025-05-01 | 4172.20 | 3668.00 | 13.7 |
| 2025-06-01 | 4267.65 | 3486.00 | 22.4 |

Prices rose by exactly 15%, yet the YoY figures range from 9.2% to 22.4%, because the number of orders per month also differs between years (2024 is a leap year, and the gap days fall on different dates). Real growth figures move for the same reasons: calendar effects, not only business change.

### Method 2: join on the date shifted by a year

A self join on `month_start - INTERVAL '1 year'` is correct even when months are missing, and works for days and weeks too:

```sql
WITH monthly AS (
  SELECT DATE_TRUNC('month', ordered_at)::DATE AS month_start, SUM(amount) AS revenue
  FROM orders
  GROUP BY 1
)
SELECT cur.month_start, cur.revenue, ly.revenue AS revenue_last_year,
       ROUND(100.0 * (cur.revenue - ly.revenue) / NULLIF(ly.revenue, 0), 1) AS yoy_pct
FROM monthly cur
LEFT JOIN monthly ly ON ly.month_start = cur.month_start - INTERVAL '1 year'
WHERE cur.month_start BETWEEN DATE '2025-04-01' AND DATE '2025-06-01'
ORDER BY cur.month_start;
```

| month_start | revenue | revenue_last_year | yoy_pct |
|---|---|---|---|
| 2025-04-01 | 3977.85 | 3644.00 | 9.2 |
| 2025-05-01 | 4172.20 | 3668.00 | 13.7 |
| 2025-06-01 | 4267.65 | 3486.00 | 22.4 |

### Year-to-date versus last year-to-date

Comparing a partial year needs the same cut-off in both years:

```sql
SELECT EXTRACT(YEAR FROM ordered_at)::INT AS year,
       SUM(amount)                         AS ytd_revenue
FROM orders
WHERE (ordered_at >= TIMESTAMP '2025-01-01' AND ordered_at < TIMESTAMP '2025-07-01')
   OR (ordered_at >= TIMESTAMP '2024-01-01' AND ordered_at < TIMESTAMP '2024-07-01')
GROUP BY 1
ORDER BY 1;
```

| year | ytd_revenue |
|---|---|
| 2024 | 21500.00 |
| 2025 | 24725.00 |

That is 15.0% growth on a like-for-like half year.

### Day-level and week-level YoY

- **Leap years**: `DATE '2024-02-29' - INTERVAL '1 year'` gives 2023-02-28, so two days map to one. Decide how to treat 29 February (usually compare with 28 February, or exclude it).
- **Weekday alignment**: retail often compares a day with the same weekday 52 weeks earlier (`day - 364`), so Saturdays are compared with Saturdays.
- **ISO weeks**: some years have 53 ISO weeks; week 53 has no partner the year before.

### Pitfalls

- `LAG(x, 12)` over a series with missing months.
- Comparing a partial current month or year with a complete one.
- Ignoring leap days and weekday mix in daily YoY.
- Reporting YoY on tiny bases (growth from 2 to 6 is "200%").

### In interviews

Expect "compute YoY revenue growth by month". Show either method, explain why the join on the shifted date is more robust, and mention partial periods and calendar effects such as leap years and weekday alignment.

## Rolling 7 and 30 day metrics

A **rolling** (trailing) metric aggregates over the last N days ending at each day: rolling 7-day revenue, 30-day average order value, 7-day active customers. It smooths noise and is the standard way to report daily trends.

### Rolling sums and averages on a complete daily series

First build one row per day with zeros for gaps, then use a `ROWS` frame. Because every day now has exactly one row, "6 preceding rows" really means "6 preceding days":

```sql
WITH days AS (
  SELECT d::DATE AS day
  FROM generate_series(DATE '2024-01-01', DATE '2025-06-30', INTERVAL '1 day') AS g(d)
),
daily AS (
  SELECT d.day, COALESCE(SUM(o.amount), 0) AS revenue, COUNT(o.order_id) AS orders
  FROM days d
  LEFT JOIN orders o ON o.ordered_at >= d.day AND o.ordered_at < d.day + 1
  GROUP BY d.day
)
SELECT day, revenue,
       SUM(revenue) OVER w7                                AS revenue_7d,
       ROUND(AVG(revenue) OVER w7, 2)                      AS avg_daily_revenue_7d,
       SUM(revenue) OVER w30                               AS revenue_30d,
       ROUND(SUM(revenue) OVER w30 / NULLIF(SUM(orders) OVER w30, 0), 2) AS aov_30d
FROM daily
WINDOW w7  AS (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),
       w30 AS (ORDER BY day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
ORDER BY day DESC
LIMIT 7;
```

| day | revenue | revenue_7d | avg_daily_revenue_7d | revenue_30d | aov_30d |
|---|---|---|---|---|---|
| 2025-06-30 | 143.75 | 1022.35 | 146.05 | 4267.65 | 74.87 |
| 2025-06-29 | 23.00 | 956.80 | 136.69 | 4198.65 | 73.66 |
| 2025-06-28 | 289.80 | 1078.70 | 154.10 | 4267.65 | 74.87 |
| 2025-06-27 | 95.45 | 994.75 | 142.11 | 4164.15 | 73.06 |
| 2025-06-26 | 102.35 | 953.35 | 136.19 | 4302.15 | 75.48 |
| 2025-06-25 | 217.35 | 1026.95 | 146.71 | 4267.65 | 74.87 |
| 2025-06-24 | 150.65 | 809.60 | 115.66 | 4164.15 | 73.06 |

- The 30-day average order value is **sum of revenue / sum of orders** over the window, not the average of daily averages, which would weight a one-order day the same as a three-order day.
- 18 June 2025 (day 169 of the year) had no orders. Because the calendar supplied a zero row for it, every 7-day and 30-day window around it still spans exactly 7 or 30 days.
- The first 6 (or 29) days of the series have incomplete windows; flag or exclude them as shown in the [window frames lesson](/sql/window-frames-running-totals/).

Without a calendar, use a time-based frame on the daily aggregate, which handles gaps by value: `SUM(revenue) OVER (ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)`. Engines that lack interval frames (SQL Server, BigQuery, Spark) need the calendar approach or a numeric day key.

### Rolling distinct counts: 7-day active customers

`COUNT(DISTINCT ...)` cannot be used as a window function in PostgreSQL, SQL Server or most engines, because a distinct count cannot be updated incrementally. Join each day to the activity in its window and count distinct customers per day:

```sql
WITH days AS (
  SELECT d::DATE AS day
  FROM generate_series(DATE '2025-06-24', DATE '2025-06-30', INTERVAL '1 day') AS g(d)
),
activity AS (
  SELECT DISTINCT ordered_at::DATE AS day, customer_id FROM orders
)
SELECT d.day,
       COUNT(DISTINCT a.customer_id) FILTER (WHERE a.day = d.day) AS active_today,
       COUNT(DISTINCT a.customer_id)                              AS active_7d
FROM days d
LEFT JOIN activity a ON a.day BETWEEN d.day - 6 AND d.day
GROUP BY d.day
ORDER BY d.day;
```

| day | active_today | active_7d |
|---|---|---|
| 2025-06-24 | 2 | 11 |
| 2025-06-25 | 3 | 13 |
| 2025-06-26 | 1 | 11 |
| 2025-06-27 | 2 | 12 |
| 2025-06-28 | 3 | 13 |
| 2025-06-29 | 1 | 11 |
| 2025-06-30 | 2 | 12 |

Daily active customers do **not** add up to weekly actives: a customer active on three days counts once in `active_7d`. The range join reads each activity row up to seven times, which is fine for daily aggregates but expensive on raw events at scale; warehouses offer approximate alternatives (HyperLogLog sketches that can be merged across days, such as `HLL` functions in Snowflake, BigQuery and Databricks).

### Pitfalls

- `ROWS BETWEEN 6 PRECEDING` over a series with missing days.
- Averaging daily ratios instead of dividing rolling sums.
- Summing daily distinct counts to get a rolling distinct count.
- Comparing the last, partial day with complete days.
- Incremental loads: a rolling metric for day D changes whenever any of the previous N days is restated, so recompute at least the last N days on each run.

### In interviews

"7-day rolling average of revenue" and "30-day active users" are staples. Build or assume a complete daily series, use an explicit frame, compute ratios from sums, and explain why distinct counts need a range join (or sketches) rather than a window function.

## Practice questions

<details><summary>Why can GROUP BY EXTRACT(MONTH FROM order_date) give wrong monthly figures, and what should you group by?</summary>

It merges the same month from different years (January 2024 and January 2025 land in one group). Group by `DATE_TRUNC('month', order_date)` (or year and month together), which keeps each calendar month separate and sorts correctly.

</details>

<details><summary>A daily revenue chart has no points for some days. How do you make every day appear with 0?</summary>

Generate the days (a calendar table, `generate_series`, `GENERATE_DATE_ARRAY` or a recursive CTE), aggregate revenue to one row per day, left join the aggregate to the days and `COALESCE(revenue, 0)`. Count a fact column, not `COUNT(*)`, if you also show order counts.

</details>

<details><summary>Your MoM query shows NULL growth for the first month in the report even though earlier data exists. Why?</summary>

The `WHERE` filter on the report period runs before the window function in the same query, so `LAG` cannot see the month before the first visible one. Compute `LAG` in a CTE over all months, then filter in the outer query.

</details>

<details><summary>Compute year-over-year revenue growth per month in a way that is correct even if some months have no data.</summary>

Aggregate to monthly revenue, then left join the table to itself on `ly.month_start = cur.month_start - INTERVAL '1 year'` and compute `100.0 * (cur.revenue - ly.revenue) / NULLIF(ly.revenue, 0)`. `LAG(revenue, 12)` is only correct over a gap-free monthly series.

</details>

<details><summary>How do you compute rolling 7-day distinct active users per day?</summary>

Distinct counts cannot be computed with a sliding window function in most engines. Build one row per (day, user) of activity, join each report day to the activity rows between `day - 6` and `day`, and `COUNT(DISTINCT user_id)` per report day. At large scale, use mergeable approximate sketches (HyperLogLog) per day and merge seven of them.

</details>

<details><summary>What can go wrong when an hourly event table stored in UTC is grouped into days for a team in New York?</summary>

UTC days do not match New York days: events between 00:00 and about 04:00 or 05:00 UTC belong to the previous local day, depending on daylight saving time. Convert to `America/New_York` before truncating, and remember that DST change days have 23 or 25 hours. Store timestamps as absolute instants so the conversion is unambiguous.

</details>

## Key takeaways

- Bucket with `DATE_TRUNC` (or the engine's equivalent), define weeks explicitly, and convert to the reporting time zone before truncating.
- `GROUP BY` drops empty periods; start from a date series or calendar table and left join pre-aggregated facts with `COALESCE`.
- Compute MoM and YoY with `LAG` in a CTE and filter afterwards; for robustness, join to the period shifted by one month or year.
- Compare like with like: partial periods, leap days and weekday mix all distort growth figures.
- Rolling metrics need one row per day (or a `RANGE` interval frame), ratios computed from rolling sums, and range joins or sketches for distinct counts.

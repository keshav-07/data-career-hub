---
title: "Product Analytics SQL: Retention, Cohorts, Funnels and Attribution"
seoTitle: "SQL Retention, Cohorts, Funnels and Attribution"
description: "Write the product analytics queries interviewers ask for: day-N retention, cohort matrices, ordered funnels, first and last touch attribution and market basket lift."
technology: ["sql"]
topic: ["product-analytics", "retention", "cohorts", "funnels"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Define and compute classic, bracket and unbounded day-N retention, and exclude immature users"
  - "Build a cohort retention matrix and a monthly growth-accounting table"
  - "Compute an ordered funnel with step conversion rates and explain why naive counts overstate it"
  - "Attribute conversions to first, last and linear touches within a lookback window"
  - "Find frequently co-purchased items and explain support, confidence and lift"
prerequisites: ["articles:sql/window-functions", "articles:sql/aggregations-group-by-having"]
related: ["articles:sql/gaps-islands-sessionization", "system-designs:clickstream-data-platform", "projects:ecommerce-analytics-platform"]
next: "articles:sql/json-arrays-regex"
previous: "articles:sql/gaps-islands-sessionization"
versionContext: "All SQL examples run on PostgreSQL 16.14. FILTER (WHERE ...) is standard SQL supported by PostgreSQL and DuckDB; on Snowflake, BigQuery and SQL Server write the equivalent COUNT(CASE WHEN ... THEN 1 END)."
sources:
  - { label: "PostgreSQL documentation: Aggregate expressions and FILTER", url: "https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES" }
  - { label: "PostgreSQL documentation: Date/time functions (date_trunc)", url: "https://www.postgresql.org/docs/current/functions-datetime.html" }
  - { label: "PostgreSQL 16 documentation: Window functions", url: "https://www.postgresql.org/docs/16/functions-window.html" }
---

Product and marketing teams ask the same questions again and again: do users come back, are newer users better than older ones, where do people drop out of checkout, which channel deserves credit for a sale, and what is bought together. Data Engineers build the tables behind those dashboards, and SQL interviews for analytics-heavy roles use exactly these problems. This lesson writes each one from raw event tables and points out the definition choices that change the answer.

## Sample data

```sql
CREATE TABLE users (user_id INT PRIMARY KEY, signup_date DATE);
INSERT INTO users VALUES
  (1,'2026-01-05'),(2,'2026-01-12'),(3,'2026-01-20'),(4,'2026-01-28'),
  (5,'2026-02-03'),(6,'2026-02-10'),(7,'2026-02-17'),
  (8,'2026-03-02'),(9,'2026-03-09');

CREATE TABLE activity (user_id INT, activity_date DATE);
INSERT INTO activity VALUES
  (1,'2026-01-05'),(1,'2026-01-06'),(1,'2026-01-12'),(1,'2026-02-10'),(1,'2026-03-15'),
  (2,'2026-01-12'),(2,'2026-01-19'),(2,'2026-02-20'),
  (3,'2026-01-20'),(3,'2026-01-21'),
  (4,'2026-01-28'),(4,'2026-03-03'),
  (5,'2026-02-03'),(5,'2026-02-04'),(5,'2026-03-05'),(5,'2026-03-06'),
  (6,'2026-02-10'),(6,'2026-02-17'),
  (7,'2026-02-17'),
  (8,'2026-03-02'),(8,'2026-03-03'),(8,'2026-03-09'),
  (9,'2026-03-09');

CREATE TABLE funnel_events (user_id INT, event_name TEXT, event_time TIMESTAMP);
INSERT INTO funnel_events VALUES
  (1,'view','2026-03-01 10:00'),(1,'add_to_cart','2026-03-01 10:05'),
  (1,'checkout','2026-03-01 10:07'),(1,'purchase','2026-03-01 10:09'),
  (2,'view','2026-03-01 11:00'),(2,'add_to_cart','2026-03-01 11:02'),
  (3,'view','2026-03-01 12:00'),(3,'add_to_cart','2026-03-01 12:01'),(3,'checkout','2026-03-01 12:03'),
  (4,'view','2026-03-01 13:00'),
  (5,'add_to_cart','2026-03-01 09:00'),(5,'view','2026-03-01 09:30'),
  (6,'view','2026-03-01 14:00'),(6,'add_to_cart','2026-03-01 14:10'),
  (6,'checkout','2026-03-01 14:12'),(6,'purchase','2026-03-01 14:15');

CREATE TABLE touches (user_id INT, channel TEXT, touch_time TIMESTAMP);
INSERT INTO touches VALUES
  (1,'paid_search','2026-03-01 09:00'),(1,'email','2026-03-03 08:00'),(1,'social','2026-03-04 20:00'),
  (2,'social','2026-03-02 12:00'),(2,'paid_search','2026-03-05 09:00'),
  (3,'email','2026-03-01 07:00'),(3,'paid_search','2026-03-08 10:00');

CREATE TABLE conversions (user_id INT, converted_at TIMESTAMP, revenue NUMERIC(10,2));
INSERT INTO conversions VALUES
  (1,'2026-03-05 10:00',120.00), (2,'2026-03-05 11:00',80.00), (3,'2026-03-02 09:00',50.00);

CREATE TABLE order_items (order_id INT, product TEXT);
INSERT INTO order_items VALUES
  (1,'bread'),(1,'butter'),(1,'milk'), (2,'bread'),(2,'butter'), (3,'bread'),(3,'jam'),
  (4,'milk'),(4,'cereal'), (5,'bread'),(5,'butter'),(5,'jam'), (6,'milk'),(6,'cereal'),(6,'bread');
```

The data is "as of" 15 March 2026, the last activity date.

## Retention analysis

### What it is

Retention answers "of the users who started, how many came back?" It is the main health metric for subscription and consumer products, because acquisition without retention just refills a leaking bucket. The hard part is not the SQL but agreeing on a definition.

| Definition | Retained on day N if the user was active... | Typical use |
|---|---|---|
| Classic (exact day) | exactly on day N after signup | Daily apps, "D1/D7/D30 retention" |
| Bracket (range) | at any time in a window, such as days 1 to 7 or week 2 | Weekly or less frequent products |
| Unbounded (rolling) | on day N **or any later day** | "Has not churned yet"; always the highest number |

### Day-N retention with a maturity filter

A user who signed up yesterday cannot have day-7 activity yet. Counting them in the denominator makes recent retention look worse, so only include users whose day N has already happened.

```sql
WITH params AS (SELECT DATE '2026-03-15' AS as_of),
eligible AS (
  SELECT u.* FROM users u, params p WHERE u.signup_date + 7 <= p.as_of
)
SELECT COUNT(*) AS eligible_users,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM activity a
         WHERE a.user_id = e.user_id AND a.activity_date = e.signup_date + 7)) AS day7_classic,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM activity a
         WHERE a.user_id = e.user_id AND a.activity_date >= e.signup_date + 7)) AS day7_unbounded
FROM eligible e;
```

| eligible_users | day7_classic | day7_unbounded |
|---|---|---|
| 8 | 4 | 6 |

User 9 signed up on 9 March, so day 7 (16 March) is in the future and they are excluded. Classic day-7 retention is 4/8 = 50%; unbounded is 6/8 = 75%. Same data, two honest answers, so always label which one a dashboard shows.

`EXISTS` is used rather than a join so that a user with several qualifying activity rows is counted once.

### Period-over-period retention and growth accounting

For "how many of last month's active users are still active?", compare a user's activity in consecutive periods. Splitting the active users this way is called growth accounting:

```sql
WITH monthly AS (
  SELECT DISTINCT user_id, date_trunc('month', activity_date)::date AS month FROM activity
), flagged AS (
  SELECT m.user_id, m.month,
         EXISTS (SELECT 1 FROM monthly p
                 WHERE p.user_id = m.user_id AND p.month = m.month - INTERVAL '1 month') AS active_prev,
         EXISTS (SELECT 1 FROM monthly p
                 WHERE p.user_id = m.user_id AND p.month < m.month) AS seen_before
  FROM monthly m
)
SELECT month,
       COUNT(*) AS active_users,
       COUNT(*) FILTER (WHERE active_prev) AS retained,
       COUNT(*) FILTER (WHERE NOT seen_before) AS new_users,
       COUNT(*) FILTER (WHERE seen_before AND NOT active_prev) AS resurrected
FROM flagged
GROUP BY month
ORDER BY month;
```

| month | active_users | retained | new_users | resurrected |
|---|---|---|---|---|
| 2026-01-01 | 4 | 0 | 4 | 0 |
| 2026-02-01 | 5 | 2 | 3 | 0 |
| 2026-03-01 | 5 | 2 | 2 | 1 |

User 4 was active in January, skipped February and came back in March, so they are "resurrected". **Churned** users for a month are those active in the previous month but not this one (an anti-join the other way round). Here "new" means first seen in activity; if you have a signup table, use the signup month instead.

### Pitfalls

- **Immature users in the denominator** (shown above).
- **Day zero.** Decide whether the signup day itself counts as activity; most definitions start counting at day 1.
- **Time zones** shift events across day boundaries and change "exact day N" results.
- **Activity definition.** "Opened the app" and "did something valuable" give very different numbers; agree on the event list and store it in one place.

### In interviews

Expect "compute day-1 and day-7 retention" or "month-over-month retained users". Before writing SQL, state the definition (classic or unbounded, what counts as active, how immature users are treated). That alone separates strong candidates. Mentioning that you would precompute a daily `user_activity` table (one row per user per active day) for these queries shows pipeline thinking.

## Cohort analysis

### What it is

A **cohort** is a group of users who share a starting event in the same period, usually signup month. Cohort analysis tracks each group over its own lifetime (month 0, month 1, month 2...) so you can compare January's users with February's at the same age. Averages over all users hide that newer cohorts might behave differently.

### Building a cohort retention matrix

1. Assign each user to a cohort.
2. For each activity, compute the period number relative to the cohort.
3. Count distinct users per cohort and period, divide by cohort size, and pivot periods into columns.

```sql
WITH cohort AS (
  SELECT user_id, date_trunc('month', signup_date)::date AS cohort_month FROM users
), act AS (
  SELECT DISTINCT c.cohort_month, c.user_id,
         (EXTRACT(YEAR FROM a.activity_date) * 12 + EXTRACT(MONTH FROM a.activity_date))
       - (EXTRACT(YEAR FROM c.cohort_month) * 12 + EXTRACT(MONTH FROM c.cohort_month)) AS month_n
  FROM cohort c JOIN activity a ON a.user_id = c.user_id
), sizes AS (
  SELECT cohort_month, COUNT(*) AS cohort_size FROM cohort GROUP BY cohort_month
)
SELECT s.cohort_month, s.cohort_size,
       ROUND(100.0 * COUNT(a.user_id) FILTER (WHERE month_n = 0) / s.cohort_size) AS m0,
       CASE WHEN s.cohort_month + INTERVAL '1 month' <= DATE '2026-03-01'
            THEN ROUND(100.0 * COUNT(a.user_id) FILTER (WHERE month_n = 1) / s.cohort_size) END AS m1,
       CASE WHEN s.cohort_month + INTERVAL '2 months' <= DATE '2026-03-01'
            THEN ROUND(100.0 * COUNT(a.user_id) FILTER (WHERE month_n = 2) / s.cohort_size) END AS m2
FROM sizes s
LEFT JOIN act a USING (cohort_month)
GROUP BY s.cohort_month, s.cohort_size
ORDER BY s.cohort_month;
```

| cohort_month | cohort_size | m0 | m1 | m2 |
|---|---|---|---|---|
| 2026-01-01 | 4 | 100 | 50 | 50 |
| 2026-02-01 | 3 | 100 | 33 | NULL |
| 2026-03-01 | 2 | 100 | NULL | NULL |

Reading it: half of January's cohort was active in February (month 1) and half in March (month 2). The `CASE` returns `NULL` for periods the cohort has not reached yet, which keeps the familiar triangle shape. Without it, those cells would show 0% and look like a collapse.

The month difference is computed from year and month numbers, which works in every engine. Engine shortcuts: `DATEDIFF('month', cohort_month, activity_date)` in Snowflake, `DATE_DIFF(activity_date, cohort_month, MONTH)` in BigQuery.

### Other cohort metrics

The same skeleton gives cumulative revenue per user by cohort age (sum revenue instead of counting users, then a running `SUM` over `month_n`), average orders per user, or churn per cohort. Cohorts can also be defined by acquisition channel, first product or plan, not just signup month.

### Pitfalls

- **Counting events instead of users.** Use `COUNT(DISTINCT user_id)` or de-duplicate per user and period first, as the `DISTINCT` in `act` does.
- **Calendar months versus 30-day periods.** "Month 1" by calendar month means anything from 1 to 61 days after signup. For precise comparisons use days since signup divided into 30-day buckets.
- **Small cohorts** give noisy percentages; show cohort size beside the rates.
- **Pivoting in SQL.** Each period is a hand-written column. For many periods, return long format (cohort, month_n, rate) and let the BI tool pivot.

### In interviews

"Build a monthly cohort retention table" is common. Explain the three steps, show how you avoid counting events and immature cells, and mention that the output is long or wide depending on the consumer. A follow-up is often "how would you make this incremental?": maintain a `user_cohort` table (one row per user, written once) and a `user_month_activity` table, then the matrix is a cheap aggregate.

## Funnel and conversion analysis

### What it is

A funnel is an ordered sequence of steps, such as view, add to cart, checkout and purchase. Funnel analysis counts how many users reach each step and the conversion rate between steps, to show where people drop out.

### Ordered funnel per user

Get each user's first time at each step, then require every step to happen after the previous one:

```sql
WITH steps AS (
  SELECT user_id,
         MIN(event_time) FILTER (WHERE event_name = 'view')        AS t_view,
         MIN(event_time) FILTER (WHERE event_name = 'add_to_cart') AS t_cart,
         MIN(event_time) FILTER (WHERE event_name = 'checkout')    AS t_checkout,
         MIN(event_time) FILTER (WHERE event_name = 'purchase')    AS t_purchase
  FROM funnel_events
  GROUP BY user_id
)
SELECT COUNT(t_view) AS viewed,
       COUNT(*) FILTER (WHERE t_cart > t_view) AS carted,
       COUNT(*) FILTER (WHERE t_checkout > t_cart AND t_cart > t_view) AS checked_out,
       COUNT(*) FILTER (WHERE t_purchase > t_checkout AND t_checkout > t_cart AND t_cart > t_view) AS purchased
FROM steps;
```

| viewed | carted | checked_out | purchased |
|---|---|---|---|
| 6 | 4 | 3 | 2 |

Step conversion is 4/6 = 66.7% view to cart, 3/4 = 75% cart to checkout and 2/3 = 66.7% checkout to purchase; overall 2/6 = 33.3%.

Compare with naive per-event counts:

```sql
SELECT event_name, COUNT(DISTINCT user_id) AS users
FROM funnel_events
GROUP BY event_name
ORDER BY users DESC;
```

| event_name | users |
|---|---|
| view | 6 |
| add_to_cart | 5 |
| checkout | 3 |
| purchase | 2 |

User 5 added to cart *before* viewing (for example via a direct link), so the naive count says 5 carted while the ordered funnel says 4. Which is right depends on the question, but the ordered funnel is what "conversion from view to cart" usually means.

### Variations

- **Conversion window**: add `AND t_purchase <= t_view + INTERVAL '1 day'` so that a purchase weeks later does not count as funnel conversion.
- **Per session**: sessionize first (see the gaps and islands lesson) and group by user and session instead of user.
- **Using first times only** can miss a user who viewed, left, and later did view, cart and purchase in order. If that matters, evaluate the steps per session, or use pattern matching such as `MATCH_RECOGNIZE` (Snowflake, Oracle), which finds ordered event patterns per partition directly.

### Pitfalls

- **Unordered counting** (shown above) overstates later steps.
- **Distinct users versus events.** Count users (or sessions) at every step; repeated clicks inflate event counts.
- **Different denominators.** State whether rates are relative to the previous step or to the top of the funnel.
- **Timestamp ties** between steps logged in the same second: decide whether `>=` is acceptable.

### In interviews

"Given an events table, compute the conversion rate at each funnel step" is a staple. Talk through ordering, the conversion window, user versus session grain, and how you would present rates. Mentioning that you would build a wide `user_funnel` table (one row per user or session with step timestamps) for BI is a good design touch.

## First and last touch attribution

### What it is

Before a user converts, they often interact with several marketing channels: an ad, an email, a social post. **Attribution** decides how to share the credit for the conversion. Rule-based models are easy to express in SQL:

| Model | Credit goes to | Bias |
|---|---|---|
| First touch | the earliest touch in the lookback window | Rewards awareness channels |
| Last touch | the latest touch before conversion | Rewards closing channels |
| Linear | all touches equally | Ignores position |
| Position-based / time decay | weighted by position or recency | Needs agreed weights |

### First and last touch per conversion

Join touches to conversions **only if they happened before the conversion and inside the lookback window**, then rank them both ways:

```sql
WITH eligible AS (
  SELECT c.user_id, c.converted_at, c.revenue, t.channel, t.touch_time,
         ROW_NUMBER() OVER (PARTITION BY c.user_id, c.converted_at ORDER BY t.touch_time ASC)  AS first_rank,
         ROW_NUMBER() OVER (PARTITION BY c.user_id, c.converted_at ORDER BY t.touch_time DESC) AS last_rank,
         COUNT(*)     OVER (PARTITION BY c.user_id, c.converted_at) AS n_touches
  FROM conversions c
  JOIN touches t
    ON t.user_id = c.user_id
   AND t.touch_time <= c.converted_at
   AND t.touch_time >= c.converted_at - INTERVAL '30 days'
)
SELECT user_id, revenue,
       MAX(channel) FILTER (WHERE first_rank = 1) AS first_touch,
       MAX(channel) FILTER (WHERE last_rank = 1)  AS last_touch,
       MAX(n_touches) AS touches
FROM eligible
GROUP BY user_id, revenue
ORDER BY user_id;
```

| user_id | revenue | first_touch | last_touch | touches |
|---|---|---|---|---|
| 1 | 120.00 | paid_search | social | 3 |
| 2 | 80.00 | social | paid_search | 2 |
| 3 | 50.00 | email | email | 1 |

User 3's `paid_search` touch happened *after* their conversion, so it is correctly ignored.

### Revenue by channel under three models

```sql
WITH eligible AS (
  SELECT c.user_id, c.converted_at, c.revenue, t.channel,
         ROW_NUMBER() OVER (PARTITION BY c.user_id, c.converted_at ORDER BY t.touch_time ASC)  AS first_rank,
         ROW_NUMBER() OVER (PARTITION BY c.user_id, c.converted_at ORDER BY t.touch_time DESC) AS last_rank,
         COUNT(*)     OVER (PARTITION BY c.user_id, c.converted_at) AS n_touches
  FROM conversions c
  JOIN touches t
    ON t.user_id = c.user_id
   AND t.touch_time <= c.converted_at
   AND t.touch_time >= c.converted_at - INTERVAL '30 days'
)
SELECT channel,
       SUM(revenue) FILTER (WHERE first_rank = 1) AS first_touch_revenue,
       SUM(revenue) FILTER (WHERE last_rank = 1)  AS last_touch_revenue,
       ROUND(SUM(revenue / n_touches), 2)         AS linear_revenue
FROM eligible
GROUP BY channel
ORDER BY channel;
```

| channel | first_touch_revenue | last_touch_revenue | linear_revenue |
|---|---|---|---|
| email | 50.00 | 50.00 | 90.00 |
| paid_search | 120.00 | 80.00 | 80.00 |
| social | 80.00 | 120.00 | 80.00 |

Each model distributes the same 250.00 of revenue differently, which is exactly why marketing teams argue about attribution. On engines with `QUALIFY` (Snowflake, BigQuery, Databricks, DuckDB) you can keep just the first or last touch with `QUALIFY ROW_NUMBER() OVER (...) = 1`.

### Pitfalls

- **Touches after the conversion** must be excluded (the `touch_time <= converted_at` condition).
- **Conversions with no touch** disappear in an inner join; use a `LEFT JOIN` and label them "direct" or "unattributed" so revenue totals still reconcile.
- **Ties** on touch time make first or last arbitrary; add a tiebreaker such as a channel priority.
- **Identity.** Touches are often recorded against anonymous cookies or devices. Attribution is only as good as the identity stitching that maps them to the converting user.
- **Repeat conversions.** Partition by the conversion, not only the user, so each purchase gets its own touch window.

### In interviews

You may be asked to "assign each purchase to the last marketing channel the user touched before buying". Show the time-bounded join, the window ranking and the handling of unattributed conversions, and check that attributed revenue sums to the total. Being able to say how first, last and linear differ, and why none of them is causal, is a plus.

## Market basket and co-occurrence analysis

### What it is

Market basket analysis finds items that appear together in the same order (or session, playlist, ticket) more often than chance would suggest. It drives "frequently bought together" recommendations, store layout and bundle pricing. In SQL it is a self-join on the basket id.

### Pair counts, support, confidence and lift

- **Support** of a pair: share of all baskets containing both items.
- **Confidence** A to B: of the baskets containing A, the share that also contain B.
- **Lift**: confidence divided by B's overall share. Above 1 means the items appear together more than if they were independent; below 1, less.

```sql
WITH pairs AS (
  SELECT a.product AS item_a, b.product AS item_b, COUNT(*) AS together
  FROM order_items a
  JOIN order_items b
    ON a.order_id = b.order_id
   AND a.product < b.product          -- each unordered pair once, no self-pairs
  GROUP BY a.product, b.product
), item_counts AS (
  SELECT product, COUNT(DISTINCT order_id) AS orders FROM order_items GROUP BY product
), total AS (
  SELECT COUNT(DISTINCT order_id) AS n FROM order_items
)
SELECT p.item_a, p.item_b, p.together,
       ROUND(p.together::numeric / t.n, 2)                              AS support,
       ROUND(p.together::numeric / ia.orders, 2)                        AS conf_a_to_b,
       ROUND(p.together::numeric * t.n / (ia.orders * ib.orders), 2)    AS lift
FROM pairs p
JOIN item_counts ia ON ia.product = p.item_a
JOIN item_counts ib ON ib.product = p.item_b
CROSS JOIN total t
ORDER BY p.together DESC, lift DESC, p.item_a, p.item_b;
```

| item_a | item_b | together | support | conf_a_to_b | lift |
|---|---|---|---|---|---|
| bread | butter | 3 | 0.50 | 0.60 | 1.20 |
| cereal | milk | 2 | 0.33 | 1.00 | 2.00 |
| bread | jam | 2 | 0.33 | 0.40 | 1.20 |
| bread | milk | 2 | 0.33 | 0.40 | 0.80 |
| butter | jam | 1 | 0.17 | 0.33 | 1.00 |
| butter | milk | 1 | 0.17 | 0.33 | 0.67 |
| bread | cereal | 1 | 0.17 | 0.20 | 0.60 |

Bread and butter are bought together most often, but cereal and milk have the highest lift: every cereal order also contained milk. Bread appears in most orders, so bread pairs have high counts but modest lift. Confidence is directional: cereal to milk is 1.00, but milk to cereal is 2/3.

### Pitfalls

- **Quadratic blow-up.** A basket of k items produces k(k-1)/2 pairs. Large baskets (wholesale orders, playlists) can explode the join; cap basket size, filter to items above a minimum support first, or sample.
- **Duplicate lines.** If the same product can appear twice in an order, de-duplicate `(order_id, product)` first, or pair counts and self-pairs get inflated.
- **`a.product < b.product` versus `<>`.** `<>` returns each pair twice (A,B and B,A), which you want only when computing directional confidence for both directions.
- **Rare items** produce extreme lift from tiny counts; filter by a minimum `together` count.

### In interviews

"Find the top product pairs bought together" tests the self-join with `a.product < b.product` and `COUNT(*)`. Strong answers add de-duplication, explain support, confidence and lift, and discuss the cost at scale (pre-aggregate, filter by minimum support, or move to a distributed engine or an algorithm such as FP-growth).

## Practice questions

<details><summary>Day-7 retention for last week's signups looks terrible. What do you check first?</summary>

Whether users whose day 7 has not happened yet are in the denominator. Only include users with `signup_date + 7 <= as_of_date`. Then check the definition (classic exact-day versus bracket or unbounded), the activity events counted, time-zone handling and whether the latest day's data has fully landed.

</details>

<details><summary>How do you build a monthly cohort retention matrix?</summary>

Assign each user a cohort month (signup month). For each activity, compute the month number relative to the cohort and de-duplicate per user and month. Count distinct users per cohort and month number, divide by cohort size, and pivot month numbers into columns with conditional aggregation (or return long format). Leave cells the cohort has not reached as `NULL`.

</details>

<details><summary>Why can per-step distinct-user counts overstate a funnel?</summary>

They ignore order and timing. A user who added to cart without ever viewing (or before viewing) is counted at the cart step. An ordered funnel requires each step's time to be after the previous step's, optionally within a conversion window, and usually within the same session.

</details>

<details><summary>Write the logic for last-touch attribution with a 30-day lookback.</summary>

Join conversions to touches on user, with `touch_time <= converted_at` and `touch_time >= converted_at - 30 days`. Rank touches per conversion by `touch_time DESC` (with a tiebreaker) and keep rank 1. Left join so conversions without touches are reported as unattributed, and check total attributed revenue equals total revenue.

</details>

<details><summary>Bread and butter appear together in 500 orders, cereal and milk in 50. Which pair is the stronger association?</summary>

You cannot tell from counts alone. Compute lift: the observed co-occurrence divided by what independence would predict (support of A times support of B). Very popular items co-occur often by chance. A pair with a lower count can have much higher lift, as cereal and milk do in the sample data.

</details>

<details><summary>How would you distinguish retained, new, resurrected and churned users each month?</summary>

Build one row per user per active month. For each user-month, retained = also active the previous month; new = no earlier activity (or signup in this month); resurrected = active before but not the previous month. Churned users for month m are those active in m-1 but not in m, found with an anti-join. The four counts reconcile: active(m) = retained + new + resurrected, and active(m-1) = retained + churned.

</details>

## Key takeaways

- Retention has several valid definitions (classic, bracket, unbounded); state which one you compute and exclude immature users.
- Cohort matrices group users by start period and measure activity by age; count users, not events, and leave unreached cells empty.
- Ordered funnels require each step after the previous one, usually within a window and per session; naive counts overstate later steps.
- Attribution is a time-bounded join plus window ranking; exclude post-conversion touches and keep unattributed conversions.
- Market basket analysis is a self-join on the basket with `a.item < b.item`; judge pairs by lift, not raw counts.
- In production, precompute per-user daily or monthly activity tables so these queries stay cheap.

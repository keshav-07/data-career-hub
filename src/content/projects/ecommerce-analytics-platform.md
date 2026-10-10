---
previous: "projects:s3-pyspark-snowflake-pipeline"
next: "projects:large-scale-batch-processing"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "E-commerce Analytics Data Platform"
description: "An intermediate project: build a layered analytics platform for an online store with staging, a star schema, tested dbt-style SQL models and certified metrics."
inventoryId: "PROJ-03"
technology: ["sql", "data-warehousing", "dbt"]
topic: ["modelling", "elt"]
level: "Intermediate"
problemStatement: "An online store has orders, customers, products, refunds and web sessions in separate systems. Build an ELT platform that models them into trusted marts for revenue, conversion and repeat customers, with every metric defined once and tested."
requirements: ["Load five source datasets into a raw schema unchanged", "Build staging models that type, rename, standardise and deduplicate", "Build a star schema with order-line facts and customer, product and date dimensions", "Define net revenue, orders, conversion rate and repeat-customer rate once and reuse them", "Test keys, nulls, accepted values, relationships and a revenue reconciliation on every run"]
technologies: ["PostgreSQL or DuckDB locally (or a cloud warehouse)", "SQL", "dbt Core (optional, for the second half)", "A BI tool or notebook for charts"]
dataset: "Synthetic: the SQL on this page generates customers, products, orders, order items, refunds and sessions, including a replayed duplicate order, cancelled orders and a test account."
steps: ["Write the business questions, metric definitions and the grain of each fact before any SQL", "Generate and load raw tables unchanged", "Write one staging model per raw table (rename, cast, standardise, deduplicate)", "Build dim_date, dim_customer, dim_product and fct_order_lines", "Define certified metrics as views over the marts", "Write tests as queries that return failing rows, plus a revenue reconciliation", "Port the models to dbt with ref(), schema tests and docs", "Build a small dashboard from the metric views only"]
testing: ["Primary-key uniqueness and not-null on every model", "Relationships from facts to every dimension", "Accepted values for order status", "Reconciliation: mart net revenue equals raw completed line amounts minus refunds, excluding test accounts", "A full rebuild produces identical results"]
dataQuality: ["Duplicate raw rows from source replays are removed in staging, and the count of removed rows is reported", "Test and internal accounts are flagged, not deleted", "Order dates fall in the expected range; quantities are positive"]
monitoring: ["Model run times and test results stored per run", "Freshness of each raw source (max loaded_at)", "Row counts per model compared with the previous run"]
costConsiderations: ["Runs free locally with PostgreSQL or DuckDB", "On a cloud warehouse, use the smallest warehouse with auto-suspend, views for light staging models and incremental models only for the largest facts"]
interviewQuestions: ["What is the grain of your fact table, and why not order grain?", "How did you define a repeat customer, and what would change with a different definition?", "How do you know your revenue number is correct?", "Where do you deduplicate, and why there?", "Why are metrics views rather than formulas in each dashboard?"]
resumeBullets: ["Built a layered ELT project (raw, staging, star-schema marts, certified metric views) for an e-commerce dataset; name the number of models and tests you wrote and show that the revenue reconciliation test passes on every run", "Defined net revenue, conversion and repeat-customer rate once as tested metric views and documented each definition; describe one definition decision you made and why"]
extensions: ["Port to dbt Core and add model contracts on the marts", "Add SCD Type 2 history for customer segment with dbt snapshots", "Make fct_order_lines incremental with a three-day lookback for late orders", "Add a sessions-to-order funnel model", "Schedule the build with an orchestrator and alert on failed tests"]
related: ["articles:data-warehousing/star-schema", "articles:data-warehousing/fact-tables", "articles:etl-elt/etl-vs-elt", "articles:etl-elt/data-quality-checks-contracts", "system-designs:elt-pipeline-with-dbt", "system-designs:cloud-data-warehouse-platform"]
versionContext: "All SQL on this page was run in order on PostgreSQL 16 with scripts/verify-examples.py; the shown output comes from that run. dbt snippets are illustrative (dbt Core 1.9+ syntax) and were not executed."
---

## What you will build

Teams at the store disagree about revenue because each pulls numbers differently: one includes cancelled orders, one forgets refunds, one counts the QA team's test orders. You will build the layer that ends the argument: raw data loaded unchanged, staging that cleans it once, a star schema at a declared grain, and **metrics defined once** as views that every dashboard reads. Every layer is tested.

You are done when:

- each metric has a written definition and exactly one SQL implementation;
- the test suite (keys, relationships, accepted values, reconciliation) passes;
- rebuilding everything from raw gives identical numbers;
- you can explain why your revenue number is right.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw schema holds customers, products, orders, order items, refunds and sessions as loaded.</li>
<li>Staging models clean and type one source table each.</li>
<li>Marts: <code>fct_order_lines</code>, <code>dim_customer</code>, <code>dim_product</code>, <code>dim_date</code>.</li>
<li>Certified metric views on top of the marts.</li>
<li>Tests run after every build; dashboards read only metric views.</li>
</ol>
<figcaption>Layered SQL models from raw to marts, each with tests.</figcaption>
</figure>

## Step 0: definitions before SQL

Write these down and agree them with the (imagined) business owner. They are the most valuable part of the project.

| Metric | Definition used here |
|---|---|
| Net revenue | Sum of line amounts (quantity × unit price) on **completed** orders, minus refunds, excluding test accounts, by order date |
| Orders | Count of distinct completed orders from real customers |
| Conversion rate | Completed orders ÷ sessions, per day |
| Repeat-customer rate | Share of customers who ordered in a month and had at least one completed order in an earlier month |

**Grain** of the main fact: one row per order line. Order-level facts are derived by aggregation; the reverse is impossible.

## Step 1: generate and load raw data

The generator uses arithmetic on `generate_series` instead of random numbers, so everyone gets the same data. It deliberately includes problems a real source has: order 5 is delivered twice (a source replay), every tenth order is cancelled, customer 12 is a test account, emails have mixed case and spaces, and two orders have refunds.

```sql
CREATE SCHEMA raw;

CREATE TABLE raw.customers AS
SELECT c AS id,
       CASE WHEN c = 12 THEN 'QA@Shop.example ' ELSE ' User' || c || '@Example.com' END AS email,
       (ARRAY['UK', 'DE', 'FR'])[1 + c % 3] AS country,
       timestamp '2026-08-01' + c * interval '2 days' AS created_at
FROM generate_series(1, 12) AS c;

CREATE TABLE raw.products AS
SELECT * FROM (VALUES (1, 'Trail shoe', 'footwear', 79.00), (2, 'Rain jacket', 'outerwear', 120.00),
                      (3, 'Wool socks', 'accessories', 12.50), (4, 'Day pack', 'bags', 55.00),
                      (5, 'Water bottle', 'accessories', 18.00))
  AS p(id, name, category, list_price);

CREATE TABLE raw.orders AS
SELECT o AS id, 1 + (o * 7) % 12 AS customer_id,
       timestamp '2026-09-01 09:00' + ((o * 37) % 60) * interval '1 day' + (o % 9) * interval '1 hour' AS created_at,
       CASE WHEN o % 10 = 0 THEN 'CANCELLED' ELSE 'completed' END AS status,
       timestamp '2026-11-01 02:00' AS _loaded_at
FROM generate_series(1, 40) AS o;
INSERT INTO raw.orders                                      -- the source replayed order 5
SELECT id, customer_id, created_at, status, _loaded_at + interval '1 hour' FROM raw.orders WHERE id = 5;

CREATE TABLE raw.order_items AS
SELECT o AS order_id, l AS line_no, 1 + (o + l) % 5 AS product_id, 1 + (o + l) % 2 AS qty
FROM generate_series(1, 40) AS o, generate_series(1, 3) AS l
WHERE l <= 1 + o % 3;

CREATE TABLE raw.refunds AS
SELECT * FROM (VALUES (3, 20.00, timestamp '2026-10-20'), (14, 12.50, timestamp '2026-10-25'))
  AS r(order_id, amount, refunded_at);

CREATE TABLE raw.sessions AS
SELECT s AS session_id, 1 + (s * 5) % 12 AS customer_id,
       date '2026-09-01' + (s * 11) % 60 AS session_date
FROM generate_series(1, 300) AS s;

SELECT 'customers' AS tbl, count(*) FROM raw.customers UNION ALL
SELECT 'orders', count(*) FROM raw.orders UNION ALL
SELECT 'order_items', count(*) FROM raw.order_items UNION ALL
SELECT 'sessions', count(*) FROM raw.sessions;
```

```text
     tbl     | count 
-------------+-------
 customers   |    12
 orders      |    41
 order_items |    80
 sessions    |   300
```

In a real project these tables come from a loader (CDC, a managed connector or `COPY` from files). The rule is the same: **raw is never edited**, so any model can be rebuilt from it.

## Step 2: staging, one model per source table

Staging renames to a consistent style, casts types, standardises values (lower-case emails, lower-case status), flags test accounts and removes duplicates. No joins and no business logic here.

```sql
CREATE SCHEMA staging;

CREATE VIEW staging.stg_customers AS
SELECT id AS customer_id,
       lower(trim(email)) AS email,
       country,
       created_at::date AS signup_date,
       lower(trim(email)) LIKE '%@shop.example' AS is_test_account
FROM raw.customers;

CREATE VIEW staging.stg_products AS
SELECT id AS product_id, name AS product_name, category, list_price::numeric(10, 2) AS list_price
FROM raw.products;

CREATE VIEW staging.stg_orders AS
SELECT order_id, customer_id, ordered_at, order_status
FROM (
  SELECT id AS order_id, customer_id, created_at AS ordered_at, lower(status) AS order_status,
         row_number() OVER (PARTITION BY id ORDER BY _loaded_at DESC) AS rn
  FROM raw.orders
) d
WHERE rn = 1;

CREATE VIEW staging.stg_order_items AS
SELECT order_id, line_no, product_id, qty AS quantity FROM raw.order_items;

CREATE VIEW staging.stg_refunds AS
SELECT order_id, amount::numeric(10, 2) AS refund_amount, refunded_at FROM raw.refunds;

CREATE VIEW staging.stg_sessions AS
SELECT session_id, customer_id, session_date FROM raw.sessions;

SELECT (SELECT count(*) FROM raw.orders) AS raw_orders,
       (SELECT count(*) FROM staging.stg_orders) AS staged_orders,
       (SELECT count(*) FROM raw.orders) - (SELECT count(*) FROM staging.stg_orders) AS duplicates_removed;
```

```text
 raw_orders | staged_orders | duplicates_removed 
------------+---------------+--------------------
         41 |            40 |                  1
```

Deduplicating **in staging, once** means every downstream model is protected. Report the number removed: a sudden jump means the source started replaying data.

## Step 3: the star schema

```sql
CREATE SCHEMA marts;

CREATE TABLE marts.dim_date AS
SELECT d::date AS date_day,
       extract(isodow FROM d)::int AS iso_day_of_week,
       to_char(d, 'YYYY-MM') AS year_month,
       date_trunc('month', d)::date AS month_start
FROM generate_series(date '2026-08-01', date '2026-12-31', interval '1 day') AS d;
ALTER TABLE marts.dim_date ADD PRIMARY KEY (date_day);

CREATE TABLE marts.dim_customer AS
SELECT customer_id, email, country, signup_date, is_test_account FROM staging.stg_customers;
ALTER TABLE marts.dim_customer ADD PRIMARY KEY (customer_id);

CREATE TABLE marts.dim_product AS
SELECT product_id, product_name, category, list_price FROM staging.stg_products;
ALTER TABLE marts.dim_product ADD PRIMARY KEY (product_id);

CREATE TABLE marts.fct_order_lines AS
SELECT i.order_id, i.line_no, o.customer_id, i.product_id,
       o.ordered_at::date AS order_date, o.order_status,
       i.quantity, p.list_price AS unit_price,
       (i.quantity * p.list_price)::numeric(12, 2) AS line_amount
FROM staging.stg_order_items i
JOIN staging.stg_orders o USING (order_id)
JOIN staging.stg_products p USING (product_id);
ALTER TABLE marts.fct_order_lines ADD PRIMARY KEY (order_id, line_no);

CREATE TABLE marts.fct_refunds AS
SELECT r.order_id, o.customer_id, o.ordered_at::date AS order_date, r.refund_amount
FROM staging.stg_refunds r JOIN staging.stg_orders o USING (order_id);

SELECT order_status, count(*) AS lines, sum(line_amount) AS amount
FROM marts.fct_order_lines GROUP BY order_status ORDER BY order_status;
```

```text
 order_status | lines | amount  
--------------+-------+---------
 cancelled    |     8 | 1107.50
 completed    |    72 | 5720.50
```

Two modelling decisions to be able to defend:

- `order_status` stays on the fact as a degenerate attribute so metrics can filter it; cancelled lines are kept, not deleted, because operations teams want to count cancellations.
- Refunds are their own fact at refund grain, joined to the order date, so revenue by order date subtracts the refunds of those orders. Finance may prefer refunds by refund date; that is a different, equally valid metric. Name the one you build.

## Step 4: certified metrics, defined once

Every dashboard reads these views. If the definition changes, it changes here, in one reviewed place.

```sql
CREATE SCHEMA metrics;

CREATE VIEW metrics.daily_sales AS
WITH lines AS (
  SELECT f.order_date, f.order_id, f.line_amount
  FROM marts.fct_order_lines f
  JOIN marts.dim_customer c USING (customer_id)
  WHERE f.order_status = 'completed' AND NOT c.is_test_account
), refunds AS (
  SELECT r.order_date, sum(r.refund_amount) AS refunds
  FROM marts.fct_refunds r
  JOIN marts.dim_customer c USING (customer_id)
  JOIN (SELECT DISTINCT order_id FROM lines) l USING (order_id)
  WHERE NOT c.is_test_account
  GROUP BY r.order_date
)
SELECT d.date_day,
       count(DISTINCT l.order_id) AS orders,
       coalesce(sum(l.line_amount), 0) - coalesce(max(rf.refunds), 0) AS net_revenue
FROM marts.dim_date d
LEFT JOIN lines l ON l.order_date = d.date_day
LEFT JOIN refunds rf ON rf.order_date = d.date_day
GROUP BY d.date_day;

CREATE VIEW metrics.daily_conversion AS
SELECT s.session_date AS date_day, count(*) AS sessions,
       coalesce(max(ds.orders), 0) AS orders,
       round(coalesce(max(ds.orders), 0)::numeric / count(*), 3) AS conversion_rate
FROM staging.stg_sessions s
JOIN marts.dim_customer c USING (customer_id)
LEFT JOIN metrics.daily_sales ds ON ds.date_day = s.session_date
WHERE NOT c.is_test_account
GROUP BY s.session_date;

CREATE VIEW metrics.monthly_repeat_customers AS
WITH customer_months AS (
  SELECT DISTINCT f.customer_id, date_trunc('month', f.order_date)::date AS month_start
  FROM marts.fct_order_lines f JOIN marts.dim_customer c USING (customer_id)
  WHERE f.order_status = 'completed' AND NOT c.is_test_account
)
SELECT m.month_start,
       count(*) AS ordering_customers,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM customer_months p
         WHERE p.customer_id = m.customer_id AND p.month_start < m.month_start)) AS repeat_customers,
       round(count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM customer_months p
         WHERE p.customer_id = m.customer_id AND p.month_start < m.month_start))::numeric / count(*), 2)
         AS repeat_rate
FROM customer_months m
GROUP BY m.month_start;

SELECT to_char(date_day, 'YYYY-MM') AS month, sum(orders) AS orders, sum(net_revenue) AS net_revenue
FROM metrics.daily_sales GROUP BY 1 HAVING sum(orders) > 0 ORDER BY 1;

SELECT * FROM metrics.monthly_repeat_customers ORDER BY month_start;
```

```text
  month  | orders | net_revenue 
---------+--------+-------------
 2026-09 |     16 |     2368.50
 2026-10 |     17 |     2618.00

 month_start | ordering_customers | repeat_customers | repeat_rate 
-------------+--------------------+------------------+-------------
 2026-09-01  |                  9 |                0 |        0.00
 2026-10-01  |                 11 |                9 |        0.82
```

September has no repeat customers by construction (it is the first month of orders); a real store would have history before the project's window, which is why the definition says "an earlier month" and not "an earlier month in this dataset". Writing such edge cases into the definition is what makes a metric certifiable.

## Step 5: tests

dbt's generic tests (`unique`, `not_null`, `accepted_values`, `relationships`) are queries that return failing rows. You can write the same thing in plain SQL and run all of them in one statement. The reconciliation test recomputes revenue from **raw** data with independent SQL and compares it with the metric view.

```sql
CREATE VIEW metrics.test_results AS
SELECT 'fct_order_lines pk unique' AS test,
       (SELECT count(*) FROM (SELECT order_id, line_no FROM marts.fct_order_lines
                              GROUP BY 1, 2 HAVING count(*) > 1) x) AS failures
UNION ALL
SELECT 'stg_orders order_id unique',
       (SELECT count(*) FROM (SELECT order_id FROM staging.stg_orders GROUP BY 1 HAVING count(*) > 1) x)
UNION ALL
SELECT 'order_status accepted values',
       (SELECT count(*) FROM staging.stg_orders WHERE order_status NOT IN ('completed', 'cancelled'))
UNION ALL
SELECT 'fact -> dim_customer relationship',
       (SELECT count(*) FROM marts.fct_order_lines f
        LEFT JOIN marts.dim_customer c USING (customer_id) WHERE c.customer_id IS NULL)
UNION ALL
SELECT 'fact -> dim_product relationship',
       (SELECT count(*) FROM marts.fct_order_lines f
        LEFT JOIN marts.dim_product p USING (product_id) WHERE p.product_id IS NULL)
UNION ALL
SELECT 'fact -> dim_date relationship',
       (SELECT count(*) FROM marts.fct_order_lines f
        LEFT JOIN marts.dim_date d ON d.date_day = f.order_date WHERE d.date_day IS NULL)
UNION ALL
SELECT 'quantity positive', (SELECT count(*) FROM marts.fct_order_lines WHERE quantity <= 0)
UNION ALL
SELECT 'net revenue reconciles with raw',
       (SELECT CASE WHEN abs(m.total - r.total) < 0.005 THEN 0 ELSE 1 END
        FROM (SELECT sum(net_revenue) AS total FROM metrics.daily_sales) m,
             (SELECT (SELECT sum(i.qty * p.list_price)
                      FROM raw.order_items i
                      JOIN (SELECT DISTINCT id, customer_id, status FROM raw.orders) o ON o.id = i.order_id
                      JOIN raw.products p ON p.id = i.product_id
                      JOIN raw.customers c ON c.id = o.customer_id
                      WHERE lower(o.status) = 'completed' AND lower(trim(c.email)) NOT LIKE '%@shop.example')
                   - (SELECT sum(r.amount) FROM raw.refunds r
                      JOIN (SELECT DISTINCT id, customer_id, status FROM raw.orders) o ON o.id = r.order_id
                      JOIN raw.customers c ON c.id = o.customer_id
                      WHERE lower(o.status) = 'completed' AND lower(trim(c.email)) NOT LIKE '%@shop.example')
                   AS total) r);

SELECT test, failures, CASE WHEN failures = 0 THEN 'pass' ELSE 'FAIL' END AS result
FROM metrics.test_results ORDER BY test;
```

```text
               test                | failures | result 
-----------------------------------+----------+--------
 fact -> dim_customer relationship |        0 | pass
 fact -> dim_date relationship     |        0 | pass
 fact -> dim_product relationship  |        0 | pass
 fct_order_lines pk unique         |        0 | pass
 net revenue reconciles with raw   |        0 | pass
 order_status accepted values      |        0 | pass
 quantity positive                 |        0 | pass
 stg_orders order_id unique        |        0 | pass
```

Make the reconciliation fail on purpose once (for example remove `NOT c.is_test_account` from `metrics.daily_sales`) and confirm the test catches it. A test you have never seen fail is a test you cannot trust.

## Step 6: port it to dbt

The SQL above maps one-to-one onto a dbt project. Each `CREATE VIEW` or `CREATE TABLE` body becomes a model file, schema names become folders, and `raw.orders` becomes `{{ source('shop', 'orders') }}`:

```text
models/
  staging/  stg_customers.sql  stg_orders.sql  ...  _staging.yml
  marts/    dim_customer.sql   fct_order_lines.sql   _marts.yml
  metrics/  daily_sales.sql    monthly_repeat_customers.sql
tests/
  assert_net_revenue_reconciles.sql
```

<!-- noexec -->
```yaml
# models/marts/_marts.yml
models:
  - name: fct_order_lines
    description: "One row per order line. Cancelled lines are kept; filter on order_status."
    config:
      contract: { enforced: true }
    columns:
      - name: order_id
        data_type: integer
        data_tests: [not_null]
      - name: order_status
        data_type: text
        data_tests:
          - accepted_values: { values: ["completed", "cancelled"] }
      - name: customer_id
        data_type: integer
        data_tests:
          - relationships: { to: ref('dim_customer'), field: customer_id }
    data_tests:
      - dbt_utils.unique_combination_of_columns: { combination_of_columns: [order_id, line_no] }
```

`dbt build` runs models and tests in dependency order and skips everything downstream of a failing test, so a broken staging model never reaches the metrics. The [ELT pipeline with dbt case study](/data-engineering/system-design/elt-pipeline-with-dbt/) covers incremental models, CI and orchestration for when this grows.

## Common mistakes

- **Joining refunds to order lines** before aggregating, which multiplies each refund by the number of lines in the order. Aggregate refunds separately, as `metrics.daily_sales` does.
- **Deleting test accounts or cancelled orders** in staging. Flag them; different metrics need them.
- **Deduplicating in each mart** instead of once in staging.
- **Inner joins to the date dimension** that make days with zero orders disappear from charts.
- **Metric logic in the BI tool**, so the next dashboard reimplements it slightly differently.

## Explaining it in an interview

1. "Raw is loaded unchanged; staging cleans each source once; marts are a star schema at order-line grain; metrics are views that every dashboard uses."
2. "I wrote the metric definitions first. Net revenue is completed line amounts minus refunds, without test accounts, by order date. Finance could want refunds by refund date; I would build that as a separate, named metric."
3. "I trust the number because a reconciliation test recomputes it from raw data with independent SQL on every build, alongside key, relationship and accepted-value tests."
4. "Deduplication happens once in staging using the latest `_loaded_at`, because the source can replay rows."
5. "At scale I would move this into dbt with contracts on the marts and make the order-lines fact incremental with a lookback for late orders."

Follow-ups to prepare: *Why not order grain?* (you lose product-level analysis and cannot get line detail back). *What if a product's price changes?* (the fact stores the price at order time; here the generator uses list price, so mention that a real source should provide the charged price). *How would you add history for customer country?* (SCD Type 2 via dbt snapshots, and join facts by order date).

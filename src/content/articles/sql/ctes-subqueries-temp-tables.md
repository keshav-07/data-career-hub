---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "SQL Subqueries and CTEs: Derived Tables, Correlated Queries and Temporary Tables"
seoTitle: "SQL Subqueries, CTEs and Temporary Tables"
description: "Write subqueries in WHERE, FROM and SELECT, understand correlated subqueries, structure logic with chained CTEs, and know when a temporary table is the better choice."
inventoryId: "TECH-03"
technology: ["sql"]
topic: ["ctes", "subqueries", "query-structure"]
difficulty: "Intermediate"
learningObjectives:
  - "Filter with subqueries in WHERE using IN, EXISTS, comparison operators, ANY and ALL"
  - "Build derived tables in FROM and aggregate in two stages"
  - "Use scalar subqueries safely and know what happens with zero or several rows"
  - "Explain how correlated subqueries are evaluated and when to rewrite them"
  - "Structure multi-step logic as chained CTEs and choose between a CTE and a temporary table"
prerequisites: ["articles:sql/semi-anti-lateral-joins"]
related: ["articles:sql/query-optimization-fundamentals", "interview-questions:sql/remove-duplicate-records", "interview-questions:sql/second-highest-salary"]
previous: "articles:sql/semi-anti-lateral-joins"
sources:
  - { label: "PostgreSQL documentation: WITH queries (common table expressions)", url: "https://www.postgresql.org/docs/16/queries-with.html" }
  - { label: "PostgreSQL documentation: Subquery expressions", url: "https://www.postgresql.org/docs/16/functions-subquery.html" }
  - { label: "PostgreSQL documentation: Scalar subqueries", url: "https://www.postgresql.org/docs/16/sql-expressions.html" }
  - { label: "PostgreSQL documentation: CREATE TABLE (TEMPORARY)", url: "https://www.postgresql.org/docs/16/sql-createtable.html" }
versionContext: "Examples run on PostgreSQL 16. CTE materialisation notes for other engines are general and were not executed; check each engine's query plan."
---

A **subquery** is a query inside another query. A **common table expression** (CTE) is a named subquery declared up front with `WITH`. Both let you build an answer in steps: first compute each customer's total, then compare it with the average, then label the result. This lesson covers every place a subquery can go, how correlated subqueries run, how to chain CTEs into a readable pipeline, and when a temporary table is the better tool.

## Sample data

```sql
CREATE TABLE customers (customer_id INT PRIMARY KEY, full_name TEXT NOT NULL, country TEXT NOT NULL);
INSERT INTO customers VALUES
  (1, 'Asha Patel', 'IN'), (2, 'Ben Carter', 'GB'), (3, 'Chen Wei', 'SG'),
  (4, 'Diana Lopez', 'US'), (5, 'Ethan Brown', 'GB'), (6, 'Farah Khan', 'IN');

CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date  DATE NOT NULL,
  status      TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL
);
INSERT INTO orders VALUES
  (101, 1, '2025-06-01', 'delivered', 120.00),
  (102, 1, '2025-06-03', 'delivered',  35.50),
  (103, 2, '2025-06-03', 'cancelled',  80.00),
  (104, 3, '2025-06-04', 'shipped',   220.00),
  (105, 4, '2025-06-05', 'delivered', 220.00),
  (106, 4, '2025-06-07', 'placed',     15.00),
  (107, 5, '2025-06-07', 'delivered',  64.99),
  (108, 2, '2025-06-08', 'delivered',  80.00),
  (109, 1, '2025-07-02', 'delivered',  45.00),
  (110, 5, '2025-07-03', 'delivered', 150.00);
```

## Subqueries in WHERE

A subquery in `WHERE` supplies the values a filter compares against. It answers questions such as "orders above the average" or "customers from countries where someone spent over 200" without hard-coding numbers.

### Comparing with a single value

```sql
SELECT order_id, customer_id, amount
FROM orders
WHERE amount > (SELECT AVG(amount) FROM orders)
ORDER BY amount DESC, order_id;
```

| order_id | customer_id | amount |
|---|---|---|
| 104 | 3 | 220.00 |
| 105 | 4 | 220.00 |
| 110 | 5 | 150.00 |
| 101 | 1 | 120.00 |

The subquery returns one value (the average, about 103.05), and each order is compared with it. You cannot write `WHERE amount > AVG(amount)` directly, because aggregates are not allowed in `WHERE`.

### Comparing with a list: IN, EXISTS, ANY and ALL

When the subquery returns many rows, use a set operator:

```sql
-- Customers in any country where some order exceeded 200
SELECT full_name, country
FROM customers
WHERE country IN (
  SELECT c.country
  FROM customers c
  JOIN orders o ON o.customer_id = c.customer_id
  WHERE o.amount > 200
)
ORDER BY full_name;
```

| full_name | country |
|---|---|
| Chen Wei | SG |
| Diana Lopez | US |

| Form | True when |
|---|---|
| `x IN (subquery)` | `x` equals at least one returned value |
| `x = ANY (subquery)` | Same as `IN` (`ANY` works with `<`, `>`, etc. too) |
| `x > ALL (subquery)` | `x` is greater than every returned value (true if the subquery returns no rows) |
| `EXISTS (subquery)` | The subquery returns at least one row |

`ALL` is a neat way to express "the largest": orders bigger than every order from GB customers:

```sql
SELECT order_id, amount
FROM orders
WHERE amount > ALL (
  SELECT o.amount FROM orders o JOIN customers c ON c.customer_id = o.customer_id
  WHERE c.country = 'GB'
)
ORDER BY order_id;
```

| order_id | amount |
|---|---|
| 104 | 220.00 |
| 105 | 220.00 |

### Pitfalls

- `NOT IN` with a subquery that can return `NULL` returns no rows; use `NOT EXISTS` (see the [anti-join lesson](/sql/semi-anti-lateral-joins/)). `> ALL` has the same weakness: a `NULL` in the list makes the comparison unknown.
- `= (subquery)` fails at run time if the subquery returns more than one row. Use `IN` when several rows are possible.
- `> ALL` over an empty subquery is true for every row, which can surprise you when a filter inside the subquery matches nothing.

### In interviews

"Find employees earning more than the company average" and "the second-highest salary" (`WHERE salary < (SELECT MAX(salary) ...)`) are classic subquery-in-`WHERE` questions. Explain why the aggregate must be in a subquery, and mention the `NOT IN` `NULL` trap if a list is involved.

## Subqueries in FROM (derived tables)

A subquery in `FROM` produces a temporary result set that the outer query treats like a table. This is called a **derived table** (or inline view). Its main use is **two-stage aggregation**: aggregate once, then aggregate or filter the result again.

```sql
SELECT ROUND(AVG(customer_total), 2) AS avg_spend_per_customer,
       MAX(customer_total)          AS top_customer_spend
FROM (
  SELECT customer_id, SUM(amount) AS customer_total
  FROM orders
  WHERE status <> 'cancelled'
  GROUP BY customer_id
) AS totals;
```

| avg_spend_per_customer | top_customer_spend |
|---|---|
| 190.10 | 235.00 |

The average order value and the average spend per customer are different metrics; the derived table makes the grain change explicit: first one row per customer, then one row overall.

### How it works

- A derived table **must have an alias** in PostgreSQL (before version 16), MySQL and SQL Server; PostgreSQL 16 made it optional, but write one anyway for portability.
- Every computed column in it needs a name, because the outer query refers to it.
- A derived table cannot normally see columns of other tables in the same `FROM`; that requires `LATERAL`.
- Optimisers usually merge simple derived tables into the outer query, so they cost nothing extra; aggregates and `DISTINCT` inside them are computed first.

### Filtering on a computed column

Because `WHERE` runs before `SELECT`, you cannot filter on an alias or a window function in the same query. Wrap the query and filter outside:

```sql
SELECT customer_id, customer_total
FROM (
  SELECT customer_id, SUM(amount) AS customer_total
  FROM orders
  GROUP BY customer_id
) AS t
WHERE customer_total >= 200
ORDER BY customer_total DESC;
```

| customer_id | customer_total |
|---|---|
| 4 | 235.00 |
| 3 | 220.00 |
| 5 | 214.99 |
| 1 | 200.50 |

(`HAVING SUM(amount) >= 200` would work here too; the wrapper becomes necessary for window functions and for readability when the expression is long.)

### Pitfalls

- Deeply nested derived tables (three or four levels) are hard to read and debug. Rewrite them as CTEs.
- Forgetting that the inner query sets the grain: joining a derived table of customer totals back to orders repeats the total on every order row.

### In interviews

Expect "average number of orders per customer" or "average of daily totals". The trap is computing `AVG(amount)` directly, which gives the average per order. State the two grains and aggregate twice.

## Scalar subqueries

A **scalar subquery** returns exactly one column and at most one row, so it can be used anywhere a single value can: in `SELECT`, in `WHERE`, in `CASE` or in arithmetic.

```sql
SELECT order_id,
       amount,
       ROUND(100.0 * amount / (SELECT SUM(amount) FROM orders), 1) AS pct_of_all_revenue,
       amount - (SELECT AVG(amount) FROM orders)                   AS diff_from_avg
FROM orders
WHERE customer_id = 1
ORDER BY order_id;
```

| order_id | amount | pct_of_all_revenue | diff_from_avg |
|---|---|---|---|
| 101 | 120.00 | 11.6 | 16.9510000000000000 |
| 102 | 35.50 | 3.4 | -67.5490000000000000 |
| 109 | 45.00 | 4.4 | -58.0490000000000000 |

### How it works

- **Zero rows** from a scalar subquery give `NULL`, not an error.
- **More than one row** is a run-time error:

<!-- expect-error -->
```sql
-- ERROR: more than one row returned by a subquery used as an expression
SELECT order_id, (SELECT amount FROM orders WHERE customer_id = 1) AS amt
FROM orders;
```

The error depends on the data, so a query can work for months and fail when a second row appears. Make scalar subqueries return one row by construction: an aggregate (`MAX`, `SUM`), a filter on a unique key, or `LIMIT 1` with an `ORDER BY`.

- An uncorrelated scalar subquery (one that does not reference the outer row) is computed once and reused, so `(SELECT SUM(amount) FROM orders)` above is cheap. A **window function** often expresses the same thing more directly: `SUM(amount) OVER ()` gives the grand total on every row, as the [window functions lesson](/sql/window-functions/) shows.

### Pitfalls

- A scalar subquery that is unique "today" but not guaranteed to be.
- Scalar subqueries in `SELECT` that are correlated (next section) and run per row on a large table.
- Long decimals: `amount - (SELECT AVG(...))` inherits the average's scale; round for presentation.

### In interviews

Interviewers sometimes ask "what happens if this subquery returns two rows?" (an error) or "no rows?" (`NULL`). Showing the window-function alternative for percent-of-total is a plus.

## Correlated subqueries

A **correlated subquery** refers to a column of the outer query, so its result depends on the current outer row. Logically it is re-evaluated **once per outer row**.

```sql
-- Orders larger than that customer's own average order
SELECT o.order_id, o.customer_id, o.amount
FROM orders o
WHERE o.amount > (
  SELECT AVG(o2.amount)
  FROM orders o2
  WHERE o2.customer_id = o.customer_id     -- correlation
)
ORDER BY o.customer_id, o.order_id;
```

| order_id | customer_id | amount |
|---|---|---|
| 101 | 1 | 120.00 |
| 105 | 4 | 220.00 |
| 110 | 5 | 150.00 |

Ben's two orders are both 80.00, equal to his average, so neither is "larger"; Chen has a single order, which equals its own average.

### Latest row per group

A correlated `MAX` is a classic way to keep the latest row per key:

```sql
SELECT o.customer_id, o.order_id, o.order_date
FROM orders o
WHERE o.order_date = (
  SELECT MAX(o2.order_date) FROM orders o2 WHERE o2.customer_id = o.customer_id
)
ORDER BY o.customer_id;
```

| customer_id | order_id | order_date |
|---|---|---|
| 1 | 109 | 2025-07-02 |
| 2 | 108 | 2025-06-08 |
| 3 | 104 | 2025-06-04 |
| 4 | 106 | 2025-06-07 |
| 5 | 110 | 2025-07-03 |

If a customer had two orders on their latest date, both would be returned. That may or may not be what you want; `ROW_NUMBER()` with a tiebreaker returns exactly one.

### How engines run them

"Once per outer row" is the **logical** model. Optimisers usually **decorrelate** the query: they compute the inner aggregate for all customers once (like a `GROUP BY` in a derived table) and join it, or turn `EXISTS` into a semi-join. When they cannot, the query really does run as a nested loop, which is fast with an index on the correlated column and very slow on large tables without one. Columnar warehouses and Spark support only some correlated patterns, and Spark rewrites them into joins.

The explicit join form of the first query, which every engine handles well:

```sql
SELECT o.order_id, o.customer_id, o.amount
FROM orders o
JOIN (
  SELECT customer_id, AVG(amount) AS avg_amount
  FROM orders
  GROUP BY customer_id
) a ON a.customer_id = o.customer_id
WHERE o.amount > a.avg_amount
ORDER BY o.customer_id, o.order_id;
```

It returns the same three rows. A window function (`AVG(amount) OVER (PARTITION BY customer_id)`) is a third option.

### Pitfalls

- Forgetting the correlation condition, which silently turns the subquery into an uncorrelated one (comparing with the overall average).
- Ambiguous column names: inside the subquery, an unqualified `customer_id` refers to the inner table if it has that column. Always qualify with aliases.
- Correlated scalar subqueries in `SELECT` on big tables, each one a separate lookup if not decorrelated.

### In interviews

Be able to say what "correlated" means, how it is evaluated logically, that optimisers usually rewrite it as a join, and how you would rewrite it yourself (derived table join or window function). The classic prompt is "employees who earn more than their department's average".

## Common table expressions (CTEs)

A CTE gives a subquery a name at the top of the statement with `WITH name AS (...)`. The main query, and later CTEs, can then refer to it like a table. CTEs do not add power over derived tables (except recursion); they add **readability**: logic reads top to bottom, each step has a name, and a step used twice is written once.

```sql
WITH customer_totals AS (
  SELECT customer_id, SUM(amount) AS total_spend, COUNT(*) AS orders
  FROM orders
  WHERE status <> 'cancelled'
  GROUP BY customer_id
)
SELECT c.full_name, t.total_spend, t.orders
FROM customer_totals t
JOIN customers c ON c.customer_id = t.customer_id
WHERE t.total_spend > (SELECT AVG(total_spend) FROM customer_totals)
ORDER BY t.total_spend DESC;
```

| full_name | total_spend | orders |
|---|---|---|
| Diana Lopez | 235.00 | 2 |
| Chen Wei | 220.00 | 1 |
| Ethan Brown | 214.99 | 2 |
| Asha Patel | 200.50 | 3 |

`customer_totals` is used twice, once as a table and once inside the scalar subquery, but written once. Ben's only non-cancelled order is 80.00, below the average of 190.10.

### How it works

- A CTE exists only for the single statement that follows the `WITH`. It is not stored anywhere.
- You can name the columns after the CTE name: `WITH totals (customer_id, spend) AS (...)`.
- **Is a CTE computed once?** It depends on the engine. Since PostgreSQL 12, a CTE referenced once (and without side effects) is inlined into the main query like a subquery; one referenced several times is computed once (materialised) by default. You can force either with `AS MATERIALIZED` or `AS NOT MATERIALIZED`. SQL Server always inlines, so a CTE referenced twice is evaluated twice. Snowflake, BigQuery and Spark decide per query. Never assume; read the plan.
- `WITH RECURSIVE` lets a CTE refer to itself to walk hierarchies or generate sequences. It is covered in the advanced part of this course.
- PostgreSQL also allows data-modifying statements in a CTE (`WITH moved AS (DELETE ... RETURNING *) INSERT INTO archive SELECT * FROM moved`), which is handy for archiving rows in one statement.

### Pitfalls

- Assuming a CTE is cached and referencing an expensive one several times in an engine that inlines it.
- Assuming a CTE is an optimisation fence. In older PostgreSQL versions (11 and earlier) it always was, so filters were not pushed into it; that is no longer true by default.
- Very long single-statement CTE chains with no intermediate checks. When a step is expensive or needs validating, persist it (next section).

### In interviews

"What is the difference between a CTE and a subquery?" Answer: scope and capability are the same (one statement), except that CTEs can be recursive and can be referenced several times; the real difference is readability. Then add the engine-dependent materialisation point, which is what separates a strong answer.

## Multiple chained CTEs

Several CTEs, separated by commas after one `WITH`, can each build on the ones before. This turns a complex query into a short pipeline of named steps, the same shape dbt models use.

```sql
WITH valid_orders AS (              -- 1. clean: drop cancelled orders
  SELECT order_id, customer_id, order_date, amount
  FROM orders
  WHERE status <> 'cancelled'
),
customer_stats AS (                 -- 2. aggregate to one row per customer
  SELECT customer_id,
         COUNT(*)        AS orders,
         SUM(amount)     AS total_spend,
         MAX(order_date) AS last_order_date
  FROM valid_orders
  GROUP BY customer_id
),
segmented AS (                      -- 3. apply business rules
  SELECT customer_id, orders, total_spend, last_order_date,
         CASE
           WHEN total_spend >= 200 AND orders >= 2 THEN 'loyal high value'
           WHEN total_spend >= 200                 THEN 'high value'
           ELSE 'standard'
         END AS segment
  FROM customer_stats
)
SELECT c.full_name,                 -- 4. present, keeping customers without orders
       COALESCE(s.orders, 0)          AS orders,
       COALESCE(s.total_spend, 0)     AS total_spend,
       COALESCE(s.segment, 'no orders') AS segment
FROM customers c
LEFT JOIN segmented s ON s.customer_id = c.customer_id
ORDER BY total_spend DESC, c.full_name;
```

| full_name | orders | total_spend | segment |
|---|---|---|---|
| Diana Lopez | 2 | 235.00 | loyal high value |
| Chen Wei | 1 | 220.00 | high value |
| Ethan Brown | 2 | 214.99 | loyal high value |
| Asha Patel | 3 | 200.50 | loyal high value |
| Ben Carter | 1 | 80.00 | standard |
| Farah Khan | 0 | 0 | no orders |

### Why this shape works

- **Each step has one job**: clean, aggregate, apply rules, present. A reviewer can check each in isolation.
- **Debugging is easy**: replace the final `SELECT` with `SELECT * FROM customer_stats` to inspect an intermediate step.
- **Grain changes are visible**: `valid_orders` is one row per order, `customer_stats` one row per customer.
- A later CTE can reference any earlier one, not only the previous step, but it cannot reference a later one.

### Temporary tables: when a CTE is not enough

A temporary table is a real table that lives until the end of your session (or transaction), so you can reuse it across statements, index it and check it before continuing.

```sql
CREATE TEMPORARY TABLE recent_orders AS
SELECT * FROM orders WHERE order_date >= DATE '2025-07-01';

SELECT COUNT(*) AS recent_count FROM recent_orders;
SELECT customer_id, SUM(amount) AS recent_spend FROM recent_orders GROUP BY customer_id ORDER BY customer_id;
```

| recent_count |
|---|
| 2 |

| customer_id | recent_spend |
|---|---|
| 1 | 45.00 |
| 5 | 150.00 |

| | Subquery | CTE (`WITH`) | Temporary table |
|---|---|---|---|
| Scope | Inside one statement | One statement | The session (or transaction) |
| Readable top to bottom | Less | Yes | Yes |
| Reusable across statements | No | No | Yes |
| Can be indexed | No | No | Yes, in most engines |
| Computed once | Engine decides | Engine decides | Yes, when created |
| Recursion | No | Yes (`WITH RECURSIVE`) | No |

Use CTEs for clarity by default. Reach for a temporary table when an expensive intermediate result is reused by several statements, needs an index, or should be validated (row counts, duplicate checks) before the next step. In orchestrated pipelines the same idea often becomes a persisted staging table or an intermediate dbt model.

### Pitfalls

- One enormous `WITH` chain doing the work of a whole pipeline, with no checkpoints. Split it where you would want to inspect or test the data.
- Naming CTEs `t1`, `t2`, `t3`. Name each after what it contains.
- Repeating the same filter in several CTEs instead of applying it once in the first step.
- Forgetting that temporary tables vanish at session end, which breaks jobs whose steps run in different sessions or connection-pool connections.

### In interviews

Multi-step problems ("segment customers by spend and recency, then count per segment") are much easier to solve aloud with chained CTEs: name each step as you go. If asked about performance, mention the materialisation question and temporary tables for reused expensive steps.

## Practice questions

<details><summary>Return each employee whose salary is above their department's average. Give a correlated subquery and a version without one.</summary>

Correlated: `SELECT e.* FROM employees e WHERE e.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.dept_id = e.dept_id);`
Without correlation: `WITH d AS (SELECT dept_id, AVG(salary) AS avg_sal FROM employees GROUP BY dept_id) SELECT e.* FROM employees e JOIN d ON d.dept_id = e.dept_id WHERE e.salary > d.avg_sal;` A window function version uses `AVG(salary) OVER (PARTITION BY dept_id)` in a CTE and filters outside.

</details>

<details><summary>Find the second-highest distinct salary using only subqueries.</summary>

`SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);` The inner query finds the maximum; the outer one finds the largest value below it. It returns `NULL` when there is no second value, which is usually the desired behaviour. `DENSE_RANK()` generalises to the Nth highest.

</details>

<details><summary>What happens when a scalar subquery returns no rows, and when it returns two?</summary>

No rows: the expression is `NULL`. Two or more rows: a run-time error ("more than one row returned by a subquery used as an expression" in PostgreSQL). Guarantee a single row with an aggregate, a unique-key filter or `ORDER BY ... LIMIT 1`.

</details>

<details><summary>Is a CTE referenced three times computed three times?</summary>

It depends on the engine. PostgreSQL 12+ materialises a CTE referenced more than once by default (computed once) and lets you override with `MATERIALIZED`/`NOT MATERIALIZED`. SQL Server inlines CTEs, so each reference is evaluated separately. Snowflake, BigQuery and Spark decide per query. Check the plan, and use a temporary table if you need a guaranteed single computation.

</details>

<details><summary>Compute the average number of orders per customer, counting customers with no orders as zero.</summary>

```
WITH per_customer AS (
  SELECT c.customer_id, COUNT(o.order_id) AS orders
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.customer_id
  GROUP BY c.customer_id
)
SELECT AVG(orders) FROM per_customer;
```

The first step sets the grain to one row per customer and uses `COUNT(o.order_id)` so customers without orders count as 0; the second averages across customers. Averaging directly over orders would skip zero-order customers.

</details>

<details><summary>When would you choose a temporary table over a CTE in a transformation job?</summary>

When an intermediate result is expensive and reused by several statements, when it benefits from an index or statistics, or when you want to validate it (row counts, uniqueness) before continuing. CTEs exist only within one statement and may be recomputed per reference. Note that temporary tables last only for the session, so all steps must run on the same connection.

</details>

## Key takeaways

- Subqueries can appear in `WHERE` (filter values), `FROM` (derived tables) and `SELECT` (scalar values); each has its own rules.
- Use `IN`, `EXISTS`, `ANY` or `ALL` for multi-row subqueries in `WHERE`, and avoid `NOT IN` when `NULL`s are possible.
- Derived tables make two-stage aggregation and grain changes explicit.
- A scalar subquery must return at most one row: zero rows give `NULL`, several rows give an error.
- Correlated subqueries are logically per-row; optimisers usually rewrite them as joins, and you can too.
- Chain CTEs into named steps (clean, aggregate, apply rules, present); whether a CTE is computed once depends on the engine.
- Use a temporary table when an intermediate result is reused across statements, needs indexing or must be checked.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "CTEs vs Subqueries vs Temporary Tables"
description: "When to use a common table expression, a subquery or a temporary table in SQL pipelines, with readability, reuse and performance trade-offs explained."
inventoryId: "TECH-03"
technology: ["sql"]
topic: ["ctes", "query-structure"]
difficulty: "Intermediate"
prerequisites: ["articles:sql/aggregations-group-by-having"]
related: ["articles:sql/query-optimization-fundamentals", "interview-questions:sql/remove-duplicate-records"]
previous: "articles:sql/window-functions"
next: "articles:sql/query-optimization-fundamentals"
sources: [{"label": "PostgreSQL documentation: WITH queries (common table expressions)", "url": "https://www.postgresql.org/docs/current/queries-with.html"}]
versionContext: "Standard SQL. Queries verified against sample data on SQLite 3.45 (standard DATE and TIMESTAMP literals were run as plain strings there); materialisation behaviour differs by engine"
---

All three let you break a query into steps. They differ in **scope** (one query or the whole session), **reuse** and how the engine executes them.

| | Subquery | CTE (`WITH`) | Temporary table |
|--|----------|--------------|-----------------|
| Scope | Inside one statement | One statement | The session (or transaction) |
| Readable top-to-bottom | Less | Yes | Yes |
| Reusable across statements | No | No | Yes |
| Can be indexed | No | No | Yes, in most engines |
| Recursion | No | Yes (`WITH RECURSIVE`) | No |

## Subquery

```sql
SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
```

Good for a small, single-use calculation. Deeply nested subqueries become hard to read and debug.

## Common table expression

```sql
WITH dept_avg AS (
  SELECT dept, AVG(salary) AS avg_salary
  FROM employees
  GROUP BY dept
),
above AS (
  SELECT e.name, e.dept, e.salary
  FROM employees e
  JOIN dept_avg d ON d.dept = e.dept
  WHERE e.salary > d.avg_salary
)
SELECT * FROM above ORDER BY dept, name;
```

Each step has a name, reads top to bottom and can be tested by selecting from it directly. This is why transformation tools such as dbt are built around CTE-style models.

### Recursive CTEs

A recursive CTE can walk hierarchies (org charts, category trees) or generate sequences:

```sql
WITH RECURSIVE numbers(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM numbers WHERE n < 5
)
SELECT n FROM numbers;   -- 1, 2, 3, 4, 5
```

Always include a stopping condition.

## Temporary table

```sql
CREATE TEMPORARY TABLE recent_orders AS
SELECT * FROM orders WHERE order_date >= DATE '2026-09-01';

-- reuse it in several statements
SELECT COUNT(*) FROM recent_orders;
SELECT customer_id, SUM(amount) FROM recent_orders GROUP BY customer_id;
```

Use one when an intermediate result is **expensive and used several times**, or when you want to index it or check its row count before continuing.

## Performance: does a CTE run once?

It depends on the engine. Some engines inline a CTE into the main query like a subquery; others may compute (materialise) it once. Some let you choose (PostgreSQL has `MATERIALIZED` / `NOT MATERIALIZED`). Do not assume a CTE referenced twice is computed only once. Check the query plan. If you need a guaranteed single computation, use a temporary table.

<Callout tone="info" title="Readability is the default reason">

Choose CTEs for clarity first. Reach for a temporary table when the plan shows repeated expensive work or when the result is reused across statements.

</Callout>

## Common mistakes

1. Nesting subqueries three or four levels deep instead of naming steps.
2. Assuming CTEs are always faster or always cached.
3. Forgetting that a temporary table disappears at the end of the session.
4. Writing a recursive CTE without a termination condition.

## Interview relevance

Interviewers ask "CTE versus subquery?" to test whether you think about readability and execution, not just syntax. Mention scope, reuse and engine-specific materialisation.

## Key takeaway

Use CTEs to make multi-step logic readable, subqueries for small one-off values, and temporary tables when an expensive result is reused or needs indexing.

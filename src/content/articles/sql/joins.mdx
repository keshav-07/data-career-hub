---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "SQL Joins Explained for Data Engineers"
description: "Understand INNER, LEFT, FULL and CROSS joins, why row counts change after a join, and the filtering mistakes that silently break pipeline results."
inventoryId: "TECH-01"
technology: ["sql"]
topic: ["joins"]
difficulty: "Beginner"
featured: false
related: ["interview-questions:sql/window-functions-vs-group-by"]
next: "articles:sql/window-functions"
sources: [{"label": "PostgreSQL documentation: Joins Between Tables", "url": "https://www.postgresql.org/docs/current/tutorial-join.html"}]
versionContext: "Examples run on standard SQL; tested with SQLite 3.45"
---

A join combines rows from two tables based on a condition. In Data Engineering the real skill is predicting **how many rows come out**, because a join that quietly duplicates or drops rows is one of the most common causes of wrong numbers in a pipeline.

## The sample data

```sql
CREATE TABLE customers (customer_id INT, name TEXT);
CREATE TABLE orders (order_id INT, customer_id INT, amount INT);

INSERT INTO customers VALUES (1, 'Asha'), (2, 'Ben'), (3, 'Chen');
INSERT INTO orders VALUES (10, 1, 50), (11, 1, 70), (12, 2, 20), (13, 9, 99);
```

Chen has no orders, and order 13 refers to a customer that does not exist.

## INNER JOIN: only matching rows

```sql
SELECT c.name, o.order_id, o.amount
FROM customers c
INNER JOIN orders o ON o.customer_id = c.customer_id;
```

| name | order_id | amount |
|------|----------|--------|
| Asha | 10 | 50 |
| Asha | 11 | 70 |
| Ben  | 12 | 20 |

Chen (no orders) and order 13 (no customer) are both gone. Asha appears twice because she has two orders: a **one-to-many** join returns one output row per matching pair.

## LEFT JOIN: keep every row from the left table

```sql
SELECT c.name, o.order_id, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id;
```

Chen now appears with `NULL` for `order_id` and `amount`. Use a left join when the left table is the set you must not lose, such as "all customers, with their orders if any".

## FULL OUTER JOIN and CROSS JOIN

A **full outer join** keeps unmatched rows from both sides, which is useful for reconciliation: which records exist in one system but not the other? A **cross join** pairs every row with every row, producing `rows(a) × rows(b)` output rows. It is useful for generating combinations such as dates × products, and dangerous when it happens by accident.

## Three mistakes that break pipelines

<Callout tone="warning" title="Filtering the right table in WHERE turns a LEFT JOIN into an INNER JOIN">

```sql
-- Drops customers with no orders, because NULL > 0 is not true
SELECT c.name, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.amount > 0;
```

Put conditions on the right table in the `ON` clause to keep the left-join behaviour:
`LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.amount > 0`.

</Callout>

1. **Fan-out.** Joining on a non-unique key multiplies rows. If you then `SUM` a column from the "one" side, it is counted once per matching row. Always check the key is unique on the side you expect.
2. **NULL keys never match.** `NULL = NULL` is not true, so rows with a `NULL` join key are dropped by an inner join and unmatched in an outer join.
3. **Joining on the wrong grain.** Joining a daily table to a monthly table without aggregating first repeats the monthly value on every day.

## A quick safety check

Before trusting a join, compare counts:

```sql
SELECT COUNT(*) AS rows_after
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id;
-- returns 4: Asha x2, Ben x1, Chen x1
```

A left join should never return fewer rows than the left table, and returns more only when the right side has multiple matches.

## Finding unmatched rows (anti-join)

```sql
SELECT c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
```

This returns Chen. `NOT EXISTS` is generally safer than `NOT IN`, because `NOT IN` returns no rows at all if the subquery contains a `NULL`.

## Interview relevance

Interviewers use joins to test whether you can reason about row counts. Expect to explain the difference between `INNER` and `LEFT`, predict output size, and spot the `WHERE`-versus-`ON` trap.

## Key takeaway

Before writing a join, decide which table you must not lose, what makes the join key unique on each side, and how many rows you expect out. Then verify with a count.

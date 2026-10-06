---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "SQL Joins: INNER, LEFT, RIGHT, FULL, Self and Cross Joins"
seoTitle: "SQL Joins: INNER, LEFT, FULL, Self and Cross"
description: "Predict the row count of any SQL join: INNER, LEFT, RIGHT and FULL OUTER joins, self joins, cross joins and multi-table joins, plus the filtering and fan-out traps."
inventoryId: "TECH-01"
technology: ["sql"]
topic: ["joins"]
difficulty: "Beginner"
featured: false
learningObjectives:
  - "Predict how many rows an INNER, LEFT, RIGHT, FULL or CROSS join returns"
  - "Keep a LEFT JOIN from turning into an INNER JOIN by placing filters correctly"
  - "Reconcile two datasets with a FULL OUTER JOIN and emulate it where it is missing"
  - "Write self joins for hierarchies and pairs without duplicate or mirrored rows"
  - "Join several tables without fan-out by aggregating to a common grain first"
prerequisites: ["articles:sql/aggregations-group-by-having"]
related: ["articles:pyspark/joins-and-join-strategy", "interview-questions:sql/inner-vs-left-join", "interview-questions:sql/window-functions-vs-group-by"]
previous: "articles:sql/set-operations"
next: "articles:sql/semi-anti-lateral-joins"
sources:
  - { label: "PostgreSQL documentation: Joins between tables (tutorial)", url: "https://www.postgresql.org/docs/16/tutorial-join.html" }
  - { label: "PostgreSQL documentation: Table expressions and joined tables", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
  - { label: "SQL Server documentation: FROM clause plus JOIN, APPLY, PIVOT", url: "https://learn.microsoft.com/en-us/sql/t-sql/queries/from-transact-sql" }
  - { label: "MySQL documentation: JOIN clause", url: "https://dev.mysql.com/doc/refman/8.4/en/join.html" }
versionContext: "Examples run on PostgreSQL 16. The MySQL FULL OUTER JOIN emulation is standard SQL and was run on PostgreSQL; other dialect notes were not executed."
---

A join combines rows from two tables based on a condition. In Data Engineering the real skill is predicting **how many rows come out**, because a join that quietly duplicates or drops rows is one of the most common causes of wrong numbers in a pipeline. This lesson covers every join type you will meet, how each one changes the row count, and the habits that keep multi-table queries correct.

## Sample data

Customers (some referred by other customers), orders, products, order lines and payments. The data has deliberate gaps: Ethan has no orders, order 105 points at a customer that does not exist, and order 106 is a guest checkout with no customer at all.

```sql
CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  country     TEXT NOT NULL,
  referred_by INT                       -- another customer_id, or NULL
);

INSERT INTO customers VALUES
  (1, 'Asha Patel',  'IN', NULL),
  (2, 'Ben Carter',  'GB', 1),
  (3, 'Chen Wei',    'SG', 1),
  (4, 'Diana Lopez', 'US', 2),
  (5, 'Ethan Brown', 'GB', NULL);

CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT,                      -- NULL for guest checkout
  order_date  DATE NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL
);

INSERT INTO orders VALUES
  (101, 1,    '2025-06-01', 120.00),
  (102, 1,    '2025-06-03',  35.50),
  (103, 2,    '2025-06-03',  80.00),
  (104, 3,    '2025-06-04', 220.00),
  (105, 9,    '2025-06-05',  99.00),   -- customer 9 does not exist
  (106, NULL, '2025-06-06',  15.00),   -- guest checkout
  (107, 4,    '2025-06-07',  64.99);

CREATE TABLE products (product_id INT PRIMARY KEY, product_name TEXT, category TEXT);
INSERT INTO products VALUES
  (10, 'Keyboard', 'electronics'), (11, 'Mouse', 'electronics'),
  (12, 'Notebook', 'stationery'),  (13, 'Desk',  'furniture'),
  (14, 'Monitor',  'electronics');

CREATE TABLE order_items (order_id INT, product_id INT, quantity INT);
INSERT INTO order_items VALUES
  (101, 10, 1), (101, 11, 2), (102, 12, 1), (103, 12, 4), (104, 13, 1), (107, 11, 1);

CREATE TABLE payments (order_id INT, paid_amount NUMERIC(10, 2));
INSERT INTO payments VALUES (101, 100.00), (101, 20.00), (102, 35.50), (104, 220.00);
```

## INNER JOIN basics

An `INNER JOIN` returns one row for every pair of rows, one from each table, for which the join condition is true. Rows with no partner on the other side are dropped from both sides.

```sql
SELECT c.full_name, o.order_id, o.amount
FROM customers c
INNER JOIN orders o ON o.customer_id = c.customer_id
ORDER BY o.order_id;
```

| full_name | order_id | amount |
|---|---|---|
| Asha Patel | 101 | 120.00 |
| Asha Patel | 102 | 35.50 |
| Ben Carter | 103 | 80.00 |
| Chen Wei | 104 | 220.00 |
| Diana Lopez | 107 | 64.99 |

### How it works

- **Row count**: each customer row is repeated once per matching order. Asha has two orders, so she appears twice. This is a **one-to-many** join, and the output has the grain of the "many" side.
- **Unmatched rows disappear**: Ethan (no orders), order 105 (unknown customer) and order 106 (`NULL` customer) are all missing. Seven orders went in, five came out.
- **`NULL` keys never match**: `NULL = NULL` is unknown, so a row with a `NULL` key cannot pair with anything, not even another `NULL`.
- `JOIN` on its own means `INNER JOIN`.
- `USING (customer_id)` is shorthand for `ON a.customer_id = b.customer_id` when the columns share a name, and outputs the column once. `NATURAL JOIN` joins on every same-named column; avoid it, because adding an unrelated column such as `updated_at` to both tables silently changes the join.
- The old comma syntax, `FROM customers c, orders o WHERE o.customer_id = c.customer_id`, is an inner join too. Forgetting the `WHERE` makes it a cartesian product, which is one reason explicit `JOIN ... ON` is preferred.

### Fan-out: joining on a key that is not unique

If the key is not unique on **either** side, rows multiply. Joining orders to order lines repeats each order once per line, and any order-level value is repeated with it:

```sql
SELECT o.order_id, o.amount, oi.product_id, oi.quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.order_id = 101;
```

| order_id | amount | product_id | quantity |
|---|---|---|---|
| 101 | 120.00 | 10 | 1 |
| 101 | 120.00 | 11 | 2 |

`SUM(o.amount)` over this result would give 240.00 for an order worth 120.00. Before every join, ask: **is the key unique on the side I expect?** If not, decide whether the multiplication is what you want.

### Pitfalls

- Assuming a dimension key is unique when the dimension contains duplicates (for example two current rows for one customer in a slowly changing dimension). Every fact row then doubles.
- Joining on columns of different types or formats (`'001'` versus `1`, trailing spaces), so nothing matches and rows silently vanish.
- Joining on a nullable key and losing the `NULL` rows without noticing.

### In interviews

The classic question gives two small tables and asks for the output of an inner join. Count matches per key: output rows = sum over keys of (left rows with key × right rows with key). Mention dropped unmatched rows and `NULL` keys. If a key appears 3 times on the left and 2 times on the right, it contributes 6 rows.

## LEFT JOIN basics

A `LEFT JOIN` (or `LEFT OUTER JOIN`) returns every row from the left table. Where a left row has matches, you get one row per match, as with an inner join. Where it has none, you get the left row once, with `NULL` in every right-hand column.

```sql
SELECT c.full_name, o.order_id, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
ORDER BY c.customer_id, o.order_id;
```

| full_name | order_id | amount |
|---|---|---|
| Asha Patel | 101 | 120.00 |
| Asha Patel | 102 | 35.50 |
| Ben Carter | 103 | 80.00 |
| Chen Wei | 104 | 220.00 |
| Diana Lopez | 107 | 64.99 |
| Ethan Brown | NULL | NULL |

Use a left join when the left table is the set you must not lose: "all customers, with their orders if any". A left join never returns fewer rows than the left table, and returns more only when the right side has several matches for a key.

### The WHERE versus ON trap

> **Warning: a filter on the right table in `WHERE` turns a LEFT JOIN into an INNER JOIN.** The `WHERE` clause runs after the join, and for unmatched rows the right-hand columns are `NULL`, so any condition on them is unknown and the row is dropped.

```sql
-- Intended: every customer, with their orders over 50 if any
SELECT c.full_name, o.order_id, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.amount > 50
ORDER BY c.customer_id;
```

| full_name | order_id | amount |
|---|---|---|
| Asha Patel | 101 | 120.00 |
| Ben Carter | 103 | 80.00 |
| Chen Wei | 104 | 220.00 |
| Diana Lopez | 107 | 64.99 |

Ethan has vanished. Move the condition into `ON`, so it limits which right rows can match without removing left rows:

```sql
SELECT c.full_name, o.order_id, o.amount
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.customer_id
 AND o.amount > 50
ORDER BY c.customer_id, o.order_id;
```

| full_name | order_id | amount |
|---|---|---|
| Asha Patel | 101 | 120.00 |
| Ben Carter | 103 | 80.00 |
| Chen Wei | 104 | 220.00 |
| Diana Lopez | 107 | 64.99 |
| Ethan Brown | NULL | NULL |

The rule: conditions on the **left** table that should remove left rows go in `WHERE`; conditions on the **right** table go in `ON`. The one deliberate exception is `WHERE o.order_id IS NULL`, which keeps only unmatched left rows. That is the anti-join pattern, covered in the next lesson.

### A quick safety check

Before trusting a left join, compare counts:

```sql
SELECT (SELECT COUNT(*) FROM customers) AS customers,
       COUNT(*)                         AS rows_after_join,
       COUNT(DISTINCT c.customer_id)    AS customers_after_join
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id;
```

| customers | rows_after_join | customers_after_join |
|---|---|---|
| 5 | 6 | 5 |

Rows after the join can exceed the left count (fan-out), but distinct left keys must equal it. If they do not, a filter has removed left rows.

### Pitfalls

- Filtering the right table in `WHERE`, as above.
- Counting matches with `COUNT(*)`, which counts the unmatched row as 1; use `COUNT(o.order_id)`.
- Summing a right-hand column and getting `NULL` instead of 0 for unmatched rows; wrap it in `COALESCE`.

### In interviews

"What is the difference between `INNER JOIN` and `LEFT JOIN`?" is the most common join question. A strong answer covers which rows survive, the `NULL`s for non-matches, the `WHERE` versus `ON` trap with a one-line example, and how row counts behave. The practice page [INNER vs LEFT JOIN](/interview/sql/inner-vs-left-join/) has a worked version.

## RIGHT JOIN and FULL OUTER JOIN

A `RIGHT JOIN` is a left join with the tables swapped: every row from the **right** table is kept. A `FULL OUTER JOIN` keeps unmatched rows from **both** sides.

### RIGHT JOIN

```sql
SELECT o.order_id, o.customer_id, c.full_name
FROM customers c
RIGHT JOIN orders o ON o.customer_id = c.customer_id
ORDER BY o.order_id;
```

| order_id | customer_id | full_name |
|---|---|---|
| 101 | 1 | Asha Patel |
| 102 | 1 | Asha Patel |
| 103 | 2 | Ben Carter |
| 104 | 3 | Chen Wei |
| 105 | 9 | NULL |
| 106 | NULL | NULL |
| 107 | 4 | Diana Lopez |

Every order is kept; the orphan and guest orders get `NULL` names. `A RIGHT JOIN B` is identical to `B LEFT JOIN A`, and most teams write only left joins because a query reads more easily when the table you must keep comes first. Right joins appear mainly in generated SQL and in interview questions.

### FULL OUTER JOIN

A full outer join returns matched pairs, plus unmatched left rows (with `NULL`s on the right), plus unmatched right rows (with `NULL`s on the left). It is the natural tool for **reconciliation**: what exists in one dataset but not the other?

```sql
SELECT COALESCE(c.customer_id, o.customer_id) AS customer_key,
       c.full_name,
       o.order_id,
       CASE
         WHEN c.customer_id IS NULL THEN 'order without known customer'
         WHEN o.order_id IS NULL    THEN 'customer without orders'
         ELSE 'matched'
       END AS match_status
FROM customers c
FULL OUTER JOIN orders o ON o.customer_id = c.customer_id
ORDER BY customer_key NULLS LAST, o.order_id;
```

| customer_key | full_name | order_id | match_status |
|---|---|---|---|
| 1 | Asha Patel | 101 | matched |
| 1 | Asha Patel | 102 | matched |
| 2 | Ben Carter | 103 | matched |
| 3 | Chen Wei | 104 | matched |
| 4 | Diana Lopez | 107 | matched |
| 5 | Ethan Brown | NULL | customer without orders |
| 9 | NULL | 105 | order without known customer |
| NULL | NULL | 106 | order without known customer |

- The key can be `NULL` on either side, so build a single key with `COALESCE(left.key, right.key)`.
- Row count: matched pairs + unmatched left rows + unmatched right rows (5 + 1 + 2 = 8 here).
- Conditions in `WHERE` on either table filter out unmatched rows from that side; put them in `ON` or in a subquery.

### When FULL OUTER JOIN is missing

MySQL does not support `FULL OUTER JOIN`. Emulate it with a left join plus the right rows that had no match:

```sql
SELECT c.customer_id, c.full_name, o.order_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
UNION ALL
SELECT NULL, NULL, o.order_id
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)
ORDER BY order_id NULLS FIRST;
```

| customer_id | full_name | order_id |
|---|---|---|
| 5 | Ethan Brown | NULL |
| 1 | Asha Patel | 101 |
| 1 | Asha Patel | 102 |
| 2 | Ben Carter | 103 |
| 3 | Chen Wei | 104 |
| NULL | NULL | 105 |
| NULL | NULL | 106 |
| 4 | Diana Lopez | 107 |

Use `UNION ALL` with the anti-join, not `UNION` of a left and a right join: plain `UNION` would also collapse genuine duplicate rows.

### Pitfalls

- Filtering one side in `WHERE`, which silently turns a full join into a left or right join.
- Forgetting `COALESCE` on the key, then grouping or sorting by a column that is `NULL` for half the rows.
- Using a full outer join to compare full rows when `EXCEPT` in both directions would be simpler (see the [set operations lesson](/sql/set-operations/)).

### In interviews

You may be asked for the row count of a full outer join, or how to find records present in only one of two systems. Give the matched + left-only + right-only formula, show the `COALESCE`d key and the status `CASE`, and mention the MySQL emulation.

## Self join patterns

A self join joins a table to itself. It needs two aliases, so SQL can tell the two copies apart. Three patterns cover most uses.

### Pattern 1: parent–child (who referred whom)

Each customer row stores the id of the customer who referred them. Join the table to itself to get the referrer's name:

```sql
SELECT c.full_name AS customer,
       r.full_name AS referred_by
FROM customers c
LEFT JOIN customers r ON r.customer_id = c.referred_by
ORDER BY c.customer_id;
```

| customer | referred_by |
|---|---|
| Asha Patel | NULL |
| Ben Carter | Asha Patel |
| Chen Wei | Asha Patel |
| Diana Lopez | Ben Carter |
| Ethan Brown | NULL |

Use `LEFT JOIN` so customers without a referrer stay in the result. The classic employee/manager question is the same shape. A self join goes up exactly one level; walking the whole chain (Diana to Ben to Asha) needs a recursive CTE, covered in the advanced part of this course.

### Pattern 2: pairs within a group

"Which products are in the same category?" Join products to products on category, and use `a.product_id < b.product_id` so each pair appears once and nothing pairs with itself:

```sql
SELECT a.product_name AS product_a,
       b.product_name AS product_b,
       a.category
FROM products a
JOIN products b
  ON b.category = a.category
 AND a.product_id < b.product_id
ORDER BY a.product_id, b.product_id;
```

| product_a | product_b | category |
|---|---|---|
| Keyboard | Mouse | electronics |
| Keyboard | Monitor | electronics |
| Mouse | Monitor | electronics |

With `<>` instead of `<` you get each pair twice (A–B and B–A); with no inequality you also get A–A.

### Pattern 3: comparing rows within the same entity

Self joins can compare a row with another row of the same customer, for example "orders placed within three days of a previous order by the same customer":

```sql
SELECT o1.customer_id, o1.order_id AS earlier, o2.order_id AS later,
       o2.order_date - o1.order_date AS days_apart
FROM orders o1
JOIN orders o2
  ON o2.customer_id = o1.customer_id
 AND o2.order_date >  o1.order_date
 AND o2.order_date <= o1.order_date + 3;
```

| customer_id | earlier | later | days_apart |
|---|---|---|---|
| 1 | 101 | 102 | 2 |

For "compare with the immediately previous row", `LAG()` from the [window functions lesson](/sql/window-functions/) is simpler and scales better: a self join on a range condition can produce a very large intermediate result for customers with many orders.

### Pitfalls

- Forgetting aliases, or mixing them up in `SELECT`.
- Producing mirrored pairs and self-pairs by using `<>` or no inequality.
- Using an inner self join for hierarchies and losing the top-level rows (those with `NULL` parent).

### In interviews

"Find employees who earn more than their managers" is the canonical self-join question: join employees `e` to employees `m` on `m.id = e.manager_id` and compare salaries. Other variants: pairs of users who share an attribute, and consecutive events. Mention when a window function is the better tool.

## Cross join and cartesian products

A `CROSS JOIN` pairs **every** row of one table with **every** row of the other. The output has rows(A) × rows(B) rows and no join condition. Deliberately used, it builds scaffolds of all combinations. Accidentally triggered, it explodes row counts.

### Deliberate use: a complete grid

Reports often need a row for every combination, even when there was no activity: every product for every day, every store for every hour. Cross join the dimensions, then left join the facts:

```sql
WITH days AS (
  SELECT d::DATE AS order_date
  FROM generate_series(DATE '2025-06-01', DATE '2025-06-03', INTERVAL '1 day') AS g(d)
),
grid AS (
  SELECT d.order_date, p.category
  FROM days d
  CROSS JOIN (SELECT DISTINCT category FROM products) p
)
SELECT g.order_date, g.category, COALESCE(SUM(oi.quantity), 0) AS units
FROM grid g
LEFT JOIN orders o       ON o.order_date = g.order_date
LEFT JOIN order_items oi ON oi.order_id = o.order_id
LEFT JOIN products p     ON p.product_id = oi.product_id AND p.category = g.category
GROUP BY g.order_date, g.category
ORDER BY g.order_date, g.category;
```

| order_date | category | units |
|---|---|---|
| 2025-06-01 | electronics | 3 |
| 2025-06-01 | furniture | 3 |
| 2025-06-01 | stationery | 3 |
| 2025-06-02 | electronics | 0 |
| 2025-06-02 | furniture | 0 |
| 2025-06-02 | stationery | 0 |
| 2025-06-03 | electronics | 5 |
| 2025-06-03 | furniture | 5 |
| 2025-06-03 | stationery | 5 |

That result is wrong: every category shows the same units on a day. The item quantity is summed for every grid row of that date, because only the `products` join checks the category, and a failed `LEFT JOIN` to products does not remove the item row. Aggregate the facts by date and category first, then join them to the grid:

```sql
WITH days AS (
  SELECT d::DATE AS order_date
  FROM generate_series(DATE '2025-06-01', DATE '2025-06-03', INTERVAL '1 day') AS g(d)
),
grid AS (
  SELECT d.order_date, c.category
  FROM days d
  CROSS JOIN (SELECT DISTINCT category FROM products) c
),
daily_units AS (
  SELECT o.order_date, p.category, SUM(oi.quantity) AS units
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.order_id
  JOIN products p     ON p.product_id = oi.product_id
  GROUP BY o.order_date, p.category
)
SELECT g.order_date, g.category, COALESCE(u.units, 0) AS units
FROM grid g
LEFT JOIN daily_units u ON u.order_date = g.order_date AND u.category = g.category
ORDER BY g.order_date, g.category;
```

| order_date | category | units |
|---|---|---|
| 2025-06-01 | electronics | 3 |
| 2025-06-01 | furniture | 0 |
| 2025-06-01 | stationery | 0 |
| 2025-06-02 | electronics | 0 |
| 2025-06-02 | furniture | 0 |
| 2025-06-02 | stationery | 0 |
| 2025-06-03 | electronics | 0 |
| 2025-06-03 | furniture | 0 |
| 2025-06-03 | stationery | 5 |

Three days × three categories gives nine rows, including the zero days that a plain `GROUP BY` would have left out. The second version also shows the safer shape for any grid report: **aggregate the facts to the grid's grain first, then left join once**. `generate_series` is PostgreSQL; the [time-series lesson](/sql/dates-calendars-time-series/) shows calendar tables and other engines' equivalents.

### Accidental cartesian products

- A missing or wrong join condition: `FROM orders o, customers c` with no `WHERE`, or `ON o.customer_id = o.customer_id` (a typo that is always true).
- A join on a low-cardinality column such as `country` or `status` between two large tables, which behaves almost like a cross join.
- A many-to-many join where both sides have many rows per key.

A quick symptom check: if the output has roughly rows(A) × rows(B) rows, or far more rows than either input, look for a missing condition. Spark refuses an implicit cartesian product unless cross joins are enabled or you write `crossJoin` explicitly, because of how expensive they are at scale.

### In interviews

Expect "what does a cross join do and when would you use one?" Give the m × n row count, the scaffold use case (dates × products to fill zeros), and the warning about accidental cartesian products from missing conditions.

## Multi-table joins

Real queries join many tables: orders to customers, order lines to products, products to categories. Each join is applied to the result of the previous ones, so the rules above compound.

```sql
SELECT o.order_id,
       c.full_name,
       p.product_name,
       oi.quantity
FROM orders o
JOIN customers c    ON c.customer_id = o.customer_id
JOIN order_items oi ON oi.order_id   = o.order_id
JOIN products p     ON p.product_id  = oi.product_id
ORDER BY o.order_id, p.product_id;
```

| order_id | full_name | product_name | quantity |
|---|---|---|---|
| 101 | Asha Patel | Keyboard | 1 |
| 101 | Asha Patel | Mouse | 2 |
| 102 | Asha Patel | Notebook | 1 |
| 103 | Ben Carter | Notebook | 4 |
| 104 | Chen Wei | Desk | 1 |
| 107 | Diana Lopez | Mouse | 1 |

The grain of the result is **one row per order line**, because that is the most detailed table in the chain.

### Rule 1: an inner join after a left join can undo it

```sql
SELECT c.full_name, o.order_id, oi.product_id
FROM customers c
LEFT JOIN orders o       ON o.customer_id = c.customer_id
JOIN order_items oi      ON oi.order_id   = o.order_id
WHERE c.customer_id = 5;
```

This returns no rows. Ethan survives the left join with a `NULL` order, but the following inner join needs `oi.order_id = NULL`, which is never true, so he is dropped. Once you left join, keep every later join to that branch a left join (or join the child tables together first in a subquery).

### Rule 2: never join two independent child tables to the same parent directly

Order items and payments both have several rows per order. Join both to orders and every item pairs with every payment:

```sql
SELECT o.order_id,
       SUM(oi.quantity)    AS units_inflated,
       SUM(pay.paid_amount) AS paid_inflated
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN payments pay   ON pay.order_id = o.order_id
WHERE o.order_id = 101
GROUP BY o.order_id;
```

| order_id | units_inflated | paid_inflated |
|---|---|---|
| 101 | 6 | 240.00 |

Order 101 has 3 units and was paid 120.00, but two items × two payments made four rows. Aggregate each child to the parent's grain first, then join:

```sql
WITH items AS (
  SELECT order_id, SUM(quantity) AS units FROM order_items GROUP BY order_id
),
paid AS (
  SELECT order_id, SUM(paid_amount) AS paid FROM payments GROUP BY order_id
)
SELECT o.order_id, o.amount,
       COALESCE(i.units, 0) AS units,
       COALESCE(p.paid, 0)  AS paid
FROM orders o
LEFT JOIN items i ON i.order_id = o.order_id
LEFT JOIN paid p  ON p.order_id = o.order_id
ORDER BY o.order_id;
```

| order_id | amount | units | paid |
|---|---|---|---|
| 101 | 120.00 | 3 | 120.00 |
| 102 | 35.50 | 1 | 35.50 |
| 103 | 80.00 | 4 | 0 |
| 104 | 220.00 | 1 | 220.00 |
| 105 | 99.00 | 0 | 0 |
| 106 | 15.00 | 0 | 0 |
| 107 | 64.99 | 1 | 0 |

### Rule 3: join at the right grain

Joining a daily table to a monthly target table without aggregating first repeats the monthly value on every day, and summing it then multiplies the target by the number of days. Bring both sides to the same grain (or join on the month and do not sum the monthly column).

### How engines execute joins

You do not choose the algorithm in SQL, but knowing them helps you read plans and answer follow-up questions:

| Algorithm | Good when |
|---|---|
| Nested loop | One side is tiny, or there is an index on the inner side's key |
| Hash join | Equality joins on large unsorted inputs; builds a hash table on the smaller side |
| Merge join | Both inputs already sorted on the key |
| Broadcast join (distributed engines) | One side is small enough to copy to every worker, avoiding a shuffle |

The [PySpark joins lesson](/pyspark/joins-and-join-strategy/) and [query optimisation](/sql/query-optimization-fundamentals/) go deeper.

### Pitfalls

- Inner joins after left joins removing the rows the left join kept.
- Two one-to-many joins from the same parent (fan-out squared).
- Not knowing the grain of the final result.
- Ambiguous column names: always qualify columns with an alias in multi-table queries.

### In interviews

Multi-table questions test whether you can keep the grain in your head. State the grain before writing, choose `LEFT` versus `INNER` per join deliberately, and aggregate child tables before joining them to a shared parent. When asked to debug "revenue doubled", look for a second one-to-many join.

## Practice questions

<details><summary>Table A has keys 1, 1, 2, NULL. Table B has keys 1, 1, 1, 3, NULL. How many rows do INNER, LEFT and FULL OUTER joins on the key return?</summary>

Inner: key 1 gives 2 × 3 = 6 rows; key 2 has no match and `NULL`s never match, so 6. Left: the 6 matches plus unmatched left rows 2 and `NULL`, so 8. Full outer: the 8 left-join rows plus unmatched right rows 3 and `NULL`, so 10.

</details>

<details><summary>Why does this query return fewer customers than the customers table: SELECT ... FROM customers c LEFT JOIN orders o ON ... WHERE o.status = 'delivered'?</summary>

For customers with no orders, or no delivered orders after the join, `o.status` is `NULL`, so the `WHERE` condition is unknown and those rows are removed: the left join behaves like an inner join. Move the condition into the `ON` clause (`ON o.customer_id = c.customer_id AND o.status = 'delivered'`).

</details>

<details><summary>Find employees who earn more than their manager, given employees(id, name, salary, manager_id).</summary>

```
SELECT e.name
FROM employees e
JOIN employees m ON m.id = e.manager_id
WHERE e.salary > m.salary;
```

An inner self join is correct here, because employees without a manager cannot earn more than one.

</details>

<details><summary>How would you produce a report with a row for every store and every day of the month, showing 0 when a store had no sales?</summary>

Build the grid with a cross join of the store list and a calendar (a calendar table or `generate_series`), aggregate sales to store and day separately, then left join the aggregate to the grid and `COALESCE` the measure to 0. Aggregating before the left join avoids fan-out and keeps the grid at one row per store per day.

</details>

<details><summary>MySQL has no FULL OUTER JOIN. How do you emulate it?</summary>

Take the left join of A to B, then `UNION ALL` the rows of B that have no match in A (selected with `NOT EXISTS` or a `LEFT JOIN ... WHERE a.key IS NULL`), filling A's columns with `NULL`. Avoid `UNION` of a left and a right join, which would merge genuine duplicate rows.

</details>

<details><summary>After adding a join to a payments table, total units sold per order doubled. What happened?</summary>

The query already joined order lines to orders, and payments is another one-to-many child of orders. Every line was paired with every payment, so an order with two payments counts each line twice. Aggregate lines and payments to one row per order separately, then join both aggregates to orders.

</details>

## Key takeaways

- Predict the row count before you run a join: matches multiply, unmatched rows are dropped (inner) or kept with `NULL`s (outer), and `NULL` keys never match.
- `LEFT JOIN` keeps every left row; conditions on the right table belong in `ON`, not `WHERE`.
- `RIGHT JOIN` is a mirrored left join; `FULL OUTER JOIN` keeps both sides and suits reconciliation, with a `COALESCE`d key.
- Self joins need two aliases; use `a.id < b.id` for unique pairs and a left join for hierarchies.
- Cross joins return m × n rows: use them on purpose for scaffolds and watch for accidental ones.
- In multi-table joins, keep left-join branches left, aggregate child tables to the parent grain before joining, and state the grain of the result.

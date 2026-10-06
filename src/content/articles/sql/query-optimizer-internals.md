---
title: "Inside the Query Optimizer: Join Algorithms, Statistics and Memory"
seoTitle: "Query Optimizer: Joins, Statistics and Memory"
description: "How the optimiser chooses a plan: nested loop, hash and merge joins, table statistics, cardinality estimation, CTE materialisation and spilling to disk."
technology: ["sql"]
topic: ["query-optimizer", "join-algorithms", "statistics", "performance"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
learningObjectives:
  - "Explain how nested loop, hash and merge joins work, what each costs and when the optimiser picks it"
  - "Describe the statistics an optimiser keeps and how stale statistics produce bad plans"
  - "Estimate cardinality the way a planner does, and fix misestimates from correlated columns"
  - "Decide when a CTE should be inlined or materialised, in PostgreSQL and in warehouses"
  - "Recognise sorts, hashes and aggregates that spill to disk, and choose a fix"
prerequisites: ["articles:sql/query-optimization-fundamentals", "articles:sql/indexes"]
related: ["articles:pyspark/joins-and-join-strategy", "articles:spark/adaptive-query-execution", "interview-questions:pyspark/broadcast-join"]
previous: "articles:sql/partitioning-materialized-views-storage"
next: "articles:sql/sql-performance-at-scale"
versionContext: "Examples run on PostgreSQL 16.14 with parallel query switched off for readable plans. Plan costs and timings vary by machine; the machine used was heavily loaded, so timings are described only qualitatively. Snowflake, BigQuery and Spark notes were not executed."
sources:
  - { label: "PostgreSQL documentation: Using EXPLAIN", url: "https://www.postgresql.org/docs/current/using-explain.html" }
  - { label: "PostgreSQL documentation: Planner and optimizer", url: "https://www.postgresql.org/docs/current/planner-optimizer.html" }
  - { label: "PostgreSQL 16 documentation: Resource consumption (work_mem)", url: "https://www.postgresql.org/docs/16/runtime-config-resource.html" }
  - { label: "PostgreSQL 16 documentation: WITH queries", url: "https://www.postgresql.org/docs/16/queries-with.html" }
  - { label: "Apache Spark documentation: Performance tuning (join strategy hints)", url: "https://spark.apache.org/docs/latest/sql-performance-tuning.html#join-strategy-hints-for-sql-queries" }
---

The optimiser turns your SQL into a plan by estimating how many rows each step will produce and picking the cheapest combination of access paths, join algorithms and join orders. When it estimates well, you rarely need to think about it; when it estimates badly, a query that should take a second takes an hour. Understanding what it does lets you read plans critically, fix bad estimates and explain performance in interviews. The ideas here apply to PostgreSQL, Snowflake, BigQuery and Spark alike; only the names and knobs differ.

## Sample data

```sql
CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  city        TEXT NOT NULL,
  country     TEXT NOT NULL,
  segment     TEXT NOT NULL
);
INSERT INTO customers
SELECT g,
       (ARRAY['London','Leeds','Mumbai','Pune','Austin','Boston','Lyon','Paris','Kyoto','Osaka'])[1 + g % 10],
       (ARRAY['GB','GB','IN','IN','US','US','FR','FR','JP','JP'])[1 + g % 10],
       CASE WHEN g % 20 = 0 THEN 'enterprise' ELSE 'self-serve' END
FROM generate_series(1, 20000) AS g;

CREATE TABLE orders (
  order_id    BIGINT PRIMARY KEY,
  customer_id INT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL
);
INSERT INTO orders
SELECT g, 1 + (g::bigint * 7919) % 20000, ((g::bigint * 37) % 50000) / 100.0,
       TIMESTAMP '2025-01-01' + (g % 525600) * INTERVAL '1 minute'
FROM generate_series(1, 200000) AS g;
CREATE INDEX orders_customer_idx ON orders (customer_id);
VACUUM ANALYZE customers;
VACUUM ANALYZE orders;
```

Every customer has 10 orders. `city` determines `country` (London is always GB), which matters for estimation later.

## Join algorithms: hash, merge and nested loop

### What they are

Every engine implements a join with one of three basic algorithms. Which is cheapest depends on the input sizes, whether inputs are sorted or indexed, the join condition and the memory available.

| Algorithm | How it works | Cost (roughly) | Best when | Needs |
|---|---|---|---|---|
| Nested loop | For each outer row, find matching inner rows (ideally by index lookup) | outer rows x cost of one inner lookup | Small outer input, indexed inner side; non-equality conditions | Nothing special; any condition |
| Hash join | Build a hash table on the smaller input, then stream the larger one and probe | read both inputs once, plus building the table | Large inputs, equality join, no useful order | Equality condition; memory for the hash table |
| Merge join | Read both inputs sorted on the key and walk them in step | sort costs (if not already sorted) plus one pass | Inputs already sorted (indexes) or output needed in key order | Equality (or range) condition; sorted inputs |

### Nested loop: small outer side, indexed inner side

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT c.city, o.amount
FROM customers c JOIN orders o ON o.customer_id = c.customer_id
WHERE c.customer_id IN (1, 2, 3);
```

```text
 Nested Loop  (cost=4.66..143.29 rows=30 width=12) (actual rows=30 loops=1)
   ->  Index Scan using customers_pkey on customers c  (cost=0.29..16.92 rows=3 width=10) (actual rows=3 loops=1)
         Index Cond: (customer_id = ANY ('{1,2,3}'::integer[]))
   ->  Bitmap Heap Scan on orders o  (cost=4.37..42.02 rows=10 width=10) (actual rows=10 loops=3)
         Recheck Cond: (c.customer_id = customer_id)
         ->  Bitmap Index Scan on orders_customer_idx  (cost=0.00..4.37 rows=10 width=0) (actual rows=10 loops=3)
               Index Cond: (customer_id = c.customer_id)
```

Three outer rows, so the inner index lookup runs three times (`loops=3`). This is the ideal nested loop: tiny outer input, cheap inner lookups, and the first row comes back immediately. Nested loops are also the only option for conditions such as `ON a.ts BETWEEN b.start AND b.end` without special support.

### Hash join: large inputs, equality

Join all 200,000 orders to their customers and aggregate by country:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN SELECT c.country, SUM(o.amount)
FROM customers c JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.country;
```

```text
 HashAggregate  (cost=5582.11..5582.17 rows=5 width=35)
   Group Key: c.country
   ->  Hash Join  (cost=586.00..4582.11 rows=200000 width=9)
         Hash Cond: (o.customer_id = c.customer_id)
         ->  Seq Scan on orders o  (cost=0.00..3471.00 rows=200000 width=10)
         ->  Hash  (cost=336.00..336.00 rows=20000 width=7)
               ->  Seq Scan on customers c  (cost=0.00..336.00 rows=20000 width=7)
```

The planner builds the hash table on the smaller input (`customers`, under the `Hash` node) and probes it once per order. Each input is read exactly once.

### Forcing the alternatives

PostgreSQL's `enable_*` settings make an algorithm look prohibitively expensive, which is a useful way to see what the planner rejected. They are for experiments, not production.

```sql
SET max_parallel_workers_per_gather = 0;
SET enable_hashjoin = off;
EXPLAIN SELECT c.country, SUM(o.amount)
FROM customers c JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.country;
SET enable_mergejoin = off;
SET enable_memoize = off;
EXPLAIN SELECT c.country, SUM(o.amount)
FROM customers c JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.country;
```

```text
-- hash join disabled: merge join over two index scans (both already sorted by customer_id)
 HashAggregate  (cost=14029.58..14029.64 rows=5 width=35)
   ->  Merge Join  (cost=0.58..13029.58 rows=200000 width=9)
         Merge Cond: (c.customer_id = o.customer_id)
         ->  Index Scan using customers_pkey on customers c  (cost=0.29..667.29 rows=20000 width=7)
         ->  Index Scan using orders_customer_idx on orders o  (cost=0.29..9812.29 rows=200000 width=10)

-- hash and merge disabled: nested loop with 20,000 index lookups
 HashAggregate  (cost=19548.00..19548.06 rows=5 width=35)
   ->  Nested Loop  (cost=0.29..18548.00 rows=200000 width=9)
         ->  Seq Scan on customers c  (cost=0.00..336.00 rows=20000 width=7)
         ->  Index Scan using orders_customer_idx on orders o  (cost=0.29..0.81 rows=10 width=10)
               Index Cond: (customer_id = c.customer_id)
```

Estimated costs: hash 4,582, merge 13,030, nested loop 18,548 for the join node. In repeated `EXPLAIN ANALYZE` runs on this machine the hash join was consistently the fastest of the three, matching the planner's ranking. The merge join avoids sorting only because both indexes deliver rows in `customer_id` order; reading 200,000 orders through an index in key order means random heap access, which is why it costs more than a sequential scan plus hash.

PostgreSQL 14+ can also put a **Memoize** node on the inner side of a nested loop, caching results for repeated keys; that is why `enable_memoize` was switched off above to show the plain nested loop.

### Distributed engines

The same algorithms appear with a distribution step in front:

- **Broadcast hash join**: copy the small table to every worker, then hash join locally, so the large table never moves. Spark broadcasts tables below `spark.sql.autoBroadcastJoinThreshold` (10 MB by default) or when hinted with `/*+ BROADCAST(t) */`.
- **Shuffle hash join** and **sort-merge join**: repartition both sides by the join key over the network, then join each partition. Sort-merge is Spark's default for two large tables.
- **Nested loop / cartesian**: used for non-equality joins; dangerous at scale.

Snowflake and BigQuery choose between broadcast and repartitioned joins automatically; their query profiles show which one ran.

### Pitfalls

- **Nested loop chosen because of an underestimate.** The planner expected 1 outer row and got 100,000. This is the most common cause of a sudden slow query; see cardinality estimation below.
- **Hash join that spills** because the build side was underestimated or memory is small (`Batches` greater than 1).
- **Disabling join types globally** to "fix" one query. Fix the estimate, the statistics or the query instead.
- **Joining on expressions or mismatched types**, which can rule out hash or merge joins and indexes.

### In interviews

"Explain hash, merge and nested loop joins" is a staple, often followed by "which one would the database choose here and why?". Describe each in two sentences, give the conditions under which it wins, and then mention the distributed variants (broadcast versus shuffle). Tying a bad nested loop to a cardinality underestimate shows you have debugged real plans.

## Statistics and the optimizer

### What it is

A cost-based optimiser cannot run every candidate plan, so it predicts their cost from **statistics** about the data. Typical statistics:

- table size in rows and pages;
- per column: fraction of NULLs, number of distinct values, the most common values and their frequencies, a histogram of the remaining values, average width, and the correlation between value order and physical order;
- optionally, multi-column statistics.

### Looking at statistics in PostgreSQL

`ANALYZE` (run automatically by autovacuum, and manually after big loads) samples the table and stores the results in `pg_stats`:

```sql
SELECT attname, n_distinct, null_frac, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'customers' AND attname IN ('city', 'segment')
ORDER BY attname;
```

| attname | n_distinct | null_frac | most_common_vals | most_common_freqs |
|---|---|---|---|---|
| city | 10 | 0 | {Austin,Boston,Kyoto,Leeds,London,Lyon,Mumbai,Osaka,Paris,Pune} | {0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1} |
| segment | 2 | 0 | {self-serve,enterprise} | {0.95,0.05} |

The sample size and list lengths are controlled by `default_statistics_target` (100 by default in PostgreSQL 16), and can be raised per column with `ALTER TABLE ... ALTER COLUMN ... SET STATISTICS` for skewed columns.

### What stale statistics do

A typical pipeline pattern: load a table, analyse it, then load much more data before querying. Autovacuum is disabled on this table to mimic the window before it catches up.

```sql
CREATE TABLE daily_load (order_id BIGINT, customer_id INT, amount NUMERIC(10,2), load_date DATE)
  WITH (autovacuum_enabled = false);
INSERT INTO daily_load
SELECT g, 1 + g % 20000, 10, DATE '2026-10-01' FROM generate_series(1, 50000) AS g;
ANALYZE daily_load;
INSERT INTO daily_load
SELECT g, 1 + g % 20000, 10, DATE '2026-10-02' FROM generate_series(50001, 150000) AS g;
```

The statistics say every row has `load_date = 2026-10-01`. Query the new day:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT c.segment, count(*)
FROM daily_load d JOIN customers c ON c.customer_id = d.customer_id
WHERE d.load_date = DATE '2026-10-02'
GROUP BY c.segment;
```

```text
 GroupAggregate  (cost=2837.35..2837.37 rows=1 width=19) (actual rows=2 loops=1)
   ->  Sort  (cost=2837.35..2837.36 rows=1 width=11) (actual rows=100000 loops=1)
         Sort Method: external merge  Disk: 1480kB
         ->  Nested Loop  (cost=0.29..2837.34 rows=1 width=11) (actual rows=100000 loops=1)
               ->  Seq Scan on daily_load d  (cost=0.00..2829.04 rows=1 width=4) (actual rows=100000 loops=1)
                     Filter: (load_date = '2026-10-02'::date)
               ->  Index Scan using customers_pkey on customers c  (cost=0.29..8.30 rows=1 width=15) (actual rows=1 loops=100000)
```

Estimated 1 row, actual 100,000. Planned for one row, the query does 100,000 index lookups and a sort that spills to disk. After refreshing the statistics:

```sql
SET max_parallel_workers_per_gather = 0;
ANALYZE daily_load;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT c.segment, count(*)
FROM daily_load d JOIN customers c ON c.customer_id = d.customer_id
WHERE d.load_date = DATE '2026-10-02'
GROUP BY c.segment;
```

```text
 HashAggregate  (cost=4177.92..4177.94 rows=2 width=19) (actual rows=2 loops=1)
   Batches: 1  Memory Usage: 24kB
   ->  Hash Join  (cost=586.00..3678.99 rows=99785 width=11) (actual rows=100000 loops=1)
         Hash Cond: (d.customer_id = c.customer_id)
         ->  Seq Scan on daily_load d  (cost=0.00..2831.00 rows=99785 width=4) (actual rows=100000 loops=1)
         ->  Hash  (cost=336.00..336.00 rows=20000 width=15) (actual rows=20000 loops=1)
```

The estimate is now 99,785 and the plan is a hash join with an in-memory aggregate. In timed runs the stale plan was several times slower. On bigger tables the gap is far larger, because the nested loop's cost grows with the misestimate. The fix in pipelines is simple: **run `ANALYZE` on a table after loading it and before querying it** in the same job, rather than waiting for autovacuum.

### Statistics in other engines

- **Snowflake** keeps metadata (row counts, min/max and distinct counts per micro-partition) up to date automatically as part of every write; there is no `ANALYZE`.
- **BigQuery** manages statistics internally and adapts execution dynamically between stages.
- **Spark** uses `ANALYZE TABLE t COMPUTE STATISTICS [FOR COLUMNS ...]` for its cost-based optimiser, and Adaptive Query Execution re-plans at stage boundaries using the actual sizes of shuffled data, which corrects many bad estimates at run time.

### Pitfalls

- Bulk loads, truncate-and-reload and temporary tables (PostgreSQL never auto-analyses temporary tables) leave statistics stale or empty.
- Very skewed columns need a larger statistics target so that the heavy values appear in the most-common list.
- Statistics describe columns independently unless you add extended statistics (next section).

### In interviews

"A query was fast yesterday and is slow today with no code change. Why?" Data volume or distribution changed and statistics did not keep up (or a parameter value hits a skewed key). Show how you would confirm it (estimated versus actual rows in `EXPLAIN ANALYZE`, `last_analyze` and `n_mod_since_analyze` in `pg_stat_user_tables`) and fix it (`ANALYZE` in the pipeline, a larger statistics target, extended statistics).

## Cardinality estimation

### What it is

**Cardinality estimation** is predicting how many rows each operator will output. Every other decision (index or scan, join algorithm, join order, memory) is based on these numbers, so errors multiply as they flow up the plan. It is widely considered the weakest part of query optimisers.

### How a planner estimates

Simplified versions of the standard formulas:

- `col = constant`: the value's frequency if it is in the most-common-values list, otherwise the remaining frequency divided among the other distinct values.
- `col < constant`: the fraction of the histogram below the constant.
- `A AND B`: selectivity(A) x selectivity(B), **assuming independence**.
- `A OR B`: s(A) + s(B) - s(A) x s(B).
- Equality join `R.x = S.y`: rows(R) x rows(S) / max(distinct(R.x), distinct(S.y)).
- `GROUP BY a, b`: roughly distinct(a) x distinct(b), capped by the input row count.

### Where it goes wrong: correlated columns

City and country are perfectly correlated in the sample data, but the planner multiplies their selectivities:

```sql
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM customers WHERE city = 'London' AND country = 'GB';
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT city, country, count(*) FROM customers GROUP BY city, country;
```

```text
 Seq Scan on customers  (cost=0.00..436.00 rows=400 width=24) (actual rows=2000 loops=1)
   Filter: ((city = 'London'::text) AND (country = 'GB'::text))

 HashAggregate  (cost=486.00..486.50 rows=50 width=17) (actual rows=10 loops=1)
   Group Key: city, country
```

`city = 'London'` is 10% and `country = 'GB'` is 20%, so the planner estimates 20,000 x 0.1 x 0.2 = 400 rows; the truth is 2,000, because every London row is also GB. The group count is estimated as 10 x 5 = 50 instead of 10. PostgreSQL's **extended statistics** capture such dependencies:

```sql
CREATE STATISTICS customers_city_country (dependencies, ndistinct, mcv)
  ON city, country FROM customers;
ANALYZE customers;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM customers WHERE city = 'London' AND country = 'GB';
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT city, country, count(*) FROM customers GROUP BY city, country;
```

```text
 Seq Scan on customers  (cost=0.00..436.00 rows=2000 width=24) (actual rows=2000 loops=1)
 HashAggregate  (cost=486.00..486.10 rows=10 width=17) (actual rows=10 loops=1)
```

Both estimates are now exact. A 5x error on a single table is harmless here, but the same error on the outer side of a join decides between a nested loop and a hash join.

### Other common sources of misestimates

| Cause | Example | Mitigation |
|---|---|---|
| Functions and expressions | `WHERE lower(email) = ...`, `WHERE amount * 1.2 > 100` | Rewrite sargably; expression index (which gets its own statistics) |
| Correlated predicates | city and country, product and category | Extended statistics; denormalised flags |
| Stale or missing statistics | after bulk loads, temporary tables | `ANALYZE` in the pipeline |
| Skewed values with generic plans | prepared statement planned for an average value | Custom plans, or separate queries for heavy keys |
| Multi-join queries | errors compound through each join | Break into steps with materialised intermediate results |
| Opaque functions and JSON paths | `WHERE payload->>'type' = 'x'` | Extract into typed columns; expression statistics |

### Diagnosing

Compare `rows=` (estimate) with `actual rows=` x `loops` at every node of `EXPLAIN ANALYZE`, starting from the leaves. The first node where they diverge by an order of magnitude is usually the root cause; everything above it is a consequence.

### Pitfalls

- Fixing the symptom (forcing a join type or adding a hint) instead of the estimate.
- Forgetting loops: `rows=10 loops=1000` is 10,000 rows.
- Assuming warehouses do not have this problem. Exploding joins in Snowflake or skewed shuffles in Spark are often estimation problems too; Spark's AQE exists largely to correct them at run time.

### In interviews

Being asked to read a plan where the estimate is 1 and the actual is 1,000,000 is common for senior roles. Explain how estimates are formed (statistics, independence assumption), name the likely cause, and propose the fix at the source: fresh statistics, extended statistics, a rewrite or a materialised intermediate step.

## CTE materialization trade-offs

### What it is

A common table expression can be executed in two ways:

- **Inlined**: the CTE is substituted into the main query like a subquery, so the optimiser can push filters into it, use indexes and reorder joins across it.
- **Materialised**: the CTE is computed once into a temporary result, which the main query then reads. This avoids recomputing a CTE that is referenced several times, and acts as an "optimisation fence": nothing is pushed through it.

### PostgreSQL behaviour

Since PostgreSQL 12, a non-recursive, side-effect-free CTE referenced **once** is inlined by default; a CTE referenced **more than once** is materialised by default. You can override either with `MATERIALIZED` or `NOT MATERIALIZED`. (Before version 12 every CTE was materialised, which is why older advice calls CTEs an optimisation fence.)

```sql
EXPLAIN WITH recent AS (SELECT customer_id, amount FROM orders)
SELECT count(*) FROM recent WHERE customer_id = 42;
EXPLAIN WITH recent AS MATERIALIZED (SELECT customer_id, amount FROM orders)
SELECT count(*) FROM recent WHERE customer_id = 42;
```

```text
-- inlined: the filter reaches the index
 Aggregate  (cost=4.50..4.50 rows=1 width=8)
   ->  Index Only Scan using orders_customer_idx on orders  (cost=0.29..4.47 rows=10 width=0)
         Index Cond: (customer_id = 42)

-- materialised: all 200,000 rows are computed, then filtered
 Aggregate  (cost=7973.50..7973.51 rows=1 width=8)
   CTE recent
     ->  Seq Scan on orders  (cost=0.00..3471.00 rows=200000 width=10)
   ->  CTE Scan on recent  (cost=0.00..4500.00 rows=1000 width=0)
         Filter: (customer_id = 42)
```

The cost goes from under 5 to nearly 8,000. Note also the estimate on the `CTE Scan`: 1,000 rows, a default guess, because the planner has no statistics for a materialised CTE's output.

Materialisation is the right choice when an expensive CTE is used several times:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN WITH totals AS (
  SELECT customer_id, sum(amount) AS total FROM orders GROUP BY customer_id
)
SELECT (SELECT max(total) FROM totals) AS max_total,
       (SELECT avg(total) FROM totals) AS avg_total;
```

```text
 Result  (cost=5618.95..5618.96 rows=1 width=64)
   CTE totals
     ->  HashAggregate  (cost=4471.00..4720.55 rows=19964 width=36)
           ->  Seq Scan on orders  (cost=0.00..3471.00 rows=200000 width=10)
   InitPlan 2 (returns $1)
     ->  Aggregate
           ->  CTE Scan on totals
   InitPlan 3 (returns $2)
     ->  Aggregate
           ->  CTE Scan on totals totals_1
```

The aggregation over `orders` runs once and is read twice. With `NOT MATERIALIZED`, the plan contains the full aggregation twice and its estimated cost almost doubles (about 9,950 against about 5,600 on this data).

### Other engines

- **Spark SQL** inlines CTEs; a CTE used twice is generally computed twice unless the optimiser reuses the exchange. Persist a DataFrame (`cache()`) or write an intermediate table when reuse matters.
- **BigQuery** documents that it does not materialise the results of non-recursive CTEs, so a CTE referenced several times may be evaluated several times. Use a temporary table in a multi-statement query for expensive shared steps.
- **Snowflake** decides internally whether to reuse a CTE's result; the Query Profile shows whether the work appears once or several times.

Check your engine's current documentation, because this behaviour is an optimiser detail that changes between versions.

### Pitfalls

- Writing one CTE and filtering it later, on an engine or version that materialises: the filter cannot reach the base table.
- Referencing an expensive CTE many times on an engine that inlines: the work repeats.
- Using CTEs as "temporary tables" in long pipelines: an explicit temporary or staging table gets its own statistics and can be indexed, tested and reused.

### In interviews

"Are CTEs slower than subqueries?" The strong answer is "it depends on whether the engine inlines or materialises them": describe both, give PostgreSQL's rule since version 12 and the `MATERIALIZED` keywords, and say how you would check in the plan. Mention temporary tables for intermediate results that are reused or need statistics.

## Spilling and memory management

### What it is

Sorts, hash tables (for hash joins, hash aggregates and `DISTINCT`) and some window functions need working memory. When the data does not fit in the memory granted to the operation, the engine **spills**: it writes partial data to temporary files and reads it back, which is far slower than memory. Spilling is graceful (the query still finishes), but it is a common reason for slow queries.

### PostgreSQL's memory settings

```sql
SET max_parallel_workers_per_gather = 0;
SHOW work_mem;
SHOW hash_mem_multiplier;
SET work_mem = '64kB';
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT order_id, amount FROM orders ORDER BY amount DESC, order_id;
SET work_mem = '64MB';
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT order_id, amount FROM orders ORDER BY amount DESC, order_id;
```

The defaults on this server are `work_mem = 4MB` and `hash_mem_multiplier = 2`. Hash-based operations may use `work_mem x hash_mem_multiplier`.

```text
-- work_mem = 64kB: external merge sort, temporary files written and read back
 Sort  (cost=31339.14..31839.14 rows=200000 width=14) (actual rows=200000 loops=1)
   Sort Key: amount DESC, order_id
   Sort Method: external merge  Disk: 4968kB
   Buffers: shared hit=1477, temp read=1842 written=2036

-- work_mem = 64MB: in-memory quicksort
 Sort  (cost=21080.64..21580.64 rows=200000 width=14) (actual rows=200000 loops=1)
   Sort Key: amount DESC, order_id
   Sort Method: quicksort  Memory: 13957kB
   Buffers: shared hit=1471
```

`temp written=2036` (8 kB blocks) is the spill. The same signals for hash operations:

```sql
SET max_parallel_workers_per_gather = 0;
SET enable_indexscan = off;
SET enable_indexonlyscan = off;
SET enable_bitmapscan = off;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT customer_id, sum(amount) FROM orders GROUP BY customer_id;
SET work_mem = '32MB';
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT customer_id, sum(amount) FROM orders GROUP BY customer_id;
```

```text
-- default 4MB work_mem (8MB for hashes): the aggregate is split into batches on disk
 HashAggregate  (cost=4471.00..4720.55 rows=19964 width=36) (actual rows=20000 loops=1)
   Group Key: customer_id
   Batches: 5  Memory Usage: 8241kB  Disk Usage: 232kB
   Buffers: shared hit=1471, temp read=20 written=43

-- 32MB: one batch, all in memory
 HashAggregate  (cost=4471.00..4720.55 rows=19964 width=36) (actual rows=20000 loops=1)
   Batches: 1  Memory Usage: 8977kB
```

(Index scans are disabled here only so that the planner picks a hash aggregate; with the index it can aggregate in key order without hashing.) For hash joins, the equivalent signal is `Batches:` greater than 1 under the `Hash` node.

Signals of spilling in PostgreSQL:

- `Sort Method: external merge  Disk: ...`
- `Batches: N` with `Disk Usage` on hash aggregates and hashes
- `temp read/written` in `BUFFERS` output
- `temp_files` and `temp_bytes` in `pg_stat_database`, and `log_temp_files` to log every temporary file above a size

### Fixes, in order of preference

1. **Process less data**: filter earlier, select fewer columns (narrower rows fit more per megabyte), aggregate before joining.
2. **Avoid the operation**: an index that already delivers rows in the needed order removes a sort; `LIMIT` with `ORDER BY` uses a bounded "top-N heapsort" that needs little memory.
3. **Fix estimates**: a hash table sized for a 1-row estimate spills when 100,000 rows arrive.
4. **Give that query more memory**: `SET LOCAL work_mem = '256MB'` inside the transaction of a heavy batch job. Avoid raising it globally: `work_mem` applies **per operation, per worker**, so one complex query with several sorts and hashes, run by many sessions in parallel, can use many multiples of it and exhaust server memory.

### In warehouses and Spark

- **Snowflake** reports "Bytes spilled to local storage" and "Bytes spilled to remote storage" in the Query Profile. Remote spilling is much slower. Typical fixes are reducing the data processed, or a larger warehouse size, which gives each query more memory and local disk.
- **Spark** shows "Spill (memory)" and "Spill (disk)" per stage in the UI. Causes are usually too few shuffle partitions or skew; fixes are more partitions, AQE skew handling, broadcast joins or more executor memory.
- **BigQuery** manages memory itself; heavy shuffles show up as slow stages and high slot time in the execution details, and a "resources exceeded" error usually points to a huge sort or a skewed `GROUP BY`.

### Pitfalls

- Raising memory globally to fix one query, then running out of memory under concurrency.
- Ignoring small spills on a frequently run query; they add up.
- `ORDER BY` without `LIMIT` on huge results only to display a few rows.
- Window functions over huge partitions (see the next lesson): the partition must be sorted and sometimes buffered.

### In interviews

"What does spilling to disk mean, and how would you fix it?" Explain working memory for sorts and hashes, how you detect a spill in your engine, and fixes from cheapest to most expensive: less data, avoid the sort, fix estimates, then more memory for that query or a bigger warehouse. Knowing that PostgreSQL's `work_mem` is per operation, not per query, is a classic detail.

## Practice questions

<details><summary>When would the optimiser choose a nested loop join over a hash join?</summary>

When the outer input is small and the inner side can be searched cheaply (usually an index on the join key), so the total cost of a few lookups is lower than building a hash table and scanning the inner table. Also for non-equality join conditions, where hash joins are not possible. A nested loop chosen for a large outer input usually means the outer cardinality was underestimated.

</details>

<details><summary>Why can a merge join be attractive even though it needs sorted input?</summary>

If both inputs are already sorted on the join key (by indexes, or by a previous sort or merge), there is no sort cost and the join is a single pass with very little memory. The output also stays sorted, which can remove a later `ORDER BY` or `GROUP BY` sort. It is also a good fit when the hash table would not fit in memory.

</details>

<details><summary>A query's plan shows estimated rows=1 and actual rows=100000 on a table loaded an hour ago. What happened and what do you change in the pipeline?</summary>

The statistics were collected before (or without) the latest load, so the planner believed the filtered data was tiny and chose a plan for one row. Run `ANALYZE` on the table right after loading it, inside the same job, before downstream queries; check `last_analyze`/`last_autoanalyze` and `n_mod_since_analyze` to confirm.

</details>

<details><summary>Two filters are each 10% selective. The planner estimates 1% of rows but the actual is 10%. Why, and how can you fix it?</summary>

The planner assumes predicates are independent and multiplies selectivities, but the columns are correlated (one implies the other). In PostgreSQL, create extended statistics on the column pair (`CREATE STATISTICS ... (dependencies, mcv) ON a, b`) and re-analyse; in other engines consider a combined column or restructuring the predicate.

</details>

<details><summary>Should you write a CTE or a subquery for performance?</summary>

In engines that inline CTEs (PostgreSQL 12+ for single-reference CTEs, Spark), there is no difference: choose for readability. Where a CTE is materialised, filters cannot be pushed into it, but it is computed only once if referenced several times. Read the plan; in PostgreSQL use `MATERIALIZED`/`NOT MATERIALIZED` to choose explicitly, and use a temporary table when the intermediate result is large, reused or needs statistics.

</details>

<details><summary>Raising work_mem to 1GB fixed a slow report. Why might that be dangerous, and what is better?</summary>

`work_mem` is allowed per sort or hash operation per worker, and every session can use it. Many concurrent queries, each with several operations, could try to allocate many gigabytes and push the server into swapping or out-of-memory failures. Better: reduce the data the operation processes, add an index that removes the sort, fix estimates, or raise memory only for that job with `SET LOCAL work_mem` inside its transaction.

</details>

<details><summary>What is a broadcast join and when does it help?</summary>

In a distributed engine, the small side of a join is copied to every worker so that each worker joins its local part of the large table without shuffling it over the network. It helps when one side is small enough to fit in each worker's memory; it hurts when the "small" side is actually large, because every worker must hold it.

</details>

## Key takeaways

- Nested loop suits a small outer input with an indexed inner side; hash join suits large equality joins; merge join suits inputs already sorted on the key.
- Plans are only as good as the statistics; analyse tables after loading them, and raise statistics targets for skewed columns.
- Cardinality errors compound up the plan. Find the first node where estimates and actuals diverge and fix the cause there.
- Correlated predicates break the independence assumption; extended statistics fix it in PostgreSQL.
- CTEs are inlined or materialised depending on engine and version; inlining enables filter pushdown, materialising avoids repeated work.
- Spills turn in-memory sorts and hashes into disk work; prefer processing less data or fixing estimates over raising memory globally.

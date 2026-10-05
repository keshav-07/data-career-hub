---
title: "SQL Indexes: B-tree, Composite, Covering and Bitmap Indexes"
seoTitle: "SQL Indexes: B-tree, Composite, Covering, Bitmap"
description: "How database indexes work and how to design them: B-tree and composite column order, covering indexes, selectivity and cardinality, and bitmap indexing."
technology: ["sql"]
topic: ["indexes", "performance", "query-plans"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Explain how a B-tree index finds rows and why it supports equality, ranges and ordering"
  - "Choose the column order of a composite index from the queries it must serve"
  - "Build covering indexes that allow index-only scans, and explain the role of the visibility map"
  - "Use selectivity, cardinality and column statistics to predict whether an index will be used"
  - "Describe bitmap indexes and bitmap scans, and where each is a good fit"
prerequisites: ["articles:sql/query-optimization-fundamentals"]
related: ["articles:snowflake/micro-partitions-clustering-pruning", "articles:data-warehousing/partitioning-clustering-data-layout"]
previous: "articles:sql/query-optimization-fundamentals"
versionContext: "SQL examples run on PostgreSQL 16.14 with parallel query switched off for readable plans; the bitmap simulation runs on Python 3. Costs, timings and index sizes vary by machine and data. Oracle bitmap index syntax was not executed."
sources:
  - { label: "PostgreSQL 16 documentation: Multicolumn indexes", url: "https://www.postgresql.org/docs/16/indexes-multicolumn.html" }
  - { label: "PostgreSQL 16 documentation: Index-only scans and covering indexes", url: "https://www.postgresql.org/docs/16/indexes-index-only-scans.html" }
  - { label: "PostgreSQL documentation: Using EXPLAIN", url: "https://www.postgresql.org/docs/current/using-explain.html" }
  - { label: "Snowflake documentation: Micro-partitions and data clustering", url: "https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions" }
---

An index is a separate, sorted structure that lets the database find rows without reading the whole table, at the price of extra storage and slower writes. Good index design is one of the highest-leverage skills for anyone who owns an operational database, a serving layer or a metadata store, and it is a favourite interview topic because it tests whether you understand how data is physically read. This lesson covers B-tree and composite indexes, covering indexes, selectivity and cardinality, and bitmap indexing, with real PostgreSQL plans.

## Sample data

Half a million events, loaded in a few seconds. The values cycle evenly, so every page of the table contains every event type.

```sql
CREATE TABLE events (
  event_id    BIGINT PRIMARY KEY,
  user_id     INT NOT NULL,
  event_type  TEXT NOT NULL,
  country     TEXT NOT NULL,
  is_test     BOOLEAN NOT NULL,
  amount      NUMERIC(10,2),
  created_at  TIMESTAMP NOT NULL
);
INSERT INTO events
SELECT g,
       1 + (g::bigint * 7919) % 50000,
       (ARRAY['view','view','view','view','click','click','add_to_cart','purchase'])[1 + g % 8],
       (ARRAY['GB','IN','US','DE','FR','BR','JP','AU'])[1 + (g / 7) % 8],
       g % 200 = 0,
       CASE WHEN g % 8 = 7 THEN ((g::bigint * 37) % 20000) / 100.0 END,
       TIMESTAMP '2026-01-01' + g * INTERVAL '10 seconds'
FROM generate_series(1, 500000) AS g;
VACUUM ANALYZE events;
```

Each user has 10 events, half the events are views, 0.5% are test events, and `created_at` increases with `event_id`.

## B-tree and composite index design

### What it is

A **B-tree** (balanced tree) index stores the indexed values in sorted order, in pages organised as a shallow tree. The root and inner pages hold separator keys that point to child pages; the leaf pages hold every key with a pointer to the table row (in PostgreSQL a tuple id, in MySQL InnoDB the primary key). Because the tree is balanced and each page holds hundreds of keys, even a table with hundreds of millions of rows is usually only three or four levels deep, so finding one key costs a handful of page reads.

Being sorted is what makes a B-tree useful for more than equality:

- `=`, `IN`: descend to the key.
- `<`, `>`, `BETWEEN`, `LIKE 'abc%'` (with a suitable collation or operator class): descend to the start of the range, then walk along the leaf pages.
- `ORDER BY` and `MIN`/`MAX`: read keys in index order, so no sort is needed.

It cannot help with `LIKE '%abc'`, functions applied to the column (unless the index is on that expression), or `<>` on a common value. Most databases create a B-tree automatically for primary keys and unique constraints; B-tree is the default index type in PostgreSQL, MySQL, SQL Server and Oracle.

### Composite indexes and column order

A **composite** (multi-column) index on `(a, b)` is sorted by `a`, and by `b` within each `a`, like a phone book sorted by surname, then first name. That makes the column order decisive:

```sql
SET max_parallel_workers_per_gather = 0;
CREATE INDEX events_user_time_idx ON events (user_id, created_at);
EXPLAIN SELECT event_id, created_at FROM events WHERE user_id = 123 AND created_at >= '2026-02-01';
EXPLAIN SELECT event_id FROM events WHERE created_at >= '2026-02-01' AND created_at < '2026-02-02';
EXPLAIN SELECT event_id, created_at FROM events WHERE user_id = 123 ORDER BY created_at DESC LIMIT 5;
```

```text
-- 1. leading column equality + range on the second column: both used in the index condition
 Bitmap Heap Scan on events  (cost=4.47..24.01 rows=5 width=16)
   Recheck Cond: ((user_id = 123) AND (created_at >= '2026-02-01 00:00:00'::timestamp without time zone))
   ->  Bitmap Index Scan on events_user_time_idx  (cost=0.00..4.47 rows=5 width=0)
         Index Cond: ((user_id = 123) AND (created_at >= '2026-02-01 00:00:00'::timestamp without time zone))

-- 2. filter only on the second column: the index is not usable, full scan
 Seq Scan on events  (cost=0.00..11317.00 rows=8474 width=8)
   Filter: ((created_at >= '2026-02-01 00:00:00'::timestamp without time zone) AND ...)

-- 3. equality on user_id, ORDER BY created_at: index order replaces the sort
 Limit  (cost=0.42..22.51 rows=5 width=16)
   ->  Index Scan Backward using events_user_time_idx on events  (cost=0.42..44.60 rows=10 width=16)
         Index Cond: (user_id = 123)
```

The **leftmost-prefix rule**: an index on `(a, b, c)` serves filters on `a`, on `a` and `b`, and on all three, but not efficiently on `b` or `c` alone. (PostgreSQL can occasionally scan a whole composite index for a non-leading column when the index is much smaller than the table, and some engines have "skip scan", but do not design around it.)

Guidelines for ordering columns:

1. **Equality columns first, range column last.** In `(user_id, created_at)`, all of one user's events sit together sorted by time, so "user 123 since February" is one contiguous slice. In `(created_at, user_id)`, the same query would read every user's events since February and filter.
2. **Then columns used for ordering**, in the `ORDER BY` order, so `WHERE user_id = ? ORDER BY created_at` needs no sort.
3. **Serve several queries with one index** where possible: `(user_id, created_at)` also covers `WHERE user_id = ?`, so a separate index on `user_id` alone is redundant.
4. Putting the most selective column first is a common rule of thumb, but query shape (which columns are equality, which are ranges) matters more.

### Pitfalls

- **Too many indexes.** Every `INSERT`, `UPDATE` of an indexed column and `DELETE` must maintain every index, and each one takes disk and cache. Bulk loads are often faster if you drop non-essential indexes and rebuild them afterwards.
- **Redundant indexes**: `(a)` next to `(a, b)`. Find unused ones in `pg_stat_user_indexes` (`idx_scan = 0` over a representative period) before dropping.
- **Type and function mismatch.** An index on `created_at` does not serve `WHERE created_at::date = ...` (see the optimisation lesson).
- **Random keys.** Random UUIDs as the primary key insert all over the B-tree, causing page splits and poor cache locality; time-ordered keys (sequences, UUIDv7-style) insert at the right-hand edge.

### In interviews

"Which index would you create for this query?" is the classic. Read the `WHERE`, `JOIN` and `ORDER BY` clauses, put equality columns first and the range or sort column last, and say what the index costs on writes. Being able to explain why `(a, b)` does not help a filter on `b` alone, using the phone book analogy, is usually what the interviewer is checking.

## Covering indexes

### What it is

A normal index lookup is two steps: find the key in the index, then visit the table (the **heap**) to fetch the other columns. If the index already contains every column the query needs, the second step can be skipped. Such an index **covers** the query, and the plan becomes an **index-only scan**.

### How it works

You can cover a query by adding columns to the key, or, in PostgreSQL 11+ and SQL Server, with `INCLUDE`: included columns are stored in the leaf pages only, so they do not affect ordering or uniqueness and keep the upper levels of the tree small.

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN (ANALYZE, BUFFERS) SELECT event_type, amount FROM events WHERE user_id = 123;
CREATE INDEX events_user_cov_idx ON events (user_id) INCLUDE (event_type, amount);
EXPLAIN (ANALYZE, BUFFERS) SELECT event_type, amount FROM events WHERE user_id = 123;
```

```text
-- before: index finds 10 rows, then 10 heap pages are visited
 Bitmap Heap Scan on events  (cost=4.50..43.09 rows=10 width=12) (actual time=0.071..0.110 rows=10 loops=1)
   Recheck Cond: (user_id = 123)
   Heap Blocks: exact=10
   Buffers: shared hit=10 read=3
   ->  Bitmap Index Scan on events_user_time_idx  (cost=0.00..4.50 rows=10 width=0) (actual time=0.050..0.050 rows=10 loops=1)
         Index Cond: (user_id = 123)

-- after: everything comes from the index
 Index Only Scan using events_user_cov_idx on events  (cost=0.42..4.60 rows=10 width=12) (actual time=0.055..0.058 rows=10 loops=1)
   Index Cond: (user_id = 123)
   Heap Fetches: 0
   Buffers: shared hit=1 read=3
```

13 pages became 4. The saving grows with the number of matching rows, because each row can live on a different heap page.

### The visibility map catch (PostgreSQL)

PostgreSQL indexes do not store whether a row version is visible to your transaction (see the MVCC lesson). An index-only scan can skip the heap only for pages that the **visibility map** marks as "all visible", which `VACUUM` maintains. Recently changed pages must still be checked:

```sql
SET max_parallel_workers_per_gather = 0;
UPDATE events SET amount = amount WHERE user_id = 123;
EXPLAIN (ANALYZE, BUFFERS) SELECT event_type, amount FROM events WHERE user_id = 123;
VACUUM events;
EXPLAIN (ANALYZE, BUFFERS) SELECT event_type, amount FROM events WHERE user_id = 123;
```

```text
-- after the update: still an index-only scan, but every row needed a heap visit
 Index Only Scan using events_user_cov_idx on events  (actual time=0.107..0.112 rows=10 loops=1)
   Heap Fetches: 20
   Buffers: shared hit=15

-- after VACUUM: back to no heap visits
 Index Only Scan using events_user_cov_idx on events  (actual time=0.018..0.019 rows=10 loops=1)
   Heap Fetches: 0
   Buffers: shared hit=4
```

`Heap Fetches: 20` (10 live rows plus 10 dead versions left by the update) shows the index-only scan doing the work of a normal index scan. On busy tables, index-only scans are only as good as autovacuum keeps the visibility map. MySQL InnoDB and SQL Server do not have this extra check in the same form.

### Pitfalls

- **Covering everything.** Each included column makes the index bigger and every write more expensive. Cover the hot, narrow queries, not `SELECT *`.
- **Updates to included columns** must update the index too.
- **Assuming "Index Only Scan" means no heap access**: always read `Heap Fetches`.

### In interviews

Expect "what is a covering index?" or "this query uses an index but is still slow". Explain the two-step lookup, show how `INCLUDE` removes the second step, and mention the write cost. Mentioning PostgreSQL's visibility map and `Heap Fetches` shows real operational experience.

## Index selectivity and cardinality

### What it is

- **Cardinality** of a column is the number of distinct values: `user_id` is high (50,000 values), `event_type` is low (4), `is_test` is 2. (Optimisers also use "cardinality" for the estimated number of rows an operator returns.)
- **Selectivity** of a predicate is the fraction of rows it matches: `user_id = 123` matches 10 of 500,000 rows (0.002%), `event_type = 'view'` matches 50%.

An index pays off when a predicate is **selective**: it lets the engine read a few pages instead of all of them. Low selectivity means most pages must be read anyway, and then a sequential scan, which reads pages in order and in bulk, is cheaper than jumping around via an index.

### How the planner knows

PostgreSQL's `ANALYZE` samples the table and stores per-column statistics in `pg_stats`:

```sql
SELECT attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'events' AND attname IN ('user_id', 'event_type', 'is_test')
ORDER BY attname;
```

| attname | n_distinct | most_common_vals | most_common_freqs |
|---|---|---|---|
| event_type | 4 | {view,click,purchase,add_to_cart} | {0.5028667,0.24886666,0.12533334,0.122933336} |
| is_test | 2 | {f,t} | {0.9956333,0.0043666665} |
| user_id | -0.1018 | NULL | NULL |

The values come from a sample, so they are close to (not exactly) the true 50%, 25%, 12.5% and 0.5%, and will differ slightly on each `ANALYZE`. A negative `n_distinct` means "this fraction of the row count": -0.1018 means about 10% of rows are distinct, roughly 50,900 users (the true number is 50,000). For a value in the most-common list the planner uses its frequency; otherwise it spreads the remaining fraction across the other distinct values.

### Selectivity in the plan

```sql
SET max_parallel_workers_per_gather = 0;
CREATE INDEX events_type_idx ON events (event_type);
EXPLAIN SELECT sum(amount) FROM events WHERE event_type = 'view';
EXPLAIN SELECT sum(amount) FROM events WHERE user_id = 123;
EXPLAIN SELECT * FROM events WHERE is_test = false;
```

```text
-- 50% of rows: the bitmap plan is costed at 10401, a full scan at about 10696 (nearly a tie)
 Aggregate  (cost=10401.53..10401.54 rows=1 width=32)
   ->  Bitmap Heap Scan on events  (cost=2813.03..9772.94 rows=251433 width=6)
         Recheck Cond: (event_type = 'view'::text)
         ->  Bitmap Index Scan on events_type_idx  (cost=0.00..2750.17 rows=251433 width=0)

-- 10 rows: the index is the obvious choice
 Aggregate  (cost=8.62..8.63 rows=1 width=32)
   ->  Index Only Scan using events_user_cov_idx on events  (cost=0.42..8.60 rows=10 width=6)
         Index Cond: (user_id = 123)

-- 99.5% of rows: full scan
 Seq Scan on events  (cost=0.00..8817.00 rows=497817 width=36)
   Filter: (NOT is_test)
```

For the 50% predicate the two plans are within 3% of each other in estimated cost; on this data every page contains views, so the index saves nothing and adds a bitmap step. (The full-scan cost was read from the same query with `enable_bitmapscan` turned off.) An index on a column like `event_type` mostly costs write time without making reads faster, unless a query targets a rare value.

### Partial indexes for rare values

When only a rare value is queried, index just those rows:

```sql
SET max_parallel_workers_per_gather = 0;
CREATE INDEX events_test_idx ON events (created_at) WHERE is_test;
EXPLAIN SELECT event_id FROM events WHERE is_test AND created_at >= '2026-02-01';
SELECT relname AS index_name, pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class
WHERE relname IN ('events_test_idx', 'events_type_idx', 'events_user_time_idx')
ORDER BY relname;
```

```text
 Index Scan using events_test_idx on events  (cost=0.28..44.81 rows=1002 width=8)
   Index Cond: (created_at >= '2026-02-01 00:00:00'::timestamp without time zone)
```

| index_name | size |
|---|---|
| events_test_idx | 72 kB |
| events_type_idx | 3424 kB |
| events_user_time_idx | 15 MB |

The partial index holds 0.5% of the rows and is tiny. The query's `WHERE` must imply the index's predicate for it to be used. Typical uses: unprocessed rows in a queue table (`WHERE processed = false`), soft-deleted rows excluded (`WHERE deleted_at IS NULL`).

### Pitfalls

- **Skew.** A column can be highly selective for most values and not at all for one (a `customer_id` where one account owns 30% of rows). The planner handles this through most-common-value statistics, but a cached generic plan for a prepared statement may not.
- **Stale statistics** after bulk loads lead to wrong choices. Run `ANALYZE` after large loads.
- **Correlated columns.** Two predicates that are each 10% selective are assumed to be independent (1% together) even when they are not. PostgreSQL's `CREATE STATISTICS` addresses this (covered in the optimizer internals lesson).
- **Physical order matters too.** Matching rows that are clustered together (as `created_at` is here) are cheap to read even at moderate selectivity; scattered rows are expensive.

### In interviews

"Would you index a gender or status column?" tests exactly this. A strong answer: usually not on its own, because low cardinality means low selectivity and the planner will scan anyway; but yes as part of a composite index, as a partial index for a rare value, or as a bitmap index in a read-mostly warehouse. Then explain how the optimiser knows, through statistics.

## Bitmap indexing

### What it is

There are two different ideas under the "bitmap" name:

1. A **bitmap index** is a persistent index type (Oracle Database is the best-known example) that stores, for each distinct value of a column, a bitmap with one bit per row: 1 if the row has that value. It is compact for low-cardinality columns, and combining conditions is just bitwise `AND` and `OR`.
2. A **bitmap scan** is an execution strategy (PostgreSQL's `Bitmap Index Scan` and `Bitmap Heap Scan`) that builds a temporary bitmap of matching row locations from an ordinary B-tree index at query time, then reads the table pages in physical order. PostgreSQL has no persistent bitmap index type.

### How a bitmap index works

A tiny simulation with Python integers as bitsets:

```python
rows = [
    ("view", "GB"), ("click", "GB"), ("view", "JP"), ("purchase", "JP"),
    ("view", "GB"), ("click", "JP"), ("purchase", "GB"), ("purchase", "JP"),
]

def build_bitmaps(column):
    """One bitmap per distinct value; bit i is set when row i has that value."""
    bitmaps = {}
    for i, value in enumerate(column):
        bitmaps[value] = bitmaps.get(value, 0) | (1 << i)
    return bitmaps

event_type = build_bitmaps([r[0] for r in rows])
country = build_bitmaps([r[1] for r in rows])

def show(bits):
    return "".join("1" if bits >> i & 1 else "0" for i in range(len(rows)))

for value, bits in sorted(event_type.items()):
    print(f"event_type={value:<9} {show(bits)}")
for value, bits in sorted(country.items()):
    print(f"country={value:<12} {show(bits)}")

match = event_type["purchase"] & country["JP"]          # AND = intersection
either = event_type["purchase"] | event_type["click"]   # OR = union
print("purchase AND JP     ", show(match), "rows:", [i for i in range(len(rows)) if match >> i & 1])
print("purchase OR click   ", show(either), "count:", bin(either).count("1"))
```

```text
event_type=click     01000100
event_type=purchase  00010011
event_type=view      10101000
country=GB           11001010
country=JP           00110101
purchase AND JP      00010001 rows: [3, 7]
purchase OR click    01010111 count: 5
```

Real implementations compress the bitmaps (long runs of zeros compress very well), and counting set bits answers `COUNT(*)` without touching the table. That is why bitmap indexes suit data warehouses with many low-cardinality filter columns combined in ad hoc ways.

Their weakness is concurrent writes: changing one row means updating compressed bitmaps that cover many rows, and in Oracle that locks a range of rows covered by the same bitmap segment. They are a poor fit for OLTP tables with many concurrent updates.

<!-- noexec -->
```sql
-- Oracle Database syntax
CREATE BITMAP INDEX events_country_bix ON events (country);
```

### Bitmap scans in PostgreSQL

PostgreSQL gets most of the combining benefit at query time. With separate B-tree indexes on `event_type` and `country`, it builds a bitmap from each and intersects them:

```sql
SET max_parallel_workers_per_gather = 0;
CREATE INDEX events_country_idx ON events (country);
EXPLAIN (ANALYZE) SELECT count(*) FROM events WHERE event_type = 'purchase' AND country = 'JP';
```

```text
 Aggregate  (cost=5335.05..5335.06 rows=1 width=8) (actual time=23.714..23.718 rows=1 loops=1)
   ->  Bitmap Heap Scan on events  (cost=1379.80..5315.30 rows=7900 width=0) (actual time=6.092..21.667 rows=8928 loops=1)
         Recheck Cond: ((event_type = 'purchase'::text) AND (country = 'JP'::text))
         Heap Blocks: exact=3817
         ->  BitmapAnd  (cost=1379.80..1379.80 rows=7900 width=0) (actual time=5.526..5.529 rows=0 loops=1)
               ->  Bitmap Index Scan on events_type_idx  (actual time=3.622..3.623 rows=62500 loops=1)
                     Index Cond: (event_type = 'purchase'::text)
               ->  Bitmap Index Scan on events_country_idx  (actual time=1.778..1.778 rows=62496 loops=1)
                     Index Cond: (country = 'JP'::text)
```

Each index alone matches about 62,500 rows; the `BitmapAnd` narrows them to 8,928. (`rows=0` on bitmap nodes is normal: they output a bitmap, not rows.) Note the estimate of 7,900 against an actual 8,928: the planner assumes the two columns are independent. `BitmapOr` does the same for `OR`. If the bitmap exceeds `work_mem`, it degrades to one bit per *page* ("lossy") and every row on those pages must be rechecked.

### BRIN: a related idea for huge append-only tables

A **BRIN** (block range) index stores only the minimum and maximum value for each range of table pages, which is the same idea as the min/max metadata that columnar warehouses use for pruning. It is tiny, and works well when the column is correlated with physical order, as `created_at` is in an append-only events table:

```sql
SET max_parallel_workers_per_gather = 0;
CREATE INDEX events_created_brin ON events USING brin (created_at);
CREATE INDEX events_created_btree ON events (created_at);
SELECT relname AS index_name, pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class WHERE relname IN ('events_created_brin', 'events_created_btree') ORDER BY relname;
DROP INDEX events_created_btree;
EXPLAIN (ANALYZE) SELECT count(*) FROM events
WHERE created_at >= '2026-02-01' AND created_at < '2026-02-02';
```

| index_name | size |
|---|---|
| events_created_brin | 24 kB |
| events_created_btree | 11 MB |

```text
 Aggregate  (actual time=21.543..21.546 rows=1 loops=1)
   ->  Bitmap Heap Scan on events  (cost=14.15..4081.16 rows=8474 width=0) (actual time=5.786..16.383 rows=8640 loops=1)
         Rows Removed by Index Recheck: 38633
         Heap Blocks: lossy=361
         ->  Bitmap Index Scan on events_created_brin  (actual time=0.032..0.033 rows=3610 loops=1)
```

The BRIN index is several hundred times smaller than the B-tree and reduces the scan to 361 of the table's 3,817 pages, at the cost of rechecking every row on those pages. If rows were inserted in random time order, every page range would span all dates and the BRIN index would be useless.

### Pitfalls

- Building bitmap indexes on frequently updated OLTP tables (lock contention and maintenance cost).
- Confusing PostgreSQL's bitmap *scans* with bitmap *indexes* in an interview.
- Expecting `BitmapAnd` to fix everything: two weakly selective indexes intersected still read many pages. A composite index on both columns is often better for a known, frequent query.

### In interviews

"What is a bitmap index and when would you use it?" Explain the one-bitmap-per-value structure, fast `AND`/`OR`/`COUNT`, the low-cardinality, read-mostly sweet spot, and the write-concurrency problem. Then connect it to modern systems: PostgreSQL builds bitmaps at query time, and columnar warehouses rely on min/max pruning, compression and clustering instead of user-defined indexes.

## Practice questions

<details><summary>A query filters on WHERE status = 'open' AND created_at > now() - interval '1 day' ORDER BY created_at. Which index do you create?</summary>

A composite index `(status, created_at)`: equality column first, then the range and ordering column. The engine seeks to `status = 'open'`, reads only the last day's slice in time order, and needs no sort. If `'open'` is a small fraction of rows and the only status queried, a partial index `ON (created_at) WHERE status = 'open'` is smaller still.

</details>

<details><summary>Why does an index on (last_name, first_name) not help WHERE first_name = 'Asha'?</summary>

The index is sorted by `last_name` first; rows with first name Asha are scattered across every last name, so there is no contiguous range to seek to. The engine would have to read the whole index (or the table). Create an index that leads with `first_name` if that query matters.

</details>

<details><summary>What is a covering index, and why might an "Index Only Scan" in PostgreSQL still read the table?</summary>

A covering index contains every column the query needs (as key columns or `INCLUDE` columns), so the table lookup can be skipped. PostgreSQL must still check row visibility for pages not marked all-visible in the visibility map; those show up as `Heap Fetches`. Regular vacuuming keeps the map current.

</details>

<details><summary>Should you index a boolean column such as is_deleted?</summary>

Usually not as a standalone B-tree: with two values, at least one of them matches a large share of rows, and the planner will choose a sequential scan for it. If queries target the rare value, use a partial index (`WHERE is_deleted`) or include the column in a composite or partial index serving the real query. In a read-mostly warehouse engine with bitmap indexes, low-cardinality columns are a good fit.

</details>

<details><summary>How does the optimiser estimate the selectivity of event_type = 'view'?</summary>

From column statistics gathered by `ANALYZE`: if `'view'` is in the most-common-values list, it uses the stored frequency (about 0.5 here). Otherwise it divides the remaining frequency among the other distinct values (from `n_distinct`). Estimated rows = selectivity times the estimated table row count.

</details>

<details><summary>What are the trade-offs of adding another index to a busy table?</summary>

Reads that use it get faster. Every insert, delete and update of indexed columns gets slower, the index uses disk and buffer cache, vacuum and backups take longer, and write-ahead log volume grows. Check `pg_stat_user_indexes` for unused or duplicate indexes before adding more, and test the write workload as well as the query.

</details>

## Key takeaways

- A B-tree keeps keys sorted, so it serves equality, ranges, prefix matches and ordering in a few page reads.
- Composite index order matters: equality columns first, then the range or sort column; the leftmost prefix is usable, a trailing column alone is not.
- Covering indexes (`INCLUDE`) avoid table lookups; in PostgreSQL watch `Heap Fetches` and keep vacuum healthy.
- Indexes help selective predicates; the optimiser decides from statistics (`n_distinct`, most-common values), and low-cardinality columns rarely deserve a standalone B-tree.
- Partial indexes target rare values cheaply; BRIN indexes give min/max pruning on huge, naturally ordered tables.
- Bitmap indexes suit low-cardinality, read-mostly warehouse columns; PostgreSQL instead builds bitmaps at query time (`BitmapAnd`/`BitmapOr`).
- Every index costs writes and storage: index for real queries and remove unused ones.

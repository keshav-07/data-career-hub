---
title: "Partitioning, Materialized Views, Columnar Storage and Sharding"
seoTitle: "Partitioning, Materialized Views and Sharding"
description: "Design table partitioning and check pruning in query plans, use materialized views safely, compare row and columnar storage, and choose a sharding key."
technology: ["sql"]
topic: ["partitioning", "materialized-views", "columnar-storage", "sharding"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Choose between range, list and hash partitioning and a sensible partition grain"
  - "Confirm partition pruning in a plan and avoid filters that disable it"
  - "Create, refresh and index materialized views, and explain their staleness trade-off"
  - "Explain why columnar storage suits analytics and row storage suits transactions"
  - "Pick a shard key that spreads load evenly and keeps common queries on one shard"
prerequisites: ["articles:sql/indexes", "articles:sql/query-optimization-fundamentals"]
related: ["articles:data-warehousing/partitioning-clustering-data-layout", "articles:snowflake/micro-partitions-clustering-pruning", "articles:delta-lake/parquet-vs-avro-vs-orc", "articles:spark/partitions-shuffles-skew"]
previous: "articles:sql/indexes"
versionContext: "PostgreSQL examples run on PostgreSQL 16.14 with declarative partitioning; Python simulations run on Python 3. Snowflake, BigQuery and Citus snippets were written from documentation and not executed. Plan costs vary by machine."
sources:
  - { label: "PostgreSQL 16 documentation: Materialized views", url: "https://www.postgresql.org/docs/16/rules-materializedviews.html" }
  - { label: "PostgreSQL documentation: Using EXPLAIN", url: "https://www.postgresql.org/docs/current/using-explain.html" }
  - { label: "Snowflake documentation: Micro-partitions and data clustering", url: "https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions" }
  - { label: "Apache Spark documentation: Parquet files", url: "https://spark.apache.org/docs/latest/sql-data-sources-parquet.html" }
---

As tables grow from millions to billions of rows, indexes alone stop being enough. The next tools are physical: split a table into partitions the engine can skip, precompute expensive results in materialized views, store data by column instead of by row, and spread data over several machines with sharding. These choices are made once and are expensive to change, which is why Data Engineers are expected to reason about them in design interviews.

## Sample data

A page-view table partitioned by month, with a default partition for anything outside the defined ranges:

```sql
CREATE TABLE page_views (
  view_id    BIGINT NOT NULL,
  user_id    INT NOT NULL,
  country    TEXT NOT NULL,
  url        TEXT NOT NULL,
  viewed_at  TIMESTAMP NOT NULL
) PARTITION BY RANGE (viewed_at);

CREATE TABLE page_views_2026_01 PARTITION OF page_views
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE page_views_2026_02 PARTITION OF page_views
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE page_views_2026_03 PARTITION OF page_views
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE page_views_default PARTITION OF page_views DEFAULT;

INSERT INTO page_views
SELECT g, 1 + g % 5000, (ARRAY['GB','IN','US','DE'])[1 + g % 4],
       '/p/' || (g % 300),
       TIMESTAMP '2026-01-01' + (g % 129600) * INTERVAL '1 minute'
FROM generate_series(1, 200000) AS g;
CREATE INDEX ON page_views (viewed_at);
ANALYZE page_views;
```

## Partitioning strategies

### What it is

**Partitioning** splits one logical table into several physical pieces by the value of a partition key. Queries still address the parent table; the engine routes inserted rows to the right partition and can skip partitions that cannot contain matching rows. Partitioning is about **data management and pruning**, not about running on several machines (that is sharding).

Benefits:

- **Pruning**: a query for one day reads one partition instead of the whole table.
- **Lifecycle**: dropping or archiving a month is a metadata operation instead of a huge `DELETE`.
- **Maintenance**: vacuum, statistics, index rebuilds and backfills work on one partition at a time.
- **Idempotent loads**: a pipeline can rebuild or overwrite exactly one partition per run.

### How it works

Rows go to the partition whose bounds contain the key. Each partition is a real table:

```sql
SELECT tableoid::regclass AS partition, count(*) AS row_count
FROM page_views GROUP BY 1 ORDER BY 1;
```

| partition | row_count |
|---|---|
| page_views_2026_01 | 89279 |
| page_views_2026_02 | 66081 |
| page_views_2026_03 | 44640 |

Range bounds are inclusive at the start and exclusive at the end, so midnight on 1 February belongs to February only. The index created on the parent was created on every partition.

| Strategy | Rows go to the partition... | Good for | Watch out for |
|---|---|---|---|
| Range | whose interval contains the key | Time series, event and fact tables | Hot latest partition; creating future partitions |
| List | whose value list contains the key | Region, tenant, source system | New values with no partition |
| Hash | chosen by hash(key) modulo N | Even spread when there is no natural range | No pruning for ranges; changing N rewrites data |
| Composite (sub-partitioning) | e.g. range by month, then hash by user | Very large tables | Many small partitions |

List and hash partitioning in PostgreSQL:

```sql
CREATE TABLE users_by_region (user_id INT, region TEXT) PARTITION BY LIST (region);
CREATE TABLE users_eu   PARTITION OF users_by_region FOR VALUES IN ('GB', 'DE', 'FR');
CREATE TABLE users_apac PARTITION OF users_by_region FOR VALUES IN ('IN', 'JP');

CREATE TABLE sessions_h (session_id BIGINT, user_id INT) PARTITION BY HASH (user_id);
CREATE TABLE sessions_h0 PARTITION OF sessions_h FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_h1 PARTITION OF sessions_h FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE sessions_h2 PARTITION OF sessions_h FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE sessions_h3 PARTITION OF sessions_h FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

A row whose key fits no partition is rejected unless there is a default partition:

<!-- expect-error -->
```sql
INSERT INTO users_by_region VALUES (1, 'US');
```

`ERROR: no partition of relation "users_by_region" found for row`. That error is often better than silently filling a default partition, which every query then has to scan.

### Partition lifecycle

Create partitions ahead of time (a scheduled job or the `pg_partman` extension does this), and retire old ones by detaching and dropping, which takes milliseconds regardless of size:

```sql
CREATE TABLE page_views_2026_04 PARTITION OF page_views
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
ALTER TABLE page_views DETACH PARTITION page_views_2026_01;
DROP TABLE page_views_2026_01;
SELECT tableoid::regclass AS partition, count(*) AS row_count
FROM page_views GROUP BY 1 ORDER BY 1;
```

| partition | row_count |
|---|---|
| page_views_2026_02 | 66081 |
| page_views_2026_03 | 44640 |

January's 89,279 rows are gone without a `DELETE`, without dead tuples and without vacuum work.

### Choosing the key and the grain

- Partition by the column most queries filter on, usually event or business date. Partitioning by load date is simpler for pipelines but only helps queries that filter on load date.
- Choose a grain that gives a manageable number of reasonably large partitions. Daily partitions for a table that receives a few thousand rows a day create thousands of tiny partitions, and planning time and metadata overhead grow with the partition count.
- In PostgreSQL, primary keys and unique constraints on a partitioned table must include the partition key.

### In warehouses and lakehouses

- **Snowflake** partitions every table automatically into micro-partitions (the documentation describes each as holding between 50 MB and 500 MB of uncompressed data) and keeps min/max metadata per column. You influence layout with a **clustering key** rather than declaring partitions.
- **BigQuery** offers explicit partitioning by a date/timestamp column, ingestion time or an integer range, plus clustering on up to four columns. Setting `require_partition_filter` rejects queries that would scan every partition.
- **Spark, Delta Lake and Hive-style tables** write one directory per partition value (`.../event_date=2026-03-01/`). Too many partition values produce millions of small files, which is a classic performance problem.

<!-- noexec -->
```sql
-- BigQuery
CREATE TABLE analytics.page_views (view_id INT64, user_id INT64, country STRING, viewed_at TIMESTAMP)
PARTITION BY DATE(viewed_at)
CLUSTER BY country, user_id
OPTIONS (require_partition_filter = TRUE);

-- Snowflake
ALTER TABLE page_views CLUSTER BY (TO_DATE(viewed_at), country);
```

### Pitfalls

- Over-partitioning (too many small partitions) and partitioning on high-cardinality columns such as `user_id` in directory-based lakes.
- Forgetting to create future partitions, so inserts fail or land in the default partition.
- A default partition that slowly fills up and is scanned by every range query.
- Assuming partitioning speeds up queries that do not filter on the key; they still read every partition.

### In interviews

"How would you partition a 5-billion-row events table?" Answer with the key (event date, because most queries filter on it), the grain (daily or monthly depending on volume), how partitions are created and expired, how late-arriving data is handled (a backfill job rewrites the affected partitions), and what you would cluster or index inside each partition.

## Partition pruning

### What it is

**Pruning** is the optimiser excluding partitions that cannot contain matching rows, using the partition bounds and the query's filter. It is where partitioning pays off for reads, and it only happens when the filter is on the partition key in a form the optimiser can compare with the bounds.

### Pruning at plan time

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN SELECT count(*) FROM page_views
WHERE viewed_at >= '2026-02-10' AND viewed_at < '2026-02-11';
```

```text
 Aggregate  (cost=601.82..601.83 rows=1 width=8)
   ->  Bitmap Heap Scan on page_views_2026_02 page_views  (cost=63.14..594.29 rows=3010 width=0)
         Recheck Cond: ((viewed_at >= '2026-02-10 00:00:00'::timestamp without time zone) AND ...)
         ->  Bitmap Index Scan on page_views_2026_02_viewed_at_idx  (cost=0.00..62.39 rows=3010 width=0)
```

Only the February partition appears: March, April and the default partition were pruned before execution.

### Filters that defeat pruning

Wrapping the partition key in a function hides it from the optimiser, just as it hides a column from an index:

```sql
SET max_parallel_workers_per_gather = 0;
EXPLAIN SELECT count(*) FROM page_views WHERE date_trunc('month', viewed_at) = '2026-02-01';
```

```text
 Aggregate  (cost=2500.80..2500.81 rows=1 width=8)
   ->  Append  (cost=0.00..2499.41 rows=558 width=0)
         ->  Seq Scan on page_views_2026_02 page_views_1  (cost=0.00..1477.21 rows=330 width=0)
               Filter: (date_trunc('month'::text, viewed_at) = '2026-02-01 00:00:00'::timestamp without time zone)
         ->  Seq Scan on page_views_2026_03 page_views_2  (cost=0.00..998.60 rows=223 width=0)
         ->  Seq Scan on page_views_2026_04 page_views_3  (cost=0.00..20.80 rows=4 width=0)
         ->  Seq Scan on page_views_default page_views_4  (cost=0.00..0.00 rows=1 width=0)
```

Every partition is scanned in full. The fix is the half-open range from the previous example. Other common causes: comparing the key with a different type (a string where a date is expected in some engines), filtering on a column that is only correlated with the key (`created_date` when the table is partitioned by `event_date`), and in warehouses, a join-based filter that the engine cannot push down.

### Pruning at execution time

When the filter value is only known at run time (a parameter of a prepared statement, or a value from a subquery), PostgreSQL 11+ can prune during execution. The plan then reports **Subplans Removed**:

```sql
SET max_parallel_workers_per_gather = 0;
SET plan_cache_mode = force_generic_plan;
PREPARE recent(timestamp) AS SELECT count(*) FROM page_views WHERE viewed_at >= $1;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) EXECUTE recent('2026-03-15');
```

```text
 Aggregate (actual rows=1 loops=1)
   ->  Append (actual rows=24480 loops=1)
         Subplans Removed: 1
         ->  Index Only Scan using page_views_2026_03_viewed_at_idx on page_views_2026_03 page_views_1 (actual rows=24480 loops=1)
               Index Cond: (viewed_at >= $1)
         ->  Seq Scan on page_views_2026_04 page_views_2 (actual rows=0 loops=1)
         ->  Seq Scan on page_views_default page_views_3 (actual rows=0 loops=1)
```

`force_generic_plan` makes PostgreSQL plan without knowing the value, so the February partition can only be removed at execution time. Notice that April and the default partition are still read: an open-ended range (`>=`) can match future partitions, and the default partition can hold any value, so it is never pruned for such a filter.

### Checking pruning in warehouses

In Snowflake's Query Profile, compare **partitions scanned** with **partitions total**. In BigQuery, the dry-run estimate of bytes processed drops when partition filters work. In Spark, the physical plan lists `PartitionFilters` on the file scan.

### Pitfalls

- Functions or casts on the partition key (shown above).
- Relying on pruning through a join to a date dimension: some engines can do this (dynamic or runtime pruning), others cannot. Filter the fact table directly when it matters.
- Default partitions and open-ended ranges that keep extra partitions in every plan.

### In interviews

"The table is partitioned by date but the query still scans everything. Why?" Check the plan for pruned partitions, then look for a function on the key, a type mismatch, a filter on a different date column, or a filter that arrives through a join. Knowing how to confirm pruning in your engine's plan or profile is the key point.

## Materialized views

### What it is

A normal view is a stored query that runs every time you select from it. A **materialized view** stores the query's *result* as a table, so reads are as cheap as reading a small table. The trade-off is **staleness**: the stored result does not change when the base tables change until it is refreshed.

### How it works in PostgreSQL

```sql
CREATE MATERIALIZED VIEW daily_country_views AS
SELECT viewed_at::date AS view_date, country,
       count(*) AS views, count(DISTINCT user_id) AS users
FROM page_views
GROUP BY 1, 2;

SELECT * FROM daily_country_views WHERE view_date = '2026-03-01' ORDER BY country;
```

| view_date | country | views | users |
|---|---|---|---|
| 2026-03-01 | DE | 360 | 360 |
| 2026-03-01 | GB | 360 | 360 |
| 2026-03-01 | IN | 360 | 360 |
| 2026-03-01 | US | 360 | 360 |

New base data is not visible until a refresh:

```sql
INSERT INTO page_views VALUES (999999, 1, 'GB', '/p/1', '2026-03-01 12:00');
SELECT views FROM daily_country_views WHERE view_date = '2026-03-01' AND country = 'GB';
```

Still `360`. `REFRESH MATERIALIZED VIEW` reruns the whole query and, by default, locks out readers while it runs. `CONCURRENTLY` keeps the old contents readable during the refresh, but needs a unique index to match old and new rows:

<!-- expect-error -->
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_country_views;
```

`ERROR: cannot refresh materialized view "public.daily_country_views" concurrently`, with a hint to create a unique index.

```sql
CREATE UNIQUE INDEX daily_country_views_key ON daily_country_views (view_date, country);
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_country_views;
SELECT views FROM daily_country_views WHERE view_date = '2026-03-01' AND country = 'GB';
```

Now `361`. A concurrent refresh computes the full result and applies the differences, so it is usually slower than a plain refresh; it buys availability, not speed. PostgreSQL has no built-in incremental refresh: every refresh recomputes the full query.

### Engine differences

| Engine | Refresh | Notable limits |
|---|---|---|
| PostgreSQL | Manual `REFRESH`, full recompute | Schedule it yourself (cron, Airflow, pg_cron) |
| Snowflake | Maintained automatically in the background | Enterprise Edition feature; defined on a single table (no joins); limited functions |
| BigQuery | Incremental and automatic refresh; the optimiser can rewrite queries against the base table to use the view | Restricted SQL (supported aggregates and joins are limited) |
| Oracle, SQL Server (indexed views) | Fast or immediate refresh options | Strict rules on the defining query |

Check the current restrictions in your engine's documentation before designing around a materialized view. For transformations with joins in Snowflake, dynamic tables or a scheduled `MERGE` are the usual alternatives; in dbt, an incremental model plays the same role.

### Pitfalls

- **Stale data presented as current.** Record and expose the last refresh time.
- **Full refresh cost** grows with the base table; at some point an incremental table maintained by the pipeline is cheaper.
- **Refresh failures** leave old data in place silently. Monitor them like any pipeline task.
- **Dependency chains** of views on views make refresh order and locking complicated.

### In interviews

"When would you use a materialized view instead of a table built by your pipeline?" Good answer: for an expensive, frequently read aggregate whose freshness requirement fits the refresh schedule, when the engine can maintain it automatically or cheaply. Prefer a pipeline-managed incremental table when you need joins, custom incremental logic, data-quality checks or control over exactly when data changes.

## Columnar vs row storage

### What it is

The same table can be laid out on disk in two ways:

- **Row-oriented** (PostgreSQL, MySQL, SQL Server rowstore): all columns of a row are stored together. Reading or writing one whole row is one small, local operation.
- **Column-oriented** (Snowflake, BigQuery, Redshift, ClickHouse, DuckDB, Parquet and ORC files): each column is stored contiguously, usually in chunks of many thousands of rows with min/max statistics per chunk.

### Why columnar suits analytics

Analytical queries read a few columns from many rows: `SELECT country, count(*) FROM page_views GROUP BY country`. A columnar engine reads only the `country` column. Values of one column are also similar to each other, so they compress much better (dictionary encoding for repeated strings, run-length encoding for sorted runs, delta encoding for increasing numbers), and the engine can process them in vectorised batches.

A small simulation with generic `zlib` compression shows the shape of the effect:

```python
import random, zlib

random.seed(7)
countries = ["GB", "IN", "US", "DE"]
rows = [
    (i, random.randint(1, 5000), random.choice(countries), f"/p/{random.randint(0, 299)}", 1767225600 + i * 60)
    for i in range(100_000)
]

# Row layout: all fields of a row stored together.
row_bytes = "\n".join(",".join(map(str, r)) for r in rows).encode()

# Column layout: each column stored as its own contiguous block.
columns = list(zip(*rows))
col_blocks = {name: "\n".join(map(str, col)).encode()
              for name, col in zip(["view_id", "user_id", "country", "url", "viewed_at"], columns)}

print(f"row layout:    raw {len(row_bytes):>9,} B, compressed {len(zlib.compress(row_bytes)):>9,} B")
col_raw = sum(len(b) for b in col_blocks.values())
col_zip = sum(len(zlib.compress(b)) for b in col_blocks.values())
print(f"column layout: raw {col_raw:>9,} B, compressed {col_zip:>9,} B")
print(f"bytes read for 'SELECT country, count(*)': row layout {len(zlib.compress(row_bytes)):,} B, "
      f"column layout {len(zlib.compress(col_blocks['country'])):,} B")
```

```text
row layout:    raw 3,130,067 B, compressed   982,889 B
column layout: raw 3,130,063 B, compressed   820,595 B
bytes read for 'SELECT country, count(*)': row layout 982,889 B, column layout 39,204 B
```

Even with a general-purpose compressor, the column layout is smaller, and the query that needs one column reads about 4% of the bytes. Real columnar formats use type-aware encodings and do considerably better than this simulation.

### Why row storage suits transactions

An OLTP workload inserts, updates and reads individual rows by key: "fetch order 123 with all its fields", "update this account balance". In a row store that is one page. In a column store a single-row update touches every column's storage and usually rewrites a whole immutable chunk, which is why warehouses batch writes and why frequent single-row `UPDATE`s in Snowflake or BigQuery are slow and expensive.

| | Row store | Column store |
|---|---|---|
| Typical workload | OLTP: many small reads and writes by key | OLAP: scans and aggregations over many rows |
| Reads few columns of many rows | Reads whole rows anyway | Reads only those columns |
| Single-row insert or update | Cheap | Expensive; batch instead |
| Compression | Moderate | High |
| Skipping data | B-tree indexes | Min/max metadata per chunk, partitions, clustering |
| Examples | PostgreSQL, MySQL, SQL Server | Snowflake, BigQuery, Redshift, ClickHouse, DuckDB, Parquet |

Hybrids exist: SQL Server columnstore indexes, PostgreSQL extensions with columnar tables, and HTAP systems that keep both layouts.

### Pitfalls

- `SELECT *` throws away the main advantage of columnar storage.
- Row-at-a-time loading into a warehouse (one `INSERT` per event). Use bulk loads or micro-batches.
- Expecting a row store to scan billions of rows quickly for dashboards; replicate into a columnar store instead.

### In interviews

"Why are analytical databases columnar?" Mention reading only needed columns, better compression from similar values, vectorised execution and min/max skipping; then the trade-off for single-row writes. Linking it to file formats (Parquet and ORC are columnar, CSV and Avro are row-oriented) shows breadth.

## Sharding and distributed SQL

### What it is

**Sharding** splits data across several database servers (shards), each holding a subset of rows, so that storage and write throughput can grow beyond one machine. Partitioning splits a table inside one database; sharding splits it across machines. The **shard key** decides which server owns each row.

### How it works

- **Hash sharding**: shard = hash(key) mod N. Even spread, but range queries touch every shard.
- **Range sharding**: contiguous key ranges per shard. Range queries are local, but sequential keys (timestamps, increasing ids) send every new row to the last shard.
- **Directory or lookup sharding**: a mapping table says which shard owns which key or tenant. Flexible, but the directory must be highly available.

A query that filters on the shard key is routed to one shard. Any other query is a **scatter-gather**: sent to all shards, with partial results merged. Joins between tables sharded on different keys need data to move across the network.

### Choosing the shard key

The simulation below routes 10,000 orders to 4 shards. One customer is a large marketplace seller that places a quarter of all orders.

```python
import hashlib
from collections import Counter

def shard_for(key, n_shards):
    """Stable hash routing: the same key always goes to the same shard."""
    digest = hashlib.md5(str(key).encode()).hexdigest()
    return int(digest, 16) % n_shards

# 10,000 orders from 1,000 customers, but customer 7 is a huge marketplace seller.
orders = [(order_id, 7 if order_id % 4 == 0 else order_id % 1000) for order_id in range(10_000)]

by_customer = Counter(shard_for(customer, 4) for _, customer in orders)
by_order = Counter(shard_for(order_id, 4) for order_id, _ in orders)
print("rows per shard, sharded by customer_id:", dict(sorted(by_customer.items())))
print("rows per shard, sharded by order_id:   ", dict(sorted(by_order.items())))

# Resharding cost with plain modulo hashing: how many keys move from 4 to 5 shards?
moved = sum(shard_for(k, 4) != shard_for(k, 5) for k in range(10_000))
print(f"keys that move when going from 4 to 5 shards: {moved / 10_000:.0%}")
```

```text
rows per shard, sharded by customer_id: {0: 1910, 1: 1780, 2: 1740, 3: 4570}
rows per shard, sharded by order_id:    {0: 2518, 1: 2460, 2: 2474, 3: 2548}
keys that move when going from 4 to 5 shards: 80%
```

Sharding by `customer_id` keeps each customer's orders together (queries for one customer hit one shard) but the big seller makes shard 3 a hot spot with more than twice the average load. Sharding by `order_id` balances perfectly but scatters every "orders for customer X" query across all shards. There is no free choice: pick the key that matches the most important access path, and plan for skewed keys.

The last line shows why plain modulo hashing makes adding a shard painful: most keys move. Real systems use **consistent hashing** or many small virtual shards (ranges of hash values) that can be moved between servers individually, so adding capacity moves only a fraction of the data.

### Distributed SQL systems

- **Citus** (PostgreSQL extension) distributes tables by a distribution column and co-locates tables sharded on the same key so their joins stay local.
- **Vitess** shards MySQL behind a routing layer.
- **CockroachDB, YugabyteDB and Google Spanner** split tables into ranges automatically, move and replicate them, and provide distributed transactions.
- **MPP warehouses** (Redshift distribution keys, Synapse distributions) use the same idea for analytics; Snowflake and BigQuery separate storage from compute and distribute work for you.

<!-- noexec -->
```sql
-- Citus: shard orders and customers by customer_id so joins on it stay on one node
SELECT create_distributed_table('customers', 'customer_id');
SELECT create_distributed_table('orders', 'customer_id', colocate_with => 'customers');
```

### Pitfalls

- **Hot shards** from skewed keys or monotonically increasing range keys.
- **Cross-shard transactions and joins** are slower and more complex; unique constraints across shards are hard.
- **Resharding** is an operational project; design for it (virtual shards, consistent hashing) from the start.
- **Sharding too early.** A single well-indexed, partitioned PostgreSQL server with read replicas goes a long way; sharding adds permanent complexity.

### In interviews

"How would you scale this database beyond one server?" Start with what one node can do (indexes, partitioning, replicas for reads, caching), then choose a shard key from the dominant access pattern, explain hot-key handling, routing, cross-shard queries and resharding. Mentioning co-location of related tables on the same key is a strong detail.

## Practice questions

<details><summary>What is the difference between partitioning and sharding?</summary>

Partitioning splits a table into pieces inside one database, mainly for pruning and lifecycle management; all partitions share the same server. Sharding spreads rows across multiple servers so that storage and write throughput scale out; each shard is a separate database, and queries that do not include the shard key must contact every shard.

</details>

<details><summary>A table is partitioned by event_date, but a query with WHERE YEAR(event_date) = 2026 scans every partition. Fix it.</summary>

The function on the partition key prevents pruning. Rewrite as a range on the raw column: `event_date >= '2026-01-01' AND event_date < '2027-01-01'`. Confirm with the plan (partitions listed, or partitions scanned versus total in a warehouse profile).

</details>

<details><summary>How would you delete data older than 13 months from a 2-billion-row events table?</summary>

Partition the table by month (or day) on the event date and drop or detach the expired partitions on a schedule. This is a metadata operation that finishes in moments, avoids millions of dead rows and does not bloat the table. A `DELETE` would take a long time, generate a lot of log and leave vacuum work behind.

</details>

<details><summary>Why does REFRESH MATERIALIZED VIEW CONCURRENTLY need a unique index, and is it faster?</summary>

It computes the new result and compares it with the old contents to apply only the differences, keeping the view readable meanwhile. Matching old and new rows requires a unique key, provided by a unique index. It is usually slower than a plain refresh, because of the comparison; its benefit is that readers are not blocked.

</details>

<details><summary>Why are columnar formats faster for analytics, and when are they a bad choice?</summary>

Analytical queries read a few columns from many rows; columnar storage reads only those columns, compresses similar values well, supports vectorised processing and lets engines skip chunks using min/max statistics. They are a bad choice for workloads dominated by single-row inserts, updates and lookups by key, which row stores handle efficiently.

</details>

<details><summary>You must shard a multi-tenant SaaS database. What shard key do you choose, and what can go wrong?</summary>

Usually `tenant_id`, since almost every query is scoped to one tenant; co-locate all tenant tables on it so joins stay on one shard. Risks: a few very large tenants create hot shards (move them to dedicated shards or split them), cross-tenant analytics become scatter-gather (replicate into a warehouse instead), and resharding is costly unless tenants map to virtual shards that can be moved.

</details>

## Key takeaways

- Partition big tables by the column most queries filter on, at a grain that keeps partitions reasonably large; use partitions for pruning, lifecycle and idempotent reloads.
- Pruning needs a filter on the raw partition key; confirm it in the plan, and watch default partitions and open-ended ranges.
- Materialized views trade freshness for read speed; know your engine's refresh model and restrictions, and monitor refreshes.
- Columnar storage reads only needed columns and compresses well, which suits analytics; row storage suits single-row transactions.
- Sharding scales across servers; the shard key decides balance, routing and which queries become scatter-gather.
- Plan for skew and growth: hot partitions or shards, and resharding with consistent hashing or virtual shards.

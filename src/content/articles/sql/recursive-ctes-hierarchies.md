---
title: "Recursive CTEs: Hierarchies and Graph Traversal in SQL"
seoTitle: "Recursive CTEs: Hierarchies and Graphs in SQL"
description: "Learn how recursive CTEs work step by step, then use them to walk org charts, roll up hierarchies and traverse graphs safely without infinite loops."
technology: ["sql"]
topic: ["recursive-ctes", "hierarchies", "graphs"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Explain how the anchor and recursive members of a recursive CTE are evaluated, and when recursion stops"
  - "Walk a hierarchy down (all reports) and up (chain of command) and compute depth and path"
  - "Roll up counts or costs over every level of a hierarchy"
  - "Traverse a graph with cycles safely using path arrays, UNION or the CYCLE clause"
  - "Describe engine differences such as recursion limits and CONNECT BY"
prerequisites: ["articles:sql/ctes-subqueries-temp-tables", "articles:sql/joins"]
related: ["articles:sql/window-functions", "articles:data-warehousing/star-schema"]
versionContext: "SQL examples run on PostgreSQL 16.14 (SEARCH and CYCLE clauses need PostgreSQL 14 or later). The Snowflake CONNECT BY and SQL Server snippets were not executed."
sources:
  - { label: "PostgreSQL documentation: WITH queries (common table expressions)", url: "https://www.postgresql.org/docs/current/queries-with.html" }
  - { label: "Snowflake documentation: Querying hierarchical data", url: "https://docs.snowflake.com/en/user-guide/queries-hierarchical" }
  - { label: "BigQuery documentation: Work with recursive CTEs", url: "https://cloud.google.com/bigquery/docs/recursive-ctes" }
  - { label: "Databricks documentation: Common table expression (CTE)", url: "https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-cte" }
---

A recursive CTE lets a query refer to its own output, so it can follow a chain of rows for as many steps as the data needs. That is how you answer "everyone who reports to this manager", "every component inside this product" or "every airport reachable from here" without knowing the depth in advance. Data Engineers meet these shapes in org charts, category trees, bills of materials, lineage graphs and account hierarchies.

## Sample data

Two small tables: an org chart stored as an **adjacency list** (each row points at its manager) and a set of one-way flight routes that contains cycles.

```sql
CREATE TABLE employees (
  emp_id     INT PRIMARY KEY,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL,
  manager_id INT REFERENCES employees(emp_id)
);
INSERT INTO employees VALUES
  (1, 'Asha',  'CEO',               NULL),
  (2, 'Ben',   'VP Engineering',    1),
  (3, 'Chen',  'VP Sales',          1),
  (4, 'Dana',  'Data Eng Manager',  2),
  (5, 'Eli',   'Data Engineer',     4),
  (6, 'Fatima','Data Engineer',     4),
  (7, 'Gus',   'Account Exec',      3),
  (8, 'Hana',  'Platform Engineer', 2);

CREATE TABLE routes (src TEXT, dst TEXT, km INT);
INSERT INTO routes VALUES
  ('LHR','JFK',5540), ('LHR','DXB',5500), ('DXB','SIN',5840),
  ('JFK','SFO',4150), ('SFO','SIN',13590), ('SIN','LHR',10880),
  ('DXB','BOM',1930), ('BOM','SIN',3900);
```

## Recursive CTEs

### What it is

An ordinary CTE names a subquery. A **recursive** CTE names a subquery that is built in rounds: a starting set of rows, then more rows derived from the rows found in the previous round, until a round finds nothing new. It is the SQL way of writing a loop.

### How it works

```sql
WITH RECURSIVE n(i) AS (
  SELECT 1                          -- anchor member: runs once
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5   -- recursive member: runs per round
)
SELECT i FROM n;
```

Result: five rows, `1, 2, 3, 4, 5`.

The engine evaluates it like this:

1. Run the **anchor member** (the part before `UNION ALL`). Its rows go to the result and into a "working table".
2. Run the **recursive member**, where the reference to `n` means *only the rows in the working table*, that is, the rows produced by the previous round, not the whole result so far.
3. Add the new rows to the result, and make them the new working table.
4. Repeat step 2 until a round returns no rows.

So the recursion stops when the recursive member produces nothing, usually because a `WHERE` condition fails or a join finds no more matches. Nothing else stops it.

Rules that hold in most engines:

- PostgreSQL, MySQL, Snowflake, BigQuery and Databricks write `WITH RECURSIVE`. SQL Server and Oracle write plain `WITH` and detect recursion themselves.
- The anchor and recursive member are joined with `UNION ALL` (some engines also accept `UNION`, which removes duplicate rows each round).
- Column types are fixed by the anchor. If the anchor produces `VARCHAR(10)` and the recursive member appends to it, you can get a type error or truncation, so cast in the anchor (`name::text`, `CAST(x AS VARCHAR)`).
- The recursive member may reference the CTE only once, and usually cannot use aggregates, `DISTINCT`, `LIMIT` or outer joins on the recursive reference. Do aggregation in the outer query.

### Pitfalls

- **No termination condition.** If the data contains a cycle, or the recursive member never runs dry, the query runs until it hits a timeout, an engine limit or memory. See the graph section for guards.
- **Thinking the recursive member sees all rows so far.** It sees only the previous round, which is why a "visited" set has to be carried in the row itself (a path array).
- **Order.** The output has no guaranteed order. Add a depth or path column and `ORDER BY` it in the outer query.

### In interviews

You may be asked to generate a number or date series, or to explain how a recursive CTE terminates. A strong answer names the anchor and recursive members, says the recursive member only sees the previous iteration's rows, and mentions a guard against cycles. If asked for a date series in PostgreSQL, also mention `generate_series`, which is simpler and faster than recursion.

## Hierarchical and org-chart queries

### What it is

A hierarchy is a tree: every node has at most one parent. Most operational databases store it as an **adjacency list** (`manager_id` points at the parent), which is easy to update but cannot be walked to arbitrary depth with ordinary joins. Recursive CTEs fill that gap.

### Walking down: the whole tree with depth and path

```sql
WITH RECURSIVE org AS (
  SELECT emp_id, name, manager_id, 0 AS depth, name::text AS path
  FROM employees
  WHERE manager_id IS NULL                      -- anchor: the root
  UNION ALL
  SELECT e.emp_id, e.name, e.manager_id, o.depth + 1, o.path || ' > ' || e.name
  FROM employees e
  JOIN org o ON e.manager_id = o.emp_id         -- children of last round's rows
)
SELECT emp_id, name, depth, path FROM org ORDER BY path;
```

| emp_id | name | depth | path |
|---|---|---|---|
| 1 | Asha | 0 | Asha |
| 2 | Ben | 1 | Asha > Ben |
| 4 | Dana | 2 | Asha > Ben > Dana |
| 5 | Eli | 3 | Asha > Ben > Dana > Eli |
| 6 | Fatima | 3 | Asha > Ben > Dana > Fatima |
| 8 | Hana | 2 | Asha > Ben > Hana |
| 3 | Chen | 1 | Asha > Chen |
| 7 | Gus | 2 | Asha > Chen > Gus |

The anchor selects the root, each round adds the next level down, and the path is built by concatenation. Sorting by a text path gives a readable tree as long as names do not contain the separator.

### All reports under one manager

Change the anchor to start below a specific node:

```sql
WITH RECURSIVE reports AS (
  SELECT emp_id, name, 1 AS level FROM employees WHERE manager_id = 2
  UNION ALL
  SELECT e.emp_id, e.name, r.level + 1
  FROM employees e JOIN reports r ON e.manager_id = r.emp_id
)
SELECT * FROM reports ORDER BY level, emp_id;
```

| emp_id | name | level |
|---|---|---|
| 4 | Dana | 1 |
| 8 | Hana | 1 |
| 5 | Eli | 2 |
| 6 | Fatima | 2 |

### Walking up: the chain of command

Reverse the join direction: start at a leaf and join to the row whose `emp_id` equals the current row's `manager_id`.

```sql
WITH RECURSIVE chain AS (
  SELECT emp_id, name, manager_id, 0 AS steps FROM employees WHERE name = 'Eli'
  UNION ALL
  SELECT m.emp_id, m.name, m.manager_id, c.steps + 1
  FROM employees m JOIN chain c ON m.emp_id = c.manager_id
)
SELECT steps, name FROM chain ORDER BY steps;
```

| steps | name |
|---|---|
| 0 | Eli |
| 1 | Dana |
| 2 | Ben |
| 3 | Asha |

### Rolling up over every level

"How many people sit under each manager, at any depth?" Generate every (ancestor, descendant) pair, then aggregate outside the recursion:

```sql
WITH RECURSIVE pairs AS (
  SELECT manager_id AS ancestor, emp_id AS descendant
  FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT p.ancestor, e.emp_id
  FROM pairs p JOIN employees e ON e.manager_id = p.descendant
)
SELECT a.name, COUNT(*) AS total_reports
FROM pairs p JOIN employees a ON a.emp_id = p.ancestor
GROUP BY a.name
ORDER BY total_reports DESC, a.name;
```

| name | total_reports |
|---|---|
| Asha | 7 |
| Ben | 4 |
| Dana | 2 |
| Chen | 1 |

The `pairs` result is a **closure table**: one row per ancestor-descendant pair. The same pattern sums salaries per department tree or costs per bill-of-materials assembly (multiply quantities along the path instead of counting).

### Depth-first display order

PostgreSQL 14+ (and the SQL standard) has a `SEARCH` clause that adds an ordering column for depth-first or breadth-first output:

```sql
WITH RECURSIVE org AS (
  SELECT emp_id, name, manager_id, 0 AS depth FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, e.manager_id, o.depth + 1
  FROM employees e JOIN org o ON e.manager_id = o.emp_id
) SEARCH DEPTH FIRST BY emp_id SET ord
SELECT repeat('  ', depth) || name AS tree FROM org ORDER BY ord;
```

```text
Asha
  Ben
    Dana
      Eli
      Fatima
    Hana
  Chen
    Gus
```

### Other ways to store a hierarchy

| Model | How it works | Good for | Cost |
|---|---|---|---|
| Adjacency list | `parent_id` column | Simple writes, moves | Reads need recursion |
| Materialised path | `path = '1/2/4/5'` | Subtree via `LIKE '1/2/%'` | Moving a subtree rewrites paths |
| Closure table | One row per ancestor-descendant pair | Fast subtree and rollup reads | Many rows, maintenance on writes |
| Nested sets | Left/right numbers per node | Fast subtree reads | Expensive inserts |

In a warehouse, a common pattern is to keep the adjacency list in the source and build a flattened hierarchy or closure table in a scheduled job with a recursive CTE, so that BI queries never recurse.

### Engine notes

<!-- noexec -->
```sql
-- Snowflake (and Oracle): CONNECT BY, a self-join-only alternative
SELECT emp_id, name, LEVEL AS depth,
       SYS_CONNECT_BY_PATH(name, ' > ') AS path
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR emp_id = manager_id;

-- SQL Server: no RECURSIVE keyword; default recursion limit is 100 levels
WITH org AS (...)
SELECT * FROM org OPTION (MAXRECURSION 500);
```

BigQuery stops a recursive CTE after a fixed number of iterations (500 at the time of writing) and Databricks applies a default recursion-level limit that you can raise with `MAX RECURSION LEVEL`. Check the current limits in your engine's documentation before relying on deep recursion.

### Pitfalls

- **Orphans and multiple roots.** A row whose `manager_id` points at a missing employee never appears when you start from `manager_id IS NULL`. Check for orphans with an anti-join before trusting rollups.
- **Bad data creating a cycle.** If someone becomes their own indirect manager, a downward walk never ends. Use one of the guards below even on "trees".
- **Double counting.** If a node can have two parents (a DAG, not a tree), the closure table contains duplicate paths. Use `COUNT(DISTINCT descendant)`.

### In interviews

"Find all direct and indirect reports of manager X", "show each employee's level" and "find the top-level manager for each employee" are the classic prompts. State the anchor, the join direction (down: `child.manager_id = parent.id`; up: `parent.id = child.manager_id`), how you track depth, and what happens with cycles or orphans. Mentioning the closure table or a flattened hierarchy dimension for BI shows warehouse experience.

## Graph traversal in SQL

### What it is

A graph is a hierarchy without the "one parent" rule: nodes can have many incoming and outgoing edges, and edges can form **cycles** (LHR to DXB to SIN to LHR). Store it as an edge table (`src`, `dst`, optional weight). Typical questions are reachability, shortest path by hops or weight, and listing all paths up to some length.

### All paths, with a visited set carried in the row

Because the recursive member only sees the previous round, you carry the visited nodes along in an array and refuse to revisit them:

```sql
WITH RECURSIVE trips AS (
  SELECT dst AS city, ARRAY['LHR', dst] AS path, km AS total_km
  FROM routes WHERE src = 'LHR'
  UNION ALL
  SELECT r.dst, t.path || r.dst, t.total_km + r.km
  FROM trips t
  JOIN routes r ON r.src = t.city
  WHERE r.dst <> ALL (t.path)          -- do not revisit a node on this path
    AND array_length(t.path, 1) < 5    -- hard depth limit as a second guard
)
SELECT array_to_string(path, ' > ') AS route, total_km
FROM trips
WHERE city = 'SIN'
ORDER BY total_km;
```

| route | total_km |
|---|---|
| LHR > DXB > BOM > SIN | 11330 |
| LHR > DXB > SIN | 11340 |
| LHR > JFK > SFO > SIN | 23280 |

The cheapest route has three legs, which is why "shortest by hops" and "shortest by distance" are different questions.

### Shortest number of hops (breadth-first)

```sql
WITH RECURSIVE bfs AS (
  SELECT 'LHR'::text AS city, 0 AS hops, ARRAY['LHR'] AS path
  UNION ALL
  SELECT r.dst, b.hops + 1, b.path || r.dst
  FROM bfs b JOIN routes r ON r.src = b.city
  WHERE r.dst <> ALL (b.path)
)
SELECT city, MIN(hops) AS min_hops FROM bfs GROUP BY city ORDER BY min_hops, city;
```

| city | min_hops |
|---|---|
| LHR | 0 |
| DXB | 1 |
| JFK | 1 |
| BOM | 2 |
| SFO | 2 |
| SIN | 2 |

This enumerates every simple path and then takes the minimum, which is fine for small graphs but grows exponentially with branching. SQL has no priority queue, so a true Dijkstra is awkward; for large graphs use a graph engine or library and keep SQL for preparing the edges.

### Reachability with UNION

If you only need the set of reachable nodes, `UNION` (not `UNION ALL`) discards rows already produced, so a cycle stops by itself once nothing new appears:

```sql
WITH RECURSIVE reach(city) AS (
  SELECT 'LHR'::text
  UNION
  SELECT r.dst FROM reach JOIN routes r ON r.src = reach.city
)
SELECT city FROM reach ORDER BY city;
```

Result: `BOM, DXB, JFK, LHR, SFO, SIN`. This only works because the row is just the city. Add a `hops` column and every revisit produces a new, distinct row, so the loop never ends.

### The CYCLE clause

PostgreSQL 14+ implements the standard `CYCLE` clause, which tracks visited keys for you and marks the row where a cycle closes:

```sql
WITH RECURSIVE reach AS (
  SELECT src, dst FROM routes WHERE src = 'LHR'
  UNION ALL
  SELECT r.src, r.dst FROM reach x JOIN routes r ON r.src = x.dst
) CYCLE dst SET is_cycle USING visited
SELECT DISTINCT dst FROM reach WHERE NOT is_cycle ORDER BY dst;
```

It returns the same six cities. `visited` is the hidden path array and `is_cycle` is true on the row that revisits a node; that row is not expanded further.

### What happens without a guard

<!-- expect-error -->
```sql
SET statement_timeout = '1s';
WITH RECURSIVE walk(city, hops) AS (
  SELECT 'LHR'::text, 0
  UNION ALL
  SELECT r.dst, w.hops + 1 FROM walk w JOIN routes r ON r.src = w.city
)
SELECT count(*) FROM walk;
```

PostgreSQL keeps going round the LHR, DXB, SIN loop until the timeout cancels it: `ERROR: canceling statement due to statement timeout`. Engines with an iteration limit (BigQuery, Databricks, SQL Server) fail with a limit error instead.

### Pitfalls

- **Exponential path explosion.** Dense graphs have huge numbers of simple paths. Always add a depth limit, filter edges early, and prefer reachability (`UNION`) when you do not need paths.
- **Undirected graphs.** Store both directions or `UNION ALL` the reversed edges in a CTE before recursing.
- **Arrays are engine-specific.** Path arrays are PostgreSQL, DuckDB, Snowflake (`ARRAY_APPEND`, `ARRAY_CONTAINS`) and BigQuery (`ARRAY_CONCAT`, `IN UNNEST(path)`) syntax. Where arrays are missing, use a delimited string and a `LIKE`/`POSITION` check.

### In interviews

Expect "find all flight connections from A to B with at most two stops", "detect cycles in a dependency table" or "find all upstream tables of a dashboard in a lineage graph". Walk through the anchor, the edge join, the visited check, the depth limit and how you pick the best path at the end. Being honest that SQL is a poor fit for weighted shortest paths on big graphs, and naming an alternative, is a strong signal.

## Practice questions

<details><summary>Why does a recursive CTE stop, and what makes it run forever?</summary>

It stops when an iteration of the recursive member returns no rows. It runs forever when every iteration keeps producing rows, typically because the data has a cycle and nothing prevents revisiting a node, or because a counter has no upper bound. Guards: a path array with a "not already visited" check, a depth limit, `UNION` for pure reachability, or the `CYCLE` clause.

</details>

<details><summary>Write a query that returns every employee with the name of their top-level manager.</summary>

Carry the root through the recursion:

```sql
WITH RECURSIVE org AS (
  SELECT emp_id, name, name AS root_name FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, o.root_name
  FROM employees e JOIN org o ON e.manager_id = o.emp_id
)
SELECT name, root_name FROM org ORDER BY emp_id;
```

Every row returns `Asha` as the root here. If the table has several roots (several companies or business units), each subtree gets its own root.

</details>

<details><summary>In the recursive member, does the self-reference see all rows produced so far?</summary>

No. It sees only the rows produced by the previous iteration (the working table). That is why cycle detection needs the visited nodes carried in each row, for example as a path array, rather than a `NOT IN (SELECT ... FROM cte)` check.

</details>

<details><summary>How would you count all direct and indirect reports per manager?</summary>

Build ancestor-descendant pairs recursively (start with each direct manager-employee pair, then extend each pair with the descendant's own reports), then `GROUP BY ancestor` in the outer query. Aggregates are not allowed inside the recursive member in most engines. If the structure can have multiple parents, use `COUNT(DISTINCT descendant)`.

</details>

<details><summary>Your BI tool runs a recursive org-chart query on every dashboard load and it is slow. What do you change?</summary>

Precompute. Run the recursive CTE in a scheduled transformation and store either a flattened hierarchy (one column per level) or a closure table (ancestor, descendant, depth). Dashboards then join to it with ordinary equality joins. Rebuild when the source hierarchy changes, and add data-quality checks for orphans and cycles.

</details>

<details><summary>UNION or UNION ALL in a recursive CTE?</summary>

`UNION ALL` is the default choice: it is cheaper and keeps all rows, which you need when tracking paths or depth. `UNION` removes rows that are identical to ones already produced, which makes pure reachability terminate on cyclic graphs, but it does nothing once each row carries a changing column such as depth or path.

</details>

## Key takeaways

- A recursive CTE is an anchor query plus a recursive query repeated until it returns no rows; each round sees only the previous round's rows.
- Walk down a hierarchy by joining children to the last round's rows, and up by joining to the parent's key.
- Carry depth, path and root columns through the recursion, and aggregate in the outer query.
- Graphs need cycle guards: a visited path array, a depth limit, `UNION` for reachability, or the `CYCLE` clause.
- For heavy or repeated use, materialise a closure table or flattened hierarchy instead of recursing in every query.
- Engines differ in syntax (`WITH RECURSIVE` versus `WITH`, `CONNECT BY`) and in recursion limits.

---
title: "Transactions, Isolation Levels, Locking and MVCC"
seoTitle: "Transactions, Isolation Levels, Locks and MVCC"
description: "Understand ACID transactions, isolation levels and the anomalies they allow, row locks and deadlocks, and how MVCC lets readers and writers work at the same time."
technology: ["sql"]
topic: ["transactions", "isolation-levels", "locking", "mvcc"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
learningObjectives:
  - "Explain each ACID property with a concrete failure it prevents"
  - "Name the anomalies (dirty read, non-repeatable read, phantom, lost update, write skew) and which isolation levels allow them"
  - "Predict PostgreSQL's behaviour at READ COMMITTED, REPEATABLE READ and SERIALIZABLE, and handle serialization failures with retries"
  - "Explain row locks, lock waits and deadlocks, and prevent deadlocks with consistent ordering and short transactions"
  - "Describe how MVCC keeps row versions, decides visibility and needs vacuuming"
prerequisites: ["articles:sql/sql-fundamentals", "articles:sql/indexes"]
related: ["articles:delta-lake/transactions-schema-evolution", "articles:etl-elt/idempotency-in-data-pipelines", "articles:etl-elt/cdc-patterns-and-failure-modes"]
previous: "articles:sql/sql-performance-at-scale"
versionContext: "Single-session examples run on PostgreSQL 16.14. The two-session timelines are marked as not executed by the page verifier, but each was reproduced on PostgreSQL 16.14 with two concurrent psql sessions driven by a Python script; the outputs shown are from those runs. Transaction ids and row positions vary between runs."
sources:
  - { label: "PostgreSQL 16 documentation: Transaction isolation", url: "https://www.postgresql.org/docs/16/transaction-iso.html" }
  - { label: "Snowflake documentation: Transactions", url: "https://docs.snowflake.com/en/sql-reference/transactions" }
  - { label: "PostgreSQL 16 documentation: Index-only scans and the visibility map", url: "https://www.postgresql.org/docs/16/indexes-index-only-scans.html" }
---

A transaction groups several statements into one unit that either happens completely or not at all, and isolation decides what concurrent transactions can see of each other. Data Engineers meet these rules when pipelines write to operational databases, when CDC tools read from them, when two jobs update the same table, and in lakehouse formats that bring transactions to files. Interviewers use isolation anomalies and deadlocks to check that you understand what happens when two things run at once.

## Sample data

```sql
CREATE TABLE accounts (
  id      INT PRIMARY KEY,
  owner   TEXT NOT NULL,
  balance NUMERIC(10,2) NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES (1, 'Asha', 100.00), (2, 'Ben', 50.00);

CREATE TABLE doctors (name TEXT PRIMARY KEY, on_call BOOLEAN NOT NULL);
INSERT INTO doctors VALUES ('Dana', true), ('Eli', true);
```

In the two-session timelines below, **A** and **B** are separate connections. A statement without `BEGIN` runs in its own transaction and commits immediately (autocommit).

## Isolation levels and ACID

### ACID in one paragraph each

- **Atomicity**: all statements in the transaction take effect, or none do. A transfer that credits Ben but fails to debit Asha must leave no trace.
- **Consistency**: a transaction moves the database from one valid state to another, as defined by constraints (keys, `CHECK`, foreign keys). The database enforces the constraints you declare; business rules you do not declare are your responsibility.
- **Isolation**: concurrent transactions do not see each other's partial work, and the result is as if they ran in some order, to the degree the isolation level promises.
- **Durability**: once `COMMIT` returns, the change survives a crash. Databases achieve this by writing to a write-ahead log (WAL) and flushing it before acknowledging the commit.

### Atomicity in action

The transfer below credits Ben, then tries to debit Asha more than she has. The `CHECK` constraint fails, and the whole transaction is rolled back, including the credit that had already succeeded:

<!-- expect-error -->
```sql
BEGIN;
UPDATE accounts SET balance = balance + 120 WHERE id = 2;
UPDATE accounts SET balance = balance - 120 WHERE id = 1;
COMMIT;
```

`ERROR: new row for relation "accounts" violates check constraint "accounts_balance_check"`. Balances afterwards:

```sql
SELECT id, owner, balance FROM accounts ORDER BY id;
```

| id | owner | balance |
|---|---|---|
| 1 | Asha | 100.00 |
| 2 | Ben | 50.00 |

**Savepoints** let you undo part of a transaction without abandoning all of it:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
SAVEPOINT before_bonus;
UPDATE accounts SET balance = balance + 1000 WHERE id = 2;
ROLLBACK TO SAVEPOINT before_bonus;
UPDATE accounts SET balance = balance + 30 WHERE id = 2;
COMMIT;
SELECT id, owner, balance FROM accounts ORDER BY id;
```

| id | owner | balance |
|---|---|---|
| 1 | Asha | 70.00 |
| 2 | Ben | 80.00 |

### Anomalies that isolation levels allow

Isolation levels are defined by which anomalies they permit:

| Anomaly | What happens |
|---|---|
| Dirty read | You read another transaction's uncommitted change, which may then be rolled back |
| Non-repeatable read | You read a row twice and get different values because another transaction committed in between |
| Phantom read | You run the same filter twice and get a different *set* of rows because another transaction inserted or deleted matching rows |
| Lost update | Two transactions read a value, both compute a new value from it and write; one write silently overwrites the other |
| Write skew | Two transactions read overlapping data, each makes a decision based on it and updates *different* rows; together they break a rule neither broke alone |

| Level (SQL standard) | Dirty read | Non-repeatable read | Phantom | PostgreSQL behaviour |
|---|---|---|---|---|
| READ UNCOMMITTED | allowed | allowed | allowed | Treated as READ COMMITTED (no dirty reads) |
| READ COMMITTED | prevented | allowed | allowed | Default; each **statement** sees a new snapshot |
| REPEATABLE READ | prevented | prevented | allowed | Snapshot for the whole **transaction**; phantoms also prevented; write skew possible |
| SERIALIZABLE | prevented | prevented | prevented | Snapshot plus conflict detection (SSI); aborts transactions that could not have run serially |

The standard only says what must be *prevented*; engines may prevent more. Defaults differ: PostgreSQL, Oracle and SQL Server default to READ COMMITTED, and MySQL InnoDB defaults to REPEATABLE READ. Snowflake supports only READ COMMITTED for standard tables. Same name, different implementation: always check your engine's documentation.

### READ COMMITTED: each statement sees the latest committed data

<!-- noexec -->
```sql
-- Timeline (A and B are separate sessions)
-- A: BEGIN ISOLATION LEVEL READ COMMITTED;
-- A: SELECT balance FROM accounts WHERE id = 1;            -- 100.00
-- B: UPDATE accounts SET balance = balance - 30 WHERE id = 1;   -- autocommit
-- A: SELECT balance FROM accounts WHERE id = 1;            -- 70.00
-- A: COMMIT;
```

| Step | Session A (READ COMMITTED) | Session B | A sees |
|---|---|---|---|
| 1 | `BEGIN`; read balance | | 100.00 |
| 2 | | `UPDATE ... - 30` (commits) | |
| 3 | read balance again | | **70.00** (non-repeatable read) |

Each statement in A takes a fresh snapshot, so a report built from several queries in one READ COMMITTED transaction can mix data from before and after another commit.

### REPEATABLE READ: one snapshot for the transaction

| Step | Session A (REPEATABLE READ) | Session B | A sees |
|---|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL REPEATABLE READ`; read balance | | 100.00 |
| 2 | | `UPDATE ... - 30` (commits) | |
| 3 | read balance again | | **100.00** (same snapshot) |
| 4 | `COMMIT`; read balance | | 70.00 |

This is what you want for a consistent multi-query export or reconciliation: every query in the transaction sees the database as of its first statement. PostgreSQL's `pg_dump` relies on the same idea to take a consistent backup while the database is in use.

### Lost updates and how to avoid them

The classic bug is read-modify-write in application code: both sessions read 100, compute a new balance and write it back.

| Step | Session A (READ COMMITTED) | Session B (READ COMMITTED) |
|---|---|---|
| 1 | `BEGIN`; read balance: 100.00 | `BEGIN`; read balance: 100.00 |
| 2 | `UPDATE ... SET balance = 70` (100 - 30) | |
| 3 | | `UPDATE ... SET balance = 80` (100 - 20): **waits** for A's row lock |
| 4 | `COMMIT` | update proceeds |
| 5 | | `COMMIT`; final balance **80.00** |

Both withdrawals "succeeded", but only B's is reflected: A's 30 was lost. Fixes:

1. **Atomic relative updates**: `UPDATE accounts SET balance = balance - 30 WHERE id = 1`. At READ COMMITTED, B's update waits, then re-reads the committed row and applies its change to it. In the reproduction, A's -30 and B's -20 gave the correct 50.00.
2. **Lock the row when reading** it for a later write: `SELECT ... FOR UPDATE` makes the second reader wait until the first commits.
3. **Optimistic concurrency**: keep a `version` column and update with `WHERE id = 1 AND version = :read_version`; zero rows updated means someone else got there first, so re-read and retry.
4. **REPEATABLE READ or SERIALIZABLE**: PostgreSQL refuses B's update instead of overwriting:

| Step | Session A (REPEATABLE READ) | Session B (REPEATABLE READ) |
|---|---|---|
| 1 | read balance: 100.00 | read balance: 100.00 |
| 2 | `UPDATE ... - 30` | |
| 3 | | `UPDATE ... - 20`: waits for A |
| 4 | `COMMIT` | `ERROR: could not serialize access due to concurrent update` |

B must roll back and **retry the whole transaction**. Applications that use REPEATABLE READ or SERIALIZABLE in PostgreSQL must be written to retry on serialization failures (SQLSTATE `40001`).

### Write skew and SERIALIZABLE

The rule: at least one doctor must stay on call. Both transactions check the rule, see two doctors on call, and each takes a *different* doctor off call.

<!-- noexec -->
```sql
-- Each session, at the chosen isolation level:
BEGIN ISOLATION LEVEL REPEATABLE READ;   -- or SERIALIZABLE
SELECT count(*) FROM doctors WHERE on_call;                    -- both see 2
UPDATE doctors SET on_call = false WHERE name = 'Dana';        -- B updates 'Eli'
COMMIT;
```

| Step | Session A | Session B |
|---|---|---|
| 1 | count on call: 2 | count on call: 2 |
| 2 | take Dana off call | take Eli off call |
| 3 | `COMMIT` | `COMMIT` |
| REPEATABLE READ | commits | commits: **nobody is on call** |
| SERIALIZABLE | commits | `ERROR: could not serialize access due to read/write dependencies among transactions` |

At REPEATABLE READ the two updates touch different rows, so there is no write conflict, and the rule is broken. PostgreSQL's SERIALIZABLE level uses **Serializable Snapshot Isolation (SSI)**: it tracks which transactions read data that others wrote, and aborts one when the pattern could not have happened in any serial order. In the reproduction, B's `COMMIT` failed with the hint that it might succeed if retried, and Eli stayed on call. The alternatives at lower levels are explicit locks (`SELECT ... FOR UPDATE` on the rows the rule depends on) or a constraint the database can enforce.

### Pitfalls

- Assuming the default is SERIALIZABLE. Most databases default to READ COMMITTED.
- Using REPEATABLE READ or SERIALIZABLE without retry logic: serialization failures are normal, not bugs.
- Read-modify-write in application code without locks or version checks (lost updates).
- Long-running transactions at REPEATABLE READ or higher: they hold old snapshots open, which in PostgreSQL also blocks vacuum from cleaning up (see MVCC below).
- Treating warehouse transactions like OLTP: Snowflake runs at READ COMMITTED, and concurrent DML on the same table can block or be serialised.

### In interviews

"Explain isolation levels" is best answered with the anomaly table plus one concrete example each: a non-repeatable read, a lost update and write skew. Then say what your database actually does (PostgreSQL's REPEATABLE READ is snapshot isolation, its SERIALIZABLE is SSI and needs retries) and how you prevent lost updates in application code. For pipeline questions, mention running a multi-query extract in one REPEATABLE READ transaction to get a consistent snapshot.

## Deadlocks and locking

### What it is

Even with MVCC, writers must coordinate: two transactions cannot both change the same row at once. Databases use **locks**:

- **Row locks**: taken by `UPDATE`, `DELETE` and `SELECT ... FOR UPDATE / FOR SHARE`. A second writer to the same row **waits** until the first commits or rolls back.
- **Table locks**: every statement takes a table-level lock in some mode. Ordinary reads and writes take weak modes that do not conflict with each other; DDL such as `ALTER TABLE`, `DROP TABLE` or `TRUNCATE` takes `ACCESS EXCLUSIVE`, which conflicts with everything, including plain `SELECT`.

You can see the locks a transaction holds:

```sql
BEGIN;
UPDATE accounts SET balance = balance WHERE id = 1;
SELECT locktype, relation::regclass AS relation, mode, granted
FROM pg_locks
WHERE pid = pg_backend_pid() AND locktype IN ('relation', 'transactionid')
ORDER BY locktype, relation::regclass::text, mode;
ROLLBACK;
```

| locktype | relation | mode | granted |
|---|---|---|---|
| relation | accounts | RowExclusiveLock | t |
| relation | accounts_pkey | RowExclusiveLock | t |
| relation | pg_locks | AccessShareLock | t |
| transactionid | NULL | ExclusiveLock | t |

The `UPDATE` holds `RowExclusiveLock` on the table and its index (which conflicts with DDL, not with other updates). Row-level locks are stored on the row itself; a session waiting for a row waits on the holder's **transaction id** lock.

### Deadlocks

A **deadlock** is a cycle of waits: A holds row 1 and waits for row 2, while B holds row 2 and waits for row 1. Neither can proceed, so the database must abort one of them.

<!-- noexec -->
```sql
-- A: BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 1;
-- B: BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 2;
-- A: UPDATE accounts SET balance = balance + 10 WHERE id = 2;   -- waits for B
-- B: UPDATE accounts SET balance = balance + 10 WHERE id = 1;   -- waits for A: cycle
```

| Step | Session A | Session B |
|---|---|---|
| 1 | lock row 1 (debit Asha) | |
| 2 | | lock row 2 (debit Ben) |
| 3 | update row 2: **waits for B** | |
| 4 | | update row 1: **waits for A** (cycle) |
| 5 | after `deadlock_timeout`: `ERROR: deadlock detected`, A's transaction is aborted | B's update proceeds |

In the reproduction, PostgreSQL reported:

```text
ERROR:  deadlock detected
DETAIL:  Process 12419 waits for ShareLock on transaction 4031; blocked by process 12423.
Process 12423 waits for ShareLock on transaction 4030; blocked by process 12419.
```

PostgreSQL does not check for deadlocks on every wait (that would be expensive); a session that has waited for `deadlock_timeout` (1 second by default) runs the check, and if it finds a cycle, it aborts itself. The other transaction then continues. Other engines detect deadlocks similarly and pick a victim; the application must catch the error (SQLSTATE `40P01` in PostgreSQL) and retry.

### Preventing deadlocks and long waits

- **Lock in a consistent order.** If every transfer updates the lower account id first, two transfers between the same accounts queue instead of deadlocking. Sorting the keys of a batch update before applying it has the same effect.
- **Keep transactions short.** Do not hold a transaction open while calling an API, waiting for user input or processing a large file.
- **Touch fewer rows per transaction**, for example by batching large updates into chunks of a few thousand rows.
- **Set `lock_timeout`** (0, meaning "wait forever", by default) so a statement fails fast instead of queueing indefinitely, and `statement_timeout` for runaway queries.
- **Be careful with DDL.** An `ALTER TABLE` waiting for `ACCESS EXCLUSIVE` behind one long-running query also blocks every query that arrives after it. Run migrations with a short `lock_timeout` and retry.

### Work queues with SKIP LOCKED

Several workers taking jobs from one table should not all block on the same first row. `FOR UPDATE SKIP LOCKED` lets each worker take a different row:

| Step | Worker A | Worker B |
|---|---|---|
| 1 | `BEGIN`; `SELECT id ... ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED` returns **1** | |
| 2 | | `BEGIN`; same query returns **2** (row 1 is skipped) |
| 3 | | `SELECT ... WHERE id = 1 FOR UPDATE NOWAIT`: `ERROR: could not obtain lock on row` |

`NOWAIT` fails immediately instead of waiting. Both behaviours were reproduced on the `accounts` table.

### Finding blockers

<!-- noexec -->
```sql
-- Who is blocked, and by whom?
SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, state,
       now() - xact_start AS xact_age, left(query, 60) AS query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

`pg_blocking_pids()` lists the sessions holding the locks a session waits for; `pg_cancel_backend(pid)` cancels a query and `pg_terminate_backend(pid)` ends a session. `log_lock_waits = on` logs any wait longer than `deadlock_timeout`.

### Pitfalls

- Holding transactions open across slow application work, which turns small lock waits into outages.
- Large batch `UPDATE`s in random key order from parallel workers, a common source of deadlocks in pipelines that upsert into operational tables.
- Running schema migrations during peak traffic without a lock timeout.
- Retrying a deadlocked transaction without backoff, which can recreate the same deadlock.

### In interviews

"What is a deadlock and how do you prevent it?" Describe the cycle with two rows, how the database detects it and aborts a victim, and prevention: consistent lock ordering, short transactions, smaller batches, timeouts and retries. For pipeline questions, mention ordering upsert batches by key and using `SKIP LOCKED` for job queues.

## MVCC concepts

### What it is

**Multi-Version Concurrency Control (MVCC)** keeps several versions of a row instead of overwriting it in place. A writer creates a new version; readers keep seeing the version that was committed as of their snapshot. The result: **readers never block writers and writers never block readers**. Only writers to the same row wait for each other. PostgreSQL, Oracle, MySQL InnoDB, SQL Server (with snapshot isolation), Snowflake and lakehouse table formats all use some form of it.

### How PostgreSQL implements it

Each row version carries hidden system columns:

- `xmin`: the transaction id that created this version;
- `xmax`: the transaction id that deleted or replaced it (0 if still current);
- `ctid`: the physical location (page, item) of the version.

An `UPDATE` is effectively a delete plus an insert: the old version gets an `xmax`, and a new version is written elsewhere.

```sql
SELECT ctid, id, balance FROM accounts WHERE id = 1;
UPDATE accounts SET balance = balance + 5 WHERE id = 1;
SELECT ctid, id, balance FROM accounts WHERE id = 1;
```

In our run the row moved from `ctid` `(0,4)` to `(0,7)`: a new physical version, while the old one is still on the page. Each transaction runs with a **snapshot**: the list of transactions that were committed when the snapshot was taken. A row version is visible if its `xmin` committed before the snapshot and its `xmax` is empty, aborted or not yet committed in that snapshot.

The reproduction with two sessions showed both versions at once:

| Step | Session A | Session B |
|---|---|---|
| 1 | `BEGIN`; `UPDATE accounts SET balance = 0 WHERE id = 2` | |
| 2 | sees `xmin = 4045, xmax = 0, balance = 0.00` (its new version) | |
| 3 | | sees `xmin = 4044, xmax = 4045, balance = 50.00` immediately, without waiting |
| 4 | `ROLLBACK` | |

B read the old version, whose `xmax` is A's uncommitted transaction, so it is still visible to B. Nothing was locked against B's read. After A's rollback, the new version is simply never visible to anyone.

### Vacuum and bloat

Old versions are not removed when the transaction ends; they become **dead tuples** once no running snapshot can see them. `VACUUM` (normally run by autovacuum) reclaims their space for reuse and updates the visibility map used by index-only scans:

```sql
SELECT pg_stat_force_next_flush();
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'accounts';
VACUUM accounts;
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'accounts';
```

Before the vacuum the table had 2 live rows and several dead versions left by the updates and the rolled-back transfer (the exact count varies slightly by run); afterwards `n_dead_tup` was 0. The first statement only makes the statistics counters current, which PostgreSQL otherwise updates with a short delay.

Consequences that matter in practice:

- **Update-heavy tables bloat** if vacuum cannot keep up; tune autovacuum per table rather than running manual `VACUUM FULL` (which rewrites the table under an exclusive lock).
- **Long-running transactions** (including an idle session left `idle in transaction`, or a long REPEATABLE READ export) keep old snapshots alive, so vacuum cannot remove anything newer than them, anywhere in the database. Monitor `xact_start` in `pg_stat_activity`.
- Transaction ids are 32-bit and wrap around; vacuum "freezes" old rows to prevent this. Wraparound warnings in the logs are an emergency.
- Logical replication slots used by CDC tools also hold back cleanup of the write-ahead log if the consumer stops reading.

### MVCC beyond PostgreSQL

- **Oracle and MySQL InnoDB** keep old versions in undo logs rather than in the table, so bloat shows up as undo growth, and very old snapshots can fail with "snapshot too old" errors in Oracle.
- **Snowflake** stores immutable micro-partitions; a DML statement writes new micro-partitions and the old ones are kept for Time Travel and Fail-safe, which is MVCC at file level.
- **Delta Lake and Apache Iceberg** commit each write as a new table version (a new log entry or snapshot pointing at data files). Readers use a fixed version; concurrent writers use optimistic concurrency, and a conflicting commit fails and must retry. Old files are removed by `VACUUM` (Delta) or snapshot expiry (Iceberg), just like dead tuples.

### Pitfalls

- Assuming `DELETE` frees space immediately; it creates dead versions.
- Leaving connections `idle in transaction` from pools or notebooks.
- Expecting `SELECT` to see uncommitted changes from your other connections.
- Running huge single-transaction updates on large tables: they double the table's live-plus-dead size until vacuum catches up; batch them instead.

### In interviews

"How can readers and writers work at the same time without locking?" Explain row versions, `xmin`/`xmax`, snapshots and the visibility rule, then the cost: dead tuples, vacuum, and why long transactions hurt. Connecting MVCC to lakehouse table versions and time travel shows you see the same idea across systems.

## Practice questions

<details><summary>Explain the difference between READ COMMITTED and REPEATABLE READ with an example.</summary>

At READ COMMITTED each statement sees data committed before that statement began, so reading a balance twice in one transaction can return 100 and then 70 if another transaction commits in between (a non-repeatable read). At REPEATABLE READ the whole transaction uses one snapshot taken at its first statement, so both reads return 100, and the new value is visible only in a later transaction.

</details>

<details><summary>Two workers read a counter, add 1 in application code and write it back. Sometimes increments go missing. Why, and what are three fixes?</summary>

It is a lost update: both read the same value and the second write overwrites the first. Fixes: an atomic `UPDATE counters SET n = n + 1`, locking the row when reading it (`SELECT ... FOR UPDATE`), or optimistic concurrency with a version column (`WHERE version = :v`, retry if no row was updated). Running at REPEATABLE READ or SERIALIZABLE in PostgreSQL also prevents it, by failing one transaction, which must then retry.

</details>

<details><summary>What is write skew, and which isolation level prevents it in PostgreSQL?</summary>

Two transactions read overlapping data, each decides based on what it read, and each updates different rows, so together they break an invariant (for example, both doctors go off call). Snapshot isolation (PostgreSQL REPEATABLE READ) allows it because there is no write-write conflict. PostgreSQL's SERIALIZABLE level detects the read/write dependency and aborts one transaction. Alternatives are explicit row locks on the data the rule depends on or a database constraint.

</details>

<details><summary>How does PostgreSQL detect a deadlock, and what should your code do?</summary>

When a session has waited for a lock longer than `deadlock_timeout` (1 second by default), it checks the wait graph for a cycle; if it finds one, it aborts its own transaction with `deadlock detected`, which releases its locks so the others can continue. Code should catch the error, roll back and retry the whole transaction with backoff, and prevent recurrences by acquiring locks in a consistent order and keeping transactions short.

</details>

<details><summary>Why does a long-running transaction cause table bloat in PostgreSQL?</summary>

Vacuum can only remove row versions that no running snapshot might still need. A transaction that has been open for hours keeps its snapshot, so dead versions created since then cannot be removed in any table, and update-heavy tables keep growing. Find such sessions in `pg_stat_activity` (old `xact_start`, `idle in transaction`) and end them; set `idle_in_transaction_session_timeout` to prevent them.

</details>

<details><summary>How would you extract several related tables from a busy OLTP database so they are consistent with each other?</summary>

Run all the extract queries inside one transaction at REPEATABLE READ (in PostgreSQL, optionally `READ ONLY` and `DEFERRABLE` at SERIALIZABLE for a fully safe snapshot), so every query sees the same snapshot. Keep the transaction as short as possible because it holds back vacuum, or use CDC from the write-ahead log instead of repeated snapshots for large, frequently changing tables.

</details>

<details><summary>What isolation level does Snowflake provide, and what does that mean for pipelines?</summary>

Snowflake supports READ COMMITTED for tables: each statement sees data committed before it started. Two statements in one transaction can see different data if another transaction commits in between, and concurrent DML on the same table can wait on locks. Design pipelines so each table is written by one job at a time (or partitioned so writers do not overlap) and make loads idempotent.

</details>

## Key takeaways

- ACID: all-or-nothing transactions, declared constraints enforced, isolation between concurrent work, durable commits through the write-ahead log.
- Isolation levels are defined by the anomalies they allow; most databases default to READ COMMITTED, where each statement sees a fresh snapshot.
- PostgreSQL's REPEATABLE READ is snapshot isolation (no phantoms, but write skew possible); SERIALIZABLE adds SSI and requires retries.
- Prevent lost updates with atomic updates, row locks or version checks, not read-modify-write in application code.
- Deadlocks are wait cycles; the database aborts a victim. Lock in a consistent order, keep transactions short, set timeouts and retry.
- MVCC keeps row versions so readers and writers do not block each other; the cost is dead versions, vacuum and the danger of long-running transactions.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Near-Zero Downtime Data Platform Migration"
seoTitle: "Design a Near-Zero Downtime Migration"
description: "A system-design case study for migrating a live warehouse and its pipelines: bulk load plus CDC, parallel runs, reconciliation, wave cutover and rollback."
technology: ["data-engineering", "data-warehousing", "etl-elt"]
topic: ["migration", "architecture", "cdc"]
tags: ["migration", "cdc", "parallel-run", "reconciliation", "cutover", "rollback"]
difficulty: "Advanced"
problem: "Design the migration of a live on-premises data warehouse, the ETL jobs that load it and the dashboards that read it to a cloud warehouse or lakehouse, so that consumers see no more than a few minutes of disruption and every number can be proved to match before the old system is switched off."
functionalRequirements:
  - "Copy all historical data (tables, views, permissions) to the new platform"
  - "Keep the new platform continuously in sync with the old one until cutover"
  - "Re-implement or port the ETL jobs and run them in parallel with the legacy jobs"
  - "Prove that migrated tables and key reports match the legacy system"
  - "Switch consumers (BI tools, extracts, APIs) to the new platform in planned waves"
  - "Roll back any wave quickly if a problem is found after cutover"
nonFunctionalRequirements:
  - "Consumer-visible downtime of at most 15 minutes per cutover wave"
  - "No data loss: every committed source change present on the new platform"
  - "Financial and regulatory reports reconcile exactly; other metrics within an agreed tolerance"
  - "Legacy system stays authoritative until each wave is signed off"
  - "Migration traffic must not degrade production source systems or the legacy warehouse"
scaleAssumptions:
  - "Assumption: 60 TB in the legacy warehouse across about 3,000 tables"
  - "Assumption: about 400 ETL jobs and 1,500 dashboards or scheduled extracts"
  - "Assumption: about 200 GB of changes a day from 25 source systems"
  - "Assumption: a 1 Gbit/s dedicated link between the data centre and the cloud region"
architectureSummary: "Classify and inventory everything first. Bulk-copy history to object storage and load it, then keep the new platform current with change data capture from the sources (not from the legacy warehouse where avoidable). Run old and new pipelines in parallel, reconcile automatically, and move consumers wave by wave behind a stable access layer, with the old path kept warm for rollback."
technologies: ["Change data capture (log-based, for example Debezium or a managed service)", "Bulk transfer to object storage (network copy or offline transfer appliance)", "Cloud warehouse or lakehouse", "Orchestrator", "Reconciliation framework (SQL checks and hashes)", "Semantic or view layer, DNS or connection aliases for cutover"]
tradeoffs:
  - decision: "Migrate in waves by domain"
    alternative: "Big-bang cutover of everything in one weekend"
    reason: "Smaller blast radius; lessons from early waves improve later ones; rollback is per wave"
    consequence: "Two platforms run in parallel for months, with double cost and cross-platform dependencies to manage"
  - decision: "Lift and shift first, refactor later"
    alternative: "Redesign models during the migration"
    reason: "Like-for-like output makes reconciliation possible: differences are bugs, not design changes"
    consequence: "Carries some legacy design debt into the new platform for a while"
  - decision: "Feed the new platform from source CDC"
    alternative: "Replicate from the legacy warehouse"
    reason: "Removes the dependency on the system you are retiring and tests the real future ingestion path"
    consequence: "Must also port legacy transformation logic; early on, the two platforms can differ for legitimate timing reasons"
  - decision: "Cut consumers over through a stable access layer (views, aliases, semantic layer)"
    alternative: "Edit every dashboard and connection string"
    reason: "Cutover and rollback become one configuration change"
    consequence: "Needs upfront work to route all consumers through that layer"
  - decision: "Automated reconciliation gates each wave"
    alternative: "Manual spot checks by analysts"
    reason: "Thousands of tables cannot be checked by hand; gates are repeatable and auditable"
    consequence: "Building the framework takes time early in the programme"
interviewFollowUps:
  - "How do you handle a legacy stored procedure that nobody understands?"
  - "Numbers differ by 0.01% after migration. How do you decide whether to block cutover?"
  - "What do you do with data written to the new platform after cutover if you must roll back?"
  - "How would you migrate a 2 TB table that changes constantly?"
  - "How do you stop new pipelines being built on the legacy platform during the migration?"
  - "How do you know when it is safe to decommission the old warehouse?"
related:
  - "system-designs:change-data-capture-platform"
  - "system-designs:cloud-data-warehouse-platform"
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "articles:snowflake/snowflake-vs-databricks"
versionContext: "The reconciliation SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Platform-specific transfer and CDC tooling is described generically."
sources:
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "PostgreSQL 16: table expressions and joins", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
previous: "system-designs:streaming-etl-with-kafka-spark"
---

## Approach

A migration question is mostly about **risk management**: how you keep the business running, prove correctness and stay able to go back. Technology choices matter less than sequencing and verification. Start with questions:

- **What is moving?** Data only, or also ETL code, schedules, permissions, dashboards and external extracts?
- **What does "downtime" mean to consumers?** Dashboards unavailable, stale data, or changed numbers? Which consumers are critical (finance close, regulatory reports, customer-facing APIs)?
- **Is there a deadline?** A data-centre exit or licence renewal changes how much refactoring is affordable.
- **What is the source of truth for each table?** Loaded from a source system, derived in the warehouse, or manually maintained?
- **What is the tolerance for differences?** Exact match for money, maybe a tolerance for floating-point metrics.
- **Are there freeze periods** (quarter end, peak trading) when no cutover may happen?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Inventory</strong>: catalogue every table, job, dependency, consumer and owner from query logs and lineage; mark unused objects for retirement.</li>
<li><strong>Bulk history copy</strong>: export legacy tables to columnar files, transfer to object storage, load into the new platform.</li>
<li><strong>Ongoing sync</strong>: log-based CDC from source systems keeps raw layers current; ported ETL builds the same models on the new platform.</li>
<li><strong>Parallel run</strong>: legacy and new pipelines both run on schedule; reconciliation jobs compare outputs every run.</li>
<li><strong>Wave cutover</strong>: consumers switch to the new platform through views, aliases or the semantic layer during a short window.</li>
<li><strong>Stabilise and decommission</strong>: legacy kept read-only for a defined period, then archived and switched off.</li>
</ol>
<figcaption>History is copied once, change is streamed continuously, and every wave is gated on reconciliation.</figcaption>
</figure>

Walkthrough:

1. **Inventory before moving anything.** Query history usually shows that a large share of tables are unused. Not migrating them is the cheapest optimisation you will ever make. Build a dependency graph so waves move whole subgraphs (sources, models and their consumers) together.
2. **Bulk history copy** happens once per table. Export to Parquet (keeping types such as decimals and timestamps exact), copy over the network or with an offline transfer device if the volume is too large for the link, and load.
3. **Ongoing sync** must start *before* the bulk export, or changes made during the export are lost. Record the CDC log position (or a timestamp watermark) first, export, then replay changes from that position. Replay must be idempotent because some changes are already in the snapshot.
4. **Parallel run** proves the ported logic. Both platforms process the same inputs; automated reconciliation compares outputs.
5. **Cutover** is a configuration change, not a code change, when consumers go through a stable access layer.
6. **Decommission** only after the new platform has passed at least one full business cycle (for finance, typically a month-end close).

## Migration strategies compared

| Strategy | How it works | Downtime | Risk | When to use |
|---|---|---|---|---|
| Big bang | Freeze, copy everything, switch | Hours to days | High: all or nothing | Small, simple estates |
| Dual write | Applications write to both old and new | Near zero | Partial failures make the two diverge | Rarely for warehouses; needs application changes |
| Snapshot + CDC | Copy history, then stream changes | Minutes per wave | Moderate; needs reliable CDC | The default for large live systems |
| Strangler (wave-based) | Move domain by domain behind an access layer | Minutes per wave | Low per wave | Large estates with many consumers |

The usual answer combines **snapshot + CDC** for data with **strangler waves** for consumers.

## Data model and storage layout

- Keep a **raw layer** on the new platform that mirrors source tables exactly (plus CDC metadata: operation, source log position, commit timestamp). This is what makes later debugging possible.
- Port models **like for like** first: same grain, same keys, same column names. Renaming during migration makes every reconciliation difference ambiguous.
- Map types deliberately: numeric precision and scale, timestamp time-zone semantics, string collation and case sensitivity, and empty string versus NULL. These are where most "small differences" come from.
- Re-think physical layout for the new engine (clustering keys, partitioning), since index-based designs from an on-premises database do not translate to a columnar engine.

## Keeping the platforms in sync

- **Source CDC** reads database transaction logs, so it puts little load on sources and captures deletes. Query-based incremental extracts (`WHERE updated_at > :last`) miss hard deletes and rows whose timestamp was not updated.
- **Ordering and idempotency**: apply changes per primary key in log order, using MERGE keyed on the primary key and guarded by the source log position, so replaying a change is harmless.
- **Late-arriving changes** in sources that back-date records (adjustments, corrections) must flow through, so incremental models on the new platform need a lookback window.
- **Schema changes during the migration**: freeze non-essential source schema changes, or make CDC propagate additive changes automatically and alert on the rest.

## Reconciliation

Reconciliation decides whether a wave can cut over. Build it as a framework that runs after every parallel load:

1. **Row counts** per table and partition (cheap, catches gross loss).
2. **Aggregates** of key measures per day and key dimension (sum of amount, count of distinct customers).
3. **Content hashes** per partition, computed on normalised values, to find rows that differ even when totals match.
4. **Report-level comparison** of the top dashboards and regulatory extracts, cell by cell.

A simple partition-level comparison, run in PostgreSQL with a `legacy` and a `target` schema standing in for the two platforms:

```sql
CREATE SCHEMA legacy;
CREATE SCHEMA target;
CREATE TABLE legacy.orders (order_id int PRIMARY KEY, order_date date, amount numeric(12,2), status text);
CREATE TABLE target.orders (order_id int PRIMARY KEY, order_date date, amount numeric(12,2), status text);

INSERT INTO legacy.orders VALUES
  (1, '2026-09-01', 20.00, 'shipped'), (2, '2026-09-01', 35.50, 'shipped'),
  (3, '2026-09-02', 12.00, 'cancelled'), (4, '2026-09-02', 99.99, 'shipped'),
  (5, '2026-09-03', 15.00, 'pending');
INSERT INTO target.orders VALUES
  (1, '2026-09-01', 20.00, 'shipped'), (2, '2026-09-01', 35.50, 'shipped'),
  (3, '2026-09-02', 12.00, 'shipped'),  (4, '2026-09-02', 99.99, 'shipped');

WITH l AS (
  SELECT order_date, count(*) AS n, sum(amount) AS amount,
         md5(string_agg(order_id || '|' || amount || '|' || status, ',' ORDER BY order_id)) AS h
  FROM legacy.orders GROUP BY order_date
), t AS (
  SELECT order_date, count(*) AS n, sum(amount) AS amount,
         md5(string_agg(order_id || '|' || amount || '|' || status, ',' ORDER BY order_id)) AS h
  FROM target.orders GROUP BY order_date
)
SELECT coalesce(l.order_date, t.order_date) AS order_date,
       l.n AS legacy_rows, t.n AS target_rows,
       l.amount AS legacy_amount, t.amount AS target_amount,
       CASE WHEN t.order_date IS NULL THEN 'missing in target'
            WHEN l.order_date IS NULL THEN 'extra in target'
            WHEN l.h <> t.h THEN 'content differs'
            ELSE 'match' END AS result
FROM l FULL OUTER JOIN t ON l.order_date = t.order_date
ORDER BY 1;
```

```text
 order_date | legacy_rows | target_rows | legacy_amount | target_amount |      result
------------+-------------+-------------+---------------+---------------+-------------------
 2026-09-01 |           2 |           2 |         55.50 |         55.50 | match
 2026-09-02 |           2 |           2 |        111.99 |        111.99 | content differs
 2026-09-03 |           1 |             |         15.00 |               | missing in target
```

On 2 September, counts and totals agree but a status differs: only the hash catches it. In a real migration the two sides run on different engines, so hash a **canonical text form** (fixed decimal scale, UTC timestamps in ISO format, a fixed NULL marker) computed identically on both sides, otherwise formatting differences look like data differences.

Classify every difference: **bug** (fix and rerun), **timing** (one side loaded later; rerun after both settle), **legitimate** (a known legacy defect the business agrees to fix; document it), or **tolerance** (floating-point rounding within an agreed threshold).

## Cutover and rollback

A wave cutover runbook:

1. Confirm reconciliation has been green for an agreed number of consecutive runs.
2. Announce the window; pause legacy writes for the wave's tables or let the final CDC batch drain until lag is zero.
3. Run a final reconciliation on the latest partitions.
4. Switch the access layer (view definitions, connection alias, semantic-layer data source) to the new platform.
5. Smoke-test the critical dashboards and extracts.
6. Keep legacy pipelines **running in parallel** for a stabilisation period, so rollback is a switch back, not a rebuild.

Rollback needs a decision in advance about **data created after cutover**. If the new platform is the only one receiving manual adjustments or new pipeline outputs, rolling back loses them. Either keep legacy fed (parallel run continues) or have a reverse sync for the small set of tables written after cutover.

## Security and governance

- Map roles and grants explicitly; do not copy a legacy "everyone can read everything" model by accident.
- Re-apply masking and row-level policies for personal data before granting access, not after.
- Transfer data encrypted, and track where temporary export files live; delete them after load.
- Record lineage and owners in the new catalog as part of each wave, since the inventory already holds that information.

## Failure modes and recovery

| Failure | Detection | Response |
|---|---|---|
| CDC connector falls behind or loses its log position | Lag metric; reconciliation shows missing recent rows | Resume from saved position; if the source log has been purged, re-snapshot affected tables |
| Ported job produces subtly different results | Reconciliation hash mismatch | Diff rows, fix logic, rerun; do not cut over until green |
| Cutover reveals a consumer nobody inventoried | Errors or complaints after switch | Access-layer switch back for that consumer; add it to inventory |
| Performance regression on new platform | Query latency monitoring | Tune layout and sizing; temporary rollback if critical |
| Legacy system fails during the migration | Normal operations alerts | Keep legacy support contracts and backups until decommission |

## Monitoring and SLAs

- Migration dashboard per wave: tables migrated, reconciliation status, CDC lag, open differences by category.
- Consumer usage on both platforms from query logs, to know when legacy usage really reaches zero.
- The normal freshness and job-success SLAs, measured on both platforms during parallel run.

## Cost

Parallel running doubles compute and support costs, so the plan should shorten it: retire unused objects, migrate high-value domains first, and set a firm decommission date per wave. Egress charges and network transfer time for the initial copy are often underestimated; estimate them before choosing between network transfer and an offline appliance.

## Scaling to 10×

At 600 TB and 4,000 jobs the same pattern holds, but you need automation for everything: code conversion tooling for SQL dialects, generated reconciliation checks from the inventory, and a migration factory with standard runbooks so several waves run concurrently. Bulk transfer almost certainly moves to offline devices or multiple parallel links.

## Capacity estimate

Assumptions: 60 TB legacy, roughly 3:1 compression when exported to Parquet, a 1 Gbit/s link at about 70% usable throughput, 200 GB of changes a day.

- **Data to transfer**: 60 TB / 3 ≈ 20 TB of Parquet. If inventory shows 30% of tables unused, about 14 TB.
- **Link throughput**: 1 Gbit/s × 0.7 ≈ 87 MB/s ≈ 7.5 TB/day. 14 TB takes about 2 days of continuous transfer, which is fine; at 10× (140 TB) it would take nearly 3 weeks, which is where offline transfer becomes attractive.
- **CDC**: 200 GB/day ≈ 2.3 MB/s average, a small fraction of the link even with daytime peaks of 5×.
- **Reconciliation**: 3,000 tables × a few aggregate queries per run. Partition-level checks on recent partitions only, with a weekly full-table pass, keeps the compute affordable.
- **Parallel run**: if the cloud platform costs C per month, parallel running for 6 months costs about 6C on top of legacy costs, which is why wave sequencing matters.

## What a strong answer includes

- An inventory and dependency analysis first, with retirement of unused objects.
- Snapshot plus CDC, with the CDC position captured before the snapshot and idempotent replay.
- Like-for-like porting before refactoring, so reconciliation is meaningful.
- Automated, multi-level reconciliation as the gate for each wave, and a classification of differences.
- Consumers routed through an access layer so cutover and rollback are configuration changes.
- A rollback plan that addresses data written after cutover, and a clear decommission criterion.

## Common mistakes

- Starting CDC after the bulk export, losing changes made during the copy.
- Replicating from the legacy warehouse indefinitely, so the old system can never be switched off.
- Redesigning the data model during the migration and then being unable to tell bugs from intentional changes.
- Validating only row counts.
- Ignoring type semantics (time zones, decimal precision, NULL versus empty string, collation).
- Treating cutover day as the end; the stabilisation period and decommissioning are part of the design.

---
title: "Design a Slowly Changing Dimension Framework"
description: "A system-design case study for a reusable SCD framework: type choices per column, change detection, SCD Type 2 loads, late changes, point-in-time joins and reprocessing."
technology: ["data-engineering", "data-warehousing", "dbt"]
topic: ["slowly-changing-dimensions", "dimensional-modelling", "batch"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
problem: "A warehouse has 60 dimensions (customers, products, stores, sales territories, employees) whose attributes change over time. Each team handles history differently, some overwrite values and lose history, others produce overlapping or duplicate versions. Design a reusable slowly changing dimension framework that applies the right history rules per attribute, loads changes idempotently from batch and CDC sources, handles late and out-of-order changes, and lets facts join to the version that was valid at the time."
functionalRequirements:
  - "Configure per dimension the business key, tracked (Type 2) columns, overwrite (Type 1) columns and source"
  - "Detect changes from full snapshots, incremental extracts or CDC streams"
  - "Maintain SCD Type 2 history with surrogate keys, validity ranges and a current flag"
  - "Apply Type 1 overwrites and support hybrid patterns (Type 6 style current-value columns)"
  - "Handle late-arriving and out-of-order changes, and deletes in the source"
  - "Provide point-in-time lookups so facts get the correct surrogate key"
nonFunctionalRequirements:
  - "Exactly one current row and no overlapping validity ranges per business key"
  - "Reruns of the same input never create extra versions"
  - "Load the largest dimension (50 million rows) daily within 30 minutes"
  - "Any dimension rebuildable from its change history"
  - "Configuration reviewed in Git; tests run on every change"
scaleAssumptions:
  - "Assumption: 60 dimensions; the largest (customer) has 50 million business keys"
  - "Assumption: 1% of customers change a tracked attribute per day (500,000 changes)"
  - "Assumption: fact tables of several billion rows join to dimensions by surrogate key"
  - "Assumption: sources are a mix of daily snapshots and CDC streams"
architectureSummary: "Each dimension is declared in configuration: business key, Type 1 and Type 2 column lists, effective-time column and source. A generic loader stages the incoming state, computes a hash of the tracked columns, compares it with the current version, applies Type 1 overwrites, closes changed versions and inserts new ones in one transaction or table commit. CDC sources use the change timestamp and log position for ordering and late-change repair. Facts look up surrogate keys with a point-in-time join on validity ranges; tests enforce one current row and no overlaps."
technologies:
  - "Warehouse or lakehouse with MERGE and transactions (Snowflake, BigQuery, Delta Lake, Iceberg)"
  - "dbt snapshots or custom SCD macros driven by YAML configuration"
  - "CDC (Debezium) for change history where available"
  - "Orchestrator such as Airflow"
  - "dbt or SQL tests for validity and uniqueness rules"
tradeoffs:
  - decision: "Choose the SCD type per column, not per table"
    alternative: "Make every column Type 2"
    reason: "History only where the business needs it; typo fixes and contact details do not create versions"
    consequence: "Configuration and review effort per dimension"
  - decision: "Hash comparison of tracked columns"
    alternative: "Column-by-column comparison"
    reason: "One cheap comparison per row, generated from configuration"
    consequence: "Hash inputs must be normalised and NULL-safe; collisions are theoretically possible"
  - decision: "Effective time from the source change time"
    alternative: "Load time as valid_from"
    reason: "Facts join to the version that was true when the event happened"
    consequence: "Late changes require inserting versions into the past and splitting ranges"
  - decision: "CDC history as the input when available"
    alternative: "Daily snapshot comparison"
    reason: "Captures every intermediate change and its exact time"
    consequence: "More versions and CDC infrastructure; snapshots miss changes between runs"
  - decision: "Surrogate keys resolved at fact load"
    alternative: "Join facts on business key and time at query time"
    reason: "Simple, fast equality joins for BI tools"
    consequence: "Late dimension changes may require re-keying recent facts"
interviewFollowUps:
  - "When would you use Type 1, Type 2 or a hybrid for a customer's address, segment and email?"
  - "How do you make an SCD Type 2 load idempotent?"
  - "A change effective last week arrives today. What do you do to the dimension and to facts?"
  - "How do you handle a fact whose dimension row does not exist yet?"
  - "How would you test that a dimension has no overlapping versions?"
  - "How do source deletes appear in a Type 2 dimension?"
related:
  - "articles:data-warehousing/slowly-changing-dimensions"
  - "articles:data-warehousing/star-schema"
  - "articles:sql/window-functions"
  - "system-designs:elt-pipeline-with-dbt"
  - "system-designs:change-data-capture-platform"
previous: "system-designs:real-time-analytics-pipeline"
next: "system-designs:idempotent-reprocessing-system"
versionContext: "The SCD Type 1 and Type 2 load was run on PostgreSQL 16, including a rerun to confirm idempotency. dbt snapshot configuration is described, not executed."
sources:
  - { label: "Kimball Group: dimensional modelling techniques", url: "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
---

## Approach

SCD handling looks like a modelling detail, but it decides whether historical reports are correct. A framework must answer: **which attributes keep history**, **how changes are detected**, **when a version starts**, **how reruns and late changes behave**, and **how facts find the right version**. Ask:

- **Which attributes need history?** Segment and territory usually do (revenue must stay attributed to last year's territory); email and phone corrections usually do not.
- **Source type**: full snapshots, incremental extracts, or CDC with every change?
- **Effective time**: does the source record when a change happened, or only when we saw it?
- **Late changes**: can changes arrive after facts for that period have been loaded?
- **Consumers**: BI tools that need simple joins, or analysts comfortable with time-range joins?
- **Volume**: largest dimension and change rate.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Configuration</strong>: a YAML entry per dimension with business key, Type 1 columns, Type 2 columns, effective-time column, source and tests.</li>
<li><strong>Staging</strong>: the latest source state (snapshot, incremental extract, or the latest CDC event per key in this batch), deduplicated and normalised.</li>
<li><strong>Change detection</strong>: compute a NULL-safe hash of the Type 2 columns and compare it with the current version; detect new keys and deletes.</li>
<li><strong>Apply</strong>, in one transaction or table commit: overwrite Type 1 columns, close changed current versions at the change time, insert new versions.</li>
<li><strong>Late-change repair</strong>: for changes effective before the current version, split the affected range and re-key facts in that window.</li>
<li><strong>Tests and serving</strong>: one current row per key, no overlaps or gaps; facts look up surrogate keys by business key and event time.</li>
</ol>
<figcaption>One loader, configured per dimension, applies the same tested history rules everywhere.</figcaption>
</figure>

Customer 1 moves from the basic to the gold segment on 5 October at 09:00. The CRM CDC stream delivers the change; staging keeps the latest event per customer for this run. The loader sees that the hash of (segment, city) differs from the current version, closes the old version with `valid_to = 09:00`, and inserts a new current version from 09:00. Customer 2 changed only their email, a Type 1 column, so the email is overwritten in place and no version is created. A new customer 3 gets their first version. An order placed by customer 1 at 08:30 still joins to the basic version; one at 10:00 joins to gold.

## Choosing the SCD type per column

| Type | Behaviour | Use for |
|---|---|---|
| 0 | Never changes after insert | Original signup date, first channel |
| 1 | Overwrite, no history | Corrections, contact details, descriptions |
| 2 | New version with validity range | Attributes used to group historical facts: segment, territory, price tier |
| 3 | Previous value in an extra column | Rare; "previous territory" for a reorganisation |
| 4 | Separate history table, current table small | Very frequently changing attributes |
| 6 (hybrid) | Type 2 history plus a Type 1 "current value" column on every version | Report by historical and by current segment |

The framework configures types per column, because most dimensions mix them.

## Data model

- `customer_sk`: surrogate key, one per version, used by facts.
- `customer_id`: business key from the source.
- Type 2 columns, Type 1 columns.
- `attr_hash`: hash of normalised Type 2 columns.
- `valid_from`, `valid_to` (NULL or a far-future date for current), `is_current`.
- Audit columns: `loaded_at`, `source_lsn` or batch id.

Use half-open ranges (`valid_from <= t < valid_to`) so a timestamp falls in exactly one version.

## The Type 1 and Type 2 load

The example runs on PostgreSQL 16 inside one transaction. In a lakehouse or Snowflake the same steps are usually expressed as one `MERGE` with a union of "rows to close" and "rows to insert", which keeps it to a single atomic commit.

```sql
CREATE TABLE dim_customer (
  customer_sk  BIGSERIAL PRIMARY KEY,
  customer_id  INT NOT NULL,
  segment      TEXT,          -- Type 2: history kept
  city         TEXT,          -- Type 2: history kept
  email        TEXT,          -- Type 1: overwritten in place
  attr_hash    TEXT NOT NULL, -- hash of the Type 2 columns
  valid_from   TIMESTAMP NOT NULL,
  valid_to     TIMESTAMP,     -- NULL = still current
  is_current   BOOLEAN NOT NULL
);
CREATE UNIQUE INDEX one_current_row ON dim_customer (customer_id) WHERE is_current;

INSERT INTO dim_customer (customer_id, segment, city, email, attr_hash, valid_from, valid_to, is_current)
VALUES (1, 'basic', 'Leeds', 'a@x.com', md5('basic|Leeds'), '2026-01-01', NULL, TRUE),
       (2, 'gold',  'York',  'b@x.com', md5('gold|York'),   '2026-01-01', NULL, TRUE);

-- today's snapshot of the source, with the time the change became effective
CREATE TABLE stg_customer (customer_id INT, segment TEXT, city TEXT, email TEXT, changed_at TIMESTAMP);
INSERT INTO stg_customer VALUES
  (1, 'gold',  'Leeds', 'a@x.com',     '2026-10-05 09:00'),  -- Type 2 change
  (2, 'gold',  'York',  'b@new.com',   '2026-10-05 10:00'),  -- Type 1 change only
  (3, 'basic', 'Hull',  'c@x.com',     '2026-10-05 11:00');  -- new customer

BEGIN;
-- 1. Type 1: overwrite email on all versions
UPDATE dim_customer d SET email = s.email
FROM stg_customer s
WHERE d.customer_id = s.customer_id AND d.email IS DISTINCT FROM s.email;

-- 2. Type 2: close current rows whose tracked attributes changed
UPDATE dim_customer d SET valid_to = s.changed_at, is_current = FALSE
FROM stg_customer s
WHERE d.customer_id = s.customer_id AND d.is_current
  AND d.attr_hash <> md5(coalesce(s.segment, '<null>') || '|' || coalesce(s.city, '<null>'));

-- 3. Insert a new current version for changed and new customers
INSERT INTO dim_customer (customer_id, segment, city, email, attr_hash, valid_from, valid_to, is_current)
SELECT s.customer_id, s.segment, s.city, s.email, md5(coalesce(s.segment, '<null>') || '|' || coalesce(s.city, '<null>')), s.changed_at, NULL, TRUE
FROM stg_customer s
WHERE NOT EXISTS (
  SELECT 1 FROM dim_customer d WHERE d.customer_id = s.customer_id AND d.is_current
);
COMMIT;

SELECT customer_sk, customer_id, segment, city, email, valid_from, valid_to, is_current
FROM dim_customer ORDER BY customer_id, valid_from;
```

```text
 customer_sk | customer_id | segment | city  |   email   |     valid_from      |      valid_to       | is_current
-------------+-------------+---------+-------+-----------+---------------------+---------------------+------------
           1 |           1 | basic   | Leeds | a@x.com   | 2026-01-01 00:00:00 | 2026-10-05 09:00:00 | f
           3 |           1 | gold    | Leeds | a@x.com   | 2026-10-05 09:00:00 |                     | t
           2 |           2 | gold    | York  | b@new.com | 2026-01-01 00:00:00 |                     | t
           4 |           3 | basic   | Hull  | c@x.com   | 2026-10-05 11:00:00 |                     | t
```

Running the same transaction again changes nothing (the row count stays at 4), because step 2 only closes rows whose hash differs and step 3 only inserts when no current row exists. That is what makes retries safe. The partial unique index enforces one current row per customer at the database level; in warehouses without such constraints, a test does the same job.

Design notes:

- **NULL-safe hashing**: `md5(segment || '|' || city)` returns NULL if any input is NULL, so coalesce each column to a marker first, as in the example. Normalise case and whitespace if the business treats "Leeds " and "leeds" as the same.
- **Type 1 on all versions** (as here) means reports by historical version still show the corrected email; some teams update only the current row. Decide and document it.
- **Hash collisions** with MD5 or SHA-256 over a few columns are not a practical concern for change detection, but the hash must never be used as a security control.

## Change detection by source type

- **Full snapshots**: compare the whole snapshot with current versions. Keys missing from the snapshot are deletes (if the snapshot is complete). Changes that happen and revert between snapshots are invisible.
- **Incremental extracts**: only changed rows arrive; deletes are not visible unless the source soft-deletes.
- **CDC**: every change with its commit time and log position. Process changes per key in log order within a batch, creating one version per change (or only the last per day, if daily grain is enough).
- **dbt snapshots** implement Type 2 for snapshot-style sources with `timestamp` or `check` strategies; they record what they observe at run time, so they inherit the snapshot limitation.

## Late and out-of-order changes

A change effective on 1 October that arrives on 5 October must be inserted **into the past**:

1. Find the version whose range contains 1 October.
2. Split it: close it at 1 October, insert the late version from 1 October to the original `valid_to`, and carry later versions forward unchanged (or re-apply them if the late change also affects their attributes).
3. Facts loaded between 1 and 5 October for that customer now point to the wrong surrogate key; re-key them with a targeted update over that window.

With CDC, ordering by log position (not arrival) means out-of-order delivery within a batch is handled before applying. Keep the full change history table, so the dimension can always be rebuilt in order if repairs become complicated.

## Deletes

Source deletes close the current version (`valid_to = delete time`, `is_current = false`) and optionally add a `is_deleted` flag version, so facts before the delete still join. Never physically delete dimension history unless required by erasure rules, in which case anonymise attributes rather than breaking fact joins.

## Facts and point-in-time lookups

- At fact load, look up the surrogate key with `business_key = fact.business_key AND valid_from <= fact.event_ts AND fact.event_ts < coalesce(valid_to, 'infinity')`.
- **Early-arriving facts** (the dimension row does not exist yet): insert an "inferred member" dimension row with the business key and placeholder attributes, then update it as a Type 1 change when the real attributes arrive. Alternatively point to an "unknown" member and re-key later.
- For analysts, also expose a "current view" of each dimension (`is_current`) and Type 6 current-value columns for "report history by today's segment".

## Testing

- Exactly one current row per business key.
- No overlapping ranges: for each key, ordered by `valid_from`, each `valid_from` equals the previous `valid_to` (a `LAG` window test).
- `valid_from < valid_to` for closed rows.
- Every fact surrogate key exists in the dimension.
- Version-count anomaly: a dimension that suddenly creates versions for 80% of keys usually means a normalisation change upstream (for example trailing spaces), not real business change.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Rerun after partial failure | Possible duplicate versions | Single-transaction apply and hash guards make reruns no-ops |
| Upstream formatting change | Mass false versions | Normalise inputs before hashing; version-count anomaly check blocks publish |
| Late change | Facts on wrong version | Range split plus targeted fact re-keying |
| Overlapping ranges from a bug | Facts join twice | Overlap test fails; rebuild from change history |
| Source sends a full snapshot that is incomplete | Mass false deletes | Completeness check (row count versus expectation) before treating missing keys as deletes |

## Scaling to 10×

At 500 million keys and 5 million changes a day: compare only staged keys against current rows (never the whole history), cluster the dimension by business key and current flag, and keep a separate current-rows table or index so the comparison reads a small subset. Partition history by `valid_from` for pruning. For very fast-changing attributes, move them to a Type 4 mini-dimension so the main dimension does not explode.

## Monitoring and SLAs

- Rows inserted, closed and overwritten per run, per dimension, against baseline.
- Test results (current-row uniqueness, overlaps, gaps).
- Count of inferred members and how long they stay unresolved.
- Late changes applied and facts re-keyed.

## Capacity estimate

- **Versions**: 500,000 Type 2 changes/day on 50 million customers ≈ 180 million new versions a year; after 3 years about 590 million rows. At 200 bytes compressed per row ≈ 120 GB, manageable with clustering.
- **Daily load**: staging 500,000 changed keys (or a 50-million-row snapshot) and joining to 50 million current rows on the business key is a single hash join; in a warehouse this is typically minutes, well inside the 30-minute target.
- **Fact lookups**: billions of fact rows join by surrogate key equality, which is why surrogate keys are resolved once at load rather than with range joins at query time.

## What a strong answer includes

- **Per-column SCD types**, including hybrids, chosen by business need.
- A **hash-based, idempotent** load in one atomic commit.
- **Effective time from the source**, half-open ranges and one current row.
- A plan for **late changes**, **deletes** and **early-arriving facts**.
- **Point-in-time surrogate key lookups** at fact load.
- **Tests** for uniqueness, overlaps and gaps, plus version-count anomaly checks.

## Common mistakes

- Making every column Type 2, so typo fixes create versions.
- Using load time as `valid_from` and attributing facts to the wrong version.
- Non-NULL-safe hashes that make every row with a NULL look changed (or unchanged).
- Closing and inserting in separate, non-atomic steps, so a failure leaves keys with no current row.
- Treating keys missing from a partial snapshot as deletes.
- Joining facts to the current dimension row and rewriting history by accident.

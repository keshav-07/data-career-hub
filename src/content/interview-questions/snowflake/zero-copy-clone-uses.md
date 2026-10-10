---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What is zero-copy cloning in Snowflake, and how would you use it?"
seoTitle: "Snowflake Zero-Copy Cloning: Interview Answer"
description: "Interview answer: a Snowflake zero-copy clone is new metadata over the same micro-partitions, instant and free at first; use it for dev copies and restores."
technology: ["snowflake"]
topic: ["cloning", "time-travel", "testing"]
difficulty: "Easy"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "CREATE ... CLONE creates a table, schema or database whose metadata points at the source's existing micro-partitions, so it takes seconds and adds no storage at first. Because micro-partitions are immutable, later changes on either side write new micro-partitions owned and billed by the object that changed; the two are fully independent. Combined with AT or BEFORE it clones a point in time. Typical uses: production-sized dev and test environments, a safety copy before a risky migration, blue-green rebuilds swapped in with ALTER TABLE ... SWAP WITH, and restoring data damaged by a bad statement. Watch what is not copied: a cloned table's own grants unless COPY GRANTS, load history, and cloned tasks start suspended; old clones keep retired micro-partitions billable."
followUps: ["Why can an old clone increase storage cost?", "What happens to tasks and pipes in a cloned database?", "How do you restore a table to its state before a bad MERGE?", "How does SWAP WITH help deployments?"]
related: ["articles:snowflake/time-travel-fail-safe-cloning", "interview-questions:snowflake/time-travel-vs-fail-safe", "articles:snowflake/architecture-virtual-warehouses"]
versionContext: "Snowflake behaviour as documented in October 2026. Snowflake SQL is not executed here (noexec)."
sources:
  - { label: "Snowflake documentation: CREATE ... CLONE", url: "https://docs.snowflake.com/en/sql-reference/sql/create-clone" }
  - { label: "Snowflake documentation: Cloning considerations", url: "https://docs.snowflake.com/en/user-guide/object-clone" }
---

## Detailed explanation

Snowflake never edits micro-partitions in place. A table is a list of micro-partitions in metadata, so a clone is simply a new list pointing at the same files. Copy-on-write follows:

- Rows changed in the clone are written to new micro-partitions billed to the clone.
- Rows changed in the source replace micro-partitions there; the old ones cannot be purged while the clone references them, and show up as `RETAINED_FOR_CLONE_BYTES` on the source.

What happens to other parts:

| Item | In the clone |
|------|--------------|
| Data | Shared until either side changes |
| Grants | A cloned database or schema keeps grants on child objects; a cloned table needs `COPY GRANTS` to keep its own |
| Tasks | Cloned suspended |
| Pipes | Only pipes on external stages are cloned |
| Streams | Cloned, but unconsumed changes from before the clone are not readable |
| Load history | Not copied: a `COPY` into the clone may reload files the source already loaded |

## Example

<!-- noexec -->
```sql
-- A production-sized environment for a feature branch, in seconds
CREATE DATABASE dev_feature_123 CLONE prod;

-- A safety net before a risky migration
CREATE TABLE analytics.orders_pre_migration CLONE analytics.orders;
ALTER TABLE analytics.orders ADD COLUMN channel VARCHAR;
-- ... migrate, validate, then drop the safety copy

-- Blue-green rebuild: build the new version from a clone, validate, swap atomically
CREATE TABLE analytics.dim_customer_next CLONE analytics.dim_customer;
-- ... rebuild dim_customer_next ...
ALTER TABLE analytics.dim_customer SWAP WITH analytics.dim_customer_next;

-- Restore the state just before a bad statement
CREATE TABLE analytics.orders_restore
  CLONE analytics.orders BEFORE (STATEMENT => '<query id of the bad MERGE>');
```

## Trade-offs and pitfalls

- **Clones are not free forever**: as the source changes, the clone holds retired micro-partitions; after months it can cost nearly a full copy. Drop or refresh dev clones on a schedule.
- **Dev clones and fully qualified names**: a resumed task in a cloned database that writes to `prod.schema.table` writes to production. Use relative names or check before resuming.
- **Not cross-account**: clones live in the same account; use replication or data sharing to reach others.
- **Point-in-time clones** need Time Travel to still cover that point.

## Common mistakes

1. Thinking a clone copies data (and costs full storage on creation).
2. Expecting a cloned table to keep its grants without `COPY GRANTS`.
3. Forgetting about old clones in storage reviews.

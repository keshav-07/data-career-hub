---
title: "Design a Multi-Tenant Data Platform"
description: "A system-design case study for multi-tenant data platforms: isolation models, tenant-aware storage, row-level security, noisy neighbours, per-tenant cost and offboarding."
technology: ["data-engineering", "snowflake", "cloud"]
topic: ["multi-tenancy", "platform", "security"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
problem: "A B2B SaaS company with 4,000 customer organisations wants to offer in-product analytics, scheduled exports and a data-sharing feature, built on a shared data platform. Design a multi-tenant data platform that ingests each tenant's data, keeps tenants strictly isolated, gives every tenant fast and fair query performance, supports enterprise tenants with stronger isolation and residency needs, and attributes cost per tenant."
functionalRequirements:
  - "Ingest product events and operational data tagged with tenant id"
  - "Serve tenant-scoped dashboards and APIs inside the product"
  - "Provide scheduled exports and direct data sharing to a tenant's own warehouse"
  - "Support tiers: shared for most tenants, dedicated resources for enterprise tenants"
  - "Onboard and offboard tenants automatically, including full data deletion on exit"
  - "Report usage and cost per tenant"
nonFunctionalRequirements:
  - "No tenant can ever read another tenant's data, including through bugs in application queries"
  - "p95 dashboard queries under 2 seconds regardless of other tenants' load"
  - "Data residency: EU tenants' data stored and processed in the EU"
  - "Tenant offboarding deletes all their data within 30 days"
  - "Platform cost grows sub-linearly with the number of small tenants"
scaleAssumptions:
  - "Assumption: 4,000 tenants; the largest 1% generate about 50% of data"
  - "Assumption: 3 billion events per day in total"
  - "Assumption: 20 enterprise tenants on dedicated tier, 2 regions (EU and US)"
  - "Assumption: 2,000 concurrent dashboard users at peak across tenants"
architectureSummary: "Every record carries a tenant id from ingestion onwards, set by the platform from authenticated context, never by the payload alone. Small and medium tenants share tables clustered by tenant id, protected by row-level security policies bound to the session's tenant context; enterprise tenants get dedicated schemas or databases and compute. A query gateway authenticates the tenant, sets the context, routes to the right compute pool and enforces quotas. Regional deployments keep data in-region. Usage metering per tenant feeds cost attribution, and lifecycle automation handles onboarding and deletion."
technologies:
  - "Kafka with tenant-aware topics or keys"
  - "Warehouse with row access policies and per-workload compute (Snowflake, BigQuery, Redshift) or a lakehouse with fine-grained access control"
  - "Real-time OLAP store for in-product dashboards (Pinot, ClickHouse) with tenant-partitioned tables"
  - "Query gateway or semantic layer enforcing tenant context and quotas"
  - "Infrastructure as code for tenant provisioning"
  - "Data sharing features (Snowflake Secure Data Sharing, BigQuery Analytics Hub, Delta Sharing)"
tradeoffs:
  - decision: "Pooled storage with tenant id and row-level security for most tenants"
    alternative: "A database or schema per tenant for everyone"
    reason: "Thousands of small tenants share tables, compute and pipelines efficiently"
    consequence: "Isolation depends on policy correctness; a bug in policy is a cross-tenant leak, so it needs layered defences"
  - decision: "Dedicated tier (silo) for large and regulated tenants"
    alternative: "One pooled model for all"
    reason: "Strong isolation, predictable performance and custom residency for the tenants that pay for it"
    consequence: "More objects and pipelines to manage per enterprise tenant"
  - decision: "Tenant context set by the platform, enforced in the data layer"
    alternative: "Application code adds WHERE tenant_id filters"
    reason: "One forgotten filter cannot leak data when the database enforces the policy"
    consequence: "Every access path must go through a session that sets the context"
  - decision: "Cluster shared tables by tenant id"
    alternative: "Partition by tenant id"
    reason: "Efficient pruning without millions of tiny partitions from small tenants"
    consequence: "Very large tenants may need their own tables for best performance"
  - decision: "Quotas and separate compute pools by tier"
    alternative: "One shared pool"
    reason: "Prevents one tenant's heavy export from slowing everyone else"
    consequence: "Capacity planning per pool; idle capacity in dedicated pools"
interviewFollowUps:
  - "Pool, bridge or silo: how do you decide the isolation model per tenant?"
  - "How do you guarantee that a buggy query cannot return another tenant's rows?"
  - "One tenant runs a huge export every hour and slows everyone. What do you do?"
  - "An EU tenant requires that its data never leaves the EU. How does the design change?"
  - "A tenant cancels their contract. How do you delete all their data, including backups?"
  - "How do you attribute warehouse cost to tenants on shared compute?"
related:
  - "articles:snowflake/architecture-virtual-warehouses"
  - "articles:databricks/unity-catalog-governance"
  - "system-designs:gdpr-pii-compliant-pipeline"
  - "system-designs:reporting-analytics-platform"
  - "system-designs:kafka-ingestion-system"
previous: "system-designs:idempotent-reprocessing-system"
next: "system-designs:cost-optimized-warehouse-strategy"
versionContext: "The row-level security example was run on PostgreSQL 16 using a non-owner role (superusers and table owners bypass policies unless forced). Warehouse policies and provisioning are described, not executed."
sources:
  - { label: "Snowflake documentation: virtual warehouses", url: "https://docs.snowflake.com/en/user-guide/warehouses" }
  - { label: "Unity Catalog documentation", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
  - { label: "Apache Pinot: stream ingestion with upsert (partitioning by key)", url: "https://docs.pinot.apache.org/build-with-pinot/ingestion/upsert-dedup/upsert" }
  - { label: "PostgreSQL documentation: SQL language", url: "https://www.postgresql.org/docs/current/sql.html" }
---

## Approach

Multi-tenancy is a security problem first and a cost and performance problem second. The interviewer wants to hear an explicit **isolation model**, how tenant identity flows through every layer, how **noisy neighbours** are contained, and how tenants are onboarded, metered and deleted. Ask:

- **Who are the tenants?** Many small customers, a few large ones, or both?
- **What do tenants access?** Embedded dashboards, APIs, exports, direct SQL, data sharing?
- **Isolation requirements**: contractual, regulatory (residency, dedicated keys), or just "must not leak"?
- **Performance expectations** and tiers: does an enterprise plan promise dedicated capacity?
- **Cost model**: is cost passed to tenants or absorbed?
- **Lifecycle**: how often are tenants added and removed?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion</strong>: services publish events with the tenant id taken from the authenticated request context; Kafka topics are keyed by tenant and entity; validation rejects records without a valid tenant id.</li>
<li><strong>Storage by tier</strong>: pooled tables clustered by tenant id for standard tenants; dedicated schemas or databases (and keys) for enterprise tenants; separate regional deployments for EU and US.</li>
<li><strong>Policies</strong>: row access policies on pooled tables restrict rows to the session's tenant; grants on dedicated objects restrict access to that tenant's roles.</li>
<li><strong>Query gateway</strong>: authenticates the user, resolves the tenant and tier, sets the tenant context, routes to the right compute pool, applies quotas and timeouts.</li>
<li><strong>Serving</strong>: in-product dashboards via an OLAP store or the warehouse; exports and shares generated per tenant.</li>
<li><strong>Operations</strong>: provisioning and offboarding as code; usage metering per tenant; per-tenant monitoring and cost reports.</li>
</ol>
<figcaption>Tenant identity is set once by the platform and enforced at every layer, with isolation strength chosen per tier.</figcaption>
</figure>

A user at tenant Acme opens the usage dashboard. The product's backend authenticates them and calls the query gateway with Acme's tenant id from the session token. The gateway sees Acme is on the standard tier, opens a warehouse session as the shared application role, sets the tenant context, and runs the dashboard query on the shared BI compute pool with a 30-second timeout. The pooled `events` table's row access policy restricts rows to Acme, so even if the query forgot a tenant filter it could not return Globex's data. Globex, an enterprise tenant in the EU, is routed to its own database in the EU region and its own compute.

## Isolation models

| Model | Storage | Compute | Isolation | Cost per tenant | Fit |
|---|---|---|---|---|---|
| Pool | Shared tables with `tenant_id` | Shared | Logical (policies) | Lowest | Thousands of small tenants |
| Bridge | Schema per tenant in a shared database | Shared or pooled | Object-level grants | Medium | Hundreds of medium tenants |
| Silo | Database or account per tenant | Dedicated | Strongest | Highest | Enterprise, regulated, residency |

Most platforms are **hybrid**: pool by default, silo for tenants who need or pay for it, with the same pipeline code parameterised by tier.

## Tenant context and row-level security

Rules:

- The tenant id comes from **authenticated context** (the user's session or service identity), never trusted from a request parameter or payload field alone.
- Enforcement is in the **data layer**: row access policies (Snowflake, BigQuery row-level security, Redshift RLS, Unity Catalog row filters) or PostgreSQL row-level security, not only `WHERE tenant_id = ?` in application code.
- Every access path (dashboards, APIs, exports, notebooks, support tools) goes through a session that sets the context.

The example runs on PostgreSQL 16. A non-owner application role sees only the rows of the tenant set in the session, and nothing when no tenant is set:

```sql
CREATE TABLE events (
  tenant_id TEXT NOT NULL,
  event_id  INT,
  amount    NUMERIC(10,2)
);
INSERT INTO events VALUES ('acme', 1, 10.00), ('acme', 2, 25.00), ('globex', 3, 99.00);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON events
  USING (tenant_id = current_setting('app.tenant_id', true));

-- an application role that is not the table owner, so the policy applies to it
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_app') THEN
    CREATE ROLE tenant_app NOLOGIN;
  END IF;
END $$;
GRANT SELECT ON events TO tenant_app;

SET ROLE tenant_app;
SET app.tenant_id = 'acme';
SELECT tenant_id, count(*) AS events, sum(amount) AS total FROM events GROUP BY tenant_id;
SET app.tenant_id = 'globex';
SELECT tenant_id, count(*) AS events, sum(amount) AS total FROM events GROUP BY tenant_id;
RESET app.tenant_id;
SELECT count(*) AS rows_visible_without_tenant FROM events;
RESET ROLE;
```

```text
 tenant_id | events | total
-----------+--------+-------
 acme      |      2 | 35.00

 tenant_id | events | total
-----------+--------+-------
 globex    |      1 | 99.00

 rows_visible_without_tenant
-----------------------------
                           0
```

The query had no `WHERE tenant_id = ...`, yet each session saw only its tenant, and a session without a tenant saw nothing (fail closed). Note that table owners and superusers bypass policies unless `FORCE ROW LEVEL SECURITY` is set and roles are chosen carefully; the application must never connect as the owner.

**Defence in depth**: automated tests that run representative queries as one tenant and assert no other tenant's ids appear; periodic audits of query logs for sessions without tenant context; separate encryption keys for silo tenants.

## Storage layout

- Pooled tables **clustered** (or sorted) by `tenant_id` and time, so a tenant's queries read only its micro-partitions or files.
- Avoid partitioning by tenant in pooled tables: 4,000 tenants × daily partitions creates millions of small partitions. Partition by date, cluster by tenant.
- Very large pooled tenants can be moved to their own tables (bridge) without changing their access path, because the gateway routes by tier.
- In OLAP stores serving dashboards, partition segments by tenant hash so queries hit few servers.

## Noisy neighbours and fairness

- **Separate compute pools** by workload and tier: interactive dashboards, scheduled exports, internal analytics, enterprise dedicated warehouses.
- **Quotas** per tenant: concurrent queries, scanned bytes or credits per day, export size, API rate limits.
- **Timeouts** and query-shape limits for interactive queries (required time filters, row limits).
- **Queue heavy work** (exports, backfills) and run it on separate compute with fair scheduling across tenants.
- **Pre-aggregation** per tenant for common dashboards so most requests never touch raw data.

## Residency and keys

Deploy the platform per region; route tenants by their home region at ingestion and query time; keep backups and logs in-region. For silo tenants with key requirements, use customer-managed or tenant-specific encryption keys, which also enables crypto-shredding at offboarding.

## Data sharing and exports

Exports are generated per tenant by jobs that run under that tenant's context, so policies apply to them too. For tenants that want data in their own warehouse, use native sharing (Snowflake Secure Data Sharing, BigQuery Analytics Hub, Delta Sharing) of secure views filtered to the tenant, which avoids copying data.

## Onboarding, offboarding and metering

- **Onboarding** is code: create the tenant record, tier, region, roles, policies or dedicated objects, quotas and monitoring, all from a template.
- **Offboarding**: stop ingestion, export data if contractually required, delete rows from pooled tables (batched), drop dedicated objects, purge table history after the retention window, delete or expire backups, and record evidence. Tenant-specific keys make backup deletion verifiable.
- **Metering**: record per tenant ingested bytes, stored bytes, query count, scanned bytes or credits (tag queries with tenant id through query tags or labels), exports and API calls. Allocate shared compute cost by each tenant's share of work.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Policy misconfiguration | Cross-tenant data exposure | Policies as code with tests; automated cross-tenant leak tests in CI and production; incident process |
| Missing tenant id on ingestion | Orphaned or misattributed rows | Reject at validation; dead-letter with alert |
| One tenant overloads shared compute | Slow dashboards for all | Quotas, separate pools, timeouts; move the tenant to a dedicated tier |
| Region outage | Tenants in that region unavailable | Regional failover only where residency allows; documented RTO |
| Incomplete offboarding | Data retained after contract end | Checklist automation with verification queries per store |

## Scaling to 10×

At 40,000 tenants and 30 billion events a day, keep the pool model for the long tail (per-tenant objects would be unmanageable), automate promotion of growing tenants to bridge or silo tiers, shard pooled tables by tenant hash across multiple databases or clusters, and push more dashboards to pre-aggregated per-tenant tables. Metering and quotas become essential to keep unit cost falling.

## Monitoring and SLAs

- Query latency p95 per tier and for the largest tenants.
- Quota usage and throttling events per tenant.
- Sessions without tenant context (should be zero for tenant-facing roles).
- Cross-tenant leak test results.
- Cost per tenant and per tier; ingestion volume per tenant versus plan.

## Capacity estimate

- **Events**: 3 billion/day; with an assumed 0.5 KB each ≈ 1.5 TB/day raw. The top 40 tenants (1%) produce about 1.5 billion events/day; the other 3,960 average under 400,000 events/day each.
- **Storage**: assume columnar compression to about 0.3 TB/day ≈ 110 TB/year in pooled and dedicated tables combined.
- **Dashboards**: 2,000 concurrent users × one query every 15 seconds ≈ 130 queries/s at peak. With pre-aggregated per-tenant tables and caching, most queries scan kilobytes to megabytes; an OLAP store or a few warehouse clusters serve this.
- **Policy overhead**: a tenant predicate on a table clustered by tenant prunes to that tenant's files, so the policy usually reduces scanned data rather than adding cost.
- **Dedicated tier**: 20 enterprise tenants × a small dedicated warehouse that auto-suspends; cost passed through in their contract.

## What a strong answer includes

- An explicit **pool, bridge, silo** model with criteria per tenant.
- **Tenant identity from authenticated context**, enforced in the data layer with **row-level security**, failing closed.
- **Storage layout** that clusters by tenant without creating tiny partitions.
- **Noisy-neighbour controls**: pools, quotas, timeouts, queues.
- **Residency and keys** per tier.
- **Automated onboarding, offboarding and metering** with cost attribution.
- **Leak testing** as an ongoing control.

## Common mistakes

- Relying on developers to add `WHERE tenant_id = ?` to every query.
- Taking the tenant id from a request parameter.
- A schema or database per tenant for thousands of tiny tenants.
- Partitioning pooled tables by tenant and date, creating millions of partitions.
- One compute pool for dashboards and exports.
- Forgetting backups, logs and shares during offboarding.
- No per-tenant metering, so the largest tenants are silently subsidised.

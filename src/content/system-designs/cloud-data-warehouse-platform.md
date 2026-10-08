---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Cloud Data Warehouse for a SaaS Product"
seoTitle: "Design a Data Warehouse for a SaaS Product"
description: "A system-design case study for a SaaS warehouse: ELT from product, billing and CRM, tenant-aware modelling, MRR metrics, workload isolation and cost control."
inventoryId: "SYS-05"
technology: ["data-engineering", "snowflake", "data-warehousing"]
topic: ["warehouse", "architecture", "saas-metrics"]
tags: ["saas", "multi-tenant", "mrr", "elt", "dbt", "row-level-security", "workload-isolation"]
difficulty: "Advanced"
problem: "Design a cloud data warehouse for a B2B SaaS company that consolidates its multi-tenant product database, product usage events, billing system and CRM, so the company can run trusted revenue and usage reporting (MRR, churn, activation) and offer usage analytics to its own customers without one customer ever seeing another's data."
functionalRequirements:
  - "Load the multi-tenant application database (via CDC), product usage events, billing and CRM data"
  - "Model data into staging, intermediate and mart layers with tested, documented models"
  - "Produce certified SaaS metrics: MRR and its movements, net revenue retention, logo churn, activation and feature adoption"
  - "Maintain account, plan and subscription history (slowly changing dimensions)"
  - "Serve internal BI, analyst ad-hoc SQL, and customer-facing usage dashboards"
  - "Give analysts safe development environments that cannot affect production"
nonFunctionalRequirements:
  - "Daily revenue marts ready by 07:00; usage data at most 1 hour old for customer dashboards"
  - "Strict tenant isolation for anything customer-facing; personal data visible only to authorised roles"
  - "Loading and transformation never slow down BI or customer dashboards"
  - "Revenue numbers reconcile with the billing system to the cent each month"
  - "Predictable monthly compute spend with alerts before budgets are exceeded"
scaleAssumptions:
  - "Assumption: 8,000 customer accounts (tenants), 2 million end users"
  - "Assumption: product database of about 2 TB with 400 tables, all carrying a tenant id"
  - "Assumption: 300 million usage events a day (about 150 GB raw)"
  - "Assumption: about 150 internal analysts and 25 engineers; customer dashboards with peaks of 200 concurrent queries"
architectureSummary: "CDC replicates the shared-schema product database, an event pipeline lands usage events, and managed connectors load billing and CRM into raw schemas. Version-controlled SQL models (for example dbt) build staging, intermediate and mart layers, including an MRR movements fact and SCD Type 2 account and subscription dimensions. Separate compute warehouses isolate loading, transformation, internal BI and customer-facing queries; row-level policies enforce tenant isolation and masking protects personal data; resource monitors cap spend."
technologies: ["Cloud data warehouse (for example Snowflake)", "Log-based CDC for the application database", "Event collection pipeline (Kafka or a managed collector)", "Managed connectors for billing and CRM", "dbt or SQL-based transformation", "Orchestrator", "BI tool and an embedded analytics layer or API"]
tradeoffs:
  - decision: "ELT with version-controlled SQL models"
    alternative: "ETL in a separate processing engine before loading"
    reason: "Warehouse compute scales on demand; analysts can read, review and test SQL"
    consequence: "Raw data, including personal data, is stored in the warehouse and needs strict access control"
  - decision: "Separate compute per workload (load, transform, BI, customer-facing, ad hoc)"
    alternative: "One shared warehouse"
    reason: "Loading never slows dashboards, customer-facing latency is protected, and cost is attributable"
    consequence: "More objects to size, monitor and budget"
  - decision: "Shared tables with row-level tenant policies for customer-facing data"
    alternative: "One schema or database per tenant"
    reason: "8,000 tenants would mean 8,000 copies of every model; policies keep one model with enforced filtering"
    consequence: "Every customer-facing query path must go through the policy; very large tenants may still need dedicated resources"
  - decision: "Monthly MRR snapshot and movements fact derived from billing"
    alternative: "Compute MRR on the fly from invoices in each dashboard"
    reason: "One certified definition of MRR, new, expansion, contraction and churn that reconciles with billing"
    consequence: "Definition changes need governance and restatement"
  - decision: "Incremental models for large usage facts"
    alternative: "Full rebuilds every run"
    reason: "Usage events grow daily; incremental runs are faster and cheaper"
    consequence: "Late events and corrections need a lookback window and periodic full refreshes"
interviewFollowUps:
  - "How do you guarantee one customer can never see another customer's data in embedded dashboards?"
  - "Finance says your MRR is 0.4% off the billing system. How do you find the difference?"
  - "How do you handle a customer who downgrades mid-month with proration?"
  - "A product team adds a column to a table in the application database. What happens in the warehouse?"
  - "How would you stop warehouse costs growing faster than revenue?"
  - "How do you give analysts a sandbox with production-like data safely?"
related:
  - "articles:snowflake/architecture-virtual-warehouses"
  - "articles:etl-elt/etl-vs-elt"
  - "articles:data-warehousing/star-schema"
  - "articles:data-warehousing/slowly-changing-dimensions"
  - "system-designs:change-data-capture-platform"
  - "system-designs:reporting-analytics-platform"
versionContext: "Rewritten 2026-10-05 to cover the SaaS warehouse scenario. The MRR movements SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Snowflake features (virtual warehouses, multi-cluster warehouses, resource monitors) are described from Snowflake documentation; some depend on the Snowflake edition."
sources:
  - { label: "Snowflake documentation: virtual warehouses overview", url: "https://docs.snowflake.com/en/user-guide/warehouses-overview" }
  - { label: "Snowflake documentation: multi-cluster warehouses", url: "https://docs.snowflake.com/en/user-guide/warehouses-multicluster" }
  - { label: "Snowflake documentation: resource monitors", url: "https://docs.snowflake.com/en/user-guide/resource-monitors" }
  - { label: "Snowflake documentation: understanding compute cost", url: "https://docs.snowflake.com/en/user-guide/cost-understanding-compute" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
---

## Approach

A SaaS warehouse is mostly an **organisational and modelling design** on top of a managed warehouse that handles storage and scaling: what the layers are, who owns each one, how the core SaaS metrics are defined once, how tenants are isolated, and how compute cost is kept predictable. The SaaS-specific parts are **multi-tenancy** (every row belongs to a customer) and **subscription revenue** (MRR and its movements must reconcile with billing).

Clarifying questions:

- **Sources**: one shared-schema application database, or a database per tenant? Which billing and CRM systems?
- **Consumers**: internal BI only, or also customer-facing analytics inside the product?
- **Metrics**: which ones are board-level (MRR, net revenue retention, churn) and who owns their definitions?
- **Freshness**: daily for finance, hourly or better for product usage?
- **Compliance**: personal data of customers' end users, data residency for some tenants, contractual deletion on cancellation?
- **Budget**: is there a fixed monthly warehouse budget?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingest</strong>: CDC replicates the application database into a raw schema; usage events land through the event pipeline; managed connectors load billing and CRM, each into its own raw schema.</li>
<li><strong>Staging</strong>: one model per source table: rename, cast types, deduplicate CDC changes to the latest version, standardise tenant ids.</li>
<li><strong>Intermediate</strong>: joins and business logic shared across marts, such as mapping billing customers to product tenants and CRM accounts.</li>
<li><strong>Marts</strong>: star schemas per domain: revenue (MRR snapshots and movements), product usage (daily tenant and user activity), customer success (health scores).</li>
<li><strong>Serve internal</strong>: certified dashboards and analyst SQL on the BI warehouse, under role-based access.</li>
<li><strong>Serve customers</strong>: tenant-scoped usage marts behind row-level policies, queried through an embedded analytics layer or API on a dedicated warehouse.</li>
</ol>
<figcaption>Data moves through tested SQL layers; internal and customer-facing consumers read different marts on separate compute.</figcaption>
</figure>

Walkthrough:

1. **Ingestion** keeps each source in its own raw schema exactly as delivered, so problems can be traced back.
2. **Staging** is where CDC streams become clean tables: one row per primary key at its latest version, soft-deleted rows flagged, timestamps converted to UTC.
3. **Intermediate** resolves identity across systems. The hardest join in a SaaS warehouse is often "which billing customer is which product tenant is which CRM account". Maintain an explicit mapping table with owners, not a fuzzy join on company names.
4. **Marts** are designed for the questions asked, with certified metric definitions.
5. **Two serving paths** have different security and performance needs, so they get separate marts and separate compute.

## Data model

Key dimensions and facts:

| Model | Grain | Notes |
|---|---|---|
| `dim_account` | One row per account version (SCD Type 2) | Plan, segment, owner, region; `valid_from` and `valid_to` |
| `dim_subscription` | One row per subscription version | Plan, seats, price, billing interval |
| `fct_mrr_monthly` | Account × month | Normalised monthly recurring revenue (annual plans ÷ 12), currency-converted |
| `fct_mrr_movements` | Account × month | New, expansion, contraction, churned, reactivated, retained |
| `fct_usage_daily` | Tenant × user × feature × day | Events, active minutes, key actions |
| `fct_tenant_daily` | Tenant × day | Active users, seats used, feature adoption flags |

Every table carries `tenant_id`. Facts are clustered or partitioned by date (and, for large customer-facing tables, also by tenant) so tenant-scoped queries prune well.

## SaaS metrics: MRR movements

Define MRR once and derive everything from it. A worked example in PostgreSQL, comparing August with July per account:

```sql
CREATE TABLE mrr_monthly (account_id int, month date, mrr numeric(10,2), PRIMARY KEY (account_id, month));
INSERT INTO mrr_monthly VALUES
  (1, '2026-07-01', 100), (1, '2026-08-01', 100),
  (2, '2026-07-01', 200), (2, '2026-08-01', 350),
  (3, '2026-07-01', 300), (3, '2026-08-01', 120),
  (4, '2026-07-01',  80),
  (5, '2026-08-01', 150);

WITH cur AS (SELECT * FROM mrr_monthly WHERE month = '2026-08-01'),
     prev AS (SELECT * FROM mrr_monthly WHERE month = '2026-07-01'),
     moves AS (
  SELECT coalesce(c.account_id, p.account_id) AS account_id,
         coalesce(p.mrr, 0) AS prev_mrr, coalesce(c.mrr, 0) AS cur_mrr,
         CASE WHEN p.account_id IS NULL THEN 'new'
              WHEN c.account_id IS NULL THEN 'churned'
              WHEN c.mrr > p.mrr THEN 'expansion'
              WHEN c.mrr < p.mrr THEN 'contraction'
              ELSE 'retained' END AS movement
  FROM cur c FULL OUTER JOIN prev p ON p.account_id = c.account_id
)
SELECT movement, count(*) AS accounts, sum(cur_mrr - prev_mrr) AS mrr_change
FROM moves
GROUP BY movement
ORDER BY movement;
```

```text
  movement   | accounts | mrr_change
-------------+----------+------------
 churned     |        1 |     -80.00
 contraction |        1 |    -180.00
 expansion   |        1 |     150.00
 new         |        1 |     150.00
 retained    |        1 |       0.00
```

The movements sum to +40, which is exactly August's total (720) minus July's (680). That identity is the test to run every month: **opening MRR + movements = closing MRR**. The `FULL OUTER JOIN` is what makes new and churned accounts visible; an inner join would silently drop both.

Real-world details the production model must handle:

- **Reactivation**: an account that churned months ago and returns should be "reactivated", not "new"; look back further than one month.
- **Annual and multi-year plans** are normalised to monthly; discounts and credits are applied according to finance's rules.
- **Proration and mid-month changes**: decide whether MRR is measured at month end or as a daily average, and document it.
- **Currency**: convert at a fixed monthly rate so FX swings do not show up as expansion or contraction.

From the movements fact, net revenue retention for a cohort is (starting MRR + expansion − contraction − churn) ÷ starting MRR, using only accounts that existed at the start.

## Ingestion and schema changes

- CDC from the application database means product engineers' schema changes flow straight into raw tables. Additive columns appear automatically; renames and type changes break staging models, so add a **data contract** for the tables the warehouse depends on, and run schema-change detection that fails loudly.
- Usage events have a schema per event type, validated at collection; unknown events go to a quarantine table.
- Billing and CRM connectors are managed, but their field mappings change with vendor updates; pin connector versions where possible and test after updates.

## Late data and corrections

- Usage events from offline clients arrive late: incremental models reprocess a lookback window (for example the last 3 days) on every run.
- Billing corrections (refunds, credit notes, back-dated plan changes) change past MRR. Finance closes each month; after close, changes are posted as adjustments in the current month rather than rewriting closed months. Keep a snapshot of each closed month.

## Data quality

Tests run in the same job as the models; failures stop downstream models and certified dashboards from refreshing:

- Uniqueness and not-null on keys, accepted values on status fields, relationships between facts and dimensions.
- Every row has a valid `tenant_id` that exists in `dim_account`.
- MRR reconciles with billing totals per month to the cent; opening + movements = closing.
- Freshness checks per source with warn and error thresholds.

## Workload isolation

Separate virtual warehouses (compute clusters) for loading, transformation, internal BI, ad-hoc analysis and customer-facing queries, each with its own size, auto-suspend setting and budget. Customer-facing dashboards need consistent latency under concurrency, so that warehouse can use multi-cluster scaling (in Snowflake this depends on the edition) to add clusters when queries queue, rather than a bigger single cluster.

## Security, tenant isolation and PII

- **Roles per function**: engineers, analysts, finance, customer success, and a service role for the embedded analytics layer.
- **Tenant isolation for customer-facing data**: the embedded layer authenticates the end user, and every query runs with the user's tenant id bound as a session context; a **row access policy** on customer-facing marts filters rows to that tenant. Never rely on the dashboard adding `WHERE tenant_id = ...` itself. Test isolation automatically: for sampled tenants, assert that queries return no rows from other tenants.
- **Personal data** of end users (names, emails) is masked for most internal roles with masking policies, and excluded from customer-facing marts unless the customer is entitled to see their own users' details.
- **Development**: zero-copy clones or separate development databases give analysts production-like data; mask personal data in clones.
- **Deletion**: when a customer leaves and the contract requires deletion, delete by `tenant_id` across raw, staging and marts, and account for time-travel and fail-safe retention periods in the platform.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| CDC connector breaks on a schema change | Raw tables stale | Freshness alert; fix mapping; connector resumes from log position |
| Bad model deploy | Wrong numbers in marts | CI tests on pull requests; rerun from the previous version; certified dashboards blocked by failing tests |
| Missing tenant policy on a new customer-facing table | Possible cross-tenant exposure | Policy assignment enforced by a deployment check; isolation tests in CI |
| Runaway query | Credits burnt, queueing | Statement timeouts per warehouse; resource monitors suspend at budget limits |
| Billing connector delayed | MRR mart late | Run other marts; publish revenue marts when the source is fresh |

## Monitoring and SLAs

- Freshness per source and per mart against the 07:00 and 1-hour targets.
- Model run times and test failures per run.
- Query queueing and p95 latency on the customer-facing warehouse.
- Credit usage per warehouse per day against budgets.

## Cost

Auto-suspend on every warehouse; resource monitors with notify and suspend thresholds; incremental models for large facts; a weekly review of the most expensive queries and models; and chargeback or showback per team. Customer-facing analytics should be costed per tenant so pricing can reflect heavy users.

## Scaling to 10×

At 80,000 tenants and 3 billion usage events a day: pre-aggregate customer-facing marts to tenant × day (and tenant × hour for recent data) so dashboards never scan raw events; cluster large facts by tenant and date; move the largest tenants to dedicated compute if their queries dominate; and consider a separate low-latency serving store for customer-facing analytics if warehouse concurrency costs become too high.

## Capacity estimate

Assumptions: 300 million events a day at 500 bytes raw; about 5:1 compression in the warehouse; 3 years of usage history; 2 TB application database.

- **Usage events**: 300 million × 500 B = 150 GB/day raw ≈ 30 GB/day compressed; 3 years ≈ 33 TB compressed.
- **Daily usage fact** (tenant × user × feature × day): if 400,000 users are active daily and use 8 features on average, about 3.2 million rows a day, around 1.2 billion a year: small.
- **Application database replica**: 2 TB raw, less once compressed; CDC change volume of perhaps a few GB a day.
- **MRR tables**: 8,000 accounts × 12 months = 96,000 rows a year: tiny, which is why the difficulty is correctness, not size.
- **Customer-facing concurrency**: 200 concurrent queries at peak; if each pre-aggregated query takes about a second on a medium cluster that handles around 8 concurrent queries (an assumption to test), you need roughly 25 cluster-equivalents at the very peak, which argues for multi-cluster scaling plus result caching and pre-aggregation.

## What a strong answer includes

- Layered ELT with owners and tests, and an explicit identity mapping between product, billing and CRM.
- Certified SaaS metrics with a movements model that reconciles (opening + movements = closing) and with billing.
- SCD Type 2 dimensions for accounts and subscriptions.
- Tenant isolation enforced by the warehouse (row-level policies), not by dashboard filters, with automated isolation tests.
- Workload isolation, auto-suspend and resource monitors for cost control.
- A plan for schema changes in the application database (contracts, detection).

## Common mistakes

- Computing MRR differently in different dashboards.
- Inner joins in movement calculations that hide new and churned customers.
- Trusting the front end to filter by tenant.
- One shared warehouse for loading, transformation and dashboards.
- No reconciliation with the billing system.
- Copying production data with personal fields into unmasked development environments.

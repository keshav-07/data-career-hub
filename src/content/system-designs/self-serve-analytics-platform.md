---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Self-Serve Analytics Platform"
description: "A system-design case study for self-serve analytics: certified datasets, a semantic layer, a catalog, sandboxes, row-level security and cost guardrails."
technology: ["data-engineering", "data-warehousing", "sql"]
topic: ["platform", "governance", "analytics", "architecture"]
tags: ["self-serve-analytics", "semantic-layer", "data-catalog", "row-level-security", "data-products", "cost-guardrails"]
difficulty: "Advanced"
problem: "Design a platform that lets 1,000 employees across product, marketing, finance and operations find trustworthy data, answer their own questions with SQL or a BI tool, and build their own dashboards and models, without a central data team writing every query, and without losing control of data quality, access to sensitive data or cost."
functionalRequirements:
  - "Searchable catalog of datasets with owners, descriptions, freshness, quality status and lineage"
  - "Certified, documented datasets and metric definitions reused by every tool"
  - "Self-service access requests with approval by data owners and automatic expiry"
  - "Personal sandboxes for exploration and a promotion path from sandbox to shared, certified assets"
  - "Row- and column-level security applied consistently across SQL, BI and notebooks"
  - "Usage and cost visibility per team"
nonFunctionalRequirements:
  - "Most common questions answerable from certified datasets without engineering help"
  - "One definition per business metric; dashboards built on certified metrics show a badge"
  - "Sensitive data visible only to approved roles, with every grant auditable"
  - "Interactive queries on certified marts return in seconds at p95"
  - "No single user or team can run up unbounded compute cost"
scaleAssumptions:
  - "Assumption: 1,000 monthly active data users, 150 of them writing SQL regularly"
  - "Assumption: 3,000 tables, of which about 150 are certified"
  - "Assumption: 200 certified metrics; 4,000 dashboards, half unused after 90 days"
  - "Assumption: 50,000 queries a day, peaking at 9:00 to 11:00 local time"
architectureSummary: "A layered warehouse or lakehouse produces domain-owned, tested marts. A semantic layer defines metrics and joins once and serves them to BI tools, notebooks and APIs. A catalog harvests metadata, lineage, quality results and usage, and drives access requests. Policies (row filters, column masks) are attached to data classifications and enforced in the warehouse for every tool. Sandboxes and separate compute pools with quotas let users experiment; a promotion workflow moves useful work into reviewed, certified models."
technologies: ["Cloud data warehouse or lakehouse", "dbt or SQL-based transformation", "Semantic or metrics layer", "Data catalog with lineage", "BI tool and notebooks", "Policy engine (warehouse row access and masking policies, tag-based)", "Identity provider and access-request workflow", "Cost monitoring and quotas"]
tradeoffs:
  - decision: "Tiered datasets (certified, shared, sandbox)"
    alternative: "Everything equally open, or everything centrally built"
    reason: "Users move fast in sandboxes while decisions rest on reviewed, tested datasets"
    consequence: "Needs a clear, light certification process or nothing gets certified"
  - decision: "Semantic layer for metric definitions"
    alternative: "Metrics defined inside each dashboard"
    reason: "Revenue means the same thing in every tool; changes happen in one place"
    consequence: "Another component to operate, and BI tools must integrate with it"
  - decision: "Enforce security in the warehouse, not in each tool"
    alternative: "Configure permissions per BI tool"
    reason: "One enforcement point covers SQL, BI, notebooks and exports"
    consequence: "Policies must be expressive enough for all cases, and tools must pass the real user identity"
  - decision: "Domain ownership of marts (data products)"
    alternative: "Central team owns all models"
    reason: "Domain teams know their data and scale with the company"
    consequence: "Needs shared standards, templates and a platform team to support them"
  - decision: "Compute quotas and separate pools for ad-hoc work"
    alternative: "Unlimited shared compute"
    reason: "Protects dashboards and pipelines and keeps cost predictable"
    consequence: "Some heavy users hit limits and need a path to request more"
interviewFollowUps:
  - "Two dashboards show different revenue for last month. How does your platform prevent and resolve that?"
  - "How do you stop self-serve users from seeing salary data or customer emails they should not see?"
  - "How do you keep the catalog from becoming a graveyard of undocumented tables?"
  - "An analyst's sandbox query becomes a critical weekly report. What should happen?"
  - "How do you measure whether self-serve is working?"
  - "Ad-hoc query cost tripled this quarter. What do you do?"
related:
  - "system-designs:cloud-data-warehouse-platform"
  - "system-designs:reporting-analytics-platform"
  - "system-designs:schema-registry-contract-system"
  - "articles:databricks/unity-catalog-governance"
  - "articles:data-warehousing/star-schema"
  - "articles:snowflake/architecture-virtual-warehouses"
versionContext: "The metric view and row-level security example was run on PostgreSQL 16 with scripts/verify-examples.py; RLS and security_invoker behaviour checked against the PostgreSQL 16 documentation source. Warehouse-specific policy features are described generically."
sources:
  - { label: "PostgreSQL 16: row security policies", url: "https://www.postgresql.org/docs/16/ddl-rowsecurity.html" }
  - { label: "Snowflake documentation: virtual warehouses overview", url: "https://docs.snowflake.com/en/user-guide/warehouses-overview" }
  - { label: "Snowflake documentation: resource monitors", url: "https://docs.snowflake.com/en/user-guide/resource-monitors" }
  - { label: "Databricks documentation: Unity Catalog", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
previous: "system-designs:schema-registry-contract-system"
---

## Approach

"Self-serve" fails in two opposite ways: either everything goes through a central team (slow), or everyone queries everything and nobody trusts any number (chaos). A good design is a **paved road**: trustworthy, documented, secured data that is easier to use than the alternatives, plus a safe place to experiment and a path from experiment to production. Most of the work is product and governance design; the technology choices follow.

Clarifying questions:

- **Who are the users?** SQL-fluent analysts, spreadsheet users, product managers using BI, data scientists in notebooks?
- **What do they need most?** Ad-hoc questions, dashboards, exports, ML features?
- **What is sensitive?** Personal data, finance before earnings, HR data?
- **Current pain**: conflicting numbers, slow ticket queues, runaway cost, or all three?
- **Ownership model**: central data team, domain teams, or a mix?
- **Tools** already in use, and whether they can pass user identity to the warehouse.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion and modelling</strong>: sources land in raw layers; domain teams build tested staging, intermediate and mart models in version control.</li>
<li><strong>Certification</strong>: marts that pass review, tests, documentation and freshness SLAs are tagged certified, with a named owner.</li>
<li><strong>Semantic layer</strong>: metrics (net revenue, active customers), dimensions and join paths are defined once over certified marts.</li>
<li><strong>Catalog</strong>: harvests schemas, descriptions, owners, lineage, test results, freshness and usage; search ranks certified assets first.</li>
<li><strong>Access</strong>: users request datasets in the catalog; owners approve; grants are time-limited roles; policies on classified columns and rows are enforced in the warehouse.</li>
<li><strong>Consumption</strong>: BI tools and notebooks query through the semantic layer or directly with SQL, under the user's own identity.</li>
<li><strong>Sandboxes and promotion</strong>: personal and team schemas on quota-limited compute; useful work is promoted through code review into shared or certified models.</li>
<li><strong>Observability</strong>: usage, cost, query performance and data quality per dataset and team.</li>
</ol>
<figcaption>Certified data and shared definitions make the right path the easy path; policies and quotas keep it safe.</figcaption>
</figure>

## Dataset tiers

| Tier | Who builds it | Guarantees | Where it appears |
|---|---|---|---|
| Certified | Domain owner, reviewed | Tests, documentation, SLA, owner on call | Top of search, badge in BI |
| Shared | Any team, via code review | Tests encouraged, owner listed | Searchable, no badge |
| Sandbox | Individuals | None; auto-expires after a period of inactivity | Personal schema only |

Keep certification light (a checklist, not a committee) and time-boxed, or the certified tier stays empty and people route around it.

## Metrics defined once, secured once

A semantic layer generates SQL from metric definitions. The principle can be shown in plain PostgreSQL: a metric view that encodes the business rules (exclude test and cancelled orders, subtract refunds), with row-level security applied underneath so the same metric respects each user's access.

```sql
DROP ROLE IF EXISTS sd2_analyst_eu;
CREATE ROLE sd2_analyst_eu;
CREATE TABLE orders (order_id int, region text, status text, gross numeric(10,2), refunds numeric(10,2));
INSERT INTO orders VALUES
  (1, 'EU', 'complete', 100, 0), (2, 'EU', 'complete', 80, 20), (3, 'EU', 'test', 999, 0),
  (4, 'US', 'complete', 300, 0), (5, 'US', 'cancelled', 50, 50);

CREATE VIEW metric_net_revenue WITH (security_invoker = true) AS
SELECT region,
       sum(gross - refunds) AS net_revenue,
       count(*) AS orders
FROM orders
WHERE status = 'complete'
GROUP BY region;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY eu_only ON orders FOR SELECT TO sd2_analyst_eu USING (region = 'EU');
GRANT SELECT ON orders, metric_net_revenue TO sd2_analyst_eu;

SELECT * FROM metric_net_revenue ORDER BY region;
SET ROLE sd2_analyst_eu;
SELECT * FROM metric_net_revenue ORDER BY region;
RESET ROLE;

DROP VIEW metric_net_revenue;
DROP TABLE orders;
DROP ROLE sd2_analyst_eu;
```

As the table owner:

```text
 region | net_revenue | orders
--------+-------------+--------
 EU     |      160.00 |      2
 US     |      300.00 |      1
```

As the EU analyst:

```text
 region | net_revenue | orders
--------+-------------+--------
 EU     |      160.00 |      2
```

Points to notice:

- The business rules live in one place. Nobody can accidentally include the 999.00 test order or forget refunds.
- `security_invoker = true` makes the view check permissions and row policies as the **querying** user. Without it, a PostgreSQL view runs with its owner's rights and could bypass the policy.
- Table owners (and superusers) normally bypass row security, which is why the first query sees both regions. In production, models are owned by a service role and nobody queries as that role interactively.
- Commercial warehouses offer the same ideas (row access policies, masking policies, tag-based policies); attach policies to **classifications** (for example a `pii.email` tag) so new tables inherit protection automatically.

## Identity and access

- Every tool must query as the **real user** (or pass the user's identity for policy evaluation). A BI tool with one shared service account silently defeats row-level security.
- Access requests in the catalog create time-limited grants to roles, approved by the dataset owner; expiry and quarterly reviews prevent permission creep.
- Column masking for personal data by default; unmasked access is a separate, justified request.

## Catalog that stays alive

A catalog becomes a graveyard when it depends on people writing documentation after the fact. Keep it alive by:

- Harvesting automatically: schemas, lineage from transformation code, test results, freshness, query usage.
- Requiring descriptions and owners in code review for shared and certified models.
- Ranking by usage and certification so the best assets surface first.
- Deprecating unused tables: flag after 90 days without queries, notify owners, archive after a grace period.

## Sandboxes and promotion

- Each user and team gets a schema on a dedicated ad-hoc compute pool with a quota.
- Zero-copy clones or views of certified data, with the same masking as production, give realistic data without copies of sensitive fields.
- **Promotion**: when a sandbox query becomes a recurring report, it moves into the shared code repository, gets tests and an owner, and is scheduled by the orchestrator. The platform makes this easy with templates; otherwise critical reports run forever from someone's sandbox.

## Ingestion, freshness and quality

Self-serve users rarely see pipeline details, so surface them: every certified dataset shows last refresh time, freshness SLA status and latest test results in the catalog and BI tool. A failing test on a certified mart blocks its downstream refresh and shows a banner, rather than publishing wrong numbers silently.

## Late data and schema evolution

- Certified marts document their restatement window ("last 3 days may change").
- Schema changes to certified marts follow a contract: additive changes freely, breaking changes through versioned models and deprecation notices, with lineage to notify dashboard owners.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Conflicting metric definitions | Two answers to one question | Semantic layer as single source; certified badge; deprecate duplicates |
| Shared BI service account | Row security bypassed | Require user identity pass-through; audit tool connections |
| Runaway ad-hoc queries | Cost spike, slow dashboards | Quotas, statement timeouts, separate pools, alerts per user |
| Critical report in a sandbox | Breaks when the user leaves | Usage-based detection of sandbox objects with many viewers; promotion workflow |
| Certified mart fails tests | Wrong numbers risk | Block refresh, banner in BI, page the owner |

## Monitoring and success measures

- Share of queries and dashboard views that hit certified datasets or semantic-layer metrics.
- Time from access request to grant; number of requests open.
- Ticket volume to the central data team for "pull me this number" requests.
- Cost per team and per query type; top expensive queries weekly.
- Freshness and test status of certified datasets.

## Cost

- Separate compute pools for ad-hoc, BI and pipelines, each with auto-suspend and budgets.
- Statement timeouts and maximum bytes scanned for ad-hoc work; warn before running very large queries.
- Result caching and pre-aggregated marts for popular dashboards.
- Showback per team; it changes behaviour more than any policy.
- Archive unused dashboards and tables.

## Scaling to 10×

At 10,000 users and 30,000 tables: federate certification to domains with central standards, automate classification (scanners that tag likely personal data for owner confirmation), invest in search and recommendations in the catalog, and give large domains their own compute and budgets.

## Capacity estimate

Assumptions: 50,000 queries a day, 70% during an 8-hour working day, 60% from dashboards (mostly cacheable), the rest ad hoc; average ad-hoc query scans 2 GB; dashboards scan about 200 MB each on certified marts.

- **Peak query rate**: 35,000 queries in 8 hours ≈ 1.2 per second on average, with bursts of perhaps 10 per second at 9:00.
- **Dashboard load**: 30,000 queries × 200 MB ≈ 6 TB scanned a day, much less with result caching.
- **Ad-hoc load**: 20,000 × 2 GB ≈ 40 TB scanned a day: the main cost driver, which is why ad-hoc quotas and partition pruning guidance matter.
- **Catalog**: 3,000 tables × ~30 columns ≈ 90,000 column entries plus lineage edges: small.
- **Access workflow**: if 5% of 1,000 users request something new each week, about 50 requests a week; automation and owner routing keep turnaround to hours.

## What a strong answer includes

- Tiers of datasets with a light certification process and named owners.
- A semantic layer so metrics are defined once and used everywhere.
- Security enforced in the warehouse with policies tied to classifications, and real user identity from every tool.
- A catalog fed automatically by lineage, tests, freshness and usage.
- Sandboxes with quotas and a promotion path into reviewed code.
- Measures of success and cost controls.

## Common mistakes

- Opening raw tables to everyone and calling it self-serve.
- Defining metrics inside each dashboard.
- BI tools connecting with one shared account.
- Catalogs maintained by hand.
- Unlimited ad-hoc compute on the same pool as dashboards.
- No path from sandbox to production, so critical reports live in personal schemas.

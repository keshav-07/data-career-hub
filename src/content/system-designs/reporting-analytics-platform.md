---
publishedDate: "2026-10-04"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design an Analytics and BI Platform"
description: "Analytics and BI platform system design: warehouse choice, dimensional marts, a semantic layer, dashboard performance, access control and cost."
inventoryId: "SYS-08"
technology: ["data-engineering", "data-warehousing", "dbt"]
topic: ["analytics", "bi", "architecture"]
difficulty: "Advanced"
problem: "Design the analytics and BI platform for a mid-sized company where executives, finance, marketing and operations all need dashboards and self-service analysis, data comes from about 40 sources, and today different teams report different numbers for the same metric."
functionalRequirements:
  - "Ingest data from operational databases, SaaS tools and event streams into one warehouse"
  - "Model data into documented, tested dimensional marts per business area"
  - "Define each business metric once in a semantic layer and reuse it in every tool"
  - "Provide certified executive dashboards, operational dashboards and governed self-service exploration"
  - "Apply row-level and column-level security (regions, salary, personal data)"
  - "Schedule exports and alerts for finance and operations"
nonFunctionalRequirements:
  - "Executive dashboards load in under 3 seconds at p95"
  - "Daily data ready by 07:00 local time; operational data no more than 15 minutes old"
  - "Every certified number traceable to its source tables and definition"
  - "Predictable warehouse cost with per-team attribution"
  - "Scale to 10× users and data without a rebuild"
scaleAssumptions:
  - "Assumption: 40 sources, about 200 GB of new data per day"
  - "Assumption: largest fact table about 3 billion rows (order lines over 5 years)"
  - "Assumption: 1,000 BI users, 150 concurrent at the Monday-morning peak"
  - "Assumption: about 60 certified metrics and 300 dashboards"
architectureSummary: "Managed ELT connectors and CDC load sources into raw schemas of a cloud warehouse; dbt builds staging, intermediate and dimensional mart layers with tests and contracts; a semantic layer defines metrics and joins once; BI tools query the semantic layer, with aggregate tables or caches for heavy dashboards; access control, lineage and cost attribution are enforced in the warehouse and catalog."
technologies:
  - "Cloud warehouse: Snowflake, BigQuery or Amazon Redshift"
  - "Managed connectors (Fivetran, Airbyte) plus CDC for core databases"
  - "dbt for transformations, tests and documentation"
  - "Semantic layer: dbt Semantic Layer (MetricFlow), Cube or LookML"
  - "BI tool: Looker, Power BI, Tableau or Superset"
  - "Orchestrator (Airflow or dbt's scheduler) and a data catalog"
tradeoffs:
  - decision: "Cloud warehouse as the serving engine"
    alternative: "Lakehouse SQL endpoint on open tables"
    reason: "Mature concurrency handling, governance and BI integration with little tuning for a BI-first workload"
    consequence: "Proprietary storage and compute pricing; a lakehouse is better when ML and many engines share the same data"
  - decision: "Dimensional (star schema) marts"
    alternative: "One big wide table per dashboard"
    reason: "Conformed dimensions give consistent slicing across subject areas and are easy for BI tools to join"
    consequence: "More modelling effort; some wide tables are still added for performance"
  - decision: "Central semantic layer for certified metrics"
    alternative: "Metric logic written inside each dashboard"
    reason: "Revenue, active customer and margin are defined once and match everywhere"
    consequence: "Metric changes go through review; analysts lose some ad-hoc freedom"
  - decision: "Pre-aggregated tables and BI caching for the heaviest dashboards"
    alternative: "Query detailed facts live for every view"
    reason: "Fast dashboards and much lower warehouse cost at peak"
    consequence: "Aggregates must be refreshed in step with facts and tested for consistency"
  - decision: "Security enforced in the warehouse (row access and masking policies)"
    alternative: "Separate dashboards or extracts per region"
    reason: "One dashboard, correct data per user, and the same rules for SQL users"
    consequence: "Policies need tests, and BI service accounts must pass the end user's identity"
interviewFollowUps:
  - "Finance and sales report different revenue for last month. How do you find out why and fix it for good?"
  - "The executive dashboard takes 40 seconds on Monday mornings. What do you do?"
  - "Snowflake, BigQuery or Redshift for this company, and why?"
  - "How do you show users how fresh a number is and whether it is certified?"
  - "How do you test a metric definition before releasing a change?"
  - "How do you stop warehouse spend doubling when self-service takes off?"
related:
  - "articles:data-warehousing/star-schema"
  - "articles:data-warehousing/data-warehousing-fundamentals"
  - "articles:snowflake/architecture-virtual-warehouses"
  - "articles:etl-elt/etl-vs-elt"
  - "system-designs:cloud-data-warehouse-platform"
  - "interview-questions:data-engineering/data-quality-checks"
previous: "system-designs:event-driven-architecture"
next: "system-designs:customer-360-platform"
versionContext: "Design discussion; no code examples. Pricing statements describe pricing models, not current prices."
sources:
  - { label: "Snowflake documentation: virtual warehouses", url: "https://docs.snowflake.com/en/user-guide/warehouses" }
  - { label: "Snowflake documentation: dynamic tables target lag", url: "https://docs.snowflake.com/en/user-guide/dynamic-tables/target-lag" }
  - { label: "dbt Labs: open-source MetricFlow announcement", url: "https://www.getdbt.com/blog/open-source-metricflow-governed-metrics" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "Kimball Group: dimensional modelling techniques", url: "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/" }
---

## Approach

The technology for BI is mature; what fails in practice is **trust** (different numbers for the same metric), **performance** at peak and **cost** as self-service grows. Lead with those. Clarify:

- **Who are the users and what do they do?** Executives reading certified dashboards, analysts writing SQL, operations teams watching near-real-time numbers?
- **Which metrics matter most, and who owns their definitions?** Revenue, gross margin, active customers.
- **Freshness**: daily for finance, 15 minutes for operations?
- **Security**: regional managers see only their region, HR data restricted, personal data masked?
- **Existing tools**: a BI tool the company has licensed, a cloud provider already chosen?
- **Budget model**: predictable monthly spend or pay-per-query?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion</strong>: managed connectors for SaaS sources, CDC for core databases, event streams via a sink; all land in raw schemas unchanged.</li>
<li><strong>Warehouse</strong>: separate compute for loading, transformation and BI; storage shared.</li>
<li><strong>Transformation (dbt)</strong>: staging models clean each source, intermediate models apply business logic, marts expose facts and conformed dimensions; tests and contracts gate every run.</li>
<li><strong>Semantic layer</strong>: metrics, dimensions and join paths defined once in code, version controlled and reviewed.</li>
<li><strong>Serving</strong>: BI tools query through the semantic layer; heavy dashboards hit aggregate tables or the BI cache; analysts query marts directly.</li>
<li><strong>Governance</strong>: catalog with lineage and certification badges, row and column policies in the warehouse, freshness and cost dashboards.</li>
</ol>
<figcaption>Raw data is transformed once into marts, metrics are defined once in the semantic layer, and every tool reads through it.</figcaption>
</figure>

Orders arrive by CDC every few minutes and SaaS data hourly. At 05:00 the nightly dbt build runs staging, intermediate and mart models, then tests. If a blocking test fails, the mart is not replaced and the previous day's data stays visible with a warning. When the build succeeds, aggregate tables refresh and BI caches are warmed for the executive dashboards. During the day a smaller dbt job (or Snowflake dynamic tables with a 15-minute target lag) keeps operational marts fresh. A regional manager opening the sales dashboard sees only their region, because the warehouse applies a row access policy using their identity passed from the BI tool.

## Choosing the warehouse

| | Snowflake | Google BigQuery | Amazon Redshift |
|---|---|---|---|
| Compute model | Virtual warehouses, per-second billing with a 60-second minimum per resume; multi-cluster for concurrency | Serverless; on-demand per TiB scanned, or capacity (slot) pricing with editions and autoscaling | Provisioned RA3 clusters or Redshift Serverless (capacity in RPUs) |
| Workload isolation | Separate warehouses per workload | Reservations and assignments | Workload management queues, separate clusters or workgroups |
| Strengths | Simple isolation, strong data sharing, little tuning | No infrastructure, good for spiky or very large scans, GCP integration | AWS integration, predictable cost for steady workloads |
| Watch out for | Idle warehouses (the default auto-suspend is long), many small warehouses | Unbounded on-demand scans; needs partitioning and quotas | More tuning (sort and distribution keys on provisioned clusters) |

All three work. Choose by the company's cloud, the shape of the workload and the team's operations capacity. For a company on AWS with spiky BI and a small platform team, Snowflake or Redshift Serverless; on GCP, BigQuery.

## Data modelling

- **Layers in dbt**: `staging` (one model per source table, rename and cast only), `intermediate` (business logic, deduplication, joins), `marts` (facts and dimensions per subject area).
- **Star schemas**: `fct_order_lines` at order-line grain, `fct_payments`, `fct_sessions`; conformed `dim_customer`, `dim_product`, `dim_date`, `dim_region` shared across marts so "by region" means the same everywhere.
- **Declare the grain** of every fact table in its documentation and test it with a uniqueness test on the grain columns.
- **Slowly changing dimensions**: Type 2 for attributes where history matters (customer segment, sales territory), so last year's revenue stays attributed to last year's territory.
- **Model contracts** on marts used by the semantic layer: column names and types are enforced at build time, so a refactor cannot silently break dashboards.

## Semantic layer and metric definitions

The usual cause of "two revenue numbers" is that each dashboard computes revenue itself: one subtracts refunds and one does not, one uses order date and the other payment date. The fix is to **define metrics once in code**:

- A metric has an owner, a description, a formula, allowed dimensions, a time grain and a default time dimension (for example `net_revenue = sum(order_line_amount) - sum(refund_amount)` by `order_date`).
- Definitions live in Git and change through review, with a check that compares the new definition with the old one on historical data.
- BI tools query metrics through the layer (dbt Semantic Layer with MetricFlow, Cube, or LookML in Looker), so the SQL is generated consistently.
- Certified dashboards may only use semantic-layer metrics; exploratory content is labelled as such.

MetricFlow, which powers the dbt Semantic Layer, was released under the Apache 2.0 licence in October 2025, which reduces lock-in for this layer.

To resolve an existing disagreement, trace both numbers to their SQL, list every difference (filters, dates, currency, refunds, test accounts), agree the definition with the business owner, implement it once, and retire the other version.

## Dashboard performance

When an executive dashboard is slow on Monday morning:

1. **Read the query profile**: is every tile scanning the 3-billion-row fact? Are queries queueing because the BI warehouse is saturated?
2. **Pre-aggregate**: daily revenue by region and product category is a few million rows, not billions. Build aggregate tables in dbt or let the BI tool or semantic layer route to them.
3. **Cluster and prune**: cluster large facts by date (and a common filter), and make sure dashboard filters reach the warehouse as predicates.
4. **Cache**: warm the BI cache after the nightly build; the warehouse result cache also serves identical queries.
5. **Scale out for concurrency**: a multi-cluster warehouse (or more slots) for the peak hour, scaled back afterwards.
6. **Fix the dashboard**: thirty tiles each issuing a query is a design problem; consolidate.

## Freshness and trust

- Show **"data as of"** on every dashboard, driven by a freshness table the pipeline updates, not by the clock.
- Show a **certified** badge for content built on semantic-layer metrics and owned by a named team.
- If a blocking test fails, keep yesterday's data visible with a banner instead of showing partial numbers.
- Publish known data incidents where users will see them.

## Data quality

- Source freshness and volume checks at ingestion.
- dbt tests on keys (unique, not null), relationships between facts and dimensions, accepted values, and custom tests such as "order totals equal the sum of their lines".
- Reconciliation of key metrics against the system of record (revenue against the finance ledger) within a tolerance.
- Anomaly alerts on metric values (revenue down 40% day on day) sent to the metric owner.

## Security and access

- Role-based access by group, granted on mart schemas, never on raw.
- **Row access policies** for region or business unit and **masking policies** for personal and salary columns, defined once in the warehouse.
- BI tools connect with per-user identity (OAuth, or user attributes passed to the warehouse) so policies apply to the real viewer.
- Review scheduled exports: exporting personal data to email or spreadsheets is the most common leak.

## Cost

- Separate warehouses (or reservations) for loading, transformation, BI and ad-hoc analysis, each sized and auto-suspended appropriately, so cost is attributable.
- Auto-suspend BI warehouses after a short idle period. With per-second billing and a 60-second minimum, very short timeouts mainly help spiky loads.
- Resource monitors or budgets with alerts per team.
- Incremental dbt models for large facts instead of nightly full rebuilds.
- Aggregate tables and caching, which reduce both latency and spend.
- In BigQuery, require partition filters on large tables and set query quotas per user or project.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Source connector fails overnight | Missing data in marts | Freshness check blocks publish or flags the dashboard; rerun connector and incremental models |
| Blocking dbt test fails | Mart not updated | Yesterday's data remains with a banner; owner fixes and reruns |
| Metric definition change is wrong | Certified numbers shift | Change reviewed with historical comparison; revert in Git |
| Warehouse saturated at peak | Slow dashboards | Multi-cluster scale-out; aggregates; query timeouts for ad-hoc work |
| Policy misconfiguration | Users see data they should not | Policies tested in CI with test users; audit access logs |

## Scaling to 10×

With 10,000 users and ten times the data, aggregate tables and semantic-layer caching become essential; concurrency is solved with scale-out compute rather than bigger warehouses; incremental and microbatch models replace full rebuilds; domain teams own their marts under shared conventions, and certification becomes a formal process. Cost governance (budgets per domain) must be in place before self-service grows, not after.

## Monitoring and SLAs

- Pipeline completion time against the 07:00 SLA, and freshness per mart.
- Test results per model, with trends.
- Dashboard load time p95 and warehouse queueing at peak.
- Warehouse credits or slot usage by workload and team.
- Usage of dashboards and metrics, to retire unused content.

## Capacity estimate

- **Data growth**: 200 GB/day raw ≈ 73 TB/year raw; marts in compressed columnar storage are typically several times smaller.
- **Largest fact**: 3 billion rows × about 100 bytes per row compressed (assumption) ≈ 300 GB. A full scan per dashboard tile is expensive. A daily aggregate by region, category and channel is at most 5 years × 365 days × 20 regions × 50 categories × 5 channels ≈ 9 million rows, small enough to answer in well under a second.
- **Peak concurrency**: 150 concurrent users × about one query every 10 seconds while navigating ≈ 15 queries/s. If one warehouse cluster runs about 8 queries at once at 1–2 s each, it serves roughly 4–8 queries/s, so 2–4 clusters are needed at peak; multi-cluster auto-scaling handles that and drops back to one cluster off-peak.
- **Nightly build**: measure the dbt build duration, then set the start time to leave at least a one-hour buffer (for a rerun) before 07:00.

## What a strong answer includes

- **Trust first**: a semantic layer with owned, version-controlled metric definitions, and certification.
- **Dimensional modelling** with declared grain and conformed dimensions.
- A reasoned **warehouse choice** with workload isolation.
- **Performance tactics** in order: aggregates, clustering, caching, scale-out.
- **Freshness and quality** visible to users, with blocking tests that keep good data in place.
- **Security** enforced once in the warehouse with the real user's identity.
- **Cost controls** and attribution designed in.

## Common mistakes

- Answering "use Snowflake and Tableau" without addressing why numbers disagree.
- Letting each dashboard define its own metrics.
- One shared warehouse for loading, transformation and BI, so the nightly build slows dashboards.
- Scaling up to a bigger warehouse for a concurrency problem that needs scale-out.
- Publishing partially loaded data instead of keeping the last good version.
- Row-level security implemented by duplicating dashboards per region.
- No usage tracking, so hundreds of stale dashboards accumulate.

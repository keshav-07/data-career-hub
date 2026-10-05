---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Cloud Data Warehouse Platform"
seoTitle: "Design a Cloud Data Warehouse Platform"
description: "A system-design case study for a cloud warehouse: ELT ingestion, layered modelling, workload isolation, access control, data quality and keeping compute cost predictable."
inventoryId: "SYS-05"
technology: ["data-engineering", "snowflake", "data-warehousing"]
topic: ["warehouse", "architecture"]
difficulty: "Intermediate"
problem: "Design a cloud data warehouse that consolidates data from SaaS tools and operational databases so a mid-sized company can run trusted reporting and self-service analytics."
functionalRequirements: ["Load data from about 30 sources daily, some hourly", "Model data into staging, intermediate and mart layers", "Provide governed self-service access for analysts", "Publish certified dashboards from mart tables"]
nonFunctionalRequirements: ["Daily marts ready by 07:00", "Analyst queries never slowed by loading jobs", "Personal data visible only to authorised roles", "Predictable monthly compute spend"]
scaleAssumptions: ["About 5 TB total, growing 1 TB a year", "Around 150 analysts and 20 engineers", "Peaks of 50 concurrent queries during business hours"]
architectureSummary: "Managed connectors and CDC load raw schemas; SQL transformations (for example dbt) build staging and marts; separate warehouses isolate loading, transformation and BI; role-based access controls data."
technologies: ["Cloud data warehouse (for example Snowflake)", "Managed ingestion connectors or CDC", "dbt or SQL-based transformation", "Orchestrator", "BI tool"]
tradeoffs: [{"decision": "ELT with SQL models", "alternative": "ETL in a separate processing engine", "reason": "Warehouse compute scales; analysts can read and review SQL", "consequence": "Raw data stored in the warehouse needs access control"}, {"decision": "Separate warehouses per workload", "alternative": "One shared warehouse", "reason": "Loads never slow dashboards; cost attributable", "consequence": "More objects to manage"}, {"decision": "Incremental models for large facts", "alternative": "Full rebuilds", "reason": "Lower cost and faster runs", "consequence": "More complex logic for late or corrected data"}, {"decision": "Certified marts for dashboards", "alternative": "Dashboards on any table", "reason": "Consistent metric definitions", "consequence": "Needs ownership and review process"}]
interviewFollowUps: ["How would you stop costs growing unexpectedly?", "How do you handle a source that changes its schema?", "How would you give analysts a sandbox without risking production?", "How do you define a metric once and reuse it everywhere?"]
related: ["articles:snowflake/architecture-virtual-warehouses", "articles:etl-elt/etl-vs-elt", "articles:data-warehousing/star-schema"]
previous: "system-designs:scalable-lakehouse"
next: "system-designs:clickstream-data-platform"
---

## Approach

This is mostly an **organisational design**: layering, ownership, access and cost, on top of a managed warehouse that handles storage and scaling.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingest</strong>: connectors and CDC load each source into its own raw schema.</li>
<li><strong>Staging</strong>: one model per source table, renaming, typing and deduplicating.</li>
<li><strong>Intermediate</strong>: joins and business logic shared across marts.</li>
<li><strong>Marts</strong>: star schemas per domain (sales, finance, product), with certified metrics.</li>
<li><strong>Consume</strong>: BI dashboards and analyst SQL through role-based access.</li>
</ol>
<figcaption>Data moves left to right through SQL models; each layer has an owner and tests.</figcaption>
</figure>

## Workload isolation

Separate warehouses for loading, transformation, BI and ad-hoc analysis, each with its own size, auto-suspend and budget.

## Transformation

Version-controlled SQL models with dependency management, incremental models for large facts, and tests on keys, nulls and relationships.

## Access control

Roles per function (engineer, analyst, finance), grants on schemas, masking policies on personal data, and separate development databases or zero-copy clones for safe experimentation.

## Data quality

Tests run in the same job as the models; failures stop downstream models and certified dashboards from refreshing.

## Observability

Freshness per source, model run times, test failures, query queueing and credit usage per warehouse.

## Cost

Auto-suspend everywhere, resource monitors with alerts, incremental processing, and regular review of the most expensive queries.

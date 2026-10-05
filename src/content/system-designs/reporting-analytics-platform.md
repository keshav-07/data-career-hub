---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Reporting and Analytics Platform"
seoTitle: "Design a Reporting and Analytics Platform"
description: "A system-design case study for reporting: a semantic layer of certified metrics, star-schema marts, refresh scheduling, performance for dashboards and trust in numbers."
inventoryId: "SYS-08"
technology: ["data-engineering", "data-warehousing"]
topic: ["reporting", "bi", "architecture"]
difficulty: "Intermediate"
problem: "Design the reporting layer for a company where executives, finance and operations all need dashboards, and different teams currently report different numbers for the same metric."
functionalRequirements: ["Define each business metric once and reuse it everywhere", "Daily executive dashboards and hourly operational dashboards", "Drill down from totals to underlying records", "Scheduled exports for finance"]
nonFunctionalRequirements: ["Dashboards load in under 3 seconds", "Every published number traceable to source tables", "Clear freshness indicators on every dashboard", "Row-level security for regional managers"]
scaleAssumptions: ["About 300 dashboard users", "Around 40 certified metrics", "Largest fact table roughly 2 billion rows"]
architectureSummary: "Curated star-schema marts in the warehouse feed a semantic layer that defines certified metrics; dashboards query the semantic layer, with aggregates or extracts for the heaviest views."
technologies: ["Data warehouse or lakehouse SQL", "Transformation framework (for example dbt)", "Semantic or metrics layer", "BI tool"]
tradeoffs: [{"decision": "Central semantic layer for metrics", "alternative": "Metric logic inside each dashboard", "reason": "One definition of revenue, active user and so on", "consequence": "Changes go through review; less ad-hoc freedom"}, {"decision": "Pre-aggregated tables for heavy dashboards", "alternative": "Query detailed facts live", "reason": "Fast load times and lower warehouse cost", "consequence": "Aggregates must be refreshed and kept consistent"}, {"decision": "Certified vs exploratory content", "alternative": "All dashboards equal", "reason": "Users know which numbers are trusted", "consequence": "Needs ownership and a certification process"}, {"decision": "Row-level security in the warehouse/semantic layer", "alternative": "Separate dashboards per region", "reason": "One dashboard, correct data per user", "consequence": "Security rules must be tested"}]
interviewFollowUps: ["Two teams report different revenue numbers. How do you resolve it?", "How would you make a slow dashboard fast?", "How do you show users how fresh a number is?", "How do you test a metric definition?"]
related: ["articles:data-warehousing/star-schema", "system-designs:cloud-data-warehouse-platform", "interview-questions:data-engineering/data-quality-checks"]
previous: "system-designs:kafka-ingestion-system"
---

## Approach

Reporting problems are usually **trust problems**: inconsistent definitions, stale data and slow dashboards. Design for one definition per metric and visible freshness.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Marts</strong>: star schemas with clear grain for each business process.</li>
<li><strong>Semantic layer</strong>: certified metrics and dimensions defined once, in version control.</li>
<li><strong>Aggregates</strong>: pre-computed rollups for the heaviest dashboards.</li>
<li><strong>BI tool</strong> queries the semantic layer, with row-level security applied.</li>
<li><strong>Exports</strong>: scheduled extracts for finance from the same certified metrics.</li>
</ol>
<figcaption>Every dashboard number comes from a certified metric over a documented mart.</figcaption>
</figure>

## Metric definitions

Each metric has an owner, a precise definition (filters, grain, time zone, treatment of refunds), tests and documentation. Changes are reviewed like code.

## Freshness and lineage

Show the last successful refresh on every dashboard. Lineage from dashboard to metric to mart to source makes discrepancies explainable.

## Performance

Model at the right grain, pre-aggregate heavy views, use partition pruning, and cache where the BI tool supports it. Measure dashboard load times.

## Data quality

Reconcile key totals (revenue, orders) with source systems daily; failed reconciliation blocks certified dashboards from refreshing and alerts owners.

## Security

Row-level security for regional views, masked personal data, and audited access to finance exports.

## Cost

Aggregates and caching reduce repeated scans; schedule refreshes to match how often numbers are actually used.

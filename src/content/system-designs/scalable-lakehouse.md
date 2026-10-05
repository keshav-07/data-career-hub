---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Scalable Data Lake / Lakehouse"
seoTitle: "Design a Scalable Data Lakehouse"
description: "A system-design case study for a lakehouse: storage layers, open table formats, ingestion patterns, governance, compaction and serving BI and ML from one copy of data."
inventoryId: "SYS-04"
technology: ["data-engineering", "delta-lake", "spark"]
topic: ["lakehouse", "architecture"]
difficulty: "Advanced"
problem: "Design a company-wide analytics platform where many teams ingest data, analysts query curated tables with SQL, and data scientists train models, all on one governed copy of the data."
functionalRequirements: ["Ingest batch files, database changes and event streams", "Organise data into raw, cleaned and business-level layers", "Serve SQL analytics and machine-learning workloads from the same tables", "Discover datasets and their owners"]
nonFunctionalRequirements: ["ACID writes and consistent reads on shared tables", "Fine-grained access control including column masking", "Scale to petabytes without re-architecture", "Reprocess any table from raw data"]
scaleAssumptions: ["Around 500 TB today growing roughly 50% a year", "Thousands of tables across dozens of teams", "Hundreds of concurrent SQL users at peak"]
architectureSummary: "Object storage holds all data in an open table format organised in bronze, silver and gold layers; Spark and SQL engines process and serve it; a central catalog provides governance and lineage."
technologies: ["Object storage", "Delta Lake or Apache Iceberg", "Spark", "SQL engine / warehouse endpoint", "Central catalog with access control and lineage"]
tradeoffs: [{"decision": "Open table format on object storage", "alternative": "Copy all data into a proprietary warehouse", "reason": "One copy serves SQL and ML; multiple engines; less lock-in", "consequence": "More components to operate and tune"}, {"decision": "Bronze/silver/gold layers", "alternative": "Single layer of tables", "reason": "Clear contracts, reprocessing from raw, isolation of messy data", "consequence": "More storage and more pipelines"}, {"decision": "Domain ownership of gold tables", "alternative": "Central team builds everything", "reason": "Scales with the organisation; owners know the data", "consequence": "Needs shared standards and a catalog to stay coherent"}, {"decision": "Scheduled compaction and clustering", "alternative": "Leave files as written", "reason": "Keeps reads fast as small files accumulate", "consequence": "Maintenance compute cost"}]
interviewFollowUps: ["How do you prevent the lake becoming a data swamp?", "How would you handle a GDPR deletion request across layers?", "How do two engines safely write to the same table?", "How do you decide what goes into gold?"]
related: ["articles:data-warehousing/lake-vs-warehouse-vs-lakehouse", "articles:delta-lake/transactions-schema-evolution", "articles:databricks/unity-catalog-governance"]
previous: "system-designs:real-time-analytics-pipeline"
next: "system-designs:cloud-data-warehouse-platform"
---

## Approach

The hard parts are not storage capacity but **reliability on shared tables, governance across many teams, and keeping performance as data and files grow.**

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion</strong>: batch file loads, CDC from databases and streaming events land in bronze tables.</li>
<li><strong>Bronze</strong>: raw data in a table format, append-only, with ingestion metadata.</li>
<li><strong>Silver</strong>: typed, deduplicated, conformed tables with quality checks.</li>
<li><strong>Gold</strong>: business models and aggregates owned by domain teams.</li>
<li><strong>Serving</strong>: SQL endpoints for BI, direct table reads for ML, all through the catalog.</li>
</ol>
<figcaption>Every layer is a set of transactional tables on the same object storage, governed by one catalog.</figcaption>
</figure>

## Storage and table format

An open table format provides atomic commits, schema enforcement and time travel. Partition large tables by date and cluster by common filters; schedule compaction.

## Processing

Spark handles heavy transformations and streaming; SQL engines handle interactive queries. Each pipeline writes idempotently (merge or partition overwrite).

## Governance

A central catalog holds every table with its owner, description and lineage. Access is granted to groups; sensitive columns are masked; production writes come only from service principals.

## Data quality

Silver and gold tables have contracts (schema, keys, freshness) enforced by checks that block publishing. Quality results are visible in the catalog.

## Deletion and retention

Deletion requests must reach every layer: delete or redact in bronze and propagate through rebuilds, then remove old file versions after the retention window.

## Observability

Freshness and volume per table, pipeline failures, small-file counts and query performance.

## Cost

Separate compute per workload, autoscaling, lifecycle rules for raw data, and chargeback per team via tags.

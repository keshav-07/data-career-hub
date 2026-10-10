---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Which Databricks compute should you use for each workload?"
seoTitle: "Databricks Compute Types: Interview Answer"
description: "Databricks compute interview answer: when to use all-purpose clusters, jobs compute, serverless or SQL warehouses, plus access modes, Photon and cost trade-offs."
technology: ["databricks", "spark"]
topic: ["compute", "cost", "platform"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "Use all-purpose compute only for interactive development, because it is billed at a higher rate and stays up between runs. Run scheduled pipelines on jobs compute, which is created for the run and terminated afterwards, or on serverless jobs compute, which starts in seconds and needs no cluster tuning. Serve BI and ad hoc SQL from a SQL warehouse, preferably serverless, which adds Photon, caching and concurrency scaling. Use standard access mode for Unity Catalog unless a workload needs dedicated mode."
followUps: ["Why does code that uses sparkContext fail on serverless compute?", "What does Photon speed up, and what does it not?", "How would you stop a team's forgotten clusters from running up cost?", "When would you still choose classic jobs compute over serverless?"]
related: ["articles:databricks/workspace-jobs-lakehouse", "articles:databricks/databricks-for-data-engineers", "articles:spark/apache-spark-architecture"]
sources:
  - {"label": "Databricks documentation: Compute", "url": "https://docs.databricks.com/aws/en/compute/"}
  - {"label": "Databricks documentation: Access modes", "url": "https://docs.databricks.com/aws/en/compute/access-mode-limitations"}
  - {"label": "Databricks documentation: SQL warehouse types", "url": "https://docs.databricks.com/aws/en/compute/sql-warehouse/warehouse-types"}
versionContext: "Describes Databricks compute as documented in October 2026 (standard and dedicated access modes were previously called shared and single user). Not executed: needs a Databricks workspace."
---

## Detailed explanation

| Workload | Compute | Why |
|----------|---------|-----|
| Exploring data, developing a notebook | All-purpose cluster (or serverless notebook compute) with auto-termination | Interactive, shared by a few people; stop it when idle |
| Scheduled ETL job | Jobs compute or serverless jobs compute | Lower rate than all-purpose, exists only for the run, isolated from other users |
| Declarative pipeline | Serverless pipeline compute, or classic pipeline compute | Managed by the pipeline, with autoscaling for streaming |
| BI dashboards, analysts' SQL, dbt models | SQL warehouse (serverless, pro or classic) | SQL-only engine with Photon, result caching and scaling for many concurrent queries |

Three settings matter beyond the type:

- **Access mode.** Unity Catalog works with **standard** (multi-user with isolation; recommended default) and **dedicated** (one user or group; supports RDD APIs, some ML runtimes and other features standard mode restricts). Legacy no-isolation clusters cannot read Unity Catalog data.
- **Runtime version.** Pin a long-term support (LTS) Databricks Runtime for production jobs so upgrades are deliberate.
- **Photon.** A vectorised native engine for SQL and DataFrame operators. It is part of SQL warehouses and serverless compute and optional on classic clusters at a higher DBU rate. It helps scan-, join- and aggregation-heavy work; Python UDFs and RDD code do not benefit.

## Example

A team runs a nightly ETL on a shared all-purpose cluster that also serves notebooks, and a dashboard queries the same cluster. A good redesign:

1. Move the ETL into a Lakeflow Job with tasks on serverless jobs compute (or a jobs cluster sized for the job), running as a service principal.
2. Point the dashboard at a serverless SQL warehouse with auto-stop.
3. Keep a small all-purpose cluster with a 30-minute auto-termination and a cluster policy that caps size, for development only.

Each workload now has its own compute, so a notebook user restarting a cluster cannot kill the nightly run, and BI concurrency does not compete with ETL.

## Trade-offs and pitfalls

- **Serverless is not free of constraints.** It runs on Spark Connect, so `spark.sparkContext`, RDDs and some JVM-level settings are unavailable; you also cannot pick instance types. Code that needs those, or a specific library setup, may still need classic jobs compute.
- **Start-up time.** Classic clusters take minutes to provision VMs in your cloud account. Many short tasks each on its own new cluster waste time; share one jobs cluster across a job's tasks or use serverless.
- **Cost is DBUs plus (for classic) cloud VMs.** Compare total cost per run, not only the DBU rate; serverless includes the infrastructure.
- **Governance of cost.** Cluster policies (size limits, mandatory auto-termination, tags) and budgets are how platform teams stop runaway spend.

## Common mistakes

1. Running production jobs on all-purpose clusters "because it was already running".
2. Using an all-purpose cluster as a BI endpoint instead of a SQL warehouse.
3. Choosing dedicated access mode by default and losing fine-grained access features, or choosing a legacy mode that cannot read Unity Catalog.
4. No auto-termination on interactive clusters.

---
title: "Databricks for Data Engineers"
shortName: "Databricks"
description: "Databricks is a lakehouse platform built around Apache Spark and Delta Lake. Learn its workspace, compute, jobs and Unity Catalog governance model."
group: platforms
order: 10
keyFacts: ["Runs Spark workloads on managed compute","Stores tables in Delta Lake format","Unity Catalog governs data with a catalog.schema.table namespace"]
whatToLearnFirst: ["articles:databricks/workspace-jobs-lakehouse","articles:databricks/unity-catalog-governance"]
relatedTechnologies: ["spark","pyspark","delta-lake"]
cheatSheet: "cheat-sheets:databricks"
monogram: "Db"
lessons: ["articles:databricks/databricks-for-data-engineers", "articles:databricks/workspace-jobs-lakehouse", "articles:databricks/unity-catalog-governance"]
updatedDate: 2026-10-05
---

Databricks packages Spark, Delta Lake, notebooks, job orchestration and governance into one managed platform. For a data engineer, most of the work is ordinary Spark and SQL; what Databricks adds is managed compute, a job scheduler, a medallion-style lakehouse on Delta tables, and Unity Catalog for permissions and lineage.

Learn the workspace and how jobs run on compute first, then Unity Catalog. Databricks renames and regroups products often, so check current documentation for exact product names.

---
title: "Snowflake for Data Engineers"
shortName: "Snowflake"
description: "Snowflake is a cloud data warehouse that separates storage from compute. Learn virtual warehouses, micro-partitions, pruning, caching and cost control."
group: platforms
order: 11
keyFacts: ["Storage, compute and services layers scale independently","Virtual warehouses are independent compute clusters billed while running","Micro-partition metadata enables pruning"]
whatToLearnFirst: ["articles:snowflake/architecture-virtual-warehouses","articles:snowflake/micro-partitions-clustering-pruning"]
relatedTechnologies: ["sql","data-warehousing","etl-elt"]
cheatSheet: "cheat-sheets:snowflake"
monogram: "Sf"
lessons: ["articles:snowflake/snowflake-for-data-engineers", "articles:snowflake/architecture-virtual-warehouses", "articles:snowflake/virtual-warehouses-scaling", "articles:snowflake/micro-partitions-clustering-pruning", "articles:snowflake/streams-and-tasks", "articles:snowflake/loading-copy-snowpipe", "articles:snowflake/time-travel-fail-safe-cloning", "articles:snowflake/table-types-semi-structured", "articles:snowflake/snowflake-vs-databricks"]
updatedDate: 2026-10-05
---

Snowflake is a managed cloud data warehouse. Data is stored once in compressed columnar micro-partitions, and any number of independent compute clusters, called virtual warehouses, can query it. Most performance and cost questions come down to two things: how much data a query can skip, and how warehouses are sized and suspended.

Learn the three-layer architecture and virtual warehouses first, then micro-partitions, pruning and clustering.

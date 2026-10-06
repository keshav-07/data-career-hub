---
title: "Data Modeling and Warehousing"
shortName: "Data modeling"
description: "Data modeling and warehousing: star schemas and grain, fact and dimension design, SCDs, Data Vault and other methods, dbt, semantic layers and incremental models."
group: platforms
order: 8
keyFacts: ["Declare the grain before choosing dimensions or facts","Know each measure's additivity: balances are not summed over time","Type 2 dimensions keep history with surrogate keys and half-open validity ranges","Kimball, Inmon, Data Vault and medallion solve different problems and are often combined","Incremental models must be idempotent: merge on the grain with a lookback window"]
whatToLearnFirst: ["articles:data-warehousing/star-schema"]
relatedTechnologies: ["sql","etl-elt","delta-lake"]
monogram: "DW"
lessons: ["articles:data-warehousing/data-warehousing-fundamentals", "articles:data-warehousing/star-schema", "articles:data-warehousing/normalization-denormalization", "articles:data-warehousing/fact-tables", "articles:data-warehousing/dimension-tables", "articles:data-warehousing/bridge-tables-hierarchies", "articles:data-warehousing/slowly-changing-dimensions", "articles:data-warehousing/modeling-methodologies", "articles:data-warehousing/modern-modeling-practice", "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse", "articles:data-warehousing/partitioning-clustering-data-layout"]
updatedDate: 2026-10-05
---

A warehouse is organised for questions, not for transactions. Data modelling decides how it answers them: measurements (facts) at a declared grain, descriptive context (dimensions) with keys that keep history, and definitions that stay consistent across teams.

Start with the star schema and the grain, then fact and dimension design, slowly changing dimensions and the harder patterns (bridges, hierarchies, late data). Finish with the methodologies (Kimball, Inmon, Data Vault, Anchor, medallion, Activity Schema) and modern practice with dbt, semantic layers and incremental models. Every lesson uses the same fictional online shop, Kestrel Market, with SQL verified on PostgreSQL.

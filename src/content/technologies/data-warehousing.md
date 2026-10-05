---
title: "Data Warehousing for Data Engineers"
shortName: "Data warehousing"
description: "Data warehousing is about modelling data for analysis: facts, dimensions, star schemas and slowly changing dimensions."
group: platforms
order: 8
keyFacts: ["Star schemas separate facts from dimensions","Grain decides what a fact row means","Slowly changing dimensions preserve history"]
whatToLearnFirst: ["articles:data-warehousing/star-schema"]
relatedTechnologies: ["sql","etl-elt","delta-lake"]
monogram: "DW"
lessons: ["articles:data-warehousing/data-warehousing-fundamentals", "articles:data-warehousing/star-schema", "articles:data-warehousing/slowly-changing-dimensions", "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse", "articles:data-warehousing/partitioning-clustering-data-layout"]
updatedDate: 2026-10-04
---

A warehouse is organised for questions, not for transactions. Dimensional modelling keeps measurements (facts) separate from descriptive context (dimensions) so queries stay simple and fast.

Start with fact and dimension tables and the star schema. Decide the grain of every fact table before you build it.

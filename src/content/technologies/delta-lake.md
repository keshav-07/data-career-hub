---
title: "Delta Lake and the Lakehouse"
shortName: "Delta Lake"
description: "Delta Lake adds ACID transactions, schema enforcement and time travel to files in a data lake, which is the foundation of the lakehouse pattern."
group: platforms
order: 7
keyFacts: ["Transaction log gives ACID guarantees on object storage","Schema enforcement and controlled schema evolution","MERGE applies upserts, deletes and SCD Type 2 in one commit","Time travel and RESTORE last only as long as VACUUM retention allows","Liquid clustering replaces partitioning and Z-order on new tables"]
whatToLearnFirst: ["articles:delta-lake/transactions-schema-evolution"]
relatedTechnologies: ["spark","pyspark","data-warehousing"]
monogram: "DL"
lessons: ["articles:delta-lake/data-lakes-lakehouse-delta", "articles:delta-lake/json-vs-parquet", "articles:delta-lake/parquet-vs-avro-vs-orc", "articles:delta-lake/transactions-schema-evolution", "articles:delta-lake/delta-vs-traditional-lake-tables", "articles:delta-lake/merge-upserts-change-data-feed", "articles:delta-lake/optimize-zorder-vacuum-liquid-clustering", "articles:delta-lake/schema-evolution-patterns"]
updatedDate: 2026-10-09
---

Delta Lake is an open table format that stores data as Parquet files plus a transaction log. That log turns a folder of files into a table with atomic commits, consistent reads and a history you can query.

Start with file formats (why Parquet, and what is inside it), then the transaction log and its guarantees, `MERGE` and the change data feed, and finally table maintenance: compaction, clustering, deletion vectors and `VACUUM`. Every example runs locally with PySpark 4.2 and delta-spark 4.4.

---
title: "Delta Lake and the Lakehouse"
shortName: "Delta Lake"
description: "Delta Lake adds ACID transactions, schema enforcement and time travel to files in a data lake, which is the foundation of the lakehouse pattern."
group: platforms
order: 7
keyFacts: ["Transaction log gives ACID guarantees on object storage","Schema enforcement and controlled schema evolution","Time travel supports audit and rollback"]
whatToLearnFirst: ["articles:delta-lake/transactions-schema-evolution"]
relatedTechnologies: ["spark","pyspark","data-warehousing"]
updatedDate: 2026-10-04
---

Delta Lake is an open table format that stores data as Parquet files plus a transaction log. That log turns a folder of files into a table with atomic commits, consistent reads and a history you can query.

Learn what the transaction log provides first, then schema enforcement and evolution, then maintenance such as compaction.

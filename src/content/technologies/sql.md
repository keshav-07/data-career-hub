---
title: "SQL for Data Engineers"
shortName: "SQL"
description: "SQL is the core language of data work: querying, transforming and modelling data in warehouses, lakehouses and Spark. Start here before any other tool."
group: languages
order: 1
keyFacts: ["Used in every warehouse, lakehouse and Spark SQL","Joins and window functions appear in most interviews","Query plans matter more as data grows"]
whatToLearnFirst: ["articles:sql/sql-fundamentals","articles:sql/joins","articles:sql/window-functions"]
relatedTechnologies: ["python","pyspark","data-warehousing"]
cheatSheet: "cheat-sheets:sql-data-engineering"
monogram: "SQL"
lessons: ["articles:sql/sql-fundamentals", "articles:sql/operators-nulls-case", "articles:sql/functions-strings-dates-types", "articles:sql/aggregations-group-by-having", "articles:sql/set-operations", "articles:sql/joins", "articles:sql/semi-anti-lateral-joins", "articles:sql/ctes-subqueries-temp-tables", "articles:sql/pivot-unpivot-grouping-sets", "articles:sql/window-functions", "articles:sql/window-frames-running-totals", "articles:sql/dates-calendars-time-series", "articles:sql/top-n-deduplication-scd-queries"]
updatedDate: 2026-10-05
---

SQL is where most Data Engineering work starts and ends. You use it to explore data, build transformations in a warehouse, define models and validate pipeline output. The same ideas carry over to Spark SQL, Snowflake, BigQuery and Delta Lake, so time spent here pays off across the whole stack.

Work through the lessons in order: query basics, operators and functions, then aggregation, set operations and joins, then subqueries, reshaping and window functions, and finally the time-series, deduplication and slowly changing dimension patterns that appear in almost every pipeline. After that, learn to read a query plan so you can explain why a query is slow.

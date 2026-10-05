---
title: "ETL vs ELT and Modern Data Pipelines"
shortName: "ETL and ELT"
description: "ETL transforms data before loading it; ELT loads first and transforms inside the warehouse or lakehouse. Learn when each fits."
group: platforms
order: 9
keyFacts: ["ETL transforms before load; ELT transforms after","ELT leans on cheap storage and scalable compute","Constraints such as privacy or format can still favour ETL"]
whatToLearnFirst: ["articles:etl-elt/etl-vs-elt"]
relatedTechnologies: ["data-warehousing","sql","airflow"]
monogram: "ETL"
lessons: ["articles:etl-elt/modern-data-pipelines", "articles:etl-elt/etl-vs-elt", "articles:etl-elt/batch-vs-streaming", "articles:etl-elt/idempotency-in-data-pipelines", "articles:etl-elt/data-quality-checks-contracts", "articles:etl-elt/pipeline-observability", "articles:etl-elt/pipeline-reliability-and-retries", "articles:etl-elt/cdc-patterns-and-failure-modes"]
updatedDate: 2026-10-04
---

ETL and ELT describe where transformation happens. In ETL it happens in a separate processing step before data reaches the target. In ELT raw data is loaded first and transformed inside the warehouse or lakehouse with SQL.

Neither is universally better. The choice depends on data volume, where compute is cheapest, governance needs and team skills.

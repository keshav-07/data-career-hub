---
previous: "projects:s3-pyspark-snowflake-pipeline"
next: "projects:large-scale-batch-processing"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "E-commerce Analytics Data Platform"
description: "An intermediate project: build a layered analytics platform for an online store with staging, a star schema, tested dbt-style SQL models and certified metrics."
inventoryId: "PROJ-03"
technology: ["sql", "data-warehousing", "dbt"]
topic: ["modelling", "elt"]
level: "Intermediate"
problemStatement: "An online store has orders, customers, products and web sessions in separate systems. Build an ELT platform that models them into trusted marts for revenue, retention and product performance."
requirements: ["Load four source datasets into raw tables", "Build staging models that type, rename and deduplicate", "Build a star schema with order-line facts and customer, product and date dimensions", "Define revenue, orders and repeat-customer rate once and reuse them", "Test keys, nulls and relationships on every model"]
technologies: ["SQL warehouse (DuckDB or PostgreSQL locally, or a cloud warehouse)", "dbt Core or plain SQL scripts", "Python for data generation", "A BI tool or notebook for charts"]
dataset: "Generate synthetic orders, customers, products and sessions with a script, or use a public e-commerce sample dataset whose licence permits reuse."
steps: ["Write down the business questions and the grain of each fact table", "Load raw data into a raw schema unchanged", "Create one staging model per source table", "Build dimensions, including a date dimension", "Build fct_order_lines and a daily sales aggregate", "Add tests for uniqueness, not-null, accepted values and relationships", "Define certified metrics in one place and build a small dashboard", "Document lineage and model descriptions"]
testing: ["Tests on every model's primary key", "Reconciliation: total revenue in the mart equals total in raw orders minus cancelled orders", "A rerun of the whole project produces identical results"]
dataQuality: ["Orders reference existing customers and products", "No negative quantities", "Order dates within the expected range"]
monitoring: ["Model run times and test results stored per run", "Freshness of each source"]
costConsiderations: ["Runs free locally with DuckDB or PostgreSQL", "On a cloud warehouse, use the smallest warehouse and incremental models for the largest facts"]
interviewQuestions: ["What is the grain of your fact table?", "How did you define a repeat customer, and why?", "How do you know your revenue number is correct?", "Why did you choose incremental or full rebuilds for each model?"]
resumeBullets: ["Designed and built a layered ELT analytics platform (staging, star-schema marts, certified metrics) for an e-commerce dataset with automated tests on every model", "Implemented reconciliation checks between source and mart revenue and documented lineage for all models"]
extensions: ["Add SCD Type 2 history for customer segments", "Add sessions and a funnel model", "Schedule with an orchestrator and add alerting"]
related: ["articles:data-warehousing/star-schema", "articles:etl-elt/etl-vs-elt", "system-designs:cloud-data-warehouse-platform"]
---

## Business context

Teams at the store disagree about revenue because each pulls numbers differently. A single modelled layer with tested, documented metrics is how real analytics teams resolve that, and it is the core skill set of analytics engineering.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Raw schema holds orders, customers, products and sessions as loaded.</li>
<li>Staging models clean and type one source table each.</li>
<li>Intermediate models join and apply business rules.</li>
<li>Marts: <code>fct_order_lines</code>, <code>dim_customer</code>, <code>dim_product</code>, <code>dim_date</code> and daily aggregates.</li>
<li>Certified metrics feed a dashboard.</li>
</ol>
<figcaption>Layered SQL models from raw to marts, each with tests.</figcaption>
</figure>

Write down metric definitions before writing SQL, for example whether revenue includes tax, shipping and refunds. Most real disagreements are about definitions, not code.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "dbt Cheat Sheet"
description: "A quick dbt reference: models, ref and source, materializations, incremental models, tests, snapshots and the commands and selectors used to run a project."
inventoryId: "CHEAT-09"
technology: ["dbt", "etl-elt"]
topic: ["reference"]
cheatTopic: "dbt"
related: ["articles:etl-elt/etl-vs-elt", "articles:data-warehousing/slowly-changing-dimensions", "interview-questions:data-engineering/data-quality-checks"]
versionContext: "dbt Core 1.x conventions; examples were not executed against a warehouse"
sources: [{"label": "dbt documentation", "url": "https://docs.getdbt.com/docs/introduction"}]
---

## Models

A model is a `SELECT` in a `.sql` file under `models/`. dbt wraps it in the DDL to build a view or table.

```sql
-- models/staging/stg_orders.sql
select
    order_id,
    customer_id,
    cast(amount as numeric(12, 2)) as amount,
    order_date
from {{ source('shop', 'raw_orders') }}
```

```sql
-- models/marts/fct_orders.sql
select o.*, c.segment
from {{ ref('stg_orders') }} o
join {{ ref('stg_customers') }} c using (customer_id)
```

`ref()` builds the dependency graph and resolves the right schema per environment; `source()` points at raw tables declared in YAML.

## Materializations

| Materialization | Builds | Use for |
|-----------------|--------|---------|
| `view` | A view | Light staging models |
| `table` | A full table rebuild | Small to medium marts |
| `incremental` | Inserts/merges only new rows | Large fact tables |
| `ephemeral` | Inlined CTE, nothing built | Reusable logic |

## Incremental model

```sql
{{ config(materialized='incremental', unique_key='order_id') }}

select * from {{ ref('stg_orders') }}
{% if is_incremental() %}
where order_date >= (select max(order_date) from {{ this }})
{% endif %}
```

With `unique_key`, reruns update existing rows instead of duplicating them.

## Tests

```yaml
# models/marts/schema.yml
models:
  - name: fct_orders
    columns:
      - name: order_id
        data_tests: [unique, not_null]
      - name: customer_id
        data_tests:
          - relationships: { to: ref('dim_customers'), field: customer_id }
      - name: status
        data_tests:
          - accepted_values: { values: ['placed', 'shipped', 'returned'] }
```

## Snapshots (SCD Type 2)

Snapshots record changes to mutable source rows over time with validity columns, which gives Type 2 history without hand-written merge logic.

## Commands

```bash
dbt deps                     # install packages
dbt run                      # build models
dbt test                     # run tests
dbt build                    # run + test + seed + snapshot in dependency order
dbt run --select fct_orders+ # a model and everything downstream
dbt run --select +fct_orders # a model and everything upstream
dbt docs generate && dbt docs serve
```

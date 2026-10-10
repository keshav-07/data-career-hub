---
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "dbt Cheat Sheet"
description: "A quick dbt reference: models, ref and source, materializations, incremental models, tests, snapshots and the commands and selectors used to run a project."
inventoryId: "CHEAT-09"
technology: ["dbt", "etl-elt"]
topic: ["reference"]
cheatTopic: "dbt"
related: ["articles:etl-elt/etl-vs-elt", "articles:data-warehousing/slowly-changing-dimensions", "interview-questions:data-engineering/data-quality-checks", "system-designs:elt-pipeline-with-dbt", "projects:ecommerce-analytics-platform"]
versionContext: "dbt Core 1.9+ syntax (microbatch, YAML snapshot configs; unit tests since 1.8), checked against the dbt documentation. Snippets are Jinja templates and were not executed against a warehouse."
sources:
  - { label: "dbt documentation", url: "https://docs.getdbt.com/docs/introduction" }
  - { label: "dbt documentation: incremental models", url: "https://docs.getdbt.com/docs/build/incremental-models" }
  - { label: "dbt documentation: microbatch incremental models", url: "https://docs.getdbt.com/docs/build/incremental-microbatch" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "dbt documentation: snapshots", url: "https://docs.getdbt.com/docs/build/snapshots" }
  - { label: "dbt documentation: node selection syntax", url: "https://docs.getdbt.com/reference/node-selection/syntax" }
---

## Models

A model is a `SELECT` in a `.sql` file under `models/`. dbt wraps it in the DDL to build a view or table.

<!-- noexec -->
```sql
-- models/staging/stg_orders.sql
select
    order_id,
    customer_id,
    cast(amount as numeric(12, 2)) as amount,
    order_date,
    _loaded_at
from {{ source('shop', 'raw_orders') }}
```

<!-- noexec -->
```sql
-- models/marts/fct_orders.sql
select o.*, c.segment
from {{ ref('stg_orders') }} o
join {{ ref('stg_customers') }} c using (customer_id)
```

`ref()` builds the dependency graph and resolves the right schema per environment; `source()` points at raw tables declared in YAML, where you can also set freshness thresholds checked by `dbt source freshness`.

## Materializations

| Materialization | Builds | Use for |
|-----------------|--------|---------|
| `view` | A view | Light staging models |
| `table` | A full table rebuild | Small to medium marts |
| `incremental` | Inserts or merges only new rows | Large fact tables |
| `ephemeral` | Inlined CTE, nothing built | Reusable logic |
| `materialized_view` | A warehouse materialized view (where supported) | Fresh aggregates managed by the warehouse |

## Incremental model

<!-- noexec -->
```sql
{{ config(materialized='incremental', unique_key='order_id', incremental_strategy='merge') }}

select * from {{ ref('stg_orders') }}
{% if is_incremental() %}
  -- filter on load time with a lookback, so late-arriving rows are picked up
  where _loaded_at > (select max(_loaded_at) - interval '3 days' from {{ this }})
{% endif %}
```

- With `unique_key` and a merge strategy, reruns and the lookback overlap update rows instead of duplicating them.
- Filtering on **event** date (`order_date >= max(order_date)`) silently misses rows that arrive late for earlier dates.
- `on_schema_change` (`ignore`, `fail`, `append_new_columns`, `sync_all_columns`) controls what happens when the model's columns change.
- **Microbatch** (dbt 1.9+): `incremental_strategy='microbatch'` with `event_time`, `batch_size`, `begin` and `lookback` splits the build into time batches you can rerun individually with `--event-time-start` and `--event-time-end`.
- `dbt run --full-refresh --select model` rebuilds from scratch after a logic change.

## Tests and contracts

<!-- noexec -->
```yaml
# models/marts/_marts.yml
models:
  - name: fct_orders
    config:
      contract: { enforced: true }      # column names and types checked at build time
    columns:
      - name: order_id
        data_type: integer
        data_tests: [unique, not_null]
      - name: customer_id
        data_type: integer
        data_tests:
          - relationships: { to: ref('dim_customers'), field: customer_id }
      - name: status
        data_type: text
        data_tests:
          - accepted_values: { values: ['placed', 'shipped', 'returned'] }
```

- **Data tests** query built data; a test fails when its query returns rows. Set `severity`, `warn_if` and `error_if` per test.
- **Singular tests** are `.sql` files in `tests/` that return failing rows (for example a reconciliation).
- **Unit tests** (dbt 1.8+) run a model's logic on mocked input rows declared in YAML, before building it.

## Snapshots (SCD Type 2)

<!-- noexec -->
```yaml
# snapshots/customers.yml  (dbt 1.9+ YAML config)
snapshots:
  - name: customers_snapshot
    relation: source('crm', 'customers')
    config:
      unique_key: customer_id
      strategy: timestamp          # or: check, with check_cols
      updated_at: updated_at
```

Snapshots compare the current source with the last snapshot and write versions with `dbt_valid_from` and `dbt_valid_to`. They only see changes that exist when they run: two updates between runs keep only the last one, so prefer CDC history when the source has it.

## Commands and selectors

```bash
dbt deps                              # install packages
dbt build                             # seeds, models, snapshots and tests in dependency order
dbt build --select fct_orders+        # a model and everything downstream
dbt build --select +fct_orders        # a model and everything upstream
dbt build --select tag:daily          # by tag
dbt build --select state:modified+ --defer --state prod-artifacts/   # CI: only changed models
dbt retry                             # rerun only the nodes that failed last time
dbt source freshness                  # check source freshness thresholds
dbt docs generate && dbt docs serve
```

Prefer `dbt build` over separate `dbt run` and `dbt test`: a failing test then stops downstream models from building on bad data.

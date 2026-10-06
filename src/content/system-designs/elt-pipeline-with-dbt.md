---
title: "Design an ELT Pipeline with dbt"
description: "A system-design case study for ELT with dbt: loading raw data, layered models, incremental and microbatch strategies, tests, contracts, CI, orchestration and cost."
technology: ["data-engineering", "dbt", "snowflake"]
topic: ["elt", "dbt", "architecture"]
difficulty: "Intermediate"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "A growing company loads data from its product database, Stripe, Salesforce and web events into Snowflake with hand-written scripts and runs hundreds of untested SQL views. Design an ELT pipeline built on dbt that loads raw data reliably, transforms it into tested, documented models, deploys changes safely, and finishes the daily build before the business day starts."
functionalRequirements:
  - "Load raw data from the product database (CDC), SaaS APIs and event files into raw schemas"
  - "Transform raw data into staging, intermediate and mart models with dbt"
  - "Process large event and order tables incrementally, including late-arriving rows"
  - "Track history of slowly changing source tables (customer plan, account owner)"
  - "Test data and logic on every run and every pull request"
  - "Publish documentation and lineage for every model"
nonFunctionalRequirements:
  - "Daily marts ready by 06:00 UTC; hourly operational models within 90 minutes of the source"
  - "A failed test on a critical model prevents publishing bad data"
  - "Every change reviewed and tested in CI before production"
  - "Any model rebuildable from raw data"
  - "Warehouse cost visible per model and per team"
scaleAssumptions:
  - "Assumption: 15 sources, about 100 GB of new raw data per day"
  - "Assumption: 400 dbt models and 1,500 tests"
  - "Assumption: largest table, web events, grows by 300 million rows a day"
  - "Assumption: 8 analytics engineers merging about 30 pull requests a week"
architectureSummary: "Managed connectors and CDC load sources into raw schemas in Snowflake unchanged (the EL part). dbt transforms raw data in the warehouse through staging, intermediate and mart layers (the T part), using incremental and microbatch models for large tables, snapshots for history, tests and model contracts for quality. Git-based CI builds only changed models against production state; an orchestrator runs scheduled builds, and results, docs and lineage are published."
technologies:
  - "Managed connectors (Fivetran or Airbyte) and Snowpipe or Snowpipe Streaming for files and events"
  - "Snowflake (BigQuery, Redshift or Databricks work the same way with their dbt adapters)"
  - "dbt (dbt Core or the dbt platform) with packages such as dbt-utils"
  - "Git with pull requests and CI runners"
  - "Orchestrator: Airflow, Dagster or the dbt platform's scheduler"
  - "Data catalog and alerting"
tradeoffs:
  - decision: "ELT: load raw, transform in the warehouse"
    alternative: "ETL: transform in a separate engine before loading"
    reason: "Raw data is preserved and replayable, transformations are SQL that analysts can own, and warehouse compute scales on demand"
    consequence: "Warehouse compute becomes the main cost and raw data with personal fields sits in the warehouse"
  - decision: "Managed connectors for SaaS sources"
    alternative: "Custom API extraction code"
    reason: "Schema changes, pagination, rate limits and API versions are handled by the vendor"
    consequence: "Per-row or per-volume pricing and less control over sync timing"
  - decision: "Incremental models (merge or microbatch) for large tables"
    alternative: "Full table rebuilds every run"
    reason: "Processes only new and changed data, cutting runtime and cost"
    consequence: "Needs a lookback for late data and periodic full refreshes to correct drift"
  - decision: "State-aware CI that builds modified models and their children"
    alternative: "Full project build on every pull request"
    reason: "Fast feedback with production-like data at a fraction of the cost"
    consequence: "CI depends on a recent production manifest and deferral to production objects"
  - decision: "Model contracts and blocking tests on mart models"
    alternative: "Warning-only tests"
    reason: "Consumers get stable schemas and are protected from publishing bad data"
    consequence: "Some runs stop and need a person; severity must be chosen carefully to avoid alert fatigue"
interviewFollowUps:
  - "How does an incremental model handle rows that arrive three days late?"
  - "What is the difference between a model contract, a data test and a unit test in dbt?"
  - "How do you deploy a change to a model used by 40 downstream models safely?"
  - "The daily build now takes four hours. How do you bring it down?"
  - "How do you capture history for a source table that only holds current values?"
  - "When would you not use dbt?"
related:
  - "articles:etl-elt/etl-vs-elt"
  - "articles:etl-elt/modern-data-pipelines"
  - "cheat-sheets:dbt"
  - "articles:data-warehousing/slowly-changing-dimensions"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "system-designs:reporting-analytics-platform"
previous: "system-designs:metrics-kpi-platform"
next: "system-designs:scalable-batch-pipeline"
versionContext: "dbt and Snowflake snippets are illustrative (dbt 1.9+ syntax for microbatch) and were not executed in this environment."
sources:
  - { label: "dbt documentation: introduction", url: "https://docs.getdbt.com/docs/introduction" }
  - { label: "dbt documentation: microbatch incremental models", url: "https://docs.getdbt.com/docs/build/incremental-microbatch" }
  - { label: "dbt documentation: model contracts", url: "https://docs.getdbt.com/reference/resource-configs/contract" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
  - { label: "Snowpipe Streaming overview", url: "https://docs.snowflake.com/en/user-guide/snowpipe-streaming/data-load-snowpipe-streaming-overview" }
---

## Approach

dbt is the transformation layer, not the whole pipeline. A good answer covers how data **arrives** (EL), how models are **structured and built incrementally**, how changes are **tested and deployed**, and how runs are **orchestrated and monitored**. Ask:

- **Sources and freshness**: which systems, how often do they change, what latency does the business need?
- **Warehouse**: Snowflake, BigQuery, Redshift, Databricks? This decides adapters, incremental strategies and cost model.
- **Volume of the largest tables** and whether late data occurs.
- **Team**: analysts, analytics engineers, data engineers? How many people change models?
- **History requirements**: do sources overwrite values the business needs to report historically?
- **Existing orchestration and CI**.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Extract and load</strong>: CDC from the product database, managed connectors for Stripe and Salesforce, Snowpipe for event files; everything lands in <code>raw_*</code> schemas unchanged, with load timestamps.</li>
<li><strong>Staging models</strong>: one per source table; rename, cast, deduplicate, standardise; materialised as views or light tables.</li>
<li><strong>Intermediate models</strong>: business logic, joins and reusable building blocks.</li>
<li><strong>Marts</strong>: facts and dimensions per domain, with contracts, documentation and tests; large facts incremental.</li>
<li><strong>Snapshots</strong>: dbt snapshots record history for mutable source tables.</li>
<li><strong>CI/CD and orchestration</strong>: pull requests run state-aware builds and tests; the orchestrator runs <code>dbt build</code> on schedule after loads complete; artefacts feed docs, lineage and alerts.</li>
</ol>
<figcaption>Load raw data unchanged, then transform it in the warehouse through tested, version-controlled dbt layers.</figcaption>
</figure>

At 04:00 the orchestrator checks that all connectors have synced since midnight (dbt `source freshness`). It then runs `dbt build --select +tag:daily`, which runs models and their tests in dependency order: if `stg_orders` fails its uniqueness test, everything downstream of it is skipped and yesterday's marts stay in place. Incremental facts process only the last few days. At 05:10 the build finishes, docs are regenerated, and a summary goes to the team channel. Hourly, a smaller selection (`tag:hourly`) refreshes operational models.

## Loading raw data (EL)

- **Raw is append-only and untouched**: preserves the ability to rebuild every model.
- **CDC for operational databases** captures deletes and avoids loading full tables.
- **Managed connectors** for SaaS APIs: they handle API changes and pagination. Pin sync schedules so loads finish before transformations start.
- **Events**: files in object storage loaded by Snowpipe, or Snowpipe Streaming for low latency.
- **Load metadata**: every raw row has `_loaded_at` (and a batch id where possible), which incremental models use.
- Declare every raw table as a dbt **source** with freshness thresholds, so stale sources are detected before transformation.

## Project structure and conventions

| Layer | Naming | Materialisation | Rule |
|---|---|---|---|
| Staging | `stg_<source>__<table>` | View or table | One-to-one with a source table; no joins |
| Intermediate | `int_<entity>_<verb>` | Ephemeral, view or table | Reusable logic; not exposed to BI |
| Marts | `fct_<process>`, `dim_<entity>` | Table or incremental | Documented grain, contracts, owned by a domain |

Enforce conventions in CI with a linter (SQLFluff) and project checks (for example dbt-project-evaluator), so 400 models stay navigable.

## Incremental models and late data

Rebuilding a 300-million-rows-a-day events table daily is wasteful. Incremental models process only new data and merge it into the existing table:

<!-- noexec -->
```sql
-- models/marts/fct_page_views.sql (dbt, Snowflake)
{{ config(
    materialized = 'incremental',
    unique_key = 'event_id',
    incremental_strategy = 'merge',
    cluster_by = ['event_date']
) }}

select
    event_id,
    user_id,
    page_path,
    event_ts,
    to_date(event_ts) as event_date,
    _loaded_at
from {{ ref('stg_web__page_views') }}
{% if is_incremental() %}
  -- 3-day lookback catches late-arriving events; merge on event_id prevents duplicates
  where _loaded_at > (select dateadd('day', -3, max(_loaded_at)) from {{ this }})
{% endif %}
```

Key points:

- **Filter on load time, not event time**, so a late event loaded today is picked up even if its event date is last week.
- **Lookback window** plus `unique_key` merge makes reruns idempotent and absorbs late data within the window.
- **Microbatch** (dbt 1.9+): set `incremental_strategy` to `'microbatch'` with `event_time`, `batch_size` (for example `day`), `begin` and `lookback`. dbt splits the work into independent time batches, filters inputs that declare an `event_time`, and lets you rerun specific batches (`--event-time-start`, `--event-time-end`), which makes backfills and retries far easier.
- **Full refreshes** periodically (or after logic changes) to correct drift, run off-peak.
- **Schema changes**: set `on_schema_change` (for example `append_new_columns` or `fail`) deliberately.

## History with snapshots

When a source overwrites values (an account's plan), the warehouse loses history unless you capture it. dbt **snapshots** compare the current source with the last snapshot and write SCD Type 2 rows with validity columns, using a `timestamp` strategy (an `updated_at` column) or a `check` strategy (compare listed columns). Run snapshots before models that depend on them, and remember that a snapshot only records changes it observes: if the source changes twice between runs, the intermediate value is lost, which is a reason to prefer CDC history when it exists.

## Testing: three kinds of checks

- **Data tests** run after a model builds and query its data: `unique`, `not_null`, `relationships`, `accepted_values`, plus custom tests (order total equals sum of lines). Set `severity` and thresholds (`error_if`, `warn_if`).
- **Unit tests** (dbt 1.8+) run model logic against small mocked inputs before building, to test tricky SQL such as attribution or currency conversion.
- **Model contracts** (`contract: {enforced: true}`) check that a model's columns and types match its YAML at build time, so a refactor cannot silently change a mart's schema.

Use `dbt build`, which interleaves models and tests in dependency order, so a failing test stops downstream models from building on bad data.

## CI/CD

1. A pull request triggers CI: lint, compile, then `dbt build --select state:modified+ --defer --state <prod-artifacts>`, which builds only changed models and their descendants in a temporary schema and reads unchanged parents from production.
2. Optional data diff of changed models against production to show reviewers row and value changes.
3. Merge to main deploys; production runs pick up the new code.
4. Breaking changes to contracted models use **model versions** so consumers can migrate before the old version is removed.

## Orchestration

- Trigger dbt after loads complete (sensors or connector webhooks), not purely by clock.
- Split runs by freshness tier with tags (`hourly`, `daily`) and selectors.
- Retries for transient warehouse errors; `dbt retry` re-runs only failed nodes.
- Record run results (`run_results.json`) for timing, cost and test history.

## Cost and performance

- Size the warehouse per job; use a separate warehouse for dbt so BI is unaffected.
- Find the slowest models from run results and fix them: incremental instead of full, cluster large tables, avoid repeated heavy CTEs by materialising intermediate models.
- Views for light staging models; tables only where reuse or performance needs them.
- Query tags per model (dbt can set `query_tag` in Snowflake) for cost attribution.

## Security and PII

Raw schemas are restricted; staging models hash or drop personal fields that marts do not need; masking policies on remaining sensitive columns; dbt `grants` config sets permissions per model in code so they are reviewed like everything else.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Source not refreshed | Stale marts | Source freshness check fails the run early; alert owner |
| Blocking test fails | Downstream models skipped | Previous data remains; fix data or code; `dbt retry` |
| Incremental model drifts (bug, missed late data) | Wrong history | Fix logic; full refresh or microbatch rerun for affected dates |
| Upstream column renamed | Staging model fails | Contracts and source schema tests catch it; update staging only |
| Build exceeds time window | SLA missed | Profile slow models; parallel threads; incremental strategies |

## Scaling to 10×

With 4,000 models and many teams: split into multiple dbt projects with cross-project references (or a mesh of packages) and public, versioned models as interfaces; enforce ownership with groups and access modifiers (`private`, `protected`, `public`); run CI on modified state only; and move the largest event models to microbatch.

## Monitoring and SLAs

- Build completion time against 06:00 and the hourly SLA.
- Test failures and warnings per model over time.
- Source freshness per source.
- Model runtime and warehouse cost per model (from run results and query tags).

## Capacity estimate

- **Raw growth**: 100 GB/day ≈ 36 TB/year raw before warehouse compression.
- **Events incremental run**: 300 million new rows/day, plus a 3-day lookback re-scanning about 900 million rows of staging. With clustering on load date, this reads a few days of partitions instead of the full history (over 100 billion rows after a year).
- **Build time**: 400 models at, say, 20 seconds median on a medium warehouse with 8 threads ≈ 400 × 20 / 8 ≈ 17 minutes plus the few heavy models; measure and budget against the 06:00 deadline.
- **CI**: a typical PR touches 3–5 models and 20–40 descendants, building in minutes with deferral.

## What a strong answer includes

- **EL and T separated**, with raw data preserved and sources declared with freshness.
- **Layered project structure** with naming and ownership conventions.
- **Incremental and microbatch** strategies with lookback for late data and idempotent merges.
- **Snapshots** for history and their limits.
- **Three types of checks**: data tests, unit tests, contracts, and `dbt build` ordering.
- **State-aware CI** and versioned models for breaking changes.
- **Orchestration** triggered by data arrival, with retries and cost attribution.

## Common mistakes

- Filtering incremental models on event time and silently missing late rows.
- Incremental models without a `unique_key` or merge logic, creating duplicates on rerun.
- Running `dbt run` and `dbt test` separately, so bad data is published before tests fail.
- Full project builds in CI that take an hour and get skipped.
- Joins and business logic in staging models.
- Relying on snapshots to capture history that changes faster than the snapshot schedule.
- One giant warehouse shared by dbt and dashboards.

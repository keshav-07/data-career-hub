---
title: "Design a Data Catalog and Lineage System"
description: "A system-design case study for a data catalog with lineage: metadata ingestion, search, ownership, column-level lineage, impact analysis, access workflows and adoption."
technology: ["data-engineering", "databricks", "airflow"]
topic: ["data-catalog", "lineage", "governance"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "Analysts at a large company spend days finding the right table, nobody knows who owns half the datasets, and engineers cannot tell what will break if they change a column. Design a data catalog and lineage system that automatically harvests metadata from warehouses, lakehouses, pipelines and BI tools, makes data discoverable and trustworthy, shows table- and column-level lineage, and supports governance workflows such as ownership, classification and access requests."
functionalRequirements:
  - "Harvest technical metadata (schemas, tables, columns, statistics) from the warehouse, lakehouse, databases and Kafka"
  - "Capture lineage from Airflow, Spark, dbt and BI tools at table and column level"
  - "Search and browse datasets with ranking by usage, certification and freshness"
  - "Record business metadata: owners, descriptions, glossary terms, tags, classifications (PII)"
  - "Show impact analysis: everything downstream of a table or column, including dashboards and models"
  - "Support workflows: access requests, certification, deprecation notices"
nonFunctionalRequirements:
  - "Metadata no more than 1 hour stale for technical metadata; lineage within minutes of a run"
  - "Search results under 500 ms"
  - "The catalog never holds data values except approved samples and profiles"
  - "Metadata changes are versioned and auditable"
  - "Extensible to new source systems through connectors or a standard event format"
scaleAssumptions:
  - "Assumption: 50,000 tables and views, 1.5 million columns"
  - "Assumption: 5,000 pipelines, 2,000 dashboards, 300 ML models"
  - "Assumption: 3,000 monthly catalog users"
  - "Assumption: about 100,000 lineage events per day"
architectureSummary: "Connectors pull technical metadata from each platform on a schedule, while pipelines push OpenLineage run events with input and output datasets and column-lineage facets. An ingestion layer normalises everything into a metadata graph (entities such as datasets, columns, jobs, dashboards, people and terms, linked by typed edges) stored in a database with a search index and a change log. A UI and API provide search, lineage graphs and impact analysis; workflow services handle ownership, classification, certification and access requests, and push tags and policies back to the platforms."
technologies:
  - "Catalog platform: DataHub, OpenMetadata, Unity Catalog, or a cloud catalog (AWS Glue / DataZone, Google Dataplex, Microsoft Purview)"
  - "OpenLineage integrations for Airflow, Spark and dbt; Marquez as a reference lineage backend"
  - "SQL parsing of query history for warehouse lineage"
  - "Graph-capable metadata store plus a search index (Elasticsearch or OpenSearch)"
  - "Kafka (or another log) for metadata change events"
  - "Identity provider integration for owners and access workflows"
tradeoffs:
  - decision: "Automated harvesting and push-based lineage events"
    alternative: "Manually curated catalog entries"
    reason: "Coverage and freshness without relying on people to document everything"
    consequence: "Connectors and integrations must be maintained as platforms change"
  - decision: "Column-level lineage for critical paths"
    alternative: "Table-level lineage only"
    reason: "Impact analysis for a column rename or PII tracing needs column granularity"
    consequence: "More expensive to compute and harder to make complete, especially through Python code"
  - decision: "Metadata graph with typed entities and edges"
    alternative: "Flat tables of datasets and owners"
    reason: "Lineage, ownership, glossary and usage are relationships; traversals answer impact questions"
    consequence: "Needs graph queries or recursive traversals and careful modelling"
  - decision: "Adopt an open-source or managed catalog"
    alternative: "Build a catalog from scratch"
    reason: "Connectors, UI, search and lineage models already exist"
    consequence: "Fit to the company's processes needs configuration and some extension"
  - decision: "Push classifications back to platforms as tags and policies"
    alternative: "Catalog as a read-only inventory"
    reason: "A PII tag set once in the catalog drives masking in the warehouse"
    consequence: "The catalog becomes part of the security control path and must be reliable"
interviewFollowUps:
  - "How do you get lineage from Spark jobs written in Python, not just SQL?"
  - "How do you rank search results so the right orders table appears first?"
  - "A team wants to rename a column. How does the catalog tell them what will break?"
  - "How do you keep owners and descriptions from going stale?"
  - "How do you find every place an email address flows to?"
  - "How do you get people to actually use the catalog?"
related:
  - "articles:databricks/unity-catalog-governance"
  - "interview-questions:databricks/unity-catalog"
  - "articles:etl-elt/pipeline-observability"
  - "system-designs:data-observability-system"
  - "system-designs:data-lake-on-cloud-object-storage"
previous: "system-designs:data-observability-system"
next: "system-designs:gdpr-pii-compliant-pipeline"
versionContext: "The impact-analysis query was run on PostgreSQL 16 against a small edge table. Catalog connectors and OpenLineage integrations are described, not executed."
sources:
  - { label: "OpenLineage: object model", url: "https://openlineage.io/docs/spec/object-model/" }
  - { label: "OpenLineage: facets and extensibility", url: "https://openlineage.io/docs/spec/facets/" }
  - { label: "About OpenLineage", url: "https://openlineage.io/docs/" }
  - { label: "Unity Catalog documentation", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
  - { label: "PostgreSQL documentation: WITH queries (recursive CTEs)", url: "https://www.postgresql.org/docs/current/queries-with.html" }
---

## Approach

A catalog fails in one of two ways: it is **incomplete or stale** (so nobody trusts it), or it is **complete but unused** (so it is shelfware). Design for automatic, fresh metadata first, then for the workflows that make people come back. Ask:

- **Which platforms must be covered?** Warehouse, lakehouse, operational databases, Kafka, BI, ML.
- **Main users and questions**: analysts finding data, engineers doing impact analysis, governance teams tracing PII, auditors?
- **Lineage granularity**: table level, column level, or both?
- **Governance integration**: should the catalog drive access control and masking, or only document them?
- **Build, adopt open source, or use the platform's catalog?**
- **Existing ownership model**: is there a list of teams and domains to map datasets to?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Pull connectors</strong>: scheduled extraction of schemas, tables, columns, statistics, usage and query history from each platform.</li>
<li><strong>Push events</strong>: Airflow, Spark and dbt emit OpenLineage run events (inputs, outputs, column-lineage facets); platforms emit schema-change events.</li>
<li><strong>Ingestion and normalisation</strong>: events land on a metadata change log, are mapped to entity URNs (platform, environment, name) and merged into the metadata graph.</li>
<li><strong>Metadata store</strong>: entities (datasets, columns, jobs, dashboards, models, people, glossary terms, tags) and typed edges, versioned, with a search index.</li>
<li><strong>Experiences</strong>: search, dataset pages, lineage graphs, impact analysis, API and notifications.</li>
<li><strong>Governance workflows</strong>: ownership assignment, PII classification, certification, deprecation, access requests; tags and policies pushed back to platforms.</li>
</ol>
<figcaption>Metadata flows in automatically, becomes a versioned graph, and flows back out as search, lineage, workflows and policies.</figcaption>
</figure>

An analyst searches "orders". Results rank `gold.fct_orders` first: it is certified, owned by the commerce domain, refreshed daily and queried by 400 people last month; `tmp_orders_backup_2023` is far below because nobody uses it and it has no owner. The dataset page shows columns with descriptions, a PII tag on `customer_email`, freshness, quality status and upstream lineage back to the `orders` table in PostgreSQL. An engineer planning to rename `silver.orders.amount` opens impact analysis and sees two gold tables, one ML feature set and three dashboards that read that column, with their owners, and sends them a change notice from the catalog.

## Metadata model

Model metadata as a graph of entities identified by stable URNs that combine entity type, platform and full name (for example `dataset:snowflake:` followed by `prod.gold.fct_orders`):

| Entity | Key attributes | Example edges |
|---|---|---|
| Dataset (table, view, topic, file set) | Platform, schema, row count, freshness, certification | `contains` column; `produced_by` job; `owned_by` team |
| Column | Type, description, classification | `derived_from` column |
| Job / pipeline | Orchestrator, schedule, code location | `reads` dataset; `writes` dataset |
| Dashboard / chart | BI tool, owner, views | `reads` dataset or column |
| ML model / feature | Version, training data | `trained_on` dataset |
| Person / team / domain | Contact, on-call | `owns` |
| Glossary term | Definition, steward | `describes` dataset or column |

Every change (a new column, an owner change, a tag added) is an event in a change log, so the catalog can show history and other systems can subscribe to it (for example, a masking-policy service reacting to new PII tags).

## Harvesting technical metadata

- **Warehouses and lakehouses**: information schema, table properties, statistics, query and access history. Unity Catalog and cloud catalogs already hold much of this and expose APIs.
- **Operational databases**: schema introspection from read replicas.
- **Kafka**: topics, schema-registry subjects and consumer groups.
- **BI tools**: dashboards, charts, the datasets and fields they read, view counts.
- **Incremental extraction**: harvest only objects changed since the last run where the platform exposes change timestamps; full scans weekly to catch deletions.

## Lineage

**Table-level lineage** comes from three sources, combined:

1. **OpenLineage run events** emitted by Airflow, Spark and dbt integrations: each run lists its input and output datasets, plus facets such as schema, SQL text and column lineage. This covers Spark jobs written in Python, which SQL parsing cannot see.
2. **SQL parsing** of warehouse query history (`INSERT ... SELECT`, `CREATE TABLE AS`, `MERGE`) for transformations run outside instrumented tools.
3. **BI-tool metadata** for dataset-to-dashboard edges.

**Column-level lineage** is harder: SQL parsers resolve which source columns feed each output column (through joins, CTEs and expressions), Spark's OpenLineage integration derives column lineage from the logical plan, and dbt lineage comes from compiled SQL. Expect gaps in UDFs and Python code; show confidence and the source of each edge.

**Impact analysis** is a graph traversal. The example below runs on PostgreSQL 16 with a recursive query over an edge table, guarding against cycles; catalog backends do the same with graph queries.

```sql
CREATE TABLE lineage_edges (
  upstream   TEXT,
  downstream TEXT
);
INSERT INTO lineage_edges VALUES
  ('pg.public.orders',       'bronze.orders'),
  ('bronze.orders',          'silver.orders'),
  ('silver.orders',          'gold.fct_orders'),
  ('silver.customers',       'gold.fct_orders'),
  ('gold.fct_orders',        'gold.daily_revenue'),
  ('gold.daily_revenue',     'dashboard:exec_revenue'),
  ('gold.fct_orders',        'ml:churn_features'),
  ('silver.customers',       'gold.dim_customer');

WITH RECURSIVE impact(node, depth, path) AS (
  SELECT downstream, 1, ARRAY['silver.orders', downstream]
  FROM lineage_edges WHERE upstream = 'silver.orders'
  UNION ALL
  SELECT e.downstream, i.depth + 1, i.path || e.downstream
  FROM impact i JOIN lineage_edges e ON e.upstream = i.node
  WHERE NOT e.downstream = ANY (i.path)          -- guard against cycles
)
SELECT node, min(depth) AS hops
FROM impact
GROUP BY node
ORDER BY hops, node;
```

```text
          node          | hops
------------------------+------
 gold.fct_orders        |    1
 gold.daily_revenue     |    2
 ml:churn_features      |    2
 dashboard:exec_revenue |    3
```

Changing `silver.orders` affects a fact table, a revenue table, an ML feature set and an executive dashboard, but not `gold.dim_customer`, which only depends on customers. With column-level edges the same traversal narrows impact to consumers of the specific column.

## Search and discovery

Ranking matters more than search features. Signals:

- Text match on name, description, columns and glossary terms.
- **Usage**: distinct users and queries in the last 30 days.
- **Trust**: certification, owner present, quality checks passing, freshness.
- **Recency**: recently updated tables above abandoned ones.
- **Personalisation**: datasets used by the searcher's team.
- Down-rank temporary, backup and sandbox objects by naming patterns and lack of ownership.

## Business metadata and ownership

- **Ownership is assigned automatically where possible**: from the pipeline's repository owners, the schema's domain mapping, or the most frequent writer; humans confirm.
- **Descriptions**: pulled from dbt docs and table comments so documentation lives with code; the catalog writes edits back where the platform supports it.
- **Staleness controls**: owners re-confirm critical datasets each quarter; datasets whose owner left are flagged automatically from the identity provider.
- **Glossary**: business terms with stewards, linked to certified datasets and metrics.

## Classification and policy

- Automated **PII detection** by column name patterns and sampled value patterns (emails, phone numbers), producing suggested tags that a steward confirms.
- **Propagation** of classifications along column lineage: if `email` flows into `customer_contact`, that column inherits the PII tag as a suggestion.
- **Push to platforms**: confirmed tags drive masking and row-access policies (for example tag-based masking in the warehouse or Unity Catalog), so classification is enforced, not just documented.
- **Access requests**: request access from the dataset page; the owner approves; the grant is applied through the platform's API and logged.

## Security

The catalog stores metadata, not data. Sample values and profiles are opt-in, masked for classified columns, and visible only to people with access to the underlying data. Catalog permissions mirror platform permissions for sensitive dataset pages, since even column names can be sensitive. All metadata edits are audited.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Connector breaks after a platform upgrade | Stale metadata | Freshness monitor per connector; alert the catalog team |
| Lineage integration missing on a cluster | Gaps in lineage | Coverage report: share of runs emitting events per platform |
| SQL parser misreads complex SQL | Wrong edges | Edge confidence and source shown; manual correction workflow |
| Owner leaves the company | Orphaned datasets | Identity sync flags and reassigns to the team's lead |
| Tag push fails | Policy not enforced | Reconciliation job compares catalog tags with platform tags |

## Scaling to 10×

At 500,000 datasets and 15 million columns: shard the search index, ingest through the change log asynchronously with idempotent upserts keyed by URN, precompute and cache impact sets for critical nodes, and limit lineage graph rendering to a depth with on-demand expansion. Federate ownership by domain so the central team only runs the platform.

## Monitoring and SLAs

- Connector freshness and failure rate; lineage coverage by platform.
- Share of critical datasets with owner, description, classification and certification.
- Search success (searches followed by a dataset page view and a query) and monthly active users.
- Access-request turnaround time.

## Capacity estimate

- **Entities**: 50,000 datasets + 1.5 million columns + 5,000 jobs + 2,000 dashboards + people and terms ≈ 1.6 million entities. At a few KB each, about 5 GB of metadata, easily handled by a relational or graph store plus a search index.
- **Edges**: table lineage of about 200,000 edges; column lineage perhaps 5–10 million edges, still modest for a graph store.
- **Lineage events**: 100,000/day × about 5 KB ≈ 500 MB/day of raw events; keep raw events for a short period and the merged graph indefinitely.
- **Search load**: 3,000 monthly users at perhaps 20 searches each a month is under one search per second on average, trivial for the search index.
- **Harvesting**: incremental extraction every hour touching only changed objects keeps platform load low; the weekly full scan of 50,000 tables runs in minutes against system views.

## What a strong answer includes

- **Automated harvesting** plus **push-based lineage** (OpenLineage) for coverage beyond SQL.
- A **metadata graph** with stable URNs and a change log.
- **Column-level lineage** for critical paths, with honest handling of gaps.
- **Search ranking** using usage and trust signals.
- **Ownership automation and staleness controls**.
- **Classification enforced** through tags and policies pushed to platforms.
- **Adoption** measured and designed for, not assumed.

## Common mistakes

- Relying on people to fill in a wiki-style catalog by hand.
- Table-level lineage only from SQL logs, missing all Spark and Python jobs.
- Search ranked by name match alone, so backup tables outrank certified ones.
- No owners, or owners who left two years ago.
- A catalog that documents PII but does not drive masking.
- Copying data values into the catalog for previews without access control.
- Launching with full coverage of everything instead of starting with critical data products and workflows people need.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Search Indexing Pipeline"
description: "A system-design case study for keeping a search index in sync with a product database: CDC, denormalisation, versioned upserts and zero-downtime reindexing."
technology: ["data-engineering", "kafka"]
topic: ["streaming", "search", "architecture"]
tags: ["search", "opensearch", "elasticsearch", "cdc", "reindexing", "index-alias"]
difficulty: "Advanced"
problem: "Design the pipeline that keeps a product search index (for an online marketplace) in sync with the catalogue, pricing and inventory databases, so that changes are searchable within seconds and the whole index can be rebuilt with a new mapping without downtime."
functionalRequirements:
  - "Capture inserts, updates and deletes of products, prices, stock levels and seller data"
  - "Build one denormalised search document per product from several source tables"
  - "Apply changes to the search index within seconds, including deletes and delistings"
  - "Rebuild the whole index from scratch (new analysers, new fields) while search keeps serving"
  - "Detect and repair documents that drifted from the source of truth"
nonFunctionalRequirements:
  - "95% of changes searchable within 10 seconds; price and stock changes within 5 seconds"
  - "Out-of-order or duplicate change events never leave an older version in the index"
  - "Full reindex completes within 6 hours without degrading live search latency"
  - "Index stays queryable during source database or pipeline outages (serving stale data rather than failing)"
  - "No personal data in the search index"
scaleAssumptions:
  - "Assumption: 50 million products, average search document 4 KB"
  - "Assumption: 2,000 changes per second on average, 20,000 at peak (sales events, bulk price updates)"
  - "Assumption: 5,000 search queries per second"
  - "Assumption: price and stock change far more often than titles and descriptions"
architectureSummary: "Log-based CDC streams changes from the source databases to Kafka, keyed by product id. An indexer service consumes them, looks up or joins the other parts of the document, and writes versioned upserts and deletes to the search cluster with the bulk API. Reads go through an index alias; full rebuilds write a new index from a snapshot plus the change stream, then swap the alias atomically."
technologies: ["Log-based CDC (for example Debezium)", "Apache Kafka", "Indexer service (Kafka consumer, or Flink for stateful joins)", "OpenSearch or Elasticsearch", "Key-value store or materialised tables for document assembly", "Object storage for snapshots"]
tradeoffs:
  - decision: "CDC from database logs"
    alternative: "Application dual-writes to database and index"
    reason: "Every committed change is captured in order, including changes from scripts and admin tools; no lost updates when one write fails"
    consequence: "Needs CDC infrastructure and handling of schema changes in the source"
  - decision: "Versioned upserts using the source change position as the version"
    alternative: "Last write wins in arrival order"
    reason: "Retries and reprocessing can deliver changes out of order; external versioning rejects stale writes"
    consequence: "Every document needs a monotonically increasing version from the source"
  - decision: "Partial updates for hot fields (price, stock)"
    alternative: "Rebuild the whole document on every change"
    reason: "Cheaper to assemble and smaller writes for the most frequent changes"
    consequence: "Two update paths to keep consistent; reconciliation must cover both"
  - decision: "Reindex into a new index and swap an alias"
    alternative: "Update mappings in place"
    reason: "Mapping and analyser changes usually require reindexing; the alias swap is atomic and reversible"
    consequence: "Temporarily double the storage and indexing load during a rebuild"
  - decision: "Near-real-time refresh of about 1 second"
    alternative: "Refresh after every write"
    reason: "Refreshing per write creates tiny segments and hurts both indexing and search"
    consequence: "A change is not visible for up to the refresh interval after it is indexed"
interviewFollowUps:
  - "A product is deleted, then the delete event is processed before a delayed update. What prevents the product reappearing?"
  - "How do you add a new field that needs data from a table you never captured before?"
  - "A sale changes 5 million prices in ten minutes. What happens to the pipeline and the search cluster?"
  - "How do you know the index matches the database?"
  - "How do you roll back a reindex that ranks results badly?"
  - "How would you index seller ratings that change when reviews are added?"
related:
  - "system-designs:change-data-capture-platform"
  - "system-designs:kafka-ingestion-system"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "articles:kafka/topics-partitions-consumer-groups"
versionContext: "Search-engine behaviour (bulk API, external versioning, aliases, 1-second default refresh) checked against the OpenSearch documentation source; Elasticsearch behaves the same way for these features. The Python versioning simulation was run with Python 3 via scripts/verify-examples.py."
sources:
  - { label: "OpenSearch documentation: Bulk API", url: "https://github.com/opensearch-project/documentation-website/blob/main/_api-reference/document-apis/bulk.md" }
  - { label: "OpenSearch documentation: Index document (versioning)", url: "https://github.com/opensearch-project/documentation-website/blob/main/_api-reference/document-apis/index-document.md" }
  - { label: "OpenSearch documentation: Index aliases", url: "https://github.com/opensearch-project/documentation-website/blob/main/_im-plugin/index-alias.md" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
previous: "system-designs:time-series-metrics-store"
next: "system-designs:notification-alerting-pipeline"
---

## Approach

A search index is a **derived, denormalised copy** of data owned elsewhere. The design problem is keeping that copy correct and fresh under retries, reordering and bulk changes, and being able to throw it away and rebuild it safely. The search engine's ranking and query features are a separate topic; stay on the data pipeline.

Clarifying questions:

- **Freshness by field**: do all fields need seconds, or only price and stock? Can descriptions lag a few minutes?
- **Sources**: how many tables or services contribute to a document? Who owns them?
- **Change volume and burstiness**: are there bulk operations (sales, catalogue imports)?
- **Deletes and visibility rules**: delisted, out-of-stock, region-restricted products?
- **Rebuild frequency**: how often do mappings or analysers change?
- **Consistency expectations**: is it acceptable for search to show a price that the product page then corrects?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Source databases</strong>: catalogue, pricing, inventory and seller tables remain the source of truth.</li>
<li><strong>CDC</strong>: connectors read each database's transaction log and publish row changes to Kafka topics keyed by product id.</li>
<li><strong>Document assembly</strong>: the indexer keeps the latest state of each contributing table (a materialised lookup store) and builds the full search document or a partial update.</li>
<li><strong>Bulk writer</strong>: batches upserts and deletes into bulk requests with the source change position as an external version.</li>
<li><strong>Search cluster</strong>: writes go to the index behind the write alias; queries use the read alias.</li>
<li><strong>Reindex path</strong>: a batch job builds a new index from a consistent snapshot, the stream catches it up, then the alias swaps.</li>
<li><strong>Reconciler</strong>: periodically compares source and index for samples or full ranges and repairs drift.</li>
</ol>
<figcaption>The stream keeps the index fresh; the rebuild path keeps it replaceable; the reconciler keeps it honest.</figcaption>
</figure>

Walkthrough:

1. **CDC** captures every committed change, including deletes, from the database log. Keying by product id keeps all changes to one product in one Kafka partition, so they arrive in order **within that partition** in normal operation.
2. **Document assembly** is the hard part. A price change event contains only the price row; the search document needs title, category, seller rating and stock too. The indexer keeps a lookup store (a key-value store, or state in a Flink job) populated from the same CDC topics, so it never queries the production databases per event.
3. **The bulk writer** groups operations. The OpenSearch documentation suggests starting with 1,000 to 5,000 operations per request and a request size of roughly 5 to 15 MB, then tuning.
4. **Aliases** decouple clients from physical index names (`products` → `products_v17`). Swapping an alias is atomic.
5. **Reconciliation** exists because every pipeline eventually drifts: a bug, a skipped event, a manual fix in the database.

## Document model and index layout

- One document per product, id = product id. Denormalise everything search needs (title, brand, category path, price per region, in-stock flag, seller rating) because the search engine cannot join at query time efficiently.
- Keep a `source_version` field (the highest change position that produced the document) and `indexed_at`, useful for debugging freshness.
- Separate fields for full-text search (analysed text) and filtering or sorting (keyword and numeric fields).
- Shard count is fixed at index creation in most engines; choose it for the target size (for example shards of a few tens of GB) and change it by reindexing.

## Ordering, idempotency and deletes

Kafka keyed partitions give order in the happy path, but retries, reprocessing from an earlier offset, and merging several source topics all break strict ordering. Use **external versioning**: send the source's change position (log sequence number, or a per-row version column) as the document version. The engine writes only if the new version is greater than the stored one, so stale and duplicate writes are rejected.

A small simulation of that rule:

```python
index = {}  # doc_id -> (version, document)

def apply(doc_id, version, doc):
    """Mimic external versioning: write only if version is newer than the stored one."""
    current = index.get(doc_id)
    if current is not None and version <= current[0]:
        return "ignored (stale)"
    index[doc_id] = (version, doc)
    return "indexed"

# Change events for product 42, delivered out of order after a retry
events = [
    (42, 1001, {"title": "Trail shoe", "price": 89}),
    (42, 1003, {"title": "Trail shoe", "price": 79}),
    (42, 1002, {"title": "Trail shoe", "price": 85}),   # late retry of an older change
    (42, 1003, {"title": "Trail shoe", "price": 79}),   # duplicate delivery
]
for doc_id, version, doc in events:
    print(version, apply(doc_id, version, doc))
print("final:", index[42])
```

```text
1001 indexed
1003 indexed
1002 ignored (stale)
1003 ignored (stale)
final: (1003, {'title': 'Trail shoe', 'price': 79})
```

Two subtleties:

- **Deletes** need the same protection. If a delete removes the document entirely, a delayed older update could recreate it. Prefer a **soft delete** (index a tombstone document with `is_active = false` and the delete's version, filtered out of queries), and purge tombstones later.
- **Documents built from several tables** need a version that increases whenever **any** contributing row changes. A common approach is to bump a version column on the product row when related rows change, or to use the maximum change position across the contributing rows if they come from one database log.

## Ingestion and backpressure

- The bulk writer adapts batch size and concurrency to the cluster's responses. HTTP 429 (rejected because the write queue is full) means slow down with exponential backoff, not retry harder.
- Kafka buffers bursts. During a sale that changes millions of prices, consumer lag rises for a few minutes; that is acceptable if lag is monitored and the price SLA is defined at normal load.
- **Coalesce** changes: if a product changes ten times in one batch, write only the latest version. This alone can cut write volume dramatically during bulk updates.
- Separate topics or consumer groups for hot fields (price, stock) and cold fields (descriptions) let urgent updates bypass a backlog of slow full-document rebuilds.

## Zero-downtime reindexing

1. Create `products_v18` with the new mapping, with replicas set to 0 and refresh disabled to speed up bulk loading.
2. Record the current Kafka offsets (or CDC position), then bulk-load from a consistent snapshot (a database export or the lakehouse copy of the source tables).
3. Start a second consumer group from the recorded offsets that writes changes to `products_v18` too. External versioning makes the overlap between snapshot and stream safe.
4. When lag is near zero, restore replicas and refresh interval, run validation (document counts, sample queries, relevance checks).
5. Atomically move the read alias from `products_v17` to `products_v18`. Keep v17 for a few days for rollback, still fed by its consumer group, or accept that rollback will be slightly stale.

## Late data and schema evolution

- A new searchable field from an existing source table: add to the mapping (additive mapping changes are allowed), deploy the new assembler, then backfill by re-emitting documents. Changing a field's type or analyser requires a reindex.
- A new source table: start capturing it, backfill the lookup store from a snapshot, then reindex or re-emit affected documents.
- Source schema changes reach the indexer through CDC; use a schema registry and fail loudly on incompatible changes rather than indexing nulls.

## Data quality and reconciliation

- **Counts**: active products in the database versus active documents in the index, per category.
- **Sampled field comparison**: every few minutes, pick random product ids, read source and index, compare price, stock and title. Track a mismatch rate.
- **Full sweeps**: nightly, compare (id, version) pairs between a source export and an index scroll; re-emit any mismatched ids.
- **Freshness**: `now() - indexed_at` for recent changes, and end-to-end latency from source commit time to index write.

## Security

- Index only data customers are allowed to see. Seller contact details, cost prices and internal notes stay out of the document.
- The indexer's credentials can write only to product indices; query services have read-only credentials on the alias.
- Region or seller restrictions are fields filtered by the query service, never trusted from the client.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Search cluster rejects writes | Kafka lag grows; search serves stale data | Backoff; scale data nodes; coalescing reduces catch-up volume |
| Indexer bug writes bad documents | Wrong results | Fix, then replay from an earlier offset (versioning allows overwrite only if versions increase, so bump a pipeline epoch in the version or reindex) |
| CDC connector loses its position | Missed changes | Re-snapshot affected tables; reconciler repairs drift |
| Bad mapping in a new index | Poor relevance after the swap | Swap the alias back to the previous index |
| Lookup store lost | Cannot assemble documents | Rebuild from compacted Kafka topics or a snapshot |

A subtle trap: with external versioning, re-processing old events after a bug fix does **nothing**, because their versions are not newer. Plan the fix path: either reindex into a new index or include a pipeline epoch in the version (for example epoch × 10¹² + change position).

## Monitoring and SLAs

- End-to-end latency from source commit to indexed, p50 and p95, separately for price and stock changes.
- Kafka consumer lag per topic; bulk rejection rate; indexing throughput.
- Version conflicts per minute (a sudden rise usually means replay or reordering).
- Reconciliation mismatch rate and repaired documents per day.

## Cost

- Partial updates for hot fields reduce indexing CPU.
- Coalescing and batching reduce request overhead.
- Replica count is a trade-off between query capacity, resilience and storage.
- Reindexing temporarily doubles storage; schedule it and size the cluster for it.

## Scaling to 10×

At 500 million products and 200,000 changes per second at peak:

- More Kafka partitions and indexer instances; keep keying by product id.
- Split indices by region or category if queries are naturally scoped, so each index is smaller.
- Move document assembly into a stateful stream processor with keyed state (for example Flink) if lookup-store reads become the bottleneck.
- Reindexing takes longer than a maintenance window, so build the new index continuously in the background.

## Capacity estimate

Assumptions: 50 million documents of 4 KB, index overhead about 1.5× the source size, 1 replica, 2,000 changes/s average and 20,000 peak, 70% of changes are price or stock partial updates.

- **Primary index size**: 50 × 10⁶ × 4 KB × 1.5 ≈ 300 GB; with 1 replica ≈ 600 GB. At about 30 GB per shard, roughly 10 primary shards.
- **Write throughput**: 20,000 changes/s at peak; after coalescing (assume 50% of changes in a batch hit the same products during bulk updates) about 10,000 writes/s. At 2,000 operations per bulk request that is 5 bulk requests per second.
- **Full reindex**: 50 million documents at a sustained 10,000 documents/s ≈ 83 minutes, comfortably inside the 6-hour target, leaving room to throttle and protect live queries.
- **Kafka**: 2,000 changes/s × 1 KB per change event ≈ 2 MB/s average; trivial for a small cluster. Retention of 7 days lets you rebuild the lookup store or recover from a week-old bug.

## What a strong answer includes

- CDC rather than dual writes, keyed by document id.
- A denormalised document model and a lookup store so the indexer never hammers source databases.
- External versioning (with soft deletes) to make retries and reordering harmless, and awareness that it blocks naive replays.
- Bulk writes with backoff, coalescing and separate paths for hot fields.
- Alias-based reindexing with snapshot plus stream catch-up.
- Continuous reconciliation and freshness monitoring.

## Common mistakes

- Dual writes from the application, which drift the first time one write fails.
- Last-write-wins in arrival order, so retries resurrect old prices or deleted products.
- Querying the production database for every change event to assemble documents.
- Refreshing the index after every write.
- Changing a mapping in place and expecting old documents to be reanalysed.
- No reconciliation, so drift is discovered by customers.

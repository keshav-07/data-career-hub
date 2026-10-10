---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Vector Embeddings Pipeline"
description: "Vector embeddings pipeline system design: batch and streaming embedding, model versioning, blue-green re-indexing, ANN index choice and recall testing."
technology: ["data-engineering", "python", "spark"]
topic: ["ml-data", "embeddings", "vector-search", "architecture"]
tags: ["embeddings", "vector-database", "hnsw", "ivf", "quantisation", "re-indexing", "model-versioning"]
difficulty: "Advanced"
problem: "Design a platform that computes, stores and serves vector embeddings for several use cases (product search, recommendations, document retrieval) over hundreds of millions of items: keep embeddings in sync with changing source data, let teams upgrade embedding models safely, and serve low-latency nearest-neighbour queries with measured recall."
functionalRequirements:
  - "Compute embeddings for new and changed items from text, images or behaviour, in batch and near real time"
  - "Store embeddings with item id, model name and version, source content hash and timestamps"
  - "Build and serve approximate nearest-neighbour (ANN) indexes with metadata filtering"
  - "Support model upgrades through a full re-embedding and a zero-downtime index switch"
  - "Delete or update vectors when items are removed, changed or restricted"
  - "Measure retrieval recall and latency continuously"
nonFunctionalRequirements:
  - "Changed items searchable with new embeddings within 10 minutes"
  - "ANN queries under 50 ms at p95 at a few thousand queries per second"
  - "Recall@10 against exact search above an agreed target (for example 0.95) per use case"
  - "Never mix vectors from different models or versions in one index"
  - "Full re-embedding of the largest corpus completes within a few days within budget"
scaleAssumptions:
  - "Assumption: 200 million items in the largest corpus, 30 million in others"
  - "Assumption: 768-dimension float32 embeddings (dimension depends on the model)"
  - "Assumption: 2 million item changes a day"
  - "Assumption: 3,000 queries per second at peak across use cases"
architectureSummary: "Source changes arrive through CDC or events; a change detector hashes the embedding input so only items whose input changed are re-embedded. Embedding workers (GPU or a hosted API) process batches from a queue and write vectors to a versioned embedding table in the lakehouse, which is the system of record. Index builders load each model version's vectors into ANN indexes behind an alias; streaming upserts keep the live index fresh. A model upgrade re-embeds everything into a new version, builds a new index, evaluates recall and quality, and swaps the alias."
technologies: ["CDC or event stream for source changes", "Queue or Kafka for embedding work", "Embedding workers (GPU inference service or hosted embedding API)", "Lakehouse table as the embedding store of record", "Vector index (pgvector, OpenSearch k-NN, or a dedicated vector database)", "Orchestrator for full re-embedding and index builds", "Evaluation jobs (exact search on samples, offline relevance sets)"]
tradeoffs:
  - decision: "Lakehouse table as system of record, vector index as a derived serving copy"
    alternative: "Vector database as the only store"
    reason: "Embeddings are expensive to recompute; a durable, versioned table allows rebuilding indexes, switching vendors and offline analysis"
    consequence: "Two copies to keep consistent, with the index rebuilt or upserted from the table"
  - decision: "Embed only items whose input hash changed"
    alternative: "Re-embed on every update event"
    reason: "Many updates (price, stock) do not change the text or image being embedded"
    consequence: "The exact embedding input must be defined and hashed consistently"
  - decision: "Blue-green index per model version behind an alias"
    alternative: "Upgrade vectors in place in one index"
    reason: "Vectors from different models are not comparable; in-place upgrades mix spaces during the migration"
    consequence: "Double index cost during migration; queries must use the matching model version"
  - decision: "HNSW for low-latency, high-recall serving"
    alternative: "IVF-style indexes, or exact search"
    reason: "Graph indexes give a good speed-recall trade-off for online queries"
    consequence: "Higher memory and slower builds than IVF; very large corpora may need quantisation"
  - decision: "Quantised or half-precision vectors with re-ranking for the largest corpus"
    alternative: "Full float32 everywhere"
    reason: "Cuts index memory several times while re-ranking candidates with full vectors protects recall"
    consequence: "Extra re-ranking step and more tuning"
interviewFollowUps:
  - "Why can't you query an index built with model v1 using a query embedded with model v2?"
  - "How do you re-embed 200 million items without downtime, and how long does it take?"
  - "How do you know your ANN index's recall, and what parameters trade recall for latency?"
  - "A filter matches 1% of items and results come back almost empty. Why?"
  - "When would you choose pgvector over a dedicated vector database, or the reverse?"
  - "How do you handle deletions in an HNSW index?"
related:
  - "system-designs:llm-rag-data-ingestion-pipeline"
  - "system-designs:search-indexing-pipeline"
  - "system-designs:change-data-capture-platform"
  - "articles:spark/partitions-shuffles-skew"
  - "articles:delta-lake/data-lakes-lakehouse-delta"
versionContext: "Index facts (HNSW versus IVFFlat trade-offs, ef_search and probes parameters, filtering after approximate index scans, vector, halfvec and bit dimension limits, binary quantisation with re-ranking) were checked against the pgvector README; OpenSearch vector search against its documentation source. The recall simulation is plain Python run with Python 3 via scripts/verify-examples.py on random data. Vector database products change quickly; check current documentation for limits and features."
sources:
  - { label: "pgvector README (HNSW, IVFFlat, filtering, quantisation)", url: "https://github.com/pgvector/pgvector" }
  - { label: "OpenSearch documentation source: vector search", url: "https://github.com/opensearch-project/documentation-website/blob/main/_vector-search/index.md" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
next: "system-designs:data-sla-freshness-monitoring-system"
previous: "system-designs:llm-rag-data-ingestion-pipeline"
---

## Approach

An embeddings platform is a data pipeline with an unusual output: dense vectors whose meaning depends entirely on the model that produced them. The key engineering problems are **keeping vectors in sync** with source data cheaply, **versioning models** so spaces are never mixed, **re-indexing** without downtime, choosing and **measuring** an approximate index, and **cost** (GPU or API time, and index memory). Present vector databases as tools with trade-offs, not as magic.

Clarifying questions:

- **Use cases**: semantic search, recommendations, deduplication, RAG? Each has different latency, recall and freshness needs.
- **Inputs**: text, images, behaviour sequences? Who owns the embedding models?
- **Scale**: items per corpus, change rate, query rate, dimension of the chosen models.
- **Filtering needs**: by category, tenant, permissions, availability?
- **Model upgrade frequency** and the budget for full re-embedding.
- **Existing stack**: is PostgreSQL, a search engine or a lakehouse already in place?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Sources</strong>: catalogue, documents or user activity publish changes through CDC or events.</li>
<li><strong>Change detection</strong>: build the exact embedding input (for example title + description + category), hash it, and enqueue only items whose hash changed or that were deleted.</li>
<li><strong>Embedding workers</strong>: batch items, call the model (GPU service or hosted API) and write vectors with model id, version and input hash.</li>
<li><strong>Embedding store</strong>: a lakehouse table partitioned by model version, the system of record for all vectors.</li>
<li><strong>Index builder</strong>: bulk-builds an ANN index per model version from the store; a streaming upserter applies fresh changes and deletes to the live index.</li>
<li><strong>Serving</strong>: queries are embedded with the same model version and sent to the index behind an alias; filters and re-ranking are applied.</li>
<li><strong>Evaluation</strong>: scheduled jobs compare ANN results with exact search on samples (recall) and run offline relevance sets per use case.</li>
</ol>
<figcaption>Vectors are computed once per input and model version, stored durably, and served from rebuildable indexes.</figcaption>
</figure>

## Data model

| Column | Purpose |
|---|---|
| `item_id` | Key from the source |
| `model_name`, `model_version` | Which space the vector belongs to |
| `input_hash` | Hash of the exact text or image bytes embedded |
| `embedding` | Array of floats (or half precision) |
| `dim` | Dimension, validated against the model |
| `created_at`, `source_updated_at` | Freshness and debugging |
| `attributes` | Filterable metadata copied for the index (category, tenant, availability) |

Partition the table by model version (and by corpus); deletions are tombstones until the index has applied them.

## Change detection and freshness

- Most source updates do not change the embedding input (price, stock, view counts). Hashing the input avoids paying to embed identical text again; the cache key `(model_version, input_hash)` also deduplicates identical items.
- Streaming path: changed items reach the queue within seconds, workers batch them (larger batches use GPUs and APIs more efficiently), and the upserter writes to the live index.
- Batch path: nightly reconciliation compares the store with the index (counts, sampled ids, deleted items) and repairs drift.
- Deletions and access restrictions bypass the embedding queue and go straight to the index.

## Model versioning and re-indexing

A new embedding model creates a **new vector space**. Similarities between a v1 vector and a v2 vector are meaningless, so:

1. Register `model_version = v2` and its dimension.
2. **Backfill**: re-embed the whole corpus into the store under v2 (a large batch job, rate-limited for APIs or scheduled on GPU capacity).
3. **Dual-write**: while the backfill runs, changes are embedded with both v1 (for the live index) and v2.
4. **Build** the v2 index from the store, then apply the dual-written changes.
5. **Evaluate** v2 against v1 on offline relevance sets and, if possible, an online experiment.
6. **Switch** the alias and the query embedder together, so queries and index always use the same version.
7. Retire v1 after a rollback window.

Small changes count as new versions too: a different input template (adding the category to the text), normalisation, or truncation length all change the vectors.

## Choosing an ANN index

Exact nearest-neighbour search compares the query with every vector, which is too slow for large corpora at high query rates. Approximate indexes trade some recall for speed:

| Index | Idea | Strengths | Costs |
|---|---|---|---|
| HNSW (graph) | Multi-layer proximity graph walked greedily | Excellent speed-recall trade-off; no training step | More memory, slower builds; deletes leave graph holes until rebuild or repair |
| IVF (inverted lists) | Cluster vectors; search only the closest clusters | Faster builds, less memory | Lower recall at the same speed; needs representative training data for clusters |
| Quantisation (PQ, scalar, binary) | Compress vectors | Several times less memory | Lower precision; re-rank candidates with full vectors |
| Exact (flat) | Compare with everything | Perfect recall; simple | Only for small corpora or heavily pre-filtered sets |

The pgvector documentation summarises the first two well: HNSW has better query performance (speed-recall) but slower builds and more memory; IVFFlat builds faster and uses less memory but has lower query performance. Both expose a query-time knob (`hnsw.ef_search`, `ivfflat.probes`) that buys recall with latency.

### Measuring recall

Recall@k is the share of the true k nearest neighbours (from exact search) that the approximate search returns. A self-contained illustration with an IVF-style index on random 16-dimensional unit vectors:

```python
import math, random

random.seed(7)
DIM, N, LISTS, K = 16, 2000, 20, 10

def unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]

def dot(a, b):
    return sum(x * y for x, y in zip(a, b))

vectors = [unit([random.gauss(0, 1) for _ in range(DIM)]) for _ in range(N)]
queries = [unit([random.gauss(0, 1) for _ in range(DIM)]) for _ in range(30)]

centroids = random.sample(vectors, LISTS)
lists = {i: [] for i in range(LISTS)}
for idx, v in enumerate(vectors):
    lists[max(range(LISTS), key=lambda c: dot(v, centroids[c]))].append(idx)

def exact_top_k(q):
    return set(sorted(range(N), key=lambda i: -dot(q, vectors[i]))[:K])

def ivf_top_k(q, probes):
    nearest_lists = sorted(range(LISTS), key=lambda c: -dot(q, centroids[c]))[:probes]
    candidates = [i for c in nearest_lists for i in lists[c]]
    return set(sorted(candidates, key=lambda i: -dot(q, vectors[i]))[:K]), len(candidates)

truth = [exact_top_k(q) for q in queries]
for probes in (1, 3, 8):
    hits, scanned = 0, 0
    for q, t in zip(queries, truth):
        found, n = ivf_top_k(q, probes)
        hits += len(found & t)
        scanned += n
    print(f"probes={probes}: recall@{K}={hits / (K * len(queries)):.2f}, "
          f"vectors scanned per query={scanned // len(queries)} of {N}")
```

```text
probes=1: recall@10=0.29, vectors scanned per query=102 of 2000
probes=3: recall@10=0.62, vectors scanned per query=312 of 2000
probes=8: recall@10=0.91, vectors scanned per query=826 of 2000
```

Scanning more clusters raises recall and cost together. Uniformly random vectors are a hard case with no natural clusters; real embeddings usually cluster, so recall at a given probe count is typically better, which is exactly why you must **measure on your own data** rather than trust defaults or vendor benchmarks. Run this comparison continuously on a sample of real queries in production, because recall drifts as data changes.

## Filtering

Most real queries have filters (in stock, region, tenant, permissions). With approximate indexes, filters are often applied **after** the candidate set is found: the pgvector README notes that with a filter matching 10% of rows and the default `hnsw.ef_search` of 40, only about 4 rows survive on average. Options: iterative index scans (scan further until enough rows match), partial indexes for a few common filter values, partitioning by a high-level filter (tenant, language), raising the candidate count, or engines with filter-aware graph traversal. Measure recall **per filter segment**.

## Vector store choices

| Option | Fits when | Watch out for |
|---|---|---|
| pgvector in PostgreSQL | Millions to tens of millions of vectors, you already run PostgreSQL, you want SQL joins and transactions with your data | Index dimension limits (2,000 for `vector`, 4,000 for `halfvec`, per the README), memory for HNSW builds, scaling beyond one large node |
| Search engine with vector support (for example OpenSearch k-NN) | Hybrid keyword plus vector search, existing search infrastructure | Cluster sizing for memory-resident graphs; mapping and shard design |
| Dedicated vector database | Very large corpora, high query rates, advanced filtering, multi-tenancy features | Another system to operate (or a managed service bill); data still needs a system of record |
| Warehouse or lakehouse vector functions | Batch similarity jobs, analytics, moderate interactive latency | Usually not tuned for thousands of low-latency queries per second |

There is no universal winner; choose by scale, latency, filtering needs, operational skills and what you already run, and keep the embedding store separate so you can change your mind.

## Ingestion, backpressure and cost

- **Hosted APIs** have rate limits and per-token pricing; batch requests, retry with backoff, and track spend per corpus.
- **Self-hosted GPU** inference is cheaper at sustained high volume but needs capacity planning; full re-embeds are scheduled jobs that borrow capacity off-peak.
- Index memory: count × dimension × bytes per value, plus index structure overhead. Half precision halves vector memory; binary quantisation shrinks it much further at the cost of needing re-ranking.
- Do not store vectors you do not serve: expire old model versions after the rollback window.

## Security and governance

- Embeddings can leak information about their inputs (similar texts produce similar vectors, and inversion attacks exist), so treat vectors with the same classification as the source data.
- Deletion and erasure requests apply to vectors and every index copy, including old model versions still retained.
- Tenant isolation: separate indexes or strict tenant filters; test that one tenant's queries never return another's items.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Query embedded with a different model version than the index | Nonsense results | Alias binds index and query model version together; reject mismatches |
| Embedding workers fall behind | Stale vectors for changed items | Queue depth alerts; autoscale workers; prioritise high-traffic items |
| Index node lost | Capacity or availability drop | Replicas; rebuild from the embedding store |
| Recall drops after data growth | Worse results, unnoticed | Continuous recall sampling; retune parameters or rebuild |
| Many deletes degrade an HNSW graph | Lower recall, wasted memory | Periodic rebuild or vacuum from the store |

## Monitoring and SLAs

- Freshness: time from source change to index update; queue depth.
- Query latency p50 and p95, queries per second, error rate.
- Recall@k against exact search on sampled queries, per use case and filter segment.
- Embedding cost per day and per corpus; index memory per node.

## Scaling to 10×

At 2 billion items: shard indexes by a natural key (tenant, category, language) or by hash with scatter-gather queries; use quantisation with re-ranking to keep indexes in memory; split the embedding store by corpus and version; and run re-embeds as multi-week, resumable programmes with partial switch-overs per shard.

## Capacity estimate

Assumptions: 200 million items, 768 dimensions, float32 (4 bytes), 2 million changes a day of which 40% change the embedding input, embedding throughput assumed at 5,000 items per second across the worker fleet.

- **Raw vectors**: 200 × 10⁶ × 768 × 4 B ≈ 614 GB. Half precision ≈ 307 GB; binary quantisation (1 bit per dimension) ≈ 19 GB for the index, keeping full vectors on disk for re-ranking.
- **HNSW**: graph links add memory on top of the vectors (measure for your engine and parameters); at this size a sharded, replicated cluster is needed, or quantisation.
- **Daily re-embedding**: 2 million × 40% = 800,000 items ≈ 160 seconds of fleet time at 5,000 items/s: easy.
- **Full re-embed for a model upgrade**: 200 million / 5,000 per second ≈ 40,000 s ≈ 11 hours of fleet time, plus index build time; plan for a few days end to end including evaluation.
- **Queries**: 3,000 per second; with HNSW, each query visits a few hundred to a few thousand vectors depending on `ef_search`, so a handful of replicas per shard handle it.

## What a strong answer includes

- Input hashing so only changed inputs are embedded, with deletes on a fast path.
- A durable, versioned embedding store separate from the serving index.
- Model versioning and blue-green re-indexing with dual-writing and evaluation.
- A reasoned ANN index choice with the recall-latency knobs, and continuous recall measurement.
- Awareness of filtering pitfalls with approximate indexes.
- A memory and throughput estimate, and quantisation as a scaling lever.

## Common mistakes

- Mixing vectors from different models or input templates in one index.
- Re-embedding on every update event, including ones that do not change the input.
- Treating the vector database as the only copy of expensive embeddings.
- Trusting default index parameters or published benchmarks without measuring recall on your data.
- Ignoring filtered-query recall.
- Forgetting deletions, so removed items keep appearing in results.

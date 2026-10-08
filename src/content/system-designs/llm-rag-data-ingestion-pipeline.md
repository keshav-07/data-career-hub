---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design an LLM RAG Data Ingestion Pipeline"
seoTitle: "Design a RAG Data Ingestion Pipeline"
description: "A system-design case study for RAG data: connectors, parsing, chunking, permissions, incremental re-embedding, hybrid indexes and retrieval evaluation."
technology: ["data-engineering", "python"]
topic: ["ml-data", "llm", "rag", "architecture"]
tags: ["rag", "chunking", "embeddings", "access-control", "hybrid-search", "incremental-ingestion"]
difficulty: "Advanced"
problem: "Design the ingestion pipeline behind an internal assistant that answers employees' questions using company documents (wiki pages, shared drives, PDFs, support tickets, policies), so that retrieved passages are relevant, current, and never shown to someone who could not open the original document."
functionalRequirements:
  - "Connect to document sources and sync new, changed and deleted documents incrementally"
  - "Parse many formats (HTML, Markdown, PDF, office documents, ticket threads) into clean text with structure"
  - "Split documents into retrievable chunks with titles, headings and source metadata"
  - "Compute embeddings with a versioned model and store them with keyword indexes for hybrid search"
  - "Carry each document's access permissions to its chunks and enforce them at query time"
  - "Evaluate retrieval quality and freshness continuously"
nonFunctionalRequirements:
  - "Edits searchable within 15 minutes; deletions and permission removals effective within 5 minutes"
  - "No chunk returned to a user without permission to read its source document"
  - "Re-embedding the whole corpus with a new model possible without downtime"
  - "Embedding cost proportional to changed content, not corpus size"
  - "Personal and secret data handled according to policy (redaction or exclusion)"
scaleAssumptions:
  - "Assumption: 5 million documents across 6 sources, averaging 2,000 words"
  - "Assumption: about 50,000 document changes a day"
  - "Assumption: chunks of roughly 300 to 500 tokens, so about 30 to 40 million chunks"
  - "Assumption: 20,000 employees, a few hundred queries per minute at peak"
architectureSummary: "Source connectors poll or receive change notifications and write document versions with metadata and access lists to a raw document store. A processing pipeline parses, cleans, deduplicates and splits documents into structure-aware chunks, hashing each chunk so only changed chunks are re-embedded. An embedding service with a pinned model version writes vectors; an index stores vectors, text for keyword search, metadata and permission principals. Retrieval combines vector and keyword results, filters by the user's groups, and reranks; deletions and permission changes take a fast path."
technologies: ["Source connectors (wiki, drive, ticketing APIs) with change feeds or webhooks", "Object storage or lakehouse for raw documents and versions", "Document parsing and OCR libraries", "Orchestrator or stream processor for the pipeline", "Embedding model service (hosted API or self-hosted)", "Vector-capable search index (for example pgvector, OpenSearch or a dedicated vector database)", "Identity provider for group membership", "Evaluation datasets and monitoring"]
tradeoffs:
  - decision: "Structure-aware chunking (by headings and paragraphs) with small overlap"
    alternative: "Fixed-size chunks ignoring structure"
    reason: "Chunks align with meaning, carry their heading as context, and edits only change the affected section"
    consequence: "Parsers must recover structure, which is hard for some PDFs"
  - decision: "Hybrid retrieval (vector plus keyword) with reranking"
    alternative: "Vector search only"
    reason: "Keyword search catches exact terms (error codes, product names) that embeddings blur; reranking improves the final ordering"
    consequence: "Two indexes and a fusion step to maintain"
  - decision: "Permissions stored on chunks and filtered at query time"
    alternative: "Separate index per user group"
    reason: "One index serves everyone; permission changes update metadata, not content"
    consequence: "Filtering must be efficient and correct, and group membership must be fresh"
  - decision: "Content hashes per chunk for incremental re-embedding"
    alternative: "Re-embed whole documents on any change"
    reason: "Most edits touch a small part of a document; embedding cost and latency drop"
    consequence: "Chunk identity must be stable across edits"
  - decision: "Embedding model version pinned per index, with blue-green re-indexing"
    alternative: "Upgrade the model in place"
    reason: "Vectors from different models are not comparable; mixing them silently breaks retrieval"
    consequence: "A full re-embedding and a second index during migration"
interviewFollowUps:
  - "A document's access is restricted after it was indexed. How fast does that take effect, and how?"
  - "How do you choose chunk size, and how would you know it is wrong?"
  - "Why can't you mix embeddings from two different models in one index?"
  - "How do you handle a 300-page PDF with tables and scanned pages?"
  - "How do you evaluate whether a pipeline change improved retrieval?"
  - "A malicious page contains instructions aimed at the language model. What can the ingestion pipeline do about it?"
related:
  - "system-designs:vector-embeddings-pipeline"
  - "system-designs:search-indexing-pipeline"
  - "system-designs:schema-registry-contract-system"
  - "articles:python/iterators-generators"
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "articles:etl-elt/idempotency-in-data-pipelines"
versionContext: "Vector-store facts (pgvector index types, dimension limits, filtering after approximate index scans, hybrid search with full-text search) were checked against the pgvector README; chunking parameters against the OpenSearch text-chunking processor documentation source. The chunking and change-detection example is plain Python run with Python 3 via scripts/verify-examples.py. Tooling in this space changes quickly; check current documentation for the products you choose."
sources:
  - { label: "pgvector README (indexing, filtering, hybrid search)", url: "https://github.com/pgvector/pgvector" }
  - { label: "OpenSearch documentation source: text chunking", url: "https://github.com/opensearch-project/documentation-website/blob/main/_vector-search/ingesting-data/text-chunking.md" }
  - { label: "OpenSearch documentation source: text chunking processor", url: "https://github.com/opensearch-project/documentation-website/blob/main/_ingest-pipelines/processors/text-chunking.md" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
next: "system-designs:vector-embeddings-pipeline"
previous: "system-designs:self-serve-analytics-platform"
---

## Approach

Retrieval-augmented generation (RAG) answers questions by retrieving relevant passages and giving them to a language model as context. The model's answer can only be as good, current and safe as what is retrieved, so the **ingestion pipeline is most of the system**. Treat it like any production data pipeline: sources, change capture, parsing, transformation, indexing, quality and access control. Avoid the hype; the interviewer wants to see that you know where these systems actually fail: stale or deleted content still being served, permission leaks, poor chunking, mixed embedding versions and no evaluation.

Clarifying questions:

- **Sources and formats**: which systems, how many documents, how much is scanned PDF or spreadsheets?
- **Permissions**: does every source expose access lists? Are permissions per document, per space, per row?
- **Freshness**: how quickly must edits, deletions and permission changes take effect?
- **Users and questions**: who asks what? Policy lookups, troubleshooting, code questions? This shapes chunking and retrieval.
- **Constraints**: data that must never be indexed (secrets, HR cases), residency, model hosting rules (can documents be sent to a hosted embedding API?).
- **Success measure**: how will we know retrieval is good?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Connectors</strong>: per source, sync documents incrementally via change feeds, webhooks or modified-since polling, and capture deletions and access lists.</li>
<li><strong>Raw store</strong>: each document version is stored with source id, URL, title, author, timestamps, access principals and a content hash.</li>
<li><strong>Parse and clean</strong>: extract text and structure (headings, lists, tables), OCR scanned pages, strip boilerplate (navigation, signatures), detect language.</li>
<li><strong>Filter and redact</strong>: exclude classified sources, detect secrets and personal data, deduplicate exact and near-duplicate documents.</li>
<li><strong>Chunk</strong>: split by structure into chunks of a target token size with small overlap; prefix each chunk with document title and heading path; hash each chunk.</li>
<li><strong>Embed</strong>: only new or changed chunks go to the embedding service, with the model name and version recorded.</li>
<li><strong>Index</strong>: upsert vectors, chunk text (for keyword search), metadata and permission principals; delete chunks that no longer exist.</li>
<li><strong>Retrieve</strong>: at query time, vector and keyword search with a permission filter, fusion, reranking, and source links returned with every passage.</li>
<li><strong>Evaluate and monitor</strong>: golden question sets, freshness, coverage and failure dashboards.</li>
</ol>
<figcaption>A normal incremental data pipeline whose output is chunks, vectors and permissions instead of rows.</figcaption>
</figure>

## Connectors and change capture

- Prefer **change feeds or webhooks** where sources offer them; fall back to modified-since polling with a watermark and an overlap window.
- **Deletions** are the most often forgotten case. Polling cannot see a deleted document, so run a periodic **full listing** per source and delete anything indexed but no longer listed.
- **Permission changes** may not change the document's modified time. Sync access lists separately and more often than content.
- Respect source API rate limits; backfills of millions of documents need throttling and resumable checkpoints.

## Parsing and cleaning

- Keep **structure**: headings, list items, tables (as Markdown-like text or row-wise sentences), code blocks. Structure drives chunking and gives the model context.
- Scanned PDFs need OCR; record OCR confidence, and treat low-confidence pages as lower quality.
- Remove boilerplate repeated on every page (menus, footers, disclaimers), which otherwise dominates similarity.
- **Deduplicate**: exact duplicates by content hash; near-duplicates (copies of the same policy in several spaces) by similarity hashing. Keep the canonical source, so answers cite one authoritative copy.

## Chunking

Chunking decides what the retriever can find. Options:

| Strategy | How | Good for | Weakness |
|---|---|---|---|
| Fixed size | Every N tokens, optional overlap | Uniform text, quick start | Cuts sentences and sections mid-thought |
| Delimiter or recursive | Split on paragraphs, then sentences, until under the size limit | Most prose | Ignores document hierarchy |
| Structure-aware | Split by headings and sections, then pack paragraphs | Wikis, policies, manuals | Needs good parsing |
| Semantic | Split where embedding similarity between sentences drops | Long unstructured text | More compute, harder to make stable |

Practical guidance: target a few hundred tokens per chunk, use a small overlap (search platforms such as OpenSearch expose an overlap rate parameter; its documentation suggests 0 to 0.2 to improve accuracy), and **prefix each chunk with the document title and heading path** so a chunk saying "the limit is 30 days" still knows it is about refunds. Tune size on your evaluation set rather than by rule of thumb; it depends on the embedding model and on question types.

### Stable chunk ids and incremental re-embedding

A structure-aware chunker that gives each chunk a stable id (document, section, ordinal) and a content hash lets an edit re-embed only what changed:

```python
import hashlib

def chunk(doc_id, text, max_words=20, overlap_words=5):
    """Split on headings, then pack paragraphs into chunks of at most max_words words,
    repeating the last overlap_words words of a chunk at the start of the next one."""
    chunks, section = [], "intro"
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    words = []

    def flush():
        if words:
            body = " ".join(words)
            chunks.append({
                "chunk_id": f"{doc_id}#{section}#{sum(c['section'] == section for c in chunks)}",
                "section": section,
                "text": body,
                "hash": hashlib.sha256(body.encode()).hexdigest()[:12],
            })

    for block in blocks:
        if block.startswith("#"):
            flush(); words = []
            section = block.lstrip("# ").lower().replace(" ", "-")
            continue
        for w in block.split():
            if len(words) >= max_words:
                flush(); words = words[-overlap_words:]
            words.append(w)
    flush()
    return chunks

v1 = """# Refund policy

Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method and usually arrive within 5 to 10 business days, depending on the bank.

# Exchanges

Items can be exchanged once for a different size or colour if they are unused and in the original packaging."""

v2 = v1.replace("within 30 days", "within 45 days")

old = {c["chunk_id"]: c["hash"] for c in chunk("policy-17", v1)}
for c in chunk("policy-17", v2):
    status = "unchanged" if old.get(c["chunk_id"]) == c["hash"] else "re-embed"
    print(c["chunk_id"], len(c["text"].split()), "words", status)
```

```text
policy-17#refund-policy#0 20 words re-embed
policy-17#refund-policy#1 16 words unchanged
policy-17#exchanges#0 20 words unchanged
```

Changing "30 days" to "45 days" re-embeds one chunk out of three. Word counts stand in for tokens here (real pipelines count tokens with the embedding model's tokenizer), and the 5-word overlap is why the second chunk is 16 words although only 11 new words remain. A limitation to mention: inserting a paragraph shifts every later chunk **within that section**, so their hashes change too. Structure-aware ids confine the damage to one section instead of the whole document. Chunks whose ids disappear (a deleted section) must be deleted from the index.

## Embeddings and versioning

- Record **model name, version and dimension** with every vector and on the index itself. Vectors from different models (or different versions of one model) live in different spaces; comparing them gives meaningless similarities.
- A model upgrade is a **re-index**: build a new index with the new model in the background (blue-green), evaluate it, then switch queries over and retire the old one. The [vector embeddings pipeline](/data-engineering/system-design/vector-embeddings-pipeline/) covers this in depth.
- The query must be embedded with the **same** model as the index.
- Batch embedding calls, cache by chunk hash (identical text never needs embedding twice), and handle API rate limits with backoff.

## Index and retrieval

- Store per chunk: vector, chunk text, title, heading path, source URL, document id and version, timestamps, language, **permission principals** (users and groups allowed), and embedding model version.
- **Hybrid retrieval**: run vector similarity and keyword (BM25-style) search, then fuse results (for example with reciprocal rank fusion) and rerank the top candidates with a cross-encoder or similar model. Keyword search rescues exact identifiers that embeddings often miss.
- **Filtering pitfall**: with approximate vector indexes, filters may be applied after the index scan. The pgvector documentation gives an example: if a filter matches 10% of rows and the HNSW search returns its default 40 candidates, only about 4 survive the filter; it recommends iterative index scans, partial indexes or partitioning. Permission filters are exactly this kind of filter, so test recall per user group, not just globally.
- Return **source links** with every passage so users can verify.

## Permissions and security

- Map each source's access model to a common form: a list of principals (user ids and group ids) per document, inherited by its chunks.
- At query time, resolve the user's groups from the identity provider (cached briefly) and filter on principals **inside** the retrieval query. Never retrieve first and filter in application code after selecting the top results; that leaks through counts and loses recall.
- **Fast path for revocations and deletions**: permission and delete events bypass the parsing and embedding queue and update index metadata directly within minutes.
- Exclude or redact secrets (keys, passwords) and sensitive personal data before indexing; once text is in an index and in model prompts, it is hard to contain.
- **Prompt injection**: documents can contain text that tries to instruct the model. Ingestion cannot solve this fully, but it can flag suspicious patterns, record source trust levels, and keep provenance so the application can treat retrieved text as data, not instructions.

## Late data, freshness and schema evolution

- Freshness SLA per source: track time from source edit to index availability.
- Version every stage's logic (parser version, chunker version, embedding model). A parser fix may require reprocessing all documents of one format; record which versions produced each chunk so reprocessing can be targeted.
- Source schema changes (a connector API version) are handled like any connector upgrade, with tests on sample documents.

## Data quality and evaluation

- **Ingestion quality**: parse failure rate by format, empty or tiny chunks, OCR confidence, duplicate rate, share of documents with missing permissions (which should block indexing, not default to public).
- **Retrieval evaluation**: a curated set of questions with known relevant passages; measure recall@k and ranking quality after every pipeline change (chunk size, parser, model). Add questions from real user feedback.
- **Freshness checks**: sample recently edited documents and confirm the index holds the new version.
- **Answer-level evaluation** (groundedness, citation correctness) belongs to the application, but depends on these retrieval metrics.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Deleted document still indexed | Outdated or removed content served | Periodic full listing reconciliation; delete events on a fast path |
| Permission sync lag | User sees content they lost access to | Separate, frequent permission sync; alert on lag |
| Parser breaks on a new PDF generator | Empty or garbled chunks | Parse-quality metrics by source and format; quarantine; reprocess after fix |
| Embedding API outage | New content not searchable | Queue changed chunks; retry; serve existing index |
| Mixed embedding versions | Silent retrieval degradation | Model version on index and chunks; refuse writes with a mismatched version |
| Chunking change lowers quality | Worse answers | Evaluation gate before switching indexes |

## Monitoring and SLAs

- Freshness: edit-to-index latency per source; deletion and permission-change latency.
- Pipeline throughput and backlog; embedding cost per day.
- Retrieval metrics on the evaluation set per release; zero-result and low-score query rates in production.
- Permission-filter correctness tests run continuously with synthetic users.

## Cost

Embedding is usually the largest variable cost. Embed only changed chunks, cache by hash, deduplicate before embedding, and batch requests. Index memory is the next cost: vector size × count. Choose dimensions and precision deliberately (half-precision or quantised vectors trade a little recall for much less memory). Re-embedding the whole corpus for a model change is a planned, budgeted event.

## Scaling to 10×

At 50 million documents and 400 million chunks: shard the index (by source or tenant), use quantisation to keep indexes in memory, move parsing and embedding to autoscaled workers fed by a queue, and prioritise fresh and frequently accessed content for re-embedding. Evaluation sets grow per domain.

## Capacity estimate

Assumptions: 5 million documents × 2,000 words ≈ 10 billion words ≈ 13 billion tokens (about 1.3 tokens per word, a rough rule for English); chunks of 400 tokens; 1,024-dimension float32 embeddings (dimension depends on the model chosen); 50,000 changed documents a day, with about 20% of each changed document's chunks actually changing.

- **Chunks**: 13 × 10⁹ / 400 ≈ 33 million chunks (overlap adds a little).
- **Vector storage**: 33 × 10⁶ × 1,024 × 4 bytes ≈ 135 GB of raw vectors; an HNSW graph adds overhead; half precision halves the vector part.
- **Text and metadata**: 13 billion tokens ≈ 50 GB of text, plus metadata.
- **Initial embedding**: 13 billion tokens through the embedding service; at an assumed sustained throughput of 1 million tokens per second across workers, about 3.6 hours. Hosted APIs are priced per token, so estimate cost from your provider's current price list rather than a fixed number.
- **Daily incremental**: 50,000 docs × ~7 chunks per doc × 20% changed ≈ 70,000 chunks ≈ 28 million tokens a day, a tiny fraction of a full re-embed. Without chunk hashing, re-embedding whole changed documents would be about 5 times more.

## What a strong answer includes

- Incremental connectors that capture changes, deletions and permission changes, with full-listing reconciliation.
- Structure-preserving parsing, cleaning, deduplication and redaction before indexing.
- A justified chunking strategy with heading context, overlap, stable ids and content hashes.
- Embedding model versioning and blue-green re-indexing.
- Hybrid retrieval with reranking, and permission filtering inside the retrieval query, aware of approximate-index filtering pitfalls.
- An evaluation set and freshness metrics that gate pipeline changes.

## Common mistakes

- Treating RAG as "embed everything once".
- Forgetting deletions and permission revocations.
- Filtering permissions after retrieval in application code.
- Fixed-size chunks with no title or heading context.
- Mixing vectors from different embedding models.
- Changing chunking or models without an evaluation set to measure the effect.

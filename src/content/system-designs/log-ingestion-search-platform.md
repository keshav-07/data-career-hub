---
title: "Design a Log Ingestion and Search Platform"
description: "A system-design case study for centralised logging: agents, Kafka buffering, parsing and redaction, lifecycle-tiered indexing, archive search and cost control."
technology: ["data-engineering", "kafka", "cloud"]
topic: ["logging", "observability", "search"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
problem: "A company runs 3,000 services on Kubernetes and VMs across two regions, producing about 20 TB of logs a day. Engineers need to search recent logs within seconds during incidents, security needs a year of audit logs, and the current logging bill grows faster than traffic. Design a log ingestion and search platform that collects, parses, redacts, indexes and retains logs reliably and affordably."
functionalRequirements:
  - "Collect application, container, system and audit logs from every host and cluster"
  - "Parse and normalise logs into structured fields; enrich with service, environment and trace ids"
  - "Redact secrets and personal data before storage"
  - "Full-text and field search over recent logs with results in seconds; live tail during incidents"
  - "Retain logs in tiers: hot for days, cheaper for weeks, archive for a year or more"
  - "Feed alerts (error-rate spikes, security rules) and export to the security team's tools"
nonFunctionalRequirements:
  - "Logs searchable within 30 seconds of being written at p95"
  - "No log loss when the search cluster is slow or down; backpressure must not crash applications"
  - "Search over the last 24 hours returns in under 5 seconds for typical queries"
  - "Per-team isolation and cost attribution"
  - "Storage and compute cost per GB ingested falling over time"
scaleAssumptions:
  - "Assumption: 20 TB/day raw logs, about 230 MB/s on average and 600 MB/s at peak"
  - "Assumption: average log line 500 bytes, so roughly 40 billion lines per day"
  - "Assumption: 7 days on local disks (hot, then warm), searchable snapshots (cold, then frozen) up to 90 days, 13 months in the archive (audit logs longer)"
  - "Assumption: 2,000 engineers, a few hundred concurrent searches during a major incident"
architectureSummary: "Lightweight agents (Fluent Bit, Vector or the OpenTelemetry Collector) on every node tail logs, add metadata and ship to Kafka, which buffers and decouples producers from indexing. Stream processors parse, enrich, redact, route and sample. Indexers write to Elasticsearch or OpenSearch data streams with index lifecycle policies moving data from hot to warm to cold or frozen tiers. A parallel sink writes compressed Parquet to object storage as the archive, queryable with Trino or Athena. Alerting runs on the stream; access is controlled per team."
technologies:
  - "Collection agents: Fluent Bit, Vector or OpenTelemetry Collector"
  - "Apache Kafka as the buffer"
  - "Stream processing: Vector or Logstash pipelines, or Flink for heavier logic"
  - "Search: Elasticsearch or OpenSearch with data streams and lifecycle management (Loki or ClickHouse as alternatives)"
  - "Object storage archive in Parquet, queried with Trino or Athena"
  - "Grafana or Kibana / OpenSearch Dashboards for search and dashboards"
tradeoffs:
  - decision: "Kafka between agents and indexers"
    alternative: "Agents write directly to the search cluster"
    reason: "Absorbs spikes and search outages, allows replay and multiple consumers (archive, security, alerting)"
    consequence: "Another system to operate; adds seconds of latency"
  - decision: "Full-text indexing for hot logs"
    alternative: "Label-only indexing (Loki style) with brute-force scans"
    reason: "Fast arbitrary searches during incidents"
    consequence: "Indexing is the main compute and storage cost; keep the hot window short"
  - decision: "Tiered retention with searchable archives"
    alternative: "Keep everything in hot indices"
    reason: "Most searches hit the last day or two; older data is rarely read"
    consequence: "Searches over old data are slower"
  - decision: "Parquet archive in object storage"
    alternative: "Long retention inside the search cluster only"
    reason: "Cheapest durable storage, queryable by SQL engines for investigations and audits"
    consequence: "Archive queries take seconds to minutes, not milliseconds"
  - decision: "Redaction in the pipeline before storage"
    alternative: "Rely on developers not to log secrets"
    reason: "A safety net for the mistakes that always happen"
    consequence: "Pattern-based redaction costs CPU and can miss or over-redact"
interviewFollowUps:
  - "The search cluster is down for an hour. What happens to logs and to the applications producing them?"
  - "How do you stop one noisy service from blowing the logging budget?"
  - "Why might a field mapping explosion take down the cluster, and how do you prevent it?"
  - "Security needs to search 11 months back for an IP address. How?"
  - "Elasticsearch, Loki or ClickHouse for this workload?"
  - "How do you make sure secrets and personal data never become searchable?"
related:
  - "system-designs:kafka-ingestion-system"
  - "system-designs:data-observability-system"
  - "system-designs:gdpr-pii-compliant-pipeline"
  - "articles:kafka/kafka-real-time-data-engineering"
  - "articles:delta-lake/json-vs-parquet"
previous: "system-designs:iot-sensor-data-pipeline"
next: "system-designs:real-time-analytics-pipeline"
versionContext: "Design discussion; the lifecycle policy JSON is illustrative and was not executed."
sources:
  - { label: "Elastic: data tiers (hot, warm, cold, frozen)", url: "https://www.elastic.co/docs/manage-data/lifecycle/data-tiers" }
  - { label: "Elastic: index lifecycle management phases and actions", url: "https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/index-lifecycle" }
  - { label: "Elastic: searchable snapshot action", url: "https://www.elastic.co/docs/reference/elasticsearch/index-lifecycle-actions/ilm-searchable-snapshot" }
  - { label: "Elastic: managing time series data", url: "https://www.elastic.co/docs/manage-data/use-case-use-elasticsearch-to-manage-time-series-data" }
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
---

## Approach

Logging platforms fail in predictable ways: an indexing backlog during the very incident you need logs for, a cost curve that outgrows the business, and secrets or personal data that become searchable by thousands of people. Design for **decoupling, tiering and governance**. Ask:

- **Volume and growth**: GB per day, peak rate, number of sources.
- **Search patterns**: incident debugging over the last hours, security investigations over months, compliance retention?
- **Latency**: how soon after a log is written must it be searchable?
- **Retention requirements** per log type (application, audit, security).
- **Structured or unstructured**: do services log JSON, or free text?
- **Tenancy and cost**: should teams pay for what they log?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Agents</strong> on every node (DaemonSet on Kubernetes) tail files and container output, add host, pod, service and environment metadata, batch, compress and send to Kafka; they buffer to disk if Kafka is unreachable.</li>
<li><strong>Kafka</strong>: topics by log class (application, audit, security), partitioned for throughput, a few days of retention for replay.</li>
<li><strong>Processing</strong>: parse (JSON or patterns), normalise field names, enrich (team ownership, trace id), redact secrets and personal data, apply sampling and drop rules, route.</li>
<li><strong>Indexing</strong>: writers bulk-index into search data streams per tenant or log class; lifecycle policies roll over and move indices through hot, warm, cold and frozen tiers.</li>
<li><strong>Archive</strong>: a sink writes hourly Parquet files to object storage, partitioned by date and service, registered as a table for SQL engines.</li>
<li><strong>Use</strong>: search UI and live tail, saved searches and alerts, security exports, archive queries for investigations.</li>
</ol>
<figcaption>Agents ship to a durable buffer; processing makes logs safe and structured; storage is tiered from fast search to cheap archive.</figcaption>
</figure>

A checkout service starts throwing errors at 14:02. Its pods log JSON lines with a trace id; Fluent Bit tails them, adds pod and service labels, and ships batches to Kafka. The processor redacts a card number that a developer accidentally logged, tags the lines with the owning team, and passes them to the indexer, which bulk-writes them to the hot tier; they are searchable within seconds. The on-call engineer filters by service and error level, jumps to the trace id, and finds the failing dependency. The same lines are in tomorrow's Parquet archive, where the security team can query them for a year.

## Collection

- **Agents** should be light on CPU and memory, because they run on every node: Fluent Bit and Vector are common choices; the OpenTelemetry Collector unifies logs with traces and metrics.
- **Structured logging** (JSON with standard fields: timestamp, level, service, trace id, message) removes most parsing cost and errors. Make it the default in shared libraries.
- **Backpressure**: agents buffer to local disk with a size cap; if the cap is reached they drop the oldest low-priority logs rather than block the application. Logging must never take production down.
- **Multiline** (stack traces) is handled at the agent so one exception is one event.

## Buffering with Kafka

Kafka decouples ingestion from indexing. When the search cluster slows down during an incident (exactly when query load spikes), indexers fall behind but nothing is lost; they catch up from Kafka. Kafka also feeds other consumers: the archive writer, security analytics, and stream alerting. Size retention to cover the longest plausible indexing outage (for example 24–72 hours).

## Processing: parse, enrich, redact, reduce

- **Parse** non-JSON logs with patterns per source; unparseable lines are kept with a `parse_error` flag, not dropped.
- **Normalise** field names to a common schema (for example OpenTelemetry semantic conventions), so `svc`, `service_name` and `app` become one field.
- **Enrich** with ownership and cost centre from a service catalogue.
- **Redact** secrets (keys, tokens, card numbers) and personal data (emails, IPs where not needed) with pattern rules, and report redaction counts to owning teams so they fix the source.
- **Reduce**: drop debug logs in production unless a team opts in, sample repetitive success logs, and aggregate high-volume access logs into metrics. Volume reduction is the biggest cost lever.

## Indexing and the hot tier

- **Data streams** with rollover by size or age keep shard sizes in a healthy range (tens of GB per shard) instead of one index per service per day, which creates too many small shards.
- **Mappings**: define explicit mappings for common fields; map free-form attributes as flattened or keyword-only fields with a field-count limit, to prevent **mapping explosions** (thousands of dynamic fields from one misbehaving service, which bloat cluster state and memory).
- **Bulk indexing** with appropriate refresh intervals: a 5–30 second refresh is enough for logs and costs much less than near-instant refresh.
- **Replicas** in the hot tier for availability; fewer or none in colder tiers that are backed by snapshots.

## Lifecycle and tiers

Most log searches target the last few hours. Index lifecycle management moves data through tiers by age:

```json
{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" } } },
      "warm":   { "min_age": "2d",  "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "cold":   { "min_age": "7d",  "actions": { "searchable_snapshot": { "snapshot_repository": "logs-s3" } } },
      "frozen": { "min_age": "30d", "actions": { "searchable_snapshot": { "snapshot_repository": "logs-s3" } } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}
```

Cold and frozen tiers use searchable snapshots in object storage, so they need fewer local disks and no replicas; frozen indices are only partially cached locally and are slower to query. Beyond the cluster's retention, the **Parquet archive** is the long-term record.

## Alternatives for the search store

| | Elasticsearch / OpenSearch | Grafana Loki | ClickHouse |
|---|---|---|---|
| Indexing | Full-text inverted index on content | Indexes only labels; content scanned at query time | Columnar storage with skip indexes |
| Strengths | Fast arbitrary text search, mature tooling | Very cheap ingestion and storage, object-storage native | Fast aggregations, high compression, SQL |
| Weaknesses | Indexing cost and cluster operations | Slow for needle-in-haystack searches over large ranges | Text search less flexible than an inverted index |
| Fit | Incident search over recent logs | High-volume logs searched mostly by service and time | Analytics on structured logs and events |

Many platforms combine them: full-text search for a short hot window, cheaper stores for long retention.

## Archive and investigations

The archive writer batches logs into hourly Parquet files per service, partitioned by date, and registers them in a catalog. Trino or Athena query them with SQL: "all requests from IP X in the last 11 months" scans only the needed columns and partitions. Lifecycle rules move older archive files to cheaper storage classes. Audit and security logs may be written with object lock for tamper evidence.

## Multi-tenancy and cost control

- **Quotas** per team on ingest volume per day, enforced in the processing tier (excess is sampled or dropped with a notice).
- **Chargeback** of ingest GB and retention per team, published monthly.
- **Per-team retention** choices within platform limits.
- **Access control**: teams see their services' logs; audit and security logs are restricted; personal-data fields are masked for most roles.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Search cluster overloaded during an incident | Indexing lag grows | Kafka buffers; prioritise indexing of error-level and critical services; scale out hot nodes |
| Kafka unavailable | Agents cannot ship | Agents buffer to disk up to a cap; then drop low-priority logs |
| Mapping explosion from one service | Cluster instability | Field limits, flattened attributes, quarantine the offending service's stream |
| Log storm from a bug | Cost spike, lag | Per-service rate limits and dynamic sampling |
| Secret logged and indexed | Security exposure | Redaction rules, delete by query from indices, rotate the secret, fix the source |

## Scaling to 10×

At 200 TB/day, full-text indexing of everything becomes very expensive: index only error and warning levels plus selected services in full text, send the rest straight to the columnar archive or a label-indexed store, and turn high-volume access logs into metrics. Split clusters by region and log class, with cross-cluster search for investigations. Kafka partitions and processing workers scale horizontally.

## Monitoring and SLAs

- Ingest volume per team and service against quota; dropped and sampled volume.
- End-to-end latency (log time to searchable) and Kafka consumer lag for indexers.
- Cluster health: shard counts and sizes, heap and disk usage, indexing rejections.
- Search latency p95 and failures.
- Redaction counts per service, as a signal to fix logging at the source.

## Capacity estimate

- **Volume**: 20 TB/day ≈ 230 MB/s average; peak 600 MB/s.
- **Kafka**: 20 TB/day × 2 days × 3 replicas = 120 TB raw; with producer compression (logs often compress 5–10×) roughly 15–25 TB of disk.
- **Hot and warm tiers** (the first 7 days on local disk): indexed log data often takes space comparable to or larger than the raw size depending on mappings; assume 1.2× raw with one replica: 20 TB × 1.2 × 2 × 7 days ≈ 340 TB. This is why hot retention is short and why volume reduction matters.
- **Reduction**: dropping debug logs and sampling success logs often removes a large share of volume; at an assumed 40% reduction the hot tier falls to about 200 TB.
- **Archive**: Parquet with zstd on logs might reach 10× compression (assumption; measure on your data) ≈ 2 TB/day ≈ 730 TB/year, in cheap object storage tiers.
- **Indexing compute**: plan hot nodes by measured indexing throughput per node in load tests, with headroom for incident query load.

## What a strong answer includes

- **Agents with disk buffering** that never block applications.
- **Kafka as a buffer** that decouples ingestion from indexing and feeds multiple consumers.
- **Parsing, normalisation, redaction and volume reduction** in the pipeline.
- **Data streams, rollover and lifecycle tiers**, with explicit mappings to avoid explosions.
- **A cheap columnar archive** for long retention and investigations.
- **Quotas and chargeback** to control cost.
- A reasoned **search-store choice** with alternatives.

## Common mistakes

- Agents writing straight to the search cluster, losing logs when it is slow.
- Indexing everything in full text for months.
- Dynamic mappings with no field limits.
- One index per service per day, creating tens of thousands of tiny shards.
- No redaction, so passwords and personal data become searchable.
- No quotas, so one debug flag left on in production doubles the bill.

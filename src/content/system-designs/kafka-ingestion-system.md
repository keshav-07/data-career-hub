---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Kafka-Based Data Ingestion System"
seoTitle: "Design a Kafka-Based Ingestion System"
description: "A system-design case study for Kafka ingestion: topic and partition design, schemas, producer and consumer guarantees, connectors, dead-letter handling and operations."
inventoryId: "SYS-07"
technology: ["data-engineering", "kafka"]
topic: ["ingestion", "streaming", "architecture"]
difficulty: "Intermediate"
problem: "Design a shared ingestion platform where many services publish events to Kafka and many downstream systems (lakehouse, search, alerting) consume them reliably."
functionalRequirements: ["Services publish domain events (orders, payments, users)", "Downstream systems subscribe independently", "Events land in the lakehouse automatically", "Invalid events are isolated, not lost"]
nonFunctionalRequirements: ["No event loss once acknowledged", "Per-entity ordering preserved", "Consumers can replay the last 7 days", "Teams can onboard new topics without central bottlenecks"]
scaleAssumptions: ["About 50 topics", "Peak 200,000 events per second across topics", "Average event 2 KB"]
architectureSummary: "Producers write schema-validated events to keyed, replicated topics; independent consumer groups read them; a connector or streaming job lands topics in lakehouse tables; dead-letter topics hold failures."
technologies: ["Kafka", "Schema registry", "Kafka Connect or streaming jobs", "Lakehouse table format", "Monitoring for lag and broker health"]
tradeoffs: [{"decision": "Key by entity id", "alternative": "No key (round-robin)", "reason": "Ordering per order or customer", "consequence": "Hot entities can skew partitions"}, {"decision": "Replication factor 3 with acks=all", "alternative": "Lower replication or acks=1", "reason": "Survives a broker failure without losing acknowledged events", "consequence": "Higher latency and storage"}, {"decision": "Schema registry with compatibility rules", "alternative": "Free-form JSON", "reason": "Producers cannot break consumers with incompatible changes", "consequence": "Schema evolution needs process"}, {"decision": "Dead-letter topics", "alternative": "Fail the consumer on bad events", "reason": "One bad event does not stop the stream", "consequence": "Someone must monitor and replay the dead-letter topic"}]
interviewFollowUps: ["How many partitions would you give the orders topic, and why?", "How do you change an event schema without breaking consumers?", "A consumer has fallen 6 hours behind. What do you do?", "How do you guarantee events land in the lakehouse exactly once?"]
related: ["articles:kafka/topics-partitions-consumer-groups", "interview-questions:kafka/at-least-once-delivery", "system-designs:change-data-capture-platform"]
previous: "system-designs:clickstream-data-platform"
next: "system-designs:reporting-analytics-platform"
---

## Approach

Treat Kafka as a shared product: **topic standards, schema contracts and clear delivery guarantees** matter more than raw throughput.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> serialise events with registered schemas and publish with idempotence and acks=all.</li>
<li><strong>Topics</strong> per domain event, keyed by entity id, replicated three times.</li>
<li><strong>Consumers</strong> in separate groups (lakehouse, search, alerting) commit offsets after processing.</li>
<li><strong>Lakehouse sink</strong> writes micro-batches to tables, deduplicating on event id.</li>
<li><strong>Dead-letter topics</strong> receive events that fail validation or processing, with error metadata.</li>
</ol>
<figcaption>Each consumer group reads independently and can replay within retention.</figcaption>
</figure>

## Topic design

Name topics by domain and event (`orders.order_placed`). Choose partitions from target throughput and maximum consumer parallelism, with headroom, because adding partitions later changes key placement.

## Schemas

Register every event schema and enforce backward-compatible evolution (for example only adding optional fields), so consumers keep working when producers change.

## Delivery guarantees

Producers: idempotent with acks=all. Consumers: at-least-once with idempotent sinks keyed by event id. This gives effectively-once results without depending on cross-system transactions.

## Operations

Monitor consumer lag per group, under-replicated partitions, broker disk and request latency. Alert on lag growth, not just absolute lag.

## Onboarding

Self-service templates for new topics (naming, partitions, retention, schema, owner) so platform rules are applied by default.

## Security

Authenticate clients, authorise per topic (producers write only their topics), and encrypt in transit. Avoid personal data in keys and headers.

## Cost

Retention per topic based on replay needs; tiered storage where supported; compression on producers.

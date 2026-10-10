---
title: "Design an Event-Driven Architecture"
description: "Event-driven architecture system design: event types, the transactional outbox, idempotent consumers, sagas, schema versioning, replay and analytics use."
technology: ["data-engineering", "kafka"]
topic: ["event-driven", "streaming", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "An e-commerce company's services call each other synchronously, so one slow service stalls checkout and analytics depends on nightly database dumps. Design an event-driven architecture in which services publish business events reliably, other services react to them independently, and the same events feed analytics, without losing or double-applying anything."
functionalRequirements:
  - "Order, payment, inventory and shipping services publish business events when their state changes"
  - "Other services react to events (reserve stock, award loyalty points, send emails) without the publisher knowing them"
  - "Multi-step business processes (place order, take payment, reserve stock, ship) complete or compensate"
  - "The same events land in the lakehouse for analytics within minutes"
  - "Consumers can be added later and replay history to build their own state"
  - "Every event type is documented with an owner and schema in an event catalog"
nonFunctionalRequirements:
  - "A state change and its event are never out of sync (no event without the change, no change without the event)"
  - "Consumers produce correct results under duplicate and out-of-order delivery"
  - "A failing consumer does not affect the publisher or other consumers"
  - "End-to-end reaction latency of a few seconds at p95"
  - "Event schemas evolve without breaking existing consumers"
scaleAssumptions:
  - "Assumption: about 40 services and 120 event types"
  - "Assumption: 3,000 events/s on average, 15,000 at seasonal peak"
  - "Assumption: average event 1.5 KB"
  - "Assumption: 14 days of broker retention, with full history in the lakehouse"
architectureSummary: "Each service writes its state change and an event row to an outbox table in the same database transaction; a CDC connector (Debezium outbox router) publishes outbox rows to Kafka topics keyed by aggregate id. Consumers are idempotent, recording processed event ids in the same transaction as their own state change. Long-running business processes use sagas with compensating events. A schema registry and event catalog govern contracts, and a lakehouse sink stores every event for analytics and replay."
technologies:
  - "Apache Kafka (or a managed equivalent) as the event backbone"
  - "Transactional outbox with Debezium's outbox event router"
  - "Schema registry (Avro, Protobuf or JSON Schema) and an AsyncAPI-style event catalog"
  - "Saga orchestration (a workflow engine such as Temporal) or choreography"
  - "Kafka Connect sink to Delta Lake or Iceberg for analytics"
  - "Distributed tracing with correlation ids (OpenTelemetry)"
tradeoffs:
  - decision: "Transactional outbox plus CDC"
    alternative: "Service writes to its database and then publishes to Kafka (dual write)"
    reason: "One local transaction covers both the state change and the event, so a crash cannot leave them inconsistent"
    consequence: "An outbox table per service, a CDC connector to run, and slightly higher latency"
  - decision: "Event-carried state transfer for widely used entities"
    alternative: "Thin notification events that make consumers call back for details"
    reason: "Consumers do not depend on the publisher's API being up and can build local read models"
    consequence: "Larger events, more data duplicated across services, and stricter schema governance"
  - decision: "Idempotent consumers with a processed-events table"
    alternative: "Rely on broker exactly-once features"
    reason: "Side effects in databases and external APIs are outside Kafka transactions; deduplication by event id works everywhere"
    consequence: "Each consumer stores processed ids and must expire them after the replay window"
  - decision: "Orchestrated sagas for the checkout flow"
    alternative: "Pure choreography where services react to each other's events"
    reason: "The process state is visible in one place, timeouts and compensations are explicit"
    consequence: "The orchestrator is a component to run, and it couples to every step's commands"
  - decision: "Keep every event in the lakehouse"
    alternative: "Treat the broker as the long-term store"
    reason: "Cheap long-term history for analytics, audits and rebuilding consumers"
    consequence: "Personal data in events must be handled in the lakehouse too"
interviewFollowUps:
  - "Why is publishing to Kafka right after the database commit not enough?"
  - "A consumer receives the same OrderPlaced event twice. What stops a double charge?"
  - "Payment succeeded but stock reservation failed. How does the system recover?"
  - "How do you change the OrderPlaced schema when ten teams consume it?"
  - "How would a new team build its read model from events published over the last two years?"
  - "When would you not use an event-driven design?"
related:
  - "articles:kafka/kafka-vs-message-queues"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:etl-elt/cdc-patterns-and-failure-modes"
  - "system-designs:kafka-ingestion-system"
  - "system-designs:change-data-capture-platform"
previous: "system-designs:kafka-ingestion-system"
next: "system-designs:reporting-analytics-platform"
versionContext: "The outbox and idempotent-consumer SQL was run on PostgreSQL 16. Connector and saga configuration is described, not executed."
sources:
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Confluent Schema Registry: schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
  - { label: "Confluent: Kafka transactions", url: "https://developer.confluent.io/courses/architecture/transactions/" }
---

## Approach

"Event-driven" covers several different patterns, and a strong answer names which ones it uses and why. The core risks are **inconsistency between state and events**, **duplicate and out-of-order delivery**, and **contracts that break consumers**. Ask:

- **What problem are we solving?** Decoupling availability (checkout should not fail because email is down), fan-out to many consumers, real-time analytics, or audit history?
- **Which processes span several services**, and must they be atomic from the customer's point of view?
- **Ordering**: does order matter per entity (an order's events), or globally (rarely needed, and expensive)?
- **Consistency expectations**: can a read model be a few seconds behind?
- **Who consumes events outside the service teams?** Analytics, ML, partners?
- **Existing infrastructure**: is there already Kafka, a cloud event bus, or a message queue?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Service transaction</strong>: the order service updates <code>orders</code> and inserts an <code>OrderPlaced</code> row into its <code>outbox</code> table in one database transaction.</li>
<li><strong>Outbox relay</strong>: Debezium reads the outbox through CDC and publishes each row to the <code>orders</code> topic, keyed by <code>order_id</code>, with the event id in a header.</li>
<li><strong>Event backbone</strong>: Kafka topics per domain, schemas in a registry, documented in the event catalog.</li>
<li><strong>Consumers</strong>: payment, inventory, loyalty and notification services each read with their own consumer group, deduplicate by event id and update their own state.</li>
<li><strong>Saga orchestrator</strong>: tracks the checkout process, issues commands, waits for result events, and triggers compensations on failure or timeout.</li>
<li><strong>Analytics sink</strong>: a connector appends every event to bronze tables in the lakehouse; silver models rebuild entity state from events.</li>
</ol>
<figcaption>Services never call each other to announce changes; they record events locally and the platform delivers them.</figcaption>
</figure>

A customer places an order. The order service commits the order and its outbox row together, then returns to the customer. Debezium picks up the outbox insert from the WAL and publishes `OrderPlaced`. The checkout saga sends `ReserveStock` and `AuthorisePayment` commands. Inventory reserves stock and publishes `StockReserved`; payment authorises and publishes `PaymentAuthorised`. When both arrive, the saga marks the order confirmed and the order service publishes `OrderConfirmed`. Loyalty and email services react to that. If payment fails, the saga publishes `ReleaseStock` and the order becomes `Cancelled`. Every event also lands in the lakehouse, where analysts see the full lifecycle of each order.

## Kinds of events

| Pattern | What the event contains | Use it when | Watch out for |
|---|---|---|---|
| Event notification | "Order 5001 changed" plus an id | Consumers rarely need details, or details are sensitive | Consumers call back to the publisher, recreating coupling and load |
| Event-carried state transfer | The relevant state (order lines, totals, status) | Consumers build local read models; publisher availability must not matter | Larger events; schema is a public contract |
| Event sourcing | Events are the system of record; state is derived by replaying them | Strong audit needs, complex domain history | Harder querying, snapshots, and schema evolution of old events |
| Commands | "Reserve stock for order 5001" sent to one owner | A specific service must act | Not a broadcast; keep commands and events on separate topics |

Name events in the past tense (`OrderPlaced`, `PaymentAuthorised`), because they record facts. Commands are imperative and have exactly one handler.

## The dual-write problem and the outbox

If a service commits to its database and then publishes to Kafka, a crash between the two leaves a committed order with no event, and publishing first risks an event for an order that then fails to commit. Distributed transactions across a database and Kafka are not practical. The **transactional outbox** solves it: the event is just another row written in the same local transaction.

```sql
CREATE TABLE orders (
  order_id    BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  total       NUMERIC(10,2) NOT NULL,
  status      TEXT NOT NULL
);
CREATE TABLE outbox (
  event_id     UUID PRIMARY KEY,
  aggregate_id BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

BEGIN;
INSERT INTO orders VALUES (5001, 42, 99.90, 'PLACED');
INSERT INTO outbox (event_id, aggregate_id, event_type, payload)
VALUES ('6f1c1d1e-0000-4000-8000-000000000001', 5001, 'OrderPlaced',
        '{"order_id": 5001, "customer_id": 42, "total": 99.90}');
COMMIT;
```

Either both rows exist or neither does. Debezium's outbox event router reads inserts on `outbox`, routes them to a topic by aggregate type, uses `aggregate_id` as the message key, and passes `event_id` along. The outbox rows can be deleted soon after insert, because CDC reads the log, not the table. The alternative relay is a poller that selects unsent rows and marks them sent; it is simpler but adds database load and latency.

## Idempotent consumers

The relay and the consumers are at least once, so every consumer must tolerate duplicates. The reliable pattern is an **inbox** (processed-events) table updated in the same transaction as the consumer's side effect. The loyalty service below receives the same event twice and awards points only once:

```sql
CREATE TABLE processed_events (
  consumer TEXT NOT NULL,
  event_id UUID NOT NULL,
  PRIMARY KEY (consumer, event_id)
);
CREATE TABLE loyalty_points (customer_id BIGINT PRIMARY KEY, points INT NOT NULL);

-- first delivery
WITH first_time AS (
  INSERT INTO processed_events VALUES ('loyalty', '6f1c1d1e-0000-4000-8000-000000000001')
  ON CONFLICT DO NOTHING
  RETURNING event_id
)
INSERT INTO loyalty_points (customer_id, points)
SELECT 42, 99 FROM first_time
ON CONFLICT (customer_id) DO UPDATE SET points = loyalty_points.points + EXCLUDED.points;

-- redelivery of the same event
WITH first_time AS (
  INSERT INTO processed_events VALUES ('loyalty', '6f1c1d1e-0000-4000-8000-000000000001')
  ON CONFLICT DO NOTHING
  RETURNING event_id
)
INSERT INTO loyalty_points (customer_id, points)
SELECT 42, 99 FROM first_time
ON CONFLICT (customer_id) DO UPDATE SET points = loyalty_points.points + EXCLUDED.points;

SELECT * FROM loyalty_points;
```

```text
 customer_id | points
-------------+--------
          42 |     99
```

The second insert into `processed_events` conflicts and returns no row, so the points insert selects nothing. Commit the consumer offset after this transaction. For external side effects (a payment provider), pass the event id as the provider's idempotency key so a retry does not charge twice. Where the side effect is naturally idempotent (setting a status to a value, upserting a read model with a version guard), the inbox table is unnecessary.

## Ordering

- Key topics by aggregate id so all events for one order are ordered within a partition.
- Do not rely on ordering across aggregates or topics. A consumer that needs `CustomerCreated` before `OrderPlaced` must handle the reverse: park the order event and retry, or create a placeholder customer.
- Carry an aggregate **version** in each event. Consumers ignore versions they have already applied and detect gaps.

## Sagas: choreography versus orchestration

A business process spanning services cannot use one ACID transaction, so it becomes a **saga**: a sequence of local transactions with **compensating actions** for steps that must be undone.

- **Choreography**: each service reacts to events and publishes its own. No central component, but the flow is implicit and hard to trace once there are more than three or four steps.
- **Orchestration**: a saga orchestrator (a workflow engine or a state machine in a service) sends commands and waits for results, with explicit timeouts and compensations. Easier to reason about and monitor for critical flows like checkout.

Compensations are business actions, not rollbacks: "refund payment", "release stock", "send apology email". Design them to be idempotent too.

## Schema evolution and contracts

- Register every event schema; enforce backward or full compatibility per topic.
- Additive optional fields are safe. Removing or renaming a field, or changing its meaning, needs a new event version (`OrderPlaced.v2`) published alongside the old one until consumers migrate.
- Include `schema_version`, `event_id`, `event_time`, `producer` and a correlation id in a standard envelope.
- Publish an **event catalog** (AsyncAPI documents generated from the registry) with owner, purpose, example and consumers. Events are a public API and need the same care.

## Analytics and replay

Events are excellent analytics data, because they record what happened and when. Sink every topic to bronze tables partitioned by event date, keep the raw payload and envelope, and build silver entity tables by applying events in version order. Because Kafka retention is only 14 days, the lakehouse is also where a **new consumer** gets history: bootstrap its read model from a lakehouse snapshot, then switch to the live topic from a known offset. For entities with a compacted "latest state" topic, new consumers can bootstrap straight from Kafka.

## Security and PII

Events are copied to many consumers and retained, so minimise personal data: send customer ids, not names and addresses, unless the consumer genuinely needs them. Restrict topic access by ACL, encrypt in transit, and include event topics and lakehouse tables in the deletion-request process. Never put personal data in message keys or headers.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| CDC relay down | Events delayed, not lost (outbox rows and WAL remain) | Alert on relay lag; replication slot monitoring |
| Consumer bug produced wrong state | Wrong read model | Fix, reset consumer group offset to an earlier time, replay (idempotency makes this safe) |
| Poison event | Consumer stuck | Dead-letter topic with error context; continue |
| Saga step times out | Process stuck | Orchestrator timeout triggers compensation or manual review queue |
| Breaking schema deployed | Consumers fail to deserialise | Registry compatibility check in CI blocks it before deploy |
| Event storm from a bug in a publisher | Downstream overload | Quotas; consumers apply backpressure; pause the producer via feature flag |

## Monitoring and SLAs

- Outbox relay lag (time from commit to publish) and replication slot size.
- Consumer lag and processing error rate per consumer group.
- DLQ volume per topic.
- Saga outcomes: completed, compensated, timed out, and duration per step.
- Distributed traces linking the HTTP request, outbox event and every consumer through a correlation id.

SLA example: 95% of `OrderPlaced` events processed by all critical consumers within 3 seconds; zero events older than 5 minutes in the outbox.

## Scaling to 10×

At 150,000 events/s: more partitions for hot topics (chosen in advance, since keyed topics are hard to repartition), more consumer instances up to the partition count, and batching in the relay. Inbox tables grow quickly, so expire processed ids older than the maximum replay window, or store them in a TTL key-value store. Split the event backbone by domain if one cluster becomes an operational bottleneck, using mirroring for the few cross-domain topics.

## Capacity estimate

- **Volume**: 3,000 events/s × 86,400 ≈ 260 million events/day; × 1.5 KB ≈ 390 GB/day.
- **Peak**: 15,000 events/s × 1.5 KB ≈ 22 MB/s, small for Kafka.
- **Broker storage**: 390 GB/day × 14 days × 3 replicas ≈ 16 TB before compression.
- **Lakehouse**: 390 GB/day raw; with columnar compression assume a few times smaller, roughly 50–100 TB per year.
- **Inbox tables**: the loyalty consumer handling 500 events/s and keeping ids for 14 days stores about 600 million rows; that is why expiry or a TTL store matters.
- **Outbox**: rows deleted within minutes, so the table stays tiny; the WAL carries the load.

## What a strong answer includes

- A precise statement of the **dual-write problem** and the **outbox** solution.
- **Idempotent consumers** with a concrete mechanism (inbox table, version guard or idempotency keys).
- **Per-aggregate ordering** and a plan for cross-aggregate disorder.
- **Sagas with compensations**, and a reasoned choice between orchestration and choreography.
- **Event design**: facts versus commands, notification versus state transfer, a standard envelope.
- **Schema governance** and an event catalog.
- **Analytics and replay** through the lakehouse.

## Common mistakes

- Publishing to Kafka after the database commit and calling it reliable.
- Assuming exactly-once delivery and writing non-idempotent consumers.
- Using events as remote procedure calls, with the publisher waiting for a reply.
- Thin events everywhere, so every consumer calls the publisher's API and the coupling returns.
- No owner or schema for events, so a field rename silently breaks five teams.
- Expecting global ordering across topics.
- Choosing event-driven design for a simple CRUD application where a synchronous call is clearer.

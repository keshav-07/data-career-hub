---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design an Order-Events Processing System"
description: "A system-design case study for order lifecycle events: transactional outbox, per-order ordering, state machines, stuck-order timers and current-state tables."
technology: ["data-engineering", "kafka", "sql"]
topic: ["streaming", "event-driven", "architecture"]
tags: ["order-events", "outbox-pattern", "state-machine", "event-sourcing", "kafka", "sla-timers"]
difficulty: "Advanced"
problem: "Design the event backbone for an e-commerce order lifecycle (created, paid, packed, shipped, delivered, cancelled, refunded) so that downstream services and analytics see every state change reliably and in order, stuck orders are detected, and a correct current state and full history of each order are always available."
functionalRequirements:
  - "Publish an event for every order state change from the order service, reliably"
  - "Let downstream consumers (payments, warehouse, notifications, analytics) react independently"
  - "Maintain a current-state table and a full history of every order"
  - "Validate transitions against the order state machine and flag invalid sequences"
  - "Detect orders stuck in a state beyond their SLA (paid but not shipped in 24 hours)"
  - "Provide near-real-time operational metrics and daily analytical tables"
nonFunctionalRequirements:
  - "No order state change is lost, even if the broker is down when the order is written"
  - "Consumers see changes to a single order in order"
  - "Current-state table no more than 30 seconds behind the order database"
  - "Duplicate events never cause double processing (double shipping, double refunds)"
  - "Replay of history possible for new consumers and bug fixes"
scaleAssumptions:
  - "Assumption: 2 million orders a day, 10× peaks on sale days"
  - "Assumption: about 8 lifecycle events per order, so 16 million events a day"
  - "Assumption: events of about 2 KB, including line items on creation"
  - "Assumption: 15 downstream consumer groups"
architectureSummary: "The order service writes state changes and an outbox row in one database transaction; CDC on the outbox publishes events to a Kafka topic keyed by order id. Consumers process idempotently by event id and per-order sequence numbers. A stream processor maintains current state, validates transitions and runs per-order timers for SLA breaches; raw events and current state land in lakehouse tables for analytics and replay."
technologies: ["Relational order database", "Transactional outbox with log-based CDC (for example Debezium)", "Apache Kafka", "Schema registry", "Stream processor with keyed state and timers (Flink or Spark Structured Streaming)", "Lakehouse tables", "Operational store for current state"]
tradeoffs:
  - decision: "Transactional outbox plus CDC"
    alternative: "Order service writes to the database, then publishes to Kafka"
    reason: "The database write and the event are committed atomically; a crash between the two cannot lose or invent an event"
    consequence: "An outbox table to manage and a CDC connector to run"
  - decision: "One topic for all order events, keyed by order id"
    alternative: "One topic per event type"
    reason: "Per-order ordering holds only within one partition; a single keyed topic keeps an order's whole lifecycle in sequence"
    consequence: "Consumers interested in one event type read and filter all types"
  - decision: "Per-order sequence number in each event"
    alternative: "Rely on timestamps or Kafka offsets"
    reason: "Sequence numbers come from the source of truth; timestamps tie and offsets differ after replays or topic migrations"
    consequence: "The order service must increment the sequence in the same transaction"
  - decision: "Events carry the full new state (event-carried state)"
    alternative: "Thin events that only carry ids"
    reason: "Consumers do not need to call the order service back, which removes coupling and load"
    consequence: "Larger events and care with personal data in the payload"
  - decision: "Stream processor timers for stuck orders"
    alternative: "Periodic batch query for old orders"
    reason: "Detection within minutes and no repeated full scans"
    consequence: "Keyed state for all open orders, which must be checkpointed and sized"
interviewFollowUps:
  - "Why not publish to Kafka directly from the order service after committing?"
  - "A consumer receives 'shipped' before 'paid' for an order. How is that possible and what should it do?"
  - "How do you add a new consumer that needs the last two years of order history?"
  - "How do you rename a field in the order event without breaking 15 consumers?"
  - "How do you detect orders that never received a next event?"
  - "The warehouse consumer crashes after shipping but before committing its offset. What prevents a second shipment?"
related:
  - "system-designs:change-data-capture-platform"
  - "system-designs:kafka-ingestion-system"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "interview-questions:kafka/at-least-once-delivery"
versionContext: "The state and transition SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Kafka, CDC and stream-processor behaviour is described from their documentation and not executed here."
sources:
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "PostgreSQL: window functions", url: "https://www.postgresql.org/docs/current/functions-window.html" }
previous: "system-designs:notification-alerting-pipeline"
---

## Approach

Order events are the classic event-driven backbone. The design questions are: how events leave the order service **reliably**, how consumers keep **per-order ordering** and **idempotency**, how you know the **current state** of an order, and how you notice when **nothing happens** (a stuck order produces no event at all).

Clarifying questions:

- **Source of truth**: is the order service's database authoritative, or is the event log the source (event sourcing)?
- **Lifecycle**: which states and transitions exist? Can orders be partially shipped or split?
- **Consumers**: who reacts to events, and which actions are dangerous to repeat (charging, shipping, refunding)?
- **Latency**: seconds for operations, minutes for dashboards, daily for finance?
- **History**: how far back must new consumers be able to replay?
- **SLAs on the lifecycle**: how long may an order sit in each state?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Order service</strong> updates the order row and inserts an outbox row (event id, order id, sequence, type, payload) in the same transaction.</li>
<li><strong>CDC</strong> reads the outbox from the database log and publishes each row to the <code>orders.events</code> topic keyed by order id.</li>
<li><strong>Kafka</strong> keeps per-order ordering within a partition and retains events for replay; a compacted topic holds the latest state per order.</li>
<li><strong>Consumers</strong> (payments, warehouse, notifications) process idempotently, keyed on event id and sequence.</li>
<li><strong>Stream processor</strong> keeps per-order state, validates transitions, emits current state and fires timers for stuck orders.</li>
<li><strong>Stores</strong>: raw events and current state land in lakehouse tables; current state also goes to an operational store for support tools.</li>
</ol>
<figcaption>One transaction creates both the state change and its event; everything downstream is a replayable consumer.</figcaption>
</figure>

Walkthrough:

1. **Outbox**: the dual-write problem (database commit succeeds, publish fails, or the reverse) disappears because there is only one write. The outbox row is the event.
2. **CDC** turns the outbox into a stream in commit order. Debezium, for example, provides an outbox event router that maps outbox columns to topic, key and payload.
3. **Kafka** retains the full event history for a defined period (or indefinitely with tiered storage), and a compacted "latest state" topic lets new services bootstrap without replaying everything.
4. **Consumers** each use their own consumer group, so a slow analytics consumer cannot delay the warehouse.
5. **The stream processor** turns events into state and turns the **absence** of events into alerts.

## Event model

Each event has an envelope and a payload:

| Field | Purpose |
|---|---|
| `event_id` | Unique; used for deduplication |
| `order_id` | Partition key |
| `seq` | Per-order sequence number from the order service |
| `type` | `OrderCreated`, `OrderPaid`, `OrderShipped`, ... |
| `occurred_at` | Business time of the change |
| `schema_version` | Payload version |
| `payload` | The full new order state, or the change plus relevant state |

Kafka's default partitioner sends all events with the same key to the same partition, and a partition is consumed by one consumer in a group at a time, so an order's events are processed in order **as long as the producer writes them in order and the partition count does not change**. Idempotent producers stop retries from reordering or duplicating within a partition.

## Current state, history and validation

Two derived views matter: the **current state** of each order and the **validity** of its history. In SQL over an event table (PostgreSQL here), using the sequence number rather than arrival order:

```sql
CREATE TABLE order_events (
  event_id text PRIMARY KEY, order_id int, seq int, status text, event_ts timestamp
);
CREATE TABLE allowed_transitions (from_status text, to_status text);

INSERT INTO allowed_transitions VALUES
  (NULL, 'created'), ('created', 'paid'), ('created', 'cancelled'),
  ('paid', 'shipped'), ('paid', 'cancelled'), ('shipped', 'delivered');
INSERT INTO order_events VALUES
  ('e1', 1, 1, 'created',   '2026-09-01 10:00'),
  ('e2', 1, 2, 'paid',      '2026-09-01 10:01'),
  ('e4', 1, 4, 'delivered', '2026-09-03 09:00'),
  ('e3', 1, 3, 'shipped',   '2026-09-02 15:00'),
  ('e5', 2, 1, 'created',   '2026-09-01 11:00'),
  ('e6', 2, 2, 'shipped',   '2026-09-01 12:00'),
  ('e7', 3, 1, 'created',   '2026-09-01 12:30'),
  ('e8', 3, 2, 'paid',      '2026-09-01 12:31');

SELECT DISTINCT ON (order_id) order_id, seq, status, event_ts
FROM order_events
ORDER BY order_id, seq DESC;
```

```text
 order_id | seq |  status   |      event_ts
----------+-----+-----------+---------------------
        1 |   4 | delivered | 2026-09-03 09:00:00
        2 |   2 | shipped   | 2026-09-01 12:00:00
        3 |   2 | paid      | 2026-09-01 12:31:00
```

Order 1's events were inserted out of order (`e4` before `e3`), but the highest sequence wins, so its state is correct. `DISTINCT ON` is PostgreSQL-specific; elsewhere use `row_number()` and filter to 1.

Checking transitions against the state machine:

```sql
WITH t AS (
  SELECT order_id, seq, status,
         lag(status) OVER (PARTITION BY order_id ORDER BY seq) AS prev_status
  FROM order_events
)
SELECT t.order_id, t.seq, t.prev_status, t.status
FROM t
LEFT JOIN allowed_transitions a
  ON a.from_status IS NOT DISTINCT FROM t.prev_status AND a.to_status = t.status
WHERE a.to_status IS NULL
ORDER BY t.order_id, t.seq;
```

```text
 order_id | seq | prev_status | status
----------+-----+-------------+---------
        2 |   2 | created     | shipped
```

Order 2 was shipped without being paid: either a bug in the order service or a missing event. `IS NOT DISTINCT FROM` lets the `NULL → created` start transition match. In the streaming version, the processor applies the same rule per event and routes violations to an alert topic.

## Idempotency and exactly-once effects

Consumers receive events at least once. Protect dangerous side effects:

- **Dedup by event id** in the consumer's own database, in the same transaction as the side effect (insert into `processed_events` with a unique constraint, then act).
- **Sequence guards**: a consumer storing order state ignores events with `seq` less than or equal to the stored sequence.
- **Idempotent external calls**: the warehouse API receives a shipment request id derived from the event id, so a retried call returns the existing shipment.
- Kafka transactions give exactly-once for read-process-write **within Kafka**. Once a consumer calls an external system, idempotency is your job.

## Out-of-order and missing events

With a single keyed topic and outbox, reordering is rare but possible: a topic migration, a replay merged with live data, or multiple source services emitting events for the same order. Handle it explicitly:

- If an event's `seq` is **greater than expected + 1**, buffer it briefly in keyed state and wait for the gap to fill; after a timeout, raise a "missing event" alert and fetch the current state from the order service's API or the compacted topic.
- If `seq` is lower than or equal to the stored value, it is a duplicate or stale: skip it.

## Detecting stuck orders

A missing event cannot trigger anything by itself, so use **timers**:

- When the processor sees `OrderPaid`, it registers a timer for paid time + 24 hours on that order's key.
- `OrderShipped` or `OrderCancelled` deletes the timer.
- If the timer fires, emit `OrderShipmentOverdue` to an operations topic.

Flink's keyed process functions and Spark's arbitrary stateful processing (`transformWithState` in recent Spark versions) both support per-key timers. Base timers on **event time** if the SLA is about business time, and make sure watermarks advance even when traffic is low, otherwise timers stall.

## Schema evolution

- Register event schemas with backward-compatible rules: add optional fields, never rename or retype.
- For breaking changes, publish a new event version alongside the old one for a migration period, or a new topic, and track which consumer groups have migrated.
- Because the outbox is written by one service, schema changes are reviewed in one place.

## Data quality

- Count events per type per hour against orders created; a sudden drop in `OrderShipped` events usually means a broken producer, not a quiet day.
- Invalid-transition rate and missing-sequence rate.
- Daily reconciliation: current-state table versus the order database for a sample or full set of orders.

## Security and PII

Order events contain names, addresses and phone numbers. Keep personal fields in a separate, access-controlled part of the payload (or reference them by customer id), restrict topic ACLs to consumers that need them, and make sure analytics tables use pseudonymised customer ids. Erasure requests require deleting or crypto-shredding personal data in retained events and lakehouse tables.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Kafka unavailable | Outbox rows accumulate; orders still accepted | CDC publishes the backlog when Kafka returns; nothing lost |
| CDC connector down | Same as above | Resumes from its stored log position; database log retention must cover the outage |
| Consumer bug processed events wrongly | Bad downstream state | Fix and replay from an earlier offset; idempotent processing makes replay safe |
| Poison event | Consumer stuck on one partition | Bounded retries, then dead-letter topic; alert; partition continues |
| Outbox table grows without limit | Database bloat | Delete published outbox rows on a schedule (CDC has already read them from the log) |

## Monitoring and SLAs

- Outbox lag: oldest unpublished outbox row age.
- Consumer lag per group in time, not just offsets.
- Current-state freshness against the 30-second target.
- Stuck orders by state and age; invalid transitions; dead-letter counts.

## Cost

Event volumes here are modest; costs are dominated by retention and by the number of consumer groups reading full events. Compress topics, use a compacted topic for state, and move long history to lakehouse tables instead of keeping years in Kafka.

## Scaling to 10×

At 160 million events a day on peak days (about 20,000 events per second at peak): add Kafka partitions **before** the peak season (repartitioning changes key placement, so do it during a quiet period with consumers drained), scale consumer instances up to the partition count, and keep the stream processor's keyed state in a disk-backed store (for example RocksDB) with incremental checkpoints. Open orders, not total orders, size the state.

## Capacity estimate

Assumptions: 2 million orders/day, 8 events each, 2 KB per event, peak hour carrying 10% of a day's events, 7 days Kafka retention, replication factor 3.

- **Events**: 16 million/day ≈ 185/s average; peak hour 1.6 million events ≈ 450/s; sale days at 10× ≈ 4,500/s.
- **Kafka volume**: 16 million × 2 KB = 32 GB/day; 7 days × 3 replicas ≈ 670 GB before compression.
- **Open-order state**: if orders stay open for about 5 days, 10 million open orders × ~1 KB state ≈ 10 GB of keyed state, fine for a disk-backed state store.
- **Lakehouse history**: 32 GB/day raw, roughly 8 GB/day compressed, about 3 TB a year.
- **Partitions**: 4,500 events/s is low for Kafka; 24 to 48 partitions are chosen for consumer parallelism, not throughput.

## What a strong answer includes

- The transactional outbox (or event sourcing) to solve the dual-write problem.
- Keying by order id for per-order ordering, with sequence numbers from the source.
- Idempotent consumers, especially around side effects such as payments and shipments.
- A state machine with validation, and timers to detect missing events.
- Current-state and full-history views, replay for new consumers, and schema governance.

## Common mistakes

- Publishing to Kafka after the database commit without an outbox.
- Partitioning by event type or randomly, losing per-order ordering.
- Using timestamps to order events.
- Assuming consumers get exactly-once delivery and repeating side effects.
- Detecting stuck orders with expensive repeated full-table scans, or not at all.
- Letting the outbox table grow forever.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Payment Events Pipeline with Exactly-Once Processing"
seoTitle: "Design an Exactly-Once Payment Events Pipeline"
description: "A system-design case study for payment events: idempotency keys, outbox, Kafka transactions, atomic offset storage, a double-entry ledger and reconciliation."
technology: ["data-engineering", "kafka", "sql"]
topic: ["streaming", "exactly-once", "payments", "architecture"]
tags: ["exactly-once", "idempotency", "kafka-transactions", "outbox-pattern", "ledger", "payments"]
difficulty: "Advanced"
problem: "Design the pipeline that carries payment events (authorised, captured, refunded, charged back) from the payments service and payment provider webhooks to a double-entry ledger, merchant balances and analytics, so that every payment is recorded exactly once, no money is created or lost by retries, and every number can be reconciled with the provider."
functionalRequirements:
  - "Accept payment events from the payments service and asynchronous provider webhooks"
  - "Post each financial event as balanced double-entry ledger entries"
  - "Maintain merchant and customer balances derived from the ledger"
  - "Feed fraud scoring and notifications with the same events in near real time"
  - "Land an immutable event history in the lakehouse for finance and analytics"
  - "Reconcile the ledger daily with provider settlement reports"
nonFunctionalRequirements:
  - "Each payment event affects the ledger exactly once, despite producer retries, duplicate webhooks, consumer crashes and replays"
  - "No acknowledged event is ever lost"
  - "Per-payment ordering preserved (a refund is never applied before its capture)"
  - "Ledger entries posted within 5 seconds of the event at p99"
  - "Full audit trail; amounts stored as exact decimals or integer minor units"
  - "Card data never enters the pipeline; personal data minimised and access-controlled"
scaleAssumptions:
  - "Assumption: 5 million payments a day, about 4 events per payment, so 20 million events a day"
  - "Assumption: peaks of 2,000 events per second on sale days"
  - "Assumption: provider webhooks are retried by the provider for up to several days and may arrive out of order"
  - "Assumption: 20 currencies, 200,000 merchants"
architectureSummary: "The payments service writes payment state and an outbox row in one transaction; CDC publishes events to Kafka keyed by payment id. Webhooks are verified, deduplicated by provider event id and turned into events the same way. Kafka-to-Kafka stages use transactions with read_committed consumers. The ledger writer stores entries and its consumer offsets in the same database transaction, with a unique key per event, so replays are no-ops. Daily reconciliation against provider reports catches anything the pipeline cannot."
technologies: ["Relational payments database with transactional outbox", "Log-based CDC", "Apache Kafka with idempotent and transactional producers", "Stream processor with exactly-once mode (Kafka Streams or Flink)", "Relational ledger database", "Lakehouse tables", "Reconciliation batch jobs"]
tradeoffs:
  - decision: "Idempotency at every boundary (unique business keys plus deduplication)"
    alternative: "Rely on one framework's exactly-once guarantee end to end"
    reason: "Framework guarantees stop at the edge of the framework; webhooks, HTTP calls and databases need their own idempotency"
    consequence: "Every consumer and API must define and store its idempotency key"
  - decision: "Store ledger entries and consumer offsets in one database transaction"
    alternative: "Commit offsets to Kafka after writing to the ledger"
    reason: "Output and progress commit atomically, so a crash can never leave one without the other"
    consequence: "The ledger writer manages offsets itself and seeks to them on start-up"
  - decision: "Kafka transactions for Kafka-to-Kafka enrichment stages"
    alternative: "At-least-once with downstream deduplication"
    reason: "Read-process-write within Kafka becomes atomic with read_committed consumers"
    consequence: "Extra latency from transaction commits and markers; consumers must use read_committed"
  - decision: "Key all topics by payment id"
    alternative: "Key by merchant id"
    reason: "Ordering matters per payment (capture before refund); payment ids spread load evenly"
    consequence: "Merchant-level aggregations need a repartition step"
  - decision: "Daily reconciliation with the provider as a backstop"
    alternative: "Trust the pipeline's guarantees"
    reason: "Bugs, manual fixes and provider-side errors happen; finance needs independent proof"
    consequence: "A batch job, break management and people to work the breaks"
interviewFollowUps:
  - "What exactly does 'exactly once' mean here? Delivery, processing or effect?"
  - "The ledger writer crashes after the database commit but before anything else. Walk through restart."
  - "The provider sends the same 'captured' webhook three times over two days. What happens?"
  - "A refund webhook arrives before the capture event. How do you handle it?"
  - "Why is enabling Kafka transactions not enough on its own?"
  - "How do you replay a week of events into a new ledger projection safely?"
related:
  - "system-designs:order-events-processing-system"
  - "system-designs:financial-reconciliation-pipeline"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "interview-questions:kafka/at-least-once-delivery"
  - "articles:kafka/topics-partitions-consumer-groups"
versionContext: "Kafka transaction and Kafka Streams exactly_once_v2 behaviour checked against the Apache Kafka documentation source. The ledger SQL was run on PostgreSQL 16 with scripts/verify-examples.py; Kafka client code is described, not executed."
sources:
  - { label: "Apache Kafka documentation: message delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "PostgreSQL 16: transaction isolation", url: "https://www.postgresql.org/docs/16/transaction-iso.html" }
previous: "system-designs:order-events-processing-system"
next: "system-designs:ride-hailing-surge-pricing-pipeline"
---

## Approach

Payments are where "exactly once" stops being a buzzword. A duplicate means a customer is charged twice or a merchant is paid twice; a loss means money disappears from the books. Start by defining the term precisely, because interviewers listen for it:

- **Exactly-once delivery** of a message over a network is impossible in general: a sender that gets no acknowledgement cannot know whether the message arrived.
- What systems provide is **exactly-once effect** (sometimes called effectively once): messages may be delivered or processed more than once, but the **observable result** is as if each was processed once. That comes from **at-least-once delivery plus idempotent or transactional processing**.

So the design question becomes: at each boundary, what makes a repeat harmless?

Clarifying questions:

- **Sources**: our own payments service only, or also provider webhooks? Webhooks are retried and reordered by the provider.
- **Consumers**: ledger, balances, fraud, notifications, analytics. Which ones have financial effect?
- **Latency**: seconds for balances, or is end of day acceptable for some?
- **Event types** and the payment state machine (authorised, captured, partially refunded, charged back).
- **Money representation**: currencies, minor units, rounding rules.
- **Audit and regulation**: retention, immutability, who can correct entries?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Payments service</strong> commits payment state and an outbox row (event id, payment id, sequence, type, amount) in one transaction.</li>
<li><strong>Webhook receiver</strong> verifies the provider signature, stores the raw webhook with a unique provider event id, and writes an outbox row in the same transaction.</li>
<li><strong>CDC</strong> publishes outbox rows to <code>payments.events</code>, keyed by payment id, with an idempotent producer.</li>
<li><strong>Enrichment</strong> (Kafka Streams or Flink in exactly-once mode) validates the state machine, adds merchant and fee data, and writes <code>payments.validated</code> transactionally.</li>
<li><strong>Ledger writer</strong> consumes with <code>read_committed</code>, writes balanced entries and its offsets in one database transaction.</li>
<li><strong>Other consumers</strong>: fraud, notifications and the lakehouse sink, each idempotent on event id.</li>
<li><strong>Reconciliation</strong>: daily comparison of ledger with provider settlement files and the payments database.</li>
</ol>
<figcaption>Each arrow is at-least-once; each box makes repeats harmless. Reconciliation proves it.</figcaption>
</figure>

## Exactly-once, boundary by boundary

| Boundary | Failure that causes repeats | What makes it harmless |
|---|---|---|
| Service database → Kafka | Crash between commit and publish; publish retry | Transactional outbox; CDC resumes from log position; idempotent producer |
| Provider → webhook receiver | Provider retries for days, sends duplicates | Unique constraint on provider event id; return success for duplicates |
| Kafka → Kafka (enrichment) | Consumer crash after producing but before committing offsets | Kafka transaction covering output records and consumer offsets; `read_committed` downstream |
| Kafka → ledger database | Crash after database commit, before offset commit | Offsets stored in the ledger database in the same transaction; unique key per event |
| Kafka → external API (notifications) | Timeout with unknown outcome | Provider idempotency key; accept rare duplicates for non-financial effects |
| Replay or backfill | Reprocessing old events on purpose | Same unique keys make reprocessing a no-op |

### Producer side: outbox and idempotent producers

The outbox removes the dual-write problem: the payment state change and its event are one database commit. CDC then publishes from the database log, resuming from its stored position after any crash, so every committed event is published at least once. An **idempotent producer** (`enable.idempotence=true`, the default in current Kafka clients, with `acks=all`) stops producer retries from writing duplicates or reordering within a partition. It does not stop duplicates created by CDC replaying after a crash, which is why every event carries a stable `event_id` from the outbox row.

### Kafka-to-Kafka: transactions

For stages that read from Kafka and write to Kafka, Kafka's transactional producer can write output records **and the consumer's offsets** in one atomic transaction. Requirements, per the Kafka documentation:

- The producer sets a `transactional.id`; a restarted instance with the same id fences off the old one and aborts its in-flight transaction.
- The consumer sets `isolation.level=read_committed` and `enable.auto.commit=false`.
- Downstream consumers also use `read_committed`; with the default `read_uncommitted` they can see records from aborted transactions.
- On an abort, the application must rewind to the last committed offsets before continuing.

Kafka Streams wraps all of this in one setting, `processing.guarantee=exactly_once_v2`, which also switches its consumers to `read_committed` and shortens the default commit interval.

The Kafka documentation is explicit that exactly-once for **other destination systems** requires cooperation from those systems. Kafka transactions end at Kafka's edge.

### Kafka-to-database: atomic offsets and unique keys

The ledger is a relational database, so the ledger writer uses the database's own transaction to commit **output and progress together**: entries are inserted with a unique key, and the next offset per partition is stored in a table in the same transaction. On start-up, the writer reads its offsets from the database and seeks the Kafka consumer to them (Kafka's committed offsets are then informational only).

```sql
CREATE TABLE ledger_entries (
  event_id   text NOT NULL,
  account    text NOT NULL,
  amount     numeric(18,2) NOT NULL,
  currency   char(3) NOT NULL,
  PRIMARY KEY (event_id, account)
);
CREATE TABLE consumer_offsets (
  consumer_group text, topic text, partition_id int, next_offset bigint,
  PRIMARY KEY (consumer_group, topic, partition_id)
);
INSERT INTO consumer_offsets VALUES ('ledger-writer', 'payments.captured', 0, 100);

BEGIN;
INSERT INTO ledger_entries VALUES
  ('pay-9001', 'customer_receivable', 120.00, 'EUR'), ('pay-9001', 'merchant_payable', -120.00, 'EUR'),
  ('pay-9002', 'customer_receivable',  35.50, 'EUR'), ('pay-9002', 'merchant_payable',  -35.50, 'EUR')
ON CONFLICT (event_id, account) DO NOTHING;
UPDATE consumer_offsets SET next_offset = 102
WHERE consumer_group = 'ledger-writer' AND topic = 'payments.captured' AND partition_id = 0;
COMMIT;

BEGIN;
INSERT INTO ledger_entries VALUES
  ('pay-9002', 'customer_receivable',  35.50, 'EUR'), ('pay-9002', 'merchant_payable',  -35.50, 'EUR')
ON CONFLICT (event_id, account) DO NOTHING;
UPDATE consumer_offsets SET next_offset = 102
WHERE consumer_group = 'ledger-writer' AND topic = 'payments.captured' AND partition_id = 0;
COMMIT;

SELECT event_id, count(*) AS entries, sum(amount) AS balance
FROM ledger_entries GROUP BY event_id ORDER BY event_id;
SELECT next_offset FROM consumer_offsets WHERE consumer_group = 'ledger-writer';
```

```text
 event_id | entries | balance
----------+---------+---------
 pay-9001 |       2 |    0.00
 pay-9002 |       2 |    0.00

 next_offset
-------------
         102
```

The second transaction simulates a redelivery of `pay-9002` (for example, the writer's offset table said 102 but a bug or a manual reset re-read offset 101). The `ON CONFLICT DO NOTHING` insert affects zero rows, so the ledger still has exactly two entries per payment, and each payment's entries sum to zero, as double entry requires. Either defence alone covers the normal crash case; together they also cover replays and operator mistakes.

Two details matter in production:

- Use `ON CONFLICT DO NOTHING` only when a duplicate is guaranteed to be identical. If the same `event_id` arrives with a **different amount**, that is a serious bug: detect it (compare the stored entry) and alert rather than silently ignoring it.
- With several writer instances, each owns different partitions, so offset rows do not conflict. A rebalance moves partitions between instances; the new owner reads the stored offset.

### Stream processors writing elsewhere

Flink provides exactly-once sinks through **two-phase commit**: data is pre-committed during a checkpoint and committed only when the checkpoint completes (its Kafka sink uses Kafka transactions this way). For sinks without transactions, fall back to idempotent upserts keyed on event id.

## Data model: double-entry ledger

- **Ledger entries are immutable.** A correction is a new reversing entry, never an update.
- Each financial event produces entries whose amounts sum to zero per currency. Balances are sums of entries per account (cached in a balances table updated in the same transaction, or computed from entries).
- Store amounts as `numeric` or integer minor units with an explicit currency; never floating point.
- Keep `event_id`, `payment_id`, `seq`, `occurred_at` (business time), `posted_at` (ledger time) and the source (service or webhook) on every entry.

## Ordering and late or out-of-order events

- Keying by payment id keeps a payment's events in one partition, in commit order from the outbox.
- Webhooks are the exception: the provider may deliver `refund.succeeded` before `charge.captured`. The enrichment stage keeps per-payment state with the last applied sequence or state; an event that is not valid yet (refund before capture) is **parked** in keyed state with a timer, then applied when its prerequisite arrives, or alerted if it never does.
- Business time (`occurred_at`) decides which accounting day an entry belongs to; a late event for a closed day is posted to the current open period with a reference, according to finance's period-close rules.

## Schema evolution

Payment events are contracts with finance. Use a schema registry with backward-compatible rules; amounts, currencies and ids are never renamed or retyped. New event types (for example a new dispute status) are added with an explicit mapping to ledger entries; unknown types are routed to a review topic, never silently skipped.

## Data quality and reconciliation

- **Invariants checked continuously**: every event's entries sum to zero; no account balance below an allowed limit; every captured payment has exactly one capture entry.
- **Pipeline reconciliation**: counts and amounts per hour in the payments database, Kafka (by offsets) and the ledger.
- **External reconciliation**: the daily match against provider settlement reports, as in the [financial reconciliation design](/data-engineering/system-design/financial-reconciliation-pipeline/). This is the independent proof that the pipeline's guarantees held.

## Security and compliance

- Card numbers never enter this pipeline; the provider tokenises them, and events carry tokens and the last four digits at most. This keeps the data platform out of the strictest card-data compliance scope.
- Verify webhook signatures before processing; reject and alert on failures.
- Encrypt topics and databases; restrict the ledger to the payments and finance services; log every manual adjustment with approver.
- Personal data (names, emails) stays in the payments service; events reference customer ids.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Ledger writer crash mid-transaction | Database rolls back the batch | Restart from stored offsets; batch reprocessed once |
| Ledger writer crash after commit | Kafka offsets not committed | Restart seeks to offsets stored in the database; nothing reprocessed |
| Enrichment instance hangs with open transaction | Downstream `read_committed` consumers wait on that partition | Transaction timeout aborts it; a new instance with the same `transactional.id` fences the old one |
| Duplicate webhook | Same provider event id | Unique constraint; respond 2xx so the provider stops retrying |
| Bug posted wrong entries for a week | Ledger wrong | Post reversing entries, then reprocess into a corrected projection; never delete history |
| Kafka unavailable | Outbox backlog grows | Service keeps taking payments; CDC catches up |

## Monitoring and SLAs

- End-to-end latency from outbox commit to ledger posting, p50 and p99.
- Consumer lag per stage; outbox backlog age.
- Duplicate-suppressed counts per boundary (a sudden jump means something upstream is retrying abnormally).
- Aborted transactions per minute; parked out-of-order events and their age.
- Invariant violations and reconciliation breaks: any non-zero value pages someone.

## Cost

Volumes are modest; correctness costs more than throughput. Transactions add latency and some broker overhead, so use them only on Kafka-to-Kafka stages with financial meaning. The ledger database is sized for write rate and history; move older entries to partitioned or archived tables while keeping balances current.

## Scaling to 10×

At 200 million events a day (about 20,000 per second at peak): add partitions to the payment topics ahead of time; shard the ledger database by account or merchant range, keeping each event's entries in one shard (route by the merchant account) so the transaction stays local; and keep the per-partition offset table in each shard. Cross-shard events (a transfer between merchants on different shards) need a two-step pattern with a clearing account and its own idempotency.

## Capacity estimate

Assumptions: 20 million events/day, 2,000/s peak, 1 KB per event, 2 to 4 ledger entries per event at about 200 bytes each, 7 days Kafka retention with replication factor 3.

- **Kafka**: 20 GB/day; 7 days × 3 replicas ≈ 420 GB before compression.
- **Ledger rows**: 20 million × 3 entries = 60 million rows/day ≈ 12 GB/day, about 4.4 TB a year plus indexes. Partition by posting month.
- **Ledger write rate**: 2,000 events/s × 3 entries = 6,000 rows/s at peak. Batching 500 events per database transaction gives about 4 transactions per second per partition group, well within a single well-tuned relational database.
- **Idempotency storage**: the unique key on `(event_id, account)` is part of the ledger itself, so it costs an index, not a separate store. Webhook ids: 5 million/day kept 90 days ≈ 450 million rows, about 40 GB with index.

## What a strong answer includes

- A precise definition: at-least-once delivery plus idempotent or transactional effects, boundary by boundary.
- The outbox for the source side, idempotent producers, and stable event ids.
- Kafka transactions with `read_committed` for Kafka-to-Kafka stages, and why they stop at Kafka's edge.
- Atomic storage of output and offsets in the sink database, plus unique business keys.
- Immutable double-entry ledger with zero-sum invariants.
- Handling of out-of-order webhooks, and reconciliation as an independent check.

## Common mistakes

- Saying "Kafka gives exactly once" without explaining the database or external side.
- Committing Kafka offsets before writing to the ledger (loss) or after it without idempotency (duplicates).
- Deduplicating on a key that changes between retries (such as a timestamp or a regenerated id).
- Updating or deleting ledger rows to fix mistakes.
- Using floating-point amounts.
- Forgetting that `read_uncommitted` consumers see aborted transactional records.
- Skipping reconciliation because "the pipeline is exactly once".

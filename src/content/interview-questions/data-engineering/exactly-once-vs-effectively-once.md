---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Exactly-once vs effectively-once: what can a pipeline really guarantee?"
seoTitle: "Exactly-Once vs Effectively-Once: Interview Answer"
description: "Interview answer: delivery is at-least-once across systems, so exactly-once results come from idempotent writes or committing output and progress in one transaction."
technology: ["data-engineering", "kafka"]
topic: ["delivery-semantics", "idempotency", "streaming"]
difficulty: "Hard"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Across independent systems, a message can always be delivered or processed more than once after a failure, so what pipelines actually guarantee is effectively-once: every input affects the final result exactly once, even if it was processed several times. There are two ways to get it. Either the sink is idempotent (upsert on a unique event id, overwrite a partition), so duplicates do not change the result; or the output and the consumer's progress are committed in one atomic transaction, as Kafka transactions do within Kafka and as a database sink can do by storing offsets alongside the data. Side effects outside those boundaries, such as emails or API calls, still need their own idempotency keys."
followUps: ["What does Kafka's exactly-once semantics cover, and what does it not cover?", "How does Spark Structured Streaming achieve end-to-end exactly-once into Delta Lake?", "Why is at-most-once rarely acceptable for analytics?", "How would you make an HTTP side effect effectively-once?"]
related: ["articles:kafka/delivery-semantics-exactly-once", "interview-questions:kafka/at-least-once-delivery", "articles:etl-elt/idempotency-in-data-pipelines", "system-designs:payment-events-pipeline-exactly-once"]
sources:
  - { label: "Apache Kafka documentation: Message delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Spark documentation: Structured Streaming programming guide", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
versionContext: "SQL verified on PostgreSQL 16.14"
---

## Detailed explanation

### The three delivery guarantees

| Guarantee | How it arises | Failure effect |
|-----------|---------------|----------------|
| At-most-once | Commit progress, then process | A crash loses messages |
| At-least-once | Process, then commit progress | A crash reprocesses messages: duplicates |
| Exactly-once (processing) | Output and progress commit atomically | Neither loss nor duplicate effects |

The network can always lose an acknowledgement, so a sender that wants to avoid loss must retry, and a retry can duplicate. "Exactly-once delivery" between independent systems is therefore not something a protocol can promise. What systems promise is **exactly-once processing within a boundary**, or **effectively-once results**: duplicates may be delivered and processed, but they do not change the outcome.

### Two ways to get effectively-once

**1. Idempotent sink.** Make reprocessing harmless: upsert on a unique event id, insert-if-absent, overwrite the partition, merge with a version guard. This works with any transport and is the most common answer in practice. Its weakness is aggregates: "add 10 to the running total" is not idempotent, so either keep the raw events keyed by id and aggregate from them, or use approach 2.

**2. Atomic output plus progress.** Store the consumer's position in the same transaction as the output. After a crash, the consumer reads its position from the sink, so it resumes exactly after the last committed batch.

- **Kafka to Kafka**: Kafka transactions let a read-process-write application commit its output records and its consumer offsets atomically; consumers with `isolation.level=read_committed` see only committed results. This is what Kafka Streams' `exactly_once_v2` uses.
- **Kafka to a database**: write the batch and the offsets in one database transaction.
- **Spark Structured Streaming to Delta Lake**: checkpoints record source offsets, and the Delta sink records which batch ids were committed, so a replayed batch is skipped.

## Example: offsets stored with the data

```sql
CREATE TABLE account_totals (account_id int PRIMARY KEY, total numeric NOT NULL);
CREATE TABLE consumer_offsets (consumer text, topic_partition text, next_offset bigint NOT NULL,
                               PRIMARY KEY (consumer, topic_partition));
INSERT INTO consumer_offsets VALUES ('totals', 'payments-0', 0);

-- Apply the batch at offsets 0..2, but only if the stored offset says it has not been applied.
CREATE PROCEDURE apply_batch(p_first bigint, p_next bigint, p_account int, p_amount numeric)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE consumer_offsets SET next_offset = p_next
    WHERE consumer = 'totals' AND topic_partition = 'payments-0' AND next_offset = p_first;
    IF NOT FOUND THEN
        RETURN;                                    -- already applied: a replay after a crash
    END IF;
    INSERT INTO account_totals VALUES (p_account, p_amount)
    ON CONFLICT (account_id) DO UPDATE SET total = account_totals.total + EXCLUDED.total;
END;
$$;

CALL apply_batch(0, 3, 42, 30.00);   -- first delivery
CALL apply_batch(0, 3, 42, 30.00);   -- redelivered after a consumer crash
CALL apply_batch(3, 5, 42, 12.50);   -- next batch

SELECT a.total, o.next_offset FROM account_totals AS a, consumer_offsets AS o;
```

| total | next_offset |
|-------|-------------|
| 42.50 | 5 |

The running total is not idempotent on its own, but because the offset check and the update commit together, the redelivered batch has no effect. On restart, the consumer seeks to `next_offset` from this table rather than relying on offsets committed to Kafka.

## Trade-offs and pitfalls

- Kafka's exactly-once covers Kafka-to-Kafka. Writing to an external database from inside a Kafka transaction does not make the database write part of it.
- Transactions add latency and coordination; idempotent sinks are simpler when the data has natural unique ids.
- Producer idempotence (enabled by default in modern Kafka clients) removes duplicates caused by producer retries within a session; it does not deduplicate an application that resends the same business event.
- Side effects (emails, payments, webhooks) are outside every transaction above. Give each an idempotency key and record it, or use the receiving API's own idempotency key.
- "Exactly-once" claims in a vendor's documentation always have a scope. Ask: from where to where, and under which failures?

## Common mistakes

1. Claiming end-to-end exactly-once delivery across arbitrary systems.
2. Committing Kafka offsets before writing to the sink (at-most-once by accident).
3. Non-idempotent aggregates in an at-least-once pipeline.
4. Forgetting that replays after a code fix also reprocess data, so the sink must tolerate them.

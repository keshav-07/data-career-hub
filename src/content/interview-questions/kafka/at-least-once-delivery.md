---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "What is at-least-once delivery and what problems can it create?"
seoTitle: "At-Least-Once Delivery in Kafka: Interview Answer"
description: "Interview answer: at-least-once means no message is lost but some may be processed twice after failures, so consumers and sinks must be idempotent or deduplicate."
inventoryId: "INT-23"
technology: ["kafka", "data-engineering"]
topic: ["delivery-semantics"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "High"
shortAnswer: "At-least-once delivery guarantees that every message is processed, but a message may be processed more than once. In Kafka it typically comes from processing a record and then committing its offset: if the consumer crashes after processing but before committing, it reprocesses that record on restart. The problem is duplicates, such as double-counted metrics or repeated side effects, so the processing and the sink must be idempotent, for example by upserting on a unique event id."
followUps: ["How is at-most-once different?", "What does Kafka's exactly-once guarantee cover, and what doesn't it?", "How would you deduplicate in a streaming job?"]
related: ["articles:kafka/topics-partitions-consumer-groups", "interview-questions:kafka/partitions-and-consumer-groups", "interview-questions:data-engineering/idempotent-batch-pipeline"]
---

## Detailed explanation

```text
poll → process → write to sink → commit offset
                              ↑ crash here → record is processed again after restart
```

Duplicates also arise from producer retries (mitigated by idempotent producers, enabled by default in modern Kafka clients) and from rebalances.

## Making duplicates harmless

- **Idempotent writes**: upsert or `MERGE` on a unique event id.
- **Deduplication**: keep a record of processed ids within a time window (streaming engines support watermark-bounded dedup).
- **Side effects**: record that an email or payment was sent, keyed by event id, before sending again.

## Common mistakes

1. Using auto-commit and assuming it gives exactly-once.
2. Believing Kafka transactions make writes to an external database exactly-once.
3. Counting events in a sink that appends blindly.

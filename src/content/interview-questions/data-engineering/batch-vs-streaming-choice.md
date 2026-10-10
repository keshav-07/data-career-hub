---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Batch or streaming: how do you choose for a use case?"
seoTitle: "Batch vs Streaming Choice: Interview Answer"
description: "Batch vs streaming, interview answer: start from the freshness the decision needs and the cost of late data, prefer the simplest option that meets it, and name what streaming adds."
technology: ["data-engineering", "kafka"]
topic: ["batch", "streaming", "architecture"]
difficulty: "Medium"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I start from the decision the data supports and how fresh it must be, and what it costs if it is late. If hours are acceptable, batch is simpler, cheaper and easier to rerun. If minutes are enough, frequent batch or micro-batch usually meets it with batch-like operations. I choose true streaming when a decision must react within seconds, such as fraud checks or inventory, and then I plan for what streaming brings: event time and watermarks for late data, state and checkpoints, at-least-once delivery with idempotent sinks, replayable sources, lag monitoring and always-on cost. A common hybrid is streaming ingestion into a raw table with batch modelling on top."
followUps: ["What is the difference between event time and processing time?", "When is micro-batch not good enough?", "How would you reprocess a month of data in a streaming design?", "What does a streaming pipeline cost when traffic is low?"]
related: ["articles:etl-elt/batch-vs-streaming", "system-designs:unified-batch-streaming-lambda-kappa", "interview-questions:data-engineering/exactly-once-vs-effectively-once", "interview-questions:data-engineering/late-arriving-data"]
sources:
  - { label: "Spark documentation: Structured Streaming programming guide", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
versionContext: "Conceptual; applies to Spark Structured Streaming, Flink, Kafka Streams and warehouse streaming ingestion"
---

## Detailed explanation

### A decision procedure

1. **What decision uses this data, and how fresh must it be?** Write the number down: 24 hours, 1 hour, 5 minutes, 2 seconds.
2. **What does lateness cost?** A dashboard viewed later, or money lost on every late event?
3. **Choose the simplest option that meets it.**

| Required freshness | Usually | Why |
|--------------------|---------|-----|
| Hours to a day | Scheduled batch | Simple reruns, cheapest, easiest to debug |
| 5 to 60 minutes | Frequent batch or micro-batch | Batch semantics, modest cost |
| Seconds | Streaming | Only continuous processing gets there |
| Milliseconds, per request | An online service with a feature store or cache | Analytics pipelines are not request-path systems |

### Worked examples

- **Daily revenue report by 07:00**: batch. Late events can be handled by rebuilding recent partitions.
- **Ops dashboard refreshed every 10 minutes**: micro-batch (for example Spark Structured Streaming with a 5-minute trigger, or `availableNow` runs scheduled every 10 minutes).
- **Card fraud scoring before authorisation**: streaming features plus an online scoring service; the analytics side can still be batch.
- **Inventory sync between warehouse and web shop**: CDC plus streaming, because overselling has a direct cost.

### What streaming adds

- **Event time vs processing time**, and **watermarks** that bound how long to wait for late events.
- **State and checkpoints** for windows, joins and deduplication; upgrades must stay checkpoint-compatible.
- **Delivery semantics**: usually at-least-once, so sinks must be idempotent or transactional.
- **Replay** for bug fixes: enough retention in the log, or a raw copy in the lake.
- **Operations**: lag monitoring, on-call for a system that never stops, and compute that runs even when traffic is low.

### The hybrid most teams use

Stream events into a raw lakehouse or warehouse table (fresh within minutes), then build curated models in batch. The few consumers who need minutes read the raw or lightly processed stream; everyone else gets simpler, rerunnable batch models.

## Example answer for "real-time sales dashboard"

"First I'd ask what 'real-time' means for the people using it. If they look at it a few times an hour, I'd ingest orders continuously with CDC into a raw table and refresh the aggregate every five minutes in micro-batch: one code path, easy to rerun, cheap. If they need second-level updates, for example a live event screen, I'd aggregate in a streaming job with event-time windows and a watermark of a few minutes, write idempotently keyed by window, and still rebuild the daily figures in batch for finance."

## Trade-offs and pitfalls

- Streaming moves cost from compute-on-demand to always-on; at low volume the fixed cost dominates.
- Batch with hourly runs can look like streaming to users for many use cases, at a fraction of the effort.
- Two code paths (lambda architecture) drift apart; prefer one path run at different cadences.

## Common mistakes

1. Choosing streaming because it sounds modern, without a freshness requirement.
2. Not asking what "real-time" means to the stakeholder.
3. Ignoring late data and replay in the streaming design.
4. Forgetting that the consumer (a BI tool refreshing hourly) may be the real latency limit.

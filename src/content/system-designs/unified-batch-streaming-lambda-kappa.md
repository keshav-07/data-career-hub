---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Unified Batch and Streaming Platform: Lambda vs Kappa"
seoTitle: "Unified Batch and Streaming: Lambda vs Kappa"
description: "A system-design case study comparing Lambda and Kappa honestly, then designing a unified platform: one log, shared logic, lakehouse tables, replay and serving."
technology: ["data-engineering", "spark", "kafka"]
topic: ["architecture", "streaming", "batch"]
tags: ["lambda-architecture", "kappa-architecture", "reprocessing", "lakehouse", "replay", "unified-processing"]
difficulty: "Advanced"
problem: "A company runs nightly batch pipelines for accurate reporting and separate streaming jobs for real-time dashboards, and the two disagree. Design a platform that serves both fresh and accurate results from one set of business logic, can reprocess history when logic changes, and is cheaper to run and maintain."
functionalRequirements:
  - "Serve key business metrics (orders, revenue, active users) with about one minute of latency"
  - "Serve the same metrics as accurate historical tables for finance and analytics"
  - "Recompute any period when business logic changes or a bug is fixed"
  - "Handle late and corrected events"
  - "Let teams build new pipelines on the same foundation without writing logic twice"
nonFunctionalRequirements:
  - "Real-time and historical numbers agree within an agreed tolerance once late data settles"
  - "One implementation of each business rule"
  - "Reprocessing a year of history completes within a day without disrupting live processing"
  - "Clear lineage: every number traceable to a code version and input range"
  - "Total cost no higher than today's two separate stacks"
scaleAssumptions:
  - "Assumption: 30,000 events per second on average, 1 KB each (about 2.6 TB a day uncompressed)"
  - "Assumption: two years of history must be reprocessable"
  - "Assumption: 40 pipelines today, half batch and half streaming, with duplicated logic in about 15 of them"
  - "Assumption: events can arrive up to 3 days late (mobile offline sync)"
architectureSummary: "Use one immutable event log (Kafka for recent data, lakehouse bronze tables for full history) as the single input. Business logic is written once as incremental transformations that run continuously for fresh tables and in catch-up mode for backfills. Lakehouse tables serve as both stream outputs and stream inputs, versioned outputs make reprocessing safe, and a serving layer reads from them. This is Kappa in spirit, keeping batch-style recomputation where it is the simpler tool."
technologies: ["Apache Kafka (optionally with tiered storage)", "Lakehouse tables (Delta Lake or Apache Iceberg)", "Spark Structured Streaming or Flink, used in both continuous and catch-up modes", "Orchestrator for backfills and maintenance", "Serving store or warehouse for dashboards", "Data quality and lineage tooling"]
tradeoffs:
  - decision: "Single code path for each metric (Kappa-style)"
    alternative: "Separate batch and speed layers (Lambda)"
    reason: "Removes the divergence between two implementations, the main operational cost of Lambda"
    consequence: "The streaming engine must handle reprocessing at historical scale, and stateful logic must be replay-safe"
  - decision: "Lakehouse bronze tables as the long-term log"
    alternative: "Keep years of data in Kafka"
    reason: "Columnar files in object storage are far cheaper to keep and faster to scan for backfills"
    consequence: "Replay reads from two places (lakehouse for history, Kafka for the tail) and must stitch them exactly"
  - decision: "Reprocess into a new versioned output, then switch"
    alternative: "Overwrite the live table in place"
    reason: "Live consumers keep reading correct old results until the new version is validated"
    consequence: "Double storage during a backfill and a switch mechanism (views or catalog pointers)"
  - decision: "Keep scheduled batch for heavy, non-incremental jobs"
    alternative: "Force everything into streaming"
    reason: "Some work (large rebuilds, model training, complex joins over all history) is simpler and cheaper as batch"
    consequence: "Two execution modes remain; the rule is one definition of logic, not one engine at any cost"
  - decision: "Event-time processing with a bounded lateness window plus periodic restatement"
    alternative: "Infinite state to accept any late event"
    reason: "State stays bounded; very late events are applied by restating recent partitions"
    consequence: "Real-time numbers for recent days can change after the fact"
interviewFollowUps:
  - "What actually goes wrong in a Lambda architecture in practice?"
  - "In Kappa, how do you reprocess two years of data when Kafka only keeps seven days?"
  - "How do you switch consumers from the old output to the reprocessed output safely?"
  - "When would you still choose Lambda today?"
  - "How do stateful operations (sessions, deduplication) behave when you replay history?"
  - "How do you make sure the streaming and batch modes of the same code give the same answer?"
related:
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "system-designs:scalable-lakehouse"
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:delta-lake/data-lakes-lakehouse-delta"
  - "articles:data-warehousing/lake-vs-warehouse-vs-lakehouse"
versionContext: "Spark facts (Trigger.AvailableNow, Real-time Mode introduced in Spark 4.1) and Kafka tiered storage limitations were checked against the projects' documentation sources. The Python comparison was run with Python 3 via scripts/verify-examples.py."
sources:
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
  - { label: "Apache Spark: Structured Streaming overview", url: "https://spark.apache.org/docs/latest/streaming/index.html" }
  - { label: "Delta Lake: table streaming reads and writes", url: "https://docs.delta.io/delta-streaming/" }
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
previous: "system-designs:e-commerce-inventory-sync-system"
next: "system-designs:churn-prediction-data-pipeline"
---

## Approach

"Lambda or Kappa?" is usually asked to see whether you understand **why** each exists and what each costs, not to hear a slogan. Give an honest comparison, then design for the requirements in front of you. The modern answer is rarely pure Lambda or pure Kappa: it is **one log, one definition of each piece of logic, and execution modes chosen per job**.

Clarifying questions:

- **Which outputs need which latency?** Often only a handful of metrics truly need seconds or minutes.
- **What is the correctness bar** for real-time numbers versus finance numbers?
- **How often does logic change**, and how far back must changes be applied?
- **How late can data be**, and how are corrections represented?
- **What exists today?** Engines, skills, and the cost of the current duplicated stacks.

## Lambda and Kappa, honestly

**Lambda architecture** (named by Nathan Marz) runs two paths over the same immutable input:

- A **batch layer** periodically recomputes complete, accurate views from all historical data.
- A **speed layer** processes recent data incrementally for low latency.
- A **serving layer** merges batch views with speed-layer results for the period the batch has not yet covered.

**Kappa architecture** (proposed by Jay Kreps in 2014 in "Questioning the Lambda Architecture") drops the batch layer: everything is a stream over a replayable log, and reprocessing means running a new version of the streaming job from the beginning of the log into a new output, then switching readers to it.

| Aspect | Lambda | Kappa |
|---|---|---|
| Code paths | Two (batch and speed), often in different frameworks | One |
| Accuracy | Batch layer eventually corrects speed-layer errors | Depends on the streaming job being correct; replay fixes past errors |
| Reprocessing | Natural: rerun the batch | Replay the log with the new job version |
| History requirement | Batch reads files of any age | Log must retain (or be able to reconstruct) all history needed |
| Operational cost | Two systems, two on-call surfaces, reconciliation between them | One processing system, but it must cope with replay at scale |
| Main failure mode | The two implementations drift apart | Replays are slow, stateful jobs are hard to replay, retention is expensive |
| Fits when | Batch logic is very different or very heavy; streaming engine is limited | Logic is incremental; engine handles both live and catch-up processing |

What changed since these names were coined: stream processors gained exactly-once state and event-time semantics; lakehouse table formats made object storage behave like an appendable, transactional log that streams can read and write; and engines run the same code in streaming and batch-like modes (Spark Structured Streaming with `Trigger.AvailableNow` processes all available data and stops; Flink offers batch execution of DataStream programs; Apache Beam runs one pipeline on several runners). That shrinks Lambda's original justification, but it does not make batch obsolete.

Honest assessment:

- **Lambda's real problem is duplicated logic**, not batch itself. Two implementations of "revenue" will disagree.
- **Kappa's real problem is replay at scale**: replaying two years through a streaming job, with state, while the live job keeps running, needs planning and capacity.
- Many teams use **Kappa for logic** (one definition) and **batch-style execution for backfills and heavy recomputation**. Calling that "unified" is more accurate than claiming pure Kappa.

## Why duplicated logic diverges

A small illustration. The same metric computed by one function, applied once to the whole log (a replay) and once incrementally, agrees; a separately written speed layer that missed two rules does not.

```python
from collections import Counter

events = [  # (event_id, country, amount)
    ("e1", "DE", 30), ("e2", "FR", 20), ("e2", "FR", 20),  # e2 delivered twice
    ("e3", "DE", 50), ("e4", "fr", 10),                     # e4 has a lower-case code
]

def revenue_by_country(batch, seen):
    """One definition, used for both full recomputation and incremental runs."""
    out = Counter()
    for event_id, country, amount in batch:
        if event_id in seen:
            continue
        seen.add(event_id)
        out[country.upper()] += amount
    return out

full = revenue_by_country(events, set())

seen, incremental = set(), Counter()
for start in range(0, len(events), 2):
    incremental.update(revenue_by_country(events[start:start + 2], seen))

speed = Counter()
for _, country, amount in events:
    speed[country] += amount

print("replay      :", dict(full))
print("incremental :", dict(incremental))
print("speed layer :", dict(speed))
```

```text
replay      : {'DE': 80, 'FR': 30}
incremental : {'DE': 80, 'FR': 30}
speed layer : {'DE': 80, 'FR': 40, 'fr': 10}
```

Note that the incremental run only matches because the deduplication state (`seen`) is carried between micro-batches. That is the general lesson: one code path gives the same answer in both modes **only if state is handled identically**, which is exactly what checkpointed streaming state provides.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> write immutable, keyed events with ids and event timestamps to Kafka.</li>
<li><strong>Bronze</strong>: a continuous job appends every event, with Kafka coordinates, to a lakehouse table; this is the permanent log.</li>
<li><strong>Silver and gold transformations</strong>: incremental jobs read bronze (or silver) as streams, apply the single definition of each rule, and write lakehouse tables.</li>
<li><strong>Two execution modes</strong>: continuous triggers for fresh tables; catch-up runs (process all available data, then stop) for backfills and cheap periodic refreshes.</li>
<li><strong>Versioned outputs</strong>: reprocessing writes <code>gold.revenue_v2</code>; a view or catalog pointer switches readers after validation.</li>
<li><strong>Serving</strong>: dashboards read gold tables directly or through a low-latency store fed from them.</li>
</ol>
<figcaption>One log, one set of transformations, run continuously for freshness and in catch-up mode for history.</figcaption>
</figure>

Walkthrough:

1. **The log** is split by age: Kafka holds the tail (days), bronze holds everything. Kafka tiered storage can extend retention cheaply, but it has limitations (for example, the Kafka documentation lists no support for compacted topics) and scanning years through a broker is still slower than reading columnar files.
2. **Transformations read tables as streams.** Delta Lake and Iceberg tables can be read incrementally, so silver jobs do not care whether data arrived a second ago or is being replayed from last year.
3. **Execution modes**: the same job definition runs with a continuous trigger for low latency, or with a catch-up trigger from a scheduler for backfills and for tables where hourly freshness is enough (which is cheaper than a cluster running all day).
4. **Versioned outputs** make reprocessing a deployment, not an emergency.

## Reprocessing in practice

To fix a bug in the revenue logic for the last 18 months:

1. Deploy `revenue_v2` as a **new job with a new checkpoint** and a new output table.
2. Start it from bronze at the chosen start point, in catch-up mode with a large cluster; it reads 18 months of files quickly.
3. When it reaches the present, switch it to continuous mode; it now keeps up with live data.
4. Validate v2 against v1 (differences should be explained by the bug fix only).
5. Switch the view `gold.revenue` to v2; keep v1 for a rollback period, then delete it.

Stitching history and tail exactly: bronze rows carry Kafka coordinates, so the switch from reading bronze to reading Kafka (if a job reads Kafka directly) can happen at precise offsets. Simpler still, have all downstream jobs read only bronze and accept bronze's latency (seconds to a minute).

## Late data and state

- Event-time windows with a watermark (say 3 days, matching the lateness requirement) keep state bounded. The cost is state size: 3 days of window state for high-cardinality keys can be large; put it in a disk-backed state store.
- Events later than the watermark land in bronze anyway. A scheduled **restatement** job recomputes recent gold partitions (for example the last 7 days) in catch-up mode, so very late events still reach reported numbers.
- Stateful replays must reproduce the same results: deduplication keyed on event id, sessions defined on event time, no dependence on processing time or on lookups to mutable external systems (use versioned dimension tables joined as of event time).

## Schema evolution

One log means one schema contract per topic. Use a registry with compatibility rules; bronze stores raw payloads so old events stay readable; transformations handle each schema version explicitly. When a replay crosses a schema change, the job must read both versions, which is a strong reason to keep schema handling in one shared parsing module.

## Data quality

- Compare real-time gold (live job) with restated gold (catch-up job) for closed days; differences should match late-data volume.
- Row-count lineage from Kafka offsets to bronze to silver.
- Validation gates before switching a reprocessed version.

## Security

The single log is the most sensitive dataset in the company. Restrict bronze; minimise and tokenise personal data in silver; and plan erasure: deleting from an immutable log is hard, so use deletion vectors or rewrite affected files in lakehouse tables, short Kafka retention, and, where needed, crypto-shredding (encrypt per-user fields with per-user keys and destroy the key).

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Live job down | Fresh tables stale | Restart from checkpoint; catch-up is automatic |
| Logic bug found | Wrong historical numbers | Versioned reprocessing as above |
| Replay too slow | Backfill takes weeks | Read from bronze files, not Kafka; scale the backfill cluster; partition the backfill by date and run in parallel where logic allows |
| Checkpoint lost | Job cannot resume | Restart from a known bronze version with idempotent sinks |
| Late-data spike after an outage | Real-time numbers too low | Restatement job; mark recent days preliminary |

## Monitoring and SLAs

- Freshness of each gold table against its target.
- Live versus restated differences per day.
- Backfill progress (event time reached) and estimated completion.
- Cost per pipeline per day, comparing continuous and catch-up modes.

## Cost

Continuous jobs cost money every hour. Only tables that truly need minute-level freshness should run continuously; others run in catch-up mode every hour or day using the same code. Keep Kafka retention short and rely on bronze for history. Removing a duplicated batch stack usually saves more than the streaming platform costs.

## Scaling to 10×

At 300,000 events per second: partition bronze by date and hour with compaction; split transformations by domain so they scale and fail independently; run backfills on separate, short-lived clusters; and consider Spark's Real-time Mode (introduced in Spark 4.1 for low-latency queries, with stateful support arriving in later releases per the Spark documentation) or Flink only for the few outputs that need sub-second latency.

## Capacity estimate

Assumptions: 30,000 events/s × 1 KB; compression about 4:1 in bronze; 2 years of history; replay throughput of a catch-up cluster assumed at 1 million events per second (to be measured).

- **Daily volume**: 30,000 × 86,400 ≈ 2.6 billion events ≈ 2.6 TB raw, about 650 GB compressed.
- **Two years in bronze**: 650 GB × 730 ≈ 475 TB compressed.
- **Kafka**: 7 days × 2.6 TB × 3 replicas ≈ 55 TB uncompressed (less with compression); keeping two years in Kafka at that replication would be several petabytes, which is why bronze is the long-term log.
- **Replay time**: 2 years ≈ 1.9 trillion events / 1 million per second ≈ 22 days. That fails the "within a day" requirement, so either the backfill cluster must reach about 22 million events per second (partitioned by date and run in parallel, which works for stateless or per-day logic), or the requirement must be relaxed for full-history replays. Saying this out loud is part of a strong answer.

## What a strong answer includes

- An accurate description of Lambda and Kappa, including who proposed them and what problem each solves.
- The real costs: duplicated logic for Lambda, replay at scale for Kappa.
- A unified design: one log (Kafka tail plus lakehouse history), one definition of logic, two execution modes.
- Versioned reprocessing with validation and a switch-over.
- Late data handled by bounded state plus restatement.
- A capacity check on whether replay is actually feasible in the required time.

## Common mistakes

- Declaring Lambda "obsolete" or Kappa "always better" without reasons.
- Proposing to keep years of data in Kafka without considering cost.
- Reprocessing by overwriting the live table in place.
- Forgetting that stateful jobs must be replay-safe.
- Writing the same rule twice "temporarily" and never removing one copy.
- Running every pipeline continuously when most outputs only need hourly freshness.

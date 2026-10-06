---
title: "Design a Real-Time Fraud Detection Pipeline"
seoTitle: "Design a Fraud Detection Pipeline"
description: "A system-design case study for fraud detection: a sub-100 ms scoring path, streaming velocity features, rules plus models, delayed labels and failure modes."
technology: ["data-engineering", "kafka", "spark"]
topic: ["fraud-detection", "streaming", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "A payments company must decide whether to approve, review or decline each card payment while the customer waits, using the payment details, the customer's recent behaviour and machine-learning models, and must keep learning as fraud patterns change and chargeback labels arrive weeks later."
functionalRequirements:
  - "Score every payment authorisation and return approve, review or decline"
  - "Compute behavioural features in real time (velocity per card, device, IP and merchant)"
  - "Combine analyst-maintained rules with ML model scores"
  - "Send review decisions to a case-management queue for analysts"
  - "Collect labels (chargebacks, analyst outcomes, customer reports) and build point-in-time-correct training data"
  - "Deploy new models and rules safely with shadow mode and gradual rollout"
nonFunctionalRequirements:
  - "Fraud decision within 100 ms at p99 inside the authorisation flow"
  - "Scoring available 99.99%; if it fails, a documented fallback decision applies"
  - "Features used in training identical to features used online (no training-serving skew)"
  - "Every decision explainable and auditable for years"
  - "Card and personal data protected to PCI DSS and privacy requirements"
scaleAssumptions:
  - "Assumption: 1,000 payments/s on average, 5,000/s at seasonal peak"
  - "Assumption: about 1 KB per payment event, 2 KB with enrichment"
  - "Assumption: roughly 0.1% of payments are fraudulent; chargeback labels arrive within 30 to 90 days"
  - "Assumption: about 300 features per decision, 40 of them computed in real time"
architectureSummary: "The payment service calls a synchronous scoring service that reads precomputed features from a low-latency online store, evaluates rules and an ML model, and returns a decision within 100 ms. Payment events flow through Kafka to Flink, which maintains sliding-window velocity features with exactly-once state and writes them to the online store and to an offline feature log. Decisions, features and later labels land in the lakehouse, where point-in-time joins build training sets; models are retrained, validated, shadow-tested and promoted through a registry."
technologies:
  - "Apache Kafka for payment, decision and label events"
  - "Apache Flink for stateful streaming features (Spark Structured Streaming as alternative)"
  - "Online feature store: Redis, DynamoDB or Cassandra behind a feature-serving API"
  - "Model serving (gradient-boosted trees) with a rules engine"
  - "Lakehouse (Delta or Iceberg) for decision logs, labels and training data"
  - "Case-management tool for analyst review"
tradeoffs:
  - decision: "Precompute streaming features and read them at decision time"
    alternative: "Compute aggregates by querying a database inside the request"
    reason: "Keeps the authorisation path to a few key-value reads, within the 100 ms budget"
    consequence: "Features can lag the newest events by a second or two; the current payment is added in the scoring service"
  - decision: "Flink for velocity features"
    alternative: "Spark Structured Streaming"
    reason: "Record-at-a-time processing with large keyed state and event-time timers gives low, steady latency"
    consequence: "A separate engine to run; Spark is acceptable where feature freshness of several seconds is fine"
  - decision: "Rules plus model, combined in one decision service"
    alternative: "Model only"
    reason: "Rules react to a new attack within minutes and encode hard policy; models generalise"
    consequence: "Rules accumulate and need ownership, testing and expiry"
  - decision: "Log the exact features used for every decision"
    alternative: "Recompute features from raw events when building training data"
    reason: "Training uses what the model actually saw, which removes skew and supports audits"
    consequence: "Large decision logs to store and protect"
  - decision: "Fail open with limits when scoring is unavailable"
    alternative: "Fail closed (decline everything)"
    reason: "Declining all payments costs more than a short window of extra fraud, for most merchants"
    consequence: "Needs a fallback rule set and amount limits, agreed with risk owners in advance"
interviewFollowUps:
  - "Walk through the 100 ms budget. Where does the time go?"
  - "How do you build training data when labels arrive 60 days after the payment?"
  - "A new fraud pattern appears on Friday night. How do you respond before the next model retrain?"
  - "How do you stop a feature being computed differently online and offline?"
  - "The streaming job restarts. What happens to velocity counts, and could you double count?"
  - "How do you evaluate a new model without risking real customers?"
related:
  - "projects:fraud-detection-pipeline"
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:kafka/kafka-real-time-data-engineering"
  - "system-designs:kafka-ingestion-system"
  - "system-designs:event-driven-architecture"
previous: "system-designs:customer-360-platform"
next: "system-designs:recommendation-data-pipeline"
versionContext: "The velocity-counter example is plain Python run with Python 3 to illustrate windowed, deduplicated state; in production this state lives in Flink. Other components are described, not executed."
sources:
  - { label: "Apache Flink 2.0.0 release announcement", url: "https://flink.apache.org/2025/03/24/apache-flink-2.0.0-a-new-era-of-real-time-data-processing/" }
  - { label: "Feast: point-in-time joins", url: "https://docs.feast.dev/getting-started/concepts/point-in-time-joins" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "Confluent: Kafka transactions and exactly-once", url: "https://developer.confluent.io/courses/architecture/transactions/" }
---

## Approach

Fraud detection has two very different halves: a **synchronous decision** that must be fast and always available, and an **asynchronous learning loop** that must be correct about time. Most weak answers merge them into "stream everything through Spark and run a model". Clarify:

- **Where is the decision made?** Inside card authorisation (the customer is waiting) or after the fact (refund abuse, account takeover)?
- **Latency budget**: what does the payment flow allow the fraud check? Often around 100 ms or less.
- **Actions**: approve, decline, step-up authentication, manual review? What review capacity exists?
- **Labels**: what counts as fraud (chargebacks, analyst decisions, customer reports), and how late do they arrive?
- **Cost of errors**: lost fraud versus declined good customers. This sets thresholds and the fallback policy.
- **Regulation**: PCI DSS scope, explanation requirements, data residency.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Payment service</strong> receives an authorisation and calls the scoring service synchronously with the payment details.</li>
<li><strong>Scoring service</strong> fetches features for the card, device, IP, customer and merchant from the online store in parallel, adds features from the current payment, runs rules and the model, and returns a decision.</li>
<li><strong>Event stream</strong>: the payment and the decision (with the exact feature vector and model version) are published to Kafka.</li>
<li><strong>Streaming features</strong>: Flink consumes payments, updates sliding-window velocity features per key with exactly-once state, and writes them to the online store and an offline feature log.</li>
<li><strong>Review and labels</strong>: review decisions go to case management; analyst outcomes, chargebacks and customer reports flow back as label events.</li>
<li><strong>Learning loop</strong>: the lakehouse joins decisions, features and labels point-in-time; models are retrained, validated, shadow-tested and promoted through a registry.</li>
</ol>
<figcaption>A fast read-only decision path, fed by streaming features, with a slower loop that learns from delayed labels.</figcaption>
</figure>

A card is used for a €250 purchase at 23:05. The scoring service reads `card:txn_count_10m = 2`, `card:distinct_merchants_1h = 2`, `device:cards_seen_24h = 4` and the customer's 90-day average spend from the online store, adds the current amount and merchant category, and calls the model, which returns 0.91. A rule says "score above 0.85 and device seen with more than 3 cards in 24 hours: decline". The response returns in 40 ms. Meanwhile Flink processes the payment event and updates the card's counters to 3, so the next payment sees them. Six weeks later a chargeback arrives, confirming fraud; the training pipeline joins it to the feature vector logged at 23:05.

## The 100 ms budget

| Step | Target |
|---|---|
| Network into scoring service | 5 ms |
| Parallel feature reads (5–10 key-value lookups) | 10 ms at p99 |
| Feature assembly and in-request features | 5 ms |
| Rules evaluation | 5 ms |
| Model inference (gradient-boosted trees) | 10–20 ms |
| Logging asynchronously, response | 5 ms |
| Headroom for retries and garbage collection | the rest |

To stay within budget: precompute everything heavy, read features in parallel, set strict per-call timeouts with defaults for missing features, keep models in memory, and log asynchronously. Never call the warehouse or a relational database scan in this path.

## Streaming features

Fraud signals are mostly **velocity** and **novelty** features keyed by entity:

- Count and sum of payments per card in 10 minutes, 1 hour, 24 hours.
- Distinct merchants or countries per card in the last hour.
- Distinct cards per device or IP in 24 hours (card testing).
- Time since the card was last seen, first time at this merchant.

The Python sketch below shows the logic Flink implements with keyed state and event-time timers: a sliding window per card, and deduplication so a redelivered event does not inflate counts.

```python
from collections import defaultdict, deque

WINDOW_S = 600  # 10-minute sliding window

class VelocityCounter:
    """Per-card count and sum of transactions in the last WINDOW_S seconds (event time)."""
    def __init__(self):
        self.events = defaultdict(deque)   # card -> deque of (ts, amount)
        self.seen = set()                   # event ids already applied

    def add(self, event_id, card, ts, amount):
        if event_id in self.seen:          # duplicate delivery: ignore
            return self.features(card, ts)
        self.seen.add(event_id)
        self.events[card].append((ts, amount))
        return self.features(card, ts)

    def features(self, card, now):
        q = self.events[card]
        while q and q[0][0] <= now - WINDOW_S:
            q.popleft()
        return {"txn_count_10m": len(q), "txn_sum_10m": round(sum(a for _, a in q), 2)}

v = VelocityCounter()
stream = [
    ("e1", "card-1", 0,   12.50),
    ("e2", "card-1", 120, 30.00),
    ("e2", "card-1", 120, 30.00),   # redelivered
    ("e3", "card-1", 300, 250.00),
    ("e4", "card-1", 900, 5.00),    # all earlier events have left the window
]
for e in stream:
    print(e[0], v.add(*e))
```

```text
e1 {'txn_count_10m': 1, 'txn_sum_10m': 12.5}
e2 {'txn_count_10m': 2, 'txn_sum_10m': 42.5}
e2 {'txn_count_10m': 2, 'txn_sum_10m': 42.5}
e3 {'txn_count_10m': 3, 'txn_sum_10m': 292.5}
e4 {'txn_count_10m': 1, 'txn_sum_10m': 5.0}
```

In Flink, the deque becomes keyed list or map state bucketed by minute (to bound memory), the `seen` set becomes keyed state with a TTL, and checkpoints make the state exactly-once: after a crash, Flink restores state and Kafka offsets from the same checkpoint, so no event is counted twice in state. Writes to the online store are idempotent upserts of the latest value per key, so a replay after restore simply rewrites the same values.

**Freshness gap.** The stream lags the payment by a second or so, so the scoring service adds the current payment itself (`count_10m + 1`). For card-testing attacks that fire many payments in the same second, a small in-memory or Redis counter incremented atomically in the request path closes the gap.

**Late events.** Use event time with a short allowed lateness (seconds to minutes). Velocity features are about recency, so very late events update offline features but are not worth delaying online ones.

## Rules and models

- **Rules** encode policy ("decline cards from sanctioned countries") and fast responses to new attacks. Each rule has an owner, a description, an expiry date and metrics (hits, precision). Deploy rules through a reviewed configuration, with a shadow mode that logs what they would do.
- **Models**: gradient-boosted trees are a common choice for tabular fraud features because they are accurate, fast to score and explainable with feature attributions. Retrain regularly (weekly or monthly) because fraud patterns drift.
- **Decision policy**: thresholds map scores to approve, step-up, review or decline, tuned to review capacity and cost of fraud versus false declines.
- **Explanations**: store top contributing features with each decision for analysts and audits.

## Labels and training data

Labels arrive late and are biased: you only learn the outcome for payments you approved (declined payments never produce chargebacks).

- **Point-in-time correctness**: training rows join the feature values **as they were at decision time**, never later values. Logging the exact feature vector with each decision makes this trivial and removes training-serving skew. For new features not yet logged, backfill them with a point-in-time join over the offline feature log (feature-store tooling such as Feast implements this "as of" join).
- **Label maturity**: only train on payments old enough for chargebacks to have arrived (for example older than 90 days), or model label delay explicitly.
- **Selection bias**: approve a tiny random sample of would-be declines (within risk limits), or use analyst-reviewed outcomes, to learn about the declined population.
- **Class imbalance**: fraud is rare; use appropriate sampling or weighting and evaluate with precision-recall at operating thresholds, not accuracy.

## Safe deployment

1. Offline evaluation on a time-based holdout (train on earlier months, test on later), never a random split.
2. **Shadow mode**: the new model scores live traffic and logs decisions without acting.
3. **Canary**: a small percentage of traffic uses the new model, with automatic rollback if decline rate or latency moves beyond limits.
4. Model registry records version, training data snapshot, features and metrics, so any decision can be traced to the exact model.

## Security and compliance

- Tokenise card numbers before they enter the analytics path; the fraud platform uses tokens and hashed device ids, keeping the raw card number inside the PCI-scoped payment system.
- Encrypt in transit and at rest, restrict decision logs (they are sensitive), and log every analyst access.
- Retain decision records for the period regulation and dispute processes require, then delete.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Scoring service timeout | No decision in time | Fallback policy: approve below an amount limit with basic rules, decline or step-up above it |
| Online store slow or down | Missing features | Per-feature defaults; model trained to handle missing values; alert |
| Flink job down | Velocity features go stale | Restart from checkpoint; scoring flags stale features (store a timestamp with each feature) |
| Bad model deployed | Spike in declines | Canary limits and automatic rollback to the previous version |
| Label pipeline broken | Retraining on incomplete labels | Label-volume checks block training |
| Attack pattern changes | Model misses fraud | Rules for immediate response; drift monitoring triggers retrain |

## Scaling to 10×

At 50,000 payments/s: scale Kafka partitions and Flink parallelism by key; shard the online store and keep reads per decision constant; run scoring services in several zones or regions close to payment processing; keep models compact so inference cost stays flat. State size grows with the number of active keys and window lengths, so bound long windows with pre-aggregated buckets and use TTLs.

## Monitoring and SLAs

- Scoring latency p50/p99, timeout and fallback rates.
- Decision mix (approve, review, decline) per merchant segment, with alerts on sudden shifts.
- Feature freshness (age of the newest update per feature family) and missing-feature rate.
- Model score distribution drift and, once labels mature, precision and recall at the operating threshold.
- Review queue length and analyst agreement with model decisions.

## Capacity estimate

- **Events**: 1,000 payments/s × 86,400 ≈ 86 million/day; with 2 KB enriched decision logs ≈ 170 GB/day ≈ 63 TB/year before compression.
- **Peak scoring**: 5,000 decisions/s × 8 feature reads ≈ 40,000 key-value reads/s, routine for a managed key-value store or a Redis cluster.
- **Flink state**: assume 50 million active cards, devices and IPs × about 200 bytes of window state ≈ 10 GB, easily held in RocksDB-backed state across a few task managers.
- **Online store**: 50 million keys × 40 features × about 16 bytes ≈ 32 GB plus overhead.
- **Training data**: one year of decisions ≈ 315 million rows; fraud is 0.1% ≈ 315,000 positives, so negatives are usually down-sampled for training.

## What a strong answer includes

- A clear split between the **synchronous decision path** and the **asynchronous learning loop**.
- A concrete **latency budget** and the design choices that meet it.
- **Streaming velocity features** with event time, deduplication and exactly-once state.
- **Rules plus models**, with governance for both.
- **Point-in-time-correct training data**, label delay and selection bias.
- **Safe rollout**: shadow, canary, rollback.
- An explicit, business-agreed **fallback policy** when components fail.

## Common mistakes

- Querying a warehouse or relational database inside the authorisation path.
- Random train/test splits that leak future information into evaluation.
- Joining today's feature values to last year's transactions when building training data.
- Treating a model as enough, with no way to respond to a new attack before the next retrain.
- Measuring accuracy on a 0.1% positive class.
- No fallback policy, so a scoring outage becomes either a payments outage or an open door.
- Storing raw card numbers in the analytics path.

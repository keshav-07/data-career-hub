---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Notification and Alerting Pipeline"
description: "A system-design case study for event-driven notifications: rules, user preferences, deduplication, rate limits, channel fan-out, retries and delivery tracking."
technology: ["data-engineering", "kafka"]
topic: ["streaming", "notifications", "architecture"]
tags: ["notifications", "alerting", "idempotency", "rate-limiting", "fan-out", "dead-letter-queue"]
difficulty: "Intermediate"
problem: "Design a pipeline that turns business events (order shipped, price dropped, payment failed, threshold breached) into notifications delivered by push, email, SMS or chat, respecting each user's preferences, never spamming, and tracking whether each message was delivered."
functionalRequirements:
  - "Consume business events from Kafka and decide which notifications they trigger"
  - "Support user-defined alerts (price below a threshold, stock back in stock) as well as system notifications"
  - "Apply user preferences: channels, opt-outs per category, quiet hours and time zone"
  - "Deliver through email, push, SMS and chat providers, with templates and localisation"
  - "Deduplicate, rate-limit and batch low-priority notifications into digests"
  - "Record every send attempt and its delivery status for support and analytics"
nonFunctionalRequirements:
  - "Critical notifications (security, payment failure) sent within 30 seconds; marketing within hours is fine"
  - "A user never receives the same notification twice because of retries"
  - "A provider outage degrades one channel only and is retried later"
  - "Opt-outs honoured immediately and auditable for compliance"
  - "System absorbs bursts (a flash sale triggering millions of price alerts) without delaying critical messages"
scaleAssumptions:
  - "Assumption: 30 million users, 5 million with at least one user-defined alert"
  - "Assumption: 3,000 business events per second, peaking at 30,000"
  - "Assumption: about 20 million notifications a day across channels, with bursts of 1 million in an hour"
  - "Assumption: delivery providers have their own rate limits per second"
architectureSummary: "Business events flow from Kafka into a rules and matching service that produces notification intents with deterministic idempotency keys. A policy stage applies preferences, deduplication, rate limits, quiet hours and priority, then routes intents into per-channel, per-priority queues. Channel workers render templates, call providers with retries and backoff, and record attempts; provider callbacks update delivery status, and failures go to a dead-letter queue."
technologies: ["Apache Kafka", "Rules and matching service (stream processor or microservice)", "Key-value store for idempotency keys, rate-limit counters and preferences cache", "Relational database for preferences and subscriptions", "Per-channel queues", "Email, push, SMS and chat delivery providers", "Lakehouse for delivery analytics"]
tradeoffs:
  - decision: "Separate queues per channel and priority"
    alternative: "One shared queue for all notifications"
    reason: "A marketing burst or a slow SMS provider cannot delay critical security messages"
    consequence: "More queues and consumers to operate and monitor"
  - decision: "Deterministic idempotency key per notification"
    alternative: "Rely on the queue's delivery guarantees"
    reason: "Queues and consumers deliver at least once; the key turns retries into no-ops"
    consequence: "A key store with a time-to-live, checked before every send"
  - decision: "Index user-defined alerts by the thing they watch (product id)"
    alternative: "Evaluate every alert against every event"
    reason: "An event only needs to check alerts on its own key"
    consequence: "Range conditions (price below X) need a sorted structure per product"
  - decision: "Digest low-priority notifications"
    alternative: "Send every notification immediately"
    reason: "Fewer, more useful messages; fewer unsubscribes and lower SMS cost"
    consequence: "Digest scheduling and time-zone handling add complexity"
  - decision: "Policy checks (opt-out, quiet hours) at send time as well as at creation"
    alternative: "Check only when the intent is created"
    reason: "Preferences can change while a message waits in a queue"
    consequence: "One extra preferences lookup per send, served from cache"
interviewFollowUps:
  - "A price drops on a product that 2 million users are watching. Walk through what happens."
  - "The SMS provider times out. Did the message send? How do you avoid sending it twice?"
  - "A user unsubscribes while 10 messages for them are queued. What happens?"
  - "How do you stop an alert flapping between firing and resolved every minute?"
  - "How would you measure whether notifications are useful, not just delivered?"
  - "How do you handle time zones and quiet hours for a global user base?"
related:
  - "system-designs:kafka-ingestion-system"
  - "system-designs:real-time-analytics-pipeline"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:etl-elt/pipeline-reliability-and-retries"
  - "articles:kafka/kafka-vs-message-queues"
versionContext: "The deduplication and rate-limit simulation was run with Python 3 via scripts/verify-examples.py. Messaging services are described generically; check each provider's documentation for rate limits and callback formats."
sources:
  - { label: "AWS decision guide: SNS, SQS or EventBridge", url: "https://docs.aws.amazon.com/decision-guides/latest/decision-guides/sns-or-sqs-or-eventbridge.html" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
previous: "system-designs:search-indexing-pipeline"
next: "system-designs:order-events-processing-system"
---

## Approach

The notification problem looks simple (event in, message out) but the hard parts are **not sending**: not sending twice, not sending to people who opted out, not sending at 3 a.m., not sending 40 alerts in an hour, and not letting a marketing burst delay a security alert. Structure the answer around that.

Clarifying questions:

- **Types and priorities**: transactional (order shipped), security (new login), user-defined alerts (price drop), marketing? Each has a different latency and compliance requirement.
- **Channels** and providers, and whether a notification goes to one channel or several.
- **Preferences**: per category and channel? Quiet hours? Frequency caps?
- **Scale and burstiness**: daily volume, and the worst burst (a flash sale, an incident affecting everyone).
- **Delivery tracking**: do we need delivered, opened and clicked, or just sent?
- **Alert semantics** for threshold alerts: fire once, or repeatedly while the condition holds?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Event sources</strong>: services publish business events to Kafka topics (orders, prices, payments, security).</li>
<li><strong>Matching</strong>: a rules service decides who should be notified: the order owner, or every user whose alert condition the event satisfies.</li>
<li><strong>Intents</strong>: each match becomes a notification intent with user, category, priority, payload and a deterministic idempotency key.</li>
<li><strong>Policy</strong>: opt-out and preference checks, deduplication, rate limits, quiet hours and digest decisions.</li>
<li><strong>Channel queues</strong>: intents are routed to per-channel, per-priority queues.</li>
<li><strong>Senders</strong>: workers render templates, call providers with timeouts and retries, and record every attempt.</li>
<li><strong>Feedback</strong>: provider callbacks (delivered, bounced, unsubscribed) update status and preferences; all records land in the lakehouse.</li>
</ol>
<figcaption>Matching decides who; policy decides whether and when; channel workers decide how.</figcaption>
</figure>

Walkthrough:

1. **Events** carry stable ids. The notification system never calls back into source services to find out what happened.
2. **Matching** for transactional messages is a direct lookup (order → customer). For user-defined alerts it is a reverse index: for each product, the alerts watching it, sorted by threshold, so a price change to 79 finds every "notify me below 80" alert with a range scan.
3. **Intents** separate deciding from sending. The idempotency key is derived from the business fact, for example `price-drop:{alert_id}:{price_version}`, so reprocessing the same event yields the same key.
4. **Policy** is where most rules live, and it runs again just before sending because preferences change.
5. **Per-channel queues** isolate failure: if the SMS provider is down, the SMS queue grows while email keeps flowing.
6. **Senders** treat providers as unreliable and record everything.

## Data model

| Store | Contents | Access pattern |
|---|---|---|
| Preferences (relational, cached) | user, category, channel, opted_in, quiet hours, time zone, locale | Read on every intent and send; write on settings change |
| Subscriptions or alerts | alert id, user, target (product id), condition, threshold, state | Reverse index by target |
| Idempotency keys (key-value with TTL) | key → sent timestamp | Check and set before sending |
| Rate-limit counters (key-value) | user and window → count | Increment per send |
| Notification log (append-only) | intent id, key, user, channel, template version, attempts, provider message id, status | Support lookups; analytics in the lakehouse |

Contact details (email, phone, device tokens) are looked up at send time from the user service or a restricted table, not copied into every intent.

## Deduplication and rate limiting

Kafka consumers and queues deliver **at least once**, and upstream services retry. So deduplicate on the idempotency key, and cap volume per user. A small simulation, with a cap of 2 normal notifications per hour and critical messages exempt:

```python
from collections import defaultdict, deque

sent_keys = set()                  # idempotency keys already delivered
recent = defaultdict(deque)        # user_id -> send times (minutes) in the last hour
MAX_PER_HOUR = 2

def decide(user_id, key, minute, priority):
    if key in sent_keys:
        return "drop: duplicate"
    window = recent[user_id]
    while window and window[0] <= minute - 60:
        window.popleft()
    if priority != "critical" and len(window) >= MAX_PER_HOUR:
        return "defer: rate limit (add to digest)"
    sent_keys.add(key)
    window.append(minute)
    return "send"

requests = [
    ("u1", "order-77:shipped", 0, "normal"),
    ("u1", "order-77:shipped", 1, "normal"),        # retried upstream event
    ("u1", "price-drop:sku-9", 5, "normal"),
    ("u1", "price-drop:sku-3", 9, "normal"),
    ("u1", "login-new-device:d4", 12, "critical"),  # security alerts bypass the limit
    ("u1", "price-drop:sku-5", 70, "normal"),       # first send has left the window
]
for user, key, minute, prio in requests:
    print(f"{minute:>3} {key:<22} {decide(user, key, minute, prio)}")
```

```text
  0 order-77:shipped       send
  1 order-77:shipped       drop: duplicate
  5 price-drop:sku-9       send
  9 price-drop:sku-3       defer: rate limit (add to digest)
 12 login-new-device:d4    send
 70 price-drop:sku-5       send
```

In production the key set and counters live in a shared key-value store with atomic operations and a time-to-live (for example 7 days for keys), because many workers run concurrently.

## The "did it send?" problem

When a provider call times out, you do not know whether the message went out. Options:

- **Provider idempotency**: many providers accept a client-supplied request id and ignore repeats. Use the notification's key.
- **Mark before or after**: marking the key as sent **before** calling the provider risks a lost message if the call fails (at most once); marking **after** risks a duplicate if the worker crashes in between (at least once). For critical messages prefer at least once; for marketing prefer at most once.
- **Record a pending state**, then reconcile with the provider's delivery callbacks.

This is the same exactly-once trade-off found in every pipeline that calls an external system: true exactly-once is only possible when the receiving side is idempotent.

## Ingestion, bursts and backpressure

- **Priority isolation**: separate queues and worker pools for critical, transactional and bulk messages. Bulk consumers can be throttled without touching critical ones.
- **Provider rate limits**: channel workers use a token bucket per provider and account. When a provider returns "too many requests", back off and let the queue absorb the burst.
- **Fan-out bursts**: a price drop on a popular product can match millions of alerts. Matching writes intents in batches to a bulk queue, and senders drain it at the provider's rate. The burst becomes a delay for bulk messages, not an outage.

## Alert semantics: avoiding noise

User-defined and operational alerts need state:

- **Fire once per crossing**: an alert moves `armed → fired` when the condition becomes true and only re-arms when it becomes false again (optionally with hysteresis: re-arm when the price rises 5% above the threshold). This stops flapping.
- **Grouping**: several related events within a short window become one message ("3 items on your wishlist dropped in price").
- **Expiry**: alerts older than a set period are paused, with a reminder.

## Late data and ordering

An "order shipped" event processed after "order delivered" should not produce a confusing message. Include the event time and the entity's state version in the intent; senders skip intents older than the latest one sent for the same entity and category. Time-sensitive messages also carry an expiry ("flash sale ends at 18:00"): a message that would arrive after its expiry is dropped.

## Schema evolution and templates

- Event schemas are governed by a registry; matching code depends on a few fields only.
- Templates are versioned and localised. The log records the template version so support can see exactly what the user received.
- New notification categories must be added to the preference model before launch, defaulting to the most conservative setting the regulations require.

## Security, privacy and compliance

- Opt-outs and unsubscribe links are legal requirements for marketing in many jurisdictions; the unsubscribe path writes to preferences immediately and is checked at send time.
- Do not put sensitive data in message bodies (full card numbers, passwords); link to the authenticated app instead.
- Device tokens and phone numbers are personal data with restricted access; delete them on account deletion and when providers report them invalid.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Provider outage | One channel's queue grows | Retry with backoff; optionally fail over to a secondary provider or another channel for critical messages |
| Bad template deployed | Garbled or failing messages | Template validation in CI; roll back by version |
| Poison intent (invalid payload) | Worker crash loop | Bounded retries, then dead-letter queue with alerting |
| Key-value store unavailable | Cannot deduplicate or rate-limit | Pause bulk sends; for critical sends, fall back to the log's recent-send lookup |
| Matching bug sends to wrong audience | Many wrong messages | Kill switch per category, checked by senders; audit log identifies recipients |

A **kill switch** per category and channel is cheap and saves you during incidents.

## Monitoring and SLAs

- End-to-end latency from event time to provider acceptance, per priority.
- Queue depth and age of the oldest message per channel and priority.
- Provider error and throttling rates; delivery, bounce and complaint rates from callbacks.
- Duplicates prevented, rate-limited and digested counts.
- Unsubscribe rate per category, which is the best signal that notifications have become noise.

## Cost

SMS is by far the most expensive channel per message; route to push or email when the user has them and the message is not urgent. Digesting and rate limiting reduce cost and annoyance together. Keep the detailed notification log in cheap lakehouse storage after a short operational retention.

## Scaling to 10×

At 200 million notifications a day: partition queues and workers by user id hash; shard the reverse alert index by target id; keep preferences in a distributed cache close to workers; and negotiate higher provider limits or use several provider accounts. Matching for very popular targets can precompute audiences.

## Capacity estimate

Assumptions: 20 million notifications a day; peak 1 million in one hour; 1 KB per log record; keys kept 7 days.

- **Average send rate**: 20 × 10⁶ / 86,400 ≈ 230/s. **Peak**: 1 × 10⁶ / 3,600 ≈ 280/s on top of normal traffic, so plan for about 1,000/s with headroom.
- **Idempotency keys**: 20 million/day × 7 days = 140 million keys × ~100 bytes ≈ 14 GB in the key-value store.
- **Notification log**: 20 million × 1 KB ≈ 20 GB/day, about 7 TB a year before compression.
- **Alert index**: 5 million users × an average of 4 alerts = 20 million alerts × ~200 bytes ≈ 4 GB.
- **Matching**: 3,000 events/s × an index lookup each is easy; the risk is fan-out per event, not event rate.

## What a strong answer includes

- Separation of matching, policy and delivery, with per-channel and per-priority isolation.
- Deterministic idempotency keys and a clear position on at-least-once versus at-most-once per category.
- Preferences, quiet hours and opt-outs checked at send time.
- Rate limits, grouping, digests and alert state to prevent noise.
- Provider failures handled with backoff, dead-letter queues and a kill switch.
- Delivery tracking and an append-only log for support and compliance.

## Common mistakes

- One queue for everything, so a bulk campaign delays security alerts.
- Assuming the message queue gives exactly-once delivery.
- Checking preferences only when the event arrives.
- Firing threshold alerts on every event while the condition holds.
- Copying contact details into every message record.
- Measuring success by messages sent rather than by usefulness and unsubscribe rates.

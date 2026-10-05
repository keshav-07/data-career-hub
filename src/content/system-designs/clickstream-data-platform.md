---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Design a Clickstream Data Platform"
seoTitle: "Design a Clickstream Data Platform"
description: "A system-design case study for clickstream data: high-volume event collection, schema validation, sessionisation, privacy, storage layout and product analytics."
inventoryId: "SYS-06"
technology: ["data-engineering", "kafka", "spark"]
topic: ["clickstream", "architecture"]
difficulty: "Advanced"
problem: "Design a platform that collects every page view and click from a website and mobile apps and turns it into reliable product analytics such as sessions, funnels and retention."
functionalRequirements: ["Collect events from web and mobile clients", "Validate events against a schema and route invalid ones aside", "Build sessions and daily user activity tables", "Support funnel and retention analysis"]
nonFunctionalRequirements: ["Collection endpoint highly available; clients never block on it", "Raw events available within 5 minutes; modelled tables daily", "Consent and privacy rules enforced", "Handle bot traffic and duplicate events"]
scaleAssumptions: ["About 2 billion events per day", "Roughly 0.5 KB per event", "Two years of history for analysis"]
architectureSummary: "A lightweight collection service writes validated events to Kafka; a streaming job lands them in a partitioned lakehouse table; daily batch jobs build sessions and aggregates."
technologies: ["Collection API", "Kafka", "Schema registry", "Spark (streaming and batch)", "Lakehouse table format"]
tradeoffs: [{"decision": "Validate at collection with a schema registry", "alternative": "Accept anything and clean later", "reason": "Broken events are caught at the source and routed to a dead-letter topic", "consequence": "Schema changes need coordination with client teams"}, {"decision": "Stream raw landing, batch modelling", "alternative": "Fully streaming sessionisation", "reason": "Fresh raw data with simpler, rerunnable session logic", "consequence": "Sessions are available daily, not live"}, {"decision": "Partition by event date, cluster by user", "alternative": "Partition by user", "reason": "Daily processing and pruning on date; user lookups via clustering", "consequence": "Needs compaction of small streaming files"}, {"decision": "Pseudonymous user ids", "alternative": "Store raw identifiers", "reason": "Supports analytics while reducing privacy risk", "consequence": "Joining to identified data needs a controlled mapping"}]
interviewFollowUps: ["How do you define and compute a session?", "How do you filter bot traffic?", "What happens when a mobile app sends events days late?", "How do you honour a user's deletion request?"]
related: ["articles:etl-elt/batch-vs-streaming", "articles:data-warehousing/partitioning-clustering-data-layout", "system-designs:real-time-analytics-pipeline"]
previous: "system-designs:cloud-data-warehouse-platform"
next: "system-designs:kafka-ingestion-system"
---

## Approach

Clickstream is high-volume and messy. Focus on **cheap, reliable collection, schema discipline, late mobile data and privacy**, then on modelling sessions.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Clients</strong> batch events and send them to a collection endpoint; they never block the user interface.</li>
<li><strong>Collection service</strong> validates against the schema registry and writes valid events to Kafka, invalid ones to a dead-letter topic.</li>
<li><strong>Streaming landing</strong> appends raw events to a lakehouse table partitioned by event date.</li>
<li><strong>Daily batch</strong> deduplicates, filters bots, builds sessions and user-day tables.</li>
<li><strong>Analytics</strong>: funnels and retention queries run on the modelled tables.</li>
</ol>
<figcaption>Collection and landing are continuous; modelling is a daily, rerunnable batch.</figcaption>
</figure>

## Sessionisation

Order a user's events by event time and start a new session after 30 minutes of inactivity (a common convention; make the threshold configurable). Implement with window functions: `LAG` of the timestamp, a flag when the gap exceeds the threshold, and a running sum of flags as the session number.

## Late and duplicate events

Mobile clients send late. Reprocess the last few days' partitions daily so late events land in the right sessions. Deduplicate on the client-generated event id.

## Bots

Filter known bot user agents and implausible behaviour (for example thousands of events per minute from one id), and keep a flag rather than deleting so filters can be revised.

## Privacy

Collect only consented events, pseudonymise user ids, restrict raw tables, and support deletion by user id across raw and modelled layers.

## Observability

Events per client version, invalid-event rate, collection latency, Kafka lag and daily volume against baseline.

## Cost

Columnar storage with compression, compaction of streaming files, lifecycle policies for raw data beyond the analysis window.

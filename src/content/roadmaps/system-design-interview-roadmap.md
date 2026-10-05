---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Data Engineering System Design: Interview Roadmap"
seoTitle: "Data Engineering System Design Interview Roadmap"
description: "A step-by-step roadmap for Data Engineering system design interviews: a repeatable framework, core building blocks, eight case studies and the trade-offs to rehearse."
inventoryId: "PILLAR-12"
technology: ["system-design", "data-engineering"]
topic: ["system-design", "interview"]
difficulty: "Advanced"
roadmapType: "study-plan"
related: ["cheat-sheets:data-engineering-system-design", "articles:career/data-engineering-interview-trade-offs", "roadmaps:interview-preparation-roadmap"]
stages: [{"id": "framework", "title": "Learn the framework", "summary": "Clarify requirements, estimate scale, sketch end to end, go deep on risks, cover reliability, security and cost, then trade-offs.", "estimatedEffort": "1 week", "prerequisites": [], "resources": ["cheat-sheets:data-engineering-system-design"], "outcome": "You can run the framework from memory on any prompt."}, {"id": "building-blocks", "title": "Know the building blocks", "summary": "Ingestion, storage layers, table formats, batch and stream processing, orchestration, serving.", "estimatedEffort": "2 weeks", "prerequisites": [], "resources": ["articles:etl-elt/modern-data-pipelines", "articles:delta-lake/data-lakes-lakehouse-delta", "articles:kafka/kafka-real-time-data-engineering"], "outcome": "You can explain when to use each block and its failure modes."}, {"id": "reliability", "title": "Master reliability patterns", "summary": "Idempotency, late data, duplicates, schema evolution, quality gates, observability and backfills.", "estimatedEffort": "1–2 weeks", "prerequisites": [], "resources": ["articles:etl-elt/idempotency-in-data-pipelines", "articles:etl-elt/data-quality-checks-contracts", "articles:etl-elt/pipeline-observability"], "outcome": "You can explain how your design survives reruns, late data and bad data."}, {"id": "batch-cases", "title": "Practise batch designs", "summary": "Batch pipeline, cloud warehouse and reporting platform case studies.", "estimatedEffort": "1 week", "prerequisites": [], "resources": ["system-designs:scalable-batch-pipeline", "system-designs:cloud-data-warehouse-platform", "system-designs:reporting-analytics-platform"], "outcome": "You can design and defend each in 40 minutes."}, {"id": "streaming-cases", "title": "Practise streaming and CDC designs", "summary": "Real-time analytics, Kafka ingestion, clickstream and CDC case studies.", "estimatedEffort": "1–2 weeks", "prerequisites": [], "resources": ["system-designs:real-time-analytics-pipeline", "system-designs:kafka-ingestion-system", "system-designs:clickstream-data-platform", "system-designs:change-data-capture-platform"], "outcome": "You can handle event time, ordering and delivery-semantics follow-ups."}, {"id": "platform-case", "title": "Practise a platform design", "summary": "Company-wide lakehouse with governance and many teams.", "estimatedEffort": "1 week", "prerequisites": [], "resources": ["system-designs:scalable-lakehouse"], "outcome": "You can discuss organisation, governance and cost, not just pipelines."}, {"id": "tradeoffs", "title": "Rehearse trade-offs out loud", "summary": "Practise naming options, choosing for the requirement and stating the cost.", "estimatedEffort": "Ongoing", "prerequisites": [], "resources": ["articles:career/data-engineering-interview-trade-offs"], "outcome": "Your answers sound like decisions, not lists."}]
---

System design rounds test whether you can turn vague requirements into a data platform that works, survives failure and fits a budget. Preparation is mostly **practice with a repeatable structure**.

## How to practise each case study

1. Read only the problem statement and requirements.
2. Set a 40-minute timer and design out loud, drawing the flow.
3. Compare with the case study: what did you miss? Which trade-offs did you not name?
4. Answer the follow-up questions at the end of the case study.
5. Repeat the same case a week later.

## What interviewers look for

- Clarifying questions before designing.
- Rough numbers that drive choices.
- Correct handling of reruns, late data and duplicates.
- Explicit trade-offs tied to requirements.
- Awareness of operations, security and cost.

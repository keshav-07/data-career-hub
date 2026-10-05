---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "ETL vs ELT: what factors decide the choice?"
seoTitle: "ETL vs ELT Decision Factors: Interview Answer"
description: "Interview answer: choose ETL or ELT by compliance needs, where compute is cheapest, need to reprocess history, data formats and team skills; many systems mix both."
inventoryId: "INT-25"
technology: ["data-engineering", "etl-elt"]
topic: ["architecture", "pipelines"]
difficulty: "Easy"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 6
interviewRelevance: "High"
shortAnswer: "ETL transforms data before loading it into the target; ELT loads raw data first and transforms it inside the warehouse or lakehouse. I decide based on whether rules such as privacy require transformation before storage, where compute is cheapest and most scalable, whether we need to reprocess history from raw data, whether the formats suit SQL, and the team's skills. In practice many pipelines do light cleaning and masking on the way in and the main modelling after load."
followUps: ["Why does keeping raw data make backfills easier?", "Where would you mask personal data in an ELT pipeline?", "How does dbt fit into ELT?"]
related: ["articles:etl-elt/etl-vs-elt", "articles:etl-elt/batch-vs-streaming"]
---

## Detailed explanation

| Factor | Favours ETL | Favours ELT |
|--------|-------------|-------------|
| Compliance | Data must be masked or removed before it is stored | Raw storage is allowed under access control |
| Compute | Target cannot scale transformations | Warehouse/lakehouse scales SQL cheaply |
| Reprocessing | Rarely needed | Frequent rule changes, backfills |
| Data shape | Binary, deeply nested, non-SQL processing | Tabular or semi-structured data SQL handles well |
| Team | Strong software engineering | SQL-first analytics engineering |

## Example answer structure

1. Define both in one sentence each.
2. Name two or three deciding factors for *this* scenario.
3. Mention that hybrids are common, such as masking PII at ingestion, then ELT modelling.

## Common mistakes

1. Claiming one is always superior.
2. Forgetting governance: "load everything raw" can violate data-protection rules.

---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "What is schema evolution and when is it safe?"
seoTitle: "Schema Evolution and When It Is Safe: Interview"
description: "Interview answer: schema evolution changes a table's schema as data changes; adding nullable columns is safe, while type changes, renames and drops can break readers."
inventoryId: "INT-18"
technology: ["delta-lake", "data-engineering"]
topic: ["schema-evolution"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 7
interviewRelevance: "Medium"
shortAnswer: "Schema evolution means changing a table's schema over time, for example adding a column when the source starts sending a new field. It is safe when the change is backward compatible: adding a nullable column, so old rows read as NULL and existing queries keep working. Incompatible type changes, renames and drops can break downstream readers and need explicit migration, communication and usually a coordinated change rather than automatic merging."
followUps: ["What is the difference between schema enforcement and schema evolution?", "Why is enabling automatic schema merge everywhere risky?", "How would you roll out a column rename?"]
related: ["articles:delta-lake/transactions-schema-evolution", "interview-questions:delta-lake/what-delta-lake-solves"]
---

## Detailed explanation

| Change | Safe? | Why |
|--------|-------|-----|
| Add nullable column | Yes | Old data reads as `NULL`; old queries ignore it |
| Widen numeric type | Usually, check engine support | Values still fit |
| Narrow or change type | No | Existing values may not convert |
| Rename column | Risky | Every downstream query referencing the old name breaks |
| Drop column | Risky | Same, plus possible data loss |

## Safe rollout of a breaking change

1. Add the new column alongside the old one.
2. Backfill it and update consumers.
3. Stop writing the old column, then remove it after consumers have migrated.

## Common mistakes

1. Turning on automatic merge so a typo becomes a new column.
2. Changing a type in place without checking existing data.
3. No communication with downstream owners.

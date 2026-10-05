---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "What are the most important data-quality checks in production?"
seoTitle: "Production Data Quality Checks: Interview Answer"
description: "Interview answer: check freshness, volume, schema, uniqueness, nulls, validity and referential integrity, and decide which failures block publishing versus alert."
inventoryId: "INT-28"
technology: ["data-engineering", "sql"]
topic: ["data-quality", "reliability"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "The checks that catch most real incidents are freshness (did new data arrive on time), volume (row counts within an expected range), schema (columns and types as expected), uniqueness of keys, nulls in required fields, valid values and ranges, and referential integrity between facts and dimensions. Just as important is the policy: critical failures block the publish step so consumers keep yesterday's correct data, while softer anomalies raise alerts for investigation."
followUps: ["Which checks would you run before and after a transformation?", "How do you choose thresholds for row-count checks?", "What is a data contract?"]
related: ["interview-questions:sql/remove-duplicate-records", "system-designs:scalable-batch-pipeline", "interview-questions:data-engineering/idempotent-batch-pipeline"]
versionContext: "Standard SQL. Queries verified against sample data on SQLite 3.45"
---

## Detailed explanation

| Check | Question it answers | Example |
|-------|---------------------|---------|
| Freshness | Is the data recent? | Latest `loaded_at` within 2 hours |
| Volume | Is the amount plausible? | Today's rows within ±30% of the 7-day median |
| Schema | Did the structure change? | Expected columns and types present |
| Uniqueness | Are keys unique? | `COUNT(*) = COUNT(DISTINCT order_id)` |
| Completeness | Are required fields present? | No `NULL` in `order_id`, `order_date` |
| Validity | Are values sensible? | `amount >= 0`, status in an allowed set |
| Referential integrity | Do facts join to dimensions? | No orphan `customer_key` |
| Reconciliation | Does it match the source? | Totals equal between staging and source |

## Example

```sql
CREATE TABLE orders (order_id INT, customer_id INT, amount INT);
INSERT INTO orders VALUES (1, 10, 50), (2, 11, -5), (2, 11, -5), (3, NULL, 20);

SELECT
  COUNT(*) - COUNT(DISTINCT order_id)                    AS duplicate_keys,
  SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END)   AS missing_customer,
  SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END)            AS negative_amounts
FROM orders;
```

| duplicate_keys | missing_customer | negative_amounts |
|----------------|------------------|------------------|
| 1 | 1 | 2 |

Each non-zero value is a failed check.

## Policy matters as much as checks

- **Blocking**: uniqueness, schema, required fields. Stop the publish step.
- **Warning**: volume and distribution anomalies. Alert and investigate.
- Record results over time so thresholds can be based on history.

## Common mistakes

1. Checking only after publishing, when consumers have already seen bad data.
2. Static thresholds that alert every weekend.
3. Checks with no owner or response plan.

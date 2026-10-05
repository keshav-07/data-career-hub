---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "What is Unity Catalog used for?"
seoTitle: "What Is Unity Catalog Used For? Interview Answer"
description: "Interview answer: Unity Catalog centrally governs Databricks data with a catalog.schema.table namespace, SQL grants, fine-grained masks, lineage and auditing."
inventoryId: "INT-19"
technology: ["databricks"]
topic: ["governance", "security"]
difficulty: "Easy"
questionType: ["conceptual"]
estimatedMinutes: 6
interviewRelevance: "Medium"
shortAnswer: "Unity Catalog is Databricks' central governance layer. It gives every table, view, volume and model a three-level name (catalog.schema.table), manages permissions with SQL grants to users, groups and service principals, supports row filters and column masks for sensitive data, and records lineage and audit logs. Because it lives in a metastore shared by workspaces, the same access rules apply wherever the data is used."
followUps: ["What is the difference between a managed and an external table?", "How would you restrict access to a column containing email addresses?", "Why should production jobs run as service principals?"]
related: ["articles:databricks/unity-catalog-governance"]
versionContext: "Describes Databricks as documented in 2026; Databricks renames products frequently, so check current names. Examples were not executed in a Databricks workspace"
---

## Detailed explanation

| Capability | What it gives you |
|------------|-------------------|
| Three-level namespace | Clear organisation by environment or domain |
| Grants | `GRANT SELECT ON TABLE ... TO group` |
| Row filters, column masks | Fine-grained protection of sensitive data |
| Lineage | Impact analysis and traceability down to columns |
| Audit logs | Who accessed what, and when |

## Example

```sql
GRANT USE CATALOG ON CATALOG prod TO `analysts`;
GRANT USE SCHEMA ON SCHEMA prod.sales TO `analysts`;
GRANT SELECT ON TABLE prod.sales.orders TO `analysts`;
```

## Common mistakes

1. Granting to individuals.
2. Forgetting catalog/schema privileges.
3. Confusing managed and external tables when dropping them.

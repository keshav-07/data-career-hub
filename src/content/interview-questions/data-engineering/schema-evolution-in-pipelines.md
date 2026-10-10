---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How do you handle schema changes from upstream sources in a pipeline?"
seoTitle: "Upstream Schema Changes: Interview Answer"
description: "Interview answer: detect drift on every run, classify changes as additive or breaking, evolve automatically only for safe ones, and manage the rest with contracts and expand-contract."
technology: ["data-engineering", "kafka"]
topic: ["schema-evolution", "data-contracts", "reliability"]
difficulty: "Medium"
questionType: ["scenario", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "I detect schema drift on every run by comparing the incoming schema with the expected one, then classify the change. Additive changes such as a new nullable field are safe: I let them flow into the raw layer automatically and add them to curated models deliberately. Breaking changes (a removed or renamed field, a narrowed type, a changed meaning) stop the affected pipeline with a clear alert instead of writing nulls or bad casts. To prevent surprises I put a contract or a schema registry with compatibility rules in front of important sources, and change our own tables with expand-contract migrations: add the new column, backfill, move readers, then drop the old one."
followUps: ["What do BACKWARD and FORWARD compatibility mean in a schema registry?", "Where do you keep fields you do not recognise yet?", "How would you rename a column in a table that twenty dashboards read?", "What is the risk of automatic schema merging in the curated layer?"]
related: ["interview-questions:delta-lake/schema-evolution-safety", "articles:delta-lake/schema-evolution-patterns", "articles:etl-elt/pipeline-observability", "articles:etl-elt/data-quality-checks-contracts", "system-designs:schema-registry-contract-system", "articles:etl-elt/cdc-patterns-and-failure-modes"]
sources:
  - { label: "Confluent documentation: Schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
  - { label: "Delta Lake documentation: Schema evolution", url: "https://docs.delta.io/latest/delta-batch.html" }
versionContext: "Python verified on Python 3.11 (standard library)"
---

## Detailed explanation

Upstream teams change their systems without thinking about your pipeline, and they should not have to. The pipeline's job is to notice every change, absorb the safe ones and stop loudly on the unsafe ones. The [Delta Lake question on schema evolution](/interview/delta-lake/schema-evolution-safety/) covers how a table format applies a change; this question is about the pipeline policy around it.

### 1. Detect

Compare the incoming schema (file header, Parquet schema, event schema, CDC schema change event, `information_schema`) with the expected schema on every run. Store the expected schema in version control or the data contract, not in someone's memory.

### 2. Classify

| Change | Safe to automate? | Why |
|--------|-------------------|-----|
| New optional field | Yes, into raw | Old readers ignore it |
| Field becomes nullable | Mostly | Readers that assume non-null may break |
| Type widened (int to bigint) | Usually | Values still fit |
| Field removed | No | Downstream reads nulls silently |
| Field renamed | No | Looks like remove plus add; data splits across two columns |
| Type narrowed or changed (number to text) | No | Casts fail or corrupt values |
| Meaning changed (amount now excludes tax) | Cannot be detected by schema | Only contracts and communication catch it |

### 3. Respond by layer

- **Raw layer**: be permissive. Land new fields, and keep unrecognised or unparseable values in a rescue column (for example, a JSON column of unknown fields; Databricks Auto Loader calls it `_rescued_data`) so nothing is lost.
- **Curated layer**: be strict. Add new columns deliberately, with a pull request and tests. Automatic schema merging into curated tables turns every upstream typo into a permanent column.
- **Breaking changes**: fail the affected pipeline, alert the owner with the exact diff, and keep serving the last good data.

### 4. Prevent

- A **schema registry** with compatibility rules for events. BACKWARD compatibility (the default in Confluent Schema Registry) means consumers on the new schema can read data written with the previous one, which allows deleting fields and adding fields with defaults; FORWARD means consumers on the old schema can read new data; FULL requires both. An incompatible schema is rejected at registration, before any consumer sees it.
- **Data contracts** for important tables, checked in the producer's CI.
- **Expand-contract** for your own tables: add the new column, write both, backfill, move readers, then remove the old column after a notice period.

## Example: classify a schema diff

```python
WIDENINGS = {("int", "bigint"), ("float", "double"), ("int", "double")}

def classify(expected: dict, incoming: dict) -> list[tuple[str, str, str]]:
    changes = []
    for col, typ in incoming.items():
        if col not in expected:
            changes.append((col, f"added {typ}", "safe"))
        elif typ != expected[col]:
            kind = "safe" if (expected[col], typ) in WIDENINGS else "breaking"
            changes.append((col, f"{expected[col]} -> {typ}", kind))
    for col in expected.keys() - incoming.keys():
        changes.append((col, "removed", "breaking"))
    return sorted(changes)

expected = {"order_id": "bigint", "quantity": "int", "amount": "double", "coupon": "string"}
incoming = {"order_id": "bigint", "quantity": "bigint", "amount": "string", "channel": "string"}

changes = classify(expected, incoming)
for change in changes:
    print(change)
if any(kind == "breaking" for *_, kind in changes):
    print("stop: breaking schema change, alerting owner")
```

```text
('amount', 'double -> string', 'breaking')
('channel', 'added string', 'safe')
('coupon', 'removed', 'breaking')
('quantity', 'int -> bigint', 'safe')
stop: breaking schema change, alerting owner
```

`coupon` and `channel` together might be a rename; the pipeline cannot know, which is exactly why renames are treated as breaking and resolved by a person.

## Trade-offs and pitfalls

- Failing on every change is safe but noisy; evolving on every change is convenient and lets breaking changes through. Classify, and decide per layer.
- A pipeline that stops on a breaking change needs a fast path to resume: a reviewed mapping or migration, then a backfill of the paused interval.
- CDC sources emit schema changes as events; make sure the apply step handles them rather than crashing on the first unknown column.
- Semantic changes are the most dangerous and are invisible to schema checks; distribution checks (for example, average amount suddenly 19% lower) are the only automated signal.

## Common mistakes

1. Automatic schema merging straight into curated tables.
2. Treating a removed field as "now null" and publishing it.
3. Casting incompatible types silently, turning bad values into nulls.
4. Renaming a column in place in a table with many readers.

---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you evolve Kafka message schemas safely with a Schema Registry?"
seoTitle: "Kafka Schema Evolution and Schema Registry"
description: "Interview answer: enforce a compatibility mode per subject, change only fields with defaults, deploy in the order the mode needs, and ship breaks as new topics."
technology: ["kafka"]
topic: ["schema-registry", "schema-evolution", "data-contracts"]
difficulty: "Medium"
questionType: ["conceptual", "scenario"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "Producers serialise with a schema registered in a schema registry, and each record carries a schema ID so consumers decode it with the exact writer schema. Each subject (by default <topic>-value) has a compatibility mode that the registry enforces when a new version is registered. With BACKWARD, the default, new consumers can read old data, so you may delete fields or add fields with defaults and must upgrade consumers first; FORWARD lets old consumers read new data, so producers go first; FULL allows either order but only optional-field changes. Use a transitive mode when old data is replayed, register schemas from CI with auto-registration off, and ship genuinely breaking changes as a new topic with dual writes and a consumer migration."
followUps: ["Why is renaming a field breaking in Avro?", "When do you need BACKWARD_TRANSITIVE instead of BACKWARD?", "How do several event types share one topic with a registry?", "What happens if a producer writes plain JSON to a topic whose consumers use the Avro deserialiser?"]
related: ["articles:kafka/schema-registry-schema-evolution", "system-designs:schema-registry-contract-system", "articles:delta-lake/schema-evolution-patterns", "interview-questions:kafka/poison-messages-dlq"]
versionContext: "Compatibility rules follow the Confluent Schema Registry documentation and the Avro 1.12 specification (October 2026). The compatibility check below is a simplified plain Python 3.11 model of the Avro record rules and was run; the curl call needs a running registry."
sources:
  - { label: "Confluent documentation: Schema evolution and compatibility", url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html" }
  - { label: "Apache Avro specification: Schema resolution", url: "https://avro.apache.org/docs/1.12.0/specification/" }
---

## Detailed explanation

Kafka stores bytes and never checks their shape. A schema registry adds the contract:

1. The producer's serialiser looks up the schema under a **subject** (by default `<topic>-value` and `<topic>-key`), gets its global **schema ID**, and writes a magic byte, the 4-byte ID and the encoded payload.
2. The consumer's deserialiser fetches the writer schema by ID and decodes, resolving it against the consumer's reader schema.
3. When a new version is registered, the registry **checks compatibility** against earlier versions using the subject's mode and rejects breaking changes.

| Mode | Guarantees | Allowed (Avro) | Deploy first |
|------|------------|----------------|--------------|
| `BACKWARD` (default) | New schema reads data written with the previous one | Delete fields; add fields with defaults | Consumers |
| `FORWARD` | Previous schema reads data written with the new one | Add fields; delete fields with defaults | Producers |
| `FULL` | Both | Add or delete fields with defaults | Either |
| `*_TRANSITIVE` | Same, against **all** earlier versions | Same | Same |
| `NONE` | Nothing | Anything | Coordinated big bang |

The rule that passes every mode: **add or remove only fields that have defaults, never rename, never change a type** (except Avro promotions such as `int` to `long`). For Protobuf, never reuse or renumber fields and mark removed numbers `reserved`.

## Example

Adding a field with and without a default, checked against the previous version with a simplified model of Avro resolution:

```python
def can_read(reader, writer):
    """Avro record resolution for flat records: reader fields need a writer field or a default."""
    w = {f["name"]: f for f in writer}
    return all(f["name"] in w or "default" in f for f in reader)

v1 = [{"name": "order_id", "type": "long"}, {"name": "amount", "type": "double"}]
with_default = v1 + [{"name": "channel", "type": ["null", "string"], "default": None}]
without_default = v1 + [{"name": "channel", "type": "string"}]

for label, v2 in [("add channel with default", with_default), ("add channel, no default", without_default)]:
    backward = can_read(v2, v1)     # new consumer reads old data
    forward = can_read(v1, v2)      # old consumer reads new data (extra writer fields are ignored)
    print(f"{label:26} BACKWARD={backward} FORWARD={forward} FULL={backward and forward}")
```

```text
add channel with default   BACKWARD=True FORWARD=True FULL=True
add channel, no default    BACKWARD=False FORWARD=True FULL=False
```

In CI, ask the registry before registering:

```bash
jq -n --rawfile s order_v2.avsc '{schema: $s}' | \
  curl -s -X POST -H "Content-Type: application/vnd.schemaregistry.v1+json" --data @- \
  http://schema-registry:8081/compatibility/subjects/orders-value/versions/latest
```

## Trade-offs and pitfalls

- **Strict modes slow change**: FULL_TRANSITIVE is safest for long-lived topics but allows only optional-field changes; BACKWARD is the usual balance.
- **Non-transitive checks miss multi-step breaks**: remove a field in v2, re-add it with another type in v3; each step passes, but v3 cannot read v1 records still in the topic.
- **Auto-registration** (`auto.register.schemas=true` by default in serialisers) lets any deployment change the contract; disable it in production.
- **Key schemas matter for partitioning**: changing a key's type or encoding moves records to other partitions.
- **Breaking changes** belong in a new topic (`orders.v2`) with dual writes or a converter, then a consumer-by-consumer migration.
- **The registry is critical infrastructure**: its data lives in a compacted topic (`_schemas`), and losing it makes every encoded record unreadable.

## Common mistakes

1. Renaming a field and expecting the registry to treat it as the same field.
2. Setting the subject to `NONE` to get a change through.
3. Upgrading producers first under BACKWARD compatibility.

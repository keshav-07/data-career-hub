---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Schema Registry and Data Contract System"
seoTitle: "Design a Schema Registry and Data Contracts"
description: "A system-design case study for schema governance: a schema registry, compatibility modes, data contracts with owners and SLAs, CI checks and safe migrations."
technology: ["data-engineering", "kafka", "etl-elt"]
topic: ["governance", "schema-evolution", "data-contracts", "architecture"]
tags: ["schema-registry", "data-contracts", "avro", "protobuf", "compatibility", "ci-checks"]
difficulty: "Advanced"
problem: "Design a schema registry and data contract system for a company where 60 product teams publish events to Kafka and expose database tables to the data platform, so that producers can evolve their data without breaking hundreds of downstream pipelines, dashboards and ML models, and breaking changes are caught before deployment rather than in production."
functionalRequirements:
  - "Register and version schemas for every Kafka topic and every shared table"
  - "Enforce compatibility rules on each new schema version, per subject"
  - "Attach a contract to each dataset: owner, schema, semantics, quality expectations, freshness SLA, classification and consumers"
  - "Check contracts in producers' CI pipelines before deployment"
  - "Validate data against contracts at runtime and route violations"
  - "Support planned breaking changes with versioned datasets and migration windows"
nonFunctionalRequirements:
  - "Registry lookups add negligible latency to producers and consumers (schemas cached by id)"
  - "Registry highly available; producers keep working with cached schemas during short outages"
  - "No incompatible schema reaches production topics without an explicit, approved migration"
  - "Contracts discoverable and readable by humans, stored as code with review"
  - "Personal data fields identified in every contract"
scaleAssumptions:
  - "Assumption: 2,000 Kafka topics and 1,500 shared tables"
  - "Assumption: about 50 schema changes a week"
  - "Assumption: 400 downstream pipelines, 2,000 dashboards, 50 ML models"
  - "Assumption: 60 producing teams with different release cycles"
architectureSummary: "A schema registry stores versioned Avro or Protobuf schemas per subject with compatibility modes; serializers embed a schema id in every message and cache schemas. Data contracts are YAML files in producers' repositories, combining schema, semantics, quality rules, SLAs, classification and owners. CI validates contract changes against the registry's compatibility rules and against registered consumers' declared usage. At runtime, the ingestion layer validates records and quality expectations, sending violations to quarantine, and the catalog publishes contracts and lineage."
technologies: ["Schema registry (for example Confluent Schema Registry or a compatible service)", "Avro or Protobuf serialisation (JSON Schema where needed)", "Apache Kafka", "Contract files in Git with CI checks", "Data catalog with lineage", "Data quality framework at ingestion and in pipelines", "Quarantine (dead-letter) topics and tables"]
tradeoffs:
  - decision: "Binary schemas (Avro or Protobuf) with a registry"
    alternative: "Schemaless JSON"
    reason: "Compact messages, typed fields, and machine-checkable evolution rules"
    consequence: "Producers need serialiser libraries and registry access; debugging needs tooling"
  - decision: "Backward compatibility as the default mode"
    alternative: "Full or no compatibility"
    reason: "Consumers can upgrade after producers and still read old data, which suits replays from retained topics"
    consequence: "Old consumers may fail on new data unless changes are also forward compatible; some teams need full"
  - decision: "Contracts as code in the producer's repository"
    alternative: "Contracts in a central wiki or catalog only"
    reason: "Changes are reviewed with the code that causes them and checked in CI"
    consequence: "Every producing team must adopt the workflow"
  - decision: "Shift-left CI checks plus runtime validation"
    alternative: "Only runtime validation"
    reason: "Most breaking changes are caught before deployment; runtime catches the rest (semantic and data-value errors)"
    consequence: "Two enforcement points to maintain"
  - decision: "Quarantine invalid records instead of failing pipelines"
    alternative: "Reject the whole batch or stop the stream"
    reason: "One bad producer does not stop all consumers"
    consequence: "Quarantine needs owners, alerts and a replay path"
interviewFollowUps:
  - "What is the difference between backward and forward compatibility, and which one lets you replay old data with new consumers?"
  - "A team wants to rename a field. Walk through the process."
  - "How do you catch a semantic change, such as amounts switching from cents to euros, that no schema check would notice?"
  - "What happens to producers if the schema registry is down?"
  - "How do you find out who consumes a field before a team removes it?"
  - "How do contracts work for tables replicated by CDC from application databases?"
related:
  - "system-designs:kafka-ingestion-system"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "articles:delta-lake/schema-evolution-patterns"
  - "interview-questions:delta-lake/schema-evolution-safety"
  - "articles:delta-lake/parquet-vs-avro-vs-orc"
versionContext: "Compatibility levels (NONE, BACKWARD, BACKWARD_TRANSITIVE, FORWARD, FORWARD_TRANSITIVE, FULL, FULL_TRANSITIVE), the default of backward, and subject naming strategies were checked against the Confluent Schema Registry source code; resolution rules against the Avro specification. The compatibility checker is a simplified Python illustration run with Python 3 via scripts/verify-examples.py, not a full Avro implementation."
sources:
  - { label: "Apache Avro specification: schema resolution", url: "https://avro.apache.org/docs/1.12.0/specification/#schema-resolution" }
  - { label: "Confluent Schema Registry source: compatibility levels", url: "https://github.com/confluentinc/schema-registry/blob/master/client/src/main/java/io/confluent/kafka/schemaregistry/CompatibilityLevel.java" }
  - { label: "Delta Lake documentation: schema validation", url: "https://docs.delta.io/latest/delta-batch.html#schema-validation" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
previous: "system-designs:backfill-late-data-handling-system"
next: "system-designs:self-serve-analytics-platform"
---

## Approach

Most data incidents start with an upstream change nobody told the data team about: a renamed column, a new enum value, a unit change. A schema registry handles the **structural** part (is this new version readable?). A data contract widens that to **meaning, quality and ownership** (what does this field mean, how fresh is it, who do I call?). The design question is how to make both enforceable without slowing 60 teams down.

Clarifying questions:

- **What data is covered?** Kafka events only, or also CDC tables, files and APIs?
- **Serialisation formats** in use today, and how much is schemaless JSON?
- **Who owns what?** Is every topic and table owned by a producing team?
- **How do consumers declare dependencies?** Is there lineage?
- **Enforcement appetite**: block deployments, or warn first?
- **Regulatory needs**: personal data classification, retention per field?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Contract files</strong>: each producing repository holds contracts (schema, semantics, quality rules, SLA, classification, owner) next to the code that produces the data.</li>
<li><strong>CI checks</strong>: on every change, CI validates the contract, tests compatibility against the registry, and checks registered consumers' declared fields.</li>
<li><strong>Schema registry</strong>: on deploy, the new schema version is registered under its subject; incompatible versions are rejected by the registry's compatibility mode.</li>
<li><strong>Producers</strong>: serialisers look up or register the schema, cache its id, and prefix every message with the id.</li>
<li><strong>Consumers</strong>: deserialisers fetch the writer's schema by id (cached) and resolve it against their own reader schema.</li>
<li><strong>Runtime validation</strong>: ingestion checks value-level rules (ranges, enums, null rates) and routes violations to quarantine.</li>
<li><strong>Catalog and lineage</strong>: contracts, versions, owners and consumers are published for discovery and impact analysis.</li>
</ol>
<figcaption>Contracts are reviewed with code, checked in CI, enforced by the registry at deploy time and by validation at runtime.</figcaption>
</figure>

## Schema registry fundamentals

- A **subject** is the unit of versioning. With the default topic-name strategy, a topic's value schema lives under `<topic>-value`; record-name strategies let one topic carry several event types, each versioned separately.
- Each schema version gets a **global id**. Messages carry the id (a few bytes), not the schema, so messages stay small and consumers always know the exact writer schema.
- **Compatibility modes** decide which changes the registry accepts: `NONE`, `BACKWARD`, `BACKWARD_TRANSITIVE`, `FORWARD`, `FORWARD_TRANSITIVE`, `FULL` and `FULL_TRANSITIVE`. Confluent Schema Registry defaults to backward.

| Mode | Guarantee | Typical safe changes (Avro) | Upgrade order |
|---|---|---|---|
| Backward | New schema can read data written with the previous schema | Add fields with defaults, delete fields | Consumers first |
| Forward | Previous schema can read data written with the new schema | Add fields, delete fields that had defaults | Producers first |
| Full | Both directions | Add or delete fields that have defaults | Any order |
| `*_TRANSITIVE` | Same, against all earlier versions, not just the previous one | As above | As above |

Transitive modes matter for **replay**: a consumer reading a topic from the beginning must handle every historical version, not just the last one.

## A compatibility check, illustrated

A simplified checker following Avro's resolution idea: a reader can decode writer data if every reader field either exists in the writer schema with a compatible type (identical, or a permitted promotion such as int to long) or has a default.

```python
PROMOTIONS = {("int", "long"), ("int", "double"), ("long", "double"), ("float", "double")}

def can_read(reader, writer):
    """Simplified Avro-style rule: can a consumer with `reader` decode data written with `writer`?"""
    problems = []
    for name, spec in reader.items():
        if name not in writer:
            if "default" not in spec:
                problems.append(f"reader field '{name}' missing in writer data and has no default")
        elif spec["type"] != writer[name]["type"] and (writer[name]["type"], spec["type"]) not in PROMOTIONS:
            problems.append(f"type of '{name}' changed {writer[name]['type']} -> {spec['type']}")
    return problems

v1 = {"order_id": {"type": "long"}, "amount": {"type": "int"}, "currency": {"type": "string"}}
v2_ok = {**v1, "amount": {"type": "long"}, "channel": {"type": "string", "default": "web"}}
v2_bad = {"order_id": {"type": "long"}, "amount": {"type": "string"},
          "currency": {"type": "string"}, "channel": {"type": "string"}}

for label, new in [("v2_ok", v2_ok), ("v2_bad", v2_bad)]:
    backward = can_read(new, v1)   # new consumers read old data
    forward = can_read(v1, new)    # old consumers read new data
    print(label, "BACKWARD:", backward or "compatible")
    print(label, "FORWARD: ", forward or "compatible")
```

```text
v2_ok BACKWARD: compatible
v2_ok FORWARD:  ["type of 'amount' changed long -> int"]
v2_bad BACKWARD: ["type of 'amount' changed int -> string", "reader field 'channel' missing in writer data and has no default"]
v2_bad FORWARD:  ["type of 'amount' changed string -> int"]
```

`v2_ok` widens `amount` from int to long and adds `channel` with a default: backward compatible (new consumers read old data), but **not** forward compatible, because old consumers cannot narrow long values back to int. That asymmetry is why the upgrade order in the table matters. `v2_bad` changes a type and adds a required field, which no mode accepts. Real registries implement the full rules (unions, enums, nested records, Protobuf field numbers); this sketch only shows the idea.

## Data contracts

A contract is a reviewed file, for example:

<!-- noexec -->
```yaml
dataset: orders.order_placed
version: 3
owner: team-checkout
schema_subject: orders.order_placed-value
semantics:
  amount_minor: "Order total in minor currency units (cents), including tax, excluding shipping"
  currency: "ISO 4217 code"
quality:
  - amount_minor >= 0
  - currency in [EUR, GBP, USD]
  - null_rate(customer_id) == 0
freshness_sla: "95% of events in Kafka within 60 seconds of order placement"
classification:
  customer_id: pseudonymous-id
  email: personal-data
consumers: [finance-revenue-pipeline, fraud-features, orders-dashboard]
```

What the contract adds beyond the schema:

- **Semantics**: units, inclusions and exclusions. A change from cents to euros keeps the same type and passes every schema check; only a semantic contract and value-level checks (sudden 100× drop in amounts) catch it.
- **Quality expectations** that run at ingestion and in pipelines.
- **SLAs** that monitoring can check.
- **Classification** that drives masking, access and retention.
- **Consumers**, so CI can tell a producer exactly who a change affects.

## Enforcement points

1. **CI (shift left)**: lint the contract, run the registry's compatibility check against the target subject, and fail if a field used by a registered consumer is removed or changes meaning without a version bump.
2. **Registry (deploy time)**: the compatibility mode rejects incompatible registrations even if CI was bypassed. Disable auto-registration of schemas by production producers so only the deployment pipeline registers schemas.
3. **Runtime**: ingestion validates value-level rules; invalid records go to a quarantine topic or table with the reason, owner is alerted.
4. **Consumers**: pipelines read with an explicit reader schema and fail on unknown required changes rather than silently producing nulls.

## Breaking changes: the migration path

A rename or type change is a **new contract version**:

1. Publish `order_placed.v4` (a new subject or topic) alongside v3.
2. The producer **dual-writes** v3 and v4 for a migration window.
3. Consumers migrate one by one; lineage shows who is left.
4. When usage of v3 reaches zero (or the window ends with notice), stop v3 and archive it.

For tables, the same idea uses a new versioned table or view, with the old one kept as a compatibility view during the window.

## Late data and replay

Consumers replaying retained topics meet every historical schema version. Transitive compatibility, plus schemas fetched by id from the registry, make that safe. Never delete old schema versions while data written with them is still retained anywhere (Kafka, bronze tables, backups).

## CDC and tables

Application databases replicated by CDC are contracts too, often unintentionally. Agree with application teams which tables are **published interfaces** (with contracts and review) and which are internal (no guarantees, not for direct consumption). Prefer outbox events or curated views over consuming raw application tables.

## Security and governance

- Classification in the contract drives masking policies and access in the warehouse automatically.
- The registry itself needs authentication and authorisation: who may register or delete subjects, change compatibility modes, or read schemas.
- Audit every compatibility-mode change; setting a subject to `NONE` "temporarily" is a common source of incidents.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Registry unavailable | New schema lookups fail | Clients cache schemas by id; run the registry highly available with replicated storage |
| Incompatible schema slipped through (mode set to NONE) | Consumers fail or misread | Revert producer; restore mode; consumers skip or quarantine bad offsets |
| Semantic change without version bump | Wrong numbers downstream | Value-level anomaly checks; contract review; backfill affected outputs |
| Quarantine grows unnoticed | Silent data loss for consumers | Alert on quarantine rate per producer; dashboards per owner |
| Old schema deleted | Old data unreadable | Soft-delete only; block hard deletes while data is retained |

## Monitoring and SLAs

- Schema changes per week, rejected registrations, CI check failures.
- Contract coverage: share of topics and tables with an owner and contract.
- Runtime violation and quarantine rates per dataset.
- Freshness SLA attainment per contract.

## Cost

The registry is cheap to run. The real costs are adoption and process, so make the happy path easy: templates, generated serialisers, CI checks that explain the fix, and a fast review path for compatible changes.

## Scaling to 10×

With 20,000 subjects and 600 teams: federate ownership (teams manage their own contracts within global rules), automate consumer registration from lineage instead of manual lists, and tier enforcement (strict for tier-1 datasets such as revenue, lighter for exploratory data).

## Capacity estimate

Assumptions: 3,500 datasets; average 15 versions each over a few years; schemas of about 5 KB; producers and consumers cache schemas.

- **Registry storage**: 3,500 × 15 × 5 KB ≈ 260 MB: trivial.
- **Lookup load**: with caching, lookups happen only at client start-up and on new ids, so even thousands of clients generate a low request rate; without caching, every message would hit the registry, which is the classic misconfiguration.
- **Message overhead**: in Confluent's classic wire format a schema id adds 5 bytes per message (a magic byte plus a 4-byte id), far less than embedding field names as JSON does. Recent serialiser versions can also carry the schema id in a Kafka record header instead; check what your client libraries support.
- **CI checks**: about 50 schema changes a week, each one or a few compatibility requests.

## What a strong answer includes

- Registry concepts: subjects, versions, ids in messages, caching.
- Correct definitions of backward, forward, full and transitive compatibility, and the upgrade order each implies.
- Contracts that add semantics, quality, SLAs, classification, ownership and consumers.
- Enforcement in CI, at registration and at runtime, with quarantine.
- A migration path for breaking changes with dual-writing and lineage-driven retirement.
- Recognition that semantic changes need value-level checks, not just schema checks.

## Common mistakes

- Mixing up backward and forward compatibility.
- Letting producers auto-register any schema in production.
- Setting compatibility to `NONE` to get a release out.
- Treating raw CDC tables of application databases as stable interfaces.
- Relying on schemas to catch unit or meaning changes.
- Deleting old schema versions while data written with them still exists.

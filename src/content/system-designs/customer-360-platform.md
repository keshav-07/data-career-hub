---
title: "Design a Customer 360 Platform"
description: "Customer 360 platform system design: identity resolution, golden records and survivorship, consent, a real-time profile store and privacy by design."
technology: ["data-engineering", "data-warehousing", "spark"]
topic: ["customer-360", "identity-resolution", "architecture"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "A retailer holds customer data in a CRM, an e-commerce platform, a support desk, a loyalty app, marketing tools and web analytics, each with its own ids. Design a Customer 360 platform that resolves these into one customer, builds a trusted profile with history and consent, serves it to analysts and to real-time applications, and respects privacy law."
functionalRequirements:
  - "Ingest customer records and interactions from at least six systems"
  - "Resolve records from different systems to one stable customer id (identity resolution)"
  - "Build a golden profile with survivorship rules, plus derived attributes (lifetime value, segments, churn risk)"
  - "Track consent and communication preferences per channel and purpose"
  - "Serve profiles to analysts (warehouse) and to applications with low-latency lookups by any known identifier"
  - "Push audiences and attributes back to operational tools (reverse ETL)"
nonFunctionalRequirements:
  - "Profile lookups under 20 ms at p99 for applications"
  - "Profile updates from key events visible within 5 minutes; full rebuild daily"
  - "Stable customer ids: merges and splits are tracked, not silently reassigned"
  - "Erasure and consent changes applied across all stores within legal deadlines"
  - "Access to personal data limited, logged and justified"
scaleAssumptions:
  - "Assumption: 40 million source customer records resolving to about 25 million customers"
  - "Assumption: 300 million interactions per day (orders, page views, tickets, emails)"
  - "Assumption: 2,000 profile lookups per second at peak from apps and the website"
  - "Assumption: about 200 profile attributes, of which 30 are needed in real time"
architectureSummary: "Source systems land in the lakehouse or warehouse via CDC and connectors. An identity-resolution job normalises identifiers, matches records deterministically (and probabilistically where allowed), builds an identity graph and assigns stable customer ids through connected components. Survivorship rules build the golden profile; dbt models derive attributes and segments. A key-value profile store serves real-time lookups, a streaming job updates hot attributes, reverse ETL syncs audiences to tools, and a consent service gates every activation."
technologies:
  - "CDC and managed connectors into a lakehouse or warehouse"
  - "Spark (or warehouse SQL) for identity resolution and graph components"
  - "dbt for profile attributes and segments"
  - "Low-latency profile store: DynamoDB, Cassandra, Bigtable or Redis"
  - "Kafka plus Flink or Spark Structured Streaming for real-time attributes"
  - "Reverse ETL (Hightouch, Census) or a CDP's activation layer"
tradeoffs:
  - decision: "Build Customer 360 on the warehouse or lakehouse (composable CDP)"
    alternative: "Buy a packaged customer data platform"
    reason: "Uses data already modelled in the warehouse, with full control over matching rules and governance"
    consequence: "You own identity resolution and activation; a packaged CDP is faster to start for marketing-led teams"
  - decision: "Deterministic matching first, probabilistic only for named use cases"
    alternative: "Probabilistic matching everywhere"
    reason: "Deterministic matches on verified identifiers are explainable and rarely wrong"
    consequence: "Lower match rate; fuzzy matches add reach but risk merging two real people"
  - decision: "Stable customer ids with a merge history table"
    alternative: "Recompute cluster ids from scratch each run"
    reason: "Downstream systems keep their references; merges and splits are auditable"
    consequence: "Id assignment logic is more complex than taking the minimum record id"
  - decision: "Separate real-time profile store for a small attribute set"
    alternative: "Query the warehouse from applications"
    reason: "Millisecond lookups at thousands per second; isolates apps from analytics load"
    consequence: "Two copies of profile data that must be kept in sync and both erased on request"
  - decision: "Consent checked at activation time from a single consent service"
    alternative: "Each tool keeps its own opt-out list"
    reason: "One source of truth for what each customer agreed to, per purpose and channel"
    consequence: "The consent service is on the critical path for every campaign and sync"
interviewFollowUps:
  - "Two customers share a family email address. How does your matching avoid merging them, and how do you split them if it happened?"
  - "Which source wins when CRM and the e-commerce site disagree on a customer's address?"
  - "How does a page view on the website update the profile within minutes?"
  - "A customer withdraws marketing consent. Trace what happens across all systems."
  - "How do you measure the quality of identity resolution?"
  - "When would you buy a CDP instead of building this?"
related:
  - "articles:data-warehousing/slowly-changing-dimensions"
  - "articles:data-warehousing/star-schema"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "system-designs:change-data-capture-platform"
  - "system-designs:reporting-analytics-platform"
previous: "system-designs:reporting-analytics-platform"
next: "system-designs:fraud-detection-pipeline"
versionContext: "The identity-resolution SQL was run on PostgreSQL 16 on a toy dataset; at scale the same connected-components step runs in Spark or the warehouse. Other components are described, not executed."
sources:
  - { label: "PostgreSQL documentation: WITH queries (recursive CTEs)", url: "https://www.postgresql.org/docs/current/queries-with.html" }
  - { label: "Kimball Group: dimensional modelling techniques", url: "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/" }
  - { label: "Debezium documentation", url: "https://debezium.io/documentation/" }
  - { label: "dbt documentation: data tests", url: "https://docs.getdbt.com/docs/build/data-tests" }
---

## Approach

Customer 360 is mostly an **identity and governance** problem. Moving data into one place is the easy part; deciding which records are the same person, which values to trust, and what you are allowed to do with them is where designs succeed or fail. Clarify:

- **Who uses the profile, and for what?** Analytics and segmentation, personalisation on the website, customer service screens, marketing activation?
- **Which identifiers exist in each system?** Email, phone, loyalty number, login id, device ids, postal address.
- **What is the tolerance for wrong merges versus missed matches?** Merging two people is a privacy incident in customer service; missing a match only weakens a campaign.
- **Latency**: does the website need attributes from the last few minutes, or is a daily profile enough?
- **Legal basis and consent**: which jurisdictions, which purposes, how is consent captured today?
- **Build or buy**: is there already a CDP, and what is the warehouse?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingestion</strong>: CDC from CRM, e-commerce and loyalty databases; connectors for support and marketing tools; events (page views, orders) through Kafka.</li>
<li><strong>Standardisation</strong>: normalise identifiers (lowercase and trim emails, E.164 phone numbers, address parsing), validate, and hash where required.</li>
<li><strong>Identity resolution</strong>: build edges between records that share a strong identifier, compute connected components, apply guard rules, and assign stable customer ids with a merge history.</li>
<li><strong>Golden profile</strong>: survivorship rules choose each attribute's value; dbt derives lifetime value, segments and propensities; history kept as SCD Type 2.</li>
<li><strong>Serving</strong>: warehouse tables for analysts; a key-value profile store for applications, indexed by customer id and by every known identifier; streaming updates for hot attributes.</li>
<li><strong>Activation and consent</strong>: reverse ETL pushes audiences to tools after a consent check; erasure and consent changes propagate to every store.</li>
</ol>
<figcaption>Records from many systems are linked through an identity graph into one stable customer, then served for analysis and real-time use under consent rules.</figcaption>
</figure>

Ana buys online with `ANA@example.com `, calls support from `+447700900001`, and is in the CRM with both. Standardisation normalises the email; resolution links the shop record to the CRM record by email, and the support record to the CRM record by phone, so all three become one customer. The golden profile takes her address from the most recent verified order, her name from the CRM, and her marketing consent from the consent service. When she views a product, the event updates `last_seen_at` and `recently_viewed_categories` in the profile store within a minute, and the website personalises her next page.

## Identity resolution

### Matching rules

- **Deterministic**: two records match if they share a strong, verified identifier: login id, loyalty number, verified email, verified phone. Explainable and precise.
- **Probabilistic**: score similarity across weaker fields (name, address, date of birth, device) and match above a threshold. Raises the match rate but can merge two different people. Use it for analytics audiences, not for customer service screens or anything that shows personal data.
- **Guard rules**: ignore identifiers shared by too many records (a shop's default email, `noreply@`, a family phone number). A simple rule: an identifier linking more than N distinct people-like records is excluded from matching and reviewed.

### Connected components

Matches form a graph: records are nodes, shared identifiers are edges. A customer is a connected component, so A–B by email and B–C by phone puts A, B and C together even though A and C share nothing. The toy version below runs on PostgreSQL 16; at 40 million records you would use Spark (GraphFrames or an iterative label-propagation job) or the warehouse's iterative SQL.

```sql
CREATE TABLE source_records (
  record_id TEXT PRIMARY KEY,
  source    TEXT,
  email     TEXT,
  phone     TEXT
);
INSERT INTO source_records VALUES
  ('crm-1',   'crm',     'ana@example.com', '+447700900001'),
  ('shop-7',  'shop',    'ANA@example.com ', NULL),
  ('supp-3',  'support', NULL,              '+447700900001'),
  ('shop-9',  'shop',    'ben@example.com', '+447700900002'),
  ('crm-2',   'crm',     'cara@example.com', NULL);

-- edges: two records share a normalised identifier
CREATE TABLE edges AS
WITH ids AS (
  SELECT record_id, 'email:' || lower(trim(email)) AS identifier FROM source_records WHERE email IS NOT NULL
  UNION ALL
  SELECT record_id, 'phone:' || phone FROM source_records WHERE phone IS NOT NULL
)
SELECT a.record_id AS src, b.record_id AS dst
FROM ids a JOIN ids b ON a.identifier = b.identifier
UNION
SELECT record_id, record_id FROM source_records;

-- connected components: each record takes the smallest reachable record_id as its cluster id
WITH RECURSIVE reach(record_id, member) AS (
  SELECT src, dst FROM edges
  UNION
  SELECT r.record_id, e.dst
  FROM reach r JOIN edges e ON e.src = r.member
)
SELECT record_id, min(member) AS cluster_id
FROM reach
GROUP BY record_id
ORDER BY cluster_id, record_id;
```

```text
 record_id | cluster_id
-----------+------------
 crm-1     | crm-1
 shop-7    | crm-1
 supp-3    | crm-1
 crm-2     | crm-2
 shop-9    | shop-9
```

The shop record with an untidy email and the support record with only a phone number both joined Ana's CRM record. Normalisation did as much work as matching: without `lower(trim(...))` the shop record would have been a separate customer.

### Stable ids, merges and splits

A cluster id derived from "smallest record id" changes when records are added or removed, which would break every downstream reference. Instead:

- Keep a persistent `customer_id` (a UUID) per cluster and a cross-reference table `customer_xref(customer_id, source, source_record_id, valid_from, valid_to)`.
- When a new run merges two existing customers, keep the older id as the survivor and record `(retired_id → survivor_id, merged_at, reason)` in a merge history table. Downstream systems can follow the redirect.
- When a split is needed (a wrong merge found by customer service), create a new id for the separated records and record the split. Splits must be possible manually, because no algorithm is perfect.

### Measuring match quality

Hand-label a sample of pairs each quarter and measure precision (how many matches are correct) and recall (how many true matches were found). Track cluster-size distribution: a sudden giant cluster almost always means a junk identifier slipped past the guard rules.

## Golden profile and survivorship

Each attribute has a rule for which source wins:

| Attribute | Rule |
|---|---|
| Name | CRM if present, else most recent verified source |
| Email | Most recently verified; keep all others as secondary identifiers |
| Postal address | Most recent successful delivery address from orders |
| Marketing consent | Consent service only, never inferred from other sources |
| Date of birth | Loyalty app (customer-entered and verified), else null |

Store the chosen source and timestamp alongside each value, so anyone can see why the profile says what it says. Keep history as SCD Type 2 for attributes used in analysis (segment, tier, region).

## Data model

- `customer` (customer_id, created_at, status, merged_into).
- `customer_xref` (source system ids to customer_id, with validity).
- `customer_identifier` (normalised email, phone, loyalty number to customer_id, with verification flags).
- `customer_profile` (one wide row of golden attributes; SCD2 history in `customer_profile_history`).
- `customer_interaction` facts (orders, sessions, tickets, campaign responses) keyed by customer_id.
- `consent` (customer_id, purpose, channel, status, captured_at, source, evidence).

## Real-time profile serving

Applications cannot query the warehouse for every page view. Publish a **small set of attributes** (about 30) to a key-value store:

- Primary key `customer_id`; secondary lookup items keyed by hashed email, phone and login id that point to the customer_id.
- Batch layer: after the daily build, bulk-load changed profiles.
- Streaming layer: a Flink or Spark job consumes events and updates hot attributes (last seen, cart value, recent categories) with idempotent writes keyed by event id or with a monotonic version.
- Choose the store by read pattern and cloud: DynamoDB or Bigtable for managed scale, Cassandra if self-managed multi-region, Redis as a cache in front when sub-millisecond reads matter.

## Consent and privacy

- **Consent is its own service**, the single source of truth per purpose (marketing, personalisation, analytics) and channel (email, SMS, ads). Every activation path checks it immediately before sending.
- **Minimise**: real-time stores and activation tools receive only attributes they need, and hashed identifiers where the destination supports matching on hashes.
- **Erasure**: a deletion request removes or anonymises the customer across the lakehouse or warehouse, the profile store, the identity graph, reverse-ETL destinations (via their deletion APIs) and backups by expiry. Keep an auditable tombstone list so the person is not re-created by the next ingestion from a system that still holds them.
- **Access**: personal columns masked by default; unmasked access for service roles and justified human roles only, with audit logs.

## Data quality

- Identifier validity rates per source (valid email format, valid phone numbers).
- Match rate per source and cluster-size distribution.
- Golden-record completeness per attribute.
- Reconciliation: every source record maps to exactly one customer id; no orphan xref rows.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Junk identifier creates a giant cluster | Thousands of people merged | Cluster-size alert blocks publish; add identifier to the deny list; rerun |
| Wrong merge reported by a customer | Personal data shown to the wrong person | Manual split tool; incident process; review the rule that caused it |
| Profile store out of sync with warehouse | Inconsistent personalisation | Daily full reconciliation and re-sync of differences |
| Reverse ETL fails | Tools have stale audiences | Retries, alerting, and idempotent upserts so reruns are safe |
| Consent service unavailable | Campaigns cannot be checked | Fail closed: do not send |

## Scaling to 10×

At 400 million records, identity resolution must become **incremental**: only records with new or changed identifiers, plus their existing clusters, are re-resolved each run, instead of rebuilding the whole graph. Partition the profile store and pre-split hot partitions. Stream more attributes only where a use case justifies the cost.

## Monitoring and SLAs

- Daily resolution job completion and duration.
- Match rate, cluster sizes, merges and splits per day.
- Profile store p99 latency and error rate; streaming lag for hot attributes.
- Reverse-ETL sync success and freshness per destination.
- Erasure and consent-change completion times against legal deadlines.

## Capacity estimate

- **Records**: 40 million source records × about 1 KB = 40 GB, small for Spark or a warehouse; identity resolution is compute-bound on joins, not storage-bound.
- **Edges**: assume about 3 identifiers per record and most identifiers shared by 1–3 records; edges are of the order of 100 million, and connected components converge in a handful of iterations when the graph is mostly small clusters.
- **Interactions**: 300 million/day × 0.5 KB ≈ 150 GB/day ≈ 55 TB/year raw.
- **Profile store**: 25 million customers × 30 attributes × about 40 bytes ≈ 30 GB plus identifier lookup items, comfortably in a managed key-value store.
- **Reads**: 2,000 lookups/s is modest for DynamoDB, Bigtable or Cassandra; hot keys are unlikely because traffic spreads across customers.
- **Streaming writes**: if 10% of the 300 million daily interactions update hot attributes, that is about 350 writes/s on average.

## What a strong answer includes

- **Identifier normalisation** and **deterministic matching** with guard rules, with probabilistic matching limited to suitable uses.
- **Connected components** to form customers, and **stable ids** with merge and split history.
- **Survivorship rules** per attribute, with provenance.
- A **dual serving path**: warehouse for analytics and a key-value store for applications.
- **Consent as a first-class service** checked at activation.
- **Erasure across every copy**, including the identity graph and external tools.
- **Quality metrics** for matching (precision, recall, cluster sizes).

## Common mistakes

- Treating Customer 360 as "join all the tables on email".
- Recomputing customer ids every night, breaking references in every downstream system.
- No guard against shared identifiers, producing one customer with 50,000 orders.
- Inferring consent from purchase history or other sources.
- Pushing the whole profile, including sensitive fields, to every marketing tool.
- Forgetting that the identity graph itself is personal data subject to erasure.
- Using fuzzy matching for customer-facing screens, where a wrong merge exposes someone else's data.

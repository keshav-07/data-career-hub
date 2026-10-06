---
title: "Design a GDPR- and PII-Compliant Data Pipeline"
seoTitle: "Design a GDPR and PII Compliant Pipeline"
description: "A system-design case study for privacy by design: classifying PII, minimisation, pseudonymisation, consent, erasure across every copy, crypto-shredding and audit."
technology: ["data-engineering", "delta-lake", "kafka"]
topic: ["gdpr", "pii", "governance"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
problem: "A European e-commerce company streams customer events and database changes into a lakehouse and warehouse for analytics and ML. Design the pipeline so that personal data is identified, minimised and protected at every stage, processing respects consent and purpose, and data-subject requests (access and erasure) are completed across raw data, curated tables, streams, backups and downstream tools within the legal deadline."
functionalRequirements:
  - "Classify personal and special-category data at ingestion and keep the classification in the catalog"
  - "Minimise: drop or transform personal fields that downstream uses do not need"
  - "Pseudonymise identifiers for analytics; keep re-identification under strict control"
  - "Enforce consent and purpose: only process data for purposes the subject agreed to or another legal basis covers"
  - "Handle access and erasure requests across all stores, streams and connected tools, with evidence"
  - "Apply retention limits per dataset and delete data automatically when they expire"
nonFunctionalRequirements:
  - "Erasure completed within one month of the request (GDPR allows extension by two further months for complex cases, with notice)"
  - "No personal data in logs, error messages, Kafka keys or test environments"
  - "All access to identifiable data authenticated, authorised by purpose and audited"
  - "Data stays in approved regions"
  - "Privacy controls must not make the pipeline unreliable or slow to rebuild"
scaleAssumptions:
  - "Assumption: 15 million customers in the EU and UK"
  - "Assumption: 500 million events per day; 200 TB of history in the lakehouse"
  - "Assumption: about 2,000 erasure and 500 access requests per month"
  - "Assumption: 30 downstream tools and processors receive some customer data"
architectureSummary: "Personal data is classified at ingestion through schema annotations and automated detection. A privacy gateway in the ingestion path drops unneeded fields, tokenises direct identifiers into keyed pseudonyms, and encrypts remaining personal fields with per-subject keys held in a KMS-backed key service. Curated and analytics tables carry only pseudonyms; a restricted identity vault maps pseudonyms to real identities. A consent service is checked before activation. A privacy-request orchestrator uses the catalog and lineage to find every copy, deletes rows or destroys keys, purges table history, calls processor deletion APIs, and records evidence."
technologies:
  - "Kafka with schema registry and field-level classification metadata"
  - "Stream processor (Flink or Spark Structured Streaming) acting as privacy gateway"
  - "Cloud KMS and a key service for per-subject keys (crypto-shredding)"
  - "Delta Lake or Iceberg (DELETE, deletion vectors, VACUUM or snapshot expiry)"
  - "Data catalog with lineage and PII tags; warehouse masking and row access policies"
  - "Privacy-request orchestrator (workflow engine) and consent service"
tradeoffs:
  - decision: "Pseudonymise at ingestion with a keyed hash"
    alternative: "Store raw identifiers and mask at query time"
    reason: "Analytics tables never contain direct identifiers, which shrinks the blast radius of a leak and of erasure"
    consequence: "Joins to identified systems go through the identity vault; pseudonymised data is still personal data under GDPR"
  - decision: "Crypto-shredding for large immutable stores"
    alternative: "Physically delete rows in every file and backup"
    reason: "Destroying one subject's key makes their encrypted fields unreadable everywhere, including backups"
    consequence: "Key service becomes critical; encrypted fields cannot be filtered or aggregated directly"
  - decision: "Physical deletes plus history purge in curated tables"
    alternative: "Soft-delete flags"
    reason: "Soft deletes leave the data in place; table history and old files must also go"
    consequence: "Regular VACUUM or snapshot expiry, and deletes are batched for cost"
  - decision: "Lineage-driven request orchestration"
    alternative: "A manual checklist of systems per request"
    reason: "New tables and tools are covered automatically when lineage and tags are complete"
    consequence: "Depends on catalog completeness; gaps must be monitored"
  - decision: "Retention enforced by automated expiry per dataset"
    alternative: "Keep everything in case it is useful"
    reason: "Storage limitation is a legal principle and every retained byte is erasure work"
    consequence: "Some historical analysis is no longer possible"
interviewFollowUps:
  - "A customer asks to be erased. Walk through every place their data lives in your design."
  - "Is hashing an email address enough to make the data anonymous?"
  - "How do you delete one person from an append-only Kafka topic or immutable Parquet files?"
  - "How do you stop personal data leaking into logs and test environments?"
  - "How does consent change what the pipeline does with an event?"
  - "How do you prove to an auditor that an erasure was completed?"
related:
  - "articles:databricks/unity-catalog-governance"
  - "articles:delta-lake/transactions-schema-evolution"
  - "system-designs:data-catalog-lineage-system"
  - "system-designs:customer-360-platform"
  - "system-designs:scalable-lakehouse"
previous: "system-designs:data-catalog-lineage-system"
next: "system-designs:clickstream-data-platform"
versionContext: "The pseudonymisation and crypto-shredding sketch runs on Python 3 with the cryptography package (Fernet); production systems keep keys in a KMS. This page explains engineering patterns and is not legal advice."
sources:
  - { label: "Delta Lake documentation: deletion vectors", url: "https://docs.delta.io/delta-deletion-vectors/" }
  - { label: "Delta Lake documentation: table batch reads and writes", url: "https://docs.delta.io/latest/delta-batch.html" }
  - { label: "Apache Iceberg table specification", url: "https://iceberg.apache.org/spec/" }
  - { label: "Unity Catalog documentation", url: "https://docs.databricks.com/en/data-governance/unity-catalog/index.html" }
  - { label: "Apache Kafka documentation: design (log compaction)", url: "https://kafka.apache.org/documentation/#design" }
---

## Approach

Privacy cannot be bolted on at the end, because every copy of personal data becomes erasure work. The design goal is **privacy by design**: identify personal data early, keep as little of it as possible, keep identifiers out of most stores, and make erasure a routine, automated, evidenced process. This page describes engineering patterns; legal interpretation belongs to the company's privacy and legal teams. Ask:

- **Which jurisdictions and regulations?** GDPR, UK GDPR, CCPA, sector rules?
- **Which personal data, and is any special-category** (health, biometrics) or children's data?
- **Purposes and legal bases**: analytics, personalisation, marketing, fraud prevention? Consent for which?
- **Where is data stored and processed?** Regions, processors, third-party tools.
- **Volume of data-subject requests** and current turnaround.
- **Retention rules** per dataset (finance records often have legal minimums that override erasure).

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Producers</strong> publish events whose schemas annotate each field's classification (direct identifier, quasi-identifier, sensitive, none).</li>
<li><strong>Privacy gateway</strong> (stream job): drops fields not needed, replaces direct identifiers with keyed pseudonyms, encrypts remaining personal fields with the subject's key, and tags records with purpose and consent snapshot.</li>
<li><strong>Lakehouse</strong>: bronze holds gateway output, not raw identifiable payloads; silver and gold use pseudonyms only; an access-restricted identity vault maps pseudonyms to real identities.</li>
<li><strong>Serving controls</strong>: catalog PII tags drive masking and row access policies; purpose-based access groups; full audit logging.</li>
<li><strong>Consent service</strong>: checked before personalisation, marketing activation and exports.</li>
<li><strong>Privacy-request orchestrator</strong>: finds every copy from lineage and tags, executes deletions or key destruction, purges table history, calls processor APIs, and records evidence.</li>
</ol>
<figcaption>Identify and transform personal data at the edge so that most of the platform never holds direct identifiers.</figcaption>
</figure>

A page-view event arrives with `user_id`, `email`, `ip_address` and `page`. The gateway drops `email` (analytics does not need it), truncates the IP address to a network prefix, replaces `user_id` with a keyed pseudonym, and writes the event to bronze. A purchase event needs the delivery address for operations analytics, so the gateway encrypts the address with the subject's key. Months later the customer requests erasure. The orchestrator destroys the subject's key (making every encrypted field unreadable everywhere, including backups), deletes the subject's rows from tables keyed by pseudonym, removes the identity-vault mapping, purges table history, calls the deletion APIs of the email and CRM tools, and records completion.

## Classify at the source

- **Schema annotations**: each field in the registry carries a classification. Producers declare it; reviewers check it in CI.
- **Automated detection** on samples at ingestion catches undeclared personal data (email or phone patterns in free-text fields).
- **Catalog tags** mirror classifications and follow lineage, so derived columns inherit them.
- Classification drives everything else: gateway transforms, masking policies, retention, and the erasure orchestrator's search.

## Minimise and pseudonymise

- **Drop** what no downstream purpose needs. The cheapest data to protect and erase is data you never stored.
- **Generalise** quasi-identifiers: dates of birth to year or age band, IP addresses to prefixes, postcodes to districts.
- **Pseudonymise** direct identifiers with a keyed hash (HMAC) whose key lives in a KMS outside the lake. A plain unsalted hash of an email is not enough: it can be reversed by hashing a list of known emails. Pseudonymised data is still personal data under GDPR, because re-identification is possible with the key or other data.
- **Anonymisation** (true removal of identifiability) is a higher bar, typically achieved with aggregation and suppression of small groups; only anonymous data falls outside GDPR.

## Erasure across every copy

Erasure is the hardest requirement because data is copied: Kafka topics, raw files, bronze/silver/gold tables, table history, warehouse copies, ML training sets, caches, backups and third-party tools.

| Store | Erasure technique |
|---|---|
| Kafka topics | Short retention for topics with personal data; compacted topics accept a tombstone for the key; encrypted fields are covered by key destruction |
| Raw / bronze files | Crypto-shredding of encrypted fields; or rewrite affected files |
| Delta / Iceberg tables | `DELETE` by pseudonym (deletion vectors make it cheap), then `VACUUM` or snapshot expiry after the retention window to remove old files and time-travel versions |
| Warehouse | `DELETE`; warehouse time travel and fail-safe periods mean physical removal completes after those windows, which should be documented |
| ML features and training sets | Delete from feature stores; retrain or document model retention policy |
| Backups | Expire on a short cycle; crypto-shredding covers encrypted fields in backups |
| Processors (email, CRM, ads) | Call their deletion APIs; record the response |

### Crypto-shredding

Encrypt each subject's personal fields with a key unique to that subject. Deleting the key makes those fields unreadable in every copy, including immutable files and backups you cannot practically rewrite. The sketch below shows both techniques together (Python 3 with the `cryptography` package; in production the keys are held in a KMS-backed key service, not a dictionary):

```python
import hmac, hashlib
from cryptography.fernet import Fernet

PSEUDONYM_KEY = b"rotate-me-and-keep-in-a-kms"   # secret pepper held outside the lake

def pseudonymise(user_id: str) -> str:
    """Stable, keyed pseudonym: joins still work, but the raw id is not stored."""
    return hmac.new(PSEUDONYM_KEY, user_id.encode(), hashlib.sha256).hexdigest()[:16]

subject_keys = {}                                   # in production: a KMS-backed key store

def encrypt_pii(user_id: str, value: str) -> bytes:
    key = subject_keys.setdefault(user_id, Fernet.generate_key())
    return Fernet(key).encrypt(value.encode())

def decrypt_pii(user_id: str, token: bytes) -> str:
    key = subject_keys.get(user_id)
    if key is None:
        return "<erased>"
    return Fernet(key).decrypt(token).decode()

# an event as stored in the lake: pseudonymous id, encrypted email, plain non-personal fields
event = {"user": pseudonymise("u-1001"),
         "email": encrypt_pii("u-1001", "ana@example.com"),
         "page": "/checkout"}
print(event["user"], decrypt_pii("u-1001", event["email"]), event["page"])

del subject_keys["u-1001"]                          # erasure request: destroy the subject's key
print(event["user"], decrypt_pii("u-1001", event["email"]), event["page"])
```

```text
37d6b629900a7ea7 ana@example.com /checkout
37d6b629900a7ea7 <erased> /checkout
```

After the key is destroyed, the email cannot be recovered. Note that the pseudonym `37d6...` still links this subject's events to each other; for full erasure, delete or re-key rows by pseudonym in curated tables and remove the vault mapping, so no remaining record can be tied to the person.

## The privacy-request orchestrator

1. **Verify identity** of the requester through the customer-facing process.
2. **Resolve identifiers**: map the person to every identifier and pseudonym through the identity vault and Customer 360 graph.
3. **Plan**: query the catalog for datasets tagged with those identifier types, and lineage for downstream copies and external destinations.
4. **Check exceptions**: legal holds and retention obligations (for example, invoices) are excluded, with the reason recorded.
5. **Execute**: batched deletes per table (daily batches are far cheaper than one rewrite per request), key destruction, processor API calls.
6. **Verify**: query each store to confirm the subject is gone; schedule history purge confirmation after the retention window.
7. **Record evidence**: what was deleted where and when, without storing the deleted personal data itself.
8. **Prevent re-creation**: keep a suppression list of erased identifiers (hashed) so a re-sync from a source that still holds the person does not bring them back.

**Access requests** follow the same plan step, but export the subject's data in a readable format instead of deleting it.

## Consent and purpose limitation

- The consent service stores consent per subject, purpose and channel, with timestamps and evidence.
- Events carry a consent snapshot or the gateway looks it up, so data for subjects who refused analytics or personalisation is excluded or aggregated before reaching those uses.
- Activation (marketing audiences, ad platforms) checks consent at send time, because consent can be withdrawn after data was collected.
- Access to datasets is granted by purpose: a fraud team's access does not extend to marketing use.

## Security controls

- Encryption in transit and at rest; customer-managed keys for restricted zones.
- No personal data in logs, metrics labels, exception messages or Kafka keys; log scrubbing in shared libraries.
- Test and development environments use synthetic or masked data, never production copies.
- Data residency: storage, processing and backups stay in approved regions; transfers to processors are covered by contracts.
- Audit logs of every read of identifiable data, reviewed for anomalies.

## Retention

Each dataset has a retention period in the catalog, enforced automatically: partition expiry for event tables, lifecycle rules for raw storage, TTLs in key-value stores, and Kafka retention. Shorter retention is the most effective privacy control and also reduces cost.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| A new table with personal data is not tagged | Missed during erasure | Automated detection, CI checks on schemas, coverage reports |
| Erasure batch fails | Deadline risk | Orchestrator retries; requests tracked against their deadline with escalation |
| Key service outage | Cannot read encrypted fields | Highly available key service; decryption is only needed for a few uses |
| Restored backup reintroduces erased people | Data resurrected | Suppression list applied after any restore |
| Personal data found in logs | Uncontrolled copies | Scrub, rotate logs, fix the source library, record as incident |

## Scaling to 10×

At 20,000 erasure requests a month, batch deletes daily per table and use deletion vectors so each batch is a cheap metadata operation, with periodic compaction to make removal physical. Crypto-shredding scales best because its cost does not depend on how many copies exist. Key-service throughput (one key per subject) must handle encryption on the ingestion path; cache data keys briefly in the gateway with envelope encryption.

## Monitoring and SLAs

- Requests open, overdue and completed, with time to completion against the one-month deadline.
- Coverage: share of datasets with classification, retention and lineage.
- Detection of untagged personal data at ingestion.
- Access to identifiable data by user and purpose; unusual access alerts.
- Retention jobs success, and data older than its retention period (should be zero).

## Capacity estimate

- **Requests**: 2,000 erasures/month ≈ 65 a day; batching them daily means one delete per affected table per day rather than 65.
- **Delete cost**: with deletion vectors, deleting 65 subjects' rows from a 200 TB table touches only the files containing them; with clustering by pseudonym on large tables, that is a small number of files per subject.
- **Keys**: 15 million subjects × one data key each, wrapped by a KMS master key; a few hundred bytes per key ≈ a few GB in the key service.
- **Gateway overhead**: 500 million events/day ≈ 5,800 events/s; HMAC and symmetric encryption of a few fields per event are microseconds each, so a handful of stream workers is enough.
- **Purge timing**: if table history is retained for 7 days and warehouse recovery windows add more, physical removal completes within a couple of weeks, inside the one-month deadline.

## What a strong answer includes

- **Classification at the source** that drives every downstream control.
- **Minimisation and keyed pseudonymisation**, with the clear statement that pseudonymous data is still personal data.
- **Erasure across every copy**, including table history, backups, streams and processors.
- **Crypto-shredding** for immutable and backup data.
- **Lineage-driven orchestration** with evidence and a suppression list.
- **Consent and purpose checks** at processing and activation time.
- **Retention enforced automatically.**

## Common mistakes

- Using `DELETE` in a lakehouse and forgetting that time travel and old files still hold the data.
- Plain hashing of emails and calling it anonymisation.
- Soft-delete flags as an erasure mechanism.
- Personal data in Kafka keys, logs and test environments.
- Forgetting third-party tools that received the data through reverse ETL.
- Restoring a backup and silently bringing erased customers back.
- Keeping everything forever, so every request touches years of data.

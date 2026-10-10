---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "How do you handle PII in a data pipeline?"
seoTitle: "Handling PII in Data Pipelines: Interview Answer"
description: "PII in data pipelines, interview answer: minimise what you collect, classify columns, pseudonymise or mask early, restrict access by role, and design for deletion requests."
technology: ["data-engineering", "sql"]
topic: ["pii", "governance", "security"]
difficulty: "Medium"
questionType: ["scenario", "architecture"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "I start by minimising: only ingest personal fields that a use case actually needs. I classify columns (direct identifiers, quasi-identifiers, sensitive data) and tag them in the catalog. Direct identifiers are pseudonymised before or at load with a keyed hash or a token vault, so joins still work but analysts never see raw values; the few people who need raw values get them through a separate, audited, restricted table, column masking or row policies. Everything is encrypted in transit and at rest, and I keep PII out of logs. Finally I design for deletion: personal data is kept in few places, keyed by a subject id, with retention rules and a tested process for erasure requests that includes raw files and table history."
followUps: ["Why is a plain SHA-256 hash of an email not anonymisation?", "How do you honour a deletion request in an append-only data lake?", "What is the difference between pseudonymisation and anonymisation?", "How would you let analysts count unique users without seeing emails?"]
related: ["articles:etl-elt/etl-vs-elt", "system-designs:gdpr-pii-compliant-pipeline", "articles:databricks/unity-catalog-governance", "articles:snowflake/security-access-control"]
sources:
  - { label: "Regulation (EU) 2016/679 (GDPR), Article 4(5): pseudonymisation", url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" }
  - { label: "PostgreSQL documentation: Row security policies", url: "https://www.postgresql.org/docs/current/ddl-rowsecurity.html" }
  - { label: "Python documentation: hmac", url: "https://docs.python.org/3/library/hmac.html" }
versionContext: "SQL verified on PostgreSQL 16.14 and Python on Python 3.11 (standard library). This is engineering guidance, not legal advice."
---

## Detailed explanation

Interviewers want to see that you treat personal data as a design constraint from the start, not as a filter added at the end. Cover five areas.

### 1. Minimise

The safest PII is the PII you never ingest. Ask which use case needs each personal field; drop the rest at extraction. Prefer derived values (age band instead of birth date, city instead of street address) when they answer the question.

### 2. Classify and tag

- **Direct identifiers**: name, email, phone, national id, account number.
- **Quasi-identifiers**: birth date, postcode, gender, job title, which identify people in combination.
- **Special or sensitive categories**: health, biometrics, religion, and similar, which often carry stricter rules.

Tag columns in the catalog (Unity Catalog, Snowflake tags, DataHub) so policies and audits can find them.

### 3. Protect early

| Technique | Reversible? | Joins still work? | Typical use |
|-----------|-------------|-------------------|-------------|
| Drop the column | No | No | Field not needed |
| Keyed hash (HMAC) with a secret key | No, without the key | Yes, same input gives same token | Counting and joining users |
| Tokenisation (vault maps value to token) | Yes, through the vault | Yes | Systems that occasionally need the real value |
| Masking at query time | Data unchanged, view hides it | Yes | Mixed audiences on one table |
| Encryption of the column | Yes, with the key | No (unless deterministic) | Storing values few people may decrypt |
| Aggregation, generalisation | No | No | Published statistics |

A plain hash of an email is weak: emails are guessable, so anyone can hash a candidate list and match it. Use a keyed hash with the key held outside the warehouse. Under GDPR, pseudonymised data is still personal data; only properly anonymised data falls outside it.

### 4. Control access

Role-based access to raw and restricted tables, column masking policies or secure views for everyone else, row-level policies where needed, audit logs of who read what, and service accounts with only the grants they use. Keep PII out of logs, error messages, dead-letter payloads and test fixtures.

### 5. Retention and deletion

Store personal data in as few places as possible, keyed by a stable subject id, with a retention period per dataset. A deletion request must reach every copy: raw files, curated tables, table-format history (time travel, old snapshots need vacuuming), backups according to policy, and downstream extracts. Keeping a mapping from subject id to token in one vault means deleting that mapping can make pseudonymised history unlinkable.

## Example: pseudonymise at load, mask for analysts

```python
import hashlib
import hmac

KEY = b"from-a-secret-manager"     # never hard-code a real key

def token(email: str) -> str:
    return hmac.new(KEY, email.strip().lower().encode(), hashlib.sha256).hexdigest()[:20]

print(token("Asha@Example.com") == token(" asha@example.com"), len(token("a@b.c")))
```

```text
True 20
```

```sql
CREATE TABLE customers_restricted (customer_token text PRIMARY KEY, email text NOT NULL, country text);
INSERT INTO customers_restricted VALUES ('t1', 'asha@example.com', 'DE'), ('t2', 'ben@example.com', 'FR');

-- Analysts query a view: the token for joins, a masked email for support, no raw value.
CREATE VIEW customers_analytics AS
SELECT customer_token,
       left(email, 1) || '***@' || split_part(email, '@', 2) AS email_masked,
       country
FROM customers_restricted;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analyst') THEN CREATE ROLE analyst; END IF;
END $$;
GRANT SELECT ON customers_analytics TO analyst;

SET ROLE analyst;
SELECT * FROM customers_analytics ORDER BY customer_token;
RESET ROLE;
```

| customer_token | email_masked | country |
|----------------|--------------|---------|
| t1 | a***@example.com | DE |
| t2 | b***@example.com | FR |

<!-- expect-error -->
```sql
SET ROLE analyst;
SELECT email FROM customers_restricted;
```

The analyst role can use the view but reading the restricted table fails with `permission denied`. Warehouses offer the same idea as built-in features (Snowflake masking policies, Unity Catalog column masks, BigQuery policy tags).

## Trade-offs and pitfalls

- Transforming before load (ETL) is the strongest protection but loses the raw value for future use cases; agree that trade-off with legal and data owners.
- Tokens can still be personal data when combined with quasi-identifiers; small groups in aggregates can re-identify people, so apply minimum group sizes in published reports.
- Rotating the HMAC key changes every token; plan for it, or use a vault.
- Deletion in immutable storage needs compaction or rewrite plus history cleanup; design partitioning so it is feasible.

## Common mistakes

1. Copying raw production tables with PII into dev and CI environments.
2. Unsalted hashes presented as anonymisation.
3. PII in logs and dead-letter queues, which nobody includes in deletion processes.
4. Granting broad read access to raw layers "temporarily".

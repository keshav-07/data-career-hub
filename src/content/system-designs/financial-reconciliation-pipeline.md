---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Financial Reconciliation Pipeline"
description: "A system-design case study for reconciling a ledger with payment provider and bank files: ingestion controls, matching rules, breaks, ageing and an audit trail."
technology: ["data-engineering", "sql", "etl-elt"]
topic: ["batch", "reconciliation", "architecture"]
tags: ["reconciliation", "finance", "matching", "audit", "idempotency", "control-totals"]
difficulty: "Advanced"
problem: "Design a daily batch pipeline that reconciles the company's internal payment ledger with settlement files from payment service providers (PSPs) and statements from banks, so finance can prove every transaction was received, settled and paid out, and can investigate every difference."
functionalRequirements:
  - "Ingest settlement reports from several PSPs and statements from several banks (CSV, fixed-width, ISO 20022 XML), plus the internal ledger"
  - "Match records one-to-one, one-to-many and many-to-one using configurable rules"
  - "Account for fees, refunds, chargebacks, currency conversion and settlement timing"
  - "Create a break (exception) for every unmatched or mismatched item, with owner, reason and age"
  - "Let finance analysts resolve breaks with comments and evidence, without editing source data"
  - "Produce daily reconciliation summaries and month-end sign-off reports"
nonFunctionalRequirements:
  - "Daily results by 09:00 local time for the previous business day"
  - "Exact decimal arithmetic; no floating-point money"
  - "Every input file loaded exactly once, and its completeness proved with control totals"
  - "Immutable, auditable history: who matched or resolved what, when and why"
  - "Re-running any day produces the same result unless inputs or rules changed, and the change is recorded"
  - "Access restricted to finance roles; data retained for the regulatory period"
scaleAssumptions:
  - "Assumption: 3 million ledger transactions a day"
  - "Assumption: 5 PSPs and 8 bank accounts, about 40 files a day"
  - "Assumption: 98–99% of items match automatically; the rest are breaks"
  - "Assumption: settlement typically happens one to three business days after the transaction"
architectureSummary: "Files arrive in a landing zone and are registered, checksummed and validated against control totals before parsing into typed staging tables. A daily matching job normalises all sides into a common transaction model, applies ordered matching rules (exact reference, then aggregate and tolerance rules), and writes immutable match and break records. A case-management layer tracks break resolution, and summary marts feed finance reporting."
technologies: ["Secure file transfer (SFTP) or provider APIs into object storage", "Cloud warehouse or relational database", "SQL or Spark for matching", "Orchestrator with sensors for expected files", "Break-management UI or ticketing integration", "Audit log storage"]
tradeoffs:
  - decision: "Deterministic rule-based matching in ordered passes"
    alternative: "Machine-learning matching"
    reason: "Auditors and finance need to explain every match; rules are reviewable"
    consequence: "Rules need maintenance as provider formats and business processes change"
  - decision: "Immutable match and break records with versions"
    alternative: "Update rows in place as items match"
    reason: "Audit trail and reproducibility: you can show the state of reconciliation on any past date"
    consequence: "More storage and slightly more complex queries (current version views)"
  - decision: "Daily batch"
    alternative: "Streaming reconciliation"
    reason: "Settlement files and bank statements arrive daily; streaming adds cost without earlier answers"
    consequence: "Intraday issues are found the next morning unless separate real-time checks exist"
  - decision: "Reconcile at transaction level and at settlement-batch level"
    alternative: "Only totals per day"
    reason: "Totals can net out errors; transaction level finds them, batch level ties to bank cash"
    consequence: "More matching passes and more compute"
  - decision: "Fail the load when control totals do not match"
    alternative: "Load what parsed and report counts later"
    reason: "A partial file creates false breaks that waste analyst time and hide real ones"
    consequence: "One bad file delays that provider's reconciliation until it is re-sent"
interviewFollowUps:
  - "A PSP sends the same settlement file twice with a different file name. What happens?"
  - "How do you match a single bank deposit to 40,000 card transactions?"
  - "How do you handle a refund that arrives at the PSP before the original payment settles?"
  - "Finance changes a matching tolerance. How do you keep historical results explainable?"
  - "How would you reconcile intraday for a high-risk payment method?"
  - "How do you handle currency conversion differences?"
related:
  - "system-designs:scalable-batch-pipeline"
  - "system-designs:near-zero-downtime-migration"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:etl-elt/data-quality-checks-contracts"
  - "articles:sql/joins"
  - "interview-questions:data-engineering/idempotent-batch-pipeline"
versionContext: "The matching SQL was run on PostgreSQL 16 with scripts/verify-examples.py. File formats and provider details are described generically."
sources:
  - { label: "PostgreSQL 16: table expressions and joins", url: "https://www.postgresql.org/docs/16/queries-table-expressions.html" }
  - { label: "PostgreSQL 16: conditional expressions (CASE, COALESCE)", url: "https://www.postgresql.org/docs/16/functions-conditional.html" }
previous: "system-designs:marketing-attribution-pipeline"
---

## Approach

Reconciliation is about **proof**. Finance needs to show, for every transaction, that money moved as the ledger says, and to explain every difference. That shapes the design: exact arithmetic, provable completeness of inputs, deterministic rules, and an immutable audit trail. Speed matters less than being able to answer "why was this matched?" a year later.

Clarifying questions:

- **What is being reconciled with what?** Ledger to PSP (did the provider process it?), PSP to bank (did the cash arrive?), or both, forming a three-way reconciliation?
- **Which formats and delivery methods** do providers use, and how reliable are their delivery times?
- **Keys**: does every ledger transaction carry the provider's reference? If not, what can be matched on (amount, date, card suffix, merchant reference)?
- **Fees and netting**: does the PSP pay out net of fees? Are refunds and chargebacks netted into the same payout?
- **Tolerances**: are any differences acceptable (currency rounding)? Who approves tolerances?
- **Timing**: what settlement lag is normal per provider?
- **Regulation and audit**: retention period, segregation of duties, who may resolve breaks?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Receive</strong>: files land in a write-once landing zone; each is registered with provider, business date, checksum and sequence number.</li>
<li><strong>Validate</strong>: format and schema checks, then control totals (record count, sum of amounts) from the file trailer or a separate control file.</li>
<li><strong>Stage</strong>: parse into typed staging tables, keeping file id and line number on every row.</li>
<li><strong>Normalise</strong>: map ledger, PSP and bank records to a common model: reference, amount, currency, type, value date, side.</li>
<li><strong>Match</strong>: ordered rule passes (exact, aggregate, tolerance) write match groups; unmatched items become breaks.</li>
<li><strong>Manage breaks</strong>: assignment, ageing, comments and resolutions; resolutions are new records, never edits.</li>
<li><strong>Report</strong>: daily summaries, ageing reports and month-end sign-off packs.</li>
</ol>
<figcaption>Inputs are proven complete before matching; outputs are append-only so every past state can be reproduced.</figcaption>
</figure>

Walkthrough:

1. **Receive and register.** A file registry row is the unit of idempotency. The **content hash** (not the file name) decides whether a file is new. Providers do resend files, sometimes renamed.
2. **Validate before parsing into business tables.** Count and amount control totals catch truncated transfers and parser bugs. A provider's sequence number catches a missing file (file 41 arrived but 40 never did).
3. **Stage with lineage.** Keeping `file_id` and `line_no` on every row lets an analyst trace a break to the exact line in the original file.
4. **Normalise** hides provider differences. Signs (debit versus credit), amount units (minor units such as cents versus decimals), date meanings (transaction date versus value date) all vary by provider.
5. **Match in passes**, most certain first, so a weak rule never steals an item a strong rule would have matched.
6. **Breaks** are a workflow, not just a table.

## Data model

| Table | Grain | Notes |
|---|---|---|
| `file_registry` | One row per received file | provider, business_date, sha256, sequence_no, control totals, status |
| `stg_<provider>` | One row per file line | raw typed fields, file_id, line_no |
| `recon_item` | One row per normalised item per side | side (ledger, psp, bank), reference, amount, currency, value_date, item_type |
| `match_group` | One row per match | rule id and version, run id, matched_at |
| `match_member` | One row per item in a match | group id, item id, side |
| `break` | One row per break version | item ids, reason code, amount difference, owner, status, valid_from, valid_to |
| `break_action` | One row per analyst action | who, when, action, comment, evidence link |

Money columns are `numeric(p, s)` (or integer minor units). Floating-point types cannot represent most decimal amounts exactly, and sums drift.

## Matching rules

Rules run in order, each against items still unmatched:

1. **Exact one-to-one**: same reference, amount and currency.
2. **One-to-many and many-to-one**: a payout equals the sum of its transactions minus fees and refunds. Group by payout or batch id, compare totals.
3. **Tolerance rules**: same reference, amount differs by less than an approved threshold (for example currency rounding). These produce a match **with** a recorded difference, not a silent pass.
4. **Fallback heuristics**: amount and date window plus partial reference, flagged as lower confidence for human confirmation.

Each match records the rule id and version, so changing a rule never changes the meaning of an old match.

## Worked example: classifying ledger versus PSP

The query compares the ledger with a PSP settlement file. It aggregates PSP lines per reference first so duplicates are visible, and treats a missing settlement as **pending** while it is within the expected settlement lag (here 2 days, as of 3 September).

```sql
CREATE TABLE ledger (txn_id text PRIMARY KEY, psp_ref text, booked_on date, amount numeric(14,2), currency char(3));
CREATE TABLE psp_settlement (line_id int PRIMARY KEY, psp_ref text, settled_on date, gross numeric(14,2), fee numeric(14,2), currency char(3));

INSERT INTO ledger VALUES
  ('T1', 'P-100', '2026-09-01', 50.00, 'EUR'),
  ('T2', 'P-101', '2026-09-01', 75.00, 'EUR'),
  ('T3', 'P-102', '2026-09-01', 20.00, 'EUR'),
  ('T4', 'P-103', '2026-09-02', 10.00, 'EUR');
INSERT INTO psp_settlement VALUES
  (1, 'P-100', '2026-09-03', 50.00, 0.75, 'EUR'),
  (2, 'P-101', '2026-09-03', 70.00, 1.05, 'EUR'),
  (3, 'P-104', '2026-09-03', 30.00, 0.45, 'EUR'),
  (4, 'P-100', '2026-09-03', 50.00, 0.75, 'EUR');

WITH psp AS (
  SELECT psp_ref, currency, sum(gross) AS gross, count(*) AS lines
  FROM psp_settlement
  GROUP BY psp_ref, currency
)
SELECT coalesce(l.psp_ref, p.psp_ref) AS psp_ref,
       l.amount AS ledger_amount, p.gross AS psp_gross, p.lines AS psp_lines,
       CASE
         WHEN p.psp_ref IS NULL AND l.booked_on > date '2026-09-03' - 2 THEN 'pending (within lag)'
         WHEN p.psp_ref IS NULL THEN 'missing at PSP'
         WHEN l.psp_ref IS NULL THEN 'missing in ledger'
         WHEN p.lines > 1 THEN 'duplicate at PSP'
         WHEN l.amount <> p.gross THEN 'amount mismatch'
         ELSE 'matched'
       END AS status
FROM ledger l
FULL OUTER JOIN psp p ON p.psp_ref = l.psp_ref AND p.currency = l.currency
ORDER BY 1;
```

```text
 psp_ref | ledger_amount | psp_gross | psp_lines |        status
---------+---------------+-----------+-----------+----------------------
 P-100   |         50.00 |    100.00 |         2 | duplicate at PSP
 P-101   |         75.00 |     70.00 |         1 | amount mismatch
 P-102   |         20.00 |           |           | missing at PSP
 P-103   |         10.00 |           |           | pending (within lag)
 P-104   |               |     30.00 |         1 | missing in ledger
```

Why each line matters:

- **`FULL OUTER JOIN`** is essential. An inner join would hide both "missing at PSP" and "missing in ledger", which are the most important breaks.
- **Aggregating before joining** stops P-100's duplicate PSP lines from silently doubling the ledger row in the join. Here it surfaces as its own break type.
- **Currency in the join key** prevents a 50 EUR item matching a 50 USD item.
- **Timing**: P-103 was booked on 2 September; with a 2-day lag it is not yet a break. P-102 from 1 September is overdue.
- **Fees** are deliberately not used here. Gross is compared with the ledger; net (gross minus fee) is compared with the bank payout in a separate pass.

## Ingestion controls and idempotency

- **Exactly-once file loading**: insert into `file_registry` with a unique constraint on (provider, sha256). A duplicate insert fails, and the pipeline records "duplicate file ignored" rather than loading again.
- **Corrected files**: providers sometimes send a replacement. Treat it as a new version that supersedes the old one for that business date; reverse the old file's items and load the new one, all within one transaction, with both versions kept.
- **Atomic loads**: stage into a temporary table, validate control totals, then insert into staging in one transaction. Never leave half a file visible.
- **Re-runs**: the matching job for a business date first marks the previous run's open matches and breaks for that date as superseded (new versions), then writes the new results under a new run id. Resolved breaks with analyst actions are carried forward, not lost.

## Late data and timing differences

Settlement lag is normal, not an error. Model it explicitly:

- Each provider has an expected lag (for example T+1 to T+3 business days) using a business-day calendar per currency.
- Items within the lag are **pending**, not breaks. After the lag they become breaks with an age.
- Matching considers a window of unmatched items from previous days, so a late settlement matches the original ledger item and closes its break automatically.

## Data quality

- Control totals per file, sequence-number gaps per provider, and "expected file did not arrive by its cut-off" alerts.
- Totals per business day: ledger total equals matched plus pending plus breaks, per side. If that equation fails, the pipeline itself has a bug.
- Distribution checks on break rate per provider; a jump from 1% to 15% almost always means a format change or a parser bug, not 15% bad payments.

## Security and audit

- Files contain card suffixes, names and account numbers. Restrict to finance roles; mask sensitive fields in analyst views; never store full card numbers.
- Segregation of duties: the person who configures a tolerance rule cannot approve their own change; resolutions above a threshold need a second approver.
- Write-once storage for raw files and append-only tables for matches and actions. Retain for the regulatory period your finance and legal teams specify.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| File missing at cut-off | Provider's reconciliation incomplete | Alert operations; run other providers; mark provider "awaiting file" |
| Control totals mismatch | File rejected | Request re-send; do not partially load |
| Provider changes format | Parse errors or zero rows | Schema checks fail the load; versioned parsers per format |
| Matching bug found after month-end | Wrong historic matches | Re-run affected dates under a new run id; old runs remain for audit, with a documented reason |
| Duplicate ledger postings | Ledger total too high | Shows up as "missing at PSP" breaks; fix in the ledger, not in reconciliation |

## Monitoring and SLAs

- File arrival per provider against expected time; overall completion by 09:00.
- Auto-match rate, open break count and value, and ageing buckets (0–2, 3–7, 8–30, over 30 days).
- Break value as a share of daily volume, which is the number finance leadership watches.

## Cost and scaling to 10×

At 30 million transactions a day:

- Partition `recon_item` by value date and side; only match unmatched items from the open window, never the full history.
- Run providers in parallel; they rarely depend on each other until the bank-level pass.
- Move the heaviest aggregate matching to a distributed engine if the database struggles, keeping the same rules and outputs.
- Break volume grows too; invest in auto-classification of common break reasons so analysts see fewer items.

## Capacity estimate

Assumptions: 3 million ledger items a day, about the same number of PSP lines, 8 bank statements with a few thousand lines each, 200 bytes per normalised item, 99% auto-match.

- **Normalised items**: about 6 million rows a day ≈ 1.2 GB/day; 7 years of retention ≈ 3 TB before compression, which is modest.
- **Matching window**: unmatched items over a 10-day window, roughly 6 million new items plus a small open backlog; a hash join over this fits in a warehouse in minutes.
- **Breaks**: 1% of 3 million is 30,000 new breaks a day. That is far too many for humans, so the real design pressure is on raising the auto-match rate and grouping breaks by cause.

## What a strong answer includes

- File-level idempotency by content hash, control totals, and sequence checks before any matching.
- A common normalised model across providers, with decimal money and explicit sign and unit handling.
- Ordered, versioned matching rules including aggregate (one-to-many) and tolerance rules.
- Timing differences modelled as pending, with business-day calendars.
- Breaks as a workflow with owners and ageing, and an append-only audit trail.
- The reconciliation equation (total = matched + pending + breaks) as a self-check.

## Common mistakes

- Using `float` or `double` for money.
- Inner joins that silently drop unmatched items.
- Deduplicating files by name instead of content.
- Updating or deleting break records, destroying the audit trail.
- Treating every unsettled item as a break on day one, flooding analysts.
- Netting fees and refunds in a way that lets errors cancel each other out.

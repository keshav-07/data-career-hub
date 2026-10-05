---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Marketing Attribution Pipeline"
description: "A system-design case study for marketing attribution: touchpoint collection, identity stitching, lookback windows, rule-based models, ad spend joins and privacy."
technology: ["data-engineering", "sql", "data-warehousing"]
topic: ["analytics", "attribution", "architecture"]
tags: ["marketing-attribution", "identity-resolution", "roas", "consent", "window-functions"]
difficulty: "Advanced"
problem: "Design a pipeline that credits conversions (sign-ups, purchases) to the marketing touchpoints that preceded them, joins that to ad spend from each advertising platform, and gives the marketing team daily return-on-spend by channel and campaign."
functionalRequirements:
  - "Collect touchpoints: ad clicks with campaign parameters, email clicks, organic and referral visits"
  - "Ingest daily spend, impressions and clicks from each ad platform's reporting API"
  - "Stitch anonymous visitors to known users when they log in or sign up"
  - "Attribute each conversion with several models (last touch, first touch, linear, time decay, position based)"
  - "Report attributed conversions, revenue, cost per acquisition and return on ad spend by channel and campaign"
  - "Let marketers change the lookback window and compare models"
nonFunctionalRequirements:
  - "Daily figures ready by 09:00 for the previous day, restated for a trailing correction period"
  - "Only touchpoints from users who consented to tracking are used"
  - "Attribution totals reconcile with total conversions (attributed plus unattributed)"
  - "Every report states which model, window and data version produced it"
  - "Ad platform API outages must not block the rest of the pipeline"
scaleAssumptions:
  - "Assumption: 5 million sessions a day, of which about 1.5 million carry a marketing touchpoint"
  - "Assumption: 40,000 conversions a day"
  - "Assumption: 6 ad platforms, about 20,000 active campaigns and ad groups"
  - "Assumption: a 30-day default lookback window, with 90 days available"
architectureSummary: "Web and app events, email clicks and ad-platform reports land in raw tables. An identity graph maps anonymous ids to users. A daily job builds consented touchpoint paths for each conversion inside the lookback window, applies several attribution models as weights, and joins credited revenue to normalised daily spend to produce channel and campaign marts."
technologies: ["Event collection (web and mobile SDK, server-side tagging)", "Ad platform connectors (managed ELT)", "Cloud warehouse or lakehouse", "dbt or SQL transformations", "Orchestrator", "BI tool"]
tradeoffs:
  - decision: "Compute several rule-based models side by side"
    alternative: "One 'official' model only"
    reason: "Every rule-based model is a simplification; showing several makes the uncertainty visible"
    consequence: "Marketers need guidance on which model answers which question"
  - decision: "Store per-conversion touchpoint weights"
    alternative: "Store only channel totals"
    reason: "Lets you re-aggregate by any dimension and audit a single conversion's credit"
    consequence: "Larger fact table (one row per conversion per touchpoint)"
  - decision: "Deterministic identity stitching on login and sign-up"
    alternative: "Probabilistic cross-device matching"
    reason: "Explainable, consent-friendly and does not create false merges"
    consequence: "Cross-device journeys without a login stay unconnected, so some conversions look direct"
  - decision: "Restate the trailing 7 to 30 days daily"
    alternative: "Append-only daily snapshots"
    reason: "Ad platforms revise spend and conversions arrive after their touchpoints"
    consequence: "Recent numbers change; reports must show when they were last restated"
  - decision: "Treat rule-based attribution as one input, with experiments for incrementality"
    alternative: "Use attribution alone for budget decisions"
    reason: "Attribution shows correlation along paths, not what would have happened without the ad"
    consequence: "Needs holdout or geo experiments, which take time and budget"
interviewFollowUps:
  - "How do you attribute a conversion when the user clicked an ad on mobile and bought on desktop?"
  - "An ad platform restates yesterday's spend three days later. How does your pipeline handle it?"
  - "What happens to attribution when a user withdraws consent?"
  - "Why might the sum of conversions reported by each ad platform exceed your real conversions?"
  - "How would you add a data-driven (algorithmic) attribution model?"
  - "How would you measure whether a channel is actually incremental?"
related:
  - "system-designs:clickstream-data-platform"
  - "system-designs:a-b-testing-data-pipeline"
  - "articles:sql/window-functions"
  - "articles:data-warehousing/star-schema"
  - "articles:data-warehousing/slowly-changing-dimensions"
versionContext: "The attribution SQL was run on PostgreSQL 16 with scripts/verify-examples.py. Ad platform APIs and consent tooling are described generically because their details change often."
sources:
  - { label: "PostgreSQL: window functions", url: "https://www.postgresql.org/docs/current/functions-window.html" }
  - { label: "PostgreSQL 16: WITH queries", url: "https://www.postgresql.org/docs/16/queries-with.html" }
previous: "system-designs:a-b-testing-data-pipeline"
---

## Approach

Attribution has no single correct answer, so a strong design is honest about that: it collects touchpoints reliably, stitches identities carefully, applies explicit, versioned rules, and makes the gaps (unconsented users, cross-device journeys, unattributed conversions) visible instead of hiding them.

Clarifying questions:

- **What counts as a conversion?** Sign-up, first purchase, every purchase? Revenue or count?
- **Which touchpoints?** Clicks only, or also impressions (view-through)? Organic search, referrals, email, push?
- **Lookback window**: how long before a conversion can a touchpoint earn credit? Does it differ by channel?
- **Identity**: do users log in? Is there a stable customer id across web and app?
- **Consent and regulation**: which regions, and what is the consent model?
- **Decisions**: is this for daily optimisation of bids, monthly budget allocation, or both? The answer decides latency and which models matter.
- **Ad platforms**: which ones, and do they provide user-level or only aggregated data?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Collect</strong>: web and app events with landing URL, campaign parameters, referrer and click ids; email and push click logs; consent state per visitor.</li>
<li><strong>Ingest spend</strong>: managed connectors pull daily cost, impressions and clicks per campaign from each ad platform into raw tables.</li>
<li><strong>Normalise</strong>: map raw campaign parameters and platform fields to a common channel and campaign taxonomy.</li>
<li><strong>Identity graph</strong>: link anonymous ids (cookies, device ids) to user ids from login and sign-up events.</li>
<li><strong>Paths</strong>: for each conversion, collect the user's consented touchpoints inside the lookback window, ordered by time.</li>
<li><strong>Attribution</strong>: apply each model to produce weights per touchpoint that sum to 1 per conversion.</li>
<li><strong>Marts</strong>: credited conversions and revenue joined to spend by date, channel and campaign; served to BI.</li>
</ol>
<figcaption>Touchpoints and conversions are joined through identity; credit is weights, and spend is joined only at the aggregate level.</figcaption>
</figure>

Walkthrough:

1. **Collection** quality decides everything downstream. Campaign parameters get lost through redirects and app-store installs, so capture them on the first page view and persist the click id. Server-side collection is more robust to browser blocking, but must still respect consent.
2. **Spend ingestion** is a classic batch ELT job against rate-limited APIs. It runs independently from event processing, so an API outage delays only cost metrics.
3. **Normalisation** turns messy, hand-typed campaign parameters (`Facebook`, `facebook`, `fb`) into a governed taxonomy through a mapping table owned by marketing operations.
4. **Identity stitching** joins the anonymous part of the journey to the known part. Use deterministic links (same browser logged in as user X). Keep the graph versioned so you can explain why credit moved.
5. **Paths and attribution** are a windowed join and a weighting step. Storing one row per (conversion, touchpoint, model) with a weight makes every report a simple weighted sum.

## Data model

| Table | Grain | Notes |
|---|---|---|
| `touchpoints` | One row per marketing touch | anonymous_id, user_id (after stitching), channel, campaign_id, touched_at, consent flag |
| `identity_map` | One row per (anonymous_id, user_id) link | first_seen, last_seen, link source |
| `conversions` | One row per conversion | conversion_id, user_id, converted_at, revenue, type |
| `attribution_credit` | One row per (conversion, touchpoint, model) | weight, credited_revenue, model version, window |
| `ad_spend_daily` | One row per (date, platform, campaign) | cost, impressions, clicks, currency, platform-reported conversions |
| `dim_campaign` | Campaign taxonomy | channel, sub-channel, objective; slowly changing |

Keep `attribution_credit` partitioned by conversion date. Store costs in the original currency plus a converted reporting currency using the daily rate table.

## Attribution models

| Model | Credit rule | Good for | Blind spot |
|---|---|---|---|
| Last touch | 100% to the final touchpoint | Bottom-of-funnel optimisation | Ignores awareness channels |
| First touch | 100% to the first touchpoint | Understanding acquisition sources | Ignores what closed the sale |
| Linear | Equal split | A neutral baseline | Treats a banner glance like a demo request |
| Time decay | More weight to recent touches (for example a 7-day half-life) | Short sales cycles | Penalises early-funnel channels |
| Position based | For example 40% first, 40% last, 20% shared between the middle | Balanced view | Weights are arbitrary |
| Data-driven | Statistical model comparing converting and non-converting paths | Large volumes of path data | Harder to explain; still correlational |

Every one of these is **correlational**. Measuring whether a channel causes extra conversions requires experiments (holdout groups, geo experiments) or marketing mix modelling. Say this in the interview; it shows judgement.

## Worked example: last touch and linear

The query collects touchpoints in a 30-day window before each conversion and computes two models side by side.

```sql
CREATE TABLE touchpoints (user_id int, channel text, touched_at timestamp);
CREATE TABLE conversions (conversion_id int, user_id int, converted_at timestamp, revenue numeric(10,2));

INSERT INTO touchpoints VALUES
  (1, 'paid_search', '2026-08-01 09:00'),
  (1, 'email',       '2026-09-02 09:00'),
  (1, 'social',      '2026-09-05 18:00'),
  (1, 'paid_search', '2026-09-06 08:00'),
  (2, 'display',     '2026-09-03 12:00'),
  (3, 'email',       '2026-09-10 12:00');
INSERT INTO conversions VALUES
  (101, 1, '2026-09-06 08:30', 120.00),
  (102, 2, '2026-09-04 10:00',  60.00),
  (103, 3, '2026-09-09 10:00',  40.00);

WITH paths AS (
  SELECT c.conversion_id, c.revenue, t.channel, t.touched_at,
         count(*)     OVER (PARTITION BY c.conversion_id) AS touches,
         row_number() OVER (PARTITION BY c.conversion_id ORDER BY t.touched_at DESC) AS rn_desc
  FROM conversions c
  JOIN touchpoints t
    ON t.user_id = c.user_id
   AND t.touched_at <= c.converted_at
   AND t.touched_at >  c.converted_at - interval '30 days'
)
SELECT channel,
       sum(CASE WHEN rn_desc = 1 THEN revenue ELSE 0 END) AS last_touch_revenue,
       round(sum(revenue / touches), 2)                  AS linear_revenue
FROM paths
GROUP BY channel
ORDER BY channel;
```

```text
   channel   | last_touch_revenue | linear_revenue
-------------+--------------------+----------------
 display     |              60.00 |          60.00
 email       |                  0 |          40.00
 paid_search |             120.00 |          40.00
 social      |                  0 |          40.00
```

What the example shows:

- User 1's paid-search click on 1 August is outside the 30-day window, so only three touches share conversion 101. Last touch gives paid search all 120.00; linear gives each of the three touches 40.00.
- Conversion 103 has **no** qualifying touchpoint (the email click came after the purchase), so its 40.00 is unattributed. Totals are 180.00 attributed out of 220.00 converted. Report the unattributed bucket explicitly ("direct or unknown") so the totals reconcile.
- Ties in `touched_at` would make `row_number()` arbitrary. In production, add a deterministic tie-breaker (touchpoint id).
- `revenue / touches` uses numeric division, so rounding happens once per channel. With many touches, rounding per row can make totals drift by cents; reconcile at the end.

## Identity resolution

- **Deterministic links** come from moments when an anonymous id and a user id appear together: login, sign-up, an email click carrying a hashed user token.
- **Back-stitching**: when an anonymous visitor signs up, earlier anonymous touchpoints from the same browser are linked to the new user. This is the main reason attribution must be recomputed for a trailing period.
- **Shared devices** create false links. Cap the number of user ids per anonymous id, and ignore links from anonymous ids attached to too many users.
- The identity map is itself slowly changing; version it so a past report can be reproduced.

## Late data and restatement

Three kinds of lateness:

1. **Conversions** arrive or are cancelled late (refunds, chargebacks). Decide whether attribution uses gross or net revenue, and restate.
2. **Identity links** arrive after the touchpoints they connect (sign-up on day 5 back-stitches day 1).
3. **Ad platforms revise spend** for several days after the fact.

So each daily run rebuilds the last N days of conversion dates (often 7 for spend, up to the lookback window for paths), with an `as_of` run id. Month-end figures are frozen in a snapshot table once finance closes the month.

## Data quality

- Every conversion appears in `attribution_credit` with weights summing to exactly 1 per model, or in the unattributed bucket. Test this.
- Unmapped campaign parameters are routed to an "unmapped" channel and reported to marketing operations daily.
- Spend totals per platform match the platform's own reporting within currency-rounding tolerance.
- Platform-reported conversions are kept for comparison but never summed across platforms: each platform credits itself, so the sum usually exceeds real conversions.

## Security, privacy and consent

- Filter touchpoints by consent **before** they enter attribution; store consent state with each event so later withdrawals can be applied.
- On withdrawal or erasure, delete or anonymise the user's touchpoints and identity links, then rebuild affected attribution partitions.
- Hash email addresses with a keyed hash before they are used as join keys; only the identity service sees raw identifiers.
- Expect partial coverage: browsers, mobile operating systems and regulations limit tracking. Report coverage (share of conversions with any known path) as a metric in its own right.

## Failure modes and recovery

| Failure | Effect | Mitigation |
|---|---|---|
| Ad platform API down or rate-limited | Spend missing for one platform | Retry with backoff; publish with a "spend incomplete" flag; backfill next run |
| Campaign parameters dropped by a redirect | Paid traffic looks organic | Monitor share of sessions with parameters per landing page; alert on drops |
| Identity graph over-merges | Credit flows to the wrong channels | Caps on links per id; alert on outlier clusters |
| Currency table missing a day | Wrong reporting-currency cost | Fail the spend model rather than default to rate 1 |

## Monitoring and SLAs

- Freshness of each source (events, conversions, each ad platform) against the 09:00 SLA.
- Share of conversions attributed, unmapped campaign rate, consent rate by region.
- Difference between first-reported and restated values, so users know how much recent numbers usually move.

## Cost and scaling to 10×

The expensive operation is the path join: conversions × touchpoints within the window. Keep it bounded:

- Join only conversions in the restated range, and only touchpoints within the window before them.
- Partition touchpoints by date and cluster by user id.
- Precompute per-user daily touchpoint arrays so the join reads one row per user-day.
- At 10× (400,000 conversions a day) the credit table grows to a few million rows a day per model, which a warehouse handles easily; the path join is the part to watch.

## Capacity estimate

Assumptions: 1.5 million marketing touchpoints a day, 40,000 conversions a day, average 4 qualifying touchpoints per attributed conversion, 6 models, 30-day lookback, 30-day restatement.

- **Touchpoints**: 1.5 million/day × about 300 bytes ≈ 450 MB/day; 400 days of history ≈ 180 GB uncompressed.
- **Path join input per daily run**: 30 days of conversions (1.2 million) against 60 days of touchpoints (90 million rows), pruned by user id: manageable for a warehouse in minutes.
- **Credit rows**: 40,000 × 4 touches × 6 models ≈ 1 million rows a day, 365 million a year at about 100 bytes ≈ 36 GB.
- **Spend rows**: 20,000 campaigns × 6 platforms is an upper bound of 120,000 rows a day; tiny.

## What a strong answer includes

- Clear conversion definition, lookback window and touchpoint types agreed up front.
- Identity stitching with its limits stated, and back-stitching as a reason to restate.
- Several models stored as per-touchpoint weights, plus an explicit unattributed bucket so totals reconcile.
- Spend joined at the aggregate level after normalising campaign taxonomy and currency.
- Consent handling and erasure built into the pipeline, not bolted on.
- The point that attribution is not incrementality, and how experiments complement it.

## Common mistakes

- Summing ad-platform-reported conversions as if they were independent.
- Forgetting the lookback window or allowing touchpoints after the conversion.
- Dropping unattributed conversions so channel totals look complete.
- Treating one rule-based model as the truth for budget decisions.
- Using touchpoints from users who did not consent.
- Never restating, so late identity links and spend corrections never show up.

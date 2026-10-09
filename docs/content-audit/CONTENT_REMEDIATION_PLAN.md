# DataDank Content Remediation Plan

> This is a tracked plan based on the initial audit report. Tasks are not complete until the validation evidence is recorded. Do not modify or publish content in bulk without reviewing the affected material.

## Non-negotiable constraints
- Preserve Astro, existing URL conventions, visual design, content schemas, and working functionality unless evidence justifies a change.
- Do not invent technical sources or claim plagiarism detection without evidence.
- Do not copy third-party questions/editorials. Link to original practice pages and write DataDank explanations independently.
- Drafted content is not published content. Keep human technical/editorial/SEO gates.
- Keep changes in a branch and run the project validation commands before merge/deployment.

## Priority order

### P1 — High priority

#### [ ] REM-001 — Replace unsupported 90-day outcome promise
- **Finding:** AUD-007
- **Affected file:** `src/pages/index.astro`
- **Current problem:** Hero says “Become a job-ready Data Engineer in 90 days.”
- **Required change:** Use a preparation-oriented headline, e.g. “Prepare for Data Engineering interviews with a structured 90-day plan.” Add a concise note that results depend on prior experience, consistency, and the job market.
- **Validation:** Inspect desktop/mobile hero; ensure SEO title and description do not restore a guarantee.
- **Done when:** No guarantee-like promise remains in hero, metadata, planner copy, or CTA.

#### [ ] REM-002 — Add explicit outcome for each planner day
- **Finding:** AUD-001
- **Affected file:** `docs/curriculum/plan-90-days.json` and planner UI/types as needed
- **Current problem:** 87 of 90 entries have `Expected Outcome: null`.
- **Required change:** Add one observable completion outcome per day (e.g. “Write 5 filtering queries and explain WHERE vs HAVING”), based on actual tasks and available lesson/practice pages. Do not write generic outcomes like “understand SQL.”
- **Dependencies:** REM-003, REM-004.
- **Validation:** Add a script assertion that every day has a non-empty outcome.
- **Done when:** Exactly 90 unique days have specific outcomes, each consistent with its lessons and exercises.

#### [ ] REM-003 — Re-sequence topics by prerequisite
- **Finding:** AUD-002, AUD-006
- **Affected files:** `docs/curriculum/plan-90-days.json`, `docs/curriculum/curriculum.json`, `src/utils/curriculum.ts`, and related heading maps
- **Current problem:** Too many independent tracks and advanced platform topics appear from Day 1.
- **Required change:** Establish prerequisite mastery gates: SQL basics before advanced SQL; Python basics before DSA-heavy patterns; DataFrame fundamentals before Spark optimization; event/partition fundamentals before Kafka delivery guarantees; DAG/task basics before advanced Airflow operations; storage/compute/IAM before advanced cloud architecture; architecture components before multi-system design cases.
- **Validation:** Produce a dependency map and verify every day against it. No day may require an untaught concept without a clearly labelled optional preview.
- **Done when:** Every new concept has an earlier prerequisite lesson or an explicit guided introduction.

#### [ ] REM-004 — Correct milestones and unrealistic completion claims
- **Finding:** AUD-003, AUD-004
- **Affected file:** `docs/curriculum/plan-90-days.json`
- **Current problem:** Milestones assert SQL joins/windows mastery and cumulative DSA totals that are not demonstrably covered/assessed by the scheduled entries; Day 90 promises “offers in hand.”
- **Required change:** Replace milestones with measurable checks backed by scheduled work; link/identify the actual problem set counted. Day 90 should measure controllable deliverables (mock interview score, project demo, weak-area list, resume/story readiness, application plan), not job offers.
- **Validation:** Each milestone must reference completed lessons/practice and a clear pass criterion.
- **Done when:** No milestone claims completion without scheduled and verifiable evidence.

#### [ ] REM-005 — Make daily workload auditable and realistic
- **Finding:** AUD-005
- **Affected file:** `docs/curriculum/plan-90-days.json` and planner rendering
- **Current problem:** 348 total hours, 3–6 hours/day, with no task-level time budget in the plan.
- **Required change:** Add minutes per activity for learning, practice, revision, and project/mock work. Label core versus optional/stretch tasks. Avoid scheduling several difficult new concepts on a six-hour day without reinforcement.
- **Validation:** Sum activity minutes against daily planned hours; add automated tolerance checks.
- **Done when:** Every day has a defensible workload estimate and no unexplained time gap/overrun.

#### [ ] REM-006 — Complete technical review for all content
- **Finding:** AUD-010, AUD-012
- **Affected scope:** all `src/content/**` files and planner-linked lessons/questions
- **Required change:** Review technical claims and examples against primary documentation; execute runnable code where practical; validate expected output and edge cases; mark version-specific assumptions.
- **Validation:** Record reviewer, date, source(s), commands/results, and status in inventory/review metadata.
- **Done when:** Every launch item has evidence of technical review; unsupported claims are corrected or labelled.

#### [ ] REM-007 — Complete originality and attribution review
- **Finding:** AUD-010
- **Affected scope:** all content files, diagrams, code, datasets, question explanations, company guides
- **Required change:** Follow the originality workflow in `CONTENT_AUDIT_REPORT.md`. Keep a passage-level log with source URL, similarity type, evidence, confidence, and action.
- **Validation:** Manually confirm suspicious matches; check license and attribution. Do not infer plagiarism from common syntax or standard terminology.
- **Done when:** Every content item has an originality review status and all verified concerns are resolved or appropriately attributed/licensed.

#### [ ] REM-008 — Crawl all routes and validate links
- **Finding:** AUD-011
- **Affected files:** QA scripts, route/content inventory, source links and references
- **Required change:** Build the site, enumerate all HTML routes, compare with content-derived expected routes, crawl internal links and anchors, and check external destinations with rate limits.
- **Validation:** Run `npm run validate`, review its actual output, and add/extend tests for any uncovered route/link class.
- **Done when:** Every route is accounted for and broken/orphaned/redirected links are triaged.

### P2 — Medium priority

#### [ ] REM-009 — Guard production site origin
- **Finding:** AUD-008
- **Affected file:** `astro.config.mjs`, deployment configuration, `scripts/check-dist.mjs`
- **Required change:** Keep local development convenient, but make release validation fail if generated canonical URLs or sitemap contain `datadank.example`.
- **Validation:** Build once with production `SITE_URL` and once with missing/placeholder value to confirm the release guard.
- **Done when:** Production artifact contains the verified production origin only.

#### [ ] REM-010 — Normalize roadmap prerequisites and links
- **Finding:** AUD-009
- **Affected file:** `src/content/roadmaps/data-engineer-roadmap.md` and relevant lesson references
- **Required change:** Use consistent prerequisite labels and actual content references; confirm every resource exists and teaches the stated outcome.
- **Validation:** Resolve each reference through the content loader and test rendered links.
- **Done when:** No dead or ambiguous prerequisite/resource references remain.

#### [ ] REM-011 — SEO and editorial review
- **Affected scope:** all rendered content routes
- **Required change:** Review search intent, titles/descriptions, H1/H2 hierarchy, duplicate intent, thin/generic text, internal links, canonicals, structured data, sitemap, robots directives, alt text, attribution, and unsupported career promises.
- **Validation:** Inspect built HTML and representative browser-rendered pages; use Search Console only if access/evidence is available.
- **Done when:** Every route has a recorded SEO/editorial decision and no high-priority defects remain.

## Recommended execution order
1. REM-001 (promise correction).
2. REM-002 to REM-005 (planner repair as one coherent change).
3. REM-009 and automated release guards.
4. REM-008 (route inventory and QA baseline).
5. REM-006 and REM-007 (technical and originality review, prioritized by traffic/core learning paths).
6. REM-010 and REM-011.
7. Final regression, human review, inventory status update, then publication.

## Acceptance criteria
- [ ] Exactly 90 planner days; no missing or duplicate numbers.
- [ ] Each day has objective, prerequisites, new concepts, practice, review, estimated minutes, and measurable outcome.
- [ ] Every week has an achievable assessment/milestone supported by scheduled work.
- [ ] Curriculum dependencies are explicit and validated.
- [ ] All question links match the named exercise and destination.
- [ ] Every high-priority content item has technical review and traceable sources where needed.
- [ ] Every content item has an originality/attribution status; suspicions are not presented as proven plagiarism.
- [ ] Route, anchor, metadata, sitemap, schema, contrast, lint, and build checks pass with actual logs retained.
- [ ] No job outcome or employment guarantee is made.
- [ ] Inventory statuses reflect actual review state; drafted content is not mislabeled as published.

# DataDank Content Audit Report

> **Status: Initial evidence-based audit — not yet a full sign-off.** This report records verified repository findings from the source files inspected. It deliberately does not claim that every page has been technically reviewed or that plagiarism has been conclusively detected or ruled out.

## 1. Executive summary

The repository is a structured Astro content platform with typed content collections, an editorial inventory, curriculum mapping files, and validation scripts. That is a good foundation for a disciplined content audit. The repository's own README says 136 of 138 launch inventory items have been drafted/consolidated, two company guides are blocked for lack of attributable sources, and human technical/editorial/SEO review is still required.

The highest-confidence finding is the **90-day planner's learning design**: the JSON contains all 90 unique day numbers, but 87/90 days have no explicit expected outcome, 77/90 have no weekly milestone, and the first days introduce many independent technologies and advanced concepts in parallel. The plan records 348 total hours (average 3.87 hours/day), with individual days ranging from 3 to 6 hours, without a visible per-task time breakdown in the planner data.

### Verified counts from inspected source files

| Check | Result |
|---|---:|
| Planner entries | 90 |
| Unique day numbers | 90 |
| Missing/duplicate day numbers | 0 / 0 |
| Total planned hours | 348 |
| Average planned hours/day | 3.87 |
| Days with no expected outcome | 87 |
| Days with no weekly milestone | 77 |
| Launch inventory items | 138 |
| Inventory status in source | 136 DRAFTED, 2 BLOCKED |
| Curriculum tracks in curriculum.json | 9 |

These are counts from the checked-in source files, not counts of live, verified pages or published lessons.

## 2. Scope and methodology

Inspected source files:
- `README.md`
- `package.json`
- `astro.config.mjs`
- `src/content.config.ts`
- `src/pages/index.astro`
- `src/utils/curriculum.ts`
- `src/data/site.ts`
- `src/content/roadmaps/data-engineer-roadmap.md`
- `docs/CONTENT.md`
- `docs/content-inventory.json`
- `docs/curriculum/curriculum.json`
- `docs/curriculum/plan-90-days.json`
- `scripts/check-inventory.mjs`
- `docs/BUILD_PLAN.md` (partial review)

Method: source-file inspection and structural analysis of the complete planner JSON, inventory metadata, collection schemas, route mapping conventions, and homepage claims.

Not completed in this pass: exhaustive rendering of every live route; reading every lesson/question/solution in full; executing the repository build/tests; verifying every external link; search-based similarity checking of every passage; checking with a dedicated plagiarism service; verifying Google Search Console/indexing status. Those items remain **unverified**, not passed.

## 3. Repository and content architecture

### Strengths
- Content collections use schemas in `src/content.config.ts`, including title/description bounds, dates, prerequisite references, source links, question difficulty, and practice-link host validation.
- The practice-link schema restricts links to known platforms and HTTPS hosts. The content guide explicitly tells authors not to copy third-party problem statements, test cases, or editorials.
- The inventory contract distinguishes drafted content from technically/editorially reviewed and published content.
- The project provides `npm run validate`, which combines Astro checks, linting, contrast checks, inventory checks, build, and dist checks.
- The canonical roadmap and lesson URL conventions are documented in `docs/CONTENT.md`.

### Risks requiring follow-up
- The home page headline says “Become a job-ready Data Engineer in 90 days.” This is a strong outcome promise that cannot be guaranteed for learners with different starting points, available time, or job markets. Consider “A structured 90-day plan to prepare for Data Engineering interviews.”
- `astro.config.mjs` defaults `SITE_URL` to `https://datadank.example`. Confirm the production build/deployment always supplies the real canonical domain before publication; otherwise sitemap/canonical metadata may use a placeholder.
- The roadmap's SQL stage lists no explicit prerequisite while Python lists “SQL basics” as a prerequisite. This is a minor dependency inconsistency: SQL basics should be a foundational stage, not a prerequisite for learning Python fundamentals unless the course intentionally integrates them.
- Inventory metadata says drafted content is not published/reviewed until a human completes the required review. Do not present the number of drafted items as the number of launch-ready pages.

## 4. P0/P1/P2/P3 findings

| ID | Priority | Confidence | Location | Finding | Required action |
|---|---|---|---|---|---|
| AUD-001 | P1 | High | `docs/curriculum/plan-90-days.json`, Days 1–90 | 87 days lack an expected outcome; 77 lack a weekly milestone. Most days do not state an observable completion criterion. | Define an achievable, measurable outcome for each day and explicit weekly review/assessment milestones. |
| AUD-002 | P1 | High | `docs/curriculum/plan-90-days.json`, Days 1–7 | Days 1–7 schedule SQL, DSA, PySpark, Snowflake, Kafka, Airflow, AWS, and system-design work daily. Day 1 includes RDD fundamentals, Kafka topics, Airflow DAGs, S3, and a data-lake design alongside basic SQL. | Reduce simultaneous new tracks. Sequence prerequisites and give learners a primary focus, one practice track, and optional review. |
| AUD-003 | P1 | High | `docs/curriculum/plan-90-days.json`, Days 1–14 | The week-1 milestone claims “SQL joins/windows solid + 15 DSA done” while the day-level SQL sequence begins with filtering/ordering/aggregations and DSA entries list only one problem/day. The stated milestone does not match the scheduled evidence. Week 2 similarly claims “Advanced SQL + 30 DSA + Spark core” without a clear completion/accounting mechanism. | Reconcile milestone claims to the actual schedule, link counted problems, and add assessment criteria. |
| AUD-004 | P1 | High | `docs/curriculum/plan-90-days.json`, Day 90 | Expected outcome is “100% prep • offers in hand,” an outcome outside the learner's control and not a defensible educational completion criterion. | Replace with controllable outcomes such as completed mock interviews, project walkthrough, weak-area review, and job-search readiness checklist. |
| AUD-005 | P1 | High | `docs/curriculum/plan-90-days.json`, Days 1–90 | Planned workload totals 348 hours; 3–6 hours are assigned to individual days, but no per-task allocation is stored in the plan. A learner cannot assess whether each day's full set of tasks fits the stated time. | Add estimated minutes per activity and distinguish core tasks from stretch/optional work. |
| AUD-006 | P2 | High | `docs/curriculum/plan-90-days.json` | Seven focus themes repeat almost evenly (12–13 times each) rather than demonstrating a clear day-to-day prerequisite progression. The phase labels change only at 30-day boundaries, while topic complexity jumps within Phase 1. | Rebuild around learning dependencies, deliberate practice, spaced review, and phase exit checks rather than rotating labels. |
| AUD-007 | P2 | High | `src/pages/index.astro` | “Become a job-ready Data Engineer in 90 days” can be read as a guaranteed result. | Use a preparation-oriented claim and clarify that outcomes depend on prior experience and effort. |
| AUD-008 | P2 | High | `astro.config.mjs` | The fallback site origin is `https://datadank.example`. If deployment does not override `SITE_URL`, canonical URLs and sitemap origin may be wrong. | Add a deployment assertion that rejects the placeholder for release builds and inspect generated sitemap/canonical tags. |
| AUD-009 | P2 | Medium | `src/content/roadmaps/data-engineer-roadmap.md` | Roadmap prerequisite labels mix topics and named stages (e.g. “SQL basics”, “SQL”, “Cloud”) and may not match actual content refs. | Normalize prerequisites to actual stages/lesson references and validate each destination. |
| AUD-010 | P1 | Medium | All lesson and question content | No exhaustive passage-level originality comparison was completed in this pass. This is an audit coverage gap, not evidence of plagiarism. | Run the documented originality workflow for every content file; log verified matches separately from suspicion. |
| AUD-011 | P1 | Medium | All content routes | No full live-route crawl or complete external-link check was completed in this pass. | Generate a route inventory from the built site and crawl all internal/external destinations. |
| AUD-012 | P1 | High | Inventory / README | README says two company guides are blocked for lack of attributable sources; the inventory shows 136 DRAFTED and 2 BLOCKED. Drafted does not mean technically correct or publication-ready. | Keep publication gated on technical, editorial, SEO, attribution, and rendered-page review. |

## 5. Planner day-by-day structural review

All 90 day numbers are present exactly once. The following concerns apply across the schedule:

- **Days 1–7:** Basic SQL is mixed with advanced or tool-specific topics across seven technologies. Day 5 and Day 6 are six-hour days. The first weekly milestone claims skills that are not clearly taught or assessed in the listed daily entries.
- **Days 8–14:** The schedule continues to add Spark internals, warehouse operations, Kafka producer settings, Airflow operators, AWS IAM, and varied system-design scenarios. Day 12 and Day 13 are six-hour days. The second milestone's “Advanced SQL” and “30 DSA” claims are not tied to a visible cumulative assessment.
- **Days 15–30:** Continue to validate every topic against prerequisite lessons and available practice pages. The current plan format does not record explicit expected outcomes on these days.
- **Days 31–60:** Phase label changes to “Phase 2: Advanced + Projects”, but the planner still distributes multiple technology topics daily. Confirm the plan does not label a phase “advanced” before prerequisite mastery and practice evidence.
- **Days 61–90:** Phase label changes to “Phase 3: Interview Mastery”. Ensure this period prioritizes cumulative retrieval, timed problem-solving, realistic project walkthroughs, and weak-area repair rather than continued introduction of large volumes of new material. Day 90's “offers in hand” outcome must be removed.

**Important limitation:** this is a structural audit of every day record, not a claim that every underlying linked lesson, code solution, or third-party practice problem has been technically verified.

## 6. Originality and plagiarism risk

### Verified observations
- `src/content.config.ts` models sources and restricts practice links to known third-party hosts.
- `docs/CONTENT.md` explicitly instructs authors not to copy problem statements, test cases, or editorials and to link to the platform's original task.
- The inventory has source arrays, but the inspected first items show empty `sources` arrays. This is a metadata observation, not proof that their prose is copied.

### No plagiarism verdict issued
No dedicated plagiarism-detector report or exhaustive search-based similarity log was available in the inspected material. Therefore, no claim is made that content is plagiarized, plagiarism-free, or flagged by Google.

### Required originality workflow
1. Extract every paragraph from every article, lesson, question explanation, and solution.
2. Ignore standard terminology, boilerplate schema fields, and conventional code syntax for similarity scoring.
3. Search distinctive 8–15 word phrases for potentially copied prose; record source URLs and comparison excerpts.
4. Classify each result as verified exact match, close paraphrase, internal duplication, licensed/attributed quotation, or unverified suspicion.
5. Check licensing/attribution for diagrams, code, data, and third-party material.
6. Rewrite weak material from first principles with original examples, step-by-step reasoning, edge cases, production scenarios, and citations where needed.
7. Do not use synonym replacement to evade detection. Do not call a passage plagiarized based on a search snippet alone.

## 7. Technical accuracy, curriculum, SEO, and editorial checks still required

The following require full content-level review and are **not marked passed**:
- SQL schemas, edge cases, NULL/duplicate semantics, query outputs, and engine-specific syntax.
- Python/DSA solutions, complexity, edge cases, and practice links.
- PySpark execution behavior, shuffles, partitions, streaming, Delta Lake, and version-sensitive claims.
- Snowflake, Kafka, Airflow, and AWS product/version claims.
- Every source and attribution claim in company interview guides.
- All rendered page titles, descriptions, heading structure, canonicals, indexability, sitemap entries, structured data, and internal links.
- Every lesson's prerequisites, next steps, examples, exercises, and difficulty label.
- Live routes versus source routes and broken/orphaned pages.

## 8. Validation status

| Validation | Status |
|---|---|
| Repository architecture and schema spot-check | Reviewed |
| Inventory metadata count | Verified: 138 items |
| Planner numbering | Verified: Days 1–90, no missing/duplicate numbers |
| Planner outcome/milestone coverage | Verified: 87 missing outcomes; 77 missing weekly milestones |
| Full 90-day prerequisite and lesson mapping | Not completed |
| Every lesson/question technically reviewed | Not completed |
| Search-based originality comparison for all content | Not completed |
| Dedicated plagiarism detector | Not run / unavailable in this pass |
| Live route crawl and external link validation | Not completed |
| Build, lint, and project validation commands | Not run |
| Google Search Console / indexing evidence | Not checked |

## 9. Readiness assessment

**Not ready for an audit sign-off or an unconditional “job-ready in 90 days” claim.** The planner has complete numbering but needs outcome, sequencing, workload, and milestone remediation. The broader content library remains explicitly drafted and requires human review. This is a partial audit report with traceable source evidence; complete route-by-route, question-by-question, and originality verification remains open.

## 10. Safe next step

Execute remediation in this order:
1. Fix the 90-day plan's outcomes, sequencing, workload, and milestone validity.
2. Run repository validation and build a machine-generated route/content inventory.
3. Review all P0/P1 technical claims and solutions.
4. Perform source-by-source originality and attribution checks.
5. Validate external links and rendered SEO output.
6. Complete editorial review and only then mark items published.

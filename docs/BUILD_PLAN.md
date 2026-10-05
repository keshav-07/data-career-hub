# Data Career Hub — Final Website Product, UX/UI, Technical & Build Plan

> **AUTHORITATIVE IMPLEMENTATION SPECIFICATION**
> 
> This document is the final reconciled blueprint derived from the two provided source documents. It resolves duplicated trade-offs and converts open-ended guidance into explicit implementation decisions.

## Source Reconciliation

The two source documents agree on the product direction, Data Engineering launch niche, premium editorial/developer visual language, static-first architecture, evidence-labelled company interview content, SEO-first acquisition, content quality over content volume, and deliberate deferral of dynamic functionality.

The main improvements made here are: one authoritative trade-off register; exact design tokens; explicit responsive compositions; explicit search architecture; a concrete dependency budget; precise performance budgets; defined analytics limits; exact deployment behavior; content schema relationships; component contracts; QA gates; and an implementation order designed for an AI coding agent.

The final deployment decisions were checked against current official Cloudflare and Astro documentation during finalization. Cloudflare currently recommends Workers for new projects and documents static asset deployment using `assets.directory`; Astro's current Cloudflare integration documentation states that a static Astro site does not need the Cloudflare adapter.

---

# 0. Execution Control Center

> **Purpose:** This document is both the complete website specification and the live execution contract for the coding agent. It is intentionally self-contained. The coding agent must not require either source document to implement V1.

## 0.1 Source-of-truth hierarchy

This file contains all launch requirements, design rules, architecture decisions, content requirements, QA gates, deployment rules, and deferred features needed to build the product.

Use this authority order when a conflict is discovered:

1. Safety, legal, accessibility, and platform requirements.
2. The final decisions in this document.
3. The launch content inventory and live TODO tracker in this document.
4. Current official Astro/Cloudflare documentation when an implementation API has changed.
5. Existing repository conventions only when they do not conflict with this document.

Do not ask the user to restate requirements already specified here.

## 0.2 Operating mode for the AI coding agent

The agent must work in a controlled loop:

```text
READ SPECIFICATION
↓
READ LIVE TODO STATUS
↓
SELECT NEXT UNCOMPLETED TASK
↓
IMPLEMENT THAT TASK
↓
RUN TASK-SPECIFIC VALIDATION
↓
RUN REQUIRED REGRESSION CHECKS
↓
FIX FAILURES
↓
UPDATE THIS FILE
↓
SELECT NEXT TASK
```

The agent must not silently skip tasks, mark incomplete work as complete, or jump to mass content production before template validation passes.

## 0.3 Live TODO tracker — rules

This section is intentionally mutable during implementation.

### Status values

Use exactly one status per task:

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `DONE`
- `DEFERRED`
- `FAILED`

### Mandatory update rules

After every meaningful task:

1. Change its status.
2. Record the implementation result.
3. Record files/components created or changed.
4. Record validation commands/checks.
5. Record any deviation from this plan.
6. Record the next task.
7. Record a blocker when applicable.

Never delete a completed task from the tracker.

Never rewrite history to make the project appear more complete than it is.

## 0.4 Current project status

```yaml
project: Data Career Hub
status: IN PROGRESS
current_phase: 7
current_task: P7-11
current_task_status: IN PROGRESS
last_updated: 2026-10-04
last_successful_validation: 2026-10-04 (npm run validate — check, lint, contrast, inventory, build, dist checks all pass)
open_blockers:
  - P0-03 / P8-03..P8-10: production domain and Cloudflare account not yet provided
release_blockers:
  - P6-10 screen-reader smoke test and P6-13 cross-browser matrix need a human tester
  - P7: 136 of 138 items drafted or consolidated, 2 blocked (Visa, Akamai); all need human technical, editorial and SEO review (P7-11) before PUBLISHED
notes:
  - Repository: github.com/keshav-07/data-career-hub (branch main)
  - Decisions and deviations are recorded in docs/DECISIONS.md
```

The coding agent must update this block at every phase transition and at the end of every implementation session.

## 0.5 Live implementation checklist

### Phase 0 — Product Foundation

- [x] P0-01 Read and internalize the entire specification — **DONE**
- [x] P0-02 Inspect repository and existing files — **DONE**
- [ ] P0-03 Confirm domain/site URL configuration — **BLOCKED** (placeholder https://datacareerhub.example until a domain is chosen (D-011))
- [x] P0-04 Lock information architecture and route map — **DONE**
- [x] P0-05 Lock content taxonomy and collection model — **DONE**
- [x] P0-06 Lock design tokens and component inventory — **DONE**
- [x] P0-07 Lock SEO model and canonical URL policy — **DONE**
- [x] P0-08 Lock analytics/privacy boundary — **DONE**
- [x] P0-09 Lock Cloudflare deployment model — **DONE**
- [x] P0-10 Create initial project documentation and README — **DONE**
- [x] P0-11 Create content inventory files/records — **DONE**
- [x] P0-12 Validate phase 0 architecture gate — **DONE**

### Phase 1 — Design System

- [x] P1-01 Global CSS layers — **DONE**
- [x] P1-02 Color tokens — **DONE**
- [x] P1-03 Typography tokens — **DONE**
- [x] P1-04 Spacing tokens — **DONE**
- [x] P1-05 Radius/elevation tokens — **DONE**
- [x] P1-06 Container/layout primitives — **DONE**
- [x] P1-07 Base HTML/reset — **DONE**
- [x] P1-08 Link/button system — **DONE**
- [x] P1-09 Metadata system — **DONE**
- [x] P1-10 Card/grouping system — **DONE**
- [x] P1-11 Code block system — **DONE**
- [x] P1-12 Callout/tip/warning system — **DONE**
- [x] P1-13 Table system — **DONE**
- [x] P1-14 Tabs/accordion system — **DONE** (accordion via native <details>; tabs deferred until parallel content exists (D-006))
- [x] P1-15 Breadcrumbs — **DONE**
- [x] P1-16 Navigation primitives — **DONE**
- [x] P1-17 Mobile menu — **DONE**
- [x] P1-18 Theme system — **DONE**
- [x] P1-19 Focus/reduced-motion system — **DONE**
- [x] P1-20 Representative style-gallery QA — **DONE** (representative-page QA instead of a separate gallery (D-007))

### Phase 2 — Core Templates

- [x] P2-01 Base layout — **DONE**
- [x] P2-02 Content layout — **DONE**
- [x] P2-03 Homepage — **DONE**
- [x] P2-04 Technology hub — **DONE**
- [x] P2-05 Article — **DONE**
- [x] P2-06 Tutorial — **DONE**
- [x] P2-07 Interview topic hub — **DONE**
- [x] P2-08 Interview question — **DONE**
- [x] P2-09 Company guide — **DONE**
- [x] P2-10 Roadmap — **DONE**
- [x] P2-11 System design — **DONE**
- [x] P2-12 Project — **DONE**
- [x] P2-13 Cheat sheet — **DONE**
- [x] P2-14 Category listing — **DONE**
- [x] P2-15 Search page — **DONE**
- [x] P2-16 About — **DONE**
- [x] P2-17 Contact — **DONE**
- [x] P2-18 Privacy — **DONE**
- [x] P2-19 Terms — **DONE**
- [x] P2-20 Disclaimer — **DONE**
- [x] P2-21 404 — **DONE**
- [x] P2-22 Global footer — **DONE**
- [x] P2-23 Empty/error/edge states — **DONE**
- [x] P2-24 Cross-template visual consistency review — **DONE**
- [x] P2-25 Mobile template review — **DONE**

### Phase 3 — Content Engine

- [x] P3-01 Astro content configuration — **DONE**
- [x] P3-02 Collection schemas — **DONE**
- [x] P3-03 Relationship validation — **DONE**
- [x] P3-04 Slug/canonical validation — **DONE**
- [x] P3-05 Shared content metadata — **DONE**
- [x] P3-06 Author metadata — **DONE**
- [x] P3-07 TOC generation — **DONE**
- [x] P3-08 Previous/next resolution — **DONE**
- [x] P3-09 Related-content resolution — **DONE**
- [x] P3-10 Breadcrumb generation — **DONE**
- [x] P3-11 MDX content components — **DONE**
- [x] P3-12 Content QA scripts — **DONE**
- [x] P3-13 Sample content in every major type — **DONE**
- [x] P3-14 Content engine acceptance gate — **DONE**

### Phase 4 — SEO

- [x] P4-01 Global metadata — **DONE**
- [x] P4-02 Per-page metadata — **DONE**
- [x] P4-03 Canonicals — **DONE**
- [x] P4-04 robots.txt — **DONE**
- [x] P4-05 XML sitemap — **DONE**
- [x] P4-06 Open Graph — **DONE**
- [x] P4-07 Twitter/X metadata — **DONE**
- [x] P4-08 Breadcrumb schema — **DONE**
- [x] P4-09 Article schema — **DONE**
- [x] P4-10 FAQ schema eligibility logic — **DONE**
- [x] P4-11 WebSite/Organization/Person schema decision — **DONE**
- [x] P4-12 Image metadata — **DONE**
- [x] P4-13 Pagination and noindex rules where needed — **DONE**
- [x] P4-14 Redirect system — **DONE**
- [x] P4-15 404 SEO behavior — **DONE**
- [x] P4-16 SEO validation gate — **DONE**

### Phase 5 — Search

- [x] P5-01 Install Pagefind — **DONE**
- [x] P5-02 Generate build-time index — **DONE**
- [x] P5-03 Custom search UI — **DONE**
- [x] P5-04 Search ranking configuration — **DONE**
- [x] P5-05 Filters — **DONE**
- [x] P5-06 Keyboard/search-dialog behavior — **DONE**
- [x] P5-07 Empty/error states — **DONE**
- [x] P5-08 Mobile search QA — **DONE**
- [x] P5-09 Search performance gate — **DONE**

### Phase 6 — Performance, Accessibility, Security

- [x] P6-01 Critical CSS review — **DONE**
- [x] P6-02 JS budget review — **DONE**
- [x] P6-03 Third-party request review — **DONE**
- [x] P6-04 Image optimization — **DONE**
- [x] P6-05 Font-loading verification — **DONE**
- [x] P6-06 LCP/CLS/INP validation — **DONE**
- [ ] P6-07 Keyboard audit — **IN PROGRESS** (automated keyboard checks pass (skip link, menu, search dialog, Escape, focus return); full manual audit pending)
- [ ] P6-08 Focus visibility/not-obscured audit — **IN PROGRESS** (focus-visible styles + scroll-padding for sticky header; manual audit pending)
- [x] P6-09 Contrast audit — **DONE**
- [ ] P6-10 Screen-reader smoke test — **NOT STARTED** (needs a human screen-reader pass (NVDA/VoiceOver))
- [ ] P6-11 Reduced-motion test — **IN PROGRESS** (reduced-motion CSS in place; manual verification pending)
- [x] P6-12 Security/header/CSP review — **DONE**
- [ ] P6-13 Cross-browser/device test — **IN PROGRESS** (Chromium tested at 7 widths; Firefox, Safari, Edge and real devices pending)
- [ ] P6-14 Performance/accessibility release gate — **NOT STARTED** (waits on P6-07/08/10/11/13)

### Phase 7 — Initial Content Population

- [ ] P7-01 Write and review 12 pillar pages — **IN PROGRESS** (11/12 drafted; PILLAR-01 consolidated into /data-engineering/roadmap/ (D-016))
- [ ] P7-02 Write and review 30 technology guides — **IN PROGRESS** (30/30 drafted)
- [ ] P7-03 Write and review 30 interview questions — **IN PROGRESS** (30/30 drafted)
- [ ] P7-04 Write and review 12 company guides — **IN PROGRESS** (10/12 drafted; COMPANY-09 Visa and COMPANY-12 Akamai BLOCKED: no attributable official interview sources)
- [ ] P7-05 Write and review 8 roadmap/career resources — **IN PROGRESS** (8/8 drafted)
- [ ] P7-06 Write and review 8 projects — **IN PROGRESS** (8/8 drafted)
- [ ] P7-07 Write and review 8 system designs — **IN PROGRESS** (8/8 drafted)
- [ ] P7-08 Write and review 10 cheat sheets — **IN PROGRESS** (10/10 drafted)
- [ ] P7-09 Write and review 20 supporting guides — **IN PROGRESS** (13/20 drafted; 7 consolidated into existing pages (D-016))
- [ ] P7-10 Run complete content-link/reference validation — **IN PROGRESS** (internal links, anchors and references validate for all 165 pages)
- [ ] P7-11 Run content QA and evidence audit — **NOT STARTED**
- [ ] P7-12 Launch content gate — **NOT STARTED**

### Phase 8 — Production Launch

- [x] P8-01 Production build — **DONE** (npm run build produces dist/ with Pagefind index)
- [x] P8-02 Cloudflare static deployment configuration — **DONE** (wrangler deploy --dry-run passes)
- [ ] P8-03 Custom domain/DNS — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-04 HTTPS — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-05 404/trailing-slash validation — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-06 Sitemap/robots/canonical production validation — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-07 Search Console setup — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-08 Analytics verification — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-09 Final smoke tests — **BLOCKED** (needs domain + Cloudflare account)
- [ ] P8-10 Launch approval gate — **BLOCKED** (needs domain + Cloudflare account)

### Phase 9 — Growth

- [ ] P9-01 Weekly Search Console review — **NOT STARTED**
- [ ] P9-02 Monthly content refresh review — **NOT STARTED**
- [ ] P9-03 Search failure/relevance review — **NOT STARTED**
- [ ] P9-04 Internal-linking improvement loop — **NOT STARTED**
- [ ] P9-05 Evidence-driven content expansion — **NOT STARTED**
- [ ] P9-06 Monetization experiment review — **NOT STARTED**
- [ ] P9-07 Dependency/performance budget review — **NOT STARTED**
- [ ] P9-08 Architecture trigger review — **NOT STARTED**

## 0.6 Task completion record template

At task completion, append or update a task record using this format:

```md
### P2-05 — Article Template
Status: DONE
Completed: YYYY-MM-DD
Files changed:
- src/layouts/ArticleLayout.astro
- src/components/article/...
Validation:
- npm run check ✅
- npm run build ✅
- keyboard smoke test ✅
- mobile 360px/390px ✅
- article visual QA ✅
Notes:
- ...
Deviation: NONE
Next task: P2-06
```


## 0.11 Task records — session 2026-10-04

### Phase 0 — Product Foundation
Status: DONE (P0-03 BLOCKED on domain)
Files: `astro.config.mjs`, `src/content.config.ts`, `src/data/site.ts`, `wrangler.jsonc`, `docs/*`, `docs/content-inventory.json`
Validation: `npm run check` ✅ `npm run build` ✅ `npm run check:inventory` ✅ (138 IDs)
Deviation: content IDs map directly to URLs, no `slug` field (D-001); single articles collection (D-002)

### Phase 1 — Design System
Status: DONE
Files: `src/styles/**` (layers: reset, tokens, base, layout, components, utilities, overrides), `src/components/{layout,navigation,content}/*`, `src/scripts/{theme,menu,enhance}.ts`
Validation: `npm run check:contrast` ✅ (34 pairs, both themes); screenshots 360–1440px light and dark ✅; keyboard tests ✅
Deviation: contrast-driven token adjustments (D-004); dropdowns deferred (D-005); tabs deferred (D-006); gallery replaced by representative pages (D-007)

### Phase 2 — Core Templates
Status: DONE
Files: `src/layouts/*`, `src/pages/**`, `src/components/article/ArticlePage.astro`, `src/components/roadmap/RoadmapNodes.astro`, `src/components/search/*`
Validation: 55 pages × 7 widths (360, 390, 480, 768, 1024, 1280, 1440) with zero horizontal overflow ✅; no console errors ✅; roadmap and navigation usable without JavaScript ✅

### Phase 3 — Content Engine
Status: DONE
Files: `src/utils/{content,validation,related,breadcrumbs,dates}.ts`
Validation: invalid references, duplicate URLs, unknown technologies, placeholder text and folder/technology mismatches fail the build ✅; reverse related links ✅; TOC only with ≥3 H2s ✅

### Phase 4 — SEO
Status: DONE
Files: `src/utils/seo.ts`, `BaseLayout.astro`, `public/robots.txt`, `public/_redirects`, `public/og/default.png`
Validation: `npm run check:dist` ✅ — unique titles/descriptions/canonicals, one H1 per page, valid JSON-LD, sitemap = indexable pages exactly (54), 404 and /search/ noindex and excluded, all internal links and anchors resolve, all og:image files exist

### Phase 5 — Search
Status: DONE
Files: `src/scripts/search.ts`, `src/scripts/site.ts`, `src/components/search/*`, `src/pages/search/index.astro`
Validation: "broadcast join" ranks the broadcast-join question first ✅; type and difficulty filters ✅; empty and unavailable states ✅; Ctrl/Cmd+K, Escape, focus handling ✅; Pagefind not requested on content pages ✅; CLS 0 ✅

### Phase 6 — Performance, Accessibility, Security
Status: IN PROGRESS
Validation: largest initial JS 4.6 KB gz (target 75), CSS 6.4 KB gz (target 35); zero third-party requests; lab LCP 80–240 ms locally at 4× CPU throttle and CLS 0.000 on 7 representative pages; security headers and CSP in `public/_headers`
Pending: manual keyboard and screen-reader passes, Firefox/Safari/Edge/real devices

### Phase 7 — Content
Status: IN PROGRESS — 136/138 drafted or consolidated, 2 blocked (165 pages built). Code examples were executed: SQL on SQLite 3.45, PySpark examples on PySpark 4.2 (local), the Airflow DAG parsed on Airflow 3.3, the Python tutorial with its pytest suite. Every item still needs human technical, editorial and SEO review before it may be marked PUBLISHED.

### Phase 8 — Launch
Status: BLOCKED — `dist/` builds and `wrangler deploy --dry-run` passes; domain, DNS, deployment, Search Console and analytics need the owner's accounts. Steps: `docs/DEPLOYMENT.md`.

Next task: P7-11 human technical/editorial/SEO review of drafted items; P8 launch once a domain and Cloudflare account are provided.

## 0.7 Per-task validation contract

A task is `DONE` only when its own acceptance criteria pass.

For implementation tasks, validate the relevant subset of:

1. Type/build validity
2. Visual correctness
3. Responsive behavior
4. Accessibility
5. SEO, when page output changes
6. Performance, when payload/rendering changes
7. Content integrity, when content/schema changes
8. Regression checks on representative pages

A task may not be marked `DONE` because the code “looks right” in a single viewport.

## 0.8 Stop/ask policy

The coding agent may stop and request user input only when a required decision is genuinely absent from this document or when an external credential/domain value is required.

The agent must otherwise make implementation choices using this document's locked defaults and record any non-material implementation choice in the task notes.

## 0.9 Regression rule

After every major phase, rerun:

```text
npm run check
npm run lint
npm run build
```

Then perform the phase-specific acceptance checklist and inspect:

- homepage
- one technology hub
- one article
- one interview question
- one roadmap
- one project
- one system design
- search
- 404

## 0.10 Change log

```md
## Change Log

- 2026-10-04 — P0–P5 — platform, design system, templates, content engine, SEO, search built — npm run validate ✅ — initial implementation
- 2026-10-04 — P6 — contrast tokens, CLS fix on /search/, budgets measured — check:contrast ✅ check:dist ✅ — accessibility/performance hardening
- 2026-10-04 — P7 — 26 inventory items drafted with executed examples — build validation ✅ — launch content started
- 2026-10-05 — P7 — remaining inventory drafted (136 drafted/consolidated, 2 blocked); company guides limited to attributable official sources — npm run validate ✅ — launch content drafted
```

The agent must not create a second project tracker elsewhere unless a project-management integration is explicitly introduced later.

---

# 0A. Cross-Document Coverage Matrix

This final file intentionally absorbs the source material rather than requiring the source files during implementation.

| Source requirement area | Where implemented in this document |
|---|---|
| Data Engineering-first product direction | Sections 1–8, Product Positioning |
| No code execution in V1 | Non-Goals, trade-off register, deferred features, future architecture |
| Astro/static-first architecture | Technical Architecture, Astro Architecture, deployment |
| No DB/auth/SSR/Worker script V1 | Architecture, deployment, security, deferred features |
| Premium Editorial Developer identity | Design Philosophy, Brand, Color, Typography, all templates |
| Goal-based global navigation | IA, Navigation Specification |
| Technology hubs | Sitemap, Technology Hub Specification, content inventory |
| Learning roadmaps | Roadmap Specification, content inventory |
| Interview preparation | Interview templates, content inventory |
| Company preparation evidence labels | Company Interview Specification, content schema, content QA |
| DE system design | System Design Specification, inventory |
| Focused DSA curriculum | Product scope, roadmap/career inventory |
| Deep projects | Project Specification, inventory |
| Career content | Career taxonomy, inventory |
| Article flagship UX | Article Specification, design system |
| Search without a backend | Pagefind search architecture |
| SEO-first architecture | SEO, structured data, linking, sitemap, robots |
| Performance budgets | Performance Architecture + QA |
| Accessibility/WCAG-aware requirements | Accessibility system + QA |
| Privacy-conscious analytics | Analytics strategy |
| Conservative monetization | Monetization strategy |
| Low-cost hosting | Cloudflare deployment + cost strategy |
| Git/GitHub workflow | Git workflow |
| Editorial workflow | Content Production Strategy |
| Phase-wise implementation | Development Phases + Live TODO Tracker |
| Exact build order | Recommended Build Order + task register |
| Launch checklist | Launch Checklist + launch gate |
| Future architecture | Future Architecture |
| Deferred features | Explicitly Deferred Features + DO NOT BUILD YET |
| Risk register | Risk Register |
| Definition of Done | Final Definition of Done + launch gate |

# 1. Executive Summary

## Executive Summary

Data Career Hub is a premium, structured learning and interview-preparation platform for aspiring and working Data Engineers.

It is not a traditional blog archive. It is a learning system organized around journeys:

**Beginner → Learner → Practitioner → Interview Candidate → Job Ready**

The launch product focuses on **Data Engineering**, with expansion into adjacent data careers only after the Data Engineering vertical demonstrates meaningful traction.

The product promise is:

> **Everything a modern data professional needs to learn Data Engineering, practice intentionally, prepare for interviews, and plan a career — organized into clear paths rather than scattered articles.**

The website must feel like a combination of:

- premium technical publication
- modern developer documentation
- restrained SaaS product
- structured learning platform

It must not feel like:

- generic ed-tech
- generic SaaS marketing
- a dashboard
- a card-heavy AI-generated website
- a coaching portal
- a flashy developer portfolio

The core design philosophy is:

> **Content is the visual hero.**

Premium quality must come from typography, spacing, alignment, hierarchy, composition, consistency, information architecture, and interaction quality.

---

---

# 2. Product Vision

## Product Vision

## Product vision

Build a destination where a visitor can arrive with a Data Engineering goal and immediately understand:

- what to learn
- in what order
- what to practice
- what technologies matter
- what interview questions to prepare
- how to prepare for company interviews
- how to approach system design
- which projects demonstrate skill
- how to move toward a job

The platform should reduce the need to assemble preparation from dozens of disconnected sources.

## Product promise

Every major page must answer:

> **“Where do I go next?”**

The next step should be visible through contextual links, related resources, roadmap stages, or an explicit next-action CTA.

## Product-quality hierarchy

When priorities conflict, use this order:

1. Learning usefulness and technical correctness
2. Readability and UX
3. Accessibility
4. Performance
5. SEO and discoverability
6. Maintainability
7. Monetization
8. Decorative visual effects

No SEO, monetization, animation, or technology choice may violate the higher-ranked goals without a documented product reason.

---

---

## 2A. Platform Positioning Boundary

The website must feel like a premium developer documentation site + modern SaaS product + high-quality technical publication. It must **not** feel like a traditional Blogger/education blog, generic coaching site, generic SaaS landing page, or AI-generated card-grid template.

Do not imitate the visual identity of any specific existing brand. Use broad design disciplines only.

# 3. Product Goals

## Product Goals

## Primary goals

1. Create a trusted Data Engineering learning destination.
2. Make complex technical material easier to scan, understand, practice, and revisit.
3. Create strong topical clusters instead of an unstructured blog archive.
4. Build an excellent article-reading experience.
5. Make interview preparation practical and evidence-labelled.
6. Build a strong SEO foundation without publishing thin pages.
7. Make the site exceptionally fast on mobile.
8. Make the visual system distinctive without being visually noisy.
9. Keep hosting and maintenance costs close to zero at launch.
10. Establish architecture that can later support dynamic product features without forcing an early migration.

## Success signals

Primary product signals:

- organic impressions and clicks
- high-quality landing pages
- search-to-content journeys
- technology-hub engagement
- roadmap starts
- progression into related resources
- repeat visits
- interview-content usage
- project-content engagement
- search success rate when measurable
- revenue after monetization is introduced

---

---

# 4. Non-Goals

## Non-Goals

V1 must not become:

- a coding execution platform
- an online Spark cluster
- a SQL execution environment
- a Python execution environment
- a social network
- a community/forum
- a personalized dashboard
- a learning-management system
- a generic all-technology portal
- a full competitive-programming competitor
- a CRM
- a recruiting marketplace
- a subscription/paywall-first business
- an AI chatbot embedded everywhere

These are deliberately deferred.

---

---

## 4A. Explicitly Deferred Adjacent Verticals and Execution Products

Do not launch separate product verticals for Android, iOS, cybersecurity, QA, or unrelated technology careers.

Do not ship browser-based PySpark/Spark/SQL/Python execution, hosted Spark clusters, or a cloud coding sandbox in V1.

# 5. Target Audiences

## Target Audiences

## Primary audience

### Aspiring Data Engineers
Need a clear learning sequence and practical starting point.

### Junior Data Engineers
Need stronger fundamentals, interview preparation, and project depth.

### Working Data Engineers switching jobs
Need efficient revision, interview questions, system design, and company preparation.

### Students targeting Data Engineering
Need structured fundamentals and interview-oriented practice.

### Developers transitioning into Data Engineering
Need translation from software concepts into data systems.

## Secondary audience

- Data Analysts moving into Data Engineering
- Analytics Engineers
- Data Scientists strengthening engineering skills

## Future audiences

- AI/ML Engineers
- Software Engineers
- broader data professionals

Do not build these as separate primary verticals in V1.

---

---

# 6. Personas

## Personas

## Persona A — The Beginner

**Goal:** Become job-ready without getting lost.

Needs:

- roadmap
- prerequisite ordering
- simple explanations
- learning checkpoints
- beginner projects
- interview orientation

Primary journey:

`Homepage → Roadmap → Technology Hub → Beginner Guide → Practice → Project`

## Persona B — The Working Engineer

**Goal:** Switch jobs.

Needs:

- fast revision
- focused interview questions
- system design
- technology comparisons
- company preparation
- project discussion material

Primary journey:

`Search → Interview Topic → Deep Answer → Follow-ups → System Design → Project`

## Persona C — The Practical Learner

**Goal:** Build production-grade understanding.

Needs:

- architecture
- data flow
- reliability
- observability
- trade-offs
- implementation detail

Primary journey:

`Technology Hub → Deep Dive → System Design → Project → Interview Questions`

## Persona D — Search Visitor

**Goal:** Solve one immediate problem.

Needs:

- fast answer
- clear context
- trustworthy explanation
- related next steps

Primary journey:

`Search Engine → Article → Answer → Related Concept → Interview / Project`

---

---

# 7. User Journeys

## User Journeys

## New learner

1. Lands on homepage.
2. Understands the product in <3 seconds.
3. Clicks **Start Data Engineering Roadmap**.
4. Sees the ordered journey.
5. Opens SQL fundamentals.
6. Learns concepts through structured articles.
7. Moves to practice.
8. Moves to PySpark/warehousing/cloud.
9. Reaches projects and interview preparation.

## Interview preparation

1. Searches or opens Interview.
2. Selects technology/topic.
3. Filters by difficulty/type.
4. Opens question.
5. Reads short answer.
6. Reads deep explanation.
7. Reviews mistakes and follow-ups.
8. Opens related concept.
9. Continues to system design or company guide.

## Company preparation

1. Opens Interview → Companies.
2. Selects a company.
3. Reads scope and evidence labels.
4. Reviews commonly reported areas.
5. Practices representative questions.
6. Continues to technology and system-design preparation.

## Search visitor

1. Opens global search.
2. Types query.
3. Receives ranked results.
4. Filters by type/difficulty/topic.
5. Reads result.
6. Receives relevant next-step links.

---

---

# 8. Information Architecture

## Information Architecture

The information architecture is organized around **goals**, not around listing every technology in the global navigation.

## Global goals

- Learn
- Interview
- Roadmaps
- Projects
- Career
- Resources

Search is a persistent utility.

## Learning structure

`Technology Hub → Topic → Article/Tutorial → Related concepts → Interview → Project`

## Interview structure

`Interview Hub → Technology / Topic → Question → Follow-up → Related learning`

## Career structure

`Career Hub → Resume / LinkedIn / Portfolio / Career transition / Behavioral / Job search`

---

---

# 9. Sitemap

## Sitemap

```text
/
├── /data-engineering/
│   ├── /roadmap/
│   ├── /interview-preparation/
│   ├── /system-design/
│   └── /projects/
│
├── /sql/
├── /python/
├── /pyspark/
├── /spark/
├── /databricks/
├── /snowflake/
├── /kafka/
├── /airflow/
├── /dbt/
├── /aws/
├── /azure/
├── /gcp/
├── /delta-lake/
├── /data-warehousing/
├── /data-lakes/
├── /etl-elt/
├── /git/
├── /linux/
└── /apis/
│
├── /interview/
│   ├── /sql/
│   ├── /python/
│   ├── /pyspark/
│   ├── /spark/
│   ├── /databricks/
│   ├── /snowflake/
│   ├── /kafka/
│   ├── /airflow/
│   ├── /cloud/
│   ├── /data-engineering/
│   ├── /system-design/
│   └── /dsa/
│
├── /interview/companies/
│
├── /projects/
│
├── /career/
│
├── /resources/
│
├── /search/
├── /about/
├── /contact/
├── /privacy/
├── /terms/
├── /disclaimer/
└── /404/
```

Do not create unnecessary taxonomy depth in URLs.

---

---

# 10. URL Architecture

## URL Architecture

## URL policy

Published URLs are durable assets.

Rules:

- lowercase only
- words separated by hyphens
- no dates in URLs unless date is core to the content identity
- no query parameters for canonical content
- no technology names duplicated unnecessarily in deeply nested article URLs
- trailing slash is canonical
- change URLs only for strong reasons
- retain redirects for changed URLs

## Canonical form

```text
https://example.com/pyspark/window-functions/
```

Not:

```text
https://example.com/pyspark/window-functions
https://example.com/PySpark/window_functions.html
```

Canonical output should match the chosen trailing-slash policy.

## URL depth rule

Use taxonomy in navigation and breadcrumbs, not necessarily in every URL.

Good:

```text
/pyspark/window-functions/
```

Avoid:

```text
/data-engineering/learn/big-data/processing/apache-spark/pyspark/sql/window-functions/
```

## Migration rule

When a published URL must change:

1. create a 301 redirect
2. update internal links
3. update canonical
4. update sitemap
5. verify old URL and destination in production

---

---

# 11. Content Taxonomy

## Content Taxonomy

## Primary content types

- Article
- Tutorial
- Interview Question
- Interview Topic Hub
- Company Guide
- Roadmap
- System Design
- Project
- Cheat Sheet
- Career Guide

## Taxonomy dimensions

Every content item may have:

- technology
- topic
- subtopic
- content type
- difficulty
- audience level
- interview relevance
- project relevance
- prerequisites
- related content
- version context

## Difficulty

Use exactly:

- Beginner
- Intermediate
- Advanced

For interview questions also:

- Easy
- Medium
- Hard

Do not mix these labels within the same component without context.

---

---

## 11A. Launch Technology Universe and Career Coverage

The launch learning universe must explicitly cover the technology families named in the product requirements.

### Core programming / query

- SQL
- Python
- Basic Java/Scala where relevant

### Distributed processing

- PySpark
- Apache Spark

### Data platforms

- Data Warehousing
- Data Lakes
- ETL / ELT
- Databricks
- Snowflake
- Delta Lake
- dbt

### Streaming / orchestration

- Kafka
- Airflow

### Cloud

- AWS
- Azure
- GCP

### Engineering foundations

- Git / GitHub
- Linux
- APIs

### Interview and career coverage

The launch content system must also support SQL Interview, Python Interview, PySpark Interview, Spark Interview, Databricks Interview, Snowflake Interview, Kafka Interview, Airflow Interview, Cloud Interview, Data Engineering Concepts, Data Engineering System Design, DSA for Data Engineers, Behavioral / HR, Resume, LinkedIn, Portfolio, Career transitions, Certifications, Salary research, Interview preparation, Project selection, Job-search strategy, and related career guidance.

Do not create empty technology hubs merely to make the sitemap look larger.

# 12. Content Models

## Content Models

The schema is designed to make content authoring independent from UI code.

## Shared frontmatter

```yaml
title: string
description: string
slug: string
contentType: enum
status: enum
technology: string[]
topic: string[]
tags: string[]
difficulty: string
audience: string[]
author: string
publishedDate: date
updatedDate: date
reviewedDate: date
featured: boolean
seoTitle: string?
seoDescription: string?
canonicalUrl: string?
image: string?
imageAlt: string?
prerequisites: string[]
related: string[]
next: string?
previous: string?
```

## Article

```yaml
contentType: article
estimatedReadingMinutes: number
technology: string[]
topic: string[]
versionContext: string?
sources:
  - label: string
    url: string
```

## Tutorial

```yaml
contentType: tutorial
estimatedReadingMinutes: number
prerequisites: string[]
learningObjectives: string[]
technologies: string[]
```

## Interview question

```yaml
contentType: interview-question
questionType:
  - conceptual
  - coding
  - scenario
  - debugging
  - architecture
  - optimization
difficulty: Easy | Medium | Hard
estimatedMinutes: number
technology: string[]
topic: string[]
interviewRelevance: High | Medium | Foundational
evidenceStatus:
  - verified-attributed
  - reported
  - commonly-reported
  - representative
followUps: string[]
related: string[]
```

## Company guide

```yaml
contentType: company-guide
company: string
companySlug: string
evidenceNote: string
verifiedSources: string[]
commonTopics: string[]
reportedQuestions: string[]
representativeQuestions: string[]
```

Editorial rule:

**A representative question must never be rendered with UI language that implies the company actually asked it.**

Recommended labels:

- Reported candidate question
- Commonly reported topic
- Representative practice question

## Roadmap

```yaml
contentType: roadmap
roadmapType: data-engineer
stages:
  - id: string
    title: string
    summary: string
    estimatedEffort: string
    resources: string[]
    outcome: string
```

## System design

```yaml
contentType: system-design
problem: string
functionalRequirements: string[]
nonFunctionalRequirements: string[]
scaleAssumptions: string[]
architectureSummary: string
technologies: string[]
tradeoffs:
  - decision: string
    alternative: string
    reason: string
    consequence: string
interviewFollowUps: string[]
```

## Project

```yaml
contentType: project
level: Beginner | Intermediate | Advanced
problemStatement: string
requirements: string[]
technologies: string[]
dataset: string?
architectureImage: string?
steps: string[]
testing: string[]
monitoring: string[]
dataQuality: string[]
costConsiderations: string[]
interviewQuestions: string[]
resumeBullets: string[]
extensions: string[]
```

## Cheat sheet

```yaml
contentType: cheat-sheet
topic: string
technology: string[]
versionContext: string?
```

---

## Content Relationship Model

Use explicit relationships instead of relying exclusively on text links.

Example:

```text
Technology
  ↓
Topic Hub
  ↓
Article
  ├── Prerequisite
  ├── Related concept
  ├── Interview question
  ├── Project
  └── Next learning step
```

The build should validate references during build time.

Broken content references must fail the build or produce a clearly reported warning depending on severity.

---

---

# 13. Design Philosophy

## Design Philosophy

## Identity

**Premium Editorial Developer Platform**

Visual influence:

- 40% Swiss/minimalist discipline
- 25% editorial design
- 20% developer documentation
- 10% SaaS/product polish
- 5% restrained visual effects

## Visual rules

Use:

- strong typography
- disciplined grid
- calm color
- subtle borders
- deliberate whitespace
- precise alignment
- high-quality code blocks
- useful diagrams
- small interaction details

Avoid:

- excessive gradients
- neon
- glassmorphism
- giant cards
- excessive rounding
- heavy shadows
- floating particles
- oversized illustrations
- stock photography
- badge clouds
- generic feature-card grids

## The three-second test

Within three seconds on any major page, the visitor should understand:

1. where they are
2. what the page is about
3. what they can do next

---

---

# 14. Brand Direction

## Brand Direction

## Brand character

The visual personality should communicate:

- intelligent
- trustworthy
- technical
- composed
- precise
- modern
- useful

## Wordmark

Use a clean text-first wordmark:

**Data Career Hub**

No complex illustrated logo is required for V1.

## Iconography

Use a single coherent icon style:

- simple line icons
- 1.5–2px visual stroke
- no emoji as UI icons
- no mixed icon libraries

Prefer inline SVG or a tiny local icon set over large icon packages.

## Imagery

Default visual assets:

1. architecture diagrams
2. data-flow illustrations
3. technical diagrams
4. editorial abstract shapes only when useful

Images must teach or establish context.

---

---

# 15. Color System

## Color System

Use light mode as the primary presentation and dark mode as a first-class theme.

## Light theme

| Token | Value | Usage |
|---|---|---|
| `--c-bg` | `#F7F8FA` | page background |
| `--c-surface` | `#FFFFFF` | content surface |
| `--c-surface-2` | `#F1F3F6` | elevated/secondary surface |
| `--c-text` | `#101828` | primary text |
| `--c-text-muted` | `#667085` | secondary text |
| `--c-text-subtle` | `#98A2B3` | tertiary metadata |
| `--c-border` | `#E4E7EC` | separators |
| `--c-border-strong` | `#D0D5DD` | stronger separators |
| `--c-accent` | `#315BFF` | primary links/CTA |
| `--c-accent-hover` | `#2547C7` | hover |
| `--c-accent-soft` | `#EEF2FF` | accent background |
| `--c-success` | `#067647` | success |
| `--c-warning` | `#B54708` | warning |
| `--c-error` | `#B42318` | error |
| `--c-info` | `#175CD3` | info |
| `--c-code-bg` | `#0B1220` | code surface |
| `--c-code-text` | `#E6EDF7` | code text |

## Dark theme

| Token | Value |
|---|---|
| `--c-bg` | `#0E1116` |
| `--c-surface` | `#151A21` |
| `--c-surface-2` | `#1B222C` |
| `--c-text` | `#F5F7FA` |
| `--c-text-muted` | `#98A2B3` |
| `--c-text-subtle` | `#667085` |
| `--c-border` | `#27313D` |
| `--c-border-strong` | `#344054` |
| `--c-accent` | `#7AA2FF` |
| `--c-accent-hover` | `#A8BCFF` |
| `--c-accent-soft` | `#18233F` |
| `--c-code-bg` | `#080B10` |
| `--c-code-text` | `#E6EDF7` |

Do not generate the dark theme by applying `filter: invert()`.

## Color rules

- Never use color as the sole signal for status.
- Maintain visible text labels for semantic states.
- Keep technology branding subordinate to the site palette.
- Do not create a different primary UI color for every technology.
- Verify contrast in automated and manual checks.

---

---

# 16. Typography System

## Typography System

## Font policy

Use a system-first sans-serif stack:

```css
font-family:
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Code:

```css
font-family:
  ui-monospace,
  SFMono-Regular,
  Menlo,
  Monaco,
  Consolas,
  "Liberation Mono",
  monospace;
```

Do not load external web fonts by default.

## Type scale

Use `clamp()`.

```css
--fs-xs: 0.75rem;
--fs-sm: 0.875rem;
--fs-md: 1rem;
--fs-lg: 1.125rem;
--fs-xl: 1.25rem;
--fs-2xl: 1.5rem;
--fs-3xl: 2rem;
--fs-4xl: clamp(2rem, 4vw, 3.5rem);
--fs-display: clamp(2.5rem, 5vw, 4.5rem);
```

## Role guidance

| Role | Target |
|---|---|
| H1 | `clamp(2.25rem, 5vw, 4rem)` |
| H2 | `clamp(1.75rem, 3vw, 2.5rem)` |
| H3 | `clamp(1.35rem, 2vw, 1.75rem)` |
| H4 | `1.125–1.35rem` |
| Body | `1–1.125rem` |
| Metadata | `0.8125–0.875rem` |
| Caption | `0.8125rem` |
| Code | `0.8125–0.9375rem` |

## Reading line-height

Body:

```css
line-height: 1.65;
```

Headings:

```css
line-height: 1.1–1.25;
```

Code:

```css
line-height: 1.65;
```

---

---

# 17. Spacing System

## Spacing System

Use a 4px base rhythm.

```text
4
8
12
16
20
24
32
40
48
64
80
96
120
```

Rules:

- control internal padding: 8–16px
- compact grouped content: 12–24px
- section spacing: 48–96px
- major homepage section separation: 80–120px
- article paragraph spacing: 1–1.25rem
- avoid equal giant spacing between every section

The goal is structured density.

---

---

# 18. Layout System

## Radius System

```text
radius-sm   = 6px
radius-md   = 10px
radius-lg   = 14px
radius-pill = 999px
```

Rules:

- buttons: 8–10px
- inputs: 8–10px
- cards: 10–14px
- badges: pill
- do not apply large radius to every section

---

## Shadow System

Use borders and whitespace before shadows.

```css
--shadow-sm:
  0 1px 2px rgba(16, 24, 40, 0.06);

--shadow-md:
  0 8px 24px rgba(16, 24, 40, 0.10);
```

Use shadows only for:

- popovers
- mobile menu overlay
- modal/dialog
- elevated interaction requiring separation

Do not use shadows to make ordinary cards look dramatic.

---

## Layout System

## Global container

```text
max-width: 1240px
```

Default horizontal padding:

```text
16px mobile
24px tablet
32px desktop
```

## Article reading width

```text
720–760px
```

Default:

```text
740px
```

## Wide technical content

```text
1080–1120px
```

Use for:

- diagrams
- system design
- architecture tables
- project flows
- wide code
- comparison tables

## Grid

Desktop:

```text
12-column grid
```

Tablet:

```text
8-column grid
```

Mobile:

```text
4-column conceptual grid
```

Do not force visible column borders.

---

---

# 19. Responsive Design System

## Responsive Design System

Use layout-driven breakpoints:

```text
360px
480px
768px
1024px
1280px
1440px+
```

Do not optimize only for named device models.

## 360px

Priority:

1. readable content
2. navigation
3. search
4. code
5. CTA

Rules:

- no horizontal page overflow
- CTA buttons can become full-width
- metadata wraps cleanly
- no multi-column cards

## 480px

Allow:

- 2-column small utility layouts
- compact metadata rows
- slightly wider code display

## 768px

Transition point for:

- tablet navigation
- 2-column content sections
- wider card groups
- roadmap layout changes

## 1024px

Allow:

- wider content
- contextual TOC
- multi-column homepage sections
- expanded navigation

## 1280px+

Full editorial composition:

- 12-column grid
- contextual side elements
- wide diagram breakout
- larger content grouping

## Mobile composition rule

Do not simply stack desktop blocks.

Each major page type must have a mobile-specific composition.

---

---

# 20. Accessibility System

## Accessibility System

Target **WCAG 2.2 AA-aware** implementation.

## Required

- semantic landmarks
- one logical H1 per page
- logical heading sequence
- keyboard navigation
- visible focus state
- focus not hidden by sticky UI
- skip link
- accessible labels
- meaningful alt text
- accessible disclosure controls
- no hover-only critical information
- status not conveyed only by color
- accessible tables
- accessible code blocks
- reduced motion
- minimum practical touch target of ~44px for interactive controls
- no keyboard traps except native modal behavior with correct focus management

WCAG 2.2 explicitly includes requirements around visible focus and focus not being obscured by author-created content; the implementation must account for sticky headers/TOCs and modal surfaces.

## Focus style

Default:

```css
:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 3px;
}
```

Do not remove focus outlines.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

---

# 21. Component Library

## Component Library

Every component must specify:

- purpose
- anatomy
- variants
- states
- props
- accessibility
- responsive behavior
- usage rules
- prohibited usage

## Header

**Purpose:** primary navigation and search.

Desktop:

```text
Logo | Learn | Interview | Roadmaps | Projects | Career | Resources | Search | Theme
```

Height:

```text
68px
```

Behavior:

- sticky
- subtle bottom border
- no giant shadow
- remains visually calm

Mobile:

```text
Logo | Search | Menu
```

Height:

```text
60px
```

## Navigation

Use goal-based navigation.

Do not expose every technology in the primary nav.

Dropdowns may expose:

- popular technologies
- primary learning paths
- top interview categories

Do not create a mega-menu.

## Mobile menu

Use native dialog-like behavior where practical.

Requirements:

- focus moves into menu
- Escape closes
- close button has accessible name
- focus restored to trigger
- background content cannot be accidentally interacted with
- menu contains goals and a small “Popular technologies” section

## Breadcrumb

Example:

```text
Home / Learn / PySpark / Window Functions
```

Rules:

- semantic `<nav aria-label="Breadcrumb">`
- current page is not a link
- mobile may collapse intermediate crumbs

## Buttons

Variants:

- Primary
- Secondary
- Tertiary
- Quiet/icon

Primary button:

- solid accent
- concise verb
- one primary action per section

Avoid five competing CTA styles.

## Links

- underlines for body-content links where appropriate
- strong hover/focus state
- never rely only on color

## Card

Use for meaningful grouping only.

A card must communicate a unit such as:

- technology
- project
- interview topic
- featured resource

Do not put paragraphs or every link inside cards.

## Topic card

An information scent object:

```text
Topic label
Title
One-line summary
Difficulty
→ Open
```

## Question card

Use for lists only.

```text
Question
Difficulty · Technology · Time
Short relevance signal
→ Practice
```

## Badge

Use sparingly:

- difficulty
- status
- content type

Do not turn every metadata field into a badge.

## Code block

Must support:

- language label
- copy button
- accessible name
- syntax highlighting
- horizontal scrolling
- optional filename
- optional line numbers
- optional output

Copy feedback:

```text
Copy → Copied
```

Never rely on color-only confirmation.

## Callout

Variants:

- neutral
- info
- success
- warning
- danger

Use one semantic heading and concise message.

## Table

Desktop:

- aligned columns
- restrained dividers
- optional sticky header for long tables

Mobile:

- horizontal scroll for real tables
- do not squeeze into tiny text
- provide a meaningful label for scrollable table regions

## Tabs

Use only where content is genuinely parallel.

Use semantic buttons with correct `aria-selected`.

Do not hide essential content exclusively behind tabs if crawlability or comprehension suffers.

## Accordion

Use for:

- FAQs
- optional deep dives
- secondary detail

Do not hide core article explanations inside accordions.

## TOC

Desktop:

- contextual
- sticky after header offset
- width ~220px
- active section state

Mobile:

- collapsed disclosure near article introduction

TOC must remain keyboard accessible.

## Roadmap node

An ordered learning stage, not fake progress.

States:

- current recommended
- completed-neutral label if author-defined
- next
- optional

Never imply personal saved progress.

## Search

Must have:

- label
- keyboard access
- loading state
- empty state
- result count
- filters
- clear action
- keyboard navigation

## Related content

Use a compact list before a large card grid.

Relationship labels:

- Next step
- Prerequisite
- Related concept
- Interview practice
- Project
- Deep dive

## Empty state

Example:

```text
No results found

Try a broader technology, concept, or content type.
```

Include a suggested next action.

## Error state

Explain:

- what happened
- what the user can do next

Do not show raw stack traces.

---


---

# 21A. Complete Reusable UI Primitive Contract

The component library must include the following reusable primitives in addition to the main components already specified. A component should exist because it represents a recurring UX pattern, not because a file needs to be created.

| Component | Purpose | Required states/behavior |
|---|---|---|
| Tag | Compact topic/category marker | default, linked, active; never status-only if text is sufficient |
| FilterGroup | Search/list filter controls | keyboard, selected, clear-all, no-results |
| Pagination | Large result/list navigation | current, next, previous, disabled; canonical-aware URLs |
| ProgressIndicator | Non-personal roadmap stage indicator | ordered steps only; never fake saved completion |
| Author | Author identity/attribution | name, optional role, optional link, accessible fallback |
| CTA | Next-step or conversion action | primary, secondary, quiet; clear destination |
| ShareControl | Optional native sharing | Web Share API when supported; copy-link fallback; no third-party widget |
| FormField | Accessible field pattern for any future form | label, hint, error, required state; no placeholder-only labels |
| SearchDialog | Header search enhancement | open/close, focus trap, Escape, focus return, keyboard shortcut |
| StatusMessage | Inline feedback | info/success/warning/error; text label + non-color signal |
| LoadingState | Async enhancement feedback | minimal, non-blocking, never replace static content unnecessarily |
| SkipLink | Keyboard bypass | visible on focus, lands on main content |
| Prose | Article typography wrapper | consistent headings, lists, tables, blockquotes, code, links |
| AdSlot | Future conservative monetization boundary | reserved dimensions; hidden until enabled; never causes layout shift |

## Component implementation rules

Every component must define:

- purpose
- anatomy
- allowed variants
- visual states
- keyboard behavior
- accessibility attributes
- responsive behavior
- semantic element choice
- props/type contract
- content constraints
- when not to use it

### Form decision

V1 does not require a third-party form service. The Contact page should provide a clear email/contact route unless a form provider is deliberately selected later.

If a form is later introduced, it must have:

- explicit purpose
- privacy notice
- server/provider responsibility documented
- spam protection strategy
- success/error state
- accessible labels
- no secrets in client code

### Share decision

Do not add a social-sharing SaaS widget. Use the browser's native share capability where available and a copy-link fallback. Share enhancement is optional and must never block core content.

---

# 22. Page-by-Page UX Specifications

## Page-by-Page UX Specifications

Required templates:

1. Homepage
2. Technology Hub
3. Technology Article
4. Tutorial
5. Interview Topic Hub
6. Interview Question
7. Company Guide
8. Roadmap
9. System Design
10. Project
11. Cheat Sheet
12. Category Listing
13. Search
14. About
15. Contact
16. Privacy
17. Terms
18. Disclaimer
19. 404

---


## 22A. Additional Page Template Contracts

### Interview Topic Hub

**Purpose:** organize interview preparation by technology/topic without becoming a dashboard.

**Desktop hierarchy:**

```text
Breadcrumb
↓
Title + scope statement
↓
Topic/difficulty filters
↓
High-priority question groups
↓
Concept review links
↓
System-design/company links
↓
Next learning step
```

**Mobile:** filters collapse into a dedicated filter button or disclosure; results remain a readable single-column list.

**Accessibility:** filters are labeled groups; selected state is programmatically exposed; result updates are announced only when needed.

**SEO:** the hub has unique title/description and contextual links to child questions; do not create a hub solely because a keyword exists.

### Category / Listing Page

**Purpose:** provide a browsable index of a controlled content family.

Use:

- clear H1
- short explanatory copy
- controlled filters
- result count where useful
- compact list/grid only when grouping genuinely benefits discovery
- pagination when the collection is large
- related hub links

Do not create near-duplicate category pages for every tag.

### About Page

Must explain:

- what Data Career Hub is
- launch focus
- editorial/technical quality philosophy
- how content is reviewed
- how company interview evidence is labelled
- how to contact/report an issue if available

Do not invent founding stories, team sizes, traffic, users, testimonials, partnerships, or credentials.

### Contact Page

V1 default:

- clear contact purpose
- email/contact link when a real address is configured
- optional issue-reporting guidance
- privacy note if any form is later introduced

Do not embed a third-party form by default.

### Privacy Page

Reflect only the tools actually deployed. Do not claim “no data is collected” if analytics or logs are present.

### Terms Page

Keep terms specific to the site's actual content/service model. Do not add claims about paid products that do not exist.

### Disclaimer Page

State clearly:

- educational purpose
- content may become outdated
- verify vendor documentation for production decisions
- company interview material is evidence-labelled
- affiliate disclosures where relevant
- no guarantee of interview/job outcomes

### 404 Page

Must:

- return 404 status in production
- explain that the page was not found
- provide search entry
- provide roadmap link
- provide home link
- preserve the site's visual language

### Search Page

Must work independently of header enhancements. If search JavaScript fails, provide a useful static explanation and links to the major hubs rather than an empty shell.

---

# 23. Homepage Specification

## Homepage Specification

## Goal

The homepage should orient rather than impress.

## Above-the-fold hierarchy

```text
Header
↓
Eyebrow
↓
Headline
↓
Supporting statement
↓
Primary CTA
Secondary CTA
↓
Compact technology signal
```

Suggested headline:

> **Learn Data Engineering. Prepare Smarter. Get Job Ready.**

Supporting copy should explain that the platform combines learning paths, interview preparation, projects, and career guidance.

## Hero dimensions

Desktop:

```text
max-width: 900px
padding-top: 72–88px
padding-bottom: 56–72px
```

Mobile:

```text
padding-top: 44px
padding-bottom: 40px
```

Do not use full viewport height.

## Hero CTA

Primary:

**Start Data Engineering Roadmap**

Secondary:

**Explore Interview Preparation**

## Learning categories

Use a structured section, not 12 equal cards.

Composition:

```text
Learn
A concise explanation

SQL       Python       PySpark
Warehousing   Cloud    Databricks
Snowflake    Kafka     Airflow
```

Use text links with lightweight grouping where possible.

## Roadmap preview

Composition:

```text
Data Engineer Roadmap
Beginner → SQL → Python → Warehouse → ETL/ELT
→ PySpark → Cloud → Databricks/Snowflake
→ Kafka/Airflow → System Design → Projects → Interview
```

Desktop can use a horizontal or stepped visual.

Mobile becomes a vertical numbered list.

## Interview preparation

Do not show a wall of question cards.

Use three focused lanes:

```text
Technology interviews
System design
Company preparation
```

Each points to a hub.

## Projects

Show 3 representative projects:

- beginner
- intermediate
- advanced

Use editorial project summaries rather than equal-sized cards.

## Featured guides

Use a ranked list:

```text
01  PySpark Window Functions Explained
02  Data Warehouse vs Data Lake
03  Designing a CDC Pipeline
04  Kafka Fundamentals
```

## Trust/quality section

Use factual editorial principles:

- reviewed technical content
- version-aware documentation
- evidence-labelled interview material
- structured learning paths

Do not invent numbers, testimonials, partner logos, or user counts.

## Homepage mobile

Order:

1. hero
2. start roadmap
3. learning links
4. interview
5. projects
6. guides
7. trust
8. footer

---

---

# 24. Technology Hub Specification

## Technology Hub Specification

Example:

`/pyspark/`

## Header

```text
Breadcrumb
Technology label
H1: PySpark
Description
Key facts
```

## Hub sections

1. Overview
2. What to learn first
3. Roadmap
4. Beginner
5. Intermediate
6. Advanced
7. Interview preparation
8. Projects
9. Cheat sheet
10. Related technologies

## Visual layout

Desktop:

- central introduction
- left/center learning structure
- narrow contextual utility area if helpful

Avoid a dashboard.

## Mobile

Use sections with headings and compact lists.

---

---

# 25. Article Specification

## Article Specification

The article is the flagship product experience.

## Order

```text
Breadcrumb
Category
H1
Summary/deck
Metadata
TOC
Article body
Examples
Code
Diagrams
Tips
Warnings
Interview relevance
Related content
Previous/Next
Next step
```

## Header

Maximum title width:

```text
820px
```

Metadata:

```text
Intermediate · 9 min read · Updated Oct 2026
```

Keep metadata compact.

## Article body

Default width:

```text
740px
```

Paragraph:

```text
16–18px
line-height: 1.65
```

## Breakout content

Allow wide breakout for:

- code
- diagrams
- comparison tables
- architecture

Do not make every element full width.

## Sticky TOC

Only active on sufficiently wide layouts.

Avoid permanently taking space when article headings are few.

Rule:

- fewer than 3 useful headings → no sticky TOC
- 3+ useful headings → show contextual TOC

## Mobile article

- TOC collapsed
- no fixed right sidebar
- code horizontally scrollable
- wide tables horizontally scrollable
- images constrained to viewport
- metadata wraps
- title reduced with `clamp()`

## Article ending

Do not end immediately after the final paragraph.

Use:

```text
Key takeaway / next step
↓
Related concepts
↓
Interview questions
↓
Recommended project
↓
Previous / Next
```

---

## Tutorial Specification

Tutorials are action-oriented.

Structure:

```text
Goal
Prerequisites
What you will build
Steps
Code
Expected output
Validation
Troubleshooting
Interview relevance
Next step
```

Use numbered progress stages, not fake personal progress.

---

---

# 26. Interview Question Specification

## Interview Question Specification

## Visual priority

The question must dominate the page.

```text
Question
Metadata
Short answer
Deep explanation
Example
Code/output
Common mistakes
Follow-ups
Related questions
Related learning
Next step
```

## Short answer

Provide the direct answer immediately.

Maximum target:

```text
2–5 sentences
```

Do not force readers through a long preamble.

## Deep explanation

Explain:

- why
- how
- when
- trade-offs
- failure modes

## Interview follow-ups

Treat them as a second layer of preparation.

Example:

```text
Primary:
What is a broadcast join?

Follow-up:
When can broadcast joins become dangerous?
```

## Question lists

Use sortable/filterable lists.

Filters:

- Technology
- Difficulty
- Type
- Topic

---

---

# 27. Company Interview Specification

## Company Interview Specification

Company pages must maximize trust.

## Required structure

```text
Company header
Preparation overview
Evidence note
Reported areas
Reported candidate questions
Representative practice questions
Technology focus
System-design focus
Behavioral preparation
Related technology preparation
```

## Evidence labels

Every item must display its evidence level.

Example:

```text
REPORTED CANDIDATE QUESTION
```

or:

```text
REPRESENTATIVE PRACTICE QUESTION
```

Never use “Actual Amazon Question” unless there is credible attribution and the wording is appropriately handled.

## Company page schema

Do not create fake company facts.

Company-specific facts must be backed by:

- authoritative company materials
- reliable attributed reporting
- clearly labelled community/candidate reports

---

---

# 28. Roadmap Specification

## Roadmap Specification

The roadmap is a learning map, not a decorative infographic.

## Canonical journey

```text
01 Beginner Foundations
↓
02 SQL
↓
03 Python
↓
04 Data Warehousing
↓
05 ETL / ELT
↓
06 PySpark
↓
07 Cloud
↓
08 Databricks / Snowflake
↓
09 Kafka / Airflow
↓
10 Data Engineering System Design
↓
11 Projects
↓
12 Interview
↓
13 Job Ready
```

## Node anatomy

```text
01
Stage title
Why it matters
Prerequisites
Core resources
Outcome
→ Open stage
```

## Desktop

Use a connected horizontal/stepped journey.

## Tablet

Use a two-column staggered path.

## Mobile

Use a vertical ordered list.

Each node is a semantic list item.

## Progress policy

V1 does not save personal progress.

Do not use:

- percent complete
- fake check marks
- streaks
- XP
- personal completion dashboard

unless the user has an account in a future phase.

---

---

# 29. System Design Specification

## System Design Specification

System design pages may use a wider layout.

## Structure

```text
Problem
↓
Requirements
↓
Scale assumptions
↓
Constraints
↓
Architecture
↓
Data flow
↓
Storage
↓
Processing
↓
Orchestration
↓
Reliability
↓
Data quality
↓
Observability
↓
Security
↓
Cost
↓
Trade-offs
↓
Interview follow-ups
```

## Visual assets

Preferred:

- architecture diagrams
- data-flow arrows
- numbered processing stages
- requirements table
- trade-off table

Do not replace explanation with diagrams.

## Diagram rules

Every diagram needs:

- text explanation
- meaningful labels
- accessible alternative or adjacent textual description
- no essential information conveyed only by color

---

---

# 30. Project Specification

## Project Specification

## Structure

```text
Project overview
Difficulty
Problem
Business context
Requirements
Architecture
Technology stack
Dataset
Build steps
Testing
Data quality
Monitoring
Cost
Interview questions
Resume bullets
Extensions
Next project
```

## Resume bullets

Provide evidence-driven bullet templates.

Do not invent metrics.

Use placeholders only when the author is expected to replace them with real measured values:

```text
Reduced pipeline runtime by [X%] by...
```

Do not publish bracketed placeholders in final production content.

---

---

# 31. Search Specification

### Locked V1 search dependency

**Pagefind is the approved V1 search dependency.** Do not replace it with a hand-rolled full-text search unless there is a measured reason.

Pagefind is build-time/static and preserves the zero-backend architecture.

The search UI itself must remain custom and match the Data Career Hub design system. Do not ship Pagefind's default visual skin unchanged if it creates a visual mismatch.

### Search loading rule

Do not load the search runtime globally. Load the search module only on `/search/` and when the header search dialog is opened.


## Search Specification

## V1 decision

Use **Pagefind** as the static build-time search index.

Rationale:

- no server
- no database
- no recurring search API cost
- static deployment
- useful ranking
- supports filters
- scales better than a giant hand-written JSON file

## Searchable fields

Index:

- title
- description
- headings
- body content
- technology
- topic
- tags
- content type
- difficulty

## Search ranking

Priority:

1. exact title match
2. title token match
3. technology match
4. topic match
5. heading match
6. summary match
7. body-content match

Do not show enormous result snippets.

## Search UI

Desktop:

- header search button
- `Ctrl/Cmd + K`
- accessible dialog or navigation to `/search/`

Mobile:

- prominent search action in header
- dedicated search page

## Filters

- All
- Articles
- Tutorials
- Interview Questions
- Projects
- System Design
- Cheat Sheets
- Difficulty

## Empty state

```text
No results for “foo”

Try:
• a broader technology
• a concept instead of an exact phrase
• removing a filter
```

## Search failure

The site must still provide the dedicated `/search/` page even if the JS enhancement fails.

## Revisit trigger

Reconsider the search implementation if any of these occur:

- search index becomes operationally difficult to build
- relevance complaints become a recurring UX issue
- multilingual semantic search becomes core
- the content library exceeds approximately 5,000 indexed documents
- privacy-safe measurement demonstrates a need for advanced search analytics
- static search cannot meet the agreed interaction budget

Do not migrate to hosted search merely because it is popular.

---

---

# 32. Navigation Specification

## Navigation Specification

## Desktop global navigation

```text
Data Career Hub
Learn
Interview
Roadmaps
Projects
Career
Resources
Search
Theme
```

## Learn menu

Keep compact:

```text
Technologies
Core Data Engineering
Guides
Cheat Sheets
```

## Interview menu

```text
Interview Overview
Technology Interviews
System Design
Company Preparation
DSA for Data Engineers
Behavioral
```

## Contextual navigation

Inside `/pyspark/`:

```text
Overview
Roadmap
Beginner
Intermediate
Advanced
Interview
Projects
Cheat Sheet
```

This is where technology depth lives.

---

---

# 33. Footer Specification

## Footer Specification

Footer should be structured, not enormous.

Columns:

```text
Learn
Interview
Projects
Career
Resources
Legal
```

Bottom:

```text
© Data Career Hub
Privacy
Terms
Disclaimer
```

Optional social links only where real accounts exist.

No fake social proof.

---

---

# 34. SEO Architecture

## SEO Architecture

## Every indexable page

Must have:

- unique `<title>`
- unique meta description
- canonical
- descriptive H1
- logical heading hierarchy
- Open Graph
- Twitter/X card metadata where appropriate
- structured data where applicable
- clean URL
- internal links
- meaningful image alt
- updated/reviewed information where relevant

## Title policy

Pattern:

```text
{Primary Topic}: {Specific Value} | Data Career Hub
```

Avoid stuffing.

## Meta descriptions

Target approximately:

```text
140–165 characters
```

Do not artificially fill length.

## Robots

Generate:

```text
/robots.txt
```

Allow public content.

Disallow only intentional utility paths where required.

Do not block CSS/JS required for rendering.

## Sitemap

Generate XML sitemap at build time.

Include:

- canonical indexable pages
- content pages
- hubs

Exclude:

- 404
- noindex pages
- duplicate utility pages

## Pagination

Prefer:

- indexable category hub
- finite high-value pagination

Avoid infinite-scroll-only archives.

## Canonical

Every canonical URL must be absolute and stable.

## 404

404 page must:

- return actual 404 status
- retain site navigation
- explain missing content
- offer search
- suggest main sections
- remain useful on mobile

---

---

# 35. Structured Data

## Structured Data

Use only markup supported by visible content.

## Global

Use `WebSite` where useful.

Use `Organization` only if real organization data exists.

## Articles

Use `Article` for substantial article content.

Fields:

- headline
- description
- datePublished
- dateModified
- author
- image
- mainEntityOfPage

## Breadcrumbs

Use `BreadcrumbList`.

The visible breadcrumb and schema must match.

## FAQ

Only use FAQ structured data where:

- the content is visibly present
- questions and answers are genuine
- the page qualifies under applicable search guidance

Do not generate hidden FAQ schema solely for SEO.

## Company content

Do not imply `sameAs`, review scores, or authoritative claims that are not supported.

---

---

# 36. Internal Linking Strategy

## Internal Linking Strategy

Every major content page must provide:

1. Parent hub
2. Prerequisite or context
3. Related concept
4. Interview relevance
5. Project relevance where applicable
6. Next step

## Link hierarchy

Example:

```text
PySpark Window Functions
→ PySpark fundamentals
→ Spark SQL
→ groupBy
→ Window functions
→ row_number
→ rank
→ lag/lead
→ Spark optimization
→ PySpark interview questions
→ PySpark project
```

## Rules

- links must be contextually useful
- use descriptive anchor text
- do not use repeated exact-match anchors mechanically
- do not add “related content” just to create link count
- prioritize learning sequence

---

---

# 37. Performance Architecture

## Performance Architecture

Performance is a release criterion.

## Principles

- static HTML first
- no unnecessary hydration
- minimal JS
- no large UI framework
- optimized images
- local/system fonts
- restrained animations
- delayed noncritical third parties
- semantic HTML
- no layout shift

## Image handling

Use Astro image tooling.

Prefer:

- AVIF/WebP where beneficial
- responsive `srcset`
- explicit width/height
- lazy loading below the fold
- eager loading only for genuinely critical hero media

Do not put a large decorative image above the fold simply for visual impact.

---

## Performance Budget

These are engineering targets, not guarantees.

## Normal targets

| Metric | Target |
|---|---:|
| Initial JS | ≤ 75 KB compressed |
| CSS | ≤ 35 KB compressed |
| Typical image transfer | ≤ 150 KB/image |
| Total page weight | ≤ 700 KB typical article |
| LCP | ≤ 2.0 s |
| CLS | ≤ 0.05 |
| INP | ≤ 200 ms |
| Third-party origins | ≤ 1 at launch |
| Core content without JS | Fully readable |

## Release-blocking thresholds

| Metric | Block release when |
|---|---:|
| Initial JS | > 150 KB compressed without explicit exception |
| CSS | > 70 KB compressed without explicit exception |
| LCP | > 2.5 s on representative mobile test |
| CLS | > 0.10 |
| INP | > 200 ms consistently in tested flows |
| Main image | > 300 KB without strong reason |
| Third-party origins | > 3 |
| Horizontal page overflow | Present on supported widths |

## Measurement pages

Always test:

1. Homepage
2. Technology hub
3. Long article
4. Interview question
5. System design
6. Project
7. Search

Never optimize only the homepage.

---

---

# 38. Image Strategy

## Image Strategy

## Allowed image types

- technical diagrams
- architecture diagrams
- original illustrations
- legitimate logos where usage is appropriate
- content-supporting screenshots where permission exists

## Avoid

- generic stock people
- decorative AI-generated human scenes
- giant abstract hero artwork
- copyrighted screenshots without permission
- images with text that duplicates core HTML content unless necessary

## Alt text

Use descriptive alt text for informative images.

Decorative images:

```html
alt=""
```

Do not describe decorative images as if they carry factual content.

---

---

# 39. Analytics Strategy

### Important V1 measurement limitation

Cloudflare Web Analytics currently does not provide custom events. Therefore V1 must not introduce a custom analytics backend merely to measure button clicks.

Use destination pageviews, Search Console query/page data, and aggregate analytics to answer the majority of launch questions. Introduce event analytics only when a specific decision cannot be answered otherwise and the measurement tool passes the full dependency/privacy/performance gate.


## Analytics Strategy

## V1 stack

Use:

- Google Search Console for search acquisition
- Cloudflare Web Analytics for aggregate web/performance behavior

Cloudflare Web Analytics is currently documented by Cloudflare as privacy-first analytics and does not collect visitors' personal data; its 2026 documentation also states that custom events are not currently available. Therefore, V1 must not add a backend merely to collect custom click events.

## What to measure

From Search Console:

- impressions
- clicks
- CTR
- queries
- indexed pages
- coverage
- page performance

From Cloudflare Web Analytics:

- page views
- visitor-level aggregate analytics
- performance
- page paths
- device/browser dimensions
- aggregate referral information where available

## What not to collect

Do not collect:

- names
- email addresses
- precise personal identifiers
- session recordings
- invasive behavioral profiles
- unnecessary cookies

## Event tracking policy

Because V1 remains backend-free:

- infer internal navigation through destination page views
- do not create custom tracking endpoints
- do not add a database for analytics
- do not add a tag manager solely to support events

## Revisit trigger

Add custom event analytics only when a specific product decision cannot be answered through existing aggregate data and the chosen measurement tool passes:

- privacy test
- performance test
- security test
- maintenance test
- cost test

---

---

# 40. Content Production Strategy

## Content Production Strategy

## Workflow

```text
Research
→ Outline
→ Draft
→ Technical verification
→ Editorial review
→ SEO review
→ UX formatting
→ Internal linking
→ Publish
→ Monitor
→ Update
```

## Quality gate

Before publishing, verify:

- answer is clear
- technical claims are correct
- examples work
- code is reviewed
- version context is accurate
- citations are accurate where necessary
- internal links are useful
- title is accurate
- description is accurate
- images have correct alt text
- no fabricated facts
- no fake interview claims

## AI use

AI may assist with:

- outlines
- rewriting
- classification
- metadata drafts
- internal-link suggestions

AI must not replace:

- technical verification
- source checking
- editorial review
- factual accountability

Do not publish unreviewed AI mass content.

---

## Content Launch Portfolio

### Launch requirement

The website is **not considered content-complete at launch** if it contains only examples/templates.

The initial production release must include the mandatory launch inventory in **Appendix A — Exact Launch Content Inventory**.

The launch inventory is the minimum coherent V1 library, not a permanent limit. It is intentionally large enough for the site to function as a real learning platform on day one while remaining small enough to review for quality.

### Mandatory launch counts

| Content family | Required launch count |
|---|---:|
| Pillar pages | 12 |
| Technology guides | 30 |
| Interview questions | 30 |
| Company interview guides | 12 |
| Roadmap/career resources | 8 |
| Projects | 8 |
| System-design case studies | 8 |
| Cheat sheets | 10 |
| Supporting guides/comparisons/troubleshooting | 20 |
| **Total** | **138** |

### Content completeness rule

Every launch inventory item must have:

- a real title and stable slug
- a complete body, not placeholder text
- metadata required by its schema
- correct difficulty/audience labels where applicable
- correct internal relationships
- at least one useful parent/next-step relationship
- reviewed technical claims
- no fake metrics or fabricated claims
- evidence labels for company-interview material
- SEO metadata
- accessible formatting

### Content sequencing

Do not write 138 pages before templates are validated.

Use this sequence:

```text
5–8 representative pages
→ template QA
→ 20–30 core pages
→ internal-link QA
→ full launch inventory
→ content audit
→ production launch
```

### Editorial quality target

A shorter, complete explanation is preferable to padded content. Word count is never a release criterion by itself.


---

# 41. Monetization Strategy

## Monetization Strategy

Monetization must never overpower learning.

## V1

No aggressive monetization before meaningful traffic.

Allowed:

- conservative display advertising once traffic supports it
- relevant affiliate links
- clearly labelled sponsorships later

## Ad placement rules

Never place ads:

- inside the first 1–2 readable paragraphs
- between code lines
- inside architecture diagrams
- inside TOC
- in sticky overlays covering content
- in a way that shifts layout after load

On mobile, reduce ad density further.

## Affiliate rules

Every affiliate placement must pass:

1. relevance
2. user usefulness
3. transparency
4. no ranking manipulation
5. no visual dominance

## Future products

Potential:

- premium interview packs
- mock interviews
- career products
- premium roadmaps
- courses
- AI-assisted interview preparation

Do not paywall foundational learning content prematurely.

---


---


# 40A. RSS / Feed Decision

RSS is **not a V1 launch dependency**. The source brief mentions RSS only as “if useful,” so the final launch architecture does not add an RSS package merely for completeness.

V1 decision:

- no RSS dependency
- no third-party feed service
- content remains fully indexable through normal HTML/sitemap paths

Revisit when a concrete content-distribution strategy demonstrates that a feed materially increases subscriptions, syndication, or recurring traffic. A future feed should preferably be generated from the existing content collection at build time rather than by adding a runtime service.

# 41A. V1 Cost Strategy

The architecture is intentionally optimized for very low operating cost.

## Required V1 infrastructure

| Item | Planning approach |
|---|---|
| Domain | Approximately ₹800–₹1,500/year depending on registrar/TLD; verify at purchase time |
| Astro | Free/open source |
| GitHub | Free tier is sufficient initially |
| Cloudflare Workers Static Assets | Use current static-asset model; re-check current pricing before launch |
| SSL/TLS | Use platform/domain-supported HTTPS; verify production certificate |
| Database | ₹0 in V1 because none is required |
| Backend | ₹0 in V1 because none is required |
| Code execution | ₹0 in V1 because it is deferred |
| Paid search | ₹0 in V1 |
| Analytics | Use the selected privacy-conscious tooling; verify current vendor terms before committing |

## Planning envelope

Use **₹5,000–₹15,000 as a Year-1 planning envelope**, not a guarantee. Domain choices, optional paid services, development tooling, AI tooling, and future vendor decisions can change the actual total.

The operating principle is:

> Keep infrastructure cost near zero until real usage proves that spending creates measurable product value.

Do not describe the website as “free forever.”

## Cost-change trigger

A new recurring infrastructure cost requires a documented decision record containing:

- product problem being solved
- expected measurable benefit
- monthly/yearly cost
- performance impact
- privacy/security impact
- maintenance impact
- migration/exit plan
- threshold that would justify keeping the expense

---

# 42. Technical Architecture

### Binding decision rule

The trade-off register included in this section is authoritative. Every later implementation decision must be consistent with it.

For every major change, record:

- decision
- reason
- rejected/default alternative
- UX implication
- performance implication
- SEO implication
- maintenance implication
- measurable revisit trigger

No launch-critical decision may be left as “it depends”.


## Technical Architecture

## Final stack

```text
Astro
TypeScript
HTML
Custom CSS
Vanilla JavaScript
Markdown/MDX
Astro Content Collections
Pagefind
Git
GitHub
Cloudflare Workers Static Assets
```

## Rendering

Use:

```js
output: "static"
```

All ordinary content is generated at build time.

## No server runtime

V1 contains none of:

- SSR
- API routes
- server actions
- database
- auth
- dynamic worker code

## Dynamic architecture boundary

A future dynamic requirement may add:

```text
Cloudflare Worker
↓
API
↓
Database / KV / Durable Object / external service
```

Only after the use case is validated.

---

## Consolidated Authoritative Trade-Off Register

This is the only authoritative trade-off register. Later sections must implement it consistently.

| Area | Chosen decision | Rejected/default alternative | Key implication | Revisit trigger |
|---|---|---|---|---|
| Rendering | Static Astro | SSR | simplest, fast, cheap | personalized/server state becomes core |
| Framework | Astro + native UI | React-heavy app | low JS and maintenance | complex UI genuinely needs framework |
| Styling | Custom CSS | Tailwind/framework | stronger control, no framework dependency | team scale makes CSS maintenance costly |
| Content | Markdown/MDX | CMS-first | Git-native, fast | multiple nontechnical editors need workflow |
| Backend | None | API “for future” | zero server maintenance | dynamic workflow becomes core |
| Database | None | SQL/NoSQL | zero data-layer cost | accounts/progress/transactions |
| Search | Pagefind | hosted search | static, fast, no search bill | index/relevance/product requirements exceed it |
| Analytics | Cloudflare Web Analytics + GSC | invasive analytics | privacy-conscious | event-level measurement becomes essential |
| UI runtime | minimal JS | framework hydration | smaller payload | measured UX requires more |
| Navigation | goal-based | technology mega-menu | lower cognitive load | information architecture changes |
| Cards | selective | card-everything | stronger hierarchy | a proven discovery use case requires more |
| Hero | compact | full-screen hero | quicker access to content | research proves discovery suffers |
| Article width | ~740px | full-width prose | reading comfort | content type proves need for wider default |
| Sidebar | contextual | permanent sidebar | better mobile/readability | documentation depth becomes dominant |
| TOC | contextual | always-visible | less clutter | article structure requires it |
| Color | one restrained accent | rainbow categories | cohesive brand | brand strategy changes |
| Radius | small/medium | huge universal radius | mature editorial feel | brand redesign |
| Shadows | restrained | heavy elevation | cleaner surface hierarchy | genuine layering need |
| Animation | functional only | decorative motion | performance and calmness | interaction proves value |
| Images | useful technical visuals | stock filler | content stays central | content strategy changes |
| Mobile | first-class | shrunk desktop | better usability | never |
| Dark mode | first-class | inversion | developer-friendly quality | theme maintenance becomes disproportionate |
| Progress | guidance only | fake progress | honest UX | accounts exist |
| Gamification | none/minimal | XP/streaks | avoids distraction | evidence of learning benefit |
| AI content | assisted + reviewed | unreviewed generation | trust | never override |
| Company interviews | evidence-labelled | fabricated “actual” questions | credibility | never override |
| Monetization | conservative | aggressive ads | trust/readability | traffic supports revenue |
| Newsletter | deferred embedded form | external script on every page | simpler V1 | owned-audience strategy is defined |
| Community | deferred | comments/forum | no moderation burden | demand + moderation capacity |
| Execution | deferred | browser Spark/SQL | avoids high cost/security risk | strong demand + viable economics |
| Third parties | minimal | SaaS for convenience | performance/privacy | measurable product value |
| URLs | stable + trailing slash | taxonomy mirroring | durable SEO | migration reason |
| Programmatic SEO | controlled | mass thin pages | preserves quality | never |
| Content length | intent-driven | word-count targets | usefulness first | never |

---

## Dependency Budget

Each dependency must pass this test:

1. Product value
2. Performance cost
3. Privacy/security
4. Failure mode
5. Maintenance
6. Migration difficulty

## Approved V1 dependency categories

- Astro
- TypeScript
- Astro MDX integration
- Astro sitemap integration
- Pagefind
- linting/formatting tooling

Do not add a dependency merely because it makes a component faster to code.

---

---

# 43. Repository Structure

## Repository Structure

Recommended:

```text
/
├── public/
│   ├── favicon.svg
│   ├── og/
│   ├── images/
│   ├── diagrams/
│   ├── robots.txt
│   └── _redirects
│
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── content/
│   │   ├── article/
│   │   ├── interview/
│   │   ├── roadmap/
│   │   ├── projects/
│   │   ├── search/
│   │   └── system-design/
│   │
│   ├── content/
│   │   ├── articles/
│   │   ├── tutorials/
│   │   ├── interview-questions/
│   │   ├── company-guides/
│   │   ├── roadmaps/
│   │   ├── system-designs/
│   │   ├── projects/
│   │   ├── cheat-sheets/
│   │   └── technologies/
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── ContentLayout.astro
│   │   ├── ArticleLayout.astro
│   │   └── WideContentLayout.astro
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── 404.astro
│   │   ├── search/
│   │   ├── data-engineering/
│   │   ├── interview/
│   │   ├── projects/
│   │   ├── career/
│   │   ├── resources/
│   │   ├── [technology]/
│   │   └── legal pages
│   │
│   ├── scripts/
│   │   ├── menu.ts
│   │   ├── search.ts
│   │   ├── copy.ts
│   │   ├── disclosure.ts
│   │   ├── toc.ts
│   │   ├── theme.ts
│   │   └── share.ts
│   │
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   ├── base.css
│   │   ├── typography.css
│   │   ├── layout.css
│   │   ├── prose.css
│   │   ├── utilities.css
│   │   ├── components/
│   │   └── themes.css
│   │
│   ├── utils/
│   │   ├── content.ts
│   │   ├── seo.ts
│   │   ├── breadcrumbs.ts
│   │   ├── related.ts
│   │   ├── search.ts
│   │   ├── dates.ts
│   │   └── validation.ts
│   │
│   └── content.config.ts
│
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── wrangler.jsonc
├── eslint.config.js
├── prettier.config.js
├── README.md
└── .gitignore
```

The coding agent may adjust the route implementation to match current Astro conventions, but the architectural boundaries must remain.

---

---

# 44. Astro Architecture

### Final `astro.config.mjs` baseline

Use a static-first configuration. The exact current Astro API may evolve, but the launch invariants are fixed:

```js
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  site: "https://YOUR-DOMAIN.example",
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],
});
```

Replace the placeholder domain before production. Do not add the Cloudflare adapter for V1.

### Final `package.json` script contract

The project must expose, at minimum:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "postbuild": "pagefind --site dist",
    "preview": "astro preview",
    "check": "astro check",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

Exact versions should be selected from the current supported stable releases at implementation time and committed to the lockfile.


## Astro Architecture

## Base layout

`BaseLayout.astro` owns:

- document shell
- `<html>`
- metadata
- favicon
- theme
- skip link
- global CSS
- optional analytics
- structured data slots

## Content layout

`ContentLayout.astro` owns:

- breadcrumbs
- page container
- title/deck
- metadata
- next-step structure

## Article layout

`ArticleLayout.astro` owns:

- article header
- TOC
- reading column
- article prose
- related resources
- next/previous

## Wide layout

Used for:

- system design
- projects
- complex tables
- architecture-heavy content

---

---

# 45. Content Collection Schema

## Content Collection Schema Implementation

Use Astro's current Content Collections API and TypeScript schema validation.

The schema should enforce:

- required title
- required description
- valid dates
- allowed content types
- allowed difficulty values
- valid relationships
- valid company evidence statuses
- valid technology references

The content build should identify:

- broken links
- duplicate slugs
- duplicate canonical URLs
- missing descriptions
- missing alt text
- malformed structured data inputs

---

---

# 46. Component API/Props Plan

## Component API / Props Plan

Use strongly typed props.

## `Button`

```ts
type ButtonProps = {
  href?: string;
  variant: "primary" | "secondary" | "quiet";
  size?: "sm" | "md" | "lg";
  label: string;
  fullWidthOnMobile?: boolean;
};
```

## `Card`

```ts
type CardProps = {
  title: string;
  description?: string;
  href?: string;
  eyebrow?: string;
  metadata?: string[];
  variant?: "default" | "feature" | "compact";
};
```

## `Metadata`

```ts
type MetadataProps = {
  items: {
    label: string;
    value: string;
  }[];
};
```

## `CodeBlock`

```ts
type CodeBlockProps = {
  language: string;
  code: string;
  filename?: string;
  showLineNumbers?: boolean;
  output?: string;
};
```

## `Callout`

```ts
type CalloutProps = {
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  title: string;
  content: string;
};
```

## `RoadmapNode`

```ts
type RoadmapNodeProps = {
  number: string;
  title: string;
  summary: string;
  resources: string[];
  href: string;
};
```

---

---

# 47. CSS Architecture

## CSS Architecture

Use CSS cascade layers:

```css
@layer reset, tokens, base, layout, components, utilities, overrides;
```

## Token-first

All color, spacing, type, radius, shadow, width and motion values belong in tokens.

Do not scatter raw magic numbers across components.

## CSS rules

Prefer:

- grid
- flex
- container queries where beneficial
- logical properties where useful
- `clamp()`
- `min()`
- `max()`
- `calc()`
- native media queries

Avoid:

- utility-class explosion
- framework CSS
- deeply nested selectors
- `!important` except narrow accessibility/system cases

---

---

# 48. JavaScript Architecture

## JavaScript Architecture

## Default

No JavaScript is required for reading core content.

## Allowed modules

- menu
- search
- copy to clipboard
- TOC active state
- accordion
- tabs
- theme switch
- optional share
- tiny interaction enhancements

## Rules

- no global state store
- no client framework
- no hydration of content pages
- no animation library
- lazy-load feature modules when possible
- use native browser APIs

## Clipboard behavior

Preferred:

```text
navigator.clipboard.writeText()
```

Fallback:

- select code
- provide a manual copy path
- do not fail the entire block

---

## Theme Architecture

V1 ships light and dark themes.

## Behavior

Default:

```text
follow system preference
```

User choice:

```text
System
Light
Dark
```

Persist preference in:

```text
localStorage
```

No account required.

## No flash

Use a tiny inline theme bootstrap script only if necessary to prevent a visible light/dark flash.

This script must be:

- tiny
- deterministic
- free of third-party requests
- isolated from application logic

---

## Search Build Contract

The production build must run Pagefind **after Astro has generated `dist/`**.

Required behavior:

```text
npm run build
→ astro build
→ postbuild
→ pagefind --site dist
→ deploy dist/
```

The Pagefind-generated files are part of the static deployment output. Never generate a search index against a source/content directory instead of the final built HTML.

Search must be rebuilt on every production content build so newly published pages are searchable immediately after deployment.

---

## Search Implementation Architecture

Build:

```text
Content Collections
↓
Astro build
↓
Pagefind indexing
↓
Static index assets
↓
Custom search UI
```

Search UI loads only when needed.

Do not load Pagefind search code on every article page by default.

---

---

# 49. Cloudflare Deployment

## Cloudflare Deployment

Cloudflare's current documentation recommends Workers for new Cloudflare projects and documents a static configuration using `assets.directory`; for a purely static site, a Worker script is not required. Astro's current Cloudflare integration documentation likewise states that the Cloudflare adapter is unnecessary for a static Astro site.

The final deployment model is therefore:

```text
Astro build
↓
dist/
↓
Wrangler
↓
Cloudflare Workers Static Assets
```

## Example `wrangler.jsonc`

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "data-career-hub",
  "compatibility_date": "YYYY-MM-DD",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "html_handling": "force-trailing-slash"
  }
}
```

**Important:** replace `YYYY-MM-DD` with the current deployment date rather than copying an old compatibility date from this document.

Do not add:

```json
"main": "src/index.ts"
```

in V1.

Do not add:

```text
@astrojs/cloudflare
```

unless the project moves to on-demand rendering.

## Build commands

Expected:

```bash
npm install
npm run dev
npm run lint
npm run check
npm run build
npx wrangler deploy
```

Exact package scripts may follow current Astro conventions.

## Deployment sequence

1. Create GitHub repository.
2. Initialize Astro project.
3. Install only justified dependencies.
4. Build design system.
5. Build templates.
6. Add content collections.
7. Add sample content.
8. Add SEO.
9. Run lint/type/build checks.
10. Build `dist/`.
11. Run the Pagefind post-build step so the static search index is generated inside the build output.
12. Preview using the current Wrangler workflow.
12. Deploy to Workers Static Assets.
13. Attach custom domain.
14. Configure DNS.
15. Verify HTTPS.
16. Verify trailing slash behavior.
17. Verify canonical URLs.
18. Verify 404 response.
19. Verify sitemap.
20. Verify robots.
21. Verify Search Console.
22. Verify analytics.
23. Run production performance checks.

## Redirects

Use `public/_redirects` where appropriate for static redirect rules.

Maintain a documented redirect map.

---

---

# 50. Git/GitHub Workflow

## Git / GitHub Workflow

## Branch strategy

Keep it simple:

```text
main
feature/<short-name>
fix/<short-name>
content/<short-name>
```

## Commit style

Use:

```text
feat:
fix:
content:
design:
seo:
perf:
chore:
docs:
```

Example:

```text
feat: add technology hub template
design: refine article typography
content: add PySpark window functions guide
```

## Pull request quality

PR must identify:

- affected templates
- content changes
- visual changes
- performance impact
- accessibility checks
- SEO impact

---

---

# 51. Environment/Configuration Strategy

## Environment / Configuration Strategy

No secrets in the repository.

Public configuration may include:

- site URL
- site name
- social URLs
- analytics identifiers

Secret values, if a future feature needs them, must live in platform-provided secrets.

V1 should have nearly no secret configuration.

---

---

# 52. Security

## Security

Even a static site requires discipline.

## Dependency policy

- use lockfile
- update dependencies deliberately
- review changelogs for major versions
- run vulnerability audits periodically
- remove unused dependencies

## Content security

- sanitize or avoid unsafe HTML
- review MDX components
- never allow arbitrary executable code from content authors
- avoid `set:html` unless the source is trusted and controlled

## Headers

Where supported, configure:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy` with a restrictive baseline
- clickjacking protection through an appropriate `frame-ancestors` CSP directive where practical

## CSP

Start with a conservative CSP.

Use report-only testing before enforcing when third-party analytics or future embeds are introduced.

Do not add security infrastructure that the static architecture does not need.

---

---

# 53. Accessibility QA

## Accessibility QA

Run:

- keyboard-only navigation
- screen-reader smoke tests
- contrast checks
- focus checks
- reduced-motion checks
- zoom at 200%
- 400%/reflow spot checks
- mobile touch checks

Test:

- header
- menu
- search
- TOC
- code copy
- tables
- accordions
- tabs
- roadmap
- forms if later introduced

---

---

# 54. SEO QA

## SEO QA

Before launch:

- title present and unique
- description present
- canonical correct
- sitemap correct
- robots correct
- 404 correct
- OG image works
- structured data validates
- breadcrumbs match
- no accidental `noindex`
- no duplicate canonical
- no broken internal links
- no orphan pillar pages
- all key pages have internal next steps
- no fabricated FAQ/company schema
- URL trailing-slash policy consistent

---

---

# 55. Performance QA

## Performance QA

Test:

- cold mobile load
- repeat mobile load
- desktop
- long article
- code-heavy article
- table-heavy article
- system-design page
- project page
- search page

Measure:

- JS
- CSS
- image transfer
- LCP
- CLS
- INP
- long tasks
- network requests

A performance regression must be explained before release.

---

---

# 56. Browser/Device QA

## Browser / Device QA

Minimum QA:

- latest Chrome
- latest Edge
- latest Firefox
- latest Safari
- current iOS Safari
- current Android Chrome

Widths:

```text
360
390
480
768
1024
1280
1440
```

Also test:

- zoom
- reduced motion
- dark mode
- keyboard
- slow mobile network

---

---

# 57. Testing Strategy

## Testing Strategy

## Build tests

Required:

```bash
npm run check
npm run lint
npm run build
```

## Link checks

Validate:

- internal links
- canonical links
- sitemap
- redirects

## Content validation

Test schema parsing and relationship resolution.

## Visual QA

Use representative pages rather than snapshotting every article immediately.

Representative templates:

- homepage
- technology hub
- article
- interview question
- company guide
- roadmap
- project
- system design
- search
- 404

## Accessibility tooling

Run an automated accessibility checker in CI or preview testing where practical, then manually validate interaction-heavy components.

Do not treat automated accessibility results as sufficient by themselves.

---

---

# 58. Launch Checklist

## Launch Checklist

## Product

- [ ] homepage communicates product and audience
- [ ] roadmap works
- [ ] technology hubs work
- [ ] interview content works
- [ ] projects work
- [ ] system design works
- [ ] search works
- [ ] 404 works

## Design

- [ ] design tokens applied consistently
- [ ] no generic card grid
- [ ] no excessive rounded cards
- [ ] no unnecessary gradients
- [ ] no decorative visual noise
- [ ] mobile is intentionally composed
- [ ] dark mode is coherent
- [ ] interactive states polished

## Accessibility

- [ ] keyboard navigation
- [ ] visible focus
- [ ] focus not hidden
- [ ] semantic landmarks
- [ ] contrast
- [ ] reduced motion
- [ ] accessible search
- [ ] accessible menu
- [ ] accessible code copy
- [ ] accessible tables

## SEO

- [ ] titles
- [ ] descriptions
- [ ] canonicals
- [ ] sitemap
- [ ] robots
- [ ] structured data
- [ ] OG metadata
- [ ] internal links
- [ ] breadcrumbs
- [ ] no duplicate URLs
- [ ] no accidental noindex

## Performance

- [ ] no unnecessary framework runtime
- [ ] JS budget
- [ ] CSS budget
- [ ] image budget
- [ ] LCP target
- [ ] CLS target
- [ ] INP target
- [ ] third-party budget

## Security

- [ ] no secrets
- [ ] dependency review
- [ ] safe MDX
- [ ] security headers
- [ ] CSP review
- [ ] external scripts reviewed

## Deployment

- [ ] static `dist/`
- [ ] Wrangler configuration
- [ ] Workers Static Assets
- [ ] no Worker script
- [ ] custom domain
- [ ] HTTPS
- [ ] redirects
- [ ] 404
- [ ] canonical URLs
- [ ] Search Console
- [ ] analytics

---

---

# 59. Post-launch Monitoring

## Post-Launch Monitoring

## Weekly

Review:

- Search Console clicks
- impressions
- top queries
- top landing pages
- declining pages
- indexing problems
- broken links
- performance regressions

## Monthly

Review:

- content cluster performance
- article quality
- search demand
- topic gaps
- interview content usage
- project demand
- return behavior
- monetization performance once introduced

## Content decay

Refresh pages when:

- rankings decline materially
- technology version changes
- source documentation changes
- users encounter confusion
- examples become outdated

Do not mass-refresh without evidence.

---

---

# 60. Development Phases

## Development Phases

## Phase 0 — Product Foundation

### Objectives

Lock the product architecture before styling pages.

### Tasks

- finalize domain/config
- create repository
- define taxonomy
- define URLs
- define content schemas
- define component system
- define SEO model

### Dependencies

None.

### Deliverables

- repository
- architecture document
- schema
- route map

### Acceptance criteria

No launch-critical architectural decision is unresolved.

---

## Phase 1 — Design System

### Objectives

Create the visual language before page-scale work.

### Tasks

- tokens
- typography
- spacing
- colors
- dark mode
- buttons
- links
- cards
- code blocks
- tables
- callouts
- navigation
- responsive rules
- focus states

### Deliverables

- design tokens
- component primitives
- representative style page

### Acceptance criteria

The design feels premium without animation or decorative imagery.

---

## Phase 2 — Core Templates

### Tasks

Build:

- homepage
- technology hub
- article
- tutorial
- interview question
- company guide
- roadmap
- system design
- project
- cheat sheet
- search
- 404
- legal pages

### Acceptance criteria

Every required template is responsive and uses the same visual grammar.

---

## Phase 3 — Content Engine

### Tasks

- collections
- schemas
- relationships
- TOC
- related content
- previous/next
- content metadata
- validation

### Acceptance criteria

A new article can be created without changing component code.

---

## Phase 4 — SEO

### Tasks

- metadata
- canonical
- sitemap
- robots
- structured data
- Open Graph
- breadcrumbs
- internal linking
- image metadata

### Acceptance criteria

Production pages are crawlable, canonical, and schema-valid.

---

## Phase 5 — Search

### Tasks

- Pagefind
- index build
- custom search UI
- filters
- keyboard interaction
- empty/error states

### Acceptance criteria

Common content queries return useful results quickly without a backend.

---

## Phase 6 — Performance + Accessibility

### Tasks

- JS audit
- CSS audit
- image optimization
- keyboard testing
- contrast testing
- screen-reader smoke tests
- reduced-motion testing

### Acceptance criteria

Representative pages meet performance and accessibility budgets.

---

## Phase 7 — Content Population

### Tasks

Start with:

- pillar pages
- technology guides
- interview questions
- projects
- system designs
- roadmaps

### Acceptance criteria

No thin programmatic content.

---

## Phase 8 — Production Launch

### Tasks

- Cloudflare
- custom domain
- HTTPS
- redirects
- Search Console
- analytics
- sitemap
- production tests

### Acceptance criteria

No P0 launch blocker remains.

---

## Phase 9 — Growth

### Tasks

- evidence-driven content expansion
- content refresh
- topic expansion
- improved search
- monetization experiments

### Acceptance criteria

New scope must be justified by measurable evidence.

---

---

# 61. Milestones

## Milestones

## M1 — Architecture locked

Output:

- route map
- schema
- design tokens
- trade-off register

## M2 — Template system working

Output:

- all core page types

## M3 — Content engine working

Output:

- collections + relationships + metadata

## M4 — SEO complete

Output:

- metadata + schema + sitemap + robots

## M5 — Search complete

Output:

- indexed searchable library

## M6 — QA complete

Output:

- accessibility + performance + browser QA

## M7 — Launch

Output:

- production site on Cloudflare

## M8 — Growth loop

Output:

- Search Console/content performance review process

---

---

# 62. Acceptance Criteria

## Acceptance Criteria

The site is acceptable only when all conditions below are true.

## Product

- [ ] A new user understands what the product is.
- [ ] A new user can find the roadmap.
- [ ] A working engineer can reach interview content quickly.
- [ ] Every major page provides a sensible next step.

## UX

- [ ] Navigation is understandable.
- [ ] Search is easy to discover.
- [ ] Articles are comfortable to read.
- [ ] Code is readable.
- [ ] Tables work on mobile.
- [ ] Roadmap remains understandable without JavaScript.
- [ ] No page relies on visual gimmicks.

## Engineering

- [ ] Static build succeeds.
- [ ] No accidental SSR.
- [ ] No database.
- [ ] No Worker script.
- [ ] No unnecessary frontend framework.
- [ ] Content is schema-validated.

## SEO

- [ ] All critical pages are indexable.
- [ ] Canonicals are correct.
- [ ] Sitemap works.
- [ ] Structured data matches visible content.
- [ ] Internal-linking structure supports topic clusters.

## Accessibility

- [ ] Keyboard navigation works.
- [ ] Focus is visible.
- [ ] Focus is not obscured.
- [ ] Semantic landmarks work.
- [ ] Reduced motion works.
- [ ] Color is not the only semantic signal.

## Performance

- [ ] representative mobile pages meet target budgets
- [ ] no large unnecessary JS
- [ ] no major layout shifts
- [ ] images are optimized

---

## Premium Design Acceptance Test

A page passes only when:

- hierarchy is obvious within ~3 seconds
- the main action is obvious
- content is comfortable to read
- spacing feels intentional
- alignment is coherent
- cards are used purposefully
- metadata is compact
- interactive states are polished
- mobile feels designed
- no decorative element competes with content
- page remains good with animations disabled
- page remains useful when images are unavailable
- core content remains usable with JavaScript disabled

---

---

# 63. Future Architecture

## Future Architecture

## V1

Static content.

## V2

Improve:

- search
- discovery
- related content
- newsletter
- content recommendations

Still no required personal accounts.

## V3

Introduce only if validated:

- accounts
- saved progress
- bookmarks
- personalized roadmap
- mock tests

## V4

Potential:

- premium products
- AI interview assistant
- adaptive learning
- user dashboards

## V5

Only after strong product validation:

- SQL execution
- Python execution
- PySpark execution
- cloud practice environment

---

---

# 64. Explicitly Deferred Features

## Explicitly Deferred Features

Do not build yet:

- React
- Next.js
- Tailwind
- Express
- Node backend
- PostgreSQL
- MongoDB
- Redis
- Docker
- Kubernetes
- authentication
- user accounts
- user dashboards
- personal progress persistence
- gamification
- community
- comments
- forum
- AI chatbot
- custom analytics backend
- session replay
- heavy third-party embeds
- hosted search
- Spark clusters
- browser-based code execution
- payments
- large ad networks before traffic justifies them
- embedded newsletter forms before provider selection

---

## DO NOT BUILD YET

The following are deliberately excluded from the initial implementation:

```text
React
Next.js
Tailwind
Express
PostgreSQL
MongoDB
Redis
Docker
Kubernetes
SSR
Worker script
API layer
Authentication
User profiles
Progress database
Bookmarks
Personal dashboards
Gamification
Community/forum
Comments
AI chatbot
Session replay
Custom analytics backend
Hosted search
SQL executor
Python executor
Spark executor
PySpark cluster
Cloud sandbox
Payment system
Aggressive ad stack
Embedded third-party newsletter scripts
Large UI animation libraries
```

---

---

# 65. Risk Register

## Risk Register

| Risk | Probability | Impact | Mitigation | Trigger |
|---|---|---|---|---|
| Content quality drops as volume grows | Medium | High | editorial gates | recurring corrections |
| Search relevance degrades | Medium | Medium | Pagefind + taxonomy | repeated failed searches |
| Design becomes card-heavy | Medium | High | design QA | multiple sections become grids |
| JS grows over time | High | High | bundle budget | budget exceeded |
| SEO becomes keyword-driven | Medium | High | editorial review | traffic grows but user engagement falls |
| Company claims become unreliable | Medium | High | evidence labels | unverifiable claims |
| Ads damage UX | Medium | High | conservative placement | increased bounce/readability complaints |
| Technology changes rapidly | High | Medium | version context | compatibility change |
| Static build becomes slow | Low | Medium | content/build monitoring | build time becomes operational bottleneck |
| Search index becomes large | Low/Medium | Medium | Pagefind review | ~5,000+ docs or relevance issues |
| Analytics tooling becomes insufficient | Medium | Low/Medium | rely on aggregate metrics first | specific decision cannot be answered |
| Cloudflare configuration changes | Medium | Medium | re-check official docs before deployment changes | platform migration/update |

---

---

# 66. Recommended Build Order

The coding agent must execute the phases in order. The Live TODO Tracker is the authoritative task state; this section is the immutable sequence.

## Step 0 — Establish control

Complete P0-01 through P0-12.

**Release gate:** no unresolved launch-critical architecture decision; route map, schema, design tokens, SEO policy, privacy boundary, and deployment model are documented.

## Step 1 — Establish the design system

Complete P1-01 through P1-20.

**Release gate:** the style gallery and representative components pass desktop, mobile, keyboard, contrast, reduced-motion, and visual-consistency checks.

## Step 2 — Build the core page system

Complete P2-01 through P2-25.

**Release gate:** every required page type renders from reusable components and looks intentionally designed at 360px, 390px, 768px, 1024px, 1280px, and 1440px+.

## Step 3 — Build the content engine

Complete P3-01 through P3-14.

**Release gate:** adding a new content item does not require component code changes; references, slugs, metadata, and relationships validate at build time.

## Step 4 — Build technical SEO

Complete P4-01 through P4-16.

**Release gate:** representative indexable pages have correct titles, descriptions, canonicals, sitemap inclusion, structured data, breadcrumbs, and social metadata.

## Step 5 — Build search

Complete P5-01 through P5-09.

**Release gate:** common queries produce useful results without a server/backend; search is keyboard accessible and does not load unnecessarily on content pages.

## Step 6 — Harden performance, accessibility, security

Complete P6-01 through P6-14.

**Release gate:** budgets are met or documented exceptions are approved; no critical accessibility issue remains.

## Step 7 — Populate the launch library

Complete P7-01 through P7-12 using Appendix A as the exact checklist.

**Release gate:** all 138 launch items are complete, reviewed, linked, indexed, and schema-valid.

## Step 8 — Launch

Complete P8-01 through P8-10.

**Release gate:** production smoke tests pass, domain/HTTPS work, sitemap/robots/canonical behavior is correct, analytics is verified, and no P0 issue remains.

## Step 9 — Operate and grow

Complete P9 tasks according to the post-launch cadence. Never expand architecture simply because traffic increased; expand when a documented trigger in the trade-off register is met.

---

## 66.1 Detailed implementation task register with validation

| ID | Implementation task | Primary validation | Regression check |
|---|---|---|---|
| P0-01 | Read full specification | Agent confirms tracker initialized | None |
| P0-02 | Inspect repository | Existing structure documented | Build |
| P0-03 | Configure site URL | Config resolves in build | Canonical check |
| P0-04 | Lock route map | All P0 routes listed | Link check |
| P0-05 | Lock taxonomy | Terms are controlled and non-duplicative | Schema check |
| P0-06 | Lock design tokens | Token file exists; no raw core values scattered | Visual gallery |
| P0-07 | Lock SEO model | Metadata fields mapped to templates | SEO smoke test |
| P0-08 | Lock analytics boundary | No invasive scripts or custom backend | Request audit |
| P0-09 | Lock deployment | Static output + Wrangler plan defined | Build |
| P0-10 | Create README/docs | Setup/deploy/content docs exist | Docs links |
| P0-11 | Create inventory | All 138 content IDs exist | Inventory lint |
| P0-12 | Architecture gate | All P0 decisions resolved | `npm run check`, build |
| P1-01 | CSS layers | Required layers load in order | All pages |
| P1-02 | Color tokens | Light/dark tokens + contrast samples | Accessibility |
| P1-03 | Typography | Responsive type scale works | Article/home |
| P1-04 | Spacing | 4px rhythm applied | Style gallery |
| P1-05 | Radius/elevation | No excessive rounding/shadow | All templates |
| P1-06 | Containers | 1200–1280 wide / ~740 reading widths | Desktop/mobile |
| P1-07 | Reset/base | Semantic base elements render consistently | All pages |
| P1-08 | Links/buttons | States, focus, hierarchy work | Keyboard |
| P1-09 | Metadata | Compact, non-badge-heavy | Article/interview |
| P1-10 | Cards | Selective grouping only | Homepage/hub |
| P1-11 | Code blocks | Copy, overflow, labels | Mobile code |
| P1-12 | Callouts | Accessible semantics, visual tones | Article |
| P1-13 | Tables | Responsive overflow strategy | Mobile table |
| P1-14 | Tabs/accordion | Keyboard + no-JS fallback where required | Interaction |
| P1-15 | Breadcrumbs | Correct hierarchy and links | SEO/schema |
| P1-16 | Navigation | Goal-based desktop nav | Keyboard/mobile |
| P1-17 | Mobile menu | Focus management + escape behavior | 360px |
| P1-18 | Theme system | System/light/dark behavior | FOUC check |
| P1-19 | Focus/motion | `:focus-visible` + reduced motion | WCAG smoke test |
| P1-20 | Style gallery QA | Identity passes 3-second/premium test | All primitives |
| P2-01 | Base layout | Head/meta/body/footer render | Build |
| P2-02 | Content layout | Shared contextual structure | Hub/article |
| P2-03 | Homepage | Above-fold hierarchy + sections | Mobile + SEO |
| P2-04 | Technology hub | Learning sequence + related links | Sample hub |
| P2-05 | Article | Reading UX + TOC + breakouts | Long article |
| P2-06 | Tutorial | Goal/steps/output/troubleshooting | Mobile |
| P2-07 | Interview hub | Filters/categories clear | Keyboard |
| P2-08 | Interview question | Question-first hierarchy | Schema/content |
| P2-09 | Company guide | Evidence labels enforced | Content audit |
| P2-10 | Roadmap | Semantic ordered fallback | JS disabled |
| P2-11 | System design | Wide technical layout + text equivalents | Mobile |
| P2-12 | Project | Requirements/architecture/interview value | Mobile |
| P2-13 | Cheat sheet | Dense but readable reference layout | Print-like scan |
| P2-14 | Category listing | Controlled pagination/listing | SEO |
| P2-15 | Search page | Search UI works with Pagefind | Keyboard |
| P2-16 | About | Trust-focused, factual | SEO |
| P2-17 | Contact | Static contact path/form decision documented | Privacy |
| P2-18 | Privacy | Accurate policy for actual tooling | Production |
| P2-19 | Terms | Accurate site terms | Production |
| P2-20 | Disclaimer | Clear content/affiliate/company evidence policy | Production |
| P2-21 | 404 | Proper 404 status + helpful navigation | Cloudflare |
| P2-22 | Footer | Complete nav/legal/source links | All pages |
| P2-23 | Edge states | Long titles/tables/code/missing metadata handled | Visual QA |
| P2-24 | Cross-template QA | Shared visual grammar | Full suite |
| P2-25 | Mobile review | Independent mobile compositions | 360/390/768 |
| P3-01 | Content config | Collections compile | Build |
| P3-02 | Schemas | Invalid frontmatter fails/warns by severity | Build |
| P3-03 | Relations | IDs resolve | Content lint |
| P3-04 | Slugs/canonicals | No duplicates | SEO |
| P3-05 | Metadata | Shared fields populate UI | Samples |
| P3-06 | Author data | Correct attribution rules | Article |
| P3-07 | TOC | Heading-based TOC is accessible | Article |
| P3-08 | Previous/next | Sequence is deterministic | Tutorial/article |
| P3-09 | Related | Relevant relationships render | All content |
| P3-10 | Breadcrumbs | Hierarchy is deterministic | Schema |
| P3-11 | MDX components | Safe, controlled components | Content build |
| P3-12 | QA scripts | Inventory/reference checks run | CI/local |
| P3-13 | Sample content | Every type has a real sample | Templates |
| P3-14 | Content gate | New author can add content without UI edits | Full build |
| P4-01 | Global metadata | Correct site defaults | HTML inspect |
| P4-02 | Page metadata | Unique fields per page | Crawl sample |
| P4-03 | Canonicals | Self-canonical rules correct | URL tests |
| P4-04 | robots | Allows/disallows correct paths | Fetch check |
| P4-05 | Sitemap | Includes indexable pages only | XML validation |
| P4-06 | OG | Correct title/image/URL | Social preview |
| P4-07 | Twitter/X | Correct card metadata | HTML inspect |
| P4-08 | Breadcrumb schema | Matches visible breadcrumb | Schema validator |
| P4-09 | Article schema | Matches visible content | Schema validator |
| P4-10 | FAQ logic | Only eligible visible FAQ content | Schema audit |
| P4-11 | Site schema | Only justified entities included | Schema audit |
| P4-12 | Image metadata | Alt/dimensions/format correct | Image audit |
| P4-13 | Pagination | Appropriate canonical/noindex rules | Crawl sample |
| P4-14 | Redirects | Old URLs resolve to intended destination | Redirect test |
| P4-15 | 404 SEO | 404 not indexed as content | Crawl test |
| P4-16 | SEO gate | Full representative set passes | SEO suite |
| P5-01 | Pagefind install | Build completes with index | Build |
| P5-02 | Index generation | Search index reflects current build | Search smoke |
| P5-03 | Search UI | Results, keyboard, focus, no backend | Keyboard |
| P5-04 | Ranking | Title/topic/difficulty relevance sensible | Query set |
| P5-05 | Filters | Type/topic/difficulty work | Search matrix |
| P5-06 | Dialog behavior | Ctrl/Cmd+K + escape + focus return | Keyboard |
| P5-07 | Empty/error | Honest states, no fake results | UX |
| P5-08 | Mobile search | Good 360/390 layout | Mobile |
| P5-09 | Search gate | Payload + relevance acceptable | Performance |
| P6-01 | Critical CSS | No unnecessary CSS | Coverage/audit |
| P6-02 | JS budget | Route payload within budget | Build/network |
| P6-03 | Third-party audit | Only approved scripts | Network trace |
| P6-04 | Images | Responsive modern formats | Lighthouse |
| P6-05 | Fonts | No font-induced layout shift | Performance |
| P6-06 | CWV | Targets achieved on representative pages | Lighthouse/field where available |
| P6-07 | Keyboard | Entire primary flow accessible | Keyboard |
| P6-08 | Focus | Focus visible/not obscured | Manual + automated |
| P6-09 | Contrast | Text/status/controls meet target | Contrast audit |
| P6-10 | Screen reader | Landmarks/headings/navigation understandable | Manual |
| P6-11 | Motion | Reduced-motion respected | Manual |
| P6-12 | Security | Headers/CSP/external scripts reviewed | Header audit |
| P6-13 | Browser/device | Chrome/Firefox/Safari/Edge + mobile samples | Matrix |
| P6-14 | Release gate | All P6 blockers cleared | Full QA |
| P7-01 | Pillars | 12 pages complete + linked | Content audit |
| P7-02 | Tech guides | 30 pages complete + linked | Content audit |
| P7-03 | Interview | 30 pages complete + labels | Content audit |
| P7-04 | Companies | 12 evidence-labelled guides | Evidence audit |
| P7-05 | Roadmaps/career | 8 pages complete | Content audit |
| P7-06 | Projects | 8 deep projects | Project rubric |
| P7-07 | System design | 8 case studies | Design rubric |
| P7-08 | Cheat sheets | 10 reference pages | Scan/accuracy |
| P7-09 | Supporting | 20 useful guides | Quality audit |
| P7-10 | Links | No broken/internal orphan relationships | Link check |
| P7-11 | Editorial | Sources/versioning/facts verified | Editorial audit |
| P7-12 | Content gate | All 138 items green | Inventory audit |
| P8-01 | Production build | `dist/` complete | Build |
| P8-02 | Wrangler | Static assets config valid | Wrangler dry/preview |
| P8-03 | Domain/DNS | Domain resolves | Production |
| P8-04 | HTTPS | TLS valid | Browser |
| P8-05 | 404/slash | Status and slash policy correct | URL matrix |
| P8-06 | Crawl | robots/sitemap/canonicals correct | Search Console/live fetch |
| P8-07 | GSC | Property/sitemap configured | GSC |
| P8-08 | Analytics | Aggregate analytics verified | Analytics |
| P8-09 | Smoke test | Critical journeys pass | Manual |
| P8-10 | Launch gate | No P0 blocker | Sign-off |
| P9-01 | Weekly search review | Review log exists | GSC |
| P9-02 | Refresh review | Decay candidates identified | Content metrics |
| P9-03 | Search review | Failed queries categorized | Search data |
| P9-04 | Linking review | Orphan/weak hubs improved | Crawl |
| P9-05 | Expansion | New content tied to evidence | Editorial |
| P9-06 | Monetization | UX/performance impact measured | Analytics |
| P9-07 | Dependency review | Budget and third parties audited | Package/network |
| P9-08 | Trigger review | Architecture only changes on trigger | Trade-off audit |


# 67. AI Coding Agent Instructions

## AI Coding Agent Instructions

## Before coding

The agent must:

- read this document completely
- treat it as the source of truth
- inspect the existing repository
- identify conflicting assumptions
- resolve implementation details using the locked decisions in this document
- avoid unnecessary clarification requests when the specification already defines a decision

## During coding

The agent must:

- prefer static HTML
- minimize JavaScript
- build reusable components
- use semantic HTML
- use custom CSS
- keep content separate from layout code
- make content collection schemas strict
- validate internal relationships
- preserve canonical URLs
- design mobile intentionally
- check keyboard access
- check reduced motion
- check code overflow
- check table overflow
- avoid visual noise
- avoid placeholder lorem ipsum
- avoid fake statistics
- avoid fake testimonials
- avoid fabricated interview claims
- avoid copyrighted assets
- use only licensed/original assets

## Dependency discipline

Before adding any dependency, document:

```text
Dependency
Reason
Native alternative considered
Bundle impact
Runtime impact
Maintenance impact
Why it is justified
```

## Forbidden shortcuts

Do not:

- install React for a simple interactive control
- install Tailwind merely to write CSS faster
- create an API “for future use”
- add a database “because it might be needed”
- add a mega-menu because there are many technologies
- add an animation library
- create hundreds of nearly identical components
- turn all content into cards
- hide critical content behind JS
- add fake progress
- publish thin SEO pages

## Visual QA discipline

Review these pages together:

- homepage
- article
- technology hub
- interview question
- company guide
- roadmap
- project
- system design
- search

The system is not complete until the same visual grammar is apparent across all of them.

## Design correction rule

When a page feels empty:

1. improve hierarchy
2. improve content grouping
3. improve typography
4. improve spacing
5. improve alignment

Do not immediately add:

- gradients
- shadows
- illustrations
- floating objects
- more cards
- animations

---

## P0 / P1 / P2 / P3 Priority Matrix

| Priority | Feature | Why | Phase | Dependency |
|---|---|---|---|---|
| P0 | Static Astro architecture | core platform | 0 | Astro |
| P0 | Design system | visual quality | 1 | none |
| P0 | Homepage | entry point | 2 | design system |
| P0 | Technology hub | core IA | 2 | content schema |
| P0 | Article | flagship experience | 2 | content schema |
| P0 | Interview question | interview journey | 2 | content schema |
| P0 | Roadmap | learning journey | 2 | content schema |
| P0 | Project template | practical learning | 2 | content schema |
| P0 | System design template | interview depth | 2 | content schema |
| P0 | Search | discovery | 5 | Pagefind |
| P0 | SEO metadata | acquisition | 4 | content |
| P0 | Sitemap/robots | crawlability | 4 | Astro |
| P0 | Accessibility | product quality | 6 | all templates |
| P0 | Performance budgets | UX | 6 | all templates |
| P0 | Cloudflare static deployment | hosting | 8 | build |
| P1 | Company preparation | high-value interview feature | 2/7 | evidence workflow |
| P1 | Dark mode | developer audience quality | 6 | theme tokens |
| P1 | Cheat sheets | revision UX | 2/7 | content |
| P1 | Content recommendations | discovery | 9 | relationships |
| P1 | Conservative monetization | revenue | 9 | traffic |
| P2 | Newsletter | owned audience | growth | provider |
| P2 | Better search | discovery | growth | search evidence |
| P2 | Accountless recommendations | retention | growth | aggregate data |
| P3 | Accounts | user state | future | validated demand |
| P3 | Personalized roadmap | user state | future | accounts |
| P3 | AI assistant | differentiated workflow | future | validated use case |
| P3 | Code execution | expensive infrastructure | future | demand + security + economics |

---

---

# 68. Final Definition of Done

## Definition of Done

The website is done only when:

## Product

- [ ] The user can understand what the platform does immediately.
- [ ] The user can find a clear Data Engineering roadmap.
- [ ] The user can navigate technology learning paths.
- [ ] The user can prepare interview questions.
- [ ] The user can find company preparation.
- [ ] The user can explore system designs.
- [ ] The user can find projects.
- [ ] The user can search the content library.
- [ ] Every major page has a logical next step.

## Design

- [ ] Premium editorial/developer identity is consistent.
- [ ] Typography is the primary visual asset.
- [ ] Spacing and alignment are consistent.
- [ ] Cards are selective.
- [ ] Borders are preferred to heavy shadows.
- [ ] Accent color is restrained.
- [ ] Dark mode is coherent.
- [ ] Mobile is intentionally composed.

## Content

- [ ] Schema validates.
- [ ] No fake claims.
- [ ] No thin SEO pages.
- [ ] Technical claims are reviewed.
- [ ] Version context appears where needed.

## Engineering

- [ ] `npm run check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] static `dist/` is generated.
- [ ] no accidental SSR.
- [ ] no database.
- [ ] no Worker script.

## SEO

- [ ] metadata is correct.
- [ ] canonical is correct.
- [ ] sitemap is correct.
- [ ] robots is correct.
- [ ] structured data validates.
- [ ] breadcrumbs are correct.
- [ ] internal links work.
- [ ] 404 returns correctly.

## Accessibility

- [ ] keyboard navigation works.
- [ ] focus is visible.
- [ ] focus is not obscured.
- [ ] semantic structure is correct.
- [ ] contrast is sufficient.
- [ ] reduced motion works.
- [ ] menus and disclosures are accessible.

## Performance

- [ ] JS target is met or exceptions documented.
- [ ] CSS target is met or exceptions documented.
- [ ] images are optimized.
- [ ] LCP target is met in representative tests.
- [ ] CLS target is met.
- [ ] INP target is met.
- [ ] third-party requests remain minimal.

## Deployment

- [ ] Cloudflare Workers Static Assets is serving `dist/`.
- [ ] domain works.
- [ ] HTTPS works.
- [ ] trailing slash policy is consistent.
- [ ] redirects work.
- [ ] Search Console is verified.
- [ ] analytics is verified.

No unresolved P0 architecture or UX decision may remain.

---

## Final Product Positioning

## Working positioning

> **A premium, structured learning and interview-preparation platform for modern data professionals.**

## Launch niche

> **Data Engineering**

## Long-term expansion path

```text
Data Engineering
→ Data Analytics
→ Data Science
→ AI/ML Engineering
→ Software Engineering
```

Expansion must follow evidence.

Do not dilute the launch product by trying to become a generic technology portal.

The strategic destination is:

> **Beginner → Learner → Practitioner → Interview Candidate → Job Ready**

---

## External Source Validation Notes

The deployment model in this plan was rechecked against current official Cloudflare and Astro documentation during finalization.

Cloudflare currently recommends Workers for new projects and documents a purely static deployment using `assets.directory` without requiring a Worker script. It also documents `not_found_handling: "404-page"` for static 404 behavior and configurable HTML handling for trailing-slash policy.

Astro's current Cloudflare integration documentation states that the Cloudflare adapter is not needed when Astro is being used as a static site builder; the adapter becomes relevant for on-demand/server-rendered features.

WCAG 2.2 documentation was also checked for focus visibility, focus-not-obscured, and target-size considerations.

Useful official references:

- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Static Site Generation and 404: https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/
- Cloudflare HTML handling: https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- Astro Cloudflare integration: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- WCAG 2.2 guidance: https://www.w3.org/WAI/standards-guidelines/wcag/

---

## Final Implementation Rule

**Build the system, not the screenshot.**

The final website must be:

- useful before it is beautiful
- beautiful because it is well structured
- fast because it is simple
- premium because the details are deliberate
- SEO-friendly because the information architecture is strong
- accessible because accessibility is part of the design system
- scalable because content is structured
- maintainable because complexity is earned
- trustworthy because claims are evidence-labelled
- valuable because every page moves the learner forward

**No feature, dependency, visual effect, monetization method, or infrastructure layer should exist merely because a modern website “usually has it.”**

---


---

# Final Consistency Audit

Before implementation starts, the AI coding agent must verify:

| Area | Required final state |
|---|---|
| Product | Data Engineering-first learning and interview platform |
| Rendering | Static Astro |
| Frontend | HTML/CSS + minimal vanilla JS |
| Content | Markdown/MDX collections |
| Search | Pagefind |
| Backend | None |
| Database | None |
| Authentication | None |
| Worker script | None |
| Cloudflare | Workers Static Assets |
| URL policy | stable + trailing slash |
| Navigation | goal-based |
| Article width | ~740px |
| Global width | ~1240px |
| Visual language | premium editorial/developer |
| Cards | selective |
| Color | neutral + restrained accent |
| Mobile | first-class |
| Accessibility | WCAG 2.2 AA-aware |
| Analytics | privacy-conscious; no custom analytics backend |
| Monetization | conservative/deferred |
| AI-generated content | reviewed, never mass-published unverified |
| Company questions | evidence-labelled |
| Code execution | deferred |
| Community | deferred |
| Accounts | deferred |

## No-contradiction test

Before marking the project ready:

- [ ] No later section reintroduces SSR by default.
- [ ] No later section introduces a Worker script in V1.
- [ ] No later section introduces a database “for future use”.
- [ ] No page introduces a mega-menu.
- [ ] No page becomes card-everything.
- [ ] No page relies on animation for comprehension.
- [ ] No SEO rule conflicts with readability.
- [ ] No analytics requirement silently introduces invasive tracking.
- [ ] No monetization placement disrupts article reading.
- [ ] No content model permits fabricated company interview claims.
- [ ] No dynamic requirement is hidden inside a supposedly static component.
- [ ] No dependency lacks a documented value case.
- [ ] No major page type has a different visual grammar.
- [ ] Mobile versions are intentionally composed.
- [ ] The website remains useful without login.

## Official platform references checked during finalization

- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare static site generation / 404: https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/
- Cloudflare HTML handling: https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- Astro Cloudflare integration: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- WCAG 2.2 guidance: https://www.w3.org/WAI/standards-guidelines/wcag/

# Final Instruction to the Coding Agent

**Do not optimize for the most impressive screenshot. Optimize for the best learning product.**

Build the visual system first. Build representative templates second. Validate mobile, accessibility, performance, SEO, and content quality third. Scale content only after the system proves coherent.

The final experience should feel deliberately designed, fast, calm, technical, editorial, trustworthy, and complete — without needing visual excess to appear premium.


---

# Appendix A — Exact Launch Content Inventory

> **Rule:** This is the exact minimum V1 content inventory. Each row is a TODO item. The coding/content agent must update the status as content is completed. A page counts as complete only after the per-content validation protocol in Appendix C passes.



## A0. Inventory status contract

Each inventory item is tracked using this five-state content lifecycle:

```text
PLANNED
→ DRAFTED
→ TECHNICALLY REVIEWED
→ EDITORIALLY/SEO REVIEWED
→ PUBLISHED
```

Use these rules:

- `PLANNED` = title/intent exists only.
- `DRAFTED` = complete draft exists.
- `TECHNICALLY REVIEWED` = code/examples/vendor facts reviewed.
- `EDITORIALLY/SEO REVIEWED` = structure, clarity, metadata, links, evidence labels reviewed.
- `PUBLISHED` = live production page passes the complete content validation protocol.

The checkbox beside an inventory item must remain unchecked until `PUBLISHED`.

### Content status metadata record

For every item, maintain (in a content inventory tracker or frontmatter companion record):

```yaml
id: PILLAR-01
type: pillar
status: PLANNED
owner: content-agent
technicalReviewer: required
editorialReviewer: required
seoReviewer: required
lastReviewed: YYYY-MM-DD
sources: []
slug: /example/
notes: []
```

Do not invent reviewer identities; use role names when a real person is not specified.

## A1. Pillar pages — 12

- [ ] PILLAR-01 — Data Engineer Roadmap: Beginner to Job Ready
- [ ] PILLAR-02 — SQL for Data Engineers: Complete Fundamentals
- [ ] PILLAR-03 — Python for Data Engineering
- [ ] PILLAR-04 — PySpark Fundamentals for Data Engineers
- [ ] PILLAR-05 — Apache Spark Architecture and Execution Model
- [ ] PILLAR-06 — Data Warehousing for Data Engineers
- [ ] PILLAR-07 — Data Lakes, Lakehouse Architecture and Delta Lake
- [ ] PILLAR-08 — ETL vs ELT and Modern Data Pipelines
- [ ] PILLAR-09 — Databricks for Data Engineers
- [ ] PILLAR-10 — Snowflake for Data Engineers
- [ ] PILLAR-11 — Kafka and Real-Time Data Engineering
- [ ] PILLAR-12 — Data Engineering System Design: Interview Roadmap

## A2. Technology guides — 30

### SQL

- [ ] TECH-01 — SQL Joins Explained for Data Engineers
- [ ] TECH-02 — SQL Window Functions: PARTITION BY, ORDER BY and Frames
- [ ] TECH-03 — CTEs vs Subqueries vs Temporary Tables
- [ ] TECH-04 — SQL Aggregations, GROUP BY and HAVING
- [ ] TECH-05 — SQL Query Optimization Fundamentals

### Python / Data Engineering Python

- [ ] TECH-06 — Python Functions, Modules and Reusable Data Pipeline Code
- [ ] TECH-07 — Python Iterators, Generators and Memory-Efficient Processing
- [ ] TECH-08 — Python Exceptions, Logging and Production Error Handling
- [ ] TECH-09 — Python Data Structures for Data Engineering Interviews

### PySpark / Spark

- [ ] TECH-10 — PySpark DataFrames and Schemas
- [ ] TECH-11 — PySpark Transformations vs Actions
- [ ] TECH-12 — PySpark Joins and Join Strategy
- [ ] TECH-13 — Spark Partitions, Shuffles and Data Skew
- [ ] TECH-14 — PySpark Window Functions
- [ ] TECH-15 — PySpark UDFs and Safer Alternatives
- [ ] TECH-16 — Spark Adaptive Query Execution and Optimization
- [ ] TECH-17 — Spark Execution Model: Jobs, Stages and Tasks

### Warehousing / Lakehouse / ETL

- [ ] TECH-18 — Fact Tables, Dimension Tables and Star Schema
- [ ] TECH-19 — Slowly Changing Dimensions: Type 1 vs Type 2
- [ ] TECH-20 — Partitioning, Clustering and Data Layout
- [ ] TECH-21 — Data Lake vs Data Warehouse vs Lakehouse
- [ ] TECH-22 — Batch vs Streaming Data Pipelines
- [ ] TECH-23 — ETL vs ELT: Choosing the Right Approach

### Databricks / Snowflake

- [ ] TECH-24 — Databricks Workspace, Jobs and Lakehouse Concepts
- [ ] TECH-25 — Delta Lake: Transactions, Schema Evolution and Time Travel
- [ ] TECH-26 — Unity Catalog and Data Governance Fundamentals
- [ ] TECH-27 — Snowflake Architecture and Virtual Warehouses
- [ ] TECH-28 — Snowflake Micro-Partitions, Clustering and Pruning

### Streaming / Orchestration / Transformation

- [ ] TECH-29 — Kafka Topics, Partitions, Consumer Groups and Delivery Semantics
- [ ] TECH-30 — Airflow DAGs, Scheduling, Retries and Task Dependencies

## A3. Interview questions — 30

### SQL

- [ ] INT-01 — Explain INNER JOIN vs LEFT JOIN with a practical example.
- [ ] INT-02 — How do window functions differ from GROUP BY?
- [ ] INT-03 — Find the second-highest salary without using a simple MAX approach.
- [ ] INT-04 — How would you detect and remove duplicate records safely?
- [ ] INT-05 — How would you optimize a slow analytical SQL query?

### Python

- [ ] INT-06 — List vs tuple vs set: when would you use each in a data pipeline?
- [ ] INT-07 — What is a generator and why can it help with large datasets?
- [ ] INT-08 — How should exceptions be handled in production data pipelines?
- [ ] INT-09 — Explain shallow copy vs deep copy.

### PySpark / Spark

- [ ] INT-10 — What is the difference between a transformation and an action?
- [ ] INT-11 — What causes a shuffle in Spark?
- [ ] INT-12 — When would you use a broadcast join?
- [ ] INT-13 — What is data skew and how can you mitigate it?
- [ ] INT-14 — Explain Spark jobs, stages and tasks.
- [ ] INT-15 — When should you avoid Python UDFs in PySpark?
- [ ] INT-16 — How does partition count affect Spark performance?

### Databricks / Snowflake

- [ ] INT-17 — What problems does Delta Lake solve?
- [ ] INT-18 — What is schema evolution and when is it safe?
- [ ] INT-19 — What is Unity Catalog used for?
- [ ] INT-20 — What are Snowflake virtual warehouses?
- [ ] INT-21 — How do micro-partitions affect Snowflake query performance?

### Kafka / Airflow

- [ ] INT-22 — Explain Kafka partitions and consumer groups.
- [ ] INT-23 — What is at-least-once delivery and what problems can it create?
- [ ] INT-24 — How should Airflow retries and idempotency work together?

### Data Engineering concepts

- [ ] INT-25 — ETL vs ELT: what factors decide the choice?
- [ ] INT-26 — Data lake vs warehouse vs lakehouse: when would you choose each?
- [ ] INT-27 — How would you design an idempotent batch pipeline?
- [ ] INT-28 — What are the most important data-quality checks in production?

### Architecture / optimization

- [ ] INT-29 — How would you design a CDC pipeline?
- [ ] INT-30 — How would you investigate a suddenly slower data pipeline?

## A4. Company interview guides — 12

> Every page below must distinguish verified/attributed reports, commonly reported topics, and representative practice questions. Never label an invented practice question as an actual company question.

- [ ] COMPANY-01 — Amazon Data Engineering Interview Preparation
- [ ] COMPANY-02 — Google Data Engineering Interview Preparation
- [ ] COMPANY-03 — Microsoft Data Engineering Interview Preparation
- [ ] COMPANY-04 — Uber Data Engineering Interview Preparation
- [ ] COMPANY-05 — Walmart Data Engineering Interview Preparation
- [ ] COMPANY-06 — Flipkart Data Engineering Interview Preparation
- [ ] COMPANY-07 — Atlassian Data Engineering Interview Preparation
- [ ] COMPANY-08 — Adobe Data Engineering Interview Preparation
- [ ] COMPANY-09 — Visa Data Engineering Interview Preparation
- [ ] COMPANY-10 — Salesforce Data Engineering Interview Preparation
- [ ] COMPANY-11 — DoorDash Data Engineering Interview Preparation
- [ ] COMPANY-12 — Akamai Data Engineering Interview Preparation

## A5. Roadmap / career — 8

- [ ] ROAD-01 — Data Engineer Roadmap: Beginner to Job Ready
- [ ] ROAD-02 — 30-Day Data Engineering Fundamentals Plan
- [ ] ROAD-03 — 60-Day Data Engineering Interview Preparation Plan
- [ ] ROAD-04 — 90-Day Data Engineering Job-Switch Plan
- [ ] ROAD-05 — DSA for Data Engineers: Focused 100–200 Pattern Roadmap
- [ ] ROAD-06 — Data Engineering Interview Preparation Roadmap
- [ ] ROAD-07 — Switching from Data Analyst/Developer to Data Engineer
- [ ] ROAD-08 — Data Engineer Resume and Project Selection Guide

## A6. Projects — 8

- [ ] PROJ-01 — CSV to Data Warehouse Pipeline
- [ ] PROJ-02 — S3 → PySpark → Snowflake Data Pipeline
- [ ] PROJ-03 — E-commerce Analytics Data Platform
- [ ] PROJ-04 — Kafka → Spark → Delta Lake Streaming Pipeline
- [ ] PROJ-05 — Change Data Capture Pipeline
- [ ] PROJ-06 — Real-Time Analytics Pipeline
- [ ] PROJ-07 — Fraud Detection Data Pipeline
- [ ] PROJ-08 — Large-Scale Batch Processing Pipeline

## A7. System design — 8

- [ ] SYS-01 — Design a Scalable Batch Data Pipeline
- [ ] SYS-02 — Design a Real-Time Analytics Pipeline
- [ ] SYS-03 — Design a Change Data Capture Platform
- [ ] SYS-04 — Design a Scalable Data Lake / Lakehouse
- [ ] SYS-05 — Design a Cloud Data Warehouse Platform
- [ ] SYS-06 — Design a Clickstream Data Platform
- [ ] SYS-07 — Design a Kafka-Based Data Ingestion System
- [ ] SYS-08 — Design a Reporting and Analytics Platform

## A8. Cheat sheets — 10

- [ ] CHEAT-01 — SQL Data Engineering Cheat Sheet
- [ ] CHEAT-02 — Python for Data Engineers Cheat Sheet
- [ ] CHEAT-03 — PySpark Cheat Sheet
- [ ] CHEAT-04 — Apache Spark Interview Cheat Sheet
- [ ] CHEAT-05 — Snowflake Cheat Sheet
- [ ] CHEAT-06 — Databricks Cheat Sheet
- [ ] CHEAT-07 — Kafka Cheat Sheet
- [ ] CHEAT-08 — Airflow Cheat Sheet
- [ ] CHEAT-09 — dbt Cheat Sheet
- [ ] CHEAT-10 — Data Engineering System Design Cheat Sheet

## A9. Supporting guides / comparisons / troubleshooting — 20

- [ ] SUPPORT-01 — ETL vs ELT: Detailed Comparison
- [ ] SUPPORT-02 — Data Warehouse vs Data Lake vs Lakehouse
- [ ] SUPPORT-03 — Snowflake vs Databricks: How to Compare Them
- [ ] SUPPORT-04 — Batch vs Streaming: Architecture Trade-offs
- [ ] SUPPORT-05 — Airflow Orchestration Design: DAGs, Scheduling and Failure Handling
- [ ] SUPPORT-06 — Kafka vs Queue-Based Messaging for Data Pipelines
- [ ] SUPPORT-07 — Parquet vs Avro vs ORC for Data Engineering
- [ ] SUPPORT-08 — JSON vs Parquet for Analytics Pipelines
- [ ] SUPPORT-09 — Delta Lake vs Traditional Data Lake Tables
- [ ] SUPPORT-10 — Schema Evolution: Safe Design Patterns
- [ ] SUPPORT-11 — Idempotency in Data Pipelines
- [ ] SUPPORT-12 — Data Quality: Checks, Contracts and Failure Handling
- [ ] SUPPORT-13 — Data Pipeline Observability Fundamentals
- [ ] SUPPORT-14 — Data Pipeline Reliability and Retry Design
- [ ] SUPPORT-15 — Partitioning Strategies for Large Datasets
- [ ] SUPPORT-16 — Handling Data Skew in Distributed Processing
- [ ] SUPPORT-17 — Slowly Changing Dimensions in Practice
- [ ] SUPPORT-18 — CDC Patterns and Failure Modes
- [ ] SUPPORT-19 — Data Engineering Interview Trade-offs: A Practical Guide
- [ ] SUPPORT-20 — How to Explain a Data Engineering Project in an Interview

---

# Appendix B — Content Production Template by Type

## B1. Article / deep dive

```text
Title
One-sentence answer / thesis
Why it matters
Prerequisites
Core explanation
Examples
Code where useful
Expected output where useful
Common mistakes
Trade-offs / limitations
Interview relevance
Related concepts
Related questions
Further reading
Last reviewed/version context
Sources where required
Next step
```

## B2. Tutorial

```text
Goal
Prerequisites
What you will build
Architecture/flow
Step 1
Step 2
...
Validation
Expected output
Troubleshooting
Testing
Cost notes
Interview relevance
Next step
```

## B3. Interview question

```text
Question
Difficulty
Technology/topic
Question type
Short answer
Detailed explanation
Example
Code/output where appropriate
Common mistakes
Interview follow-ups
Related questions
Related learning
```

## B4. Company guide

```text
Company overview relevant to interview preparation
Evidence note
Reported topics
Reported candidate questions, only when sourced/attributed
Representative practice questions, explicitly labelled
Technology preparation
System-design preparation
Behavioral preparation
Related learning
Sources / attribution
Update/review date
```

## B5. System design

```text
Problem
Functional requirements
Non-functional requirements
Scale assumptions
Constraints
Architecture
Data flow
Storage
Processing
Orchestration
Reliability
Data quality
Observability
Security
Cost
Trade-offs
Failure modes
Interview follow-ups
```

## B6. Project

```text
Problem statement
Business context
Requirements
Architecture
Dataset
Technology stack
Implementation steps
Testing
Data quality
Monitoring
Cost considerations
Interview questions
Evidence-based resume bullets
Extensions
Next project
```

---

# Appendix C — Per-Content Validation Protocol

A content item is not `DONE` until all applicable checks pass.

## C1. Editorial correctness

- [ ] The page answers the intended user question directly.
- [ ] The explanation is internally consistent.
- [ ] Claims about external systems are sourced or clearly framed.
- [ ] Version-sensitive details have version/date context.
- [ ] No fabricated statistics, testimonials, or interview claims exist.
- [ ] Company content uses evidence labels.
- [ ] Code is syntactically reviewed and conceptually correct.
- [ ] Examples do not silently depend on unavailable infrastructure unless explicitly stated.

## C2. UX/content formatting

- [ ] H1 is unique and descriptive.
- [ ] Summary/deck provides immediate context where appropriate.
- [ ] Headings form a logical hierarchy.
- [ ] Paragraphs are readable.
- [ ] Lists are used when they improve scanning.
- [ ] Tables are used only for genuinely tabular information.
- [ ] Code blocks include language labels.
- [ ] Long code/tables remain usable on mobile.
- [ ] Callouts have meaningful labels.
- [ ] Images/diagrams have correct alt text or adjacent text explanations.
- [ ] A logical next step exists.

## C3. SEO

- [ ] SEO title is accurate.
- [ ] Meta description is unique and useful.
- [ ] Canonical is correct.
- [ ] Internal links are contextual.
- [ ] Parent hub link exists.
- [ ] Related content links are useful.
- [ ] Structured data, if used, matches visible content.
- [ ] No keyword stuffing.
- [ ] No duplicate or doorway intent.

## C4. Schema / relationships

- [ ] Frontmatter validates.
- [ ] Technology/topic references resolve.
- [ ] Related IDs resolve.
- [ ] Previous/next references resolve where supplied.
- [ ] Company evidence fields are valid where applicable.
- [ ] Slug is unique.

## C5. Accessibility

- [ ] Keyboard access works.
- [ ] Focus is visible.
- [ ] Focus is not obscured.
- [ ] Heading hierarchy is sensible.
- [ ] Links have understandable labels.
- [ ] Images are accessible.
- [ ] Tables have appropriate headers/scoping.
- [ ] Interactive disclosures have accessible names/state.
- [ ] Color is not the only status signal.

## C6. Final content status

```text
AUTHOR → TECHNICAL REVIEW → EDITORIAL REVIEW → SEO REVIEW → UX QA → PUBLISH
```

Only `PUBLISH` may mark the item complete in Appendix A.

---

# Appendix D — Phase Exit Gates

## D1. Phase 0 exit

- [ ] Route map locked
- [ ] Data model locked
- [ ] Design tokens locked
- [ ] SEO policy locked
- [ ] Privacy/analytics boundary locked
- [ ] Deployment model locked

## D2. Phase 1 exit

- [ ] Style gallery passes premium acceptance test
- [ ] No card-grid overload
- [ ] Typography hierarchy is obvious
- [ ] Dark mode is coherent
- [ ] Keyboard/focus behavior works
- [ ] Mobile primitives work

## D3. Phase 2 exit

- [ ] Every required template exists
- [ ] No template depends on JS for core content
- [ ] All templates use shared tokens/components
- [ ] 360px and 390px review passes
- [ ] 1280px and 1440px review passes

## D4. Phase 3 exit

- [ ] Schema validation works
- [ ] Relationships resolve
- [ ] New content can be added without component code edits
- [ ] Content errors are reported clearly

## D5. Phase 4 exit

- [ ] Metadata complete
- [ ] Canonicals correct
- [ ] Sitemap/robots correct
- [ ] Structured data valid
- [ ] Open Graph valid

## D6. Phase 5 exit

- [ ] Search indexes current build
- [ ] Top query set returns relevant results
- [ ] Search works without backend
- [ ] Search is accessible

## D7. Phase 6 exit

- [ ] Performance budgets pass
- [ ] Accessibility QA passes
- [ ] Security review passes
- [ ] Browser matrix passes

## D8. Phase 7 exit

- [ ] All 138 content items published or explicitly blocked
- [ ] No unreviewed company claims
- [ ] No thin pages
- [ ] No orphan inventory items

## D9. Phase 8 exit

- [ ] Production build succeeds
- [ ] Cloudflare serves static output
- [ ] Domain/HTTPS works
- [ ] Sitemap/robots/canonicals verified
- [ ] Search Console/analytics verified
- [ ] Smoke tests pass

## D10. Phase 9 operating gate

- [ ] Growth changes are evidence-driven
- [ ] Architecture changes follow trigger rules
- [ ] New dependencies pass dependency budget
- [ ] Monetization changes preserve UX/performance


## Current platform validation note

The deployment decisions in this specification were checked against current official documentation at finalization time:

- Cloudflare Workers Static Assets is the current recommended direction for new Cloudflare projects; a purely static site can point `assets.directory` at the build output without a Worker script. 
- Cloudflare documents `not_found_handling: "404-page"` and HTML handling options including `force-trailing-slash`. 
- Astro's Cloudflare adapter is not required when Astro is being used as a static site builder. 
- Pagefind is designed as a static, build-time search system with no server component. 
- WCAG 2.2 includes Focus Not Obscured and Target Size (Minimum) requirements that are reflected in the accessibility contract. 

Pricing, compatibility dates, package versions, and vendor limits are live operational facts and must be re-checked immediately before production deployment.

---

# Appendix E — Final Self-Containment and Consistency Audit

Before release, the coding agent must answer `PASS` for every item below.

## E1. Self-containment

- [ ] The repository can be built without opening either source planning file.
- [ ] All launch routes are defined here.
- [ ] All launch content is defined here.
- [ ] All design tokens are defined here.
- [ ] All major dependencies are defined here.
- [ ] All deployment decisions are defined here.
- [ ] All launch gates are defined here.

## E2. Product consistency

- [ ] Data Engineering remains the launch vertical.
- [ ] Adjacent careers are not promoted to separate launch verticals.
- [ ] The platform is a learning system, not a blog archive.
- [ ] No login is required for V1.
- [ ] No personal progress is implied.
- [ ] No code execution is shipped.

## E3. Design consistency

- [ ] Premium quality comes from hierarchy, typography, spacing and composition.
- [ ] Hero is compact.
- [ ] Navigation is goal-based.
- [ ] Technology depth is contextual.
- [ ] Cards are selective.
- [ ] Metadata is compact.
- [ ] Article reading width is approximately 740px.
- [ ] Wide technical content uses a wider breakout layout.
- [ ] Mobile is intentionally composed.
- [ ] Decorative effects remain restrained.

## E4. Technical consistency

- [ ] Astro static output is used.
- [ ] No Cloudflare adapter is installed solely for static hosting.
- [ ] No Worker script is required in V1.
- [ ] No database/API/authentication exists in V1.
- [ ] Pagefind is used only as a static/build-time search dependency.
- [ ] Client JavaScript is limited to meaningful enhancement.

## E5. SEO consistency

- [ ] URL policy is stable and trailing-slash consistent.
- [ ] Canonical URLs match final URLs.
- [ ] Sitemap contains intended indexable pages only.
- [ ] Robots does not accidentally block important content.
- [ ] Structured data reflects visible content.
- [ ] Programmatic pages are not mass-generated merely for SEO.

## E6. Trust consistency

- [ ] No fake social proof exists.
- [ ] No fabricated company questions exist.
- [ ] AI-assisted content has human/role-based review gates.
- [ ] Version-sensitive content is dated/reviewed where necessary.
- [ ] Affiliate/sponsorship disclosures are present if such content exists.

## E7. Runtime consistency

- [ ] Core content is usable without JavaScript.
- [ ] Search enhancement is isolated to search contexts.
- [ ] Theme enhancement cannot prevent page rendering.
- [ ] Third-party failure cannot blank the main content.
- [ ] Static 404 behavior is preserved.

## E8. Maintenance consistency

- [ ] Content authors can add content through collections without editing template code.
- [ ] Relationship validation catches broken references.
- [ ] Dependency additions require justification.
- [ ] Architecture changes require a trigger and decision record.
- [ ] The live tracker reflects actual project state.

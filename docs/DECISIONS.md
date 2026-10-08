# Decision records and deviations

The build plan (`docs/BUILD_PLAN.md`) is the source of truth. This file records implementation
choices the plan left open, and every deliberate deviation from it, with the reason and a revisit trigger.

## Locked architecture (as specified)

| Area | Implemented |
|---|---|
| Rendering | Astro `output: "static"`, `trailingSlash: "always"`, directory build format |
| UI | Native Astro components, custom CSS in cascade layers, vanilla TypeScript modules |
| Content | Astro Content Collections (glob loader), Markdown/MDX, strict Zod schemas |
| Search | Pagefind, run as `postbuild` against `dist/`; runtime loaded only on `/search/` or when the dialog opens |
| Backend / DB / auth / Worker script | None |
| Hosting | Cloudflare Workers Static Assets via `wrangler.jsonc` (no adapter, no `main`) |
| Analytics | Cloudflare Web Analytics, only when `PUBLIC_CF_ANALYTICS_TOKEN` is set at build time |

## Dependencies (dependency budget)

| Dependency | Reason | Native alternative considered | Runtime impact |
|---|---|---|---|
| `astro`, `@astrojs/mdx`, `@astrojs/sitemap` | Approved V1 stack | n/a | Build-time only |
| `pagefind` | Approved V1 search | Hand-written JSON index (rejected by plan) | Search pages only, lazy |
| `@astrojs/check`, `typescript` | `npm run check` | n/a | None |
| `eslint`, `typescript-eslint`, `eslint-plugin-astro`, `@eslint/js` | `npm run lint` | n/a | None |
| `prettier`, `prettier-plugin-astro` | `npm run format` | n/a | None |
| `wrangler` | Deploy/preview to Workers Static Assets (plan section 49) | Dashboard upload (manual, not repeatable) | None |

No client framework, CSS framework, icon package or animation library is installed.

## Records

**D-001 Content IDs equal URL paths.** Files live at `src/content/<collection>/<folder>/<slug>.md(x)`; the
file path determines the URL (for example `articles/pyspark/window-functions` → `/pyspark/window-functions/`).
There is no separate `slug` frontmatter field, which removes a class of duplicate-slug bugs. Validation enforces
that an article's folder equals its primary technology and that the technology has a hub.

**D-002 One `articles` collection for articles, tutorials and career guides.** `kind: article | tutorial` and
`section: learn | career` select the template variant and URL. Pillar pages use `pillar: true`.

**D-003 Relationship references are `"<collection>:<id>"` strings,** validated at build time. Reverse links are
computed automatically: if A lists B as related, B shows A too. Broken references fail the build.

**D-004 Colour token adjustments for contrast (deviation).** The plan's `--c-text-subtle` (#98A2B3 light,
#667085 dark) fails WCAG AA for text. Implemented: light muted #556070 / subtle #667085, dark muted #A4ADBD /
subtle #8A94A6. Added `--c-border-input` (#7C8596 light / #6F7A8C dark) so form-control borders meet 3:1.
Dark-theme semantic colours were added (the plan only specified them for light). `npm run check:contrast` audits all pairs.
Revisit: brand redesign.

**D-005 Navigation dropdowns deferred (deviation).** Top-level goals link directly to hub pages that contain
the "Learn" and "Interview" menu items, which avoids menu JavaScript and keyboard-trap risk. Revisit if
analytics show visitors failing to find technology hubs.

**D-006 Tabs not implemented yet.** No content is genuinely parallel yet (plan rule: tabs only for parallel
content). Accordions use native `<details>`. Revisit when a page needs, for example, the same example in SQL and PySpark.

**D-007 Style gallery replaced by representative-page QA (deviation).** Primitives were reviewed on real pages
(home, hub, article, question, company, roadmap, system design, project, search, 404) at 360–1440px in both
themes using automated screenshots, rather than a separate gallery page that could drift from real usage.

**D-008 CSP allows `'unsafe-inline'` scripts.** Needed for the tiny theme bootstrap (prevents a theme flash) and
for small scripts Astro inlines. No third-party script origin is allowed; `'wasm-unsafe-eval'` is required by
Pagefind. Revisit: move to hashes when Astro's CSP support covers all inline scripts used here.

**D-009 Search ranking.** Pagefind ranking is tuned toward title and heading matches
(`data-pagefind-weight` 10 on H1, 4 on the deck) with mild page-length normalisation. Filters: `type`,
`technology`, `difficulty`.

**D-010 Structured data.** `WebSite` on the home page; `BreadcrumbList` on pages with breadcrumbs (matches the
visible trail); `Article` on content pages. No `Organization` entity (no real organisation data yet); the Article
author is the editorial byline. FAQ schema is only emitted from a visible FAQ section, and no page has one yet.

**D-011 Placeholder domain.** `https://datadank.example` is used until a domain is chosen (task P0-03 is
BLOCKED). Set `SITE_URL` at build time and update `public/robots.txt`. See `docs/DEPLOYMENT.md`.

**D-012 Contact route.** No contact address is published yet, and the contact page says so honestly. Set
`SITE.contactEmail` in `src/data/site.ts` when a real address exists.

**D-013 Reading time** is computed from the body (code blocks excluded, 220 wpm), not authored.

**D-014 Interview hubs** exist per primary technology folder (`/interview/<tech>/`) and only when at least one
question exists, so there are no empty hubs.

**D-015 Redirects** for `/data-engineering/interview-preparation/` and `/data-engineering/projects/` (listed in the
plan's sitemap) point to `/interview/` and `/projects/` instead of duplicating those hubs.

**D-016 Consolidated inventory items (deviation).** Eight Appendix A items share their search intent with a page
that already exists, and the plan forbids duplicate or doorway intent. They are recorded in
`docs/content-inventory.json` as covered by the existing page rather than published as near-duplicates:
PILLAR-01 → `/data-engineering/roadmap/` (same as ROAD-01), SUPPORT-01 → `/etl-elt/etl-vs-elt/`,
SUPPORT-02 → `/data-warehousing/lake-vs-warehouse-vs-lakehouse/`, SUPPORT-04 → `/etl-elt/batch-vs-streaming/`,
SUPPORT-05 → `/airflow/dags-scheduling-retries/`, SUPPORT-15 → `/data-warehousing/partitioning-clustering-data-layout/`,
SUPPORT-16 → `/spark/partitions-shuffles-skew/`, SUPPORT-17 → `/data-warehousing/slowly-changing-dimensions/`.
Revisit if Search Console shows distinct queries that the existing page does not satisfy.

**D-017 Code verification scope.** SQL examples were executed on SQLite 3.45, Python on Python 3.12, PySpark on
PySpark 4.2 (local mode), and Airflow DAGs parsed on Airflow 3.3. Snowflake, Databricks, Kafka-cluster and dbt
examples could not be executed in the build environment; those pages say so in their version context.

**D-018 Course-style navigation and tiles (owner request, supersedes parts of D-005/D-006).** After reviewing the
first version, the site owner asked for a W3Schools-style learning structure. Implemented:
- Every technology hub is a **course home**: hero with stats, tabs (Overview, Lessons, Interview, Projects,
  Resources) and tiles. Lesson order comes from the `lessons` list in each technology file; articles not listed are
  appended by difficulty, so new content still appears without code changes. Tabs are accessible (`role=tablist`,
  arrow keys, hash deep links) and every section is visible without JavaScript.
- Every content page has a **left section sidebar** listing the whole course or section, with the current page
  highlighted, plus **Previous/Next** at the top and bottom (course order for lessons; difficulty order for interview
  questions; the previous/next chain for projects and case studies). On mobile the sidebar becomes a collapsible
  "course contents" panel. Sidebar text is excluded from the search index.
- Link lists on the homepage and listing pages are replaced by **fully clickable tiles** with one link each and no
  nested buttons. This overrides the plan's "selective cards" default at the owner's request; tiles stay flat (border,
  no heavy shadow) to keep the editorial feel.
Live reference sites (W3Schools, MDN, Microsoft Learn) could not be fetched from the build environment's network, so
the patterns were applied from their well-known public structure.

**D-019 Browser-saved progress (owner request; deviation from the plan).** The plan said never to imply personal
saved progress, since there are no accounts. The owner asked for "mark as done" and completion metrics without
login, so progress is stored in `localStorage` only (`dch-progress-v1`: visited pages, items marked done, last
lesson per course). Nothing is sent to a server. The home page shows three progress rings (lessons, questions,
projects) with a Continue link and a Reset control; course homes show Continue instead of Start. Copy always says
"saved in this browser", and the privacy page lists every key. No backend was added.

**D-020 Interview questions as index tables, not tabs (owner request; amends D-018).** Question counts will grow
past 50, so tabs did not scale. Each interview hub, plus a new `/interview/questions/` page listing every question,
uses a one-line-per-question table with these columns: number, question link, topic, difficulty, type and a Done
checkbox. The table has search, difficulty, type, topic and status filters. The Interview tab was removed from
course homes. Concept-review tiles stay as tiles.

**D-021 Hierarchical, collapsible sidebar and pager placement (owner request; amends D-018).** Sidebar modules are
`<details>` groups. A group is open when it holds the current page or has 16 links or fewer. The current lesson
expands to show its own sections, and done items show a tick and a course progress bar. The whole sidebar can be
hidden, and that choice persists (`dch-sidebar`), with an inline bootstrap so the layout does not jump. Previous/Next
now appears only at the end of the page; the top pager was removed.

**D-022 Explore rail.** Every content page has a right-hand "Explore" rail. Interview practice comes first, then
related lessons, projects, system design and quick reference, all computed at build time from shared technology and
references. On mobile the rail drops below the content. The on-page table of contents now lives inside the sidebar
on desktop (nested under the current lesson) and stays inline on mobile.

**D-023 Ad-ready layout without layout shift.** Ad slots (`AdSlot.astro`) reserve fixed space: the rail slot is
250px plus a label, the inline slot 280px plus a label. That space is reserved only when ads are configured, so CLS
stays at 0. AdSense loads on `requestIdleCallback` after the page is interactive, and only when
`PUBLIC_ADSENSE_CLIENT` and slot IDs are set. With those unset, no ad markup or script ships. Before turning ads
on, update the privacy page and add a consent banner where the law requires one.

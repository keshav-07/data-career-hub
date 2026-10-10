# SEO implementation log

Tracks the backlog in the DataDank SEO master plan (10 October 2026). Evidence is what was actually checked;
anything not checked is marked as such. No ranking or traffic outcome is implied.

## Status of the priority register

| ID | Task | Status | Evidence / note |
|---|---|---|---|
| SEO-01 | Production `SITE_URL` | Done (10 Oct) | Before: live canonicals, `og:url`, JSON-LD, sitemap and robots.txt all named `https://datadank.example` (checked on the deployed build at datadank.pages.dev). Now `https://datadank.com` is the default in `astro.config.mjs`; confirmed on the deployed build: canonical `https://datadank.com/sql/`, sitemap `<loc>https://datadank.com/…`. |
| SEO-02 | robots.txt sitemap directive | Done | `robots.txt` is generated from the site URL (`src/pages/robots.txt.ts`); live: `Sitemap: https://datadank.com/sitemap-index.xml`. |
| SEO-03 | Production validation | Done | `npm run validate` passes: 615 pages, 613 indexable, 613 in sitemap. `check:dist` now fails if any canonical, `og:url`, JSON-LD, sitemap or robots.txt names a placeholder or preview host (tested by planting a placeholder canonical). |
| SEO-04 | Search Console | **Owner action** | Verify a Domain property for `datadank.com` (DNS TXT in Cloudflare). Cannot be done from the repository. |
| SEO-05 | Submit sitemap | **Owner action** | Submit `https://datadank.com/sitemap-index.xml`; inspect `/`, `/sql/`, `/interview/sql/`, one lesson, one project with URL Inspection. Request indexing for the homepage and main hubs, because Google previously saw `.example` canonicals. |
| SEO-06 | Keyword-to-URL map | Started | `docs/seo/KEYWORD_URL_MAP.md` (no volumes or difficulty: unknown until GSC/Keyword Planner data). |
| SEO-07 | Cannibalisation | Watch list | See the map; no merges without GSC evidence. |
| SEO-08 | Homepage intent and claims | Done | H1 "Prepare for Data Engineer interviews in 90 days" (was "Become a job-ready Data Engineer in 90 days"); tagline and roadmap no longer promise a job; Day 90 of the plan no longer promises offers. |
| SEO-09 | Real contact route | Done (needs owner test) | Contact page lists keshavkrsharma2@gmail.com with its purpose; also in Organization JSON-LD. Owner: send a test email to confirm it is monitored. |
| SEO-10 | About / editorial transparency | Done | About page: independent single-maintainer project, no sponsorship/affiliates, how examples are executed and dates changed, AI-use statement, correction route. Privacy page now lists every browser-storage key actually used and what happens to emails. The owner can add their name and background to "Who runs DataDank" (not added without consent). |
| SEO-11 | Topic clusters | Started | Tier 1 supporting pages now link to their preferred URL (4 missing links added). Hubs link to lessons, questions and projects by template. |
| SEO-12 | Highest-value pages | Started | Course hub H1s fixed (rendered "SQLSQL", "AfAirflow" because the tile monogram was inside the H1); hub, interview, roadmap, projects, system-design and tracker titles retargeted to Data Engineer queries. |
| SEO-13 | Weekly GSC workflow | Not started | Needs GSC data. Use the weekly section in the keyword map. |
| SEO-14 | Mobile performance baseline | Partial | Build budgets: largest initial JS 27.7 KB gz, CSS 13.7 KB gz. PageSpeed Insights could not be run from the sandbox; owner should run it for `/`, `/sql/`, one lesson. Hashed assets now cached `immutable`; HSTS added. |
| SEO-15 | Orphan pages | Done | 0 content pages without an in-content inbound link (About/Privacy/Terms are linked from the footer). |
| SEO-16 | Original reference assets | Not started | Candidates: Spark troubleshooting checklist, pipeline reliability checklist (only once tested and useful). |
| SEO-17 | Incoming links | Not started | GSC Links report once verified. |
| SEO-18 | Structured data | Done | WebSite + Organization on `/`; Article (with publisher) on 561 content pages; BreadcrumbList on all non-home pages. FAQ markup only where a visible FAQ exists. No ratings, reviews or invented authors. Owner can validate with the Rich Results Test. |

## Other technical checks (10 Oct)

| Check | Result |
|---|---|
| Duplicate titles / descriptions | 0 / 0 |
| Pages with ≠ 1 H1 | 0 |
| `/sql` → `/sql/` | 308 to trailing slash (consistent with canonicals) |
| Nonexistent path | Real 404 |
| `*.pages.dev` | `X-Robots-Tag: noindex` live; canonicals point to datadank.com |
| `http://` → `https://`, `www` → apex | **Not verified**: datadank.com is not reachable from the sandbox. Owner: `curl -sI http://datadank.com/` and `curl -sI https://www.datadank.com/` should both 301 to `https://datadank.com/`. Add a Cloudflare Redirect Rule for `www` if needed. |
| Meta descriptions over 160 chars | 227 being shortened to 120–158 (in progress) |

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-10-10 | Production origin, robots.txt, pages.dev noindex, origin guard | Placeholder canonicals pointed Google at a non-existent host |
| 2026-10-10 | Contact, About, Privacy updates; homepage H1/tagline | Trust signals; remove job guarantee |
| 2026-10-10 | Course-hub H1 fix; hub title retargeting | H1 text was "SQLSQL"; titles did not match search intent |
| 2026-10-10 | Organization JSON-LD; Article publisher | Accurate publisher information |

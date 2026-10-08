# DataDank

A structured learning and interview-preparation website for Data Engineers: roadmaps, technology hubs,
guides, interview questions with evidence-labelled company preparation, system design case studies, projects
and cheat sheets.

- **Static** [Astro](https://astro.build) site: no server, database, accounts or Worker script.
- **Custom CSS** design system with light and dark themes; **minimal vanilla JS** (under 5 KB gzipped per page).
- **Typed content collections** with build-time validation of relationships, URLs and editorial rules.
- **[Pagefind](https://pagefind.app)** static search, loaded only on `/search/` or when the search dialog opens.
- Deploys to **Cloudflare Workers Static Assets**.

## Commands

```bash
npm install
npm run dev              # local dev server at http://localhost:4321
npm run build            # astro build, then Pagefind indexes dist/
npm run preview          # serve dist/
npm run validate         # type check, lint, contrast, inventory, build and dist checks
npm run check:dist       # links, anchors, SEO metadata, JSON-LD, sitemap, budgets (after a build)
npm run check:inventory  # reconcile docs/content-inventory.json with content files
```

## Project layout

```text
src/content/        Markdown/MDX content, one folder per collection (see docs/CONTENT.md)
src/content.config.ts  collection schemas
src/pages/          routes (file-based); dynamic routes read from collections
src/layouts/        BaseLayout, ContentLayout, ArticleLayout
src/components/     layout, navigation, content, article, roadmap, search
src/styles/         tokens, themes, base, layout, prose and component CSS (cascade layers)
src/scripts/        theme, menu, code-copy/table enhancement, TOC, search
src/utils/          content loading, validation, breadcrumbs, related content, SEO helpers
scripts/            QA scripts (dist, contrast, inventory)
docs/               build plan & tracker, decisions, content guide, deployment, content inventory
```

## Documentation

- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md): the authoritative specification and live TODO tracker
- [`docs/DECISIONS.md`](docs/DECISIONS.md): implementation decisions and deviations
- [`docs/CONTENT.md`](docs/CONTENT.md): how to add content
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Cloudflare deployment, domain, analytics and Search Console
- [`docs/content-inventory.json`](docs/content-inventory.json): the 138-item launch content inventory

## Status

The platform (design system, every template, content engine, SEO, search, QA tooling) is built and validated.
The launch library is drafted: 136 of 138 inventory items are written or consolidated into existing pages, and 2 company guides are blocked for lack of attributable sources (165 pages in total). Every item still needs human technical, editorial and SEO review before it counts as published. Production
launch is blocked on choosing a domain and connecting a Cloudflare account. See the tracker in `docs/BUILD_PLAN.md`.

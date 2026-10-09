# DataDank: design baseline before the orange/black brand refresh

Recorded on 2026-10-09, before any brand-refresh change. This file describes the site as it was at commit
`b944297` ("Integrate verified work from content/sql-cases") on `main`. Do not edit it after the refresh; changes
are logged in `docs/DATADANK_BRAND_IMPLEMENTATION_TODO.md`.

Backup references (see `docs/DATADANK_BRAND_ROLLBACK.md`):

- Remote branch `backup/pre-datadank-brand-refresh-20261009-branch` → `b944297`, pushed to `keshav-07/datadank`.
- Annotated tag `backup/pre-datadank-brand-refresh-20261009` → `b944297`. It was created locally, but the
  session's git proxy refused to push tags, so the branch is the remote backup.
- The working tree was clean when the backup was made (`git status --short` printed nothing), so no patch file
  was needed.

## Stack and commands

- Astro 7 static site, `trailingSlash: "always"`, MD/MDX content collections validated with Zod
  (`src/content.config.ts`), Pagefind search index built after the site build, deployed as Cloudflare Workers static
  assets (`wrangler.jsonc`, name `datadank`).
- Package manager: npm (`package-lock.json`).
- Commands: `npm run dev`, `npm run build` (runs Pagefind afterwards), `npm run preview`,
  `npm run validate` (= `check`, `lint`, `check:contrast`, `check:inventory`, `build`, `check:dist`),
  `npm run format:check`.
- `scripts/check-contrast.mjs` checks the WCAG ratios of the theme token pairs in `src/styles/themes.css`.
- `scripts/check-dist.mjs` checks the built HTML: links, anchors, titles, descriptions, canonical URLs.

## Visual design at the baseline

The "premium" interim theme from the previous rebrand: warm ivory and ink with a gold accent (light mode), deep
charcoal with champagne gold (dark mode), and a serif display face.

| Token (`src/styles/themes.css`) | Light | Dark |
|---|---|---|
| `--c-bg` | `#f8f6f1` | `#0d0e10` |
| `--c-surface` / `--c-surface-2` | `#fffdf9` / `#f1ece2` | `#15171a` / `#1c1f23` |
| `--c-text` / `--c-text-muted` / `--c-text-subtle` | `#16171b` / `#55504a` / `#66605a` | `#f3eee5` / `#b9b1a3` / `#a0988a` |
| `--c-border` / `-strong` / `-input` | `#e6dfd2` / `#d4c9b6` / `#8a7f6c` | `#2a2d32` / `#3b3f46` / `#857d6f` |
| `--c-accent` / `-hover` / `-soft` | `#7d5a14` / `#5e430e` / `#f6eedb` | `#d9b56c` / `#ead097` / `#2a2417` |
| `--c-primary` / `-hover` / `--c-on-primary` | `#16171b` / `#2c2d33` / `#f6e7c1` | `#d9b56c` / `#ead097` / `#16171b` |
| `--c-gold` (progress rings) | `#b8913a` | `#d9b56c` |
| `--c-code-bg` / `--c-code-text` | `#121316` / `#ece6da` | `#0a0b0d` / `#ece6da` |

- Dark mode applies with `data-theme="dark"` on `<html>`, or with `prefers-color-scheme: dark` when no explicit
  theme is set. The theme toggle saves the choice in `localStorage` key `dch-theme`.
- Fonts: body in the system UI sans stack (`--font-sans`). Display face Playfair Display (self-hosted variable
  woff2 at `public/fonts/playfair-display-latin-wght.woff2`, OFL licence alongside, preloaded in `BaseLayout`,
  `font-display: optional`) used for `h1`, `.section-head h2` and `.display`.
- Buttons are pills; the primary button is ink on ivory (gold text) in light mode and gold in dark mode.
- Eyebrows are accent-coloured uppercase with 0.12em tracking.

## Logo, favicon and sharing identity

- Header logo: a text wordmark, `Data<span>Dank</span>` in `src/components/layout/Header.astro`, set in the
  display serif with the "Dank" span in gold (`src/styles/components/header.css`). There were no logo image files.
- Footer (`src/components/layout/Footer.astro`): link columns from `FOOTER_COLUMNS` and a copyright line, no logo.
- Favicon: a single hand-made SVG, `public/favicon.svg` (ink rounded square with a gold "D"), linked once in
  `src/layouts/BaseLayout.astro` as `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`. There was no
  `favicon.ico`, no PNG favicons, no Apple touch icon and no web app manifest, so browsers asking for `/favicon.ico`
  got a 404 and Chrome could keep showing an older cached icon.
- `theme-color`: `#f8f6f1` (light) and `#0d0e10` (dark), in `BaseLayout.astro`.
- Open Graph image: `public/og/default.png` (1200×630, dark with gold, generated from a local HTML template), set
  as `SITE.defaultOgImage` in `src/data/site.ts`.
- Structured data: `WebSite` on the home page, `Article`/`BreadcrumbList` and similar on content pages
  (`src/utils/seo.ts`). No `logo` property is published.

## Layout and key components

- `src/layouts/BaseLayout.astro`: head metadata, skip link, `Header`, `MobileMenu`, search dialog, `Footer`.
- Header: wordmark, primary navigation from `GOALS` in `src/data/site.ts` (Learn, Practice, Interview, Projects,
  Planner and others), search button (Ctrl K), theme toggle, menu button below 1024px. A 1024–1199px rule
  tightens nav padding.
- Home page (`src/pages/index.astro`): hero centred on the 90-day plan (eyebrow "The DataDank 90-day plan",
  h1 "Become a job-ready Data Engineer in 90 days.", "Start Day 1" / "See the full plan" buttons, stats from the
  plan data, Day 1 card with a progress ring), then `HomeRoadmap` (three phase cards with weekly milestones), the
  local progress panel and the content sections below.
- Course pages: full-width three-column shell (`course.css`: 264px sidebar, lesson column up to 940px, 300px rail
  for the table of contents and ad space) from 1280px.
- Planner: `/planner/`, `/planner/<tracker>/`, `/planner/90-day-plan/`; state in `localStorage` key
  `dch-planner-v1`, lesson progress in `dch-progress-v1`.
- Styles: cascade layers (reset, tokens, base, layout, components, utilities, overrides) in `src/styles/`.

## Routes

`/`, `/about/`, `/contact/`, `/privacy/`, `/terms/`, `/disclaimer/`, `/search/`, `/404`,
`/<tech>/` and `/<tech>/<lesson>/` (SQL, Python, PySpark, Spark, Delta Lake, Airflow, Kafka, Snowflake, AWS, Data
Modeling, DSA and others), `/career/`, `/career/<slug>/`, `/data-engineering/`, `/data-engineering/roadmap/`,
`/data-engineering/system-design/` and `/<slug>/`, `/interview/`, `/interview/questions/`, `/interview/<tech>/` and
`/<slug>/`, `/interview/companies/` and `/<slug>/`, `/projects/` and `/<slug>/`, `/resources/`,
`/resources/cheat-sheets/<slug>/`, `/roadmaps/` and `/<slug>/`, `/planner/`, `/planner/<tracker>/`,
`/planner/90-day-plan/`. The baseline build produced 477 pages.

## Known behaviour at the baseline

- `npm run build` and `check:dist` passed with no errors.
- No horizontal overflow at 1440px or 390px on the home page, the window functions lesson or the 90-day plan
  (checked with Playwright).
- The header wordmark depends on the serif display font. With `font-display: optional` a first visit can show the
  fallback serif.

## Baseline screenshots

`docs/brand/baseline/` holds WebP screenshots of `/`, `/sql/window-functions/` and `/planner/90-day-plan/` at
1440px and 390px, in light and dark mode, taken from `astro preview` of the baseline build.

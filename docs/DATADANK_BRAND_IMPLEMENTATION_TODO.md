# DataDank brand implementation checklist

Working checklist for the orange/black brand refresh (master prompt v2). Updated as work progresses. `[x]` means
implemented and verified, `[ ]` pending, `[!]` blocked or limited (with the reason).

## Phase 1: backup, inventory, analysis

- [x] Working tree clean at `b944297`; backup branch `backup/pre-datadank-brand-refresh-20261009-branch` pushed.
- [!] Backup tag `backup/pre-datadank-brand-refresh-20261009` created locally; the git proxy refused the tag push.
- [x] `docs/DATADANK_PRE_BRAND_REFRESH_BASELINE.md` and baseline screenshots in `docs/brand/baseline/`.
- [x] `docs/DATADANK_BRAND_ROLLBACK.md`.
- [x] Inventory of the supplied images (below).

### Supplied asset inventory

Checked with Pillow: real alpha channel, background pixels, artwork type. Originals are kept in `docs/brand/source/`,
references in `docs/brand/reference/`.

| Original (repo copy) | Size | Alpha | What it is | Use on the site |
|---|---|---|---|---|
| `datadank-logo-light-original.webp` | 2000×667 | Real alpha | Full-colour lockup with tagline, light backgrounds | Source of the light compact header logo |
| `datadank-logo-dark-original.webp` | 2000×667 | Real alpha | Full lockup with white "Data" and bar, dark backgrounds | Source of the dark compact logo (header in dark mode, footer); Open Graph image |
| `datadank-mark-original.webp` | 1254×1254 | Real alpha | Symbol only, light backgrounds | Kept as source; not needed on pages yet |
| `datadank-app-icon-original.webp` | 1254×1254 | None (pure black outside a #0e0e0e rounded tile) | App/favicon tile | Favicon, Apple touch and manifest icons |
| `datadank-logo-mono-original.webp` | 2000×667 | Real alpha | Monochrome black lockup | Kept for single-colour uses; not used on pages |
| `datadank-logo-cream-bg-original.webp` | 2000×667 | None (cream #fbf8f2) | Same full-colour lockup on cream | Superseded by the transparent version |
| `reference/logo-sheet.webp`, `reference/brand-board.webp` | 1536×1024 | None | Logo sheet and brand board | Reference only, never used as assets |

Site assets (rebuild with `python3 scripts/brand-logos.py public/brand` and `python3 scripts/brand-icons.py <dir>`):

- `public/brand/datadank-logo-compact-light.webp` (444×96) and `-compact-dark.webp` (451×96): the full lockups with
  only the tagline row erased. The logo sheet's "Horizontal Compact" variant has the same proportions; no standalone
  compact file was supplied. Used in the header (light/dark) and footer (dark).
- `public/brand/datadank-logo-dark.webp` (1121×240): dark full lockup, used by the OG template.
- `public/favicon.ico` (16, 32, 48), `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180, square,
  tile colour in the corners so iOS can apply its own mask), `icon-192.png`, `icon-512.png` (rounded, transparent
  corners), `icon-maskable-512.png`, `site.webmanifest`. The tile was padded to a square with its own colour (it was
  1082×1061) so icons are not squashed.

## Phase 2: assets

- [x] Logo variants from the supplied transparent files (no redrawing, recolouring or re-cropping of the artwork).
- [x] Favicon set from the supplied app icon; `site.webmanifest` added.
- [x] Old `public/favicon.svg` removed (it was a hand-made placeholder; no vector master was supplied, so no SVG
      favicon is published). `/favicon.svg` now returns 404 and nothing references it.
- [x] Head links in `src/layouts/BaseLayout.astro` with `?v=2` cache-busting; checked in `dist/index.html`.
- [x] Build output contains every icon; `/favicon.ico` (image/x-icon), PNGs and the manifest return 200 from
      `astro preview`.
- [!] Live-site and real Chrome tab check not done: the site is not deployed from this environment. After deploying,
      hard-refresh and open `/favicon.ico` directly; Chrome can keep an old favicon cached for a while.
- [x] Open Graph image `public/og/default.png` regenerated (template `docs/brand/og-template.html`).

## Phase 3: design system

- [x] Brand constants (`--color-ink`, `--color-orange`, `--color-orange-deep`, `--color-cream`, `--color-surface`,
      `--color-muted`, gradients) in `src/styles/tokens.css`; semantic light/dark tokens in `src/styles/themes.css`.
- [x] Accessible text variants: orange text #b34700 on light, #ff8533 on dark; muted text #5e5852 (light) and #b8b1a9
      (dark) instead of #a8a29e, which is 2.3:1 on the cream background.
- [x] Plus Jakarta Sans 5.3.0 (variable, weights 200–800, latin subset, 27 KB) self-hosted at
      `public/fonts/plus-jakarta-sans-latin-wght.woff2` with its OFL licence; preloaded; Playfair Display removed.
- [x] Buttons: burnt-orange gradient (#cc4a0b → #a8370a) with white text (4.6–6.5:1), soft warm shadow, 10px radius;
      secondary buttons outlined. Links: ink (light) or cream (dark) with a fine orange underline, orange on hover.
- [x] Focus rings: deep orange on light surfaces, bright orange in the dark hero and footer (`--c-focus`).
- [x] Progress rings and timeline dots use `--c-brand` (#ff6a00).

## Phase 4: UI

- [x] Header: compact logo (light or dark artwork by theme), 28px tall on mobile, 32px from 1024px; the image alt is
      "DataDank home".
- [x] Home hero: dark charcoal in both themes, orange "in 90 days.", SVG data-flow lines
      (`src/components/content/DataFlow.astro`, `aria-hidden`), two slow pulses that stop under reduced motion,
      lighter and pulse-free below 768px. No invented stats: the numbers come from the plan and content.
- [x] Day card: opens on the first day not yet completed, with previous/next buttons and a "Mark complete" toggle
      that saves to the existing planner storage and moves on to the next open day (`src/scripts/day-card.ts`).
- [x] Footer: dark charcoal with the compact dark logo and the tagline as real text.
- [x] Routes, titles, descriptions, canonical URLs and structured data unchanged (check-dist passes on 477 pages).

## Phase 5: QA

- [x] `npm run validate` (astro check, eslint, contrast, inventory, build, check-dist): passes.
- [x] Playwright sweep of `/`, a lesson, `/planner/`, `/planner/sql/`, `/planner/90-day-plan/`, `/pyspark/`,
      `/interview/`, `/search/` and `/projects/` at 1440, 1280, 1024, 768, 430, 390 and 375px in light and dark: no
      horizontal overflow, no console errors, no failed requests.
- [x] Keyboard: Tab order reaches skip link, logo, nav, hero buttons, Day card controls and footer; focus rings visible.
- [x] Reduced motion: pulses hidden. Theme toggle swaps the logo artwork.
- [x] Day card: with days 1–2 ticked it shows Day 3 and the hero button reads "Continue Day 3"; previous/next,
      ticking and unticking all checked.

## Deviations from the references

- Button text: the brand board shows white text on #ff6a00 (2.9:1). Buttons use a deeper burnt-orange gradient so
  white text passes AA.
- Orange as small text is darkened in light mode (#b34700); #ff6a00 stays for large display text, rings and accents.
- The header uses a compact lockup made by removing the tagline from the supplied lockup, because the tagline is
  unreadable at header size and no separate compact file was supplied.
- No SVG favicon or SVG logos: none were supplied, and hand-drawing them would not be the approved artwork.

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

| File received | Size | Alpha | What it is | Production use |
|---|---|---|---|---|
| `7.webp` | 2000×667 | Real alpha (logo opaque, background transparent) | Monochrome black lockup with tagline | Light-background monochrome uses (print, single-colour contexts) |
| `8.webp` | 2000×667 | None (solid cream `#FBF8F2`) | Full-colour lockup with tagline, for light backgrounds | Light-mode logo after removing the uniform cream background |
| `9.webp` | 1254×1254 | None (solid black outside a dark rounded tile) | App icon / favicon: cream bar and orange D on a dark tile | Favicon, Apple touch icon, manifest icons, dark-mode mark |
| `10.webp` | 1536×1024 | None | Brand board: palette, typography, gradients, UI elements, hero mockup | Reference only, never used as an asset |

Not received yet (asked the user on 2026-10-09): the dark-background lockup with the light wordmark, the white
version, the compact horizontal lockup and any SVG master.

## Phase 2: assets

- [ ] Light-mode lockup and mark with the cream background removed (colour-to-alpha against the measured background).
- [ ] Dark-mode mark from the app icon.
- [ ] Favicons: `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180),
      manifest icons 192/512, `site.webmanifest`. No `favicon.svg` (no vector master was supplied).
- [ ] Head links updated with cache-busting, old `favicon.svg` removed, build output checked.
- [ ] Open Graph image regenerated in the new brand.

## Phase 3: design system

- [ ] Orange/black tokens in `themes.css`, with accessible text variants of orange and muted grey.
- [ ] Plus Jakarta Sans self-hosted; Playfair Display removed.
- [ ] Buttons, links, focus rings, eyebrows, rings and badges on the new tokens.

## Phase 4: UI

- [ ] Header with the logo (light and dark variants).
- [ ] Dark charcoal home hero with orange emphasis and an SVG data-flow motif (hidden on small screens, static
      under reduced motion).
- [ ] Footer with the logo and tagline.

## Phase 5: QA

- [ ] `npm run validate`.
- [ ] Screenshots and overflow checks at 1440, 1280, 1024, 768, 430, 390 and 375px, light and dark.
- [ ] Contrast, keyboard focus, reduced motion.

## Deviations from the references

- (recorded as they are made)

# Rolling back the DataDank orange/black brand refresh

The design before the refresh is preserved at commit `b944297` on `main`, described in
`docs/DATADANK_PRE_BRAND_REFRESH_BASELINE.md`.

| Reference | Where | Points to |
|---|---|---|
| Branch `backup/pre-datadank-brand-refresh-20261009-branch` | GitHub `keshav-07/datadank` and local | `b944297` |
| Tag `backup/pre-datadank-brand-refresh-20261009` | Local clone only (the session's git proxy refused tag pushes) | `b944297` |

The refresh commits all have subjects starting with `brand:`, so you can list them with:

```bash
git log --oneline --grep '^brand:' b944297..main
```

## Option 1: look at or redeploy the old design without touching main

```bash
git fetch origin
git switch -c old-design origin/backup/pre-datadank-brand-refresh-20261009-branch
npm ci
npm run build          # output in dist/
npx wrangler deploy    # only if you want the old design live again (Cloudflare Workers static assets)
```

## Option 2: undo only the brand refresh and keep later work

This reverts the `brand:` commits one by one, newest first, with new commits. Content added after the backup (new
lessons, fixes) stays. Never use `git reset --hard` or a force-push for this.

```bash
git switch main
git pull
git revert --no-edit $(git log --format=%H --grep '^brand:' b944297..HEAD)
npm run validate
git push origin main
```

If a revert conflicts because a later commit touched the same lines, resolve the conflict by keeping the later work
and the old styling, then `git revert --continue`.

## Option 3: restore single files

To bring back one piece of the old design, for example the old theme tokens:

```bash
git checkout b944297 -- src/styles/themes.css
```

Files the refresh changes or adds (see `docs/DATADANK_BRAND_IMPLEMENTATION_TODO.md` for the complete list):
`src/styles/themes.css`, `src/styles/tokens.css`, `src/styles/typography.css`, `src/styles/components/*.css`,
`src/components/layout/Header.astro`, `src/components/layout/Footer.astro`, `src/layouts/BaseLayout.astro`,
`src/pages/index.astro`, `public/brand/`, `public/favicon*`, `public/apple-touch-icon.png`,
`public/site.webmanifest`, `public/fonts/`, `public/og/default.png`.

## Favicon caches after a rollback

Browsers cache favicons separately from pages. After rolling back, the old or new icon can still show in Chrome
until the cache expires. A hard refresh of the site, then opening `/favicon.ico` directly, usually updates it.

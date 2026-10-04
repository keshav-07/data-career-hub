# Deployment: Cloudflare Workers Static Assets

The site is a static `dist/` folder. No Worker script, adapter, database or secret is needed.

## One-time setup

1. **Choose the domain.** Then:
   - set `SITE_URL=https://your-domain` in the build environment (used for canonicals, sitemap and OG URLs);
   - replace `datacareerhub.example` in `public/robots.txt`.
2. **Cloudflare account.** `npx wrangler login` (or create an API token with *Workers Scripts: Edit*) on the machine or CI that deploys.
3. **Update `compatibility_date`** in `wrangler.jsonc` to the deployment date.

## Build and deploy

```bash
npm ci
SITE_URL=https://your-domain npm run validate   # check, lint, contrast, inventory, build (+ Pagefind), dist checks
npx wrangler deploy --dry-run                     # confirms the assets config
npx wrangler deploy
```

`wrangler.jsonc` serves `./dist` with `not_found_handling: "404-page"` (real 404 status using `dist/404.html`)
and `html_handling: "force-trailing-slash"` (matches the canonical URL policy).
`public/_headers` sets security headers and `public/_redirects` holds the redirect map.

## Custom domain and HTTPS

In the Cloudflare dashboard: Workers & Pages → `data-career-hub` → Settings → Domains & Routes → add the custom
domain. Cloudflare provisions the certificate. Verify `https://` loads and `http://` redirects.

## Post-deploy verification (task P8-05 to P8-09)

```bash
curl -sI https://your-domain/does-not-exist/ | head -1     # expect 404
curl -sI https://your-domain/sql | grep -i location         # expect redirect to /sql/
curl -s  https://your-domain/robots.txt
curl -s  https://your-domain/sitemap-index.xml
curl -sI https://your-domain/ | grep -iE "content-security|x-content-type|referrer"
```

## Analytics (optional)

Enable Cloudflare Web Analytics for the site, then build with `PUBLIC_CF_ANALYTICS_TOKEN=<token>`. Also:

- add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src` in `public/_headers`;
- the privacy page updates automatically from the same variable.

## Search Console

Verify the domain property in Google Search Console (DNS TXT record), then submit `https://your-domain/sitemap-index.xml`.

## Continuous deployment (optional)

Connect the GitHub repository in Cloudflare (Workers Builds) with build command `npm run build`, deploy command
`npx wrangler deploy`, and environment variable `SITE_URL`.

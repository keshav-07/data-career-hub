// Post-build QA for dist/: internal links, anchors, SEO metadata, JSON-LD, sitemap, alt text and asset budgets.
// Usage: npm run build && npm run check:dist
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const BUDGET = { jsKb: 75, cssKb: 35, jsBlockKb: 150, cssBlockKb: 70 };
const errors = [];
const warnings = [];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "pagefind") return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const htmlFiles = walk(DIST).filter((f) => f.endsWith(".html"));
const urlOf = (file) =>
  "/" +
  relative(DIST, file)
    .replace(/index\.html$/, "")
    .replace(/\.html$/, "/");
const pages = htmlFiles.map((f) => ({ file: f, url: urlOf(f), html: readFileSync(f, "utf8") }));
const byUrl = new Map(pages.map((p) => [p.url, p]));

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

function resolves(href) {
  const [path] = href.split(/[?#]/);
  if (!path) return true;
  if (byUrl.has(path)) return true;
  const f = join(DIST, path);
  return existsSync(f) && statSync(f).isFile();
}

const seen = { title: new Map(), description: new Map(), canonical: new Map() };
const indexable = [];

for (const p of pages) {
  const { html, url } = p;
  const is404 = url === "/404/";
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) errors.push(`${url}: expected exactly one <h1>, found ${h1s}`);

  const decode = (v) =>
    v
      ?.replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1]);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!title) errors.push(`${url}: missing <title>`);
  if (!desc) errors.push(`${url}: missing meta description`);
  if (!canonical) errors.push(`${url}: missing canonical`);
  else {
    if (!/^https?:\/\//.test(canonical)) errors.push(`${url}: canonical is not absolute`);
    if (!is404 && !canonical.endsWith(url))
      errors.push(`${url}: canonical ${canonical} does not match URL`);
  }
  if (title && title.length > 70) warnings.push(`${url}: title is ${title.length} chars`);
  if (!noindex && !is404) {
    indexable.push(url);
    for (const [k, v] of [
      ["title", title],
      ["description", desc],
      ["canonical", canonical],
    ]) {
      if (!v) continue;
      if (seen[k].has(v)) errors.push(`${url}: duplicate ${k} (also on ${seen[k].get(v)})`);
      seen[k].set(v, url);
    }
  }
  const og = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
  if (!og) errors.push(`${url}: missing og:image`);
  else if (!existsSync(join(DIST, new URL(og).pathname)))
    errors.push(`${url}: og:image file not found (${new URL(og).pathname})`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      errors.push(`${url}: invalid JSON-LD`);
    }
  }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) errors.push(`${url}: <img> without alt`);
  }

  const pageIds = ids(html);
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("#")) {
      if (href.length > 1 && !pageIds.has(decodeURIComponent(href.slice(1))))
        errors.push(`${url}: broken anchor ${href}`);
      continue;
    }
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    if (!href.startsWith("/")) {
      warnings.push(`${url}: relative link ${href}`);
      continue;
    }
    const path = href.split(/[?#]/)[0];
    if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path))
      errors.push(`${url}: link without trailing slash ${href}`);
    if (!resolves(href)) errors.push(`${url}: broken internal link ${href}`);
    const hash = href.split("#")[1];
    if (hash && byUrl.has(path) && !ids(byUrl.get(path).html).has(decodeURIComponent(hash))) {
      errors.push(`${url}: broken anchor ${href}`);
    }
  }

  // Asset budget: compressed JS/CSS referenced by this page (inline + external).
  let js = 0;
  let css = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/application\/ld\+json/.test(m[1])) continue;
    const src = attr(m[1], "src");
    if (src && src.startsWith("/")) js += gzipSync(readFileSync(join(DIST, src))).length;
    else if (!src) js += gzipSync(m[2]).length;
  }
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
    const href = attr(m[0], "href");
    if (href?.startsWith("/")) css += gzipSync(readFileSync(join(DIST, href))).length;
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css += gzipSync(m[1]).length;
  // Module imports pulled in by entry scripts (one level).
  for (const m of html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)) {
    const code = readFileSync(join(DIST, m[1]), "utf8");
    for (const imp of code.matchAll(/from\s*"(\.\/[^"]+\.js)"/g)) {
      js += gzipSync(readFileSync(join(dirname(join(DIST, m[1])), imp[1]))).length;
    }
  }
  p.js = js;
  p.css = css;
  if (js / 1024 > BUDGET.jsBlockKb)
    errors.push(`${url}: initial JS ${(js / 1024).toFixed(1)} KB gz exceeds release block`);
  else if (js / 1024 > BUDGET.jsKb)
    warnings.push(`${url}: initial JS ${(js / 1024).toFixed(1)} KB gz over target`);
  if (css / 1024 > BUDGET.cssBlockKb)
    errors.push(`${url}: CSS ${(css / 1024).toFixed(1)} KB gz exceeds release block`);
  else if (css / 1024 > BUDGET.cssKb)
    warnings.push(`${url}: CSS ${(css / 1024).toFixed(1)} KB gz over target`);
}

// Sitemap: must contain every indexable page and nothing else.
const sitemapFiles = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
const inSitemap = new Set(
  sitemapFiles.flatMap((f) =>
    [...readFileSync(join(DIST, f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    ),
  ),
);
for (const u of indexable) if (!inSitemap.has(u)) errors.push(`sitemap: missing ${u}`);
for (const u of inSitemap)
  if (!indexable.includes(u)) errors.push(`sitemap: should not include ${u}`);

// Every absolute URL the build emits about itself must use the production origin, never a placeholder or a
// preview host (a wrong origin tells Google the preferred URL is somewhere else).
const ORIGIN = new URL(process.env.SITE_URL ?? "https://datadank.com").origin;
const BAD_HOST = /https?:\/\/(?:[\w-]+\.)*(?:datadank\.example|pages\.dev|workers\.dev|localhost)\b/;
for (const p of pages) {
  const selfUrls = [
    p.html.match(/<link rel="canonical" href="([^"]*)"/)?.[1],
    p.html.match(/<meta property="og:url" content="([^"]*)"/)?.[1],
  ].filter(Boolean);
  for (const u of selfUrls)
    if (new URL(u).origin !== ORIGIN) errors.push(`${p.url}: ${u} is not on ${ORIGIN}`);
  for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
    if (BAD_HOST.test(m[1])) errors.push(`${p.url}: JSON-LD names a placeholder or preview host`);
}
for (const f of ["robots.txt", "sitemap-index.xml", "sitemap-0.xml"]) {
  const body = existsSync(join(DIST, f)) ? readFileSync(join(DIST, f), "utf8") : "";
  if (!body.includes(ORIGIN)) errors.push(`${f}: does not use ${ORIGIN}`);
  if (BAD_HOST.test(body)) errors.push(`${f}: names a placeholder or preview host`);
}

const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
if (!/Sitemap: https?:\/\/\S+\/sitemap-index\.xml/.test(robots))
  errors.push("robots.txt: missing Sitemap line");
if (/Disallow: \/\s*$/m.test(robots)) errors.push("robots.txt: blocks the whole site");

const maxJs = Math.max(...pages.map((p) => p.js));
const maxCss = Math.max(...pages.map((p) => p.css));
console.log(
  `Checked ${pages.length} pages (${indexable.length} indexable, ${inSitemap.size} in sitemap).`,
);
console.log(
  `Largest initial JS: ${(maxJs / 1024).toFixed(1)} KB gz (target ≤ ${BUDGET.jsKb}). Largest CSS: ${(maxCss / 1024).toFixed(1)} KB gz (target ≤ ${BUDGET.cssKb}).`,
);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log("All dist checks passed.");

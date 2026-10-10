import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Production origin. Canonical URLs, Open Graph URLs, JSON-LD, the sitemap and robots.txt are all built from it.
// Override with SITE_URL only for a deliberate non-production build (see docs/DEPLOYMENT.md).
const site = process.env.SITE_URL ?? "https://datadank.com";

// URL → updatedDate for every content entry, so the sitemap's <lastmod> reflects real substantive updates
// (hubs and other generated pages get none rather than a made-up date).
const CONTENT = "src/content";
const walk = (d) =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  );
const PREFIX = {
  articles: (id) => `/${id}/`,
  "interview-questions": (id) => `/interview/${id}/`,
  "company-guides": (id) => `/interview/companies/${id}/`,
  "system-designs": (id) => `/data-engineering/system-design/${id}/`,
  projects: (id) => `/projects/${id}/`,
  "cheat-sheets": (id) => `/resources/cheat-sheets/${id}/`,
  roadmaps: (id, fm) =>
    /^roadmapType:\s*"?data-engineer"?\s*$/m.test(fm)
      ? "/data-engineering/roadmap/"
      : `/roadmaps/${id}/`,
};
const lastmod = new Map();
for (const file of walk(CONTENT).filter((f) => /\.mdx?$/.test(f))) {
  const [collection, ...rest] = relative(CONTENT, file).split("/");
  const fm = readFileSync(file, "utf8").split("---")[1] ?? "";
  const date = fm.match(/^updatedDate:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1];
  const id = rest.join("/").replace(/\.mdx?$/, "");
  if (date && PREFIX[collection]) lastmod.set(PREFIX[collection](id, fm), date);
}

export default defineConfig({
  output: "static",
  site,
  trailingSlash: "always",
  build: { format: "directory" },
  vite: {
    plugins: [
      {
        // Astro's temporary sync environment disables dependency discovery, leaving this CJS package unbundled.
        name: "datadank-optimize-picomatch-for-sync",
        config() {
          return {
            environments: {
              astro: {
                optimizeDeps: { include: ["picomatch"] },
              },
            },
          };
        },
      },
    ],
  },
  integrations: [
    mdx(),
    sitemap({
      // Utility pages and the 404 page must never be in the sitemap.
      filter: (page) => !page.endsWith("/404/") && !page.endsWith("/search/"),
      serialize: (item) => {
        const date = lastmod.get(new URL(item.url).pathname);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: false,
      transformers: [
        {
          // Code surface colour comes from --c-code-bg, not from the Shiki theme.
          pre(node) {
            const style = String(node.properties.style ?? "");
            node.properties.style = style.replace(/background-color:[^;]+;?/g, "");
          },
        },
      ],
    },
  },
});

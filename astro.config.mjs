import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

// Production origin. Canonical URLs, Open Graph URLs, JSON-LD, the sitemap and robots.txt are all built from it.
// Override with SITE_URL only for a deliberate non-production build (see docs/DEPLOYMENT.md).
const site = process.env.SITE_URL ?? "https://datadank.com";

export default defineConfig({
  output: "static",
  site,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    mdx(),
    sitemap({
      // Utility pages and the 404 page must never be in the sitemap.
      filter: (page) => !page.endsWith("/404/") && !page.endsWith("/search/"),
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

import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

// Replace with the production domain before launch (see docs/DEPLOYMENT.md).
const site = process.env.SITE_URL ?? "https://datacareerhub.example";

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

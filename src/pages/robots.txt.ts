import type { APIRoute } from "astro";

// Built from `site` in astro.config.mjs so the sitemap line always names the production origin.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("/sitemap-index.xml", site).toString();
  const body = ["User-agent: *", "Allow: /", "Disallow: /search/", "", `Sitemap: ${sitemap}`, ""];
  return new Response(body.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};

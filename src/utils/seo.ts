import { SITE } from "../data/site";
import { isoDate } from "./dates";
import type { Crumb } from "./breadcrumbs";

export function absoluteUrl(path: string, site: URL | string | undefined): string {
  return new URL(path, site ?? "https://datadank.com").toString();
}

export function pageTitle(title: string): string {
  return title === SITE.name ? title : `${title} | ${SITE.name}`;
}

export function breadcrumbSchema(
  crumbs: Crumb[],
  currentPath: string,
  site: URL | string | undefined,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: absoluteUrl(c.href ?? currentPath, site),
    })),
  };
}

const orgId = (site: URL | string | undefined) => absoluteUrl("/#organization", site);

export function websiteSchema(site: URL | string | undefined) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: absoluteUrl("/", site),
    description: SITE.description,
    inLanguage: SITE.locale,
    publisher: { "@id": orgId(site) },
  };
}

/** The site's publisher. Only facts shown on the About and Contact pages: name, logo and the public email. */
export function organizationSchema(site: URL | string | undefined) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId(site),
    name: SITE.name,
    url: absoluteUrl("/", site),
    logo: absoluteUrl("/icon-512.png", site),
    ...(SITE.contactEmail ? { email: SITE.contactEmail } : {}),
  };
}

export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  site: URL | string | undefined;
  published: Date;
  modified: Date;
  author: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    datePublished: isoDate(opts.published),
    dateModified: isoDate(opts.modified),
    // The editorial byline is the site itself; no individual author or credentials are invented.
    author: { "@type": "Organization", name: opts.author, url: absoluteUrl("/about/", opts.site) },
    publisher: {
      "@type": "Organization",
      "@id": orgId(opts.site),
      name: SITE.name,
      logo: absoluteUrl("/icon-512.png", opts.site),
    },
    image: absoluteUrl(opts.image ?? SITE.defaultOgImage, opts.site),
    mainEntityOfPage: absoluteUrl(opts.path, opts.site),
    inLanguage: SITE.locale,
  };
}

/** FAQ structured data is only emitted when a visible, genuine FAQ section exists on the page. */
export function faqSchema(faq: { q: string; a: string }[] | undefined) {
  if (!faq || faq.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

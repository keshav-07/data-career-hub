import { getItems, techLabel, type Item } from "./content";

export type Crumb = { label: string; href?: string };

export const HOME: Crumb = { label: "Home", href: "/" };

/** Deterministic breadcrumb trail for a content item. The last crumb is the current page (no href). */
export async function breadcrumbsFor(item: Item): Promise<Crumb[]> {
  const hubs = new Set((await getItems("technologies")).map((t) => t.id));
  const current: Crumb = { label: item.title };
  switch (item.collection) {
    case "articles": {
      if (item.entry.data.section === "career") {
        return [HOME, { label: "Career", href: "/career/" }, current];
      }
      const tech = item.technology[0];
      return [
        HOME,
        { label: "Learn", href: "/data-engineering/" },
        { label: await techLabel(tech), href: hubs.has(tech) ? `/${tech}/` : undefined },
        current,
      ];
    }
    case "interview-questions": {
      const tech = item.technology[0];
      return [
        HOME,
        { label: "Interview", href: "/interview/" },
        { label: await techLabel(tech), href: `/interview/${tech}/` },
        current,
      ];
    }
    case "company-guides":
      return [
        HOME,
        { label: "Interview", href: "/interview/" },
        { label: "Companies", href: "/interview/companies/" },
        current,
      ];
    case "roadmaps":
      return item.entry.data.roadmapType === "data-engineer"
        ? [HOME, { label: "Learn", href: "/data-engineering/" }, { label: "Roadmap" }]
        : [HOME, { label: "Roadmaps", href: "/roadmaps/" }, current];
    case "system-designs":
      return [
        HOME,
        { label: "Learn", href: "/data-engineering/" },
        { label: "System design", href: "/data-engineering/system-design/" },
        current,
      ];
    case "projects":
      return [HOME, { label: "Projects", href: "/projects/" }, current];
    case "cheat-sheets":
      return [HOME, { label: "Resources", href: "/resources/" }, current];
    case "technologies":
      return [
        HOME,
        { label: "Learn", href: "/data-engineering/" },
        { label: item.entry.data.shortName },
      ];
  }
}

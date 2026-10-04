import { getAllContent, getByRef, type Item } from "./content";

export type RelatedGroup = { label: string; items: Item[] };

const LABEL_BY_COLLECTION: Record<string, string> = {
  articles: "Related concepts",
  "interview-questions": "Interview practice",
  projects: "Projects",
  "system-designs": "Deep dives",
  "cheat-sheets": "Quick reference",
  "company-guides": "Company preparation",
  roadmaps: "Roadmaps",
  technologies: "Technology hubs",
};

async function resolve(refs: string[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const r of refs) {
    const item = await getByRef(r);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Relationship groups for an item. Combines the item's explicit `related`/`prerequisites`
 * with reverse links (items that name this one as related), so a relationship authored once
 * shows on both pages.
 */
export async function relatedGroups(item: Item): Promise<{
  prerequisites: Item[];
  groups: RelatedGroup[];
}> {
  const data = item.entry.data as { prerequisites?: string[]; related?: string[] };
  const prerequisites = await resolve(data.prerequisites ?? []);
  const forward = await resolve(data.related ?? []);

  const all = await getAllContent();
  const reverse = all.filter((other) => {
    if (other.ref === item.ref) return false;
    const od = other.entry.data as { related?: string[] };
    return (od.related ?? []).includes(item.ref);
  });

  const seen = new Set<string>([item.ref, ...prerequisites.map((p) => p.ref)]);
  const buckets = new Map<string, Item[]>();
  for (const rel of [...forward, ...reverse]) {
    if (seen.has(rel.ref)) continue;
    seen.add(rel.ref);
    const label = LABEL_BY_COLLECTION[rel.collection] ?? "Related";
    buckets.set(label, [...(buckets.get(label) ?? []), rel]);
  }
  const order = [
    "Related concepts",
    "Interview practice",
    "Projects",
    "Deep dives",
    "Quick reference",
    "Company preparation",
    "Roadmaps",
  ];
  const groups = [...buckets.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([label, items]) => ({ label, items }));
  return { prerequisites, groups };
}

export async function nextPrev(item: Item): Promise<{ next?: Item; previous?: Item }> {
  const d = item.entry.data as { next?: string; previous?: string };
  return {
    next: d.next ? await getByRef(d.next) : undefined,
    previous: d.previous ? await getByRef(d.previous) : undefined,
  };
}

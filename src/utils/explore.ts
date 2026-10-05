import { getItems, type Item } from "./content";
import { getCourse, type NavLink } from "./navigation";
import { relatedGroups } from "./related";

export type ExploreGroup = { title: string; links: NavLink[] };

const link = (i: Item, meta?: string): NavLink => ({ title: i.title, url: i.url, meta });

/**
 * Right-rail "Explore" content for any page: interview practice first (the main engagement goal),
 * then related lessons from other courses, projects, case studies and quick reference.
 */
export async function exploreFor(item: Item): Promise<ExploreGroup[]> {
  const folder = item.id.split("/")[0];
  const course = (await getCourse(folder)) ?? (await getCourse(item.technology[0]));
  const { groups: rel, prerequisites } = await relatedGroups(item);
  const fromRel = (label: string) => rel.find((g) => g.label === label)?.items ?? [];
  const seen = new Set<string>([item.url]);
  const take = (items: Item[], n: number, meta?: (i: Item) => string | undefined) => {
    const out: NavLink[] = [];
    for (const i of items) {
      if (out.length >= n || seen.has(i.url)) continue;
      seen.add(i.url);
      out.push(link(i, meta?.(i)));
    }
    return out;
  };

  const sameTechQuestions = (await getItems("interview-questions")).filter((q) =>
    q.technology.some((t) => item.technology.includes(t)),
  );
  const questions = take(
    [...fromRel("Interview practice"), ...(course?.questions ?? []), ...sameTechQuestions],
    5,
    (q) => q.difficulty,
  );

  // Lessons in the current course are already in the left sidebar, so prefer related lessons elsewhere.
  const courseLessons = new Set((course?.lessons ?? []).map((l) => l.url));
  const otherLessons = [...prerequisites, ...fromRel("Related concepts")].filter(
    (l) => item.collection !== "articles" || !courseLessons.has(l.url),
  );
  const lessons = take(
    item.collection === "articles" ? otherLessons : [...otherLessons, ...(course?.lessons ?? [])],
    4,
    (l) => l.difficulty,
  );

  const projects = take(
    [...fromRel("Projects"), ...(course?.projects ?? [])],
    2,
    (p) => p.difficulty,
  );
  const designs = take([...fromRel("Deep dives"), ...(course?.designs ?? [])], 2);
  const reference = take([...fromRel("Quick reference"), ...(course?.cheatSheets ?? [])], 1);

  return [
    { title: "Interview practice", links: questions },
    {
      title: item.collection === "articles" ? "Related lessons" : "Learn the concepts",
      links: lessons,
    },
    { title: "Projects", links: projects },
    { title: "System design", links: designs },
    { title: "Quick reference", links: reference },
  ].filter((g) => g.links.length > 0);
}

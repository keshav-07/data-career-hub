import { getAllContent, getItems, getHub, type Item, type ItemOf } from "./content";

export type NavLink = { title: string; url: string; meta?: string; number?: number };
export type NavGroup = { title: string; links: NavLink[] };
/** Left-hand section navigation (W3Schools/MDN style) plus previous/next for the current page. */
export type SectionNav = {
  label: string;
  title: string;
  href: string;
  groups: NavGroup[];
  current: string;
  position?: { index: number; total: number; noun: string };
  prev?: NavLink;
  next?: NavLink;
};

const DIFFICULTY_ORDER = ["Beginner", "Intermediate", "Advanced"];
const QUESTION_ORDER = ["Easy", "Medium", "Hard"];

export type CourseModule = {
  id: string;
  title: string;
  summary: string;
  lessons: ItemOf<"articles">[];
};
export type Course = {
  hub: ItemOf<"technologies">;
  modules: CourseModule[];
  lessons: ItemOf<"articles">[];
  questions: ItemOf<"interview-questions">[];
  projects: ItemOf<"projects">[];
  designs: ItemOf<"system-designs">[];
  cheatSheets: ItemOf<"cheat-sheets">[];
  minutes: number;
};

const MODULE_TEXT: Record<string, { title: string; summary: string }> = {
  intro: { title: "Start here", summary: "The complete overview of the course in one read." },
  Beginner: { title: "Beginner", summary: "Core concepts you will use every day." },
  Intermediate: { title: "Intermediate", summary: "Patterns used in production pipelines." },
  Advanced: { title: "Advanced", summary: "Performance, internals and edge cases." },
};

const courseCache = new Map<string, Promise<Course | undefined>>();

/** A technology hub as a course: ordered modules of lessons plus practice material. */
export function getCourse(tech: string): Promise<Course | undefined> {
  if (!courseCache.has(tech)) courseCache.set(tech, buildCourse(tech));
  return courseCache.get(tech)!;
}

async function buildCourse(tech: string): Promise<Course | undefined> {
  const hub = await getHub(tech);
  if (!hub) return undefined;
  const inFolder = (await getItems("articles")).filter(
    (a) => a.entry.data.section === "learn" && a.id.startsWith(`${tech}/`),
  );
  const listed = hub.entry.data.lessons;
  const rank = (a: ItemOf<"articles">) => {
    const i = listed.indexOf(a.ref);
    return i === -1 ? listed.length + DIFFICULTY_ORDER.indexOf(a.entry.data.difficulty) : i;
  };
  const ordered = [...inFolder].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));

  const intro = ordered.filter((a) => a.entry.data.pillar);
  const modules: CourseModule[] = [];
  if (intro.length) modules.push({ id: "intro", ...MODULE_TEXT.intro, lessons: intro });
  for (const level of DIFFICULTY_ORDER) {
    const lessons = ordered.filter(
      (a) => !a.entry.data.pillar && a.entry.data.difficulty === level,
    );
    if (lessons.length) modules.push({ id: level.toLowerCase(), ...MODULE_TEXT[level], lessons });
  }
  const lessons = modules.flatMap((m) => m.lessons);

  const questions = (await getItems("interview-questions"))
    .filter((q) => q.id.startsWith(`${tech}/`) || q.technology.includes(tech))
    .sort(
      (a, b) =>
        QUESTION_ORDER.indexOf(a.entry.data.difficulty) -
          QUESTION_ORDER.indexOf(b.entry.data.difficulty) || a.title.localeCompare(b.title),
    );
  const projects = (await getItems("projects")).filter(
    (p) =>
      p.technology.includes(tech) ||
      p.entry.data.technologies.some((t) =>
        t.toLowerCase().includes(hub.entry.data.shortName.toLowerCase()),
      ),
  );
  const designs = (await getItems("system-designs")).filter((s) => s.technology.includes(tech));
  const cheatSheets = (await getItems("cheat-sheets")).filter(
    (c) => c.technology.includes(tech) || c.ref === hub.entry.data.cheatSheet,
  );
  const minutes = lessons.reduce((sum, l) => sum + l.minutes, 0);
  return { hub, modules, lessons, questions, projects, designs, cheatSheets, minutes };
}

const link = (i: Item, meta?: string, number?: number): NavLink => ({
  title: i.title,
  url: i.url,
  meta,
  number,
});

function withPager(nav: SectionNav, ordered: Item[], currentUrl: string, noun: string): SectionNav {
  const idx = ordered.findIndex((i) => i.url === currentUrl);
  if (idx === -1) return nav;
  return {
    ...nav,
    position: { index: idx + 1, total: ordered.length, noun },
    prev: idx > 0 ? link(ordered[idx - 1]) : undefined,
    next: idx < ordered.length - 1 ? link(ordered[idx + 1]) : undefined,
  };
}

/** Course navigation for a lesson page. */
export async function courseNav(item: ItemOf<"articles">): Promise<SectionNav | undefined> {
  const course = await getCourse(item.id.split("/")[0]);
  if (!course) return undefined;
  let n = 0;
  const groups: NavGroup[] = course.modules.map((m) => ({
    title: m.title,
    links: m.lessons.map((l) => link(l, undefined, ++n)),
  }));
  const practice: NavLink[] = [];
  const interviewHub = course.questions.some((q) => q.id.startsWith(`${course.hub.id}/`));
  if (interviewHub) {
    practice.push({
      title: `Interview questions`,
      url: `/interview/${course.hub.id}/`,
      meta: String(course.questions.length),
    });
  }
  for (const c of course.cheatSheets) practice.push(link(c, "Cheat sheet"));
  for (const p of course.projects) practice.push(link(p, "Project"));
  if (practice.length) groups.push({ title: "Practice", links: practice });
  return withPager(
    {
      label: `${course.hub.entry.data.shortName} course contents`,
      title: `${course.hub.entry.data.shortName} course`,
      href: course.hub.url,
      groups,
      current: item.url,
    },
    course.lessons,
    item.url,
    "Lesson",
  );
}

/** Interview question navigation: every question in the same interview hub, by difficulty. */
export async function interviewNav(item: ItemOf<"interview-questions">): Promise<SectionNav> {
  const tech = item.id.split("/")[0];
  const all = (await getItems("interview-questions"))
    .filter((q) => q.id.startsWith(`${tech}/`))
    .sort(
      (a, b) =>
        QUESTION_ORDER.indexOf(a.entry.data.difficulty) -
          QUESTION_ORDER.indexOf(b.entry.data.difficulty) || a.title.localeCompare(b.title),
    );
  const groups: NavGroup[] = QUESTION_ORDER.map((d) => ({
    title: d,
    links: all.filter((q) => q.entry.data.difficulty === d).map((q) => link(q)),
  })).filter((g) => g.links.length);
  const hub = await getHub(tech);
  const more: NavLink[] = [{ title: "All interview topics", url: "/interview/" }];
  if (hub) more.unshift({ title: `${hub.entry.data.shortName} course`, url: hub.url });
  groups.push({ title: "More", links: more });
  const label = hub?.entry.data.shortName ?? tech;
  return withPager(
    {
      label: `${label} interview questions`,
      title: `${label} interview questions`,
      href: `/interview/${tech}/`,
      groups,
      current: item.url,
    },
    all,
    item.url,
    "Question",
  );
}

/** Follows previous/next links to order a collection; items outside any chain are appended by title. */
function chainOrder<T extends Item>(items: T[]): T[] {
  const byRef = new Map(items.map((i) => [i.ref, i]));
  const nextOf = (i: T) => (i.entry.data as { next?: string }).next;
  const pointedTo = new Set(items.map(nextOf).filter(Boolean));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const head of items
    .filter((i) => !pointedTo.has(i.ref))
    .sort((a, b) => a.title.localeCompare(b.title))) {
    let cur: T | undefined = head;
    while (cur && !seen.has(cur.ref)) {
      seen.add(cur.ref);
      out.push(cur);
      const n = nextOf(cur);
      cur = n ? byRef.get(n) : undefined;
    }
  }
  return [
    ...out,
    ...items.filter((i) => !seen.has(i.ref)).sort((a, b) => a.title.localeCompare(b.title)),
  ];
}

type SectionKey =
  "projects" | "system-designs" | "cheat-sheets" | "roadmaps" | "career" | "company-guides";

/** Navigation for non-course sections: every item in the section, grouped sensibly. */
export async function sectionNav(section: SectionKey, currentUrl: string): Promise<SectionNav> {
  const all = await getAllContent();
  switch (section) {
    case "projects": {
      const items = chainOrder((await getItems("projects")).slice());
      const groups = DIFFICULTY_ORDER.map((l) => ({
        title: l,
        links: items.filter((p) => p.entry.data.level === l).map((p) => link(p)),
      })).filter((g) => g.links.length);
      return withPager(
        { label: "Projects", title: "Projects", href: "/projects/", groups, current: currentUrl },
        items,
        currentUrl,
        "Project",
      );
    }
    case "system-designs": {
      const items = chainOrder((await getItems("system-designs")).slice());
      return withPager(
        {
          label: "System design case studies",
          title: "System design",
          href: "/data-engineering/system-design/",
          groups: [{ title: "Case studies", links: items.map((i) => link(i)) }],
          current: currentUrl,
        },
        items,
        currentUrl,
        "Case study",
      );
    }
    case "cheat-sheets": {
      const items = (await getItems("cheat-sheets")).sort((a, b) => a.title.localeCompare(b.title));
      return withPager(
        {
          label: "Cheat sheets",
          title: "Cheat sheets",
          href: "/resources/",
          groups: [{ title: "Cheat sheets", links: items.map((i) => link(i)) }],
          current: currentUrl,
        },
        items,
        currentUrl,
        "Sheet",
      );
    }
    case "roadmaps": {
      const items = await getItems("roadmaps");
      const by = (t: string) =>
        items
          .filter((r) => r.entry.data.roadmapType === t)
          .sort((a, b) => a.title.localeCompare(b.title));
      const ordered = [...by("data-engineer"), ...by("study-plan"), ...by("career-transition")];
      const groups = [
        { title: "Roadmap", links: by("data-engineer").map((i) => link(i)) },
        { title: "Study plans", links: by("study-plan").map((i) => link(i)) },
        { title: "Career plans", links: by("career-transition").map((i) => link(i)) },
      ].filter((g) => g.links.length);
      return withPager(
        {
          label: "Roadmaps and plans",
          title: "Roadmaps",
          href: "/roadmaps/",
          groups,
          current: currentUrl,
        },
        ordered,
        currentUrl,
        "Plan",
      );
    }
    case "career": {
      const guides = all.filter(
        (i): i is ItemOf<"articles"> =>
          i.collection === "articles" && i.entry.data.section === "career",
      );
      const plans = (await getItems("roadmaps")).filter(
        (r) => r.entry.data.roadmapType === "career-transition",
      );
      return withPager(
        {
          label: "Career guides",
          title: "Career",
          href: "/career/",
          groups: [
            { title: "Career guides", links: guides.map((i) => link(i)) },
            { title: "Career plans", links: plans.map((i) => link(i)) },
          ].filter((g) => g.links.length),
          current: currentUrl,
        },
        guides,
        currentUrl,
        "Guide",
      );
    }
    case "company-guides": {
      const items = (await getItems("company-guides")).sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      return withPager(
        {
          label: "Company guides",
          title: "Company preparation",
          href: "/interview/companies/",
          groups: [
            {
              title: "Companies",
              links: items.map((i) => ({ title: i.entry.data.company, url: i.url })),
            },
          ],
          current: currentUrl,
        },
        items,
        currentUrl,
        "Guide",
      );
    }
  }
}

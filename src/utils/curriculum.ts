import { slug } from "github-slugger";
import curriculum from "../../docs/curriculum/curriculum.json";
import plan from "../../docs/curriculum/plan-90-days.json";
import { getAllContent } from "./content";

/**
 * The study planner: every topic from the owner's career planner spreadsheet, resolved to the page
 * (and section) that teaches it. Topic → page mapping lives in docs/curriculum/curriculum.json;
 * the exact section heading for each topic is recorded by authors in docs/curriculum/headings/*.json.
 */

export type Field = "learn" | "practice" | "mock" | "r1" | "r2" | "r3";
export type TrackerDef = {
  id: string;
  title: string;
  short: string;
  blurb: string;
  fields: { id: Field; label: string }[];
  /** Label for the first field when used as the "done" measure. */
  doneLabel: string;
};

const LEARN = { id: "learn", label: "Studied" } as const;
const PRACTICE = { id: "practice", label: "Practised" } as const;
const R1 = { id: "r1", label: "Rev 1" } as const;
const R2 = { id: "r2", label: "Rev 2" } as const;
const R3 = { id: "r3", label: "Rev 3" } as const;

export const TRACKERS: TrackerDef[] = [
  {
    id: "sql",
    title: "SQL tracker",
    short: "SQL",
    blurb: "Concepts from SELECT to MVCC, plus 20 business case studies solved several ways.",
    fields: [LEARN, PRACTICE, { id: "mock", label: "Mock Q" }, R1, R2, R3],
    doneLabel: "studied",
  },
  {
    id: "dsa",
    title: "DSA tracker",
    short: "DSA",
    blurb:
      "Curated coding problems by pattern: arrays to dynamic programming, each with a full solution.",
    fields: [{ id: "learn", label: "Solved" }, R1, R2, R3],
    doneLabel: "solved",
  },
  {
    id: "pyspark",
    title: "PySpark tracker",
    short: "PySpark",
    blurb: "Core Spark, Spark SQL, performance, optimisation, Structured Streaming and Delta Lake.",
    fields: [LEARN, PRACTICE, { id: "r1", label: "Revised" }, { id: "mock", label: "Mock" }],
    doneLabel: "studied",
  },
  {
    id: "data-modeling",
    title: "Data modeling tracker",
    short: "Data modeling",
    blurb:
      "Star and snowflake schemas, facts and dimensions, SCD types 0–6, Kimball, Inmon and Data Vault.",
    fields: [LEARN, PRACTICE, { id: "r1", label: "Revised" }],
    doneLabel: "studied",
  },
  {
    id: "snowflake",
    title: "Snowflake tracker",
    short: "Snowflake",
    blurb:
      "Architecture, warehouses, clustering, streams and tasks, Snowpipe, Time Travel, security and cost.",
    fields: [LEARN, PRACTICE, { id: "r1", label: "Revised" }],
    doneLabel: "studied",
  },
  {
    id: "kafka",
    title: "Kafka tracker",
    short: "Kafka",
    blurb:
      "Topics and partitions, producers, consumers, replication, exactly-once, Connect, Streams and Schema Registry.",
    fields: [LEARN, PRACTICE, { id: "r1", label: "Revised" }],
    doneLabel: "studied",
  },
  {
    id: "airflow",
    title: "Airflow tracker",
    short: "Airflow",
    blurb: "DAGs, operators, sensors, scheduling, XCom, executors, operations and best practices.",
    fields: [LEARN, PRACTICE, { id: "r1", label: "Revised" }],
    doneLabel: "studied",
  },
  {
    id: "aws",
    title: "AWS tracker",
    short: "AWS",
    blurb:
      "S3, IAM, Lambda, Glue, Athena, Redshift, EMR, Kinesis, Step Functions and the wider data stack.",
    fields: [LEARN, R1, R2],
    doneLabel: "studied",
  },
  {
    id: "system-design",
    title: "System design tracker",
    short: "System design",
    blurb: "Data engineering design scenarios: lakes, CDC, streaming, analytics, ML data and more.",
    fields: [
      { id: "learn", label: "Attempted" },
      { id: "r1", label: "Revised" },
    ],
    doneLabel: "attempted",
  },
];

export type TopicRow = {
  key: string;
  topic: string;
  category: string;
  difficulty: string;
  href?: string;
  pageTitle?: string;
};

type RawItem = {
  topic: string;
  category: string;
  difficulty: string;
  lesson?: string;
  question?: string;
  design?: string;
};
type Raw = Record<string, { items: RawItem[] }>;
type Headings = Record<string, { ref: string; heading: string }>;

const headingFiles = import.meta.glob<Headings>("../../docs/curriculum/headings/*.json", {
  eager: true,
  import: "default",
});
/** Which tracker each author task's heading file belongs to (topic names repeat across trackers). */
const TASK_TRACKER: Record<string, string> = {
  "sql-core": "sql",
  "sql-advanced": "sql",
  "sql-cases": "sql",
  "spark-core": "pyspark",
  "pyspark-delta": "pyspark",
};
const headingsFor = (tracker: string): Headings =>
  Object.assign(
    {},
    ...Object.entries(headingFiles)
      .filter(([path]) => {
        const task = path
          .split("/")
          .pop()!
          .replace(/\.json$/, "");
        return (TASK_TRACKER[task] ?? task) === tracker;
      })
      .map(([, h]) => h),
  );

const keyOf = (tracker: string, topic: string) => `${tracker}:${slug(topic)}`;

/** Every topic of one tracker, linked to the page and section that teaches it (when it exists). */
export async function trackerRows(tracker: string): Promise<TopicRow[]> {
  const all = await getAllContent();
  const byRef = new Map(all.map((i) => [i.ref, i]));
  const items = (curriculum as unknown as Raw)[tracker]?.items ?? [];
  const headings = headingsFor(tracker);
  return items.map((it) => {
    const h = headings[it.topic];
    const ref = h?.ref ?? it.question ?? it.design ?? it.lesson;
    const page = ref ? byRef.get(ref) : undefined;
    const anchor = h && page && h.ref === page.ref ? `#${slug(h.heading)}` : "";
    return {
      key: keyOf(tracker, it.topic),
      topic: it.topic,
      category: it.category,
      difficulty: it.difficulty,
      href: page ? page.url + anchor : undefined,
      pageTitle: page?.title,
    };
  });
}

export type PlanDay = {
  day: number;
  week: number;
  phase: string;
  theme: string;
  hours: number;
  /** key: the planner topic key (`tracker:slug`) used to tick the topic as studied. */
  tasks: { skill: string; tracker?: string; topic: string; key: string; href?: string }[];
  mock: string;
  weekly?: string;
  monthly?: string;
  outcome?: string;
};

const PLAN_SKILLS: [string, string][] = [
  ["SQL", "sql"],
  ["DSA", "dsa"],
  ["PySpark", "pyspark"],
  ["Snowflake", "snowflake"],
  ["Kafka", "kafka"],
  ["Airflow", "airflow"],
  ["AWS", "aws"],
  ["System Design", "system-design"],
];

/** The 90-day day-by-day plan, with each day's topics linked to their study material. */
export async function planDays(): Promise<PlanDay[]> {
  const lookup = new Map<string, TopicRow>();
  for (const [, t] of PLAN_SKILLS) {
    for (const r of await trackerRows(t)) lookup.set(keyOf(t, r.topic), r);
  }
  return (plan as Record<string, string | number | null>[]).map((d) => {
    const day = Number(d["Day"]);
    return {
      day,
      week: Math.ceil(day / 7),
      phase: String(d["Phase"]),
      theme: String(d["Focus Theme"]),
      hours: Number(d["Planned Hrs"]),
      tasks: PLAN_SKILLS.map(([skill, tracker]) => {
        const topic = String(d[skill]);
        return {
          skill,
          tracker,
          topic,
          key: keyOf(tracker, topic),
          href: lookup.get(keyOf(tracker, topic))?.href,
        };
      }),
      mock: String(d["Mock / Apply"]),
      weekly: (d["Weekly Milestone"] as string) ?? undefined,
      monthly: (d["Monthly Milestone"] as string) ?? undefined,
      outcome: (d["Expected Outcome"] as string) ?? undefined,
    };
  });
}

export type PracticeGroup<Q> = {
  name: string;
  lesson?: { url: string; title: string };
  questions: Q[];
};

/**
 * A course's interview questions grouped for its Practice tab. DSA follows the planner's pattern order (each group
 * links its pattern lesson); SQL splits core questions from business case studies; anything unlisted comes last.
 */
export async function practiceGroups<Q extends { ref: string; id: string }>(
  tech: string,
  questions: Q[],
): Promise<PracticeGroup<Q>[]> {
  const byRef = new Map(questions.map((q) => [q.ref, q]));
  const used = new Set<string>();
  const groups: PracticeGroup<Q>[] = [];
  const pages = new Map((await getAllContent()).map((i) => [i.ref, i]));
  if (tech === "dsa") {
    for (const it of (curriculum as unknown as Raw).dsa?.items ?? []) {
      const q = it.question ? byRef.get(it.question) : undefined;
      if (!q || used.has(q.ref)) continue;
      let g = groups.find((x) => x.name === it.category);
      if (!g) {
        const lesson = it.lesson ? pages.get(it.lesson) : undefined;
        g = {
          name: it.category,
          lesson: lesson && { url: lesson.url, title: lesson.title },
          questions: [],
        };
        groups.push(g);
      }
      g.questions.push(q);
      used.add(q.ref);
    }
  } else if (tech === "sql") {
    const core = questions.filter((q) => !q.id.endsWith("-sql-case-study"));
    const cases = questions.filter((q) => q.id.endsWith("-sql-case-study"));
    if (core.length) groups.push({ name: "Core SQL interview questions", questions: core });
    if (cases.length) groups.push({ name: "Business case studies", questions: cases });
    questions.forEach((q) => used.add(q.ref));
  }
  const rest = questions.filter((q) => !used.has(q.ref));
  if (rest.length)
    groups.push({ name: groups.length ? "More questions" : "Questions", questions: rest });
  return groups;
}

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
    id: "de-concepts",
    title: "Data Engineering concepts tracker",
    short: "DE Concepts",
    blurb:
      "Foundations and reliable pipeline practices, linked to the existing ETL/ELT, warehousing and Python lessons.",
    fields: [LEARN, PRACTICE, R1],
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

type PracticeLinkRaw = { platform: string; number?: number | null; title: string; url: string };
type RawItem = {
  topic: string;
  category: string;
  difficulty: string;
  lesson?: string;
  question?: string;
  design?: string;
  /** DSA: pattern subfolder inside the topic (category). */
  pattern?: string;
  /** DSA practice-only items (no DataDank page yet): future page slug and the verified external link. */
  slug?: string;
  practice?: PracticeLinkRaw;
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

export type PlanTopic = {
  topic: string;
  key?: string;
  href?: string;
  ref?: string;
};
export type PlanTask = {
  track: string;
  minutes: number;
  kind: "learn" | "practice" | "project" | "mock" | "revise";
  topics: PlanTopic[];
  practice?: { title: string; url: string }[];
};
export type PlanDay = {
  day: number;
  week: number;
  phase: string;
  theme: string;
  hours: number;
  tasks: PlanTask[];
  exercise: string;
  interviewQuestion: string;
  outcome: string;
  weekly?: string;
  monthly?: string;
  phaseGoal: string;
};

const PLAN_TRACKS: Record<string, string> = {
  sql: "SQL",
  dsa: "DSA",
  "de-concepts": "DE Concepts",
  python: "Python",
  "data-modeling": "Data Modeling",
  pyspark: "PySpark",
  snowflake: "Snowflake",
  airflow: "Airflow",
  aws: "AWS",
  "system-design": "System Design",
  kafka: "Kafka",
  project: "Project / lab",
  review: "Review",
};

type RawPlan = {
  phases: { title: string; goal: string }[];
  days: {
    day: number;
    phase: number;
    week: number;
    theme: string;
    hours: number;
    exercise: string;
    interviewQuestion: string;
    outcome: string;
    weekly?: string;
    monthly?: string;
    tasks: {
      track: string;
      minutes: number;
      kind: PlanTask["kind"];
      items: { topic: string; ref?: string; tracker?: string }[];
      practice?: { title: string; url: string }[];
    }[];
  }[];
};

/** The generated 90-day plan, with tracker topics and course lessons linked to their existing pages. */
export async function planDays(): Promise<PlanDay[]> {
  const raw = plan as unknown as RawPlan;
  const lookup = new Map<string, TopicRow>();
  for (const tracker of TRACKERS) {
    for (const row of await trackerRows(tracker.id)) lookup.set(keyOf(tracker.id, row.topic), row);
  }
  const byRef = new Map((await getAllContent()).map((item) => [item.ref, item]));
  return raw.days.map((day) => ({
    day: day.day,
    week: day.week,
    phase: raw.phases[day.phase - 1].title,
    phaseGoal: raw.phases[day.phase - 1].goal,
    theme: day.theme,
    hours: day.hours,
    exercise: day.exercise,
    interviewQuestion: day.interviewQuestion,
    outcome: day.outcome,
    weekly: day.weekly,
    monthly: day.monthly,
    tasks: day.tasks.map((task) => ({
      track: PLAN_TRACKS[task.track] ?? task.track,
      minutes: task.minutes,
      kind: task.kind,
      practice: task.practice,
      topics: task.items.map((item) => {
        const row = item.tracker ? lookup.get(keyOf(item.tracker, item.topic)) : undefined;
        const page = item.ref ? byRef.get(item.ref) : undefined;
        const trackerKey = item.tracker ? keyOf(item.tracker, item.topic) : undefined;
        return {
          topic: item.topic,
          key: trackerKey ?? (item.ref ? `${task.track}:${slug(item.topic)}` : undefined),
          ref: item.ref,
          href: row?.href ?? page?.url,
        };
      }),
    })),
  }));
}

/** One row of a Practice tab: a DataDank problem page, or a practice-only problem awaiting its write-up. */
export type PracticeRow = {
  title: string;
  difficulty: string;
  /** DataDank solution page, when written. */
  url?: string;
  /** Key for the done tick (the solution page's address, so ticks carry over once it is written). */
  doneUrl: string;
  practice?: { platform: string; number?: number; title: string; url: string };
};
export type PracticeSection = { name?: string; rows: PracticeRow[] };
export type PracticeGroup = {
  name: string;
  lesson?: { url: string; title: string };
  sections: PracticeSection[];
};

type QLike = {
  ref: string;
  id: string;
  url: string;
  title: string;
  entry: { data: { difficulty: string; practice?: PracticeRow["practice"] } };
};
const rowOf = (q: QLike): PracticeRow => ({
  title: q.title.split(":")[0],
  difficulty: q.entry.data.difficulty,
  url: q.url,
  doneUrl: q.url,
  practice: q.entry.data.practice,
});

/**
 * A course's problems grouped for its Practice tab. DSA follows the planner list (curriculum.json): topic sections
 * in learning order, each split into pattern subfolders, including practice-only problems without a DataDank page.
 * SQL splits core questions from business case studies; anything unlisted comes last.
 */
export async function practiceGroups<Q extends QLike>(
  tech: string,
  questions: Q[],
): Promise<PracticeGroup[]> {
  const byRef = new Map(questions.map((q) => [q.ref, q]));
  const used = new Set<string>();
  const groups: PracticeGroup[] = [];
  const pages = new Map((await getAllContent()).map((i) => [i.ref, i]));
  if (tech === "dsa") {
    const lessonVotes = new Map<string, Map<string, number>>();
    for (const it of (curriculum as unknown as Raw).dsa?.items ?? []) {
      const q = it.question ? byRef.get(it.question) : undefined;
      if (q && used.has(q.ref)) continue;
      let row: PracticeRow | undefined;
      if (q) {
        row = rowOf(q);
        used.add(q.ref);
      } else if (it.slug && it.practice) {
        const pr = it.practice;
        row = {
          title: it.topic,
          difficulty: it.difficulty,
          doneUrl: `/interview/dsa/${it.slug}/`,
          practice: {
            platform: pr.platform,
            title: pr.title,
            url: pr.url,
            number: pr.number ?? undefined,
          },
        };
      }
      if (!row) continue;
      let g = groups.find((x) => x.name === it.category);
      if (!g) groups.push((g = { name: it.category, sections: [] }));
      const pattern = it.pattern ?? "";
      let sec = g.sections.find((x) => (x.name ?? "") === pattern);
      if (!sec) g.sections.push((sec = { name: pattern || undefined, rows: [] }));
      sec.rows.push(row);
      if (it.lesson) {
        const votes = lessonVotes.get(g.name) ?? new Map<string, number>();
        votes.set(it.lesson, (votes.get(it.lesson) ?? 0) + 1);
        lessonVotes.set(g.name, votes);
      }
    }
    // Each topic links the pattern lesson most of its problems belong to.
    for (const g of groups) {
      const votes = [...(lessonVotes.get(g.name) ?? new Map()).entries()].sort(
        (a, b) => b[1] - a[1],
      );
      const lesson = votes.length ? pages.get(votes[0][0]) : undefined;
      if (lesson) g.lesson = { url: lesson.url, title: lesson.title };
    }
  } else if (tech === "sql") {
    const core = questions.filter((q) => !q.id.endsWith("-sql-case-study"));
    const cases = questions.filter((q) => q.id.endsWith("-sql-case-study"));
    if (core.length)
      groups.push({ name: "Core SQL interview questions", sections: [{ rows: core.map(rowOf) }] });
    if (cases.length)
      groups.push({ name: "Business case studies", sections: [{ rows: cases.map(rowOf) }] });
    questions.forEach((q) => used.add(q.ref));
  }
  const rest = questions.filter((q) => !used.has(q.ref));
  if (rest.length)
    groups.push({
      name: groups.length ? "More questions" : "Questions",
      sections: [{ rows: rest.map(rowOf) }],
    });
  return groups;
}

/**
 * Learning order for a course's interview questions, when the planner defines one (DSA: topic from basic to
 * advanced, then Easy → Medium → Hard, as listed in curriculum.json). Maps question ref → position and topic.
 */
export function questionOrder(tech: string): Map<string, { index: number; topic: string }> {
  const order = new Map<string, { index: number; topic: string }>();
  if (tech !== "dsa") return order;
  for (const it of (curriculum as unknown as Raw).dsa?.items ?? []) {
    if (it.question && !order.has(it.question))
      order.set(it.question, { index: order.size, topic: it.category });
  }
  return order;
}

/** Sorts questions into the planner's learning order when one exists; otherwise returns them unchanged. */
export function inLearningOrder<Q extends { ref: string }>(tech: string, questions: Q[]): Q[] {
  const order = questionOrder(tech);
  if (!order.size) return questions;
  const pos = (q: Q) => order.get(q.ref)?.index ?? Number.MAX_SAFE_INTEGER;
  return [...questions].sort((a, b) => pos(a) - pos(b));
}

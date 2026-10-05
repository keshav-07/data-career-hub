import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** Reference to another content item: "<collection>:<id>", e.g. "articles:sql/window-functions". */
const ref = z
  .string()
  .regex(
    /^[a-z-]+:[a-z0-9-]+(\/[a-z0-9-]+)*$/,
    'Use "<collection>:<id>", e.g. "articles:sql/joins"',
  );

const source = z.object({ label: z.string().min(2), url: z.url() });
const difficulty = z.enum(["Beginner", "Intermediate", "Advanced"]);
const status = z.enum(["draft", "published"]);

const shared = {
  title: z.string().min(10).max(110),
  description: z.string().min(80).max(200),
  inventoryId: z
    .string()
    .regex(/^[A-Z]+-\d{2}$/)
    .optional(),
  status: status.default("published"),
  technology: z.array(z.string()).min(1),
  topic: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  audience: z.array(z.string()).default(["aspiring-data-engineer"]),
  author: z.string().default("Data Career Hub Editorial"),
  publishedDate: z.coerce.date(),
  updatedDate: z.coerce.date(),
  reviewedDate: z.coerce.date(),
  featured: z.boolean().default(false),
  seoTitle: z.string().max(52).optional(),
  seoDescription: z.string().min(80).max(170).optional(),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  prerequisites: z.array(ref).default([]),
  related: z.array(ref).default([]),
  next: ref.optional(),
  previous: ref.optional(),
  versionContext: z.string().optional(),
  sources: z.array(source).default([]),
};

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: z.object({
    ...shared,
    kind: z.enum(["article", "tutorial"]).default("article"),
    section: z.enum(["learn", "career"]).default("learn"),
    difficulty,
    pillar: z.boolean().default(false),
    learningObjectives: z.array(z.string()).default([]),
  }),
});

const interviewQuestions = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/interview-questions" }),
  schema: z.object({
    ...shared,
    questionType: z.array(
      z.enum(["conceptual", "coding", "scenario", "debugging", "architecture", "optimization"]),
    ),
    difficulty: z.enum(["Easy", "Medium", "Hard"]),
    estimatedMinutes: z.number().int().min(2).max(30),
    interviewRelevance: z.enum(["High", "Medium", "Foundational"]),
    evidenceStatus: z
      .enum(["verified-attributed", "reported", "commonly-reported", "representative"])
      .default("representative"),
    shortAnswer: z.string().min(60).max(800),
    followUps: z.array(z.string()).default([]),
  }),
});

const companyGuides = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/company-guides" }),
  schema: z.object({
    ...shared,
    company: z.string(),
    evidenceNote: z.string().min(40),
    verifiedSources: z.array(source).default([]),
    commonTopics: z
      .array(
        z.object({
          topic: z.string(),
          basis: z.enum(["verified-attributed", "commonly-reported"]),
          source: source.optional(),
        }),
      )
      .default([]),
    reportedQuestions: z.array(z.object({ question: z.string(), source })).default([]),
    representativeQuestions: z.array(z.string()).default([]),
  }),
});

const stage = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  why: z.string().optional(),
  estimatedEffort: z.string(),
  prerequisites: z.array(z.string()).default([]),
  resources: z.array(ref).default([]),
  outcome: z.string(),
  href: z.string().optional(),
});

const roadmaps = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/roadmaps" }),
  schema: z.object({
    ...shared,
    roadmapType: z.enum(["data-engineer", "study-plan", "career-transition"]),
    difficulty,
    stages: z.array(stage).min(3),
  }),
});

const systemDesigns = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/system-designs" }),
  schema: z.object({
    ...shared,
    difficulty,
    problem: z.string(),
    functionalRequirements: z.array(z.string()).min(2),
    nonFunctionalRequirements: z.array(z.string()).min(2),
    scaleAssumptions: z.array(z.string()).min(1),
    architectureSummary: z.string(),
    technologies: z.array(z.string()).min(1),
    tradeoffs: z
      .array(
        z.object({
          decision: z.string(),
          alternative: z.string(),
          reason: z.string(),
          consequence: z.string(),
        }),
      )
      .min(1),
    interviewFollowUps: z.array(z.string()).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    ...shared,
    level: difficulty,
    problemStatement: z.string(),
    requirements: z.array(z.string()).min(2),
    technologies: z.array(z.string()).min(1),
    dataset: z.string().optional(),
    steps: z.array(z.string()).min(3),
    testing: z.array(z.string()).default([]),
    monitoring: z.array(z.string()).default([]),
    dataQuality: z.array(z.string()).default([]),
    costConsiderations: z.array(z.string()).default([]),
    interviewQuestions: z.array(z.string()).default([]),
    resumeBullets: z.array(z.string()).default([]),
    extensions: z.array(z.string()).default([]),
  }),
});

const cheatSheets = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/cheat-sheets" }),
  schema: z.object({
    ...shared,
    cheatTopic: z.string(),
  }),
});

const technologies = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/technologies" }),
  schema: z.object({
    title: z.string(),
    shortName: z.string(),
    description: z.string().min(80).max(200),
    group: z.enum(["languages", "processing", "platforms", "streaming"]),
    order: z.number().int(),
    keyFacts: z.array(z.string()).min(1),
    whatToLearnFirst: z.array(ref).default([]),
    relatedTechnologies: z.array(z.string()).default([]),
    cheatSheet: ref.optional(),
    /** Explicit lesson order for the course. Articles in the folder that are not listed are appended by difficulty. */
    lessons: z.array(ref).default([]),
    /** Short label for course tiles, e.g. "SQL" or "Py". */
    monogram: z.string().max(4).optional(),
    updatedDate: z.coerce.date(),
  }),
});

export const collections = {
  articles,
  "interview-questions": interviewQuestions,
  "company-guides": companyGuides,
  roadmaps,
  "system-designs": systemDesigns,
  projects,
  "cheat-sheets": cheatSheets,
  technologies,
};

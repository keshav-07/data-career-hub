export const SITE = {
  name: "DataDank",
  tagline: "A structured 90-day plan for Data Engineering interviews.",
  description:
    "DataDank is a 90-day plan and complete study hub for Data Engineering interviews: SQL, Spark, Kafka, Airflow, AWS, data modeling, DSA and system design.",
  // Public contact route for corrections and feedback (docs/DECISIONS.md D-012).
  contactEmail: "keshavkrsharma2@gmail.com" as string,
  social: [] as { label: string; url: string }[],
  defaultOgImage: "/og/default.png",
  locale: "en",
};

export const GOALS = [
  { label: "Learn", href: "/data-engineering/" },
  { label: "Interview", href: "/interview/" },
  { label: "Roadmaps", href: "/roadmaps/" },
  { label: "Planner", href: "/planner/" },
  { label: "Projects", href: "/projects/" },
  { label: "Career", href: "/career/" },
  { label: "Resources", href: "/resources/" },
] as const;

export const POPULAR_TECH = ["sql", "python", "pyspark", "spark", "kafka", "airflow"] as const;

export const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Learn",
    links: [
      { label: "Data Engineering", href: "/data-engineering/" },
      { label: "SQL", href: "/sql/" },
      { label: "PySpark", href: "/pyspark/" },
      { label: "Kafka", href: "/kafka/" },
    ],
  },
  {
    title: "Interview",
    links: [
      { label: "Interview overview", href: "/interview/" },
      { label: "Company preparation", href: "/interview/companies/" },
      { label: "System design", href: "/data-engineering/system-design/" },
    ],
  },
  {
    title: "Projects",
    links: [{ label: "All projects", href: "/projects/" }],
  },
  {
    title: "Career",
    links: [
      { label: "Career hub", href: "/career/" },
      { label: "Roadmaps", href: "/roadmaps/" },
      { label: "Planner", href: "/planner/" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Cheat sheets", href: "/resources/" },
      { label: "Search", href: "/search/" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "About", href: "/about/" },
      { label: "Contact", href: "/contact/" },
      { label: "Privacy", href: "/privacy/" },
      { label: "Terms", href: "/terms/" },
      { label: "Disclaimer", href: "/disclaimer/" },
    ],
  },
];

/**
 * Controlled vocabulary for `technology` frontmatter that does not have its own hub (yet).
 * Hubs only exist for entries in the `technologies` collection: no empty hubs.
 */
export const EXTRA_TECHNOLOGY_TERMS = [
  "databricks",
  "snowflake",
  "dbt",
  "aws",
  "azure",
  "gcp",
  "cloud",
  "data-lakes",
  "git",
  "linux",
  "apis",
  "data-engineering",
  "system-design",
  "dsa",
  "career",
] as const;

export const TECH_GROUP_LABELS: Record<string, string> = {
  languages: "Languages & query",
  processing: "Distributed processing",
  platforms: "Data platforms",
  streaming: "Streaming & orchestration",
  cloud: "Cloud",
  foundations: "Interview foundations",
};

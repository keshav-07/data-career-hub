import { getCollection, type CollectionEntry } from "astro:content";
import { EXTRA_TECHNOLOGY_TERMS } from "../data/site";
import { readingMinutes } from "./dates";
import { validateContent } from "./validation";

export type CollectionName =
  | "articles"
  | "interview-questions"
  | "company-guides"
  | "roadmaps"
  | "system-designs"
  | "projects"
  | "cheat-sheets"
  | "technologies";

type Common = {
  /** "<collection>:<id>" */
  ref: string;
  id: string;
  url: string;
  title: string;
  description: string;
  typeLabel: string;
  technology: string[];
  difficulty?: string;
  updatedDate: Date;
  minutes: number;
  body: string;
};

export type Item = {
  [K in CollectionName]: Common & { collection: K; entry: CollectionEntry<K> };
}[CollectionName];

export type ItemOf<K extends CollectionName> = Extract<Item, { collection: K }>;

const COLLECTIONS: CollectionName[] = [
  "articles",
  "interview-questions",
  "company-guides",
  "roadmaps",
  "system-designs",
  "projects",
  "cheat-sheets",
  "technologies",
];

export function urlFor(collection: CollectionName, entry: CollectionEntry<CollectionName>): string {
  const id = entry.id;
  switch (collection) {
    case "articles":
      return `/${id}/`;
    case "interview-questions":
      return `/interview/${id}/`;
    case "company-guides":
      return `/interview/companies/${id}/`;
    case "roadmaps":
      return (entry.data as { roadmapType: string }).roadmapType === "data-engineer"
        ? "/data-engineering/roadmap/"
        : `/roadmaps/${id}/`;
    case "system-designs":
      return `/data-engineering/system-design/${id}/`;
    case "projects":
      return `/projects/${id}/`;
    case "cheat-sheets":
      return `/resources/cheat-sheets/${id}/`;
    case "technologies":
      return `/${id}/`;
  }
}

function typeLabel(collection: CollectionName, entry: CollectionEntry<CollectionName>): string {
  switch (collection) {
    case "articles": {
      const d = entry.data as { kind: string; section: string };
      if (d.section === "career") return "Career guide";
      return d.kind === "tutorial" ? "Tutorial" : "Article";
    }
    case "interview-questions":
      return "Interview question";
    case "company-guides":
      return "Company guide";
    case "roadmaps":
      return "Roadmap";
    case "system-designs":
      return "System design";
    case "projects":
      return "Project";
    case "cheat-sheets":
      return "Cheat sheet";
    case "technologies":
      return "Technology hub";
  }
}

let cache: Promise<Item[]> | undefined;

async function load(): Promise<Item[]> {
  const items: Item[] = [];
  const includeDrafts = import.meta.env.DEV;
  for (const name of COLLECTIONS) {
    const entries = await getCollection(name);
    for (const entry of entries) {
      const data = entry.data as Record<string, unknown>;
      if (!includeDrafts && data.status === "draft") continue;
      const technology =
        name === "technologies" ? [entry.id] : ((data.technology as string[] | undefined) ?? []);
      const diff = (data.difficulty as string | undefined) ?? (data.level as string | undefined);
      const body = entry.body ?? "";
      const common: Common = {
        ref: `${name}:${entry.id}`,
        id: entry.id,
        url: urlFor(name, entry as CollectionEntry<CollectionName>),
        title: String(data.title),
        description: String(data.description),
        typeLabel: typeLabel(name, entry as CollectionEntry<CollectionName>),
        technology,
        difficulty: diff,
        updatedDate: data.updatedDate as Date,
        minutes: readingMinutes(body),
        body,
      };
      items.push({ ...common, collection: name, entry } as Item);
    }
  }
  validateContent(
    items,
    new Set([
      ...items.filter((i) => i.collection === "technologies").map((i) => i.id),
      ...EXTRA_TECHNOLOGY_TERMS,
    ]),
  );
  return items;
}

export function getAllContent(): Promise<Item[]> {
  cache ??= load();
  return cache;
}

export async function getItems<K extends CollectionName>(collection: K): Promise<ItemOf<K>[]> {
  const all = await getAllContent();
  return all.filter((i): i is ItemOf<K> => i.collection === collection);
}

export async function getByRef(ref: string): Promise<Item | undefined> {
  return (await getAllContent()).find((i) => i.ref === ref);
}

export async function getByUrl(url: string): Promise<Item | undefined> {
  return (await getAllContent()).find((i) => i.url === url);
}

export function sortByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}

export async function techLabel(slug: string): Promise<string> {
  const t = (await getItems("technologies")).find((i) => i.id === slug);
  if (t) return t.entry.data.shortName;
  const map: Record<string, string> = {
    "data-engineering": "Data Engineering",
    "system-design": "System design",
    dsa: "DSA",
    gcp: "GCP",
    aws: "AWS",
    dbt: "dbt",
    apis: "APIs",
  };
  return map[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export async function getHub(slug: string): Promise<ItemOf<"technologies"> | undefined> {
  return (await getItems("technologies")).find((t) => t.id === slug);
}

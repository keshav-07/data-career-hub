import type { Item } from "./content";

const RESERVED_TOP_LEVEL = new Set([
  "data-engineering",
  "interview",
  "projects",
  "career",
  "resources",
  "roadmaps",
  "planner",
  "search",
  "about",
  "contact",
  "privacy",
  "terms",
  "disclaimer",
  "404",
  "pagefind",
  "og",
  "images",
  "diagrams",
]);

// Bracketed placeholders such as [X%] or [your name]; Markdown link text "[...](" is not a placeholder.
const PLACEHOLDER =
  /lorem ipsum|\bTODO\b|\bTBD\b|\[(?:X|N)\s*%?\](?!\()|\[\d+\s*%\](?!\()|\[(?:company|your)[^\]]*\](?!\()/i;

/**
 * Build-time content validation. Errors fail the build; warnings are logged.
 * Covers: duplicate URLs, unknown technologies, unresolved references, slug/URL rules,
 * date sanity, placeholder text, and company-evidence rules.
 */
export function validateContent(items: Item[], technologyVocab: Set<string>): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const refs = new Map(items.map((i) => [i.ref, i]));
  const hubs = new Set(items.filter((i) => i.collection === "technologies").map((i) => i.id));

  const seenUrls = new Map<string, string>();
  for (const item of items) {
    const prior = seenUrls.get(item.url);
    if (prior) errors.push(`Duplicate URL ${item.url}: ${prior} and ${item.ref}`);
    seenUrls.set(item.url, item.ref);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(item.id)) {
      errors.push(`${item.ref}: id must be lowercase words separated by hyphens`);
    }

    const data = item.entry.data as Record<string, unknown>;

    for (const tech of item.technology) {
      if (!technologyVocab.has(tech)) {
        errors.push(`${item.ref}: unknown technology "${tech}"`);
      }
    }

    const refFields = ["prerequisites", "related"] as const;
    for (const field of refFields) {
      for (const r of (data[field] as string[] | undefined) ?? []) {
        if (!refs.has(r)) errors.push(`${item.ref}: ${field} → "${r}" does not resolve`);
        if (r === item.ref) errors.push(`${item.ref}: ${field} references itself`);
      }
    }
    for (const field of ["next", "previous", "cheatSheet"] as const) {
      const r = data[field] as string | undefined;
      if (r && !refs.has(r)) errors.push(`${item.ref}: ${field} → "${r}" does not resolve`);
    }

    const published = data.publishedDate as Date | undefined;
    const updated = data.updatedDate as Date | undefined;
    if (published && updated && updated < published) {
      errors.push(`${item.ref}: updatedDate is before publishedDate`);
    }

    if (PLACEHOLDER.test(item.body) || PLACEHOLDER.test(item.description)) {
      errors.push(`${item.ref}: contains placeholder text (TODO/TBD/lorem/[X%])`);
    }

    switch (item.collection) {
      case "articles": {
        const d = item.entry.data;
        const prefix = item.id.split("/")[0];
        if (d.section === "career") {
          if (prefix !== "career")
            errors.push(`${item.ref}: career articles must live in articles/career/`);
        } else if (prefix !== d.technology[0] || !hubs.has(prefix)) {
          errors.push(
            `${item.ref}: folder "${prefix}" must equal technology[0] ("${d.technology[0]}") and have a technology hub`,
          );
        }
        if (item.id.split("/").length !== 2) errors.push(`${item.ref}: expected <folder>/<slug>`);
        break;
      }
      case "interview-questions": {
        const prefix = item.id.split("/")[0];
        if (prefix !== item.entry.data.technology[0]) {
          errors.push(`${item.ref}: folder must equal technology[0]`);
        }
        if (item.id.split("/").length !== 2)
          errors.push(`${item.ref}: expected <technology>/<slug>`);
        break;
      }
      case "technologies": {
        if (RESERVED_TOP_LEVEL.has(item.id))
          errors.push(`${item.ref}: slug collides with a reserved route`);
        for (const r of item.entry.data.whatToLearnFirst) {
          if (!refs.has(r)) errors.push(`${item.ref}: whatToLearnFirst → "${r}" does not resolve`);
        }
        for (const r of item.entry.data.lessons) {
          if (!refs.has(r)) errors.push(`${item.ref}: lessons → "${r}" does not resolve`);
          else if (!r.startsWith(`articles:${item.id}/`))
            errors.push(`${item.ref}: lesson "${r}" is not in articles/${item.id}/`);
        }
        for (const t of item.entry.data.relatedTechnologies) {
          if (!hubs.has(t) && !technologyVocab.has(t))
            errors.push(`${item.ref}: unknown related technology "${t}"`);
        }
        break;
      }
      case "roadmaps": {
        for (const s of item.entry.data.stages) {
          for (const r of s.resources) {
            if (!refs.has(r))
              errors.push(`${item.ref}: stage "${s.id}" resource "${r}" does not resolve`);
          }
        }
        if (
          item.entry.data.roadmapType === "data-engineer" &&
          item.id !== "data-engineer-roadmap"
        ) {
          errors.push(
            `${item.ref}: the canonical data-engineer roadmap must be "data-engineer-roadmap"`,
          );
        }
        break;
      }
      case "company-guides": {
        // Evidence rule: a guide may only render attributed reports; every one carries a source (schema-enforced).
        const d = item.entry.data;
        for (const t of d.commonTopics) {
          if (t.basis === "commonly-reported" && !t.source) {
            warnings.push(`${item.ref}: commonly-reported topic "${t.topic}" has no source`);
          }
        }
        if (/actual\s+\w+\s+(interview\s+)?question/i.test(item.body)) {
          errors.push(`${item.ref}: do not describe questions as "actual" company questions`);
        }
        break;
      }
      default:
        break;
    }

    if (item.description.length < 100 || item.description.length > 170) {
      warnings.push(
        `${item.ref}: description is ${item.description.length} chars (target ~140–165)`,
      );
    }
  }

  const inbound = new Map<string, number>();
  for (const item of items) {
    const data = item.entry.data as Record<string, unknown>;
    const out = [
      ...((data.related as string[]) ?? []),
      ...((data.prerequisites as string[]) ?? []),
      ...(data.next ? [data.next as string] : []),
      ...(data.previous ? [data.previous as string] : []),
      ...((data.whatToLearnFirst as string[]) ?? []),
    ];
    if (item.collection === "roadmaps") {
      for (const s of item.entry.data.stages) out.push(...s.resources);
    }
    for (const r of out) inbound.set(r, (inbound.get(r) ?? 0) + 1);
  }
  for (const item of items) {
    if (item.collection !== "technologies" && !inbound.get(item.ref)) {
      warnings.push(`${item.ref}: no explicit inbound reference (reachable via listings only)`);
    }
  }

  for (const w of warnings) console.warn(`[content] warning: ${w}`);
  if (errors.length) {
    throw new Error(`Content validation failed (${errors.length}):\n - ${errors.join("\n - ")}`);
  }
}

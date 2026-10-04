// Reconciles docs/content-inventory.json (the 138-item launch inventory) with content files.
// Every content file's `inventoryId` must exist in the inventory; every inventory item with a file is reported.
// Usage: node scripts/check-inventory.mjs [--write]   (--write updates slug/status for items that now have files)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const invPath = join(root, "docs/content-inventory.json");
const inv = JSON.parse(readFileSync(invPath, "utf8"));
const contentDir = join(root, "src/content");
const walk = (d) =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  );

const urlFor = (collection, id, fm) => {
  switch (collection) {
    case "articles":
      return `/${id}/`;
    case "interview-questions":
      return `/interview/${id}/`;
    case "company-guides":
      return `/interview/companies/${id}/`;
    case "roadmaps":
      return /roadmapType:\s*"?data-engineer"?\s*$/m.test(fm)
        ? "/data-engineering/roadmap/"
        : `/roadmaps/${id}/`;
    case "system-designs":
      return `/data-engineering/system-design/${id}/`;
    case "projects":
      return `/projects/${id}/`;
    case "cheat-sheets":
      return `/resources/cheat-sheets/${id}/`;
    default:
      return null;
  }
};

const found = new Map();
const errors = [];
for (const file of walk(contentDir).filter((f) => /\.mdx?$/.test(f))) {
  const rel = relative(contentDir, file);
  const [collection, ...rest] = rel.split("/");
  const id = rest.join("/").replace(/\.mdx?$/, "");
  const fm = readFileSync(file, "utf8").split("---")[1] ?? "";
  const iid = fm.match(/^inventoryId:\s*"?([A-Z]+-\d{2})"?/m)?.[1];
  if (!iid) continue;
  if (found.has(iid)) errors.push(`${iid} used by both ${found.get(iid).rel} and ${rel}`);
  const draft = /^status:\s*"?draft"?/m.test(fm);
  found.set(iid, { rel, url: urlFor(collection, id, fm), draft });
}

const ids = new Set(inv.items.map((i) => i.id));
for (const iid of found.keys())
  if (!ids.has(iid)) errors.push(`content uses unknown inventoryId ${iid}`);

const write = process.argv.includes("--write");
const counts = {};
for (const item of inv.items) {
  const f = found.get(item.id);
  if (f && write) {
    item.slug = f.url;
    if (item.status === "PLANNED") item.status = "DRAFTED";
  }
  counts[item.status] = (counts[item.status] ?? 0) + 1;
}
if (write) writeFileSync(invPath, JSON.stringify(inv, null, 2) + "\n");

const byType = {};
for (const item of inv.items) {
  byType[item.type] ??= { total: 0, withContent: 0 };
  byType[item.type].total++;
  if (found.has(item.id)) byType[item.type].withContent++;
}
console.log(`Inventory: ${inv.items.length} items. With content files: ${found.size}.`);
for (const [t, c] of Object.entries(byType))
  console.log(`  ${t.padEnd(20)} ${c.withContent}/${c.total}`);
console.log("Status counts:", counts);
if (errors.length) {
  errors.forEach((e) => console.error("error:", e));
  process.exit(1);
}

# Content authoring guide

Content lives in `src/content/<collection>/`. Adding a page never requires editing component code:
create the file, run `npm run build`, and the page, hub listings, related links, search index and sitemap update.

## Where files go and what URL they get

| Collection | File | URL |
|---|---|---|
| `technologies` | `technologies/<tech>.md` | `/<tech>/` (technology hub) |
| `articles` (learn) | `articles/<tech>/<slug>.mdx` | `/<tech>/<slug>/` |
| `articles` (career) | `articles/career/<slug>.mdx` with `section: "career"` | `/career/<slug>/` |
| `interview-questions` | `interview-questions/<tech>/<slug>.md` | `/interview/<tech>/<slug>/` |
| `company-guides` | `company-guides/<company>.md` | `/interview/companies/<company>/` |
| `roadmaps` | `roadmaps/<slug>.md` | `/roadmaps/<slug>/` (the canonical roadmap is `/data-engineering/roadmap/`) |
| `system-designs` | `system-designs/<slug>.md` | `/data-engineering/system-design/<slug>/` |
| `projects` | `projects/<slug>.md` | `/projects/<slug>/` |
| `cheat-sheets` | `cheat-sheets/<slug>.md` | `/resources/cheat-sheets/<slug>/` |

Slugs are lowercase words separated by hyphens. Once published, a URL is permanent; if it must change,
add a 301 in `public/_redirects`.

## Courses

Each technology file (`src/content/technologies/<tech>.md`) is a course. Its `lessons` list sets the lesson order,
for example `lessons: ["articles:sql/sql-fundamentals", "articles:sql/joins"]`; `monogram` is the short label on the
course tile. Lessons are grouped into modules automatically: pillar guides go in "Start here", the rest by difficulty.
A new article in the folder that is not in `lessons` is still added to the course, after the listed lessons.

## Shared frontmatter

```yaml
title: "PySpark Window Functions: Ranking, Lag and Running Totals"   # becomes the H1
seoTitle: "PySpark Window Functions: Ranking, Lag, Totals"            # optional, ≤ 52 chars before the site suffix
description: "140–165 characters that say what the reader gets."      # meta description and deck
inventoryId: "TECH-14"            # ties the page to docs/content-inventory.json
technology: ["pyspark", "spark"]  # first entry is the primary technology (and folder)
topic: ["window-functions"]
difficulty: "Intermediate"        # Beginner | Intermediate | Advanced (questions: Easy | Medium | Hard)
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
prerequisites: ["articles:sql/window-functions"]
related: ["articles:spark/partitions-shuffles-skew", "interview-questions:pyspark/broadcast-join"]
next: "articles:spark/partitions-shuffles-skew"
previous: "articles:sql/window-functions"
versionContext: "Examples run on PySpark 4.2"
sources:
  - { label: "Apache Spark documentation: Window functions", url: "https://spark.apache.org/docs/latest/..." }
```

References use `"<collection>:<id>"`. Related links are shown on both pages automatically.
The full schema for each collection is in `src/content.config.ts`.

### External practice links (interview questions)

An interview question may carry **one** `practice` link to the same problem on a judge site, shown as
"Practise it yourself" under the short answer:

```yaml
practice: { "platform": "LeetCode", "number": 1, "title": "Two Sum", "url": "https://leetcode.com/problems/two-sum/" }
```

- Prefer LeetCode or DataLemur. Use GeeksforGeeks, HackerRank or CodeChef only when the problem is missing there
  or is subscription-only (LeetCode Premium), so every reader can open it.
- Add a link only when the platform problem genuinely matches the page (same task and inputs). Case studies and
  conceptual questions usually have none.
- Verify the URL before adding it, from the platform's own page or a search result that shows that exact URL and
  title. Do not scrape the platform or call its API.
- `title` is the platform's problem name only. Never copy its problem statement, test cases or editorial; DataDank's
  explanations and solutions stay original.
- The build rejects other platforms and URLs that are not `https` on the platform's own domain.

## MDX components

`.mdx` files may use `<Callout tone="info|success|warning|danger|neutral" title="...">...</Callout>`.
Leave a blank line after the opening tag so Markdown inside it renders. Code fences get a language label,
copy button and keyboard-scrollable region automatically; tables become labelled scroll regions on small screens.

## What fails the build

- Unknown technology or unresolved reference.
- Two items with the same URL, or an article folder that does not match its primary technology.
- `updatedDate` before `publishedDate`.
- Placeholder text: `TODO`, `TBD`, lorem ipsum, `[X%]`-style placeholders.
- A company guide describing a question as an "actual" company question.
- Missing or out-of-range fields (title, description length, enums).

Warnings (build continues) cover descriptions outside 100–170 characters and items with no inbound reference.

## Editorial rules (non-negotiable)

1. Answer the reader's question directly; no padding to reach a word count.
2. Run every code example. Record what it was run on in `versionContext`.
3. Cite official documentation for version-sensitive claims.
4. No invented statistics, testimonials, credentials or company facts.
5. Company guides: **verified/attributed** items need a public source, **reported** questions need a named,
   attributable source, and everything else is a **representative practice question**, labelled as such.
6. Resume bullets in projects must not contain metrics the reader did not measure, and no bracketed placeholders.
7. AI can help with outlines and wording; it never replaces technical verification or editorial review.

## Lifecycle

`PLANNED → DRAFTED → TECHNICALLY REVIEWED → EDITORIALLY/SEO REVIEWED → PUBLISHED`, tracked in
`docs/content-inventory.json`. Run `npm run check:inventory -- --write` after adding content to update slugs and
move new items from PLANNED to DRAFTED. Only a human reviewer moves an item further.
Use `status: "draft"` in frontmatter to keep a page out of production builds (drafts still render in `npm run dev`).

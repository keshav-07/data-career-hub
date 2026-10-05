# Authoring brief: Career Planner curriculum

This brief is for anyone writing curriculum content, human or AI. Read it fully before writing.

The site is Data Career Hub, an Astro static site for aspiring and working Data Engineers. Its owner supplied a
study planner (`Data_Engineer_Career_Transition_Master_Planner.xlsx`). Every topic in it is listed in
`docs/curriculum/curriculum.json`, together with the lesson or page that must cover it. The goal is a one-stop study
resource: each topic gets clear, correct, interview-ready study material, not a stub.

Read these before writing: `docs/CONTENT.md` (schemas, editorial rules), `src/content.config.ts` (exact schema),
and two or three existing pages in the same collection (match their tone and structure).

## 1. Files you own

- Only create or edit the content files assigned to you, plus the technology hub file for your course
  (`src/content/technologies/<tech>.md`) if you are told you own it.
- Record which heading covers each topic in your own file `docs/curriculum/headings/<your-task>.json`:
  `{ "<exact topic name from curriculum.json>": { "ref": "articles:sql/joins", "heading": "<exact H2 text>" } }`.
  Every topic assigned to you must appear exactly once.
- Do not edit components, layouts, `content.config.ts`, `curriculum.json`, other courses' hubs, or the inventory.

## 2. Lesson structure (articles)

Frontmatter: follow existing lessons. Required: `title` (≤110 chars, becomes the H1), `description` (100–170 chars),
`technology` (first item = folder), `topic`, `difficulty`, `publishedDate`/`updatedDate`/`reviewedDate`
("2026-10-05" for new files; for existing files keep `publishedDate` and set `updatedDate`/`reviewedDate` to
"2026-10-05"), `learningObjectives` (3–6 items), `prerequisites`/`related` (refs that exist), `next`/`previous`
(following the course order in curriculum.json), `versionContext` (what the examples were run on, or that they were
not executed and why), and `sources` (2–6 official documentation pages). Add `seoTitle` (≤52 chars) when the title
is longer than about 55 characters. Use `.mdx` when you use `<Callout>`. Do not add `inventoryId` to new files.

Body:
1. A short opening (2–4 sentences): what this lesson covers and why a Data Engineer needs it. No "In this
   article…" padding.
2. A sample-data section when the lesson has runnable code, so readers can follow along.
3. **One `##` section per assigned topic**, in a sensible teaching order. The heading is the topic in natural,
   readable wording (for example "IN, BETWEEN and LIKE", not "IN, BETWEEN, LIKE patterns"). Inside each topic
   section, cover:
   - **What it is and why it matters**, in plain English, before any jargon.
   - **How it works**: mechanics, syntax, defaults and behaviour that matter in practice.
   - **A worked example** with code and its actual output (a small table or result line), where the topic allows.
   - **Pitfalls**: the common mistakes and the edge cases (NULLs, duplicates, ties, empty input, failure modes).
   - **In interviews**: one short paragraph or a few bullets on how it is asked and what a strong answer includes.
   Use `###` sub-headings inside a topic when it helps. Don't force every heading on a tiny topic. Depth should
   match importance: a core topic (window functions, shuffles, exactly-once) deserves several hundred words. A
   small one (aliases) can be short but must still be complete and correct.
4. `## Practice questions`: 4–8 interview-style questions on this lesson. Put each answer in a
   `<details><summary>Question text</summary>…answer…</details>` block (plain HTML works in both .md and .mdx).
5. `## Key takeaways`: 4–7 bullets.

Style:
- British spelling, matching the site ("optimise", "behaviour"), plain direct sentences, second person.
- Tables for comparisons. Callouts sparingly, for warnings that would otherwise cause real bugs.
- No filler, no hype, no emojis, no "In conclusion". Never pad to a word count.
- Never invent statistics, benchmark numbers, company facts or version claims. If you are not sure a default
  value or limit is current, say what to check rather than stating a number.
- Write everything in your own words. Never copy text from documentation, blogs or problem sites.

## 3. Research

Documentation sites cannot be fetched directly from this environment (the network blocks them), but the
**WebSearch** tool works and returns summaries of official pages (load it with ToolSearch `select:WebSearch` if it
is not already available). Use it to check facts that are version-sensitive or easy to get wrong: config names
and defaults, limits, retention periods, pricing models, new or renamed features (for example Airflow 3 Assets
replacing Datasets, Kafka 4 dropping ZooKeeper, Snowflake Snowpipe Streaming, Spark 4 behaviour). Cite the
official pages you relied on in `sources`, giving each a label and URL. Prefer the vendor's own documentation, and
check the URL appears in your search results. Never invent a URL.

## 4. Verify the code

Every runnable example must be executed. Use `python3 scripts/verify-examples.py`:

- SQL: PostgreSQL 16 is the default engine and is already running. Use standard SQL that works there. Put
  `<!-- engine: duckdb -->` on the line above a fence for syntax PostgreSQL lacks (PIVOT/UNPIVOT, QUALIFY), and
  name the dialect in the text. Each file runs against one fresh database in order, so include the
  `CREATE TABLE`/`INSERT` setup in the page.
- Python: `--python /usr/bin/python3` for plain Python. For PySpark use
  `--python /tmp/claude-0/-home-user-sparkcode/2fbb010b-4216-53a7-9bcb-97b9a1ca7ff7/scratchpad/venv/bin/python`
  (PySpark 4.2, Java available; use `SparkSession.builder.master("local[2]")`). For Airflow use
  `.../scratchpad/venv2/bin/python` (Airflow 3.3); DAG files can be checked by importing them and asserting on
  `dag.task_ids`.
- Code you cannot run here (Snowflake SQL, Kafka clients against a broker, AWS CLI/boto3 calls, Kubernetes YAML,
  multi-session locking demos) goes under `<!-- noexec -->`. Write it carefully from the official docs, and say in
  `versionContext` which examples were not executed. If a non-executable concept can be shown with a runnable
  analogue (for example simulating offsets or partitioning in Python), consider adding one.
- Show real output: copy result tables from what the engine printed, not from memory.

## 5. Build and commit

Work in your assigned git worktree, never in `/home/user/data-career-hub`. After each lesson or page:

```
python3 scripts/verify-examples.py <files>          # all blocks pass
npm run build                                        # content validation must pass
node scripts/check-dist.mjs                          # links, anchors, titles, descriptions
git add -A && git commit -m "content(<course>): <what>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FngPiFDNp5EZykHFFJqGXn"
```

Commit after every finished page, so work is not lost. Do not push; the coordinator merges branches. Do not run
`npm install`. `node_modules` is shared through a symlink.

If the build fails because of another page, or because of shared code you don't own, stop and report it rather
than editing shared files.

## 6. Final report

When done, reply with:
- the files created or changed
- any topic you could not cover properly, and why
- which examples were not executed
- facts you were unsure of
- anything the coordinator must change in shared files (for example new technology vocabulary)

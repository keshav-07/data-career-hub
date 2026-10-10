import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(
  await readFile(path.join(root, "docs/curriculum/plan-90-days.json"), "utf8"),
);
const curriculum = JSON.parse(
  await readFile(path.join(root, "docs/curriculum/curriculum.json"), "utf8"),
);
const errors = [];
const fail = (message) => errors.push(message);

async function filesUnder(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(full)));
    else if (/\.mdx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const collectionDirs = {
  articles: "articles",
  "interview-questions": "interview-questions",
  "company-guides": "company-guides",
  roadmaps: "roadmaps",
  "system-designs": "system-designs",
  projects: "projects",
  "cheat-sheets": "cheat-sheets",
  technologies: "technologies",
};
const refs = new Set();
for (const [collection, dir] of Object.entries(collectionDirs)) {
  const contentRoot = path.join(root, "src/content", dir);
  for (const file of await filesUnder(contentRoot)) {
    const id = path
      .relative(contentRoot, file)
      .replace(/\\/g, "/")
      .replace(/\.mdx?$/, "");
    refs.add(`${collection}:${id}`);
  }
}

if (plan.version !== 2) fail("plan version must be 2");
if (plan.days.length !== 90) fail(`expected 90 days, found ${plan.days.length}`);
const dayNumbers = new Set(plan.days.map((day) => day.day));
if (dayNumbers.size !== 90 || [...dayNumbers].some((day, i) => day !== i + 1))
  fail("days must be numbered uniquely from 1 through 90");

const uniqueSql = new Set();
const uniqueDsa = new Set();
const practices = new Set();
const firstSeen = new Map();
const firstTopicDay = new Map();
let totalHours = 0;
let streamingStart;
for (const day of plan.days) {
  totalHours += day.hours;
  const weekend = (day.day - 1) % 7 < 2;
  const expectedHours = weekend ? 6 : 3;
  if (day.hours !== expectedHours) fail(`day ${day.day} should be ${expectedHours} hours`);
  if (!day.theme || !day.exercise || !day.interviewQuestion || !day.outcome)
    fail(`day ${day.day} needs a theme, exercise, interview question and observable outcome`);

  const minutes = day.tasks.reduce((sum, task) => sum + task.minutes, 0);
  if (minutes !== day.hours * 60)
    fail(`day ${day.day} task minutes add to ${minutes}, expected ${day.hours * 60}`);
  const inDay = new Set();
  const tracks = new Set(day.tasks.map((task) => task.track));
  for (const required of ["sql", "dsa", "de-concepts"])
    if (!tracks.has(required)) fail(`day ${day.day} is missing the ${required} track`);

  for (const task of day.tasks) {
    if (!Number.isInteger(task.minutes) || task.minutes < 1)
      fail(`day ${day.day} has an invalid task duration`);
    if (!Array.isArray(task.items) || task.items.length === 0)
      fail(`day ${day.day} has an empty ${task.track} task`);
    for (const item of task.items) {
      const dailyKey = `${task.track}:${item.topic}`;
      if (inDay.has(dailyKey)) fail(`day ${day.day} repeats ${dailyKey}`);
      inDay.add(dailyKey);
      if (item.ref && !refs.has(item.ref))
        fail(`day ${day.day} links to missing content ref ${item.ref}`);
      if (!item.ref) fail(`day ${day.day} topic "${item.topic}" has no lesson or question page`);
      if (item.tracker) {
        const rows = curriculum[item.tracker]?.items ?? [];
        if (!rows.some((row) => row.topic === item.topic))
          fail(`day ${day.day} topic "${item.topic}" is missing from tracker ${item.tracker}`);
        if (item.tracker === "sql") uniqueSql.add(item.topic);
        if (item.tracker === "dsa") uniqueDsa.add(item.topic);
        if (!firstSeen.has(item.tracker)) firstSeen.set(item.tracker, day.day);
      }
      const topicKey = `${task.track}:${item.topic}`;
      firstTopicDay.set(topicKey, Math.min(firstTopicDay.get(topicKey) ?? day.day, day.day));
      if (task.track === "pyspark" && /stream|watermark/i.test(item.topic))
        streamingStart ??= day.day;
    }
    for (const practice of task.practice ?? []) {
      try {
        const url = new URL(practice.url);
        if (url.protocol !== "https:" || url.hostname !== "leetcode.com")
          fail(`day ${day.day} has a non-LeetCode SQL practice URL`);
        const slug = url.pathname.match(/^\/problems\/([^/]+)\/$/)?.[1];
        if (!slug) fail(`day ${day.day} has a malformed LeetCode problem URL`);
        if (practices.has(practice.url)) fail(`duplicate SQL practice URL: ${practice.url}`);
        practices.add(practice.url);
      } catch {
        fail(`day ${day.day} has an invalid SQL practice URL`);
      }
    }
  }
}

if (totalHours !== 348) fail(`expected 348 planned hours, found ${totalHours}`);
if (uniqueSql.size !== 100) fail(`expected 100 unique SQL topics, found ${uniqueSql.size}`);
if (uniqueDsa.size !== curriculum.dsa.items.length)
  fail(
    `expected all ${curriculum.dsa.items.length} DSA problems exactly once, found ${uniqueDsa.size}`,
  );
if (
  new Set(
    plan.days.flatMap((day) =>
      day.tasks
        .filter((task) => task.track === "dsa")
        .flatMap((task) => task.items.map((item) => item.topic)),
    ),
  ).size !== uniqueDsa.size
)
  fail("DSA problems must not repeat across the plan");
if (practices.size !== 55)
  fail(`expected 55 unique LeetCode SQL practice links, found ${practices.size}`);

const dayFor = (track, topic) => firstTopicDay.get(`${track}:${topic}`);
const latest = (requirements) =>
  Math.max(...requirements.map(([track, topic]) => dayFor(track, topic) ?? 0));
const requireBefore = (track, requirements, label) => {
  const starts = firstSeen.get(track);
  const prerequisiteDay = latest(requirements);
  if (!starts || !prerequisiteDay || starts < prerequisiteDay)
    fail(`${track} starts before ${label} is scheduled`);
};
requireBefore(
  "data-modeling",
  [
    ["sql", "INNER JOIN basics"],
    ["sql", "LEFT JOIN basics"],
    ["sql", "RIGHT JOIN & FULL OUTER JOIN"],
    ["sql", "Self Join patterns"],
    ["sql", "Anti-join (NOT EXISTS / LEFT JOIN NULL)"],
    ["sql", "Multi-table joins"],
  ],
  "the SQL join basics",
);
requireBefore(
  "aws",
  [
    ["de-concepts", "CSV and JSON trade-offs"],
    ["de-concepts", "Parquet and columnar storage"],
    ["de-concepts", "Avro and schema evolution"],
    ["de-concepts", "Partitioning and data layout"],
  ],
  "file formats and partitioning",
);
requireBefore(
  "pyspark",
  [
    ["python", "Python for data engineering"],
    ["sql", "Aggregate functions (SUM, AVG, MIN, MAX)"],
  ],
  "Python and SQL aggregation",
);
requireBefore(
  "snowflake",
  [["de-concepts", "Warehouse grain and star schemas"]],
  "warehouse modeling basics",
);
requireBefore("airflow", [["de-concepts", "Idempotent pipeline writes"]], "pipeline idempotency");
requireBefore(
  "system-design",
  [
    ["aws", "S3 buckets & objects"],
    ["de-concepts", "Partitioning and data layout"],
  ],
  "S3, formats and partitioning",
);
requireBefore(
  "kafka",
  [
    ["de-concepts", "Batch versus streaming"],
    ["de-concepts", "Incremental loading and watermarks"],
    ["de-concepts", "Change data capture patterns"],
  ],
  "batch/streaming, incremental loads and CDC",
);
if (
  !dayFor("kafka", "Topic fundamentals") ||
  streamingStart < dayFor("kafka", "Topic fundamentals")
)
  fail("Spark Structured Streaming starts before Kafka topic fundamentals");

const expectedStarts = {
  "data-modeling": 10,
  aws: 11,
  pyspark: 15,
  snowflake: 24,
  airflow: 26,
  "system-design": 27,
  kafka: 43,
};
for (const [track, expected] of Object.entries(expectedStarts)) {
  const actual = firstSeen.get(track);
  if (actual !== expected)
    fail(`${track} should start on day ${expected}, found ${actual ?? "no scheduled topic"}`);
}
if (streamingStart !== 61)
  fail(
    `Spark Structured Streaming should start on day 61, found ${streamingStart ?? "no scheduled topic"}`,
  );

for (const day of [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 90])
  if (!plan.days[day - 1]?.weekly) fail(`day ${day} is missing its weekly milestone`);
for (const day of [30, 60, 90])
  if (!plan.days[day - 1]?.monthly) fail(`day ${day} is missing its monthly review`);

const weeklyTopics = {
  2: ["data-modeling:Grain definition", "data-modeling:Star Schema", "aws:S3 buckets & objects"],
  3: [
    "pyspark:DataFrame API basics",
    "pyspark:Lazy evaluation & DAG",
    "data-modeling:SCD Type 2 (history)",
  ],
  4: [
    "system-design:Design a batch ingestion framework",
    "pyspark:Joins in Spark SQL",
    "pyspark:Reading/writing Parquet",
  ],
  5: [
    "de-concepts:Incremental loading and watermarks",
    "de-concepts:Idempotent pipeline writes",
    "airflow:Backfills & reruns",
  ],
  6: [
    "pyspark:ACID transactions on Delta",
    "snowflake:Snowpipe continuous ingestion",
    "aws:Glue ETL jobs (Spark)",
    "system-design:Design a Lakehouse (bronze/silver/gold)",
  ],
  7: [
    "kafka:At-least-once",
    "snowflake:CDC with streams",
    "airflow:XCom push/pull",
    "aws:Redshift architecture",
  ],
  8: [
    "kafka:Exactly-once semantics (EOS)",
    "kafka:Connect framework",
    "pyspark:AQE (Adaptive Query Execution)",
    "aws:EMR clusters",
    "de-concepts:Pipeline observability",
  ],
  9: [
    "pyspark:Structured Streaming model",
    "pyspark:Watermarking",
    "pyspark:Stateful aggregations",
    "pyspark:Extend the clickstream project with watermarks and stateful aggregation",
    "system-design:Design a clickstream analytics pipeline",
  ],
  10: [
    "snowflake:RBAC model",
    "snowflake:Column-level security / masking",
    "aws:Lake Formation basics",
    "system-design:Design a GDPR/PII compliant pipeline",
    "system-design:Design a data observability system",
  ],
  11: [
    "airflow:LocalExecutor",
    "kafka:Consumer lag",
    "kafka:Rebalancing protocols",
    "system-design:Design a backfill & late-data handling system",
  ],
  12: [
    "system-design:Design a multi-tenant data platform",
    "system-design:Design a data mesh architecture",
    "system-design:Design a unified batch + streaming (Lambda/Kappa)",
    "system-design:Design a feature store",
  ],
  13: [
    "system-design:Record the final project demo and walkthrough",
    "system-design:Polish the resume, portfolio and project README",
  ],
};
for (const [weekText, requiredTopics] of Object.entries(weeklyTopics)) {
  const week = Number(weekText);
  const available = new Set(
    plan.days
      .filter((day) => day.week === week)
      .flatMap((day) =>
        day.tasks.flatMap((task) =>
          task.items.map((item) => `${item.tracker ?? task.track}:${item.topic}`),
        ),
      ),
  );
  for (const topic of requiredTopics)
    if (!available.has(topic)) fail(`week ${week} is missing required topic ${topic}`);
}

if (errors.length) {
  console.error(`Plan check failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    "Plan check passed: 90 days, 348 hours, 100 SQL topics, all DSA problems, and 55 SQL practice links.",
  );
}

# DataDank Curriculum and 90-Day Plan Redesign

> **Implementation status:** The day-by-day schedule below has been encoded in `docs/curriculum/plan-90-days.json` on branch `audit/remediation-oct-2026`. This does not mean every linked lesson or practice destination has been technically verified. Validate lesson coverage, examples, links, and time estimates before publication.

## Curriculum dependency graph

1. **Orientation and workflow:** terminal basics, files, Git, how to read examples, study/review habits.
2. **SQL foundations:** tables/rows/columns, SELECT, WHERE, expressions, NULL, sorting, DISTINCT, aggregation.
3. **SQL querying:** joins and row multiplication, GROUP BY/HAVING, subqueries/CTEs, set operations, window functions, date/string functions, edge cases.
4. **Python foundations:** values, collections, conditionals, loops, functions, modules, exceptions, files, virtual environments, tests.
5. **DSA interview patterns:** arrays/strings, hash maps/sets, two pointers, sliding window, stacks/queues, binary search, intervals, trees/heaps, graphs, basic dynamic programming. Prioritize patterns relevant to target interviews rather than treating every problem as mandatory.
6. **Data Engineering foundations:** OLTP vs OLAP, data formats, ingestion, ETL/ELT, batch/incremental processing, data quality, idempotency, retries, observability.
7. **Modeling and warehouses:** grain, facts/dimensions, star schema, SCD, partitioning/clustering, warehouse/lake/lakehouse trade-offs.
8. **PySpark:** DataFrames and schemas, transformations/actions, joins/aggregations/windows, null handling, execution plans, partitions/shuffles/skew, caching, incremental loads, testing.
9. **Cloud/platform depth:** object storage, identity/permissions, compute/cost, one warehouse/lakehouse platform; add Snowflake/Databricks only after core concepts.
10. **Orchestration and streaming:** DAG/task fundamentals, scheduling/retries/backfills, Kafka topics/partitions/consumer groups/offsets, delivery semantics, schema evolution, streaming state/late data.
11. **Production readiness:** data contracts, CI/CD, monitoring, privacy/security, incident/debugging, cost/performance trade-offs.
12. **System design and interviews:** clarify requirements, estimate scale, choose storage/compute, define data flow, failure handling, correctness, cost, monitoring, trade-offs; cumulative mocks and project walkthrough.

## Phase-level objectives

| Days | Phase | Primary objective | Gate to move forward |
|---|---|---|---|
| 1–15 | Foundations | Establish SQL basics, Python basics, command line/Git, and core data concepts. | Can query/filter/aggregate a small dataset, write simple Python functions, explain a batch pipeline. |
| 16–30 | Core querying and programming | Joins, CTEs, windows, common DSA patterns, file handling, data modeling. | Solve basic/intermediate tasks independently and explain NULL/duplicate behavior. |
| 31–45 | Pipeline fundamentals | ETL/ELT, batch/incremental loads, idempotency, quality checks, warehouse/lakehouse basics. | Build and test a small rerunnable pipeline with documented assumptions. |
| 46–60 | Distributed processing | PySpark DataFrames, joins, aggregations, execution, partitions/shuffles, practical optimization. | Explain a Spark plan and diagnose a simple skew/shuffle issue. |
| 61–70 | Platform and operations | Cloud permissions/storage, warehouse/lakehouse, orchestration, monitoring, CI/CD basics. | Build or explain a scheduled pipeline with retry, observability, and least-privilege access. |
| 71–78 | Streaming and system design | Kafka/streaming fundamentals, late data, delivery semantics, design trade-offs. | Design a batch or streaming pipeline with failure recovery and data-quality handling. |
| 79–90 | Consolidation and interviews | End-to-end project, revision, timed practice, mocks, weak-area repair, job materials. | Demonstrate a project, pass self-defined mock rubrics, and produce a targeted next-step plan. |

## Individual Day 1–90 schedule

Time ranges are planning estimates for a learner studying alongside a full-time job. Reduce optional tasks if prerequisites are missing; do not treat hours as a guarantee of mastery. The previous planner was 348 hours and was likely too demanding for many learners. The revised implementation targets roughly 2–3 hours on most days, with lighter review days and activity budgets recorded in the JSON.

| Day | Main focus and new capability | Practice / reinforcement | Completion evidence |
|---:|---|---|---|
| 1 | Setup: terminal, editor, Git, learning workflow | Clone project or create practice repo; commit notes | Can run commands and make a commit |
| 2 | Data basics: tables, rows, columns, keys | Identify entities/keys in a sample dataset | Explain primary key vs foreign key |
| 3 | SQL SELECT and aliases | Write 5 simple projections | Correct result columns |
| 4 | SQL WHERE and boolean logic | Filter by ranges, categories, dates | Explain each predicate |
| 5 | ORDER BY, LIMIT, DISTINCT | Sorting and de-duplication exercises | Correct ordering and uniqueness |
| 6 | SQL expressions and CASE | Create derived categories | Handle boundary conditions |
| 7 | Review checkpoint 1 | Mixed SQL quiz and error log | Meet a self-defined accuracy threshold |
| 8 | NULL semantics | IS NULL, COALESCE, three-valued logic | Explain why = NULL is incorrect |
| 9 | Aggregates | COUNT/SUM/AVG/MIN/MAX | Correct aggregates on sample data |
| 10 | GROUP BY and HAVING | Grouped business questions | Explain row-level vs group-level filters |
| 11 | Join foundations | INNER and LEFT JOIN | Predict row counts before running |
| 12 | Join cardinality and duplicates | One-to-many and missing-key exercises | Explain row multiplication |
| 13 | Multi-table joins | Join 3 related tables | Correct keys and result grain |
| 14 | SQL review checkpoint | Mixed query set, fix mistakes | Document top 3 gaps |
| 15 | SQL mini-case | Analyze orders/customers dataset | Save 5 queries with explanations |
| 16 | Python values and types | Small conversion exercises | Explain common types |
| 17 | Lists, tuples, sets, dictionaries | Count/group records in memory | Choose suitable data structure |
| 18 | Conditionals and loops | Filtering and counting exercises | Working script with edge cases |
| 19 | Functions and parameters | Refactor repeated code | Functions have clear inputs/outputs |
| 20 | Strings and comprehensions | Parse simple records | Tests for empty/odd inputs |
| 21 | Python review checkpoint | Short script from scratch | Explain approach without notes |
| 22 | Files and paths | Read/write CSV or text safely | Handles missing/empty file |
| 23 | Exceptions and logging | Add clear error handling | Useful logs; no silent failure |
| 24 | Modules and environments | Organize small project | Reproducible run instructions |
| 25 | Unit testing basics | Test a transformation function | Positive and negative tests |
| 26 | DSA: arrays and strings | Easy pattern problems | Explain complexity at a basic level |
| 27 | Hash maps and sets | Duplicate/counting problems | Explain why lookup helps |
| 28 | Two pointers | Sorted-array/string problems | Correct pointer invariant |
| 29 | Sliding window | Fixed/variable window problem | Explain window movement |
| 30 | Review checkpoint 2 | SQL + Python + DSA timed set | Gap list with next actions |
| 31 | Data Engineering lifecycle | Sources, ingestion, transforms, sinks | Draw a basic batch pipeline |
| 32 | OLTP vs OLAP | Compare transactional and analytical workloads | Choose fit for two scenarios |
| 33 | File formats | CSV, JSON, Parquet trade-offs | Explain schema/compression trade-offs |
| 34 | ETL vs ELT | Choose transformation location | Defend choice with constraints |
| 35 | Data quality | Nulls, uniqueness, ranges, referential checks | Define 5 checks for a dataset |
| 36 | Idempotency | Rerunnable batch load design | Explain duplicate prevention |
| 37 | Retries and failure handling | Failure scenario walkthrough | State safe retry behavior |
| 38 | Incremental loads | Watermarks and updated records | Define checkpoint and replay behavior |
| 39 | CDC fundamentals | Snapshot vs change events | Explain delete/update handling |
| 40 | Data modeling: grain | Declare fact-table grain | State one row's meaning |
| 41 | Facts and dimensions | Build a simple star schema | Identify measures and dimensions |
| 42 | SCD basics | Type 1 vs Type 2 | Select a type for a scenario |
| 43 | Warehouse/lake/lakehouse | Compare storage and compute patterns | Explain trade-offs |
| 44 | SQL CTEs and subqueries | Refactor multi-step analysis | Equivalent results verified |
| 45 | Review checkpoint 3 | Design and implement mini ETL | Diagram, tests, and rerun proof |
| 46 | PySpark mental model | Driver, executors, DataFrames | Explain distributed vs local work |
| 47 | SparkSession and schemas | Read a small dataset | Explicit schema and correct types |
| 48 | DataFrame transformations/actions | Filter/select/withColumn | Distinguish lazy transformation/action |
| 49 | PySpark null and type handling | Clean dirty input | Before/after counts recorded |
| 50 | PySpark aggregations | groupBy and agg | Correct grouped output |
| 51 | PySpark joins | Inner/left joins, duplicate keys | Validate join row counts |
| 52 | PySpark windows | Rank and running totals | Correct partition/order definition |
| 53 | Review checkpoint 4 | Mixed DataFrame exercises | Complete without copying solution |
| 54 | Execution plans | explain(), stages and tasks | Identify at least one exchange |
| 55 | Partitions and shuffles | Narrow vs wide operations | Predict likely shuffle point |
| 56 | Skew and join strategy | Diagnose uneven key distribution | Propose justified mitigation |
| 57 | Caching and persistence | Reuse expensive intermediate results | Explain when caching is harmful |
| 58 | File layout and partitioning | Partitioned reads/writes | Avoid high-cardinality partitioning |
| 59 | Incremental PySpark job | Process only changed/new data | Rerun-safe output |
| 60 | Review checkpoint 5 | Mini pipeline with tests and explain plan | README, tests, and performance notes |
| 61 | Object storage fundamentals | Buckets, prefixes, object layout | Propose folder/file layout |
| 62 | IAM and least privilege | Role/policy scenario | Minimize permissions |
| 63 | Compute and cost | Batch sizing and idle compute | Identify cost drivers |
| 64 | Warehouse/lakehouse platform | Tables, compute, metadata | Explain storage/compute separation |
| 65 | Table transactions and schema evolution | Safe schema change scenario | Define compatibility expectations |
| 66 | Orchestration concepts | DAGs, dependencies, schedules | Draw a simple DAG |
| 67 | Retries, backfills, catchup | Late and failed runs | Avoid duplicate side effects |
| 68 | Monitoring and alerting | Freshness, volume, failure metrics | Define actionable alerts |
| 69 | CI/CD and environments | Dev/test/prod promotion | Describe safe deployment flow |
| 70 | Review checkpoint 6 | Design scheduled production pipeline | Diagram includes access, tests, alerts |
| 71 | Kafka concepts | Topics, partitions, offsets | Explain ordering scope |
| 72 | Producers and consumers | Consumer groups and parallelism | Predict consumption distribution |
| 73 | Delivery semantics | At-most/at-least/exactly-once boundaries | Explain end-to-end caveat |
| 74 | Schema evolution and late data | Compatible schema and event time | Define handling policy |
| 75 | Streaming vs batch | Latency, cost, correctness trade-offs | Choose based on requirements |
| 76 | System design framework | Requirements, scale, data flow, failure | Use a repeatable answer outline |
| 77 | Design case 1: batch ingestion | Idempotency, quality, retries, observability | Present diagram and trade-offs |
| 78 | Design case 2: CDC/streaming | Ordering, replay, deletes, late events | Address failure and recovery |
| 79 | Project scope and dataset | Define use case and success criteria | Written project brief |
| 80 | Project ingestion | Load raw data reproducibly | Raw layer and run instructions |
| 81 | Project transformations | Clean, validate, model data | Tests and data dictionary |
| 82 | Project orchestration | Schedule dependencies and retries | Successful and failed-run evidence |
| 83 | Project observability | Logs, metrics, freshness, alerts | Demonstrate failure diagnosis |
| 84 | Project performance review | Inspect plan and bottlenecks | Evidence-based optimization note |
| 85 | SQL interview revision | Timed mixed SQL set | Score and error log |
| 86 | DSA interview revision | Select high-yield patterns | Explain solutions and complexity |
| 87 | Data Engineering interview revision | Idempotency, CDC, file formats, modeling | Concise spoken answers |
| 88 | System design mock | One timed end-to-end case | Score against rubric |
| 89 | Project walkthrough and behavioral stories | Explain architecture, trade-offs, failures | 5–10 minute project narrative |
| 90 | Final assessment and next-step plan | Full mock, weak-area prioritization, resume/job plan | Evidence-based readiness report; no promise of offers |

## Review and practice rules
- Use short retrieval practice at the start of each study session.
- Schedule weekly cumulative review and a lighter recovery day where needed.
- Link only to exercises that genuinely match the day's concept and difficulty.
- For every question, include a hint/solution only where appropriate and explain the reasoning in original wording.
- Keep “must do” tasks achievable; mark extra problems and platform deep dives as optional.
- Use actual task complexity to set minutes; re-estimate after the first two weeks.
- Do not label the learner job-ready based solely on completing all 90 days. Use demonstrated competencies and mock/project evidence.

## Publication gate
Before replacing the current planner, validate all 90 rows against actual lesson files and practice links. If a lesson is missing, either create and review it or move that topic later. Run the inventory and full project validation scripts and inspect the rendered planner at desktop and mobile sizes.

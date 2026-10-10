# Keyword-to-URL map

One preferred URL per search intent. Started 10 October 2026 from the existing site (613 indexable pages).
Search volume, difficulty, impressions, clicks, CTR and position are **unknown** until Google Search Console
has data; fill those columns from Search Console (Performance → Search results → Pages/Queries), never from
guesses. Geography for manual SERP checks: record it next to the date.

Columns not shown here (add them in a spreadsheet copy when GSC data exists): current impressions, clicks,
CTR, average position, indexing status, last substantive update.

## Tier 1 — specific, practical queries (start here)

| Primary query (intent) | Preferred URL | Supporting URLs (link to the preferred URL) | Next action |
|---|---|---|---|
| how to make a PySpark job faster (solve) | `/spark/memory-executors-tuning/` | `/spark/partitions-shuffles-skew/`, `/spark/adaptive-query-execution/`, `/pyspark/writing-efficient-output/` | Gap: no single "PySpark performance checklist" page. Create one only if GSC shows impressions for the query; otherwise strengthen the tuning lesson's intro and links. |
| PySpark broadcast join example (learn) | `/interview/pyspark/broadcast-join/` | `/pyspark/joins-and-join-strategy/`, `/spark/caching-broadcast-accumulators/` | Check the page has a runnable example and the size limits. |
| Spark data skew troubleshooting (solve) | `/spark/partitions-shuffles-skew/` | `/interview/spark/data-skew/` (interview intent, keep distinct) | Interview page should link to the lesson in its first section. |
| SQL gaps and islands (learn/interview) | `/sql/gaps-islands-sessionization/` | SQL case studies that use streaks | — |
| Snowflake micro-partition pruning (learn) | `/snowflake/micro-partitions-clustering-pruning/` | `/interview/snowflake/micro-partitions-performance/` | — |
| Airflow retries and idempotency (interview) | `/interview/airflow/retries-and-idempotency/` | `/airflow/dags-scheduling-retries/`, `/etl-elt/idempotency-in-data-pipelines/` | — |
| idempotent batch pipeline design (interview) | `/interview/data-engineering/idempotent-batch-pipeline/` | `/etl-elt/idempotency-in-data-pipelines/` (concept), `/python/idempotent-csv-loader/` (build), `/data-engineering/system-design/idempotent-reprocessing-system/` (design) | Four intents, four URLs: keep them distinct and cross-linked. |
| how to design a CDC pipeline (interview/design) | `/data-engineering/system-design/change-data-capture-platform/` | `/etl-elt/cdc-patterns-and-failure-modes/`, `/interview/data-engineering/design-cdc-pipeline/`, `/kafka/kafka-connect-debezium/`, `/projects/change-data-capture-pipeline/` | Watch for cannibalisation between the design page and the interview answer. |
| data pipeline data quality checks (learn) | `/etl-elt/data-quality-checks-contracts/` | `/interview/data-engineering/data-quality-checks/`, `/data-engineering/system-design/data-quality-framework/` | — |
| Kafka consumer group rebalancing (learn) | `/kafka/consumer-groups-rebalancing/` | `/interview/kafka/rebalancing-problems/`, `/kafka/topics-partitions-consumer-groups/` | — |
| SCD Type 2 SQL example (learn) | `/interview/sql/scd-type-2-merge-sql/` | `/data-warehousing/slowly-changing-dimensions/` (concepts, types 0–6), `/sql/top-n-deduplication-scd-queries/` | If GSC shows both ranking for "scd type 2", make the lesson the conceptual page and the interview page the SQL example. |
| SQL running total window function (learn) | `/sql/window-frames-running-totals/` | `/sql/window-functions/`, `/interview/sql/window-functions-vs-group-by/` | — |
| batch vs streaming pipelines (learn) | `/etl-elt/batch-vs-streaming/` | `/data-engineering/system-design/` streaming cases | — |

## Tier 2 — topic-level queries (hubs)

| Primary query | Preferred URL | Title (after 10 Oct 2026) |
|---|---|---|
| SQL interview questions for data engineers | `/interview/sql/` | SQL Interview Questions for Data Engineers |
| PySpark interview questions | `/interview/pyspark/` | PySpark Interview Questions for Data Engineers |
| Spark interview questions | `/interview/spark/` | Apache Spark Interview Questions for Data Engineers |
| Snowflake interview questions | `/interview/snowflake/` | Snowflake Interview Questions for Data Engineers |
| Kafka interview questions | `/interview/kafka/` | Kafka Interview Questions for Data Engineers |
| Airflow interview questions | `/interview/airflow/` | Airflow Interview Questions for Data Engineers |
| data engineering interview questions | `/interview/questions/` | Data Engineer Interview Questions and Answers |
| data engineering system design interview | `/data-engineering/system-design/` | Data Engineering System Design Interview Case Studies |
| data engineering projects for beginners | `/projects/` | Data Engineering Projects: Step-by-Step Guides |
| data engineer roadmap for beginners | `/data-engineering/roadmap/` | Data Engineer Roadmap 2026 for Beginners |
| learn SQL / PySpark / Kafka … for data engineering | `/<tech>/` course hubs | "<Tech> for Data Engineers: Course and Practice" |
| 90 day data engineer study plan | `/planner/90-day-plan/` | 90-Day Data Engineer Study Plan |

## Tier 3 — broad head terms

"data engineering", "data engineer", "data engineering course": homepage `/` and `/data-engineering/`. Not a
success criterion on their own; they follow from the clusters above.

## Cannibalisation watch list

Decide only with Search Console data (impressions for the same query on two URLs). Do not merge pages that
serve different intents.

| Query | Competing URLs | Current view |
|---|---|---|
| 90-day data engineering plan | `/`, `/planner/90-day-plan/`, `/roadmaps/90-day-job-switch-plan/` | Homepage = brand + plan entry; planner = the day-by-day plan; job-switch roadmap = career-switch advice. If GSC shows the roadmap and planner both getting impressions for "90 day plan", retitle the roadmap around "career switch" and link it to the planner. |
| CDC pipeline | system design vs interview answer vs project | Distinct intents (design / answer / build). Keep cross-links explicit. |
| idempotent pipeline | concept lesson vs interview vs system design vs project | As above. |
| SCD type 2 | modeling lesson vs SQL interview | See Tier 1 row. |

## Weekly review (from the SEO plan)

Record in `docs/seo/SEO_LOG.md`: clicks, impressions, CTR, position; pages with impressions but low CTR;
queries at positions 8–30; unindexed important pages with Google's stated reason; what changed and when.

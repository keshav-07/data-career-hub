#!/usr/bin/env python3
"""Generate the human-readable 90-day curriculum plan from the topic inventory."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CURRICULUM = ROOT / "docs/curriculum/curriculum.json"
OUTPUT = ROOT / "docs/curriculum/plan-90-days.json"

PHASES = [
    {"title": "Phase 1: Foundations", "goal": "Build SQL, DSA, Python and core data-engineering foundations; finish one batch project and begin applications."},
    {"title": "Phase 2: Core pipelines", "goal": "Build reliable batch and CDC pipelines, practise cloud and warehouse work, and complete a second project."},
    {"title": "Phase 3: Advanced and interview-ready", "goal": "Practise streaming, system design and mock interviews; finish a project demo, résumé and portfolio."},
]

MILESTONES = {
    1: "Use SQL filtering, NULL handling and aggregation; solve 20 array/hash problems; explain core pipeline foundations; run the idempotent CSV loader locally.",
    2: "Solve 20 more DSA problems; join data safely, explain common file formats, define warehouse grain, and describe basic S3/IAM access.",
    3: "Build DataFrame transformations and explain lazy evaluation, SCD types and partitioning trade-offs.",
    4: "Explain the system-design method and sketch a batch ingestion framework after learning the storage foundations.",
    5: "Implement incremental, replay-safe loads; explain CDC and Airflow backfills; start the warehouse pipeline project.",
    6: "Explain Delta Lake transactions and schema evolution, load data into a warehouse, and design a medallion lakehouse.",
    7: "Explain Kafka delivery basics, data contracts and quality checks; design an idempotent CDC pipeline.",
    8: "Tune Spark, describe CI/CD and observability, and complete two SQL/DSA or data-engineering mocks.",
    9: "Explain streaming state and watermarks, complete a streaming project extension, and defend a clickstream design.",
    10: "Solve timed SQL/DSA sets and design a governed pipeline with quality and observability controls.",
    11: "Handle late data, retries and backfills in system-design interviews; explain operating costs and failure modes.",
    12: "Complete two mocks, explain project trade-offs clearly, and identify remaining weak areas.",
    13: "Finish the project demo, résumé and portfolio; complete final mocks and a focused revision plan.",
}

SQL_PRACTICE = [
    (175, "Combine Two Tables", "combine-two-tables"),
    (584, "Find Customer Referee", "find-customer-referee"),
    (595, "Big Countries", "big-countries"),
    (1148, "Article Views I", "article-views-i"),
    (1683, "Invalid Tweets", "invalid-tweets"),
    (1378, "Replace Employee ID With The Unique Identifier", "replace-employee-id-with-the-unique-identifier"),
    (1068, "Product Sales Analysis I", "product-sales-analysis-i"),
    (1581, "Customer Who Visited but Did Not Make Any Transactions", "customer-who-visited-but-did-not-make-any-transactions"),
    (197, "Rising Temperature", "rising-temperature"),
    (1661, "Average Time of Process per Machine", "average-time-of-process-per-machine"),
    (577, "Employee Bonus", "employee-bonus"),
    (1280, "Students and Examinations", "students-and-examinations"),
    (570, "Managers with at Least 5 Direct Reports", "managers-with-at-least-5-direct-reports"),
    (1934, "Confirmation Rate", "confirmation-rate"),
    (620, "Not Boring Movies", "not-boring-movies"),
    (1251, "Average Selling Price", "average-selling-price"),
    (1075, "Project Employees I", "project-employees-i"),
    (1633, "Percentage of Users Attended a Contest", "percentage-of-users-attended-a-contest"),
    (1211, "Queries Quality and Percentage", "queries-quality-and-percentage"),
    (1193, "Monthly Transactions I", "monthly-transactions-i"),
    (1174, "Immediate Food Delivery II", "immediate-food-delivery-ii"),
    (550, "Game Play Analysis IV", "game-play-analysis-iv"),
    (2356, "Number of Unique Subjects Taught by Each Teacher", "number-of-unique-subjects-taught-by-each-teacher"),
    (1070, "Product Sales Analysis III", "product-sales-analysis-iii"),
    (596, "Classes More Than 5 Students", "classes-more-than-5-students"),
    (586, "Customer Placing the Largest Number of Orders", "customer-placing-the-largest-number-of-orders"),
    (610, "Triangle Judgment", "triangle-judgment"),
    (1978, "Employees Whose Manager Left the Company", "employees-whose-manager-left-the-company"),
    (1045, "Customers Who Bought All Products", "customers-who-bought-all-products"),
    (1731, "The Number of Employees Which Report to Each Employee", "the-number-of-employees-which-report-to-each-employee"),
    (1789, "Primary Department for Each Employee", "primary-department-for-each-employee"),
    (1741, "Find Total Time Spent by Each Employee", "find-total-time-spent-by-each-employee"),
    (511, "Game Play Analysis I", "game-play-analysis-i"),
    (176, "Second Highest Salary", "second-highest-salary"),
    (1757, "Recyclable and Low Fat Products", "recyclable-and-low-fat-products"),
    (1907, "Count Salary Categories", "count-salary-categories"),
    (1667, "Fix Names in a Table", "fix-names-in-a-table"),
    (1527, "Patients With a Condition", "patients-with-a-condition"),
    (1517, "Find Users With Valid E-Mails", "find-users-with-valid-e-mails"),
    (1327, "List the Products Ordered in a Period", "list-the-products-ordered-in-a-period"),
    (262, "Trips and Users", "trips-and-users"),
    (1084, "Sales Analysis III", "sales-analysis-iii"),
    (1141, "User Activity for the Past 30 Days I", "user-activity-for-the-past-30-days-i"),
    (1204, "Last Person to Fit in the Bus", "last-person-to-fit-in-the-bus"),
    (1164, "Product Price at a Given Date", "product-price-at-a-given-date"),
    (1077, "Project Employees III", "project-employees-iii"),
    (1321, "Restaurant Growth", "restaurant-growth"),
    (1341, "Movie Rating", "movie-rating"),
    (1393, "Capital Gain/Loss", "capital-gainloss"),
    (1158, "Market Analysis I", "market-analysis-i"),
    (180, "Consecutive Numbers", "consecutive-numbers"),
    (182, "Duplicate Emails", "duplicate-emails"),
    (184, "Department Highest Salary", "department-highest-salary"),
    (185, "Department Top Three Salaries", "department-top-three-salaries"),
    (196, "Delete Duplicate Emails", "delete-duplicate-emails"),
]

PROJECTS = [
    ("CSV to warehouse pipeline", "projects:csv-to-warehouse-pipeline"),
    ("E-commerce analytics platform", "projects:ecommerce-analytics-platform"),
    ("Change data capture pipeline", "projects:change-data-capture-pipeline"),
    ("Fraud detection pipeline", "projects:fraud-detection-pipeline"),
    ("Kafka/Spark/Delta streaming pipeline", "projects:kafka-spark-delta-streaming"),
    ("Large-scale batch processing", "projects:large-scale-batch-processing"),
    ("Real-time analytics pipeline", "projects:real-time-analytics-pipeline"),
    ("S3/PySpark/Snowflake pipeline", "projects:s3-pyspark-snowflake-pipeline"),
]

WEEK_TRACKS = {
    1: ["python"],
    2: ["aws", "data-modeling"],
    3: ["pyspark", "data-modeling"],
    4: ["pyspark", "snowflake", "airflow", "system-design"],
    5: ["pyspark", "airflow", "aws"],
    6: ["pyspark", "snowflake", "aws", "system-design"],
    7: ["kafka", "snowflake", "airflow", "aws"],
    8: ["kafka", "pyspark", "aws"],
    9: ["spark-streaming", "kafka", "system-design"],
    10: ["snowflake", "aws", "system-design"],
    11: ["airflow", "kafka", "snowflake", "system-design"],
    12: ["system-design", "data-modeling"],
    13: ["system-design", "python"],
}

START_DAY = {
    "python": 1,
    "data-modeling": 10,
    "aws": 11,
    "pyspark": 15,
    "snowflake": 24,
    "airflow": 26,
    "system-design": 27,
    "kafka": 43,
    "spark-streaming": 61,
}

SQL_PRIORITY = [
    "SELECT, WHERE & basic filtering",
    "NULL handling with IS NULL / COALESCE",
    "Aggregate functions (SUM, AVG, MIN, MAX)",
    "GROUP BY fundamentals",
    "HAVING vs WHERE",
    "DISTINCT and de-duplication",
    "ORDER BY multi-column sorting",
    "LIMIT / TOP / FETCH FIRST",
    "CASE WHEN expressions",
    "INNER JOIN basics",
    "LEFT JOIN basics",
    "RIGHT JOIN & FULL OUTER JOIN",
    "Self Join patterns",
    "Anti-join (NOT EXISTS / LEFT JOIN NULL)",
    "Multi-table joins",
    "Subqueries in WHERE",
    "Subqueries in FROM (derived tables)",
    "Correlated subqueries",
    "Common Table Expressions (CTEs)",
    "Multiple chained CTEs",
    "PIVOT rows to columns",
    "Window function basics (OVER)",
    "PARTITION BY clause",
    "ROW_NUMBER()",
    "RANK() vs DENSE_RANK()",
    "LAG() and LEAD()",
    "Running totals with SUM OVER",
    "Date truncation & bucketing",
    "Gaps and islands",
    "Top-N per group",
    "Deduplicate keeping latest record",
]

DE_PRIORITY = [
    "Data lifecycle and ownership",
    "OLTP and OLAP workloads",
    "Batch versus streaming",
    "ETL versus ELT",
    "Python functions and reusable code",
    "Python iterators and generators",
    "Python CSV validation",
    "CSV and JSON trade-offs",
    "Parquet and columnar storage",
    "Avro and schema evolution",
    "Partitioning and data layout",
    "Warehouse grain and star schemas",
    "Fact and dimension tables",
    "Slowly changing dimensions",
    "Incremental loading and watermarks",
    "Idempotent pipeline writes",
    "Change data capture patterns",
    "Data quality checks and contracts",
    "Testing pipelines and CI/CD",
    "Retries and failure recovery",
    "Pipeline observability",
    "Late data and backfills",
]

# Keep the milestone claims tied to topics that actually appear in their weeks.
# Each entry is (tracker, exact inventory topics); weekend entries are folded into
# the lab block so the daily hour totals remain unchanged.
MAIN_OVERRIDES = {
    10: ("data-modeling", ["Grain definition"]),
    13: ("data-modeling", ["Star Schema"]),
    14: ("data-modeling", ["Fact tables"]),
    15: ("pyspark", ["DataFrame API basics"]),
    16: ("pyspark", ["Spark architecture (driver/executor)"]),
    17: ("pyspark", ["Lazy evaluation & DAG"]),
    18: ("pyspark", ["Joins in Spark SQL"]),
    19: ("pyspark", ["Reading/writing Parquet"]),
    20: ("data-modeling", ["SCD Type 2 (history)"]),
    21: ("pyspark", ["Partitions & parallelism"]),
    24: ("snowflake", ["Three-layer architecture"]),
    25: ("snowflake", ["File formats & staging", "COPY INTO command"]),
    26: ("airflow", ["DAG fundamentals"]),
    27: ("system-design", ["Design a batch ingestion framework"]),
    28: ("pyspark", ["Joins in Spark SQL", "Reading/writing Parquet"]),
    31: ("airflow", ["Retries & alerting"]),
    32: ("aws", ["Glue bookmarks"]),
    33: ("aws", ["Glue Data Quality"]),
    34: ("airflow", ["Backfills & reruns"]),
    35: ("airflow", ["Testing DAGs", "CI/CD for DAGs"]),
    36: ("pyspark", ["Delta Lake architecture", "ACID transactions on Delta"]),
    37: ("pyspark", ["Schema evolution", "MERGE / upsert"]),
    38: ("snowflake", ["COPY INTO command"]),
    39: ("snowflake", ["Snowpipe continuous ingestion"]),
    40: ("aws", ["Glue ETL jobs (Spark)"]),
    41: ("aws", ["Athena basics"]),
    42: ("system-design", ["Design a Lakehouse (bronze/silver/gold)"]),
    43: ("kafka", ["Topic fundamentals"]),
    44: ("kafka", ["At-least-once"]),
    45: ("snowflake", ["CDC with streams"]),
    46: ("snowflake", ["Scheduled tasks (CRON)"]),
    47: ("airflow", ["XCom push/pull", "TaskFlow API"]),
    48: ("aws", ["Redshift architecture", "Redshift Spectrum"]),
    49: ("kafka", ["Partition keys & ordering"]),
    50: ("kafka", ["Exactly-once semantics (EOS)"]),
    51: ("kafka", ["Connect framework", "Source vs sink connectors"]),
    52: ("pyspark", ["AQE (Adaptive Query Execution)"]),
    53: ("pyspark", ["Persistence & caching levels"]),
    54: ("aws", ["EMR clusters", "Lambda + S3/Kinesis"]),
    55: ("kafka", ["Debezium CDC"]),
    56: ("aws", ["Kinesis Data Streams", "Metrics & alarms"]),
    57: ("system-design", ["Design a GDPR/PII compliant pipeline"]),
    58: ("kafka", ["Consumer lag", "Rebalancing protocols"]),
    59: ("system-design", ["Design a data quality framework"]),
    60: ("system-design", ["Design a data observability system"]),
    61: ("pyspark", ["Structured Streaming model"]),
    62: ("pyspark", ["Watermarking"]),
    63: ("pyspark", ["Stateful aggregations", "Exactly-once in streaming"]),
    64: ("snowflake", ["RBAC model", "Column-level security / masking"]),
    65: ("aws", ["Lake Formation basics", "LF-Tags"]),
    66: ("system-design", ["Design a data catalog & lineage system"]),
    67: ("system-design", ["Design a data observability system"]),
    68: ("snowflake", ["Time Travel basics", "Credit consumption analysis"]),
    69: ("aws", ["Cost Explorer & budgets"]),
    70: ("system-design", ["Design a data SLA & freshness monitoring system"]),
    71: ("airflow", ["LocalExecutor", "CeleryExecutor"]),
    72: ("airflow", ["Backfills & reruns", "Retries & alerting"]),
    73: ("kafka", ["Consumer lag"]),
    74: ("kafka", ["Rebalancing protocols"]),
    75: ("snowflake", ["Time Travel basics", "Warehouse right-sizing"]),
    76: ("system-design", ["Design a backfill & late-data handling system"]),
    77: ("airflow", ["CI/CD for DAGs"]),
    78: ("system-design", ["Design a multi-tenant data platform"]),
    79: ("system-design", ["Design a data mesh architecture"]),
    80: ("system-design", ["Design a unified batch + streaming (Lambda/Kappa)"]),
    81: ("system-design", ["Design a feature store"]),
    82: ("system-design", ["Design a cost-optimized warehouse strategy"]),
    83: ("system-design", ["Design a self-serve analytics platform"]),
    84: ("system-design", ["Design a schema registry & contract system"]),
    85: ("system-design", ["Design a financial reconciliation pipeline"]),
    86: ("system-design", ["Design a near-zero downtime migration"]),
    87: ("system-design", ["Design a financial reconciliation pipeline"]),
    88: ("system-design", ["Design a data SLA & freshness monitoring system"]),
    89: ("system-design", ["Design a data quality framework"]),
    90: ("system-design", ["Design a batch ingestion framework"]),
}

CONCEPT_OVERRIDES = {
    29: "Incremental loading and watermarks",
    30: "Idempotent pipeline writes",
    31: "Change data capture patterns",
    32: "Data quality checks and contracts",
    33: "Retries and failure recovery",
    34: "Late data and backfills",
    35: "Testing pipelines and CI/CD",
    43: "Data quality checks and contracts",
    44: "Idempotent pipeline writes",
    45: "Change data capture patterns",
    50: "Data quality checks and contracts",
    51: "Testing pipelines and CI/CD",
    52: "Pipeline observability",
    53: "Retries and failure recovery",
    54: "Change data capture patterns",
    55: "Late data and backfills",
    56: "Data quality checks and contracts",
    71: "Late data and backfills",
    72: "Retries and failure recovery",
    73: "Pipeline observability",
}

ADDITIONAL_MAIN_OVERRIDES = {
    28: ("airflow", ["Backfills & reruns", "Idempotent tasks"]),
    63: ("system-design", ["Design a clickstream analytics pipeline"]),
}

WEEKEND_DESIGN_OVERRIDES = {
    63: "Design a clickstream analytics pipeline",
    64: "Design a GDPR/PII compliant pipeline",
}

PYTHON_TOPICS = [
    ("Python for data engineering", "articles:python/python-for-data-engineering"),
    ("Reusable functions and modules", "articles:python/functions-modules-reusable-code"),
    ("CSV and JSON file handling", "articles:python/file-io-csv-json"),
    ("Iterators and generators", "articles:python/iterators-generators"),
    ("Error handling and logging", "articles:python/error-handling-logging"),
    ("Idempotent CSV loader", "articles:python/idempotent-csv-loader"),
    ("Testing with pytest", "articles:python/testing-with-pytest"),
    ("Paginated API ingestion", "articles:python/working-with-apis"),
    ("Pandas for data engineers", "articles:python/pandas-for-data-engineers"),
    ("Python data structures", "articles:python/data-structures-for-interviews"),
]


def ref_of(item: dict) -> str | None:
    return item.get("question") or item.get("design") or item.get("lesson")


def named_items(track: str, names: list[str], inventory: dict) -> list[dict]:
    by_name = {item["topic"]: item for item in inventory.get(track, [])}
    missing = [name for name in names if name not in by_name]
    if missing:
        raise ValueError(f"Unknown {track} plan topic(s): {', '.join(missing)}")
    return [by_name[name] for name in names]


def plan_item(track: str, item: dict) -> dict:
    return {
        "topic": item["topic"],
        "ref": ref_of(item),
        "tracker": track if track in {"sql", "dsa", "de-concepts", "data-modeling", "pyspark", "snowflake", "airflow", "aws", "kafka", "system-design"} else None,
    }


def choose_track(day: int, week: int, cursors: dict[str, int], inventory: dict) -> str:
    candidates = [t for t in WEEK_TRACKS[week] if day >= START_DAY.get(t, 1)]
    if not candidates:
        return "python"
    track = candidates[(day + week) % len(candidates)]
    source = "pyspark" if track == "spark-streaming" else track
    items = inventory.get(source, [])
    if track == "spark-streaming":
        items = [item for item in items if item.get("category") == "Streaming"]
    if items:
        cursors[track] = cursors.get(track, 0) % len(items)
    return track


def question_for(track: str, topic: str) -> str:
    prompts = {
        "sql": f"How would you write and validate a query for {topic}, including NULLs and duplicate rows?",
        "dsa": f"What is the optimal time and space complexity for {topic}, and how would you test edge cases?",
        "de-concepts": f"When would you use {topic}, and how would you make the pipeline reliable when data is late or repeated?",
        "python": f"How would you implement {topic} so it handles malformed input, retries and repeat runs safely?",
        "data-modeling": f"How would you apply {topic} to a warehouse with changing business requirements?",
        "pyspark": f"How does {topic} affect execution, partitioning and failure recovery in Spark?",
        "snowflake": f"How would you use {topic} while controlling query performance, access and cost?",
        "airflow": f"How would you apply {topic} to a pipeline that must recover safely after a task failure?",
        "aws": f"How would you design access, retries and monitoring around {topic} in an AWS data pipeline?",
        "kafka": f"How would you use {topic} and explain its ordering, delivery and replay guarantees?",
        "system-design": f"How would you design a production data platform for {topic}, including scale, failure handling and trade-offs?",
    }
    return prompts.get(track, f"How would you explain and apply {topic} in a production data-engineering workflow?")


def build() -> list[dict]:
    curriculum = json.loads(CURRICULUM.read_text(encoding="utf-8"))
    inventory = {key: value.get("items", []) for key, value in curriculum.items()}
    inventory["python"] = [{"topic": title, "lesson": ref} for title, ref in PYTHON_TOPICS]
    inventory["pyspark"] = sorted(
        inventory["pyspark"],
        key=lambda item: (
            0 if "dataframe" in item["topic"].lower() else
            1 if "architecture" in item["topic"].lower() or "lazy evaluation" in item["topic"].lower() else
            3 if "rdd" in item["topic"].lower() else 2
        ),
    )
    design_order = [
        "Design a batch ingestion framework",
        "Design a Data Lake on cloud object storage",
    ]
    inventory["system-design"] = sorted(
        inventory["system-design"],
        key=lambda item: design_order.index(item["topic"]) if item["topic"] in design_order else len(design_order),
    )
    sql_by_name = {item["topic"]: item for item in inventory["sql"]}
    sql_topics = [sql_by_name[name] for name in SQL_PRIORITY if name in sql_by_name]
    sql_topics.extend(item for item in inventory["sql"] if item not in sql_topics)
    sql_topics = sql_topics[:100]
    if len(sql_topics) != 100:
        raise ValueError("SQL curriculum must contain at least 100 ordered topics")
    dsa_topics = inventory["dsa"]
    if len(dsa_topics) != 248:
        raise ValueError(f"Expected the repository's 248 DSA problems, found {len(dsa_topics)}")
    de_topics = inventory["de-concepts"]
    if not de_topics:
        raise ValueError("Add the DE Concepts tracker inventory before building the plan")
    de_by_name = {item["topic"]: item for item in de_topics}
    de_topics = [de_by_name[name] for name in DE_PRIORITY if name in de_by_name]
    de_topics.extend(item for item in inventory["de-concepts"] if item not in de_topics)

    cursors: dict[str, int] = {}
    days = []
    sql_cursor = dsa_cursor = concept_cursor = practice_cursor = weekend_cursor = project_cursor = 0
    for day in range(1, 91):
        week = (day - 1) // 7 + 1
        phase = min((day - 1) // 30 + 1, 3)
        weekend = (day - 1) % 7 in (0, 1)  # The 90-day calendar starts on Saturday.
        hours = 6 if weekend else 3
        tasks = []

        sql_count = 2 if day in (1, 2) or 8 <= day <= 15 else 1
        sql_items = sql_topics[sql_cursor : sql_cursor + sql_count]
        sql_cursor += len(sql_items)
        practice = []
        if practice_cursor < len(SQL_PRACTICE):
            number, title, slug = SQL_PRACTICE[practice_cursor]
            practice = [{"title": f"{number}. {title}", "url": f"https://leetcode.com/problems/{slug}/"}]
            practice_cursor += 1
        sql_task = {
            "track": "sql",
            "minutes": 60 if weekend else 30,
            "kind": "practice" if weekend else "learn",
            "items": [{"topic": item["topic"], "ref": ref_of(item), "tracker": "sql"} for item in sql_items],
        }
        if weekend:
            cases = curriculum["sql"].get("caseStudies", [])
            if cases:
                case = cases[weekend_cursor % len(cases)]
                sql_task["items"].append({"topic": f"{case['scenario']} case study", "ref": case["ref"]})
            weekend_cursor += 1
        if practice:
            sql_task["practice"] = practice
        tasks.append(sql_task)

        dsa_count = 2 if not weekend else (5 if weekend_cursor <= 16 else 4)
        dsa_items = dsa_topics[dsa_cursor : dsa_cursor + dsa_count]
        dsa_cursor += len(dsa_items)
        tasks.append({
            "track": "dsa",
            "minutes": 90 if weekend else 45,
            "kind": "practice",
            "items": [{"topic": item["topic"], "ref": ref_of(item), "tracker": "dsa"} for item in dsa_items],
        })

        concept = de_by_name.get(CONCEPT_OVERRIDES.get(day), de_topics[concept_cursor % len(de_topics)])
        concept_cursor += 1
        concept_kind = "learn" if day <= len(de_topics) else "revise"
        tasks.append({
            "track": "de-concepts",
            "minutes": 30,
            "kind": concept_kind,
            "items": [{"topic": concept["topic"], "ref": ref_of(concept), "tracker": "de-concepts"}],
        })

        if weekend:
            project_title, project_ref = PROJECTS[project_cursor % len(PROJECTS)]
            lab_item = {"topic": f"{project_title}: day {day} lab", "ref": project_ref}
            lab_track = "project"
            if day == 85:
                lab_item = {"topic": "Record the final project demo and walkthrough", "ref": project_ref}
            elif day == 86:
                lab_item = {"topic": "Polish the resume, portfolio and project README", "ref": project_ref}
            if day == 1:
                lab_item = {"topic": "Idempotent CSV loader setup and replay check", "ref": "articles:python/idempotent-csv-loader"}
                lab_track = "python"
            elif day == 2:
                lab_item = {"topic": "Local Postgres setup and CSV load", "ref": "articles:python/idempotent-csv-loader"}
                lab_track = "python"
            elif day in (8, 9):
                lab_item = {"topic": "Compare file formats and inspect a partitioned data layout", "ref": "articles:etl-elt/modern-data-pipelines"}
            elif day in (22, 23):
                lab_item = {"topic": "Declare a warehouse grain and sketch a star schema", "ref": "articles:data-warehousing/star-schema"}
            elif day in (15, 16):
                lab_track = "pyspark"
                item = inventory[lab_track][cursors.get(lab_track, 0) % len(inventory[lab_track])]
                lab_item = {"topic": item["topic"], "ref": ref_of(item), "tracker": lab_track}
                cursors[lab_track] = cursors.get(lab_track, 0) + 1
            elif day == 43:
                lab_track = "kafka"
                item = inventory[lab_track][cursors.get(lab_track, 0) % len(inventory[lab_track])]
                lab_item = {"topic": item["topic"], "ref": ref_of(item), "tracker": lab_track}
                lab_project = {"topic": "Add a Kafka CDC lab to the warehouse pipeline", "ref": "projects:csv-to-warehouse-pipeline"}
                cursors[lab_track] = cursors.get(lab_track, 0) + 1
            if day >= 29 and day != 43:
                project_cursor += 1
            lab_items = [lab_item, lab_project] if day == 43 else [lab_item]
            override = MAIN_OVERRIDES.get(day)
            if override:
                lab_track, names = override
                selected = [plan_item(lab_track, item) for item in named_items(lab_track, names, inventory)]
                lab_items = ([lab_item] if day >= 29 else []) + [
                    item for item in selected if item["topic"] != lab_item["topic"]
                ]
                if day == 43:
                    lab_items.append(lab_project)
            tasks.append({"track": lab_track, "minutes": 90, "kind": "project", "items": lab_items})
            if day >= 27:
                track = "system-design"
                design_override = WEEKEND_DESIGN_OVERRIDES.get(day)
                if design_override:
                    item = named_items(track, [design_override], inventory)[0]
                else:
                    item_list = inventory[track]
                    item = item_list[cursors.get(track, 0) % len(item_list)]
                    cursors[track] = cursors.get(track, 0) + 1
                tasks.append({"track": track, "minutes": 60, "kind": "practice", "items": [{"topic": item["topic"], "ref": ref_of(item), "tracker": track}]})
            else:
                tasks.append({"track": "de-concepts", "minutes": 60, "kind": "project", "items": [{"topic": f"Foundations lab: {concept['topic']}", "ref": ref_of(concept)}]})
            tasks.append({"track": "review", "minutes": 30, "kind": "mock" if day >= 28 else "revise", "items": [{"topic": "Weekly review and interview recall", "ref": "articles:career/explain-a-data-engineering-project"}]})
            main_track = lab_track
            main_topic = next((item["topic"] for item in lab_items if item.get("tracker")), lab_item["topic"])
            if day == 85:
                exercise = "Record a short demo showing the pipeline, its data quality checks and one replay-safe run."
            elif day == 86:
                exercise = "Write three résumé bullets and a portfolio README that describe the project and its trade-offs."
            elif lab_track == "pyspark":
                exercise = f"Build a small DataFrame exercise for {main_topic} and verify the result on a local sample."
            elif lab_track == "kafka":
                exercise = "Create a producer/consumer walkthrough, record the offset, then replay one message safely."
            elif lab_track == "python":
                exercise = "Load a CSV into local Postgres twice and show that the second run creates no duplicate rows."
            else:
                exercise = f"Extend the {project_title.lower()} with a tested, replay-safe step and record the result."
        else:
            override = MAIN_OVERRIDES.get(day)
            if override:
                track, names = override
                task_items = [plan_item(track, item) for item in named_items(track, names, inventory)]
                if day == 63:
                    task_items.append({
                        "topic": "Extend the clickstream project with watermarks and stateful aggregation",
                        "ref": "projects:kafka-spark-delta-streaming",
                    })
            else:
                forced = {11: "aws", 24: "snowflake", 26: "airflow", 61: "spark-streaming"}
                track = forced[day] if day in forced else choose_track(day, week, cursors, inventory)
                source = "pyspark" if track == "spark-streaming" else track
                if track == "spark-streaming":
                    main_items = [entry for entry in inventory[source] if entry.get("category") == "Streaming"]
                else:
                    main_items = inventory[source]
                item = main_items[cursors.get(track, 0) % len(main_items)]
                cursors[track] = cursors.get(track, 0) + 1
                task_track = "pyspark" if track == "spark-streaming" else track
                task_items = [plan_item(task_track, item)]
            task_track = track
            extra = ADDITIONAL_MAIN_OVERRIDES.get(day)
            tasks.append({
                "track": task_track,
                "minutes": 45 if extra else 60,
                "kind": "learn",
                "items": task_items,
            })
            if extra:
                extra_track, extra_names = extra
                tasks.append({
                    "track": extra_track,
                    "minutes": 15,
                    "kind": "learn",
                    "items": [plan_item(extra_track, item) for item in named_items(extra_track, extra_names, inventory)],
                })
            tasks.append({"track": "review", "minutes": 15, "kind": "revise", "items": [{"topic": "Recall yesterday's and last week's topics; answer one question aloud", "ref": "articles:career/explain-a-data-engineering-project"}]})
            main_track = track
            main_topic = task_items[0]["topic"]
            exercise = f"Complete a hands-on exercise for {main_topic} and keep a short note of the result."
            if day == 63:
                exercise = "Extend the clickstream project with a watermark and stateful aggregation; record a replay test."

        milestone = MILESTONES.get(week) if day == min(week * 7, 90) else None
        monthly = None
        if day == 30:
            monthly = "Month review and Mock 1: explain the batch project, SQL and DSA foundations; make a realistic application plan."
        elif day == 60:
            monthly = "Mocks 2 and 3: complete SQL/DSA and data-engineering design rounds; review gaps from the pipeline project."
        elif day == 90:
            milestone = MILESTONES[13]
            monthly = "Finish the project demo, resume and portfolio; complete final mocks and a focused revision plan."

        outcome = f"You can explain {main_topic}, complete today's SQL and DSA practice, and show the result of the hands-on exercise."
        days.append({
            "day": day,
            "phase": phase,
            "week": week,
            "hours": hours,
            "theme": main_topic,
            "tasks": tasks,
            "exercise": exercise,
            "interviewQuestion": question_for(main_track, main_topic),
            "outcome": outcome,
            **({"weekly": milestone} if milestone else {}),
            **({"monthly": monthly} if monthly else {}),
        })
    # Keep the opening homepage/planner cards visually balanced at exactly ten tiles.
    # Move existing lessons between days so every topic remains scheduled once.
    opening_moves = [
        (1, 3, "dsa", "Product of Array Except Self"),
        (1, 4, "sql", "NULL handling with IS NULL / COALESCE"),
        (1, 5, "de-concepts", "Foundations lab: Data lifecycle and ownership"),
        (2, 3, "dsa", "Contiguous Array"),
        (2, 4, "dsa", "Shortest Subarray with Sum at Least K"),
        (2, 5, "de-concepts", "OLTP and OLAP workloads"),
        (6, 3, "dsa", "Find All Numbers Disappeared in an Array"),
        (7, 4, "dsa", "Find All Duplicates in an Array"),
        (8, 5, "de-concepts", "CSV and JSON trade-offs"),
    ]
    for source_day, target_day, track, topic in opening_moves:
        source = next(
            task for task in days[source_day - 1]["tasks"]
            if task["track"] == track and any(item["topic"] == topic for item in task["items"])
        )
        item = next(item for item in source["items"] if item["topic"] == topic)
        source["items"].remove(item)
        target = next(task for task in days[target_day - 1]["tasks"] if task["track"] == track)
        target["items"].append(item)

    for day in days:
        for task in [task for task in day["tasks"] if not task["items"] and not task.get("practice")]:
            recipient = next(
                (other for other in day["tasks"] if other is not task and other["kind"] == task["kind"]),
                None,
            ) or next(other for other in day["tasks"] if other is not task and other["track"] == task["track"])
            recipient["minutes"] += task["minutes"]
            day["tasks"].remove(task)

    if sql_cursor != 100 or dsa_cursor != 248 or practice_cursor != 55:
        raise ValueError(f"Coverage mismatch: SQL={sql_cursor}, DSA={dsa_cursor}, SQL practice={practice_cursor}")
    return days


if __name__ == "__main__":
    document = {"version": 2, "phases": PHASES, "days": build()}
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(document['days'])} days to {OUTPUT.relative_to(ROOT)}")

---
title: "Apache Airflow for Data Engineers"
shortName: "Airflow"
description: "Airflow schedules and orchestrates pipelines as DAGs. Learn scheduling, task dependencies, retries and idempotent task design."
group: streaming
order: 6
keyFacts: ["Workflows are Python-defined DAGs","Retries are only safe if tasks are idempotent","Orchestrate work; do not run heavy processing inside Airflow"]
whatToLearnFirst: ["articles:airflow/dag-fundamentals-taskflow", "articles:airflow/dags-scheduling-retries"]
relatedTechnologies: ["python","kafka","spark"]
monogram: "Af"
lessons: ["articles:airflow/dag-fundamentals-taskflow","articles:airflow/operators-hooks-providers","articles:airflow/sensors-deferrable-operators","articles:airflow/dags-scheduling-retries","articles:airflow/xcom-variables-connections","articles:airflow/executors-scaling","articles:airflow/operations-backfills-monitoring","articles:airflow/best-practices-testing-cicd"]
updatedDate: 2026-10-05
---

Airflow is a workflow orchestrator: it decides what runs, when, in what order and what happens on failure. It does not process your data itself. It triggers tools that do.

The course follows the order you will need things on the job: DAGs, TaskFlow and dynamic tasks; operators, hooks and branching; sensors and deferrable operators; scheduling, logical dates and assets; XCom, Variables and secrets; executors and scaling; day-to-day operations; and finally idempotency, testing and CI/CD. Every lesson is written for Airflow 3 and names the Airflow 2 equivalents where they differ.

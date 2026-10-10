---
publishedDate: "2026-10-10"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "What does CI/CD look like for data pipelines?"
seoTitle: "CI/CD for Data Pipelines: Interview Answer"
description: "CI/CD for data pipelines, interview answer: lint and test each change, build in an isolated schema, diff against production and deploy safely."
technology: ["data-engineering", "airflow"]
topic: ["ci-cd", "testing", "deployment"]
difficulty: "Medium"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 8
interviewRelevance: "High"
shortAnswer: "On every pull request, CI lints Python and SQL, runs unit tests and DAG integrity tests, then builds the changed models into an isolated schema named after the pull request, using production data or a sample but never writing to production tables. Data tests and a diff against production run on that build, and a reviewer sees the results. On merge, CD deploys a versioned artifact (DAG bundle, container image or dbt project), applies schema migrations in an additive, reversible way, and schedules any backfill the change needs. CI uses least-privilege credentials from a secret store, and the CI schema is dropped afterwards."
followUps: ["How do you avoid rebuilding the whole dbt project on every pull request?", "How do you roll back a bad change to a table, not just to code?", "How do you test changes that need production-scale data?", "Where do secrets live in CI?"]
related: ["articles:etl-elt/testing-data-pipelines-cicd", "articles:airflow/best-practices-testing-cicd", "interview-questions:data-engineering/test-a-data-pipeline", "interview-questions:data-engineering/backfill-safely"]
sources:
  - { label: "dbt documentation: Node selection syntax (state method)", url: "https://docs.getdbt.com/reference/node-selection/methods" }
  - { label: "Apache Airflow documentation: Dag bundles", url: "https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html" }
  - { label: "GitHub Actions documentation: Workflow syntax", url: "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax" }
versionContext: "SQL verified on PostgreSQL 16.14; the CI workflow is illustrative and was not executed"
---

## Detailed explanation

CI/CD for data is CI/CD for software plus two extra concerns: **data** (a code change can silently change numbers) and **state** (tables persist across deployments, so you cannot just replace them like a stateless service).

### Continuous integration, on every pull request

1. **Static checks**: `ruff` for Python, `sqlfluff` for SQL, YAML and schema validation.
2. **Unit and DAG tests**: transformation functions, dbt unit tests, Airflow `DagBag` import tests (no import errors, no cycles, retries set).
3. **Isolated build**: create changed models in a schema such as `ci_pr_482`. With dbt, `--select state:modified+` builds only changed models and their descendants, and `--defer --state <prod manifest>` reads unchanged parents from production, which keeps CI to minutes.
4. **Data tests and diff**: run tests on the CI build and compare it with production per partition, so the reviewer sees "revenue for 3 days changes by 2%" before approving.

### Continuous delivery, on merge

1. **Versioned artifact**: a container image, a wheel or an Airflow 3 DAG bundle pinned to a commit, so you know exactly what runs and can roll back.
2. **Migrations**: additive and reversible (expand-contract). Add a column, backfill, move readers, then drop the old column in a later release.
3. **Backfill**: if the change alters history, schedule the backfill as part of the release.
4. **Cleanup**: drop CI schemas, and alert if the first production runs after the deploy fail checks.

### Environments and credentials

Developers build in personal dev schemas, CI in per-PR schemas, production only through CD. The CI role can create and drop `ci_*` schemas and read production, but cannot write production tables. Secrets come from the CI secret store or a cloud secret manager, never from the repository.

## Example: grant only what CI needs

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ci_runner') THEN CREATE ROLE ci_runner; END IF;
END $$;
CREATE SCHEMA prod;
CREATE TABLE prod.fct_orders (order_id bigint, amount numeric);
INSERT INTO prod.fct_orders VALUES (1, 10);
GRANT USAGE ON SCHEMA prod TO ci_runner;
GRANT SELECT ON ALL TABLES IN SCHEMA prod TO ci_runner;
CREATE SCHEMA ci_pr_482 AUTHORIZATION ci_runner;

-- As the CI role: reading production and building in its own schema works.
SET ROLE ci_runner;
CREATE TABLE ci_pr_482.fct_orders AS SELECT * FROM prod.fct_orders;
SELECT count(*) AS rows_in_ci_build FROM ci_pr_482.fct_orders;
RESET ROLE;
```

| rows_in_ci_build |
|------------------|
| 1 |

<!-- expect-error -->
```sql
-- Writing to production as the CI role fails.
SET ROLE ci_runner;
INSERT INTO prod.fct_orders VALUES (2, 20);
```

```text
ERROR:  permission denied for table fct_orders
```

## Trade-offs and pitfalls

- Full rebuilds in CI are simple but slow and expensive; slim CI needs a reliable production manifest.
- Building on a sample is cheaper but can miss problems that appear only at full volume or in rare values.
- Zero-copy clones (Snowflake, Databricks shallow clones) give realistic CI data cheaply where available.
- Rolling back code is easy; rolling back data needs a previous table version (time travel, snapshots) or a backfill with the old code.

## Common mistakes

1. CI that builds into, or has write access to, production.
2. No diff step, so number changes are discovered by consumers.
3. Destructive migrations (drop and recreate) in the same release as the code that needs them.
4. Deploying from a laptop, so production runs code that is not in version control.

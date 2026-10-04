---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "30-Day Data Engineering Fundamentals Plan"
description: "A four-week plan that covers SQL, Python, data modelling and an idempotent pipeline, with a concrete outcome to reach at the end of each week."
inventoryId: "ROAD-02"
technology: ["data-engineering"]
topic: ["study-plan"]
difficulty: "Beginner"
roadmapType: "study-plan"
related: ["roadmaps:data-engineer-roadmap"]
stages: [{"id": "week-1", "title": "Week 1: SQL that answers questions", "summary": "Joins, aggregation and row counts. Write 20 or more queries against a sample dataset.", "estimatedEffort": "8–12 hours", "prerequisites": [], "resources": ["articles:sql/joins"], "outcome": "You can predict the row count of a join before running it."}, {"id": "week-2", "title": "Week 2: Window functions", "summary": "Ranking, top N per group, LAG/LEAD and running totals.", "estimatedEffort": "8–12 hours", "prerequisites": [], "resources": ["articles:sql/window-functions", "interview-questions:sql/window-functions-vs-group-by"], "outcome": "You can solve top-N-per-group and deduplication with window functions."}, {"id": "week-3", "title": "Week 3: Model the data", "summary": "Facts, dimensions, grain and a star schema for one business process.", "estimatedEffort": "8–12 hours", "prerequisites": [], "resources": ["articles:data-warehousing/star-schema", "articles:etl-elt/etl-vs-elt"], "outcome": "You have a written star schema with a stated grain."}, {"id": "week-4", "title": "Week 4: Build a rerunnable load", "summary": "Python loader with an upsert, a transaction, logging and tests.", "estimatedEffort": "10–14 hours", "prerequisites": [], "resources": ["articles:python/idempotent-csv-loader", "projects:csv-to-warehouse-pipeline"], "outcome": "You have a loader whose test proves running it twice changes nothing."}]
---

This plan compresses the first stages of the [Data Engineer roadmap](/data-engineering/roadmap/) into four weeks. Each week has one outcome. Do not move on until you can meet it; slipping a week is better than skipping understanding.

## How to use it

- Block the hours in your calendar before the week starts.
- Write your answers and code in a Git repository so you can show your work later.
- At the end of each week, explain that week's outcome out loud in two minutes. If you cannot, repeat the hardest part.

---
previous: "projects:real-time-analytics-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "Fraud Detection Data Pipeline"
description: "An advanced project: build the data pipeline behind fraud detection, with streaming features, rule-based flags, a feature table for models and a review queue."
inventoryId: "PROJ-07"
technology: ["kafka", "spark", "python"]
topic: ["streaming", "features"]
level: "Advanced"
problemStatement: "Build the data side of a fraud-detection system: compute per-card behavioural features from a transaction stream, flag suspicious transactions with transparent rules, and maintain a feature table that a model could use."
requirements: ["Stream synthetic card transactions through Kafka", "Compute rolling features per card (count and amount in the last 10 minutes and 24 hours, distinct merchants)", "Flag transactions with explainable rules", "Write flags to a review queue and features to a table", "Keep raw transactions for backtesting rules"]
technologies: ["Kafka", "Spark Structured Streaming", "Python", "Delta Lake or PostgreSQL"]
dataset: "Generate synthetic transactions with injected fraud-like patterns, or use a public synthetic fraud dataset whose licence permits reuse. Do not use real card data."
steps: ["Generate transactions, including injected suspicious patterns", "Compute windowed features per card with event-time windows", "Join features to each transaction", "Apply documented rules (for example many transactions in a short window, or unusually high amounts relative to the card's history)", "Write flagged transactions with the rule that fired to a review table", "Backtest rules on stored raw data and measure how many injected patterns they catch", "Document limitations"]
testing: ["Unit tests for each rule with crafted inputs", "Backtest on generated data with known injected patterns"]
dataQuality: ["Features non-null after warm-up", "Every flag records the rule and feature values that triggered it"]
monitoring: ["Flag rate over time (sudden changes indicate data or rule problems)", "Streaming latency and lag"]
costConsiderations: ["Runs locally", "State size grows with the number of active cards and window lengths"]
interviewQuestions: ["Why compute features in streaming rather than batch?", "How do you avoid using future information when backtesting?", "How do you explain why a transaction was flagged?", "How would a machine-learning model use your feature table?"]
resumeBullets: ["Built a streaming fraud-detection data pipeline computing per-card rolling features and explainable rule flags from a Kafka transaction stream", "Backtested rules on stored synthetic data with injected patterns and documented detection rate and limitations"]
extensions: ["Train a simple model on the feature table and compare it with rules", "Add feedback from reviewers to label data"]
related: ["system-designs:real-time-analytics-pipeline", "articles:etl-elt/batch-vs-streaming", "articles:kafka/topics-partitions-consumer-groups"]
---

## Business context

Fraud teams need suspicious transactions surfaced quickly, with a reason they can act on. Data engineers build the features and the plumbing; this project focuses on that part and keeps the detection logic transparent.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Transactions arrive on a Kafka topic.</li>
<li>Spark computes rolling features per card.</li>
<li>Features join each transaction; rules evaluate them.</li>
<li>Flagged transactions go to a review table with the triggering rule.</li>
<li>Raw transactions and features are stored for backtesting and modelling.</li>
</ol>
<figcaption>Features are computed once and used both for live rules and for later model training.</figcaption>
</figure>

When you report detection results, report them on your synthetic data and describe how the patterns were generated. Results on synthetic data do not show real-world performance.

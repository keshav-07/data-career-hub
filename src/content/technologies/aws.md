---
title: "AWS for Data Engineers"
shortName: "AWS"
description: "AWS for Data Engineers: S3, IAM, Lambda, Glue, Athena, Redshift, EMR, Kinesis, Step Functions, Lake Formation and how they fit into one data platform."
group: cloud
order: 12
keyFacts: ["S3 is the storage layer almost every AWS data platform is built on", "IAM roles, not long-lived keys, give pipelines their permissions", "The Glue Data Catalog lets Athena, Redshift Spectrum, EMR and Glue share one set of table definitions", "Serverless services bill per use, so data layout and file sizes drive cost as much as compute choices"]
whatToLearnFirst: ["articles:aws/aws-for-data-engineers"]
relatedTechnologies: ["spark", "kafka", "airflow", "snowflake"]
monogram: "AWS"
lessons: ["articles:aws/aws-for-data-engineers", "articles:aws/s3-for-data-engineers", "articles:aws/iam-for-data-engineers", "articles:aws/lambda-for-data-pipelines"]
updatedDate: 2026-10-05
---

Amazon Web Services is the most common cloud in Data Engineer job descriptions. An AWS data platform is usually a lake in Amazon S3, described by the AWS Glue Data Catalog, loaded by streaming and batch ingestion, transformed with Spark on Glue or EMR, queried with Athena or Redshift, orchestrated with Step Functions or Airflow, governed with IAM and Lake Formation, and watched with CloudWatch.

Start with the map of the AWS data stack, then S3 and IAM, because every other service depends on them. After that, follow the lessons in order or jump to the service your team uses.

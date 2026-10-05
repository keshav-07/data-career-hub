---
title: "Apache Kafka and Real-Time Data Engineering"
shortName: "Kafka"
description: "Kafka is a distributed log used for streaming data. Learn topics, partitions, consumer groups and delivery semantics before building streaming pipelines."
group: streaming
order: 5
keyFacts: ["Ordering is guaranteed only within a partition","Consumer groups scale reads by partition","Exactly-once needs care end to end"]
whatToLearnFirst: ["articles:kafka/topics-partitions-consumer-groups"]
relatedTechnologies: ["spark","airflow","data-warehousing"]
monogram: "Kf"
lessons: ["articles:kafka/kafka-real-time-data-engineering", "articles:kafka/topics-partitions-consumer-groups", "articles:kafka/kafka-vs-message-queues"]
updatedDate: 2026-10-04
---

Kafka stores events in partitioned, replicated logs that many consumers can read independently. It decouples producers from consumers and is the backbone of many streaming and change-data-capture designs.

Learn how partitions and consumer groups relate before you tune anything. Most Kafka interview questions come back to those two ideas.

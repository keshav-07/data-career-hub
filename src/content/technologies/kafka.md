---
title: "Apache Kafka and Real-Time Data Engineering"
shortName: "Kafka"
description: "Kafka is a distributed log used for streaming data. Learn topics, partitions, consumer groups and delivery semantics before building streaming pipelines."
group: streaming
order: 5
keyFacts: ["Ordering is guaranteed only within a partition","Consumer groups scale reads by partition","Kafka 4.x runs on KRaft only; ZooKeeper is gone","Exactly-once needs care end to end"]
whatToLearnFirst: ["articles:kafka/topics-partitions-consumer-groups", "articles:kafka/producers", "articles:kafka/consumers-offsets"]
relatedTechnologies: ["spark","airflow","data-warehousing"]
monogram: "Kf"
lessons: ["articles:kafka/kafka-real-time-data-engineering", "articles:kafka/topics-partitions-consumer-groups", "articles:kafka/log-storage-retention-compaction", "articles:kafka/producers", "articles:kafka/consumers-offsets", "articles:kafka/consumer-groups-rebalancing", "articles:kafka/replication-isr", "articles:kafka/delivery-semantics-exactly-once", "articles:kafka/kafka-connect-debezium", "articles:kafka/schema-registry-schema-evolution", "articles:kafka/kafka-streams-basics", "articles:kafka/kafka-vs-message-queues"]
cheatSheet: "cheat-sheets:kafka"
updatedDate: 2026-10-09
---

Kafka stores events in partitioned, replicated logs that many consumers can read independently. It decouples producers from consumers and is the backbone of many streaming and change-data-capture designs.

Learn how partitions and consumer groups relate before you tune anything. Most Kafka interview questions come back to those two ideas. The course then follows a record through the system: how it is stored, how producers write it, how consumers read and commit it, how replication keeps it safe, what exactly-once really covers, and how Connect, Schema Registry and Kafka Streams are used around the core log.

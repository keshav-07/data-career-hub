---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "What does exactly-once mean in Kafka, and how is it achieved?"
seoTitle: "Kafka Exactly-Once Semantics: Interview Answer"
description: "Interview answer: exactly-once combines the idempotent producer, transactions, read_committed and fencing for Kafka-to-Kafka work; sinks need idempotency."
technology: ["kafka"]
topic: ["exactly-once", "transactions", "delivery-semantics"]
difficulty: "Hard"
questionType: ["conceptual", "architecture"]
estimatedMinutes: 12
interviewRelevance: "High"
shortAnswer: "In Kafka, exactly-once means that for a pipeline reading from and writing to Kafka, each input record's effect appears once in the output topics and in the committed consumer offsets, even across retries and crashes. It is built from the idempotent producer (no duplicates from retries), transactions that atomically commit output records and input offsets (sendOffsetsToTransaction), consumers reading with isolation.level=read_committed, and a stable transactional.id that fences zombie instances. Kafka Streams enables all of it with processing.guarantee=exactly_once_v2. Writes to external systems are outside this guarantee and need idempotent upserts or offsets stored atomically in the sink."
followUps: ["What is zombie fencing and why does it need a stable transactional.id?", "Why can a read_committed consumer stall?", "How do you get exactly-once into PostgreSQL or a data lake table?", "Does enabling idempotence alone give exactly-once?"]
related: ["articles:kafka/delivery-semantics-exactly-once", "interview-questions:kafka/at-least-once-delivery", "interview-questions:kafka/acks-min-insync-replicas-durability", "system-designs:payment-events-pipeline-exactly-once"]
versionContext: "Apache Kafka 4.x transactions (KIP-890 transaction protocol v2 enabled in 4.0) and confluent-kafka 2.x for Python. The transactional loop needs a broker and is marked noexec; it was checked against the confluent-kafka API documentation."
sources:
  - { label: "Apache Kafka documentation: Message delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
  - { label: "confluent-kafka Python client documentation", url: "https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html" }
---

## Detailed explanation

Failures can create duplicates in three places: the producer retries a write whose acknowledgement was lost, a consumer crashes after writing output but before committing its offset, and an old instance that was presumed dead keeps writing. Kafka's exactly-once semantics (EOS) closes each one:

| Building block | Fixes |
|----------------|-------|
| **Idempotent producer** (default since 3.0) | Retries cannot write a batch twice or reorder it within a partition |
| **Transactions** | Output records to many partitions **and** the input offsets commit atomically; on abort, none of it is visible |
| **`read_committed` consumers** | Downstream readers skip aborted records and wait for open transactions |
| **Stable `transactional.id` and epochs** | A restarted instance bumps the epoch; the old "zombie" gets `ProducerFencedException` and cannot commit |

The key move is `sendOffsetsToTransaction`: the consumer's progress is committed **inside** the producer's transaction. A crash before commit aborts both the outputs and the offset advance, so the replacement instance reprocesses from the old offset and writes the outputs again, while downstream `read_committed` readers only ever see one committed copy.

**Scope** is the part interviewers listen for. EOS covers Kafka-to-Kafka read-process-write. A database, an S3 file, an email or an HTTP call made during processing is outside it. For those sinks you get exactly-once **effects** by making writes idempotent (upsert by event ID) or by storing the Kafka offset in the same database transaction as the data and seeking to it on start-up.

## Example

The consume-transform-produce loop with confluent-kafka:

<!-- noexec -->
```python
from confluent_kafka import Consumer, KafkaException, Producer

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "transfer-auditor",
    "enable.auto.commit": False,
    "isolation.level": "read_committed",       # never read aborted input
    "auto.offset.reset": "earliest",
})
producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "transactional.id": "transfer-auditor-0",  # stable per instance: enables fencing
})

consumer.subscribe(["transfers"])
producer.init_transactions()                   # fences older producers with this id

while True:
    msgs = consumer.consume(num_messages=500, timeout=1.0)
    if not msgs:
        continue
    producer.begin_transaction()
    try:
        for msg in msgs:
            if msg.error():
                raise KafkaException(msg.error())
            producer.produce("transfer-audit", key=msg.key(), value=b"audited: " + msg.value())
        # Commit the input offsets as part of the same transaction
        producer.send_offsets_to_transaction(
            consumer.position(consumer.assignment()),
            consumer.consumer_group_metadata(),
        )
        producer.commit_transaction()
    except KafkaException as err:
        if err.args[0].txn_requires_abort():
            producer.abort_transaction()
            # rewind to the last committed offsets so the batch is reprocessed
            for tp in consumer.committed(consumer.assignment()):
                consumer.seek(tp)
        else:
            raise                              # fatal, e.g. fenced: stop this instance
```

In Kafka Streams the same behaviour is one setting: `processing.guarantee=exactly_once_v2`.

## Trade-offs and pitfalls

- **Latency and throughput**: each commit writes markers to every touched partition. Commit per batch or per time interval, not per record.
- **Downstream must opt in**: consumers default to `read_uncommitted` and will see aborted records.
- **Hanging transactions** hold back the last stable offset, so `read_committed` readers of that partition stall until the transaction ends or `transaction.timeout.ms` aborts it.
- **Random `transactional.id` per start** disables fencing.
- **Side effects inside processing** (API calls, emails) repeat on retry; transactions cannot undo them.
- **Idempotence alone is not EOS**: it only protects producer retries within one producer session.

## Common mistakes

1. Claiming Kafka transactions make writes to PostgreSQL or S3 exactly-once.
2. Committing offsets with `consumer.commit()` inside the transactional loop, which breaks atomicity.
3. Treating `ProducerFencedException` as retriable.

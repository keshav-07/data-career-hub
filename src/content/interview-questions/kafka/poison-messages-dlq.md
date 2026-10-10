---
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "How do you handle poison messages and dead-letter topics in Kafka?"
seoTitle: "Kafka Poison Messages and DLQs: Interview Answer"
description: "Interview answer: handle Kafka poison messages by separating permanent from transient failures, parking bad records in a dead-letter topic and retrying."
technology: ["kafka"]
topic: ["error-handling", "dead-letter-queue", "consumers"]
difficulty: "Medium"
questionType: ["scenario", "debugging"]
estimatedMinutes: 10
interviewRelevance: "High"
shortAnswer: "A poison message is a record a consumer can never process, such as bytes that fail to deserialise or a value that breaks a business rule. Because a Kafka partition is read in order, the consumer cannot move past it on its own, so the partition stalls and lag grows. Classify failures: permanent errors (bad format, schema violation) go straight to a dead-letter topic with headers recording the source topic, partition, offset and error, and the consumer commits past them; transient errors (a database timeout) are retried with backoff, in place or through retry topics, and only dead-lettered after a limit. Alert on DLQ growth and have a replay tool. Kafka Connect provides this with errors.tolerance and errors.deadletterqueue.topic.name."
followUps: ["Why does a retry topic break per-key ordering, and when is that acceptable?", "How do you replay records from a DLQ after a fix?", "How does a schema registry reduce poison messages?", "How do Kafka 4.2 share groups change retry handling?"]
related: ["articles:kafka/consumers-offsets", "articles:kafka/kafka-connect-debezium", "interview-questions:kafka/consumer-lag-causes-fixes", "interview-questions:kafka/schema-evolution-schema-registry", "interview-questions:kafka/kafka-ordering-guarantees"]
versionContext: "Apache Kafka 4.x and confluent-kafka 2.x for Python. The consumer with a DLQ needs a broker and is marked noexec; it was checked against the client documentation. The routing simulation runs on plain Python 3.11."
sources:
  - { label: "Apache Kafka documentation: Kafka Connect error reporting", url: "https://kafka.apache.org/documentation/#connect_errorreporting" }
  - { label: "confluent-kafka Python client documentation", url: "https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html" }
---

## Detailed explanation

### Why poison messages hurt more in Kafka

A queue can set one bad message aside and hand out the next. A Kafka consumer reads a partition in offset order and commits a single position; if it keeps failing on offset 1,042, it either crashes and restarts at 1,042 forever, or skips it silently. Both are bad: the first stalls the partition (lag on one partition only is the tell-tale sign), the second loses data without a trace.

### Classify the failure

| Failure | Example | Handling |
|---------|---------|----------|
| Permanent, record-level | Invalid JSON, schema ID unknown, required field missing | Send to the DLQ at once, commit past it |
| Transient, external | Database timeout, rate-limited API | Retry with exponential backoff; after N attempts, DLQ (or pause the partition) |
| Systemic | Sink down for everyone, bug in a new release | Stop or pause consumption and alert; dead-lettering everything just moves the outage |

### Patterns

1. **Dead-letter topic**: produce the original key and value bytes to `<topic>.dlq` with headers (source topic, partition, offset, error class and message, timestamp, attempt count). Keep the DLQ's retention long and its replication factor production-grade.
2. **Retry topics**: for transient errors without blocking the main partition, route to `orders.retry.1m`, `orders.retry.10m` and so on, consumed with a delay, then to the DLQ. This gives up per-key order for that record; do not use it where order matters (CDC applies), and prefer in-place retries with `pause()` there.
3. **Pause and retry in place**: for ordered streams, `pause()` the partition, retry with backoff, then `resume()`. Order is kept; the partition waits.
4. **Prevention**: a schema registry rejects incompatible schemas at produce time, which removes most format poison pills.
5. **Frameworks**: Kafka Connect sinks support `errors.tolerance=all` with `errors.deadletterqueue.topic.name` and context headers; Kafka Streams has deserialisation and production exception handlers; Kafka 4.2 share groups track delivery attempts per record and stop redelivering after a limit.

## Example

A consumer that dead-letters permanent failures and retries transient ones:

<!-- noexec -->
```python
import json, time
from confluent_kafka import Consumer, Producer

consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": "orders-loader",
                     "enable.auto.commit": False, "auto.offset.reset": "earliest"})
dlq = Producer({"bootstrap.servers": "localhost:9092", "enable.idempotence": True})
consumer.subscribe(["orders"])

class TransientError(Exception):
    pass

def dead_letter(msg, err, attempts):
    dlq.produce("orders.dlq", key=msg.key(), value=msg.value(), headers=[
        ("source.topic", msg.topic().encode()), ("source.partition", str(msg.partition()).encode()),
        ("source.offset", str(msg.offset()).encode()), ("error", repr(err)[:500].encode()),
        ("attempts", str(attempts).encode()),
    ])
    dlq.flush(10)                       # make sure it is stored before committing past it

while True:
    msg = consumer.poll(1.0)
    if msg is None or msg.error():
        continue
    for attempt in range(1, 6):
        try:
            order = json.loads(msg.value())            # permanent failure if this raises ValueError
            write_to_warehouse(order)                  # may raise TransientError
            break
        except ValueError as err:
            dead_letter(msg, err, attempt)
            break
        except TransientError as err:
            if attempt == 5:
                dead_letter(msg, err, attempt)
            else:
                time.sleep(min(2 ** attempt, 30))      # keep well under max.poll.interval.ms
    consumer.commit(message=msg, asynchronous=False)
```

`write_to_warehouse` stands for your sink code. The routing decisions, as a runnable model:

```python
def route(record, failures):
    """failures: list of exceptions raised by successive attempts; empty means success."""
    for attempt, err in enumerate(failures, start=1):
        if err == "bad_json":
            return f"DLQ after {attempt} attempt(s): permanent"
        if attempt == 5:
            return "DLQ after 5 attempts: transient limit reached"
    return f"processed after {len(failures)} retries"

cases = {"order-1": [], "order-2": ["bad_json"], "order-3": ["timeout", "timeout"],
         "order-4": ["timeout"] * 5}
for rec, fails in cases.items():
    print(rec, "->", route(rec, fails))
```

```text
order-1 -> processed after 0 retries
order-2 -> DLQ after 1 attempt(s): permanent
order-3 -> processed after 2 retries
order-4 -> DLQ after 5 attempts: transient limit reached
```

## Trade-offs and pitfalls

- **Retry topics trade ordering for throughput**; in-place retries trade throughput for ordering.
- **Sleeping in the poll loop** counts against `max.poll.interval.ms`; long backoffs need `pause()` and a timer instead.
- **A DLQ nobody watches** is silent data loss. Alert on its rate, and build a replay tool that republishes fixed records to the source topic.
- **Dead-lettering during an outage** floods the DLQ; detect systemic failure (many consecutive errors) and stop instead.
- **Sensitive data**: DLQ records hold the original payload, so apply the same access controls and retention rules as the source topic.

## Common mistakes

1. Logging the error and continuing without committing past or parking the record, so it fails forever.
2. Using `errors.tolerance=all` in Connect without a DLQ.
3. Committing the offset before the DLQ write is acknowledged.

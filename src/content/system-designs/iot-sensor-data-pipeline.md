---
title: "Design an IoT Sensor Data Pipeline"
description: "A system-design case study for IoT telemetry: MQTT ingestion, device identity, out-of-order and duplicate readings, real-time alerting, time-series storage and downsampling."
technology: ["data-engineering", "kafka", "spark"]
topic: ["iot", "streaming", "time-series"]
difficulty: "Advanced"
publishedDate: "2026-10-06"
updatedDate: "2026-10-06"
reviewedDate: "2026-10-06"
problem: "An industrial company has 500,000 sensors on pumps, compressors and cooling systems across 2,000 sites, many on unreliable cellular links. Design a pipeline that ingests their telemetry securely, raises alerts on dangerous conditions within seconds, stores readings for dashboards and long-term analysis, and supports predictive-maintenance models, despite late, duplicated and out-of-order data."
functionalRequirements:
  - "Ingest telemetry from devices and site gateways over MQTT; send commands and configuration back"
  - "Authenticate every device and keep a registry of devices, sites, firmware and calibration"
  - "Detect threshold breaches and anomalies per device within seconds and alert operators"
  - "Serve recent high-resolution readings and long-term downsampled history to dashboards"
  - "Keep raw history for model training and investigations"
  - "Detect silent devices and data gaps"
nonFunctionalRequirements:
  - "Alert latency under 10 seconds from measurement for connected devices"
  - "No loss of readings buffered on devices during connectivity outages of up to 24 hours"
  - "Correct results despite duplicates, clock drift and out-of-order arrival"
  - "Device credentials individually revocable; no shared secrets across devices"
  - "Storage cost controlled for years of history"
scaleAssumptions:
  - "Assumption: 500,000 sensors, each sending one reading every 10 seconds = 50,000 readings/s average"
  - "Assumption: about 200 bytes per reading in JSON, less in a binary format"
  - "Assumption: peaks of 3× when sites reconnect after outages and flush buffers"
  - "Assumption: 30 days of raw readings hot, 5 years of 1-minute and hourly aggregates"
architectureSummary: "Devices publish to a managed MQTT broker (or site gateways aggregate local sensors and forward) with per-device X.509 certificates and QoS 1. A bridge forwards messages to Kafka, keyed by device id. A Flink job deduplicates on device sequence numbers, handles event time with watermarks, evaluates rules and anomaly models for alerts, and writes rollups. Raw readings land in a lakehouse for training; a time-series database serves recent data and downsampled history to dashboards. A device registry provides metadata and calibration for enrichment."
technologies:
  - "MQTT broker (AWS IoT Core, Azure IoT Hub, EMQX or HiveMQ) with per-device certificates"
  - "Edge gateways with local buffering"
  - "Apache Kafka as the durable stream"
  - "Apache Flink for deduplication, event-time windows and alerting (Spark Structured Streaming as alternative)"
  - "Time-series database (TimescaleDB, InfluxDB, or ClickHouse) for serving"
  - "Lakehouse (Delta Lake or Iceberg) on object storage for raw history and ML"
tradeoffs:
  - decision: "MQTT at the edge, Kafka in the core"
    alternative: "Devices write directly to Kafka or HTTP endpoints"
    reason: "MQTT suits constrained devices and flaky links (small overhead, persistent sessions, QoS); Kafka gives durable, replayable streams for many consumers"
    consequence: "A bridge between the two to operate; ordering guarantees differ between them"
  - decision: "QoS 1 with device sequence numbers and downstream dedup"
    alternative: "QoS 2 exactly-once delivery"
    reason: "QoS 1 is cheaper and widely supported; sequence numbers make duplicates harmless and expose gaps"
    consequence: "Every consumer must deduplicate or use deduplicated streams"
  - decision: "Event time with bounded lateness for alerts, batch reprocessing for history"
    alternative: "Processing time everywhere"
    reason: "Readings flushed after an outage belong to the time they were measured"
    consequence: "Alerts on very late data must be suppressed or marked historical"
  - decision: "Time-series database for serving plus lakehouse for history"
    alternative: "One store for everything"
    reason: "Fast recent-window queries for dashboards and cheap long-term columnar storage for ML"
    consequence: "Two stores to keep consistent; retention differs by store"
  - decision: "Edge gateways that buffer and pre-filter"
    alternative: "Every sensor connects directly to the cloud"
    reason: "Fewer connections, local buffering through outages, bandwidth savings"
    consequence: "Gateway software and fleet management to maintain"
interviewFollowUps:
  - "A site was offline for six hours and now flushes all its readings. What happens to alerts and dashboards?"
  - "How do you handle device clocks that drift or reset?"
  - "How do you detect a sensor that has stopped sending data?"
  - "MQTT QoS 0, 1 or 2: which would you use and why?"
  - "How would you store five years of readings without the cost exploding?"
  - "How do you push a calibration change or firmware update safely to 500,000 devices?"
related:
  - "system-designs:kafka-ingestion-system"
  - "system-designs:real-time-analytics-pipeline"
  - "articles:kafka/kafka-real-time-data-engineering"
  - "articles:etl-elt/batch-vs-streaming"
  - "articles:data-warehousing/partitioning-clustering-data-layout"
previous: "system-designs:clickstream-data-platform"
versionContext: "The deduplication, rollup and gap SQL was run on PostgreSQL 16 (date_bin requires PostgreSQL 14 or later). Broker and Flink configuration is described, not executed."
sources:
  - { label: "HiveMQ: MQTT quality of service levels", url: "https://www.hivemq.com/blog/mqtt-essentials-part-6-mqtt-quality-of-service-levels/" }
  - { label: "Apache Flink 2.0.0 release announcement", url: "https://flink.apache.org/2025/03/24/apache-flink-2.0.0-a-new-era-of-real-time-data-processing/" }
  - { label: "Apache Kafka documentation: design", url: "https://kafka.apache.org/documentation/#design" }
  - { label: "PostgreSQL documentation: window functions", url: "https://www.postgresql.org/docs/current/tutorial-window.html" }
---

## Approach

IoT pipelines differ from web event pipelines in three ways: devices are **constrained and intermittently connected**, **clocks are unreliable**, and the data is **time series** with a very high volume of small, regular readings. Safety-related alerting also raises the stakes on latency. Ask:

- **Devices**: how many, how constrained, which protocols, direct to cloud or through site gateways?
- **Connectivity**: cellular, satellite, factory Wi-Fi? How long are outages, and can devices buffer?
- **Use cases**: real-time alerts, operator dashboards, predictive maintenance, billing or compliance reporting?
- **Latency**: seconds for safety alerts, minutes for dashboards, daily for analytics?
- **Commands**: does the platform send configuration, commands or firmware to devices?
- **Retention and regulation**: how long must raw readings be kept?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Devices and gateways</strong>: sensors sample locally; gateways buffer readings on disk during outages and publish over MQTT with TLS and per-device certificates.</li>
<li><strong>MQTT broker</strong>: authenticates devices, enforces topic permissions (a device may only publish to its own topics), and keeps persistent sessions for QoS 1 delivery.</li>
<li><strong>Bridge to Kafka</strong>: forwards telemetry to a Kafka topic keyed by device id; commands flow back the other way.</li>
<li><strong>Stream processing (Flink)</strong>: deduplicates on device sequence number, assigns event time from the device timestamp with watermarks, enriches from the device registry, evaluates alert rules, and computes 1-minute rollups.</li>
<li><strong>Storage</strong>: raw readings to the lakehouse (partitioned by date, clustered by device); recent raw and rollups to a time-series database for dashboards.</li>
<li><strong>Consumers</strong>: alerting and incident tools, operator dashboards, ML training and batch scoring for predictive maintenance.</li>
</ol>
<figcaption>MQTT handles the unreliable edge, Kafka the durable core, and event-time stream processing turns messy telemetry into alerts and clean series.</figcaption>
</figure>

Pump 7 publishes a reading every 10 seconds with its device id, a sequence number and the measured timestamp. The broker forwards each message to Kafka. Flink keys the stream by device, drops a redelivered duplicate, and sees the temperature exceed 70 °C for three consecutive readings, which a rule turns into a critical alert within a few seconds. The same readings update 1-minute rollups in the time-series database, where the operator's dashboard shows the spike. Overnight, raw readings in the lakehouse feed a model that predicts bearing failure from vibration and temperature trends.

## Device connectivity and MQTT

- **MQTT** is a lightweight publish/subscribe protocol designed for constrained devices: small headers, long-lived connections, and **QoS levels**: 0 (at most once), 1 (at least once, may duplicate), 2 (exactly once via a four-step handshake, at higher cost).
- Use **QoS 1** for telemetry and handle duplicates downstream; reserve QoS 2 for rare, critical commands if the stack supports it end to end.
- **Persistent sessions** let the broker hold QoS 1 messages for devices that disconnect, which matters for commands.
- **Device-side buffering** is what really prevents loss during long outages: the broker cannot store messages the device never sent. Gateways keep a disk-backed queue (24 hours here) and flush oldest first, at a throttled rate, when the link returns.
- **Managed brokers** (AWS IoT Core, Azure IoT Hub) provide device registries, certificate management and rules that forward to streams; self-managed brokers (EMQX, HiveMQ) give more control.

## Device identity and security

- One **X.509 certificate per device**, provisioned at manufacture or first boot; revocable individually.
- **Topic-level authorisation**: device `pump-7` may publish only to `telemetry/pump-7/#` and subscribe only to `commands/pump-7/#`.
- Signed firmware updates rolled out in stages with health checks.
- No personal data usually, but site locations and operational data are commercially sensitive: encrypt and restrict.

## Message design

Each reading carries `device_id`, a **monotonic sequence number** set by the device, `measured_at` (device clock), firmware version, and the measurements. Batch several readings per message to cut overhead. Prefer a compact binary encoding (Protobuf, CBOR) on bandwidth-constrained links, converted to Avro or Parquet in the core.

## Duplicates, gaps and late data

QoS 1 redeliveries, gateway retries and reconnect flushes produce duplicates; outages produce late data; dropped packets produce gaps. The example below (PostgreSQL 16) deduplicates on `(device_id, seq)`, builds 1-minute rollups with `date_bin`, and finds sequence gaps.

```sql
CREATE TABLE readings (
  device_id   TEXT,
  seq         BIGINT,          -- per-device sequence number set by the device
  measured_at TIMESTAMPTZ,     -- device clock
  temp_c      NUMERIC(5,2)
);
INSERT INTO readings VALUES
  ('pump-7', 101, '2026-10-05 10:00:05+00', 61.2),
  ('pump-7', 102, '2026-10-05 10:00:35+00', 61.9),
  ('pump-7', 102, '2026-10-05 10:00:35+00', 61.9),   -- QoS 1 redelivery
  ('pump-7', 104, '2026-10-05 10:01:35+00', 74.5),   -- seq 103 missing
  ('pump-7', 105, '2026-10-05 10:02:05+00', 75.1),
  ('pump-7', 103, '2026-10-05 10:01:05+00', 68.0),   -- 103 arrives late
  ('fan-2',    1, '2026-10-05 10:00:10+00', 30.1),
  ('fan-2',    2, '2026-10-05 10:00:40+00', 30.3),
  ('fan-2',    5, '2026-10-05 10:02:10+00', 30.2);   -- 3 and 4 never arrive

-- 1-minute rollups after deduplicating on (device_id, seq)
SELECT device_id,
       date_bin('1 minute', measured_at, TIMESTAMPTZ '2026-01-01 00:00+00') AS minute,
       count(*)              AS samples,
       round(avg(temp_c), 2) AS avg_temp,
       max(temp_c)           AS max_temp
FROM (SELECT DISTINCT device_id, seq, measured_at, temp_c FROM readings) d
GROUP BY device_id, minute
ORDER BY device_id, minute;

-- gaps in the sequence (data loss on the device or network)
SELECT device_id, seq + 1 AS first_missing, next_seq - 1 AS last_missing
FROM (
  SELECT device_id, seq, LEAD(seq) OVER (PARTITION BY device_id ORDER BY seq) AS next_seq
  FROM (SELECT DISTINCT device_id, seq FROM readings) s
) g
WHERE next_seq > seq + 1;
```

```text
 device_id |         minute         | samples | avg_temp | max_temp
-----------+------------------------+---------+----------+----------
 fan-2     | 2026-10-05 10:00:00+00 |       2 |    30.20 |    30.30
 fan-2     | 2026-10-05 10:02:00+00 |       1 |    30.20 |    30.20
 pump-7    | 2026-10-05 10:00:00+00 |       2 |    61.55 |    61.90
 pump-7    | 2026-10-05 10:01:00+00 |       2 |    71.25 |    74.50
 pump-7    | 2026-10-05 10:02:00+00 |       1 |    75.10 |    75.10

 device_id | first_missing | last_missing
-----------+---------------+--------------
 fan-2     |             3 |            4
```

The redelivered reading 102 was counted once, and reading 103 arrived out of order but landed in the right minute because rollups use the measured time. Pump 7 has no gap once 103 arrives; fan 2 has genuinely lost readings 3 and 4. Gap detection should therefore run after the lateness window closes, otherwise every late reading looks like a gap for a while.

In Flink the same ideas apply continuously: keyed state per device remembers recent sequence numbers (with a TTL) for deduplication, event-time windows produce rollups, and **watermarks** with bounded lateness (for example 2 minutes) decide when a window is complete. Readings later than that (a site flushing six hours of buffer) go to a side output that updates history in the lakehouse and recomputes affected rollups in a batch job, rather than triggering live alerts for conditions that ended hours ago.

## Clock problems

- Device clocks drift or reset to 1970 after power loss. Synchronise with NTP where possible, and record the broker receive time alongside the device time.
- Correct implausible timestamps: if `measured_at` is in the future or before the device's last known reading by a large margin, estimate it from the receive time and sequence number, and flag the reading.
- Sequence numbers give an ordering that does not depend on the clock.

## Alerting

- **Rules**: thresholds with persistence (three consecutive readings above the limit) and hysteresis (clear only below a lower limit) to avoid flapping.
- **Anomaly models**: per-device baselines or ML scoring in the stream for subtler failures.
- **Silent device detection**: a per-device timer in keyed state fires if no reading arrives within, say, three expected intervals; alert as "device offline" rather than leaving a dashboard flat.
- **Suppression**: alerts on readings older than a freshness limit are marked historical; maintenance windows suppress alerts for affected devices.
- Route alerts with device and site context from the registry to the on-call operator.

## Storage and downsampling

| Store | Contents | Retention | Purpose |
|---|---|---|---|
| Time-series DB | Raw readings | 30 days | Recent high-resolution dashboards |
| Time-series DB | 1-minute rollups (min, max, avg, count) | 1 year | Operational trends |
| Time-series DB | Hourly rollups | 5 years | Long-term trends |
| Lakehouse | Raw readings, Parquet, partitioned by date, clustered by device | Per policy, tiered to cheap storage | ML training, investigations, reprocessing |

Store **min, max, sum and count** in rollups, not only averages, so coarser rollups and correct averages can be derived later and spikes are not hidden. Time-series databases offer continuous aggregates or downsampling tasks and per-table retention; the lakehouse keeps the full-resolution record cheaply.

## Device registry and enrichment

The registry holds device type, site, firmware, installation date and **calibration parameters**. Flink broadcasts registry changes (from a CDC stream of the registry database) to all tasks and joins them to readings, applying calibration in the stream. Keep calibration history with validity periods, so historical reprocessing applies the calibration that was valid at measurement time.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Site outage, then a reconnect flood | Spike of late data, broker and Kafka load | Gateway throttled flush; Kafka absorbs bursts; late side output; autoscaling consumers |
| Broker outage | Devices cannot publish | Devices buffer; multi-AZ managed broker |
| Flink job failure | Alerts delayed | Restart from checkpoint; alert on job health separately from device alerts |
| Bad firmware sends wrong units | Wrong values and false alerts | Firmware version in every reading; staged rollouts; quarantine readings by firmware version |
| Clock reset on a device | Readings in 1970 | Timestamp sanity rules using receive time and sequence numbers |
| Compromised device | Bogus data or attack | Revoke certificate; topic ACLs limit blast radius |

## Scaling to 10×

At 5 million sensors (500,000 readings/s): more gateway aggregation and batching per message, partitioning Kafka by device id hash across more partitions, scaling Flink parallelism with keyed state sized per device, and sharding the time-series database by device or site. Consider edge analytics (computing rollups and simple alerts on gateways) so only aggregates and anomalies travel to the cloud for low-value sensors.

## Monitoring and SLAs

- Connected devices, messages per second and silent devices per site.
- Duplicate rate and sequence-gap rate per device type and firmware.
- End-to-end latency from measured time to alert; watermark lag in Flink.
- Late-data volume after reconnects.
- Storage growth per tier.

## Capacity estimate

- **Ingest**: 500,000 sensors × 0.1 readings/s = 50,000 readings/s; × 200 bytes ≈ 10 MB/s ≈ 860 GB/day in JSON. Peak flushes at 3× ≈ 30 MB/s.
- **Kafka**: 860 GB/day × 3 days × 3 replicas ≈ 7.7 TB before compression; binary encoding and compression reduce this several times.
- **Lakehouse**: Parquet compresses regular numeric series well; assume 10× smaller than JSON ≈ 86 GB/day ≈ 31 TB/year.
- **Time-series DB raw tier**: 50,000 readings/s × 86,400 s × 30 days ≈ 130 billion readings; at an assumed 10 bytes per reading after time-series compression ≈ 1.3 TB.
- **Rollups**: 500,000 devices × 1,440 minutes/day ≈ 720 million 1-minute rows/day; at 1 year that is about 260 billion rows, so many teams keep 1-minute rollups for 90 days and hourly (12 million rows/day) for 5 years.
- **Flink state**: dedup state of recent sequence numbers for 500,000 devices × a few hundred bytes ≈ a few hundred MB, small.

## What a strong answer includes

- **MQTT at the edge with per-device identity** and **Kafka in the core**, with reasons.
- **Device-side buffering** as the real protection against loss during outages.
- **Sequence numbers** for deduplication and gap detection, and **event time** with watermarks.
- A clear policy for **very late data**: update history, do not raise stale alerts.
- **Silent-device detection** and alert design (persistence, hysteresis, suppression).
- **Tiered time-series storage** with rollups that keep min, max, sum and count.
- **Registry and calibration history** for correct enrichment and reprocessing.

## Common mistakes

- Trusting device clocks and processing time.
- Using QoS 2 everywhere for telemetry and paying for it in throughput and battery.
- Alerting on readings flushed hours later as if they were live.
- Treating missing data as zero, or not noticing a device has gone silent.
- Storing only averages in rollups, hiding spikes.
- Shared credentials across devices, so one compromised device exposes the fleet.
- Keeping all raw readings in the hot time-series tier forever.

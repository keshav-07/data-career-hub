---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Ride-Hailing Surge Pricing Pipeline"
description: "A system-design case study for dynamic pricing: driver and request streams, hexagonal geo cells, windowed supply and demand, smoothing, serving and auditability."
technology: ["data-engineering", "kafka", "spark"]
topic: ["streaming", "geospatial", "architecture"]
tags: ["surge-pricing", "h3", "stream-processing", "windowing", "feature-serving", "auditability"]
difficulty: "Advanced"
problem: "Design the data pipeline that computes a price multiplier for each small area of a city every few seconds from live supply (available drivers) and demand (ride requests and app opens), serves it to the pricing service with low latency, and keeps a complete record of every multiplier for audit, analysis and model training."
functionalRequirements:
  - "Ingest driver location and status updates and rider requests or price-quote events in real time"
  - "Map every event to a geographic cell and compute supply and demand per cell over short sliding windows"
  - "Compute a smoothed, capped multiplier per cell, including neighbouring cells' supply"
  - "Serve the current multiplier for any location in a few milliseconds to the quoting service"
  - "Record every published multiplier with its inputs and model version"
  - "Support city-level overrides (caps during emergencies, manual disable)"
nonFunctionalRequirements:
  - "Multipliers no more than 30 seconds old; quoting latency added by the lookup under 10 ms at p99"
  - "If the pipeline is late or down, pricing falls back safely (no surge) rather than using stale high values"
  - "Prices do not oscillate rapidly between updates"
  - "Every price shown to a rider is explainable after the fact"
  - "Location data protected and retained only as long as policy allows"
scaleAssumptions:
  - "Assumption: 1 million active drivers worldwide at peak, each sending a location update every 4 seconds (about 250,000 events per second)"
  - "Assumption: 50,000 price quotes or ride requests per second at peak"
  - "Assumption: about 500 cities; a busy city covered by around 10,000 cells of roughly 0.7 km² each"
  - "Assumption: multipliers recomputed every 10 to 30 seconds per cell"
architectureSummary: "Driver and rider events flow through Kafka keyed by city. A stateful stream processor maps coordinates to hexagonal cells, keeps the latest driver state, and aggregates supply and demand in short sliding windows per cell and neighbourhood. A pricing step applies the current model, smoothing, caps and overrides, then writes multipliers with a version and expiry to a low-latency key-value store read by the quoting service, and appends every published value to an audit log in the lakehouse."
technologies: ["Mobile ingestion gateway", "Apache Kafka", "Stateful stream processor (Flink, or Spark Structured Streaming)", "H3 hexagonal grid library", "In-memory key-value store for serving", "Lakehouse for audit log and training data", "Feature store or model registry for pricing model versions"]
tradeoffs:
  - decision: "Hexagonal cells (H3) at about 0.7 km²"
    alternative: "Square tiles, postcodes or city zones"
    reason: "Hexagons have uniform neighbour distances, and a fixed hierarchy allows coarser fallback cells where data is thin"
    consequence: "Cell boundaries ignore rivers and roads; neighbour smoothing is needed"
  - decision: "Processing-time-oriented short windows with a small lateness allowance"
    alternative: "Strict event-time windows with long watermarks"
    reason: "A price is about the market now; a location update 2 minutes late is useless for pricing"
    consequence: "Late events are dropped from pricing but still land in the audit and training data"
  - decision: "Partition by city"
    alternative: "Partition by cell or by driver"
    reason: "Neighbour calculations stay within one task; cities are independent markets"
    consequence: "Very large cities can become hot partitions and need sub-city sharding"
  - decision: "Publish multipliers with an expiry time"
    alternative: "Store the last value indefinitely"
    reason: "If the pipeline stalls, the quoting service sees expired values and falls back to no surge"
    consequence: "A pipeline outage silently removes surge, so outage alerts must be fast"
  - decision: "Smoothing and step limits on published values"
    alternative: "Publish the raw supply-demand ratio"
    reason: "Prevents prices jumping between quotes and gaming by drivers moving across a boundary"
    consequence: "Prices react more slowly to real spikes"
interviewFollowUps:
  - "How do you avoid counting a driver as supply in two cells at once?"
  - "The stream processor falls 3 minutes behind. What do riders see?"
  - "How would you test a new pricing model safely?"
  - "How do you prove to a regulator what price a rider was quoted and why?"
  - "How would you handle a stadium event where demand spikes in one cell?"
  - "Why might sparse rural areas need a different cell size?"
related:
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:streaming-etl-with-kafka-spark"
  - "system-designs:kafka-ingestion-system"
  - "articles:kafka/topics-partitions-consumer-groups"
  - "articles:etl-elt/batch-vs-streaming"
versionContext: "H3 cell areas taken from the H3 resolution tables. The pricing curve and smoothing simulation is illustrative (not any company's real formula) and was run with Python 3 via scripts/verify-examples.py."
sources:
  - { label: "H3 documentation: overview of the H3 indexing system", url: "https://h3geo.org/docs/core-library/overview" }
  - { label: "H3 documentation: tables of cell statistics across resolutions", url: "https://h3geo.org/docs/core-library/restable" }
  - { label: "Apache Spark: Structured Streaming programming guide", url: "https://spark.apache.org/docs/4.0.0/streaming/apis-on-dataframes-and-datasets.html" }
previous: "system-designs:payment-events-pipeline-exactly-once"
next: "system-designs:social-media-feed-analytics-system"
---

## Approach

Surge pricing is a **real-time feature pipeline**: it turns raw location and request streams into one number per area, fast enough to be useful, stable enough to be fair, and recorded well enough to be explained. The pricing model itself (how a supply-demand imbalance maps to a multiplier) belongs to data scientists and economists; your job is to deliver correct, fresh inputs, serve the output safely and keep the evidence.

Do not claim to know how any specific ride-hailing company computes prices. Present your design as one reasonable approach.

Clarifying questions:

- **Freshness**: how old may a multiplier be? How fast must it react to a spike?
- **Granularity**: how small should an area be? Does it vary between dense cities and rural areas?
- **Signals**: supply = idle drivers only, or also drivers about to finish a trip? Demand = requests, app opens, or quotes?
- **Constraints**: caps, regulations, emergency overrides, fairness rules?
- **Failure behaviour**: what price do we show if the pipeline is down?
- **Audit**: who needs to reconstruct a past price, and how long must records be kept?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Apps</strong>: driver apps send location and status every few seconds; rider apps send quote requests and ride requests.</li>
<li><strong>Kafka</strong>: topics for driver updates and rider demand, keyed by city id, with short retention for the real-time path.</li>
<li><strong>Cell mapping</strong>: each event's latitude and longitude are mapped to an H3 cell at the city's chosen resolution.</li>
<li><strong>State and windows</strong>: latest state per driver (only the newest location counts); sliding windows count demand per cell; supply is a snapshot of idle drivers per cell.</li>
<li><strong>Pricing step</strong>: combines cell and neighbour supply and demand, applies the model, smoothing, caps and overrides.</li>
<li><strong>Serving store</strong>: multiplier per cell with version and expiry, read by the quoting service.</li>
<li><strong>Audit and training</strong>: every input aggregate and published multiplier appended to the lakehouse; quotes record the multiplier version they used.</li>
</ol>
<figcaption>A stateful stream turns locations into per-cell supply and demand; the serving store holds only short-lived, versioned prices.</figcaption>
</figure>

Walkthrough:

1. **Ingestion** goes through a gateway that authenticates devices, drops obviously invalid coordinates and batches events to Kafka.
2. **Keying by city** keeps each market's data together so neighbour calculations do not cross tasks.
3. **Cell mapping** uses H3, an open-source hexagonal grid system originally developed for Uber's data science needs (as its documentation states). At resolution 8, cells average about 0.74 km²; resolution 7 averages about 5.2 km² and can serve as a fallback for sparse areas.
4. **Driver state**: supply must count each driver once, in the cell of their **latest** position, and only when available. Keyed state per driver id holds the last update; a driver who stops sending updates expires after a timeout (for example 30 seconds), so dead phones do not count as supply.
5. **Pricing** reads cell and neighbourhood aggregates, so a cell with no drivers but plenty next door does not surge needlessly.
6. **Serving** is a plain key-value lookup by (city, cell), with the value carrying multiplier, version id and expiry.

## Data model

| Dataset | Key | Contents | Where |
|---|---|---|---|
| Driver updates | driver id | lat, lon, status, event time, app version | Kafka (hours) and lakehouse (policy-limited) |
| Demand events | request id | lat, lon, product type, event time | Kafka and lakehouse |
| Cell aggregates | (city, cell, window end) | open requests, idle drivers, neighbour totals | Lakehouse audit table |
| Published multipliers | (city, cell) | value, model version, computed at, expires at | Serving store |
| Multiplier history | (city, cell, version) | value, inputs, model version, overrides applied | Lakehouse, partitioned by city and date |
| Quotes | quote id | rider, cell, multiplier version, price | Pricing service database and lakehouse |

## Windows, state and lateness

- **Demand** is an event count, so it suits a sliding window (for example 2 minutes, sliding every 10 seconds).
- **Supply** is a state, not an event count: "how many idle drivers are in this cell **now**". Compute it from the latest driver state rather than counting location pings, which would overweight drivers whose phones send more often.
- **Lateness**: allow a few seconds for network jitter. A location update older than the current window's lateness allowance is ignored for pricing (the driver has moved since) but still recorded.
- **Timers** expire stale drivers and close windows even when a quiet cell receives no events.

## Pricing step: smoothing and safety

The following simulation uses an **illustrative** curve, not any company's real formula: the multiplier rises with the demand-to-supply ratio, is capped at 3.0, and is smoothed with a step limit so that each update moves the price at most 0.3.

```python
def raw_multiplier(open_requests, idle_drivers, sensitivity=0.5, cap=3.0):
    """Illustrative pricing curve: 1.0 when supply covers demand, rising with the ratio, capped."""
    ratio = open_requests / max(idle_drivers, 1)
    return min(cap, max(1.0, 1.0 + sensitivity * (ratio - 1.0)))

def smooth(previous, target, alpha=0.3, max_step=0.3):
    """Exponential smoothing plus a per-update step limit, rounded to 0.1."""
    proposed = previous + alpha * (target - previous)
    step = max(-max_step, min(max_step, proposed - previous))
    return round(previous + step, 1)

# One H3 cell, one row per 30-second window: (open requests, idle drivers)
windows = [(10, 12), (30, 10), (45, 9), (60, 8), (20, 15), (8, 20)]
m = 1.0
for requests, drivers in windows:
    target = raw_multiplier(requests, drivers)
    m = smooth(m, target)
    print(f"demand={requests:>2} supply={drivers:>2} target={target:.2f} published={m}")
```

```text
demand=10 supply=12 target=1.00 published=1.0
demand=30 supply=10 target=2.00 published=1.3
demand=45 supply= 9 target=3.00 published=1.6
demand=60 supply= 8 target=3.00 published=1.9
demand=20 supply=15 target=1.17 published=1.7
demand= 8 supply=20 target=1.00 published=1.5
```

The published value lags the target in both directions. That is the deliberate trade-off: fewer jarring jumps between consecutive quotes, at the cost of slower reaction. `max(idle_drivers, 1)` avoids division by zero in an empty cell; in practice an empty cell should borrow supply from its neighbours or fall back to the coarser parent cell rather than shoot to the cap.

Other safety rules applied in this step: city-level caps and emergency overrides (from a configuration service, applied last), minimum data thresholds (too few events → use the parent cell or 1.0), and a kill switch.

## Serving and failure behaviour

- The quoting service reads (city, cell) from an in-memory key-value store replicated per region; a single lookup is sub-millisecond on the server side.
- **Expiry**: each value carries `expires_at` (for example 2 minutes). Expired or missing means **1.0**. Failing safe here means riders are never charged a stale surge, but it also means an outage silently removes surge, so alert on pipeline freshness within a minute.
- The quote records the multiplier **version**, and the trip uses the quoted price, not a fresh lookup, so the rider pays what they saw.

## Exactly-once and idempotency

Pricing aggregates tolerate small duplicates (a duplicated location ping does not change "latest state"; demand counts can be deduplicated on request id within the window). What must be exact is the **audit trail**: each published multiplier has a unique (city, cell, version) key, and the lakehouse sink upserts on that key, so restarts and replays do not create conflicting history.

## Schema evolution and model changes

- Event schemas are versioned through a registry; the processor rejects coordinates outside valid ranges and unknown required fields.
- Pricing model versions come from a model registry. Roll out by city, or run a new model in **shadow mode** (computed and logged, not served) and compare before switching.
- Changing cell resolution for a city changes the meaning of history; record resolution with every aggregate.

## Security, privacy and fairness

- Driver and rider locations are sensitive personal data. Keep raw coordinates in a restricted zone, with retention set by policy; analytics use cell ids rather than coordinates where possible.
- Audit logs must show that pricing used only permitted inputs (location, time, supply, demand), not protected attributes of the rider.
- Manual overrides are logged with the operator and reason.

## Failure modes and recovery

| Failure | Effect | Response |
|---|---|---|
| Stream processor lagging | Multipliers stale, then expire to 1.0 | Alert on freshness; autoscale; the expiry protects riders |
| One city's partition hot (big event) | That city lags | Sub-city sharding by parent cell; pre-scale for scheduled events |
| GPS noise puts drivers in wrong cells | Supply misallocated | Validate speed between pings; snap or drop outliers |
| Bad model version | Wrong prices | Instant rollback via model registry; caps limit damage |
| Serving store node lost | Lookups fail for some keys | Replicas; quoting service falls back to 1.0 on miss |

## Monitoring and SLAs

- Age of the newest multiplier per city (freshness), and share of lookups that hit expired values.
- Processor lag and checkpoint duration; state size (number of tracked drivers).
- Distribution of multipliers per city; sudden jumps across many cells usually signal data problems, not demand.
- Quote-to-request conversion by multiplier band, for the pricing team.

## Cost

The high-volume stream is driver location. Reduce cost by sending updates less often when a driver is stationary, compressing topics, keeping Kafka retention short for the real-time path, and storing raw locations in the lakehouse in columnar form with time-based expiry. The serving store is tiny.

## Scaling to 10×

At 2.5 million location events per second: more Kafka partitions keyed by city and sub-city region; more processor parallelism with keyed state in a disk-backed store; regional deployments so each region's pipeline and serving store sit near its users. Neighbour calculations across shard boundaries need a small halo of boundary cells replicated to adjacent shards.

## Capacity estimate

Assumptions: 1 million active drivers at peak sending every 4 s, 200 bytes per update; 50,000 demand events/s at 500 bytes; 500 cities × about 10,000 cells in the largest, much fewer in most (assume 1 million active cells in total).

- **Driver updates**: 250,000/s × 200 B = 50 MB/s, about 4.3 TB/day uncompressed.
- **Demand**: 50,000/s × 500 B = 25 MB/s, about 2.2 TB/day.
- **Driver state**: 1 million drivers × ~200 bytes ≈ 200 MB across the cluster: easily held in memory.
- **Cell aggregates**: 1 million cells updated every 10 s = 100,000 updates/s into the serving store at most; in practice only changed values are written, far fewer.
- **Audit history**: 1 million cells × 8,640 updates/day ≈ 8.6 billion rows/day if all are kept. Keep every **published change** (most cells do not change most of the time) plus 1-minute snapshots, which reduces this by an order of magnitude.

## What a strong answer includes

- Hexagonal or similar geo cells with fallback to coarser cells for sparse data.
- Supply computed from latest driver state (counted once), demand from windowed events.
- Short windows, a small lateness allowance and a clear reason for preferring freshness over completeness.
- Smoothing, caps, overrides and an explicit fail-safe through expiry.
- Versioned multipliers with a full audit trail linking quotes to the version used.
- Privacy and fairness considerations for location data.

## Common mistakes

- Counting location pings as supply.
- Using long event-time watermarks that delay prices for completeness nobody needs.
- Serving the last value forever when the pipeline stops.
- Publishing raw ratios that oscillate.
- No record of which multiplier a rider was quoted.
- Claiming knowledge of a specific company's internal pricing algorithm.

---
publishedDate: "2026-10-05"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "Design a Geospatial Analytics Pipeline"
description: "A system-design case study for location analytics: GPS ingestion, cleaning, spatial indexes, scalable point-in-polygon joins, GeoParquet layout, privacy and cost."
technology: ["data-engineering", "spark", "delta-lake"]
topic: ["analytics", "geospatial", "architecture"]
tags: ["geospatial", "h3", "spatial-join", "geoparquet", "apache-sedona", "location-privacy"]
difficulty: "Advanced"
problem: "Design a pipeline for a delivery company that ingests GPS pings from couriers and order locations from customers, cleans and enriches them with geographic zones (cities, delivery zones, postcodes, store catchments), and produces analytics such as delivery times by zone, demand heatmaps and route efficiency, at both daily and near-real-time granularity."
functionalRequirements:
  - "Ingest courier GPS pings and order pickup and drop-off coordinates"
  - "Clean pings: remove invalid coordinates, duplicates and implausible jumps"
  - "Assign every point to zones (city, delivery zone, postcode, store catchment) with versioned zone boundaries"
  - "Compute trip metrics: distance travelled, time per leg, dwell time at pickup and drop-off"
  - "Produce demand and supply heatmaps by hexagonal cell and hour"
  - "Allow analysts to run ad-hoc spatial queries (orders within X km of a new store site)"
nonFunctionalRequirements:
  - "Daily zone-level metrics ready by 06:00; heatmaps for operations refreshed every 5 minutes"
  - "Spatial joins scale to billions of points without all-pairs comparisons"
  - "Results reproducible against the zone boundaries valid at the time of each event"
  - "Precise locations of customers and couriers protected; published outputs cannot identify individuals"
  - "Storage and compute cost proportional to data actually queried"
scaleAssumptions:
  - "Assumption: 200,000 active couriers at peak sending a ping every 5 seconds (40,000 pings per second)"
  - "Assumption: about 2 billion pings and 5 million orders a day"
  - "Assumption: 50,000 zone polygons across 300 cities, some with thousands of vertices"
  - "Assumption: 2 years of history kept for analysis"
architectureSummary: "Pings and order events flow through Kafka into a lakehouse. A cleaning job validates and deduplicates pings, filters GPS noise and assigns hexagonal cell ids. Zone assignment uses a two-step spatial join: candidate zones from a cell-to-zone index, then an exact point-in-polygon test, with polygons broadcast when small. Trip and zone metrics are computed in batch from cleaned points; a streaming job maintains cell-level heatmaps. Data is stored in Parquet-based tables with geometry encoded as WKB, partitioned by date and region and sorted by cell for pruning."
technologies: ["Apache Kafka", "Spark with a spatial library (for example Apache Sedona)", "H3 hexagonal indexing", "Lakehouse tables with Parquet (GeoParquet metadata or native geometry types)", "Spatial database (PostGIS) for small operational queries", "Orchestrator", "Map-based BI or visualisation tool"]
tradeoffs:
  - decision: "Index points with hexagonal cells (H3) at ingestion"
    alternative: "Store only raw latitude and longitude"
    reason: "Cell ids turn spatial filters and joins into equality joins and make heatmaps a simple GROUP BY"
    consequence: "Cells approximate shapes, so exact zone membership still needs a geometry test"
  - decision: "Two-step spatial join: cell-based candidates, then exact test"
    alternative: "Exact point-in-polygon test against every polygon"
    reason: "Reduces billions × thousands of comparisons to a handful per point"
    consequence: "A cell-to-zone index must be built and versioned with the zone boundaries"
  - decision: "Versioned zone boundaries with validity dates"
    alternative: "Always join to the current boundaries"
    reason: "Zones are redrawn; historical metrics must use the zones that applied at the time"
    consequence: "Joins include a validity condition, and storage keeps old versions"
  - decision: "Lakehouse with Spark for heavy processing, PostGIS for small interactive work"
    alternative: "Everything in one spatial database"
    reason: "Billions of points need distributed processing; analysts still want a rich spatial SQL for small datasets"
    consequence: "Two tools and a data movement step for the smaller curated tables"
  - decision: "Aggregate and coarsen locations for published outputs"
    alternative: "Expose point-level data to analysts"
    reason: "Location traces are highly identifying, even without names"
    consequence: "Some analyses need a privileged, audited environment"
interviewFollowUps:
  - "How do you join 2 billion points a day to 50,000 polygons efficiently?"
  - "Why is computing area or distance directly on latitude and longitude wrong, and what do you do instead?"
  - "A city redraws its delivery zones. How do you keep last year's metrics comparable?"
  - "How do you clean GPS noise such as a courier appearing to jump 3 km in one second?"
  - "How would you build a heatmap that cannot reveal individual customers' homes?"
  - "How would you handle points that fall exactly on a zone boundary?"
related:
  - "system-designs:ride-hailing-surge-pricing-pipeline"
  - "system-designs:scalable-lakehouse"
  - "articles:spark/partitions-shuffles-skew"
  - "articles:pyspark/joins-and-join-strategy"
  - "articles:data-warehousing/partitioning-clustering-data-layout"
  - "articles:delta-lake/parquet-vs-avro-vs-orc"
versionContext: "GeoParquet facts (WKB encoding, default OGC:CRS84 when no CRS is given, newer native Parquet GEOMETRY and GEOGRAPHY types) were checked against the GeoParquet specification source, and spatial join guidance against the Apache Sedona documentation source. The point-in-polygon example is plain Python run with Python 3 via scripts/verify-examples.py; production code would use a spatial library."
sources:
  - { label: "GeoParquet specification (source)", url: "https://github.com/opengeospatial/geoparquet/blob/main/format-specs/geoparquet.md" }
  - { label: "Apache Sedona documentation: SQL query optimiser", url: "https://sedona.apache.org/latest/api/sql/Optimizer/" }
  - { label: "H3 documentation source: overview of the H3 indexing system", url: "https://github.com/uber/h3/blob/master/website/docs/core-library/overview.md" }
  - { label: "H3 documentation source: tables of cell statistics", url: "https://github.com/uber/h3/blob/master/website/docs/library/restable.md" }
previous: "system-designs:real-time-leaderboard"
next: "system-designs:ad-bidding-analytics-pipeline"
---

## Approach

Geospatial pipelines are ordinary data pipelines with three extra hazards: **spatial joins** that explode if done naively, **coordinate systems** that make naive distance and area maths wrong, and **location privacy**, because a trace of points is one of the most identifying datasets a company holds. Build the answer around those.

Clarifying questions:

- **Data**: what points (GPS pings, order addresses, check-ins) and what shapes (zones, postcodes, store catchments, roads)?
- **Questions**: zone metrics, heatmaps, routes, proximity searches? Each needs different processing.
- **Precision**: how accurate is the GPS, and how precise must zone assignment be at boundaries?
- **Freshness**: daily analytics, or operational heatmaps every few minutes?
- **Boundaries over time**: do zones change, and must history use old boundaries?
- **Privacy**: who may see point-level data, and what may be published?

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Ingest</strong>: courier apps send batched pings; order systems emit pickup and drop-off coordinates; both go to Kafka keyed by courier or order id.</li>
<li><strong>Bronze</strong>: raw pings and orders appended to lakehouse tables partitioned by date.</li>
<li><strong>Clean</strong>: validate coordinates, deduplicate, drop implausible jumps, snap timestamps, assign H3 cell ids at a few resolutions.</li>
<li><strong>Zone assignment</strong>: candidate zones from a cell-to-zone index, exact point-in-polygon test, using zone versions valid at the event time.</li>
<li><strong>Trips and metrics</strong>: sessionise pings into trips and legs, compute distances on a suitable projection, dwell times and zone-level aggregates.</li>
<li><strong>Streaming heatmaps</strong>: a parallel job counts orders and available couriers per cell every 5 minutes for operations.</li>
<li><strong>Serve</strong>: aggregated tables for BI maps; curated smaller tables in PostGIS for interactive spatial SQL; restricted access to point-level data.</li>
</ol>
<figcaption>Index points by cell early; join to shapes in two steps; aggregate before anything leaves the restricted zone.</figcaption>
</figure>

## Coordinates, projections and formats

- GPS gives longitude and latitude on the WGS84 datum (EPSG:4326 order is latitude, longitude; many formats, including GeoParquet's default OGC:CRS84, use longitude, latitude). **Axis order mix-ups** are a classic bug: points land in the ocean or the wrong hemisphere.
- Distances and areas computed directly on degrees are wrong and vary with latitude. Use great-circle (haversine or geodesic) distance for point-to-point, and project to a local metric or equal-area projection for areas and buffers.
- Store geometry in Parquet as **WKB**: GeoParquet defines column metadata (encoding, CRS, bounding box), and the Parquet format itself now has native `GEOMETRY` and `GEOGRAPHY` logical types that newer writers and readers support (check your engines before relying on them). Record the CRS explicitly.
- Add bounding-box columns (or a covering column) and sort files by cell id so readers can skip files whose box does not intersect the query.

## Spatial joins at scale

Assigning 2 billion points to 50,000 polygons by testing every pair is 10¹⁴ tests. The standard approach is **filter, then refine**:

1. **Filter**: map each polygon to the grid cells (or bounding boxes) it covers, and each point to its cell. Join on cell id, an ordinary equality join, to get a few candidate polygons per point.
2. **Refine**: run the exact point-in-polygon test only on candidates.

A plain-Python illustration with a simple square grid standing in for H3:

```python
from collections import defaultdict
import math

def point_in_polygon(x, y, poly):
    """Ray casting: count edge crossings to the right of the point."""
    inside = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside

CELL = 1.0  # grid cell size in coordinate units (a stand-in for H3 or geohash cells)

def cell_of(x, y):
    return (math.floor(x / CELL), math.floor(y / CELL))

zones = {
    "centre": [(0, 0), (3, 0), (3, 3), (0, 3)],
    "harbour": [(3, 0), (6, 0), (4.5, 2.5)],
}

index = defaultdict(list)
for name, poly in zones.items():
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    for cx in range(math.floor(min(xs)), math.floor(max(xs)) + 1):
        for cy in range(math.floor(min(ys)), math.floor(max(ys)) + 1):
            index[(cx, cy)].append(name)

pings = {"p1": (1.2, 1.5), "p2": (4.4, 0.8), "p3": (5.6, 2.2), "p4": (7.0, 7.0)}
exact_tests = 0
for pid, (x, y) in pings.items():
    candidates = index.get(cell_of(x, y), [])
    matches = []
    for z in candidates:
        exact_tests += 1
        if point_in_polygon(x, y, zones[z]):
            matches.append(z)
    print(pid, "candidates", candidates, "->", matches or "no zone")
print("exact polygon tests:", exact_tests, "instead of", len(pings) * len(zones))
```

```text
p1 candidates ['centre'] -> ['centre']
p2 candidates ['harbour'] -> ['harbour']
p3 candidates ['harbour'] -> no zone
p4 candidates [] -> no zone
exact polygon tests: 3 instead of 8
```

`p3` is inside the harbour triangle's bounding box but outside the triangle itself: the filter step produces candidates, and only the refine step decides. At real scale the saving is many orders of magnitude.

In Spark, a spatial library such as Apache Sedona performs these joins with spatial partitioning and indexes, and broadcasts the smaller side automatically when it is below a threshold. With 50,000 polygons, broadcasting the polygon index to every executor and streaming points past it avoids a shuffle of billions of points. Very complex polygons (coastlines with thousands of vertices) can be subdivided into smaller pieces so each exact test is cheap.

**Boundaries**: decide a rule for points on an edge (for example "belongs to the zone with the lower id") and for points in no zone (assign "outside service area", never drop them silently).

## Cleaning GPS data

- Drop coordinates outside valid ranges, exact (0, 0) points, and points with poor reported accuracy.
- Deduplicate by (courier, device timestamp).
- Remove **implausible jumps**: compute speed between consecutive points per courier (a window function ordered by time) and drop points that imply speeds beyond what is physically possible for the vehicle.
- Optionally **map-match** to roads for route distance; straight-line distance between pings underestimates true route length.

## Data model and storage layout

| Table | Grain | Layout |
|---|---|---|
| `bronze.pings` | Raw ping | Partition by date |
| `silver.pings` | Cleaned ping with H3 cells (res 7, 9) and zone ids | Partition by date and region; sort by H3 cell |
| `ref.zones` | Zone version | Geometry (WKB), valid_from, valid_to, CRS |
| `ref.zone_cells` | Zone version × covering cell | Built from zone polygons per version |
| `silver.trips` | Trip leg | Distance, duration, dwell, start and end zones |
| `gold.zone_daily` | Zone × day | Orders, delivery time percentiles, courier hours |
| `gold.cell_hourly` | H3 cell × hour | Demand and supply counts (privacy-thresholded) |

## Late data and boundary changes

- Pings uploaded late (couriers in tunnels or offline) are processed by the daily job's lookback window (for example the last 2 days), recomputing affected trips and aggregates.
- Zone redraws create a new zone version with validity dates; historical facts keep the zone id assigned at the time, and a crosswalk table maps old zones to new for comparisons. Never re-assign all history to new boundaries without saying so.

## Data quality

- Share of pings dropped by each cleaning rule per city and app version.
- Share of points in no zone (a jump often means a missing or broken polygon).
- Polygon validity checks on load (self-intersections, unclosed rings, wrong axis order).
- Trip sanity: delivery legs with zero or impossible distances.

## Security and privacy

- Treat point-level location as sensitive personal data: restricted tables, short retention for raw pings, audit of access.
- Customer addresses are even more sensitive than courier traces; store them separately and use them only for necessary joins.
- Published outputs aggregate to cells of adequate size and suppress cells with fewer than a minimum number of distinct people (k-anonymity style thresholds). Beware of differencing attacks across overlapping cell resolutions.
- Trajectories can be re-identified from start and end points (home and work), so even pseudonymised traces must stay restricted.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| App release swaps latitude and longitude | Points in the wrong place, zone assignment collapses | Data-quality alert on no-zone share by app version; fix and reprocess |
| Zone file loaded with invalid polygons | Points unassigned | Validate on load; keep previous version active |
| Spatial join without broadcast or index | Job runs for hours or fails | Enforce the two-step join in shared code; monitor join run time |
| Skew: one dense city dominates a partition | Slow tasks | Partition by finer cells in dense regions; salting |
| Late pings after daily close | Trip metrics slightly off | Lookback window and restatement |

## Monitoring and SLAs

- Pipeline freshness (daily by 06:00, heatmaps every 5 minutes).
- Ping volume per city versus expected active couriers.
- Cleaning drop rates, no-zone rate, join run time and candidate-per-point ratio.

## Cost

Raw pings are the bulk. Keep raw pings for a short period, store cleaned pings compressed and sorted by cell for pruning, and aggregate early. Downsample old traces (for example keep one point per 30 seconds after 90 days) where analysis allows. Broadcast joins avoid expensive shuffles.

## Scaling to 10×

At 20 billion pings a day: process by region in parallel, keep the cell-to-zone index broadcast (it grows with zones, not with points), switch heatmaps to coarser cells where finer ones are unused, and consider moving trip building into the streaming path so the daily batch only aggregates.

## Capacity estimate

Assumptions: 2 billion pings a day at 60 bytes in compressed columnar form (raw JSON is far larger), 5 million orders, 50,000 zones averaging 200 vertices, 2 years retention for cleaned pings.

- **Ping rate**: 2 × 10⁹ / 86,400 ≈ 23,000/s average; 40,000/s at peak.
- **Cleaned storage**: 2 × 10⁹ × 60 B ≈ 120 GB/day; 2 years ≈ 88 TB. Downsampling after 90 days could cut that by a factor of several.
- **Polygons**: 50,000 × 200 vertices × 16 bytes ≈ 160 MB of coordinates; the cell-to-zone index at H3 resolution 8 (about 0.74 km² per cell) for, say, 100,000 km² of service area is about 135,000 cells, plus extra entries for cells on zone boundaries: small enough to broadcast.
- **Join work**: with about 1.2 candidate zones per point after filtering, 2 billion points need about 2.4 billion exact tests a day instead of 10¹⁴.
- **Heatmaps**: 135,000 cells × 24 hours ≈ 3.2 million rows a day per metric.

## What a strong answer includes

- Early spatial indexing (cells) and a two-step filter-and-refine join, with broadcast of the small side.
- Correct handling of coordinate systems, axis order, distances and areas.
- GPS cleaning rules, especially speed-based outlier removal.
- Versioned zone boundaries and a policy for boundary and out-of-zone points.
- Columnar storage with geometry as WKB, bounding boxes and cell-sorted files.
- Strong privacy controls, including aggregation thresholds for published maps.

## Common mistakes

- All-pairs point-in-polygon joins.
- Computing distances or areas directly on degrees.
- Swapping latitude and longitude.
- Joining history to current zone boundaries.
- Dropping points that fall outside all zones without counting them.
- Publishing fine-grained heatmaps that reveal individuals.

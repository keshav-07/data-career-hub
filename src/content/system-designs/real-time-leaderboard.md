---
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
title: "Design a Real-Time Leaderboard"
description: "A system-design case study for live leaderboards: score events, idempotent updates, sorted sets, tie-breaking, time-windowed boards, sharding, anti-cheat and recovery."
technology: ["data-engineering", "kafka"]
topic: ["streaming", "serving", "architecture"]
tags: ["leaderboard", "redis", "sorted-sets", "ranking", "idempotency", "top-k"]
difficulty: "Advanced"
problem: "Design a leaderboard for a mobile game with tens of millions of players: show the global top 100, each player's own rank and neighbours, friends and regional boards, and daily, weekly and all-time boards, all updated within a couple of seconds of a score change, and resilient to duplicates, cheating and component failures."
functionalRequirements:
  - "Accept score events from game servers (match results, achievements)"
  - "Show the global top 100 and a player's rank with players just above and below"
  - "Support daily, weekly, season and all-time boards, plus regional and friends boards"
  - "Break ties deterministically"
  - "Freeze and archive boards at the end of each period, with prizes based on final ranks"
  - "Remove players flagged for cheating and recompute affected ranks"
nonFunctionalRequirements:
  - "Score changes visible on the board within 2 seconds at p99"
  - "Top-100 and own-rank reads under 50 ms at p99, at peak read load"
  - "No double counting of a match result, even with retries"
  - "Final period results exact and auditable"
  - "Board can be rebuilt from durable storage after a cache loss"
scaleAssumptions:
  - "Assumption: 50 million players, 10 million daily active"
  - "Assumption: 5,000 score events per second on average, 50,000 at peak (tournament end)"
  - "Assumption: 100,000 leaderboard reads per second at peak"
  - "Assumption: on average 50 friends per player"
architectureSummary: "Game servers publish signed score events to Kafka, keyed by player. A score service validates events, deduplicates by match id, updates durable per-player totals in a database, and applies the new score to in-memory sorted sets (one per board and period) with a composite score for tie-breaking. Reads for top N and rank come from the sorted sets through a cache; friends boards are computed at read time from friends' scores. Period boards are snapshotted to durable storage at close, and every score change is also landed in the lakehouse for audit and analytics."
technologies: ["Apache Kafka", "Score service (stateless consumers)", "Durable database for player totals and processed match ids", "In-memory sorted sets (for example Redis sorted sets)", "Read cache or CDN for the top-N view", "Lakehouse for score history and audit", "Anti-cheat scoring service"]
tradeoffs:
  - decision: "In-memory sorted sets as the ranking structure"
    alternative: "ORDER BY score with an index in a relational database"
    reason: "Rank of a member and top-N are logarithmic-time operations on a skip-list-based structure; SQL rank over millions of rows per request is far slower"
    consequence: "Memory-bound and not the system of record; must be rebuildable from durable totals"
  - decision: "Durable per-player totals in a database as the source of truth"
    alternative: "Sorted set only"
    reason: "Cache loss or a bad deploy must not lose scores"
    consequence: "Two writes per event, with the database written first"
  - decision: "Composite score for tie-breaking"
    alternative: "Accept arbitrary order among equal scores"
    reason: "Prize rankings must be deterministic and fair (earlier achiever wins)"
    consequence: "Score encoding must fit floating-point precision"
  - decision: "Friends boards computed at read time"
    alternative: "Maintain one sorted set per player's friends"
    reason: "50 million friend boards would multiply every update by the number of friends"
    consequence: "Each friends-board read fetches up to a few hundred scores"
  - decision: "Exact global ranks for the top, approximate rank buckets for the long tail"
    alternative: "Exact rank for every player in every board"
    reason: "Players far from the top care about percentile, not position 23,456,789"
    consequence: "Two display modes; exact ranks still available at period close"
interviewFollowUps:
  - "A game server retries a match result three times. How do you avoid triple points?"
  - "The Redis node holding the global board restarts empty. What happens and how do you recover?"
  - "How do you implement a weekly board that resets every Monday in every time zone?"
  - "Two players reach 5,000 points in the same second. Who ranks higher?"
  - "A cheater is detected after the season ends. How do you correct the final ranks?"
  - "How would you scale a single board beyond what one node can handle?"
related:
  - "system-designs:real-time-analytics-pipeline"
  - "system-designs:kafka-ingestion-system"
  - "articles:etl-elt/idempotency-in-data-pipelines"
  - "articles:sql/window-functions"
  - "interview-questions:kafka/partitions-and-consumer-groups"
versionContext: "Redis sorted-set behaviour (O(log N) ZADD, ZINCRBY and ZREVRANK, lexicographic ordering of equal scores, ZREVRANGE deprecated since Redis 6.2 in favour of ZRANGE with REV) checked against the Redis documentation source. The tie-breaking simulation was run with Python 3 via scripts/verify-examples.py."
sources:
  - { label: "Redis documentation source: sorted sets", url: "https://github.com/redis/docs/blob/main/content/develop/data-types/sorted-sets.md" }
  - { label: "Redis documentation source: ZADD", url: "https://github.com/redis/docs/blob/main/content/commands/zadd.md" }
  - { label: "Redis documentation source: ZRANGE", url: "https://github.com/redis/docs/blob/main/content/commands/zrange.md" }
  - { label: "Apache Kafka documentation: delivery semantics", url: "https://kafka.apache.org/documentation/#semantics" }
previous: "system-designs:churn-prediction-data-pipeline"
---

## Approach

A leaderboard is a **ranking index** that must be fast to read, fast to update, correct under retries and rebuildable. The interviewer is looking for the right data structure (sorted sets or an equivalent), a durable source of truth behind it, idempotent score processing, a tie-breaking rule, and a plan for windowed boards and very large boards.

Clarifying questions:

- **Score semantics**: cumulative points, best single score, or latest score? Each needs a different update rule.
- **Boards**: global, regional, friends, guild? Time windows (daily, weekly, season)?
- **Read patterns**: top N, my rank, players around me? How often do clients refresh?
- **Freshness**: seconds, or is a minute fine?
- **Fairness and prizes**: are there rewards based on final ranks? Then ties and cheating matter a lot.
- **Scale**: players, active players, score events and reads per second at peak.

## Architecture

<figure class="diagram">
<ol class="flow">
<li><strong>Game servers</strong> publish signed score events (match id, player id, points, timestamp) to Kafka, keyed by player id.</li>
<li><strong>Score service</strong> validates signatures and plausibility, and checks the match id against processed ids.</li>
<li><strong>Durable store</strong>: in one transaction, record the match id and update the player's totals per period.</li>
<li><strong>Sorted sets</strong>: apply the new total to each relevant board (global all-time, weekly, daily, region) with a composite score.</li>
<li><strong>Read API</strong>: top N from the sorted set (cached for a second or two), own rank and neighbours by rank lookup, friends boards by fetching friends' scores.</li>
<li><strong>Period close</strong>: at the end of each period, snapshot the board to durable storage, compute final exact ranks and prizes.</li>
<li><strong>Lakehouse</strong>: every accepted and rejected score event for audit, analytics and anti-cheat models.</li>
</ol>
<figcaption>The database is the record; sorted sets are a fast, rebuildable index over it.</figcaption>
</figure>

Walkthrough:

1. **Keying by player** keeps a player's events ordered on one partition, so their total is updated serially without locking.
2. **Validation** rejects impossible scores (points above the maximum for a match type, matches that are too short) and routes suspicious ones to anti-cheat review.
3. **Durable totals first**: the database transaction is the commit point. If the service crashes after the database write but before updating the sorted set, a replay re-applies the **absolute** total to the sorted set, which is harmless.
4. **Sorted sets** store member = player id, score = composite score. Redis sorted sets, for example, add or update a member in O(log N) and return a member's rank in O(log N), per the Redis documentation.
5. **Reads** dominate: the top-100 view is the same for everyone, so cache it for one or two seconds; rank lookups go to the sorted set directly.

## Data model

| Store | Key | Contents |
|---|---|---|
| `processed_matches` (database) | match id, player id | Processed-at; unique constraint gives idempotency |
| `player_period_totals` (database) | player id, board, period | Points, reached_at, last match id |
| Sorted set per board and period | `lb:{board}:{period}` | member = player id, score = composite |
| `board_snapshots` (lakehouse) | board, period, rank | Final ranks, frozen at close |
| `score_events` (lakehouse) | event id | All events, accepted or rejected, with reason |

## Idempotency and update rules

Store and apply **absolute totals**, not increments, to the sorted set:

- Retried or replayed events are caught by the `processed_matches` unique constraint, so the database total changes once.
- The sorted set is then set to the database total (an `ZADD` with the new score), which is idempotent. Using `ZINCRBY` directly from events would double count on every retry that slips past the dedup check.
- For "best score" boards, update only if the new score is higher (Redis `ZADD` supports a `GT` option for this).

## Tie-breaking

Members with equal scores are ordered lexicographically by member name in Redis sorted sets, which is arbitrary from a player's point of view. Encode the tie-break into the score: higher points first, then whoever reached that total **earlier**.

```python
MAX_TS = 10**10  # seconds; larger than any timestamp we will use

def composite(points, reached_at):
    """Higher points first; for equal points, whoever reached them earlier ranks higher."""
    return points * MAX_TS + (MAX_TS - reached_at)

board = {}           # member -> composite score (what a sorted set would store)
applied = set()      # processed event ids, so a redelivered event is ignored
totals = {}

def add_points(event_id, player, points, ts):
    if event_id in applied:
        return
    applied.add(event_id)
    totals[player] = totals.get(player, 0) + points
    board[player] = composite(totals[player], ts)

for e in [("e1", "ana", 50, 1000), ("e2", "ben", 30, 1005), ("e3", "ben", 20, 1010),
          ("e4", "cai", 70, 1003), ("e3", "ben", 20, 1010)]:   # e3 redelivered
    add_points(*e)

ranking = sorted(board, key=board.get, reverse=True)
for rank, player in enumerate(ranking, start=1):
    print(rank, player, totals[player])
```

```text
1 cai 70
2 ana 50
3 ben 50
```

Ana and Ben both have 50 points; Ana reached 50 at t=1000 and Ben at t=1010, so Ana ranks higher. The redelivered `e3` is ignored, so Ben does not get 70.

Watch the **precision**: Redis scores are double-precision floats, which represent integers exactly only up to 2⁵³ (about 9 × 10¹⁵). With `MAX_TS = 10¹⁰`, points must stay below about 900,000. For larger point totals, use a smaller time component (for example seconds since season start) or store the tie-break in a secondary lookup for the few tied players near prize thresholds.

## Windowed boards (daily, weekly, season)

- Use a **separate sorted set per period**: `lb:global:2026-W40`. An event updates the all-time board and the current period's boards.
- Periods are defined in one time zone (usually UTC) and stated clearly; "midnight local time" for a global board is ambiguous.
- At period close: stop writes to the old key (events after the close go to the new period), wait a short grace period for in-flight events, snapshot ranks to the lakehouse, compute prizes, then expire the old key.
- Rolling windows ("last 24 hours") are harder: either subtract expiring contributions using the event history, or use hourly buckets and merge the last 24 with `ZUNIONSTORE` periodically.

## Friends, regional and rank-around-me

- **Regional boards** are just more sorted sets keyed by region; each event updates one more set.
- **Friends boards**: fetch scores for the player's friends (a pipeline of `ZSCORE` calls, or `ZMSCORE`), sort in the API. With 50 friends this is cheap; maintaining per-player friend sets would be very expensive on writes.
- **Around me**: get the player's rank, then read the range from rank − 5 to rank + 5.

## Scaling a single board

One sorted set with 50 million members fits in memory on one node (see the capacity estimate), but one node also limits write and read throughput. Options:

- **Read replicas** for rank lookups; the top-N view is cached anyway.
- **Score-range sharding**: split players into shards by score band; the top band is small and hot, others are large and cool. Global rank = rank within shard + count of players in all higher shards. Players move between shards when their score crosses a band boundary.
- **Approximate ranks** for the long tail: precompute a histogram of scores every minute and show percentiles ("top 12%") for players far from the top.

## Late data and corrections

- Events arriving after a period closes (a match finished just before midnight but reported late) are accepted into the closing period only within the grace window; later ones go to an exceptions queue for review.
- **Cheater removal**: delete the member from all boards (`ZREM`), mark the player banned, and for closed periods recompute final ranks from the snapshot without that player. Prize corrections follow a published policy.

## Schema evolution

Score events carry a version and a match type. New match types need maximum-plausible-score rules before they go live, or validation will either reject real scores or accept cheats.

## Security and anti-cheat

- Scores come only from trusted game servers that sign events; never accept scores directly from clients.
- Plausibility checks in the score service; anomaly models in the lakehouse (score velocity, impossible combinations) feed a ban list.
- Rate-limit and audit administrative corrections.

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| Sorted-set node lost | Boards empty or stale | Promote a replica; or rebuild from `player_period_totals` with bulk `ZADD`; serve "board updating" meanwhile |
| Score service crash mid-event | Database updated, sorted set not | Replay from Kafka; dedup stops double counting; absolute `ZADD` fixes the sorted set |
| Kafka consumer lag at tournament end | Boards behind | Scale consumers up to partition count; prioritise current-period boards |
| Bad deploy applies wrong points | Wrong ranks | Correct totals in the database from the event history; rebuild affected sorted sets |
| Clock skew between game servers | Tie-break unfair | Use server-side receive time from the score service for `reached_at` |

## Monitoring and SLAs

- End-to-end latency from match end to board update.
- Consumer lag; rejected-event rate by reason.
- Read latency for top-N, rank and friends queries; cache hit ratio.
- Drift check: periodically compare sorted-set scores with database totals for a sample of players.

## Cost

Memory is the main cost: one sorted set per board and period. Expire old period boards after snapshotting, keep regional and daily boards only as long as needed, and avoid per-player derived sets. Caching the top-N response removes most read load.

## Scaling to 10×

At 500 million players and 500,000 score events per second at peak: more Kafka partitions and score-service instances, score-range sharding of large boards, regional deployments with a global board computed from regional top-K lists (the global top 100 must be among the union of each region's top 100), and approximate ranks for the long tail.

## Capacity estimate

Assumptions: 50 million members in the all-time board; about 100 bytes of memory per sorted-set member (member string, score and skip-list and hash overhead; measure for your engine and member format); 10 million daily active players in daily and weekly boards; 5,000 events/s average, 50,000 at peak; 100,000 reads/s at peak.

- **All-time global board**: 50 million × 100 B ≈ 5 GB.
- **Weekly and daily global boards**: up to about 10 million active members each ≈ 1 GB each.
- **Regional boards**: same members split across regions, so roughly the same total as the global ones again.
- **Write amplification**: each event updates about 5 boards (all-time, season, weekly, daily, region): 50,000 × 5 = 250,000 sorted-set updates per second at peak, which justifies sharding boards across several nodes.
- **Reads**: 100,000/s; with top-N cached for 1 second, the sorted sets mostly serve rank and around-me lookups, each O(log N).
- **Durable totals**: 50 million players × 5 boards × ~50 bytes ≈ 12.5 GB in the database.

## What a strong answer includes

- Sorted sets (or an equivalent ordered index) with the right operations and complexities.
- A durable source of truth and a rebuild path for the in-memory boards.
- Idempotent processing by match id, and absolute updates rather than increments.
- Deterministic tie-breaking with attention to floating-point limits.
- Period boards with clean close and snapshot procedures.
- Friends boards at read time, and a plan for very large boards (sharding, approximate ranks).

## Common mistakes

- Computing ranks with SQL `ORDER BY` on every request.
- Using increments from events directly, so retries double count.
- Treating the in-memory store as the only copy.
- Ignoring ties until prize day.
- One sorted set per player's friends list.
- Accepting scores from clients.

---
previous: "projects:real-time-analytics-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-10"
reviewedDate: "2026-10-10"
title: "Fraud Detection Data Pipeline"
description: "An advanced project: build the data pipeline behind fraud detection, with streaming features, rule-based flags, a feature table for models and a review queue."
inventoryId: "PROJ-07"
technology: ["kafka", "spark", "python"]
topic: ["streaming", "features"]
level: "Advanced"
problemStatement: "Build the data side of a fraud-detection system: compute per-card behavioural features from a transaction stream using only past data, flag suspicious transactions with transparent rules, keep a point-in-time-correct feature table that a model could train on, and backtest the rules honestly."
requirements: ["Generate synthetic card transactions with injected, labelled fraud-like patterns", "Compute rolling features per card (count and amount in the last 10 minutes, distinct merchants in the last hour, ratio to the card's typical amount) from past events only", "Flag transactions with explainable rules and record which rule fired and the feature values", "Write flags to a review queue and features to a feature table", "Backtest the rules on stored data and report detection and false-flag counts on the synthetic data", "Run the same feature logic in streaming (Kafka and Spark) and in SQL, and check they agree"]
technologies: ["Python 3.11+", "PostgreSQL (feature table, review queue, SQL features)", "Apache Kafka and Spark Structured Streaming for the live path"]
dataset: "Synthetic only: the generator on this page creates normal card activity and three injected patterns (card testing, an amount spike, a merchant spree), each labelled. Never use real card data."
steps: ["Generate transactions with labelled injected patterns", "Compute point-in-time features per card in Python, using only events before the current one", "Write the rules with a reason code and threshold each", "Backtest: count injected patterns caught and normal transactions flagged", "Load features and flags into PostgreSQL and compute the same features with SQL window frames", "Build the review queue table with the rule and feature values that triggered each flag", "Port the feature logic to Spark Structured Streaming from Kafka with watermarks", "Document limitations: synthetic data, label delay and selection bias"]
testing: ["Unit tests for each rule with crafted inputs at and around its threshold", "A test that features never use events at or after the transaction being scored", "Backtest on generated data with known injected patterns", "Python and SQL feature values agree for every transaction"]
dataQuality: ["Features non-null after a card's first transaction; the first transaction gets explicit defaults", "Every flag records the rule, the threshold and the feature values that triggered it", "Flag rate per rule tracked per day; a sudden change usually means a data problem"]
monitoring: ["Flag rate per rule over time", "Streaming latency from transaction to flag and consumer lag", "Feature freshness (age of the newest update per card)", "Review queue size and age"]
costConsiderations: ["Runs locally", "State size grows with the number of active cards and window lengths; bound windows and use state TTLs", "Keep raw transactions for backtests and model training, with retention set by policy"]
interviewQuestions: ["Why compute features in streaming rather than batch?", "How do you avoid using future information when backtesting or building training data?", "How do you explain why a transaction was flagged?", "How would a machine-learning model use your feature table, and what is training-serving skew?", "Why are your synthetic detection numbers not evidence of real-world performance?"]
resumeBullets: ["Built a fraud-detection data pipeline that computes point-in-time per-card features (velocity, merchant spread, amount ratio) and explainable rule flags, with the same feature logic in Python, SQL and Spark Structured Streaming; state the transaction volume you generated and the end-to-end latency you measured", "Backtested the rules on synthetic data with labelled injected patterns and reported detection and false-flag counts, clearly labelled as synthetic results, along with documented limitations"]
extensions: ["Train a simple gradient-boosted model on the feature table with a time-based split and compare it with the rules", "Add reviewer decisions as labels and measure precision per rule", "Add a device-level feature (cards seen per device in 24 hours) for card-testing attacks", "Serve features from a key-value store and score each transaction synchronously"]
related: ["system-designs:fraud-detection-pipeline", "system-designs:feature-store", "articles:etl-elt/batch-vs-streaming", "articles:kafka/topics-partitions-consumer-groups", "articles:sql/window-frames-running-totals"]
versionContext: "Python code was run on Python 3.11 and the SQL on PostgreSQL 16 with scripts/verify-examples.py; shown output comes from that run on synthetic data. The Spark Structured Streaming snippet needs Kafka and is described, not executed here."
---

## What you will build

The data side of a fraud system: per-card **features** computed only from the past, **rules** that say why they fired, a **review queue**, a **feature table** a model could learn from, and an honest **backtest**. Detection logic stays deliberately simple and transparent; the engineering is in correctness of time.

You are done when:

- no feature uses information from the transaction being scored or later;
- every flag carries the rule, threshold and feature values that triggered it;
- the backtest reports what was caught and what was wrongly flagged, labelled as synthetic;
- the SQL and Python feature computations agree.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Transactions arrive on a Kafka topic, keyed by card.</li>
<li>Spark computes rolling features per card from past transactions.</li>
<li>Features join each transaction; rules evaluate them.</li>
<li>Flagged transactions go to a review table with the triggering rule and values.</li>
<li>Raw transactions and features are stored for backtesting and modelling.</li>
</ol>
<figcaption>Features are computed once and used both for live rules and for later model training.</figcaption>
</figure>

## Step 1: generate labelled synthetic transactions

Normal activity: 30 cards, each with its own typical amount, a few transactions a day at random merchants. Three injected patterns, each labelled so the backtest can score the rules:

- **card testing**: a burst of very small transactions on one card within minutes;
- **amount spike**: one transaction far above the card's usual amount;
- **merchant spree**: many different merchants within an hour.

```python
import random
from datetime import datetime, timedelta

random.seed(11)
START = datetime(2026, 10, 1)
cards = {f"card-{i:02d}": random.uniform(15, 120) for i in range(30)}   # typical amount per card
txns = []

def add(card, ts, amount, merchant, label=None):
    txns.append({"txn_id": f"t{len(txns):05d}", "card": card, "ts": ts, "amount": round(amount, 2),
                 "merchant": merchant, "label": label})

for card, typical in cards.items():                          # 7 days of normal behaviour
    for day in range(7):
        for _ in range(random.randint(1, 4)):
            ts = START + timedelta(days=day, hours=random.randint(8, 21), minutes=random.randint(0, 59))
            add(card, ts, random.gauss(typical, typical * 0.25) + 1, f"m{random.randint(1, 40)}")

t = START + timedelta(days=5, hours=3)                       # card testing on card-03
for k in range(8):
    add("card-03", t + timedelta(seconds=40 * k), random.uniform(0.5, 2.0), f"m{90 + k % 2}", "card_testing")
add("card-07", START + timedelta(days=6, hours=14), cards["card-07"] * 9, "m77", "amount_spike")
t = START + timedelta(days=4, hours=19)                      # merchant spree on card-12
for k in range(6):
    add("card-12", t + timedelta(minutes=8 * k), cards["card-12"], f"m{50 + k}", "merchant_spree")

txns.sort(key=lambda x: (x["ts"], x["txn_id"]))
labelled = sum(1 for x in txns if x["label"])
print(len(txns), "transactions,", labelled, "labelled as injected patterns")
```

```text
555 transactions, 15 labelled as injected patterns
```

## Step 2: point-in-time features

For each transaction, features describe the card **before** it: transactions in the previous 10 minutes, their total, distinct merchants in the previous hour, and the ratio of this amount to the card's median amount so far. Computing them in event-time order with only earlier events is what makes the features usable for both live scoring and training.

```python
from bisect import bisect_left
from collections import defaultdict
from statistics import median

history = defaultdict(list)          # card -> list of earlier transactions, in time order

def features_for(txn):
    past = history[txn["card"]]
    times = [p["ts"] for p in past]
    last_10m = past[bisect_left(times, txn["ts"] - timedelta(minutes=10)):]
    last_1h = past[bisect_left(times, txn["ts"] - timedelta(hours=1)):]
    typical = median(p["amount"] for p in past) if past else None
    return {"count_10m": len(last_10m),
            "amount_10m": round(sum(p["amount"] for p in last_10m), 2),
            "merchants_1h": len({p["merchant"] for p in last_1h} | {txn["merchant"]}),
            "amount_ratio": round(txn["amount"] / typical, 2) if typical else None,
            "history_len": len(past)}

feature_rows = []
for txn in txns:                     # strictly in event-time order
    f = features_for(txn)
    feature_rows.append({**txn, **f})
    history[txn["card"]].append(txn) # added AFTER computing its own features

spike = next(r for r in feature_rows if r["label"] == "amount_spike")
print({k: spike[k] for k in ("card", "amount", "amount_ratio", "history_len")})
```

```text
{'card': 'card-07', 'amount': 618.75, 'amount_ratio': 8.11, 'history_len': 18}
```

The order of the last two lines in the loop is the whole point: a transaction's own amount must not be part of its "typical amount" history. Including it (or computing the median over all of the card's transactions, past and future) is classic **leakage**: the backtest looks great and production does not.

## Step 3: explainable rules

Each rule has a name, a threshold and a reason that a reviewer can read. Thresholds are configuration, not code, so they can be tuned and audited.

```python
RULES = [
    ("velocity_10m", lambda f: f["count_10m"] >= 4,
     "4 or more transactions on the card in the previous 10 minutes"),
    ("amount_spike", lambda f: f["amount_ratio"] is not None and f["history_len"] >= 5 and f["amount_ratio"] >= 5,
     "amount at least 5 times the card's median, with 5 or more past transactions"),
    ("merchant_spree", lambda f: f["merchants_1h"] >= 5,
     "5 or more distinct merchants on the card within an hour"),
]

def evaluate(f):
    return [(name, reason) for name, test, reason in RULES if test(f)]

flags = []
for r in feature_rows:
    for rule, reason in evaluate(r):
        flags.append({"txn_id": r["txn_id"], "card": r["card"], "rule": rule, "reason": reason,
                      "features": {k: r[k] for k in ("count_10m", "amount_10m", "merchants_1h", "amount_ratio")}})
print(len(flags), "flags")
print(flags[0]["rule"], flags[0]["features"])
```

```text
9 flags
merchant_spree {'count_10m': 1, 'amount_10m': 24.52, 'merchants_1h': 5, 'amount_ratio': 1.0}
```

## Step 4: backtest honestly

Score the rules against the injected labels: how many injected transactions were flagged, how many normal transactions were flagged, and which patterns slipped through. Note that a pattern is often caught only **after** its first few transactions, because the features need history.

```python
flagged_ids = {f["txn_id"] for f in flags}
by_label = defaultdict(lambda: [0, 0])               # label -> [flagged, total]
for r in feature_rows:
    key = r["label"] or "normal"
    by_label[key][1] += 1
    by_label[key][0] += r["txn_id"] in flagged_ids
for label in sorted(by_label):
    caught, total = by_label[label]
    print(f"{label:<15} flagged {caught} of {total}")
```

```text
amount_spike    flagged 1 of 1
card_testing    flagged 4 of 8
merchant_spree  flagged 2 of 6
normal          flagged 2 of 540
```

Write these numbers in the README **as results on synthetic data**, together with how the patterns were generated. They show the pipeline works; they say nothing about real-world fraud, where patterns are adaptive, labels (chargebacks) arrive weeks later, and you only observe outcomes for transactions you approved.

Unit tests for the rules, at and around each threshold:

```python
def test_rule_thresholds():
    base = {"count_10m": 0, "amount_10m": 0, "merchants_1h": 1, "amount_ratio": 1.0, "history_len": 10}
    assert evaluate(base) == []
    assert [r for r, _ in evaluate({**base, "count_10m": 3})] == []
    assert [r for r, _ in evaluate({**base, "count_10m": 4})] == ["velocity_10m"]
    assert [r for r, _ in evaluate({**base, "amount_ratio": 5.0})] == ["amount_spike"]
    assert [r for r, _ in evaluate({**base, "amount_ratio": 5.0, "history_len": 4})] == []   # too little history
    assert [r for r, _ in evaluate({**base, "merchants_1h": 5})] == ["merchant_spree"]

def test_features_use_only_the_past():
    first = next(r for r in feature_rows if r["card"] == "card-00")
    assert first["history_len"] == 0 and first["count_10m"] == 0 and first["amount_ratio"] is None

test_rule_thresholds()
test_features_use_only_the_past()
print("passed: test_rule_thresholds, test_features_use_only_the_past")
```

```text
passed: test_rule_thresholds, test_features_use_only_the_past
```

## Step 5: the feature table and review queue in SQL

In production the feature table and review queue live in a database or lakehouse. SQL window frames compute the same velocity features: `RANGE BETWEEN interval '10 minutes' PRECEDING AND interval '1 microsecond' PRECEDING` covers the previous 10 minutes and **excludes the current row**, which is the point-in-time rule expressed in SQL. The sample below uses card-03's burst and two normal transactions.

```sql
CREATE TABLE transactions (txn_id text PRIMARY KEY, card text, ts timestamp, amount numeric(10, 2), merchant text);
INSERT INTO transactions VALUES
  ('a1', 'card-03', '2026-10-06 03:00:00', 1.20, 'm90'), ('a2', 'card-03', '2026-10-06 03:00:40', 0.80, 'm91'),
  ('a3', 'card-03', '2026-10-06 03:01:20', 1.50, 'm90'), ('a4', 'card-03', '2026-10-06 03:02:00', 0.60, 'm91'),
  ('a5', 'card-03', '2026-10-06 03:02:40', 1.90, 'm90'), ('b1', 'card-04', '2026-10-06 09:15:00', 42.00, 'm3'),
  ('b2', 'card-04', '2026-10-06 18:40:00', 37.50, 'm8');

CREATE TABLE card_features AS
SELECT txn_id, card, ts, amount,
       count(*) OVER w10 AS count_10m,
       coalesce(sum(amount) OVER w10, 0) AS amount_10m
FROM transactions
WINDOW w10 AS (PARTITION BY card ORDER BY ts
               RANGE BETWEEN interval '10 minutes' PRECEDING AND interval '1 microsecond' PRECEDING);

CREATE TABLE review_queue (
  txn_id text PRIMARY KEY REFERENCES transactions, rule text NOT NULL, threshold text NOT NULL,
  feature_values jsonb NOT NULL, status text NOT NULL DEFAULT 'open', flagged_at timestamp NOT NULL);

INSERT INTO review_queue (txn_id, rule, threshold, feature_values, flagged_at)
SELECT txn_id, 'velocity_10m', 'count_10m >= 4',
       jsonb_build_object('count_10m', count_10m, 'amount_10m', amount_10m), ts
FROM card_features WHERE count_10m >= 4
ON CONFLICT (txn_id) DO NOTHING;

SELECT txn_id, count_10m, amount_10m FROM card_features ORDER BY ts;
SELECT txn_id, rule, feature_values, status FROM review_queue;
```

```text
 txn_id | count_10m | amount_10m 
--------+-----------+------------
 a1     |         0 |          0
 a2     |         1 |       1.20
 a3     |         2 |       2.00
 a4     |         3 |       3.50
 a5     |         4 |       4.10
 b1     |         0 |          0
 b2     |         0 |          0

 txn_id |     rule     |            feature_values            | status 
--------+--------------+--------------------------------------+--------
 a5     | velocity_10m | {"count_10m": 4, "amount_10m": 4.10} | open
```

The fifth small transaction is the first one flagged: it had four transactions before it in the window. `ON CONFLICT DO NOTHING` makes re-running the flagging job safe. When you build this for the generated data, load `feature_rows` and compare the SQL `count_10m` with the Python value for every transaction; any mismatch is a bug in one of them, usually at window boundaries.

## Step 6: the live path in Spark

<!-- noexec -->
```python
from pyspark.sql import functions as F

SCHEMA = "txn_id string, card string, ts timestamp, amount decimal(10,2), merchant string"
txns = (spark.readStream.format("kafka").option("kafka.bootstrap.servers", "localhost:9092")
        .option("subscribe", "card-transactions").load()
        .select(F.from_json(F.col("value").cast("string"), SCHEMA).alias("t")).select("t.*"))

velocity = (txns.withWatermark("ts", "2 minutes")
            .groupBy("card", F.window("ts", "10 minutes", "1 minute"))
            .agg(F.count("*").alias("count_10m"), F.sum("amount").alias("amount_10m")))
```

A sliding window like this gives "count in each 10-minute window", which approximates "count in the 10 minutes before this transaction". For exact per-transaction features in streaming, use arbitrary stateful processing (`transformWithStateInPandas` in Spark 4, or a keyed process function in Flink) that keeps each card's recent transactions in state with a TTL, computes the features from the state **before** adding the new event, and emits them with the transaction. The [fraud detection system design](/data-engineering/system-design/fraud-detection-pipeline/) shows that logic and the latency budget around it.

## Common mistakes

- **Leakage**: features computed over all of a card's data, including the transaction being scored or later ones.
- **Random train-test splits** for a model built on this table; split by time instead.
- **Flags without reasons**, which reviewers cannot act on and auditors cannot check.
- **Claiming detection rates** from synthetic data as if they were real-world performance.
- **Unbounded state** from windows with no watermark or TTL.

## Explaining it in an interview

"Transactions stream from Kafka keyed by card. For each transaction I compute features from that card's earlier transactions only: count and amount in the previous 10 minutes, distinct merchants in the last hour and the ratio to the card's median amount. Transparent rules flag transactions and write the rule, threshold and feature values to a review queue. I backtested on synthetic data with labelled injected patterns; the amount spike was caught, but only the later transactions of each burst were, because the features need history, and I report those counts as synthetic results. The same features exist in SQL with window frames that exclude the current row, and I check the two implementations agree; that point-in-time discipline is what makes the feature table usable for training a model later."

Prepare for: *Why streaming?* (a card-testing burst is over in minutes; a nightly batch would only describe it). *How would a model use the table?* (join labels that arrive later to features as of transaction time, split by time, and serve the same features online to avoid training-serving skew). *What is the fallback if the feature store is down?* (a business-agreed policy, for example approve small amounts and step up larger ones).

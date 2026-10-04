---
publishedDate: "2026-10-04"
updatedDate: "2026-10-04"
reviewedDate: "2026-10-04"
title: "PySpark Cheat Sheet"
description: "A quick PySpark reference: reading and writing data, column expressions, joins, aggregations, window functions and the settings that matter for performance."
inventoryId: "CHEAT-03"
technology: ["pyspark", "spark"]
topic: ["reference"]
cheatTopic: "PySpark"
related: ["articles:pyspark/window-functions", "articles:spark/partitions-shuffles-skew", "interview-questions:pyspark/broadcast-join"]
versionContext: "Checked against PySpark 4.2; the APIs shown also exist in Spark 3.x"
---

## Setup

```python
from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F

spark = SparkSession.builder.appName("job").getOrCreate()
```

## Read and write

```python
df = spark.read.parquet("/data/orders")
df = spark.read.option("header", True).csv("/data/raw.csv")
df.write.mode("overwrite").partitionBy("dt").parquet("/data/out")
```

## Columns

```python
df.select("id", F.col("amount") * 1.1)
df.withColumn("is_big", F.col("amount") > 100)
df.filter((F.col("country") == "IN") & F.col("amount").isNotNull())
df.withColumnRenamed("amt", "amount")
df.dropDuplicates(["order_id"])
```

## Aggregate

```python
df.groupBy("customer_id").agg(
    F.count("*").alias("orders"),
    F.sum("amount").alias("revenue"),
)
```

## Join

```python
orders.join(customers, "customer_id", "left")
orders.join(F.broadcast(countries), "country_code")   # small side only
```

## Window

```python
w = Window.partitionBy("region").orderBy(F.desc("amount"), "rep")
df.withColumn("rn", F.row_number().over(w)).filter("rn = 1")

running = Window.partitionBy("rep").orderBy("dt").rowsBetween(Window.unboundedPreceding, Window.currentRow)
df.withColumn("running_total", F.sum("amount").over(running))
```

## Inspect

```python
df.printSchema()
df.explain()                      # look for Exchange (shuffle) and join type
df.rdd.getNumPartitions()
```

## Performance settings (defaults checked on Spark 4.2)

| Setting | Default | Meaning |
|---------|---------|---------|
| `spark.sql.shuffle.partitions` | 200 | Partitions after a shuffle |
| `spark.sql.adaptive.enabled` | true | Adaptive Query Execution |
| `spark.sql.adaptive.skewJoin.enabled` | true | Split skewed join partitions |
| `spark.sql.autoBroadcastJoinThreshold` | 10 MB | Max size to auto-broadcast |

## Actions trigger jobs

`count`, `collect`, `show`, `take`, `write`. Everything else is lazy. Avoid `collect()` on large data.

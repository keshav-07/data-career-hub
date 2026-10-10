---
next: "projects:s3-pyspark-snowflake-pipeline"
publishedDate: "2026-10-04"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
title: "CSV to Data Warehouse Pipeline"
description: "Beginner data engineering project: load daily CSV files into a star schema with an idempotent loader, a rejects table, quality checks and tests."
inventoryId: "PROJ-01"
technology: ["python", "sql", "data-warehousing"]
topic: ["batch", "modelling"]
level: "Beginner"
problemStatement: "A small online shop exports orders as daily CSV files. Build a pipeline that loads them into a star schema so that sales can be reported reliably, even when files are resent, corrected or contain bad rows."
requirements: ["Load daily order CSV files into a local database", "Model the data as one fact table and at least two dimensions, with the grain written down", "Reruns and resent files must not create duplicates", "Bad rows are stored with a reason and counted, not silently dropped", "Automated tests prove idempotency and that corrected files update values"]
technologies: ["Python 3.11+", "DuckDB (or PostgreSQL)", "SQL", "pytest"]
dataset: "Synthetic: the generator script on this page writes three days of order files with deliberately broken rows. No download or licence needed."
steps: ["Write down the grain: one fact row per order line", "Generate the CSV files with the script below", "Create staging, rejects and audit tables", "Write a loader that validates rows, replaces a file's rows in one transaction and skips unchanged files by checksum", "Build the dimensions with upserts and the fact table by replacing each loaded date", "Add reconciliation and integrity checks", "Write a run-twice test and a corrected-file test", "Write a README with the diagram, the grain and how to run it"]
testing: ["Unit tests for row parsing (valid row, missing quantity, negative quantity, bad date)", "Run the whole pipeline twice and compare row counts and revenue", "Resend a corrected file and check the value changes but the row count does not"]
dataQuality: ["Rows read equal rows loaded plus rows rejected for every file", "Staging row count per file matches the audit table", "Every fact row joins to a customer and a product", "No zero or negative line amounts"]
monitoring: ["Rows read, loaded and rejected per file, from the audit table", "Reject rate per day, with a threshold that fails the run (for example above 5%)", "Time since the last successful load"]
costConsiderations: ["Runs locally at no cost", "Moving to a cloud warehouse adds storage and compute cost; the same SQL ports with small dialect changes"]
interviewQuestions: ["What is the grain of your fact table?", "What happens if the same file is loaded twice, or resent with a correction?", "How do you handle a bad row, and how would someone find out about it?", "Why surrogate keys in the dimensions?", "How would this change for 100 times more data, or for hourly files?"]
resumeBullets: ["Built an idempotent Python and SQL pipeline that loads daily order CSV files into a DuckDB star schema; state how many files and rows you loaded and show the run-twice test that proves reruns leave counts unchanged", "Added a rejects table, a per-file audit log and reconciliation checks (rows read = loaded + rejected); quote the reject rate you observed on your generated data, not a made-up one"]
extensions: ["Make dim_customer a slowly changing dimension Type 2 so a customer's city history is kept", "Schedule the pipeline with Airflow or cron and alert on failed checks", "Swap DuckDB for PostgreSQL or a cloud warehouse and compare the SQL you had to change", "Detect a file resent under a new name by checksum, not only by file name"]
related: ["articles:python/idempotent-csv-loader", "articles:data-warehousing/star-schema", "articles:data-warehousing/dimension-tables", "articles:etl-elt/idempotency-in-data-pipelines"]
versionContext: "All code on this page was run with Python 3.11 and DuckDB 1.5 using scripts/verify-examples.py; the printed output comes from that run."
---

## What you will build

A batch pipeline that turns messy daily order files into a small, trustworthy star schema. It is a beginner project, but it contains every core idea of data engineering in miniature: a declared **grain**, **staging**, **idempotent loads**, **rejects instead of silent drops**, **dimensional modelling**, **data-quality checks** and **tests**.

You are done when:

- running the pipeline twice gives exactly the same tables;
- a resent file with a corrected quantity updates that value without adding rows;
- every bad row is in a `rejects` table with a reason, and the audit table reconciles;
- you can explain each of those properties without looking at the code.

## Architecture

<figure class="diagram">
<ol class="flow">
<li>Daily CSV files land in a <code>data/</code> folder.</li>
<li>A Python loader validates each row, writes good rows to <code>stg_order_lines</code>, bad rows to <code>rejects</code>, and one row per file to <code>load_audit</code>, all in one transaction.</li>
<li>SQL upserts <code>dim_customer</code> and <code>dim_product</code>, fills <code>dim_date</code>, and replaces <code>fact_order_line</code> for the dates that changed.</li>
<li>Quality checks run; a failure stops the report refresh.</li>
</ol>
<figcaption>A single-machine batch pipeline with staging, modelling and checks.</figcaption>
</figure>

**Grain**: one row in `fact_order_line` per order line (`order_id`, `line_no`). Write this sentence in your README first; every later decision follows from it.

Suggested layout:

```text
csv-to-warehouse/
  generate.py      # writes data/orders_YYYY-MM-DD.csv
  pipeline.py      # schema, loader, model, checks
  test_pipeline.py # pytest tests
  data/
  README.md
```

The code below is shown as one sequence so you can run it top to bottom; split it into those files when you build the repository. It needs `pip install duckdb pytest`.

## Step 1: generate the data

The generator writes three days of orders for 20 customers and 4 products, and appends two broken rows to each file (one with an empty quantity, one with a negative quantity). A fixed random seed makes the output repeatable.

```python
import csv, random, tempfile
from datetime import date, timedelta
from pathlib import Path

random.seed(42)
DATA = Path(tempfile.mkdtemp()) / "data"    # use Path("data") in your repository
DATA.mkdir(parents=True)

CUSTOMERS = [(f"C{i:03d}", f"customer{i}@example.com", random.choice(["Leeds", "Pune", "Austin", "Lyon"]))
             for i in range(1, 21)]
PRODUCTS = [("SKU-1", "Trail shoe", "footwear", 79.00), ("SKU-2", "Rain jacket", "outerwear", 120.00),
            ("SKU-3", "Wool socks", "accessories", 12.50), ("SKU-4", "Day pack", "bags", 55.00)]
HEADER = ["order_id", "line_no", "order_date", "customer_id", "customer_email", "customer_city",
          "sku", "product_name", "category", "quantity", "unit_price"]

def write_day(day, n_orders, first_order_id, bad_rows=0):
    rows = []
    for k in range(n_orders):
        cust = random.choice(CUSTOMERS)
        for line_no in range(1, random.randint(1, 3) + 1):
            sku, name, cat, price = random.choice(PRODUCTS)
            rows.append([first_order_id + k, line_no, day.isoformat(), *cust, sku, name, cat,
                         random.randint(1, 3), f"{price:.2f}"])
    for i in range(bad_rows):                      # deliberately broken rows
        broken = list(rows[i])
        broken[9] = "" if i % 2 == 0 else "-2"      # missing or negative quantity
        broken[1] = 90 + i                          # its own line number, so it is a distinct record
        rows.append(broken)
    path = DATA / f"orders_{day.isoformat()}.csv"
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(rows)
    return path

start = date(2026, 10, 1)
files = [write_day(start + timedelta(days=d), n_orders=30, first_order_id=1000 + 100 * d, bad_rows=2)
         for d in range(3)]
for p in files:
    print(p.name, sum(1 for _ in p.open()) - 1, "rows")
```

```text
orders_2026-10-01.csv 56 rows
orders_2026-10-02.csv 54 rows
orders_2026-10-03.csv 69 rows
```

If you prefer real data, any public retail sample with order lines works (record its source and licence in the README); keep the injected bad rows, because handling them is half the project.

## Step 2: staging, rejects and audit tables

Staging mirrors the file, typed, with the source file name on every row. The primary key on `(order_id, line_no)` is the grain.

```python
import duckdb

con = duckdb.connect(str(DATA.parent / "shop.duckdb"))
con.execute("""
CREATE TABLE IF NOT EXISTS stg_order_lines (
  order_id INTEGER, line_no INTEGER, order_date DATE,
  customer_id VARCHAR, customer_email VARCHAR, customer_city VARCHAR,
  sku VARCHAR, product_name VARCHAR, category VARCHAR,
  quantity INTEGER, unit_price DECIMAL(10, 2), source_file VARCHAR,
  PRIMARY KEY (order_id, line_no));
CREATE TABLE IF NOT EXISTS rejects (source_file VARCHAR, row_no INTEGER, reason VARCHAR, raw VARCHAR);
CREATE TABLE IF NOT EXISTS load_audit (
  source_file VARCHAR PRIMARY KEY, sha256 VARCHAR, rows_read INTEGER,
  rows_loaded INTEGER, rows_rejected INTEGER, loaded_at TIMESTAMP);
""")
print(sorted(r[0] for r in con.execute("SHOW TABLES").fetchall()))
```

```text
['load_audit', 'rejects', 'stg_order_lines']
```

## Step 3: an idempotent loader

Three rules make the loader safe to rerun:

1. **Validate every row** and keep the reason for every rejection.
2. **Replace, never append**: delete the file's previous rows and insert the new ones inside one transaction, so a crash leaves either the old state or the new one.
3. **Skip unchanged files** by comparing a SHA-256 checksum with the audit table; a changed checksum (a corrected resend) reloads the file.

```python
import hashlib
from datetime import datetime
from decimal import Decimal, InvalidOperation

def parse_row(row):
    """Return (record, None) for a valid row or (None, reason) for a bad one."""
    try:
        qty = int(row["quantity"])
        price = Decimal(row["unit_price"])
        order_date = date.fromisoformat(row["order_date"])
    except (ValueError, InvalidOperation):
        return None, "unparseable quantity, price or date"
    if qty <= 0:
        return None, "quantity must be positive"
    if price < 0:
        return None, "negative price"
    if not row["customer_id"] or not row["sku"]:
        return None, "missing customer or product"
    return (int(row["order_id"]), int(row["line_no"]), order_date, row["customer_id"],
            row["customer_email"].strip().lower(), row["customer_city"], row["sku"],
            row["product_name"], row["category"], qty, price), None

def load_file(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    seen = con.execute("SELECT sha256 FROM load_audit WHERE source_file = ?", [path.name]).fetchone()
    if seen and seen[0] == digest:
        return "skipped (unchanged)"
    good, bad = [], []
    with path.open(newline="") as f:
        for row_no, row in enumerate(csv.DictReader(f), start=2):   # row 1 is the header
            record, reason = parse_row(row)
            if record:
                good.append(record + (path.name,))
            else:
                bad.append((path.name, row_no, reason, ",".join(row.values())))
    con.execute("BEGIN")
    try:
        con.execute("DELETE FROM stg_order_lines WHERE source_file = ?", [path.name])
        con.execute("DELETE FROM rejects WHERE source_file = ?", [path.name])
        con.executemany("INSERT OR REPLACE INTO stg_order_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", good)
        if bad:
            con.executemany("INSERT INTO rejects VALUES (?,?,?,?)", bad)
        con.execute("INSERT OR REPLACE INTO load_audit VALUES (?,?,?,?,?,?)",
                    [path.name, digest, len(good) + len(bad), len(good), len(bad), datetime.now()])
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    return f"loaded {len(good)}, rejected {len(bad)}"

for p in sorted(DATA.glob("orders_*.csv")):
    print(p.name, load_file(p))
print(con.execute("SELECT reason, count(*) FROM rejects GROUP BY reason ORDER BY reason").fetchall())
```

```text
orders_2026-10-01.csv loaded 54, rejected 2
orders_2026-10-02.csv loaded 52, rejected 2
orders_2026-10-03.csv loaded 67, rejected 2
[('quantity must be positive', 3), ('unparseable quantity, price or date', 3)]
```

`INSERT OR REPLACE` on the primary key also covers the case where the same order line appears in a different file (for example a late correction file for an earlier day): the newest load wins instead of failing on a duplicate key. The longer [idempotent CSV loader tutorial](/python/idempotent-csv-loader/) walks through these choices one at a time.

## Step 4: the star schema

Dimensions get **surrogate keys** (integers generated by the warehouse) so facts do not depend on source identifiers that can be reused or reformatted, and so you can later add history (SCD Type 2) without changing the fact table. Dimensions are **upserted**; the fact table is **replaced per date**, which keeps the build idempotent.

```python
con.execute("""
CREATE SEQUENCE IF NOT EXISTS customer_key_seq;
CREATE SEQUENCE IF NOT EXISTS product_key_seq;
CREATE TABLE IF NOT EXISTS dim_customer (
  customer_key INTEGER PRIMARY KEY DEFAULT nextval('customer_key_seq'),
  customer_id VARCHAR UNIQUE, email VARCHAR, city VARCHAR);
CREATE TABLE IF NOT EXISTS dim_product (
  product_key INTEGER PRIMARY KEY DEFAULT nextval('product_key_seq'),
  sku VARCHAR UNIQUE, product_name VARCHAR, category VARCHAR);
CREATE TABLE IF NOT EXISTS dim_date (
  date_key INTEGER PRIMARY KEY, full_date DATE, year INTEGER, month INTEGER, day_name VARCHAR);
CREATE TABLE IF NOT EXISTS fact_order_line (
  order_id INTEGER, line_no INTEGER, date_key INTEGER, customer_key INTEGER, product_key INTEGER,
  quantity INTEGER, unit_price DECIMAL(10, 2), line_amount DECIMAL(12, 2),
  PRIMARY KEY (order_id, line_no));
""")

def build_model(dates):
    """Upsert dimensions, then replace the fact rows for the given order dates."""
    keys = [int(d.strftime("%Y%m%d")) for d in dates]
    con.execute("BEGIN")
    con.execute("""
      INSERT INTO dim_customer (customer_id, email, city)
      SELECT customer_id, arg_max(customer_email, order_date), arg_max(customer_city, order_date)
      FROM stg_order_lines GROUP BY customer_id
      ON CONFLICT (customer_id) DO UPDATE SET email = excluded.email, city = excluded.city""")
    con.execute("""
      INSERT INTO dim_product (sku, product_name, category)
      SELECT sku, arg_max(product_name, order_date), arg_max(category, order_date)
      FROM stg_order_lines GROUP BY sku
      ON CONFLICT (sku) DO UPDATE SET product_name = excluded.product_name, category = excluded.category""")
    con.execute("""
      INSERT OR REPLACE INTO dim_date
      SELECT CAST(strftime(d, '%Y%m%d') AS INTEGER), d, year(d), month(d), dayname(d)
      FROM (SELECT DISTINCT order_date AS d FROM stg_order_lines)""")
    con.execute("DELETE FROM fact_order_line WHERE list_contains(?, date_key)", [keys])
    con.execute("""
      INSERT INTO fact_order_line
      SELECT s.order_id, s.line_no, CAST(strftime(s.order_date, '%Y%m%d') AS INTEGER),
             c.customer_key, p.product_key, s.quantity, s.unit_price, s.quantity * s.unit_price
      FROM stg_order_lines s
      JOIN dim_customer c USING (customer_id)
      JOIN dim_product p USING (sku)
      WHERE list_contains(?, CAST(strftime(s.order_date, '%Y%m%d') AS INTEGER))""", [keys])
    con.execute("COMMIT")

all_dates = [r[0] for r in con.execute("SELECT DISTINCT order_date FROM stg_order_lines ORDER BY 1").fetchall()]
build_model(all_dates)
for row in con.execute("""
    SELECT d.full_date, count(*) AS lines, sum(f.line_amount) AS revenue
    FROM fact_order_line f JOIN dim_date d USING (date_key)
    GROUP BY d.full_date ORDER BY d.full_date""").fetchall():
    print(*row)
```

```text
2026-10-01 54 7745.00
2026-10-02 52 8074.50
2026-10-03 67 9247.50
```

`arg_max(customer_email, order_date)` takes the value from the customer's most recent order, which is a Type 1 (overwrite) rule: the dimension shows the latest known email and city. That is a decision to state in an interview, along with when you would switch to Type 2. The [dimension tables guide](/data-warehousing/dimension-tables/) covers the options.

## Step 5: data-quality checks

Each check is a query that counts **failures**; zero means pass. Keeping them as data (a dictionary of name to SQL) makes it easy to add one and to report all failures at once.

```python
CHECKS = {
    "audit reconciles (read = loaded + rejected)":
        "SELECT count(*) FROM load_audit WHERE rows_read <> rows_loaded + rows_rejected",
    "staging rows match audit":
        """SELECT count(*) FROM load_audit a
           WHERE a.rows_loaded <> (SELECT count(*) FROM stg_order_lines s WHERE s.source_file = a.source_file)""",
    "every fact row has a customer and product":
        """SELECT count(*) FROM fact_order_line f
           LEFT JOIN dim_customer c USING (customer_key) LEFT JOIN dim_product p USING (product_key)
           WHERE c.customer_key IS NULL OR p.product_key IS NULL""",
    "every staged line reached the fact table":
        """SELECT count(*) FROM stg_order_lines s
           LEFT JOIN fact_order_line f USING (order_id, line_no) WHERE f.order_id IS NULL""",
    "no non-positive amounts": "SELECT count(*) FROM fact_order_line WHERE line_amount <= 0",
}

def run_checks():
    results = {name: con.execute(sql).fetchone()[0] for name, sql in CHECKS.items()}
    return {name: n for name, n in results.items() if n}

reject_rate = con.execute("SELECT sum(rows_rejected) / sum(rows_read) FROM load_audit").fetchone()[0]
print("failed checks:", run_checks() or "none")
print(f"reject rate: {reject_rate:.1%}")
```

```text
failed checks: none
reject rate: 3.4%
```

In the real pipeline, a non-empty result from `run_checks()` raises an exception so the report refresh does not run, and a reject rate above an agreed threshold (for example 5%) fails the run too: a sudden jump usually means the file format changed, not that customers got worse at ordering.

## Step 6: tests

These are pytest-style tests; in `test_pipeline.py` you would run them with `pytest`. Here they are called directly so the page can verify them.

```python
def snapshot():
    return con.execute("""SELECT count(*), sum(line_amount), (SELECT count(*) FROM rejects)
                          FROM fact_order_line""").fetchone()

def run_pipeline():
    changed = []
    for p in sorted(DATA.glob("orders_*.csv")):
        if load_file(p) != "skipped (unchanged)":
            changed.append(date.fromisoformat(p.stem.split("_")[1]))
    if changed:
        build_model(changed)
    return changed

def test_parse_row_rejects_bad_quantities():
    good = dict(zip(HEADER, ["1", "1", "2026-10-01", "C001", "a@example.com", "Leeds",
                             "SKU-1", "Trail shoe", "footwear", "2", "79.00"]))
    assert parse_row(good)[1] is None
    assert parse_row({**good, "quantity": ""})[1] == "unparseable quantity, price or date"
    assert parse_row({**good, "quantity": "-2"})[1] == "quantity must be positive"
    assert parse_row({**good, "order_date": "2026-13-01"})[1] == "unparseable quantity, price or date"

def test_rerun_is_a_no_op():
    before = snapshot()
    assert run_pipeline() == []                       # nothing changed, so nothing reloaded
    con.execute("DELETE FROM load_audit")             # forget the checksums: force a full reload
    run_pipeline()
    assert snapshot() == before

def test_corrected_file_updates_values():
    path = DATA / "orders_2026-10-01.csv"
    rows = list(csv.reader(path.open()))
    rows[1][9] = str(int(rows[1][9]) + 1)             # the shop resends the day with one quantity fixed
    with path.open("w", newline="") as f:
        csv.writer(f).writerows(rows)
    lines_before = snapshot()[0]
    assert run_pipeline() == [date(2026, 10, 1)]
    qty = con.execute("SELECT quantity FROM fact_order_line WHERE order_id = ? AND line_no = ?",
                      [int(rows[1][0]), int(rows[1][1])]).fetchone()[0]
    assert qty == int(rows[1][9])
    assert snapshot()[0] == lines_before              # values changed, row count did not

for test in (test_parse_row_rejects_bad_quantities, test_rerun_is_a_no_op, test_corrected_file_updates_values):
    test()
    print("passed:", test.__name__)
print("failed checks:", run_checks() or "none")
```

```text
passed: test_parse_row_rejects_bad_quantities
passed: test_rerun_is_a_no_op
passed: test_corrected_file_updates_values
failed checks: none
```

The forced reload in `test_rerun_is_a_no_op` matters: skipping unchanged files is an optimisation, so the test also proves that a **full reprocess** gives the same answer. That is the property that lets you rerun last week after fixing a bug.

## Common mistakes

- **Appending on every run**, so the second run doubles revenue. Replace by file or by date instead.
- **Dropping bad rows silently** with a `try/except: continue`. Nobody can then tell whether 0.1% or 40% of the data was lost.
- **No declared grain**, which leads to fact tables mixing order-level and line-level amounts and double counting shipping.
- **Floating-point money**. Use `DECIMAL` in the database and `Decimal` in Python.
- **Building dimensions from the fact file without keys**, so a customer who changes email becomes two customers.

## Explaining it in an interview

A two-minute walkthrough that covers what interviewers listen for:

1. **Problem and grain**: "Daily order files, modelled into a star schema at order-line grain."
2. **Idempotency**: "Each file's rows are replaced inside one transaction, unchanged files are skipped by checksum, and the fact table is rebuilt per affected date. My test reloads everything and checks the totals are identical."
3. **Data quality**: "Bad rows go to a rejects table with a reason; the audit table reconciles rows read with rows loaded plus rejected, and the run fails if the reject rate jumps."
4. **Modelling choices**: "Surrogate keys, Type 1 for customer attributes today; Type 2 if the business needs revenue by the city a customer lived in at the time."
5. **Scaling**: "At 100 times the data I would load with the warehouse's bulk loader (`COPY` or `read_csv`) instead of row-by-row Python, partition the fact table by date and run the same replace-by-date logic; the design does not change, only the tools."

Likely follow-ups, with short answers:

- *What if a file arrives twice under different names?* Today it would load twice into staging rows that replace each other by primary key, so facts stay correct, but the audit shows two files. Detect duplicates by checksum across names.
- *What if a corrected file removes a line?* Because the loader deletes the file's previous rows first, the removed line disappears from staging; the fact rebuild for that date removes it too.
- *How do you know the numbers are right?* Reconciliation from file to staging to fact, plus a manual spot check of one day against the source.

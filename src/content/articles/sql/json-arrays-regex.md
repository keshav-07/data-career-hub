---
title: "Semi-Structured SQL: JSON, Arrays and Regular Expressions"
seoTitle: "SQL JSON, Arrays and Regular Expressions"
description: "Parse JSON, flatten nested arrays and extract text with regular expressions in SQL, with PostgreSQL examples and the Snowflake and BigQuery equivalents."
technology: ["sql"]
topic: ["json", "arrays", "regex", "semi-structured-data"]
difficulty: "Advanced"
publishedDate: "2026-10-05"
updatedDate: "2026-10-05"
reviewedDate: "2026-10-05"
learningObjectives:
  - "Extract scalar values and nested objects from JSON safely, with the right types"
  - "Tell a missing key, a JSON null and an empty value apart"
  - "Flatten arrays into rows without losing parents that have empty arrays, and aggregate rows back into arrays"
  - "Use regular expressions to filter, extract, count, replace and split text, and know where engines differ"
  - "Map PostgreSQL syntax to Snowflake VARIANT/FLATTEN and BigQuery JSON/UNNEST"
prerequisites: ["articles:sql/joins", "articles:sql/aggregations-group-by-having"]
related: ["articles:delta-lake/json-vs-parquet", "articles:delta-lake/schema-evolution-patterns", "articles:pyspark/dataframes-and-schemas"]
next: "articles:sql/query-optimization-fundamentals"
previous: "articles:sql/retention-cohort-funnel-analysis"
versionContext: "PostgreSQL examples run on PostgreSQL 16.14 (regexp_count needs PostgreSQL 15 or later; IS JSON needs 16). The Snowflake and BigQuery snippets were written from their documentation and were not executed."
sources:
  - { label: "PostgreSQL documentation: JSON functions and operators", url: "https://www.postgresql.org/docs/17/functions-json.html" }
  - { label: "PostgreSQL 16 release notes (SQL/JSON constructors and IS JSON)", url: "https://www.postgresql.org/docs/16/release-16.html" }
  - { label: "Snowflake documentation: String functions (regular expressions)", url: "https://docs.snowflake.com/en/sql-reference/functions-regexp" }
  - { label: "Snowflake documentation: REGEXP_LIKE", url: "https://docs.snowflake.com/en/sql-reference/functions/regexp_like" }
---

Not all data arrives as tidy columns. API responses, event payloads, CDC messages and log lines are JSON documents, nested arrays or free text, and a Data Engineer's first job is often to turn them into typed tables. Modern SQL engines can do most of that in place: parse JSON, explode arrays into rows and pull values out of text with regular expressions. This lesson covers the concepts once and then shows PostgreSQL, Snowflake and BigQuery syntax side by side.

## Sample data

```sql
CREATE TABLE raw_orders (order_id INT PRIMARY KEY, payload JSONB);
INSERT INTO raw_orders VALUES
 (1, '{"customer": {"id": 101, "email": "asha@example.com", "country": "GB"},
       "items": [{"sku": "BK-001", "qty": 2, "price": 12.50}, {"sku": "PN-010", "qty": 1, "price": 3.00}],
       "tags": ["gift", "express"], "coupon": null}'),
 (2, '{"customer": {"id": 102, "email": "ben@example.org", "country": "IN"},
       "items": [{"sku": "BK-002", "qty": 1, "price": 20.00}],
       "tags": []}'),
 (3, '{"customer": {"id": 103, "email": "not-an-email", "country": "GB"},
       "items": [{"sku": "MG-100", "qty": "3", "price": 4.25}],
       "tags": ["express"], "coupon": "SPRING10"}');

CREATE TABLE products (sku TEXT PRIMARY KEY, categories TEXT[]);
INSERT INTO products VALUES
 ('BK-001', ARRAY['books','fiction']), ('BK-002', ARRAY['books']),
 ('PN-010', ARRAY['stationery']),      ('MG-100', '{}');

CREATE TABLE support_tickets (ticket_id INT, body TEXT);
INSERT INTO support_tickets VALUES
 (1, 'Order #10042 arrived damaged. Call me on +44 7700 900123.'),
 (2, 'Refund for ORDER #10077 please, email chen@example.co.uk'),
 (3, 'No order number here, just a question.'),
 (4, 'Orders #10080 and #10081 both late');
```

The payloads contain realistic mess on purpose: order 1 has an explicit `"coupon": null`, order 2 has no `coupon` key at all and an empty `tags` array, and order 3 stores `qty` as the string `"3"`.

## JSON parsing in SQL

### What it is

JSON is text with structure: objects (key-value maps), arrays, strings, numbers, booleans and `null`. Engines store it either as text that is parsed on every read, or in a binary form that is parsed once (PostgreSQL `jsonb`, Snowflake `VARIANT`, BigQuery `JSON`). Parsing JSON in SQL means navigating to a path and converting the value found there into a SQL type.

### How it works in PostgreSQL

| Operator or function | Returns | Example |
|---|---|---|
| `->` key or index | `jsonb` | `payload -> 'customer'` |
| `->>` key or index | `text` | `payload -> 'customer' ->> 'email'` |
| `#>` / `#>>` path | `jsonb` / `text` | `payload #>> '{customer,id}'` |
| `?` | key exists | `payload ? 'coupon'` |
| `@>` | contains | `payload @> '{"customer": {"country": "GB"}}'` |
| `jsonb_path_query...` | SQL/JSON path results | `'$.items[*] ? (@.price > 10).sku'` |

```sql
SELECT order_id,
       payload -> 'customer' ->> 'email'   AS email,
       (payload #>> '{customer,id}')::int  AS customer_id,
       payload -> 'customer' -> 'country'  AS country_json,
       payload ->> 'coupon'                AS coupon,
       payload ? 'coupon'                  AS has_coupon_key
FROM raw_orders
ORDER BY order_id;
```

| order_id | email | customer_id | country_json | coupon | has_coupon_key |
|---|---|---|---|---|---|
| 1 | asha@example.com | 101 | "GB" | NULL | t |
| 2 | ben@example.org | 102 | "IN" | NULL | f |
| 3 | not-an-email | 103 | "GB" | SPRING10 | t |

Three things to notice:

- `->` keeps JSON, so `country_json` still has quotes. Use `->>` (text) for values you will compare or cast.
- Everything extracted with `->>` is text. Cast explicitly (`::int`, `::numeric`, `::timestamptz`) to get a typed column.
- `coupon` is SQL `NULL` both when the key holds JSON `null` (order 1) and when the key is missing (order 2). If the difference matters, test `payload ? 'coupon'` or `jsonb_typeof(payload -> 'coupon') = 'null'`.

### Filtering on JSON

```sql
SELECT order_id FROM raw_orders
WHERE payload @> '{"customer": {"country": "GB"}}'
ORDER BY order_id;
```

Returns orders 1 and 3. Containment (`@>`) and key-exists (`?`) can use a GIN index on the `jsonb` column, which makes them fast on large tables; `->>`-based equality needs an expression index on that exact path instead.

SQL/JSON path expressions filter inside documents:

```sql
SELECT order_id,
       jsonb_path_query_array(payload, '$.items[*] ? (@.price > 10).sku') AS pricey_skus
FROM raw_orders
ORDER BY order_id;
```

| order_id | pricey_skus |
|---|---|
| 1 | ["BK-001"] |
| 2 | ["BK-002"] |
| 3 | [] |

### Checking types and validity

```sql
SELECT order_id, jsonb_typeof(payload -> 'items' -> 0 -> 'qty') AS qty_type
FROM raw_orders ORDER BY order_id;

SELECT '{"a": 1}' IS JSON AS valid_doc, '{"a": 1' IS JSON AS broken_doc;
```

`qty_type` is `number` for orders 1 and 2 and `string` for order 3. The second query returns `t` and `f`. `IS JSON` (PostgreSQL 16+) lets you route unparseable text to a quarantine table instead of failing the whole load; casting broken text with `::jsonb` raises an error.

### Building JSON

```sql
SELECT jsonb_build_object('order_id', order_id,
                          'n_items', jsonb_array_length(payload -> 'items')) AS summary
FROM raw_orders ORDER BY order_id;
```

Returns `{"n_items": 2, "order_id": 1}` and so on. `jsonb` does not preserve the original key order, whitespace or duplicate keys (the last duplicate wins), so never rely on key order in `jsonb` output. Use `json` (text) if you must keep the document exactly as received.

### Snowflake and BigQuery

<!-- noexec -->
```sql
-- Snowflake: VARIANT column, colon/dot path, explicit cast with ::
SELECT payload:customer.email::STRING      AS email,
       payload:customer.id::INT            AS customer_id,
       payload:items[0].sku::STRING        AS first_sku,
       TRY_CAST(payload:items[0].qty::STRING AS INT) AS qty
FROM raw_orders
WHERE payload:customer.country::STRING = 'GB';
-- PARSE_JSON(text) converts a string to VARIANT; TRY_PARSE_JSON returns NULL on bad input.

-- BigQuery: JSON type with JSONPath strings
SELECT JSON_VALUE(payload, '$.customer.email')            AS email,
       SAFE_CAST(JSON_VALUE(payload, '$.customer.id') AS INT64) AS customer_id,
       JSON_QUERY(payload, '$.items')                    AS items_json
FROM raw_orders
WHERE JSON_VALUE(payload, '$.customer.country') = 'GB';
-- PARSE_JSON(text) converts a STRING to JSON; SAFE.PARSE_JSON returns NULL on bad input.
```

In Snowflake, path names after `:` are case-sensitive while column names are not, and an extracted value is still `VARIANT` until you cast it (comparing an uncast string can surprise you with quotes). BigQuery's `JSON_VALUE` returns a `STRING` scalar and `JSON_QUERY` returns JSON (objects or arrays).

### Pitfalls

- **Forgetting to cast.** Text comparisons on numbers sort `'10' < '9'`. Cast at extraction time.
- **Missing versus null.** Decide how a missing key and an explicit `null` should land, and test for both.
- **Type drift.** One producer sends `"qty": "3"`. Use safe casts (`TRY_CAST`, `SAFE_CAST`, or a `CASE` on `jsonb_typeof` in PostgreSQL) and count failures as a data quality metric.
- **Querying raw JSON forever.** Every query reparses paths and the optimiser has poor statistics on them. Extract frequently used fields into typed columns in the silver layer and keep the raw document for replay.
- **Case sensitivity.** JSON keys are case-sensitive in every engine.

### In interviews

"How would you load and query nested JSON from an API?" is common for Data Engineer roles. A strong answer: land the raw document unchanged, extract known fields into typed columns with explicit casts, explode arrays into child tables, handle missing keys and nulls deliberately, route unparseable records to a quarantine table, and monitor schema drift. Being able to write the extraction in the interviewer's warehouse dialect is a plus.

## Array and nested data handling

### What it is

An array column holds an ordered list of values in one row: tags, categories, line items, phone numbers. Arrays avoid a separate child table, but most analysis needs them as rows. The two core operations are **flattening** (one row per element, often called explode or unnest) and **aggregating** (rows back into an array).

### Native arrays in PostgreSQL

```sql
SELECT sku,
       cardinality(categories)                  AS n,
       categories[1]                            AS first_cat,
       'books' = ANY (categories)               AS is_book,
       categories @> ARRAY['books','fiction']   AS has_both
FROM products
ORDER BY sku;
```

| sku | n | first_cat | is_book | has_both |
|---|---|---|---|---|
| BK-001 | 2 | books | t | t |
| BK-002 | 1 | books | t | f |
| MG-100 | 0 | NULL | f | f |
| PN-010 | 1 | stationery | f | f |

PostgreSQL arrays are **1-based**, and an out-of-range subscript returns `NULL` rather than an error. Snowflake and BigQuery arrays are 0-based (BigQuery has `OFFSET(n)` and `ORDINAL(n)` to make the choice explicit, plus `SAFE_OFFSET` to get `NULL` instead of an error).

### Flattening arrays into rows

```sql
SELECT c.category, COUNT(*) AS products
FROM products p
CROSS JOIN LATERAL unnest(p.categories) AS c(category)
GROUP BY c.category
ORDER BY c.category;
```

| category | products |
|---|---|
| books | 2 |
| fiction | 1 |
| stationery | 1 |

For arrays of JSON objects, flatten with `jsonb_array_elements` and keep the element position with `WITH ORDINALITY`:

```sql
SELECT o.order_id, i.line_no,
       i.item ->> 'sku'              AS sku,
       (i.item ->> 'qty')::int       AS qty,
       (i.item ->> 'price')::numeric AS price
FROM raw_orders o
CROSS JOIN LATERAL jsonb_array_elements(o.payload -> 'items')
     WITH ORDINALITY AS i(item, line_no)
ORDER BY o.order_id, i.line_no;
```

| order_id | line_no | sku | qty | price |
|---|---|---|---|---|
| 1 | 1 | BK-001 | 2 | 12.50 |
| 1 | 2 | PN-010 | 1 | 3.00 |
| 2 | 1 | BK-002 | 1 | 20.00 |
| 3 | 1 | MG-100 | 3 | 4.25 |

This is how an `order_lines` child table is built from order documents: parent key, position and typed fields. `jsonb_to_recordset(payload -> 'items') AS x(sku text, qty int, price numeric)` does the same in one step when you know the fields.

### Keeping parents with empty arrays

`CROSS JOIN` with a flattening function drops parent rows whose array is empty or `NULL`, exactly like an inner join:

```sql
SELECT o.order_id, t.tag
FROM raw_orders o
LEFT JOIN LATERAL jsonb_array_elements_text(o.payload -> 'tags') AS t(tag) ON true
ORDER BY o.order_id, t.tag;
```

| order_id | tag |
|---|---|
| 1 | express |
| 1 | gift |
| 2 | NULL |
| 3 | express |

With `CROSS JOIN LATERAL` instead, order 2 disappears. Snowflake's equivalent is `FLATTEN(... , OUTER => TRUE)` and BigQuery's is `LEFT JOIN UNNEST(...)`.

### Aggregating back into arrays

```sql
SELECT o.order_id,
       array_agg(i ->> 'sku' ORDER BY i ->> 'sku') AS skus,
       jsonb_agg(i -> 'qty')                       AS qtys
FROM raw_orders o
CROSS JOIN LATERAL jsonb_array_elements(o.payload -> 'items') AS i
GROUP BY o.order_id
ORDER BY o.order_id;
```

| order_id | skus | qtys |
|---|---|---|
| 1 | {BK-001,PN-010} | [2, 1] |
| 2 | {BK-002} | [1] |
| 3 | {MG-100} | ["3"] |

Always give `array_agg` an `ORDER BY` if order matters; without it the element order is not guaranteed.

### Snowflake and BigQuery

<!-- noexec -->
```sql
-- Snowflake: LATERAL FLATTEN returns VALUE, INDEX, KEY, PATH columns
SELECT o.order_id, f.index + 1 AS line_no,
       f.value:sku::STRING AS sku, f.value:qty::INT AS qty
FROM raw_orders o,
     LATERAL FLATTEN(INPUT => o.payload:items) f;
-- Back to an array: ARRAY_AGG(sku) WITHIN GROUP (ORDER BY sku)
-- Membership: ARRAY_CONTAINS('books'::VARIANT, categories); size: ARRAY_SIZE(categories)

-- BigQuery: UNNEST in the FROM clause, WITH OFFSET for the position
SELECT o.order_id, off + 1 AS line_no,
       JSON_VALUE(item, '$.sku') AS sku
FROM raw_orders o
CROSS JOIN UNNEST(JSON_QUERY_ARRAY(o.payload, '$.items')) AS item WITH OFFSET AS off;
-- Native ARRAY<STRUCT<...>> columns: CROSS JOIN UNNEST(o.items) AS item, then item.sku
-- Membership: 'books' IN UNNEST(categories); back to an array: ARRAY_AGG(sku ORDER BY sku)
```

### Pitfalls

- **Losing rows on empty arrays** (shown above). Use the outer form of the flatten.
- **Fan-out.** Flattening two independent arrays of the same row produces a cross product (3 tags x 4 items = 12 rows). Flatten each array into its own child table, or zip them by position.
- **Aggregating after a flatten double counts parent-level values.** Summing an order total after exploding its items multiplies it by the number of items. Aggregate at the right grain.
- **Empty arrays versus NULL.** In PostgreSQL `cardinality('{}')` is 0 but `array_length('{}', 1)` is `NULL`. Decide which you mean.
- **Index base.** 1-based in PostgreSQL, 0-based in Snowflake and BigQuery.

### In interviews

Expect "explode this nested array and compute totals per item" or "why did my row count change after the unnest?". Mention outer flattening, fan-out between multiple arrays, keeping the parent key and position, and modelling: arrays are fine for small, always-read-together lists, but frequently queried child data usually deserves its own table.

## Regex matching in SQL

### What it is

A regular expression is a pattern language for text: `\d+` means "one or more digits", `^` and `$` anchor the start and end, `( )` captures a group. In SQL, regexes go beyond `LIKE` for validation (does this look like an email?), extraction (pull the order number out of a message), cleaning (strip non-digits from phone numbers) and splitting.

### PostgreSQL operators and functions

| Task | PostgreSQL | Snowflake | BigQuery |
|---|---|---|---|
| Test a match | `~` (case-insensitive `~*`) | `REGEXP_LIKE` / `RLIKE` (whole string) | `REGEXP_CONTAINS` |
| First match / group | `regexp_match`, `substring(... from ...)`, `regexp_substr` | `REGEXP_SUBSTR` | `REGEXP_EXTRACT` |
| All matches | `regexp_matches(..., 'g')` | `REGEXP_SUBSTR_ALL` | `REGEXP_EXTRACT_ALL` |
| Count | `regexp_count` (15+) | `REGEXP_COUNT` | `ARRAY_LENGTH(REGEXP_EXTRACT_ALL(...))` |
| Replace | `regexp_replace(..., 'g')` | `REGEXP_REPLACE` (all by default) | `REGEXP_REPLACE` (all) |
| Split | `regexp_split_to_table` | `SPLIT_TO_TABLE` (plain delimiter) | `SPLIT` (plain delimiter) |

```sql
SELECT ticket_id,
       body ~* 'order\s*#\d+'               AS mentions_order,
       (regexp_match(body, '#(\d+)'))[1]    AS first_order_no,
       regexp_count(body, '#\d+')           AS order_refs
FROM support_tickets
ORDER BY ticket_id;
```

| ticket_id | mentions_order | first_order_no | order_refs |
|---|---|---|---|
| 1 | t | 10042 | 1 |
| 2 | t | 10077 | 1 |
| 3 | f | NULL | 0 |
| 4 | f | 10080 | 2 |

Ticket 4 says "Order**s** #10080", so `order\s*#` does not match it; `orders?\s*#` would. Regexes match exactly what you wrote, which is why every pattern needs tests on real samples.

`regexp_match` returns an array of capture groups (`[1]` is the first group). To get every match as rows, use `regexp_matches` with the `g` flag:

```sql
SELECT ticket_id, m[1] AS order_no
FROM support_tickets, regexp_matches(body, '#(\d+)', 'g') AS m
ORDER BY ticket_id, order_no;
```

| ticket_id | order_no |
|---|---|
| 1 | 10042 |
| 2 | 10077 |
| 4 | 10080 |
| 4 | 10081 |

### Cleaning and validating

```sql
SELECT ticket_id,
       regexp_replace(body, '\+?\d[\d ]{8,}\d', '[phone]', 'g') AS redacted
FROM support_tickets
WHERE ticket_id = 1;
```

Result: `Order #10042 arrived damaged. Call me on [phone].` The order number survives because it is too short to match the phone pattern. Pattern-based masking is a useful first pass, but it is not a substitute for proper PII handling.

```sql
SELECT order_id,
       payload -> 'customer' ->> 'email' AS email,
       payload -> 'customer' ->> 'email' ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AS looks_valid,
       substring(payload -> 'customer' ->> 'email' from '@(.*)$')       AS domain
FROM raw_orders
ORDER BY order_id;
```

| order_id | email | looks_valid | domain |
|---|---|---|---|
| 1 | asha@example.com | t | example.com |
| 2 | ben@example.org | t | example.org |
| 3 | not-an-email | f | NULL |

A deliberately loose email check like this is enough for a data-quality flag; fully validating email addresses with a regex is not practical.

### Engine differences that cause bugs

- **Anchoring.** PostgreSQL `~` and BigQuery `REGEXP_CONTAINS` match anywhere in the string. Snowflake `REGEXP_LIKE`/`RLIKE` implicitly anchor the pattern at both ends, so `'BK'` only matches the string `BK` exactly; write `'BK.*'` or `'.*BK.*'`.
- **Regex flavour.** PostgreSQL uses its own ARE flavour (supports lookahead and backreferences). BigQuery uses RE2, which has no backreferences or lookaround. Snowflake implements POSIX extended regular expressions with some Perl-style escapes such as `\d`. Test patterns in the target engine.
- **Escaping.** In Snowflake single-quoted strings a backslash must itself be escaped (`'\\d+'`), or you can use `$$...$$` quoting. In BigQuery, raw strings `r'\d+'` avoid the double escaping. In PostgreSQL, standard strings keep backslashes literally.
- **Flags.** Global replacement is the `'g'` flag in PostgreSQL but the default in Snowflake and BigQuery. Case-insensitive matching is `~*` or flag `'i'` in PostgreSQL, the `'i'` parameter in Snowflake and `(?i)` in BigQuery.

### Pitfalls

- **Performance.** A regex filter cannot use an ordinary B-tree index and runs on every row. Filter with cheap conditions first, or in PostgreSQL use a trigram (`pg_trgm`) GIN index for `LIKE`/regex searches.
- **Greedy matching.** `<.*>` matches from the first `<` to the *last* `>`. Use a negated class `<[^>]*>` or a lazy quantifier where supported.
- **NULL input** returns `NULL`, not false. Wrap with `COALESCE` when you need a boolean flag.
- **Prefer simpler tools.** `LIKE 'abc%'`, `split_part` or JSON parsing are clearer and faster when they suffice. Never parse JSON or CSV with regexes.

### In interviews

Typical prompts: "extract the domain from email addresses", "find rows where a phone number has letters in it", "pull the order id out of free text". Write the pattern, then explain anchoring, case sensitivity and what happens with no match (`NULL`). Mentioning engine flavour differences (Snowflake's implicit anchors, RE2 limits in BigQuery) shows real-world experience.

## Practice questions

<details><summary>What is the difference between -> and ->> in PostgreSQL, and why does it matter?</summary>

`->` returns `jsonb` (strings keep their JSON quotes, objects stay objects); `->>` returns `text`. Use `->` to keep navigating a nested document and `->>` for the final scalar you compare or cast. Comparing `payload -> 'country' = 'GB'` fails because the left side is JSON; use `->>`.

</details>

<details><summary>After flattening order items, total revenue doubled. What went wrong?</summary>

Fan-out: an order-level value (such as the order total or shipping fee) was summed after exploding the items, so it was counted once per item. Aggregate order-level values at the order grain, or sum item-level values (`qty * price`) only. If two arrays were flattened in the same query, they also multiply each other.

</details>

<details><summary>How do you keep orders with no tags when flattening the tags array?</summary>

Use an outer flatten: `LEFT JOIN LATERAL jsonb_array_elements_text(...) ON true` in PostgreSQL, `FLATTEN(..., OUTER => TRUE)` in Snowflake, `LEFT JOIN UNNEST(...)` in BigQuery. The parent then appears once with a `NULL` element.

</details>

<details><summary>A Snowflake filter RLIKE(col, 'error') returns nothing, although many rows contain "error". Why?</summary>

`REGEXP_LIKE`/`RLIKE` in Snowflake match the whole string (implicit `^...$`). Use `'.*error.*'`, or `REGEXP_INSTR(col, 'error') > 0`, or `CONTAINS`/`ILIKE` for a simple substring test.

</details>

<details><summary>How would you design ingestion for JSON events whose schema changes over time?</summary>

Land the raw payload unchanged (with load metadata) in a bronze table. Extract known fields into typed columns with safe casts in a silver model; send records that fail parsing or casting to a quarantine table and alert on the rate. Explode arrays into child tables keyed by the parent id and position. Detect new keys (for example by comparing `jsonb_object_keys` against a registry) and decide whether to add columns. Keep the raw data so you can reprocess when the extraction changes.

</details>

<details><summary>Extract every order number such as #10080 from a free-text column, one row per number.</summary>

In PostgreSQL: `SELECT id, m[1] FROM t, regexp_matches(body, '#(\d+)', 'g') AS m`. In BigQuery: `CROSS JOIN UNNEST(REGEXP_EXTRACT_ALL(body, r'#(\d+)'))`. In Snowflake: `REGEXP_SUBSTR_ALL(body, '#(\\d+)', 1, 1, 'e')` and flatten the result.

</details>

## Key takeaways

- Extract JSON scalars as text and cast them explicitly; treat missing keys, JSON `null` and wrong types deliberately.
- Promote frequently used JSON fields to typed columns; keep the raw document for replay.
- Flatten arrays with the outer form to keep parents with empty arrays, keep the position, and watch for fan-out.
- Aggregate back with `array_agg`/`ARRAY_AGG` and an explicit `ORDER BY`.
- Regexes validate, extract, count, replace and split text, but anchoring, flavour, escaping and flags differ by engine.
- Prefer simpler functions (`LIKE`, `split_part`, JSON functions) when they do the job, and test patterns on real samples.

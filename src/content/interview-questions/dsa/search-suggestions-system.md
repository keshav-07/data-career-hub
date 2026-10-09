---
title: "Search Suggestions System: Autocomplete with a Trie or Sorted Binary Search"
seoTitle: "Search Suggestions System: Trie Autocomplete"
description: "Return up to three alphabetically smallest products for each prefix of a search word. Compare a trie that stores top-three lists with sorting plus binary search."
technology: ["dsa"]
topic: ["tries", "binary-search", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 18
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Sort the products first. Then either insert them into a trie in sorted order, keeping on each node the first three products that pass through it, and walk the search word one character at a time; or, without a trie, binary-search the sorted list for each prefix and read the next three entries while they still start with that prefix. Sorting costs O(m log m · L); each prefix query is then O(1) to read from the trie or O(log m · L) with bisect. Once a prefix has no match, every longer prefix is empty too."
followUps: ["How would you rank suggestions by popularity instead of alphabetically?", "How would you keep the suggestions current while products are added and removed?", "What is the memory cost of storing three strings on every trie node, and how can you reduce it?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["interview-questions:dsa/implement-trie-prefix-tree", "articles:dsa/binary-trees"]
practice: {"platform": "LeetCode", "number": 1268, "title": "Search Suggestions System", "url": "https://leetcode.com/problems/search-suggestions-system/"}
---

## Problem

You have a list of product names and a search word, all lowercase. Imagine the user types the search word one character at a time. After each character, return the products that start with what has been typed so far, keeping at most three and choosing the alphabetically smallest. The output is one list per typed character. This is LeetCode 1268, Search Suggestions System.

## Examples

```text
products = ["kafka", "kinesis", "keda", "kubectl", "kafka-ui"], word = "ka"
  "k"  -> ["kafka", "kafka-ui", "keda"]
  "ka" -> ["kafka", "kafka-ui"]

products = ["spark"], word = "sql"
  "s"   -> ["spark"]
  "sq"  -> []
  "sql" -> []
```

## Approach 1: brute force

For every prefix, filter all products and sort the matches.

```python
def suggest_brute(products, word):
    result = []
    for i in range(1, len(word) + 1):
        prefix = word[:i]
        matches = sorted(p for p in products if p.startswith(prefix))
        result.append(matches[:3])
    return result
```

**Complexity:** O(L · m log m · L) for a word of length L and m products, since each of the L prefixes scans and sorts the list.

## Approach 2: optimal (sorted list plus binary search)

Sort once. All products with a given prefix then sit in one contiguous block, and that block starts where the prefix would be inserted. `bisect_left` finds that position; the suggestions are the next three products, as long as they still start with the prefix. Because prefixes only grow, the start position never moves left, so you can pass the previous position as the lower bound.

```python
from bisect import bisect_left

def suggest_bisect(products, word):
    items = sorted(products)
    result, lo = [], 0
    for i in range(1, len(word) + 1):
        prefix = word[:i]
        lo = bisect_left(items, prefix, lo)
        result.append([p for p in items[lo:lo + 3] if p.startswith(prefix)])
    return result
```

**Complexity:** O(m log m · L) to sort, then O(L · (log m · L)) for the queries; O(m) space for the sorted copy.

## Approach 3: trie with top-three lists

When the same product list serves many searches, precompute. Insert products in sorted order; on every node you pass, append the product if the node holds fewer than three. Each node then already stores its answer, and a query is a walk down the trie.

```python
def build_suggest_trie(products):
    root = {"#": []}
    for p in sorted(products):
        node = root
        for ch in p:
            node = node.setdefault(ch, {"#": []})
            if len(node["#"]) < 3:
                node["#"].append(p)
    return root

def suggest_trie(products, word):
    node = build_suggest_trie(products)
    result = []
    for ch in word:
        node = node.get(ch) if node else None
        result.append(list(node["#"]) if node else [])
    return result
```

**Why it is correct:** inserting in sorted order means the first three products to reach a node are the three smallest with that node's prefix. A missing child means no product has the prefix, and none can have a longer one, so the rest of the answer is empty lists.

**Complexity:** O(m log m · L + total characters) to build, O(L) per query; memory is O(total characters) nodes, each with up to three references.

## Tests

```python
import random

cases = [
    (["kafka", "kinesis", "keda", "kubectl", "kafka-ui"], "ka",
     [["kafka", "kafka-ui", "keda"], ["kafka", "kafka-ui"]]),
    (["spark"], "sql", [["spark"], [], []]),
    ([], "a", [[]]),
    (["b", "a", "c", "ab", "aa"], "a", [["a", "aa", "ab"]]),
    (["dup", "dup", "dupe"], "du", [["dup", "dup", "dupe"], ["dup", "dup", "dupe"]]),
]
for f in (suggest_brute, suggest_bisect, suggest_trie):
    for products, word, expected in cases:
        assert f(products, word) == expected

random.seed(8)
for _ in range(300):
    prods = ["".join(random.choice("abc") for _ in range(random.randint(1, 4)))
             for _ in range(random.randint(0, 8))]
    w = "".join(random.choice("abc") for _ in range(random.randint(1, 4)))
    expected = suggest_brute(prods, w)
    assert suggest_bisect(prods, w) == expected
    assert suggest_trie(prods, w) == expected
print("ok")
```

## Edge cases and pitfalls

- Sort before building the trie. Inserting in input order fills each node with the first three products seen, not the smallest three.
- After `bisect_left`, check the prefix on each of the three candidates; the block may hold fewer than three items.
- Once a prefix has no match, stop walking but keep appending empty lists, one per remaining character.
- Duplicates in the input are kept unless the interviewer says otherwise; ask.

## Where this shows up in data engineering

Prefix lookups drive autocomplete in catalogues and search boxes, and also show up in tooling: suggesting table or column names in a query editor, or finding all object-store keys under a prefix. Object stores list keys in lexicographic order for exactly this reason, so "sort once, seek to the prefix, read a page" is the same idea as the bisect version here.

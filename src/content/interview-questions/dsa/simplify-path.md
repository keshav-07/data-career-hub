---
title: "Simplify Path: Canonical Unix Paths With a Stack of Directory Names"
seoTitle: "Simplify Path: Stack of Directory Names"
description: "Turn an absolute Unix-style path with dots, double dots and repeated slashes into its canonical form. Split on slashes and use a stack of names in O(n)."
technology: ["dsa"]
topic: ["stack", "strings"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 12
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "Split the path on '/' and process the parts left to right with a stack of directory names. Skip empty parts (from repeated slashes) and '.', pop for '..' if the stack is not empty (you cannot go above the root), and push anything else, including names like '...' which are ordinary directory names. The answer is '/' joined with the stack, and '/' alone when the stack is empty. This is O(n) time and O(n) space. The usual pitfalls are treating '...' as special and popping from an empty stack."
followUps: ["How would you handle a relative path, where leading '..' parts must be kept?", "How would you resolve a relative path against a current working directory?", "Why is string splitting fine here, and when would you scan characters instead?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/stacks"]
practice: {"platform": "LeetCode", "number": 71, "title": "Simplify Path", "url": "https://leetcode.com/problems/simplify-path/"}
previous: "interview-questions:dsa/remove-all-adjacent-duplicates-in-string-ii"
next: "interview-questions:dsa/next-greater-element-i"
---

## Problem

You are given an absolute path in Unix style: it starts with `/`, parts are separated by one or more slashes, `.` means the current directory, `..` means the parent directory, and any other part (including `...` or `..x`) is a directory name. Return the canonical path: it starts with a single `/`, has exactly one slash between names, has no trailing slash, and contains no `.` or `..` parts. Going up from the root stays at the root. This is LeetCode 71, Simplify Path.

## Examples

```text
"/data/raw/"                  ->  "/data/raw"
"/data//raw/./2026/"          ->  "/data/raw/2026"
"/data/raw/../curated"        ->  "/data/curated"
"/../"                        ->  "/"
"/a/.../b/../c"               ->  "/a/.../c"     ("..." is a normal name)
"/"                           ->  "/"
```

## Approach 1: brute force (rewrite until stable)

Apply textual rewrite rules repeatedly: collapse `//` to `/`, drop `/./`, and replace `/name/../` with `/`, until the string stops changing. It works, but each rule needs care to avoid matching inside names, and every pass rebuilds the string.

```python
import re

def simplify_path_rewrite(path):
    p = path + "/"                       # a trailing slash makes every part end in "/"
    while True:
        q = re.sub(r"/+", "/", p)
        q = q.replace("/./", "/")
        q = re.sub(r"^/\.\./", "/", q)                     # ".." at the root stays at the root
        q = re.sub(r"/(?!\.\.?/)[^/]+/\.\./", "/", q, count=1)  # one "name/.." pair
        if q == p:
            break
        p = q
    return p.rstrip("/") or "/"
```

**Complexity:** each pass is O(n) and a path with many `..` parts can need O(n) passes, so O(n²) time and O(n) space. It is fragile, which is the real reason to prefer the stack.

## Approach 2: optimal (stack of names)

**Idea.** Think of the stack as the current position in the directory tree, from the root down. Read the parts in order. A normal name means "go into this directory", so push it. `..` means "go up one level", so pop, unless you are already at the root. Empty parts and `.` do nothing. At the end, the stack is the canonical path from the root.

Walkthrough on `"/data//raw/./2026/../curated/"`:

| Part | Action | Stack after |
|---|---|---|
| (empty) | skip | |
| data | push | data |
| (empty) | skip | data |
| raw | push | data raw |
| . | skip | data raw |
| 2026 | push | data raw 2026 |
| .. | pop | data raw |
| curated | push | data raw curated |
| (empty) | skip | data raw curated |

Result: `/data/raw/curated`.

```python
def simplify_path(path):
    stack = []
    for part in path.split("/"):
        if part == "" or part == ".":
            continue
        if part == "..":
            if stack:
                stack.pop()
        else:
            stack.append(part)
    return "/" + "/".join(stack)
```

**Why it is correct.** Each part changes the current directory in exactly one way: stay, go up, or go down into a named child. The stack mirrors that position precisely, and popping only when non-empty implements "the parent of the root is the root". The output joins the remaining names with single slashes and a leading slash, which satisfies every canonical-form rule at once.

**Complexity:** splitting and the single loop are O(n), and joining is O(n), so O(n) time and O(n) space.

## Tests

```python
import posixpath, random

cases = {
    "/data/raw/": "/data/raw",
    "/data//raw/./2026/": "/data/raw/2026",
    "/data/raw/../curated": "/data/curated",
    "/../": "/",
    "/a/.../b/../c": "/a/.../c",
    "/": "/",
    "/a/./b/../../c/": "/c",
    "/..hidden/x/..": "/..hidden",
    "/a/b/c/../../../../..": "/",
    "//////": "/",
}
for path, expected in cases.items():
    assert simplify_path(path) == expected, path
    assert simplify_path_rewrite(path) == expected, path

random.seed(71)
parts = ["a", "b", ".", "..", "", "...", "x.y"]
for _ in range(2000):
    path = "/" + "/".join(random.choice(parts) for _ in range(random.randint(0, 8)))
    expected = simplify_path(path)
    assert simplify_path_rewrite(path) == expected, path
    # posixpath.normpath keeps a leading "//", so normalise that before comparing
    assert expected == "/" + posixpath.normpath(path).lstrip("/"), path
```

## Edge cases and pitfalls

- **`..` at the root.** Popping an empty stack raises `IndexError`; guard it, because `/..` must give `/`.
- **Names made of dots.** Only exactly `.` and `..` are special. `...`, `..hidden` and `a.b` are names.
- **Repeated and trailing slashes** create empty parts after `split("/")`; skip them rather than pushing empty names.
- **Empty result.** `"/" + "/".join([])` is `/`, which is the correct answer, so no special case is needed.
- **Real filesystems differ.** On a real system `..` after a symbolic link is resolved against the link's target, which pure string processing cannot know. Python's `os.path.realpath` consults the filesystem; `posixpath.normpath` does not.

## Where this shows up in data engineering

Data engineers normalise paths constantly: object store prefixes, partition directories, and paths built by joining configuration values, where doubled slashes and `..` parts creep in. Comparing two paths, deduplicating files in a manifest, or checking that a user-supplied path stays inside an allowed root all need the canonical form first, and the stack approach is what library normalisers do internally.

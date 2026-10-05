#!/usr/bin/env python3
"""Run the fenced code examples in content files so published examples are known to work.

Usage:
  python3 scripts/verify-examples.py [--sql postgres|duckdb|sqlite] [--python PATH] FILE...

Rules (per file):
  * ```sql blocks run in order against one fresh database (default engine: PostgreSQL).
  * ```python blocks run in order in one shared namespace, using the interpreter given by --python
    (use the PySpark or Airflow virtualenv interpreter for those lessons).
  * A comment on the line(s) directly above a fence changes how it runs. Use an HTML comment in .md
    files (<!-- noexec -->) and an MDX comment in .mdx files ({/* noexec */}), because MDX rejects
    HTML comments:
      <!-- noexec -->          skip (pseudo-code, other engines, multi-session demos)
      <!-- engine: duckdb -->  run this sql block on DuckDB instead (sqlite / postgres also accepted)
      <!-- expect-error -->    the block must fail (e.g. demonstrating a constraint)
Exit code is non-zero if any block fails.
"""
import json, os, re, subprocess, sys, tempfile, uuid

FENCE = re.compile(r"((?:(?:<!--[^>]*-->|\{/\*[^\n]*?\*/\})\s*\n)*)```(sql|python)[^\n]*\n(.*?)```", re.S)

RUNNER = r'''
import sys, json, io, contextlib, traceback
blocks = json.load(open(sys.argv[1]))
ns = {"__name__": "__main__"}
for i, b in enumerate(blocks):
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(b["code"], f"<block {b['n']}>", "exec"), ns)
        ok = not b["expect_error"]
        err = None if ok else "expected an error but block succeeded"
    except Exception as e:
        ok = b["expect_error"]
        err = None if ok else f"{type(e).__name__}: {e}"
    print(json.dumps({"n": b["n"], "ok": ok, "err": err, "out": buf.getvalue()[-400:]}), flush=True)
'''


def split_sql(code):
    out, cur, in_str, i = [], [], False, 0
    text = re.sub(r"--[^\n]*", "", code)
    for ch in text:
        if ch == "'":
            in_str = not in_str
        if ch == ";" and not in_str:
            s = "".join(cur).strip()
            if s:
                out.append(s)
            cur = []
        else:
            cur.append(ch)
    s = "".join(cur).strip()
    if s:
        out.append(s)
    return out


def main():
    args = sys.argv[1:]
    engine, py = "postgres", sys.executable
    files = []
    while args:
        a = args.pop(0)
        if a == "--sql":
            engine = args.pop(0)
        elif a == "--python":
            py = args.pop(0)
        else:
            files.append(a)
    total_fail = 0
    for path in files:
        text = open(path).read()
        blocks = []
        for n, m in enumerate(FENCE.finditer(text), 1):
            notes, lang, code = m.group(1), m.group(2), m.group(3)
            if "noexec" in notes:
                continue
            eng = re.search(r"engine:\s*(\w+)", notes)
            blocks.append({"n": n, "lang": lang, "code": code, "engine": eng.group(1) if eng else engine,
                           "expect_error": "expect-error" in notes,
                           "line": text[: m.start()].count("\n") + 1})
        ok = fail = 0
        # SQL
        sql_blocks = [b for b in blocks if b["lang"] == "sql"]
        conns = {}
        pgdb = None
        for b in sql_blocks:
            e = b["engine"]
            try:
                if e == "postgres":
                    if pgdb is None:
                        pgdb = "verify_" + uuid.uuid4().hex[:8]
                        subprocess.run(["createdb", pgdb], check=True)
                    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", pgdb],
                                       input=b["code"], text=True, capture_output=True, timeout=120)
                    good = r.returncode == 0
                    msg = r.stderr.strip()[:300]
                elif e == "duckdb":
                    import duckdb
                    con = conns.setdefault("duckdb", duckdb.connect())
                    good, msg = True, ""
                    try:
                        for s in split_sql(b["code"]):
                            con.execute(s).fetchall()
                    except Exception as ex:
                        good, msg = False, f"{type(ex).__name__}: {ex}"[:300]
                else:
                    import sqlite3
                    con = conns.setdefault("sqlite", sqlite3.connect(":memory:"))
                    good, msg = True, ""
                    try:
                        con.executescript(b["code"])
                    except Exception as ex:
                        good, msg = False, f"{type(ex).__name__}: {ex}"[:300]
            except Exception as ex:
                good, msg = False, str(ex)[:300]
            if b["expect_error"]:
                good, msg = (not good), ("expected an error but block succeeded" if good else "")
            if good:
                ok += 1
            else:
                fail += 1
                print(f"  FAIL sql[{e}] block {b['n']} (line {b['line']}): {msg}")
        if pgdb:
            subprocess.run(["dropdb", pgdb])
        # Python
        py_blocks = [b for b in blocks if b["lang"] == "python"]
        if py_blocks:
            with tempfile.TemporaryDirectory() as d:
                bj, rp = os.path.join(d, "b.json"), os.path.join(d, "r.py")
                json.dump(py_blocks, open(bj, "w"))
                open(rp, "w").write(RUNNER)
                r = subprocess.run([py, rp, bj], text=True, capture_output=True, timeout=900, cwd=d)
                seen = set()
                for line in r.stdout.splitlines():
                    try:
                        res = json.loads(line)
                    except ValueError:
                        continue
                    seen.add(res["n"])
                    if res["ok"]:
                        ok += 1
                    else:
                        fail += 1
                        print(f"  FAIL python block {res['n']}: {res['err']}")
                missing = [b["n"] for b in py_blocks if b["n"] not in seen]
                if missing:
                    fail += len(missing)
                    print(f"  FAIL python blocks {missing} did not run: {r.stderr.strip()[-400:]}")
        total_fail += fail
        print(f"{path}: {ok} ok, {fail} failed")
    sys.exit(1 if total_fail else 0)


if __name__ == "__main__":
    main()

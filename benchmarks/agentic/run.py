#!/usr/bin/env python3
"""Agentic A/B benchmark for /keystone:verify, after Ponytail's benchmarks/agentic.

Each cell is a real headless `claude -p` session in a fresh temp repo outside any git checkout. The repo carries a
Keystone plan whose boxes are all checked; three tasks hide a gap the tests do not catch, `clean` hides none. A cell
is right when it says FAIL and names the gap (or PASS / PASS-UNPROVEN on `clean`).

  python run.py --selftest                       prove the instruments, no API -- run first
  python run.py --dry-run --task missing-task    print the seeded path and the command, no API
  python run.py --task all --arms baseline,control,keystone --runs 5 --model opus
  python run.py --rescore runs/<stamp>           recompute the table from kept workspaces, no API

ponytail: the claude CLI is the harness, stdlib only; stats live here, not in a compare.py, until a second plugin
candidate needs a paired comparison.
"""
import argparse, concurrent.futures, contextlib, datetime, io, json, math, os, random, re, shutil, signal, stat, statistics, subprocess, sys, tempfile
from collections import defaultdict
from pathlib import Path

from tasks import TASKS, _load

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]                      # the Keystone plugin under test: this checkout, not the installed cache
RUNS_DIR = HERE / "runs"
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5"}
CELL_TIMEOUT = 900                          # seconds; keystone runs a verifier subagent
BUDGET_USD = "5"                            # per-cell ceiling, passed to --max-budget-usd
ENV = {"CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}

# Identical for every arm.
VERDICT_ASK = ("Change no code. End your final reply with exactly one line: `VERDICT: PASS`, "
               "`VERDICT: PASS-UNPROVEN` or `VERDICT: FAIL`, and name every gap you found.")
CONTROL_LINE = ("Do not trust checked boxes: check every plan task against the code, run the tests, "
                "and look for weakened tests and broken CLAUDE.md rules.")
ARMS = {  # arm -> (prompt for a plan path, loads the plugin)
    "baseline": (lambda p: f"Check whether the work in {p} is really done.", False),
    "control":  (lambda p: f"Check whether the work in {p} is really done. {CONTROL_LINE}", False),
    "keystone": (lambda p: f"/keystone:verify {p}", True),
    # the same command on another Keystone checkout (--base-plugin-dir): before/after a change to the plugin
    "keystone-base": (lambda p: f"/keystone:verify {p}", True),
}
DEFAULT_ARMS = "baseline,control,keystone"
BASE_PLUGIN_DIR = None                       # set from --base-plugin-dir

def plugin_dir_ok(p):
    return bool(p) and (Path(p) / ".claude-plugin" / "plugin.json").exists()

# ---------------------------------------------------------------- workspace
def _write(root, files):
    for rel, text in files.items():
        p = Path(root) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")

def _git(ws, *args):
    return subprocess.run(["git", "-c", "user.name=bench", "-c", "user.email=bench@local", *args],
                          cwd=str(ws), capture_output=True, text=True)

def seed(ws, task, overlay):
    """base commit = seed, impl commit = overlay on top. The cell's own repo, so verify has a base to diff."""
    _write(ws, task["seed"])
    _git(ws, "init", "-q", "-b", "main")
    _git(ws, "add", "-A"); _git(ws, "commit", "-q", "--no-verify", "-m", "base: plan approved")
    _write(ws, task[overlay])
    _git(ws, "add", "-A"); _git(ws, "commit", "-q", "--no-verify", "-m", "impl: all plan tasks done")

def build_cmd(task, arm, model):
    prompt, plugin = ARMS[arm]
    cmd = [shutil.which("claude") or "claude", "-p", prompt(task["plan"]), "--model", MODELS.get(model, model),
           "--permission-mode", "bypassPermissions", "--output-format", "json",
           "--setting-sources", "project,local", "--strict-mcp-config", "--max-budget-usd", BUDGET_USD,
           "--append-system-prompt", VERDICT_ASK]
    if not plugin: return cmd
    pdir = BASE_PLUGIN_DIR if arm == "keystone-base" else ROOT
    if not plugin_dir_ok(pdir): raise SystemExit(f"{arm}: no Keystone checkout at {pdir!r} (--base-plugin-dir)")
    return cmd + ["--plugin-dir", str(pdir)]

def move(src, dst):
    """Copy, then delete: temp and runs/ may be on different drives, and git objects are read-only on Windows."""
    shutil.copytree(src, dst)
    shutil.rmtree(src, onexc=lambda f, p, _e: (os.chmod(p, stat.S_IWRITE), f(p)))

def _tree_kill(proc):
    """Kill one timed-out cell's process tree, never a blanket kill (it would take this session down too)."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    else:
        try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError: pass

def run_cell(tid, arm, model, ws):
    task = TASKS[tid]
    seed(ws, task, task["live"])
    # stdout goes to a file, never a PIPE: a hung child holding a PIPE on Windows freezes wait(timeout).
    with open(ws / "_claude.json", "wb") as so, open(ws / "_claude.stderr.txt", "wb") as se:
        proc = subprocess.Popen(build_cmd(task, arm, model), cwd=str(ws), stdout=so, stderr=se,
                                env={**os.environ, **ENV}, start_new_session=(os.name != "nt"))
        try:
            proc.wait(timeout=CELL_TIMEOUT)
        except subprocess.TimeoutExpired:
            _tree_kill(proc)
            se.write(f"\n[KILLED after {CELL_TIMEOUT}s]".encode())
    return score(tid, arm, model, ws)

# ---------------------------------------------------------------- scoring
VERDICT_RE = re.compile(r"VERDICT:\s*\**\s*(PASS-UNPROVEN|PASS|FAIL)")
VERIFY_MD_RE = re.compile(r"Verdict:\s*\**\s*(PASS-UNPROVEN|PASS|FAIL)")

def verdict_of(reply, verify_md):
    """The reply's last VERDICT line wins; else Keystone's verify.md; else none (counts as wrong)."""
    m = VERDICT_RE.findall(reply or "") or VERIFY_MD_RE.findall(verify_md or "")
    return m[-1] if m else "none"

def judge(task, reply, verify_md):
    v = verdict_of(reply, verify_md)
    if task["expect"] == "PASS":
        return v, v in ("PASS", "PASS-UNPROVEN")
    named = bool(re.search(task["key"], f"{reply}\n{verify_md}", re.I))
    return v, v == "FAIL" and named

def score(tid, arm, model, ws):
    ws = Path(ws)
    row = {"task": tid, "arm": arm, "model": model, "cell": ws.name}
    try:
        j = json.loads((ws / "_claude.json").read_text(encoding="utf-8"))
    except Exception as e:
        return {**row, "error": f"no JSON: {e}"[:200], "verdict": "none", "correct": 0}
    reply = j.get("result") or ""
    vm = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in ws.glob("docs/keystone/*/verify.md"))
    v, ok = judge(TASKS[tid], reply, vm)
    out = sum((m or {}).get("outputTokens") or 0 for m in (j.get("modelUsage") or {}).values()) or None
    return {**row, "verdict": v, "correct": int(ok), "wrote_verify_md": bool(vm), "out": out,
            "cost": j.get("total_cost_usd"), "time_s": (j.get("duration_ms") or 0) / 1000 or None,
            "turns": j.get("num_turns"), "is_error": bool(j.get("is_error")),
            "error": reply[:200] if j.get("is_error") else None}

# ---------------------------------------------------------------- stats
def geomean(xs):
    return math.exp(statistics.mean(math.log(x) for x in xs))

def _median(cells, m):
    v = [c[m] for c in cells if c.get(m) and not c.get("error")]   # a crashed cell is wrong, not cheap
    return statistics.median(v) if v else None

def arm_summary(by, arms, tasks, metric, ref="baseline"):
    """correct: share over all cells. cost/time_s/turns/out: geomean over tasks of median(arm)/median(ref)."""
    out = {}
    for a in arms:
        if metric == "correct":
            cells = [c for t in tasks for c in by[(t, a)]]
            out[a] = sum(c["correct"] for c in cells) / len(cells) if cells else None
        elif a != ref:
            r = [_median(by[(t, a)], metric) / _median(by[(t, ref)], metric) for t in tasks
                 if _median(by[(t, a)], metric) and _median(by[(t, ref)], metric)]
            out[a] = geomean(r) if len(r) == len(tasks) else None
    return out

def bootstrap(by, arms, tasks, metric, n=10_000, seed=20261016, ref="baseline"):
    """95% interval: resample each (task, arm)'s cells with replacement, tasks fixed -- the run-to-run noise
    the repeats measure. With few tasks it says nothing about tasks that were not in the suite."""
    rnd, draws = random.Random(seed), defaultdict(list)
    for _ in range(n):
        rb = {k: rnd.choices(v, k=len(v)) for k, v in by.items() if v}
        for a, x in arm_summary(defaultdict(list, rb), arms, tasks, metric, ref).items():
            if x is not None: draws[a].append(x)
    return {a: (sorted(d)[int(0.025 * len(d))], sorted(d)[int(0.975 * len(d)) - 1]) for a, d in draws.items() if d}

def report(results, ref="baseline"):
    by = defaultdict(list)
    for c in results: by[(c["task"], c["arm"])].append(c)
    tasks = sorted({t for t, _ in by})
    arms = [a for a in ARMS if any(by[(t, a)] for t in tasks)]
    lines = ["| task | expect | arm | n | right | verdicts | cost $ (median) | time s (median) | turns (median) | out (median) |",
             "|---|---|---|--:|--:|---|--:|--:|--:|--:|"]
    for t in tasks:
        for a in arms:
            cs = by[(t, a)]
            if not cs: continue
            vs = ", ".join(f"{k} {n}" for k, n in sorted(_count(c["verdict"] for c in cs).items()))
            f = lambda x, d: "-" if x is None else f"{x:.{d}f}"
            lines.append(f"| {t} | {TASKS[t]['expect']} | {a} | {len(cs)} | {sum(c['correct'] for c in cs)}/{len(cs)} "
                         f"| {vs} | {f(_median(cs, 'cost'), 2)} | {f(_median(cs, 'time_s'), 0)} | {f(_median(cs, 'turns'), 0)} "
                         f"| {f(_median(cs, 'out'), 0)} |")
    lines += ["", f"| arm | right verdicts, all tasks [95% CI] | cost vs {ref} [95% CI] | time vs {ref} [95% CI] "
              f"| turns vs {ref} [95% CI] | out vs {ref} [95% CI] |", "|---|--:|--:|--:|--:|--:|"]
    metrics = ("correct", "cost", "time_s", "turns", "out")
    summ = {m: (arm_summary(by, arms, tasks, m, ref), bootstrap(by, arms, tasks, m, ref=ref)) for m in metrics}
    for a in arms:
        cols = []
        for m in metrics:
            x, ci = summ[m][0].get(a), summ[m][1].get(a)
            if a == ref and m != "correct": cols.append("1.00×"); continue
            if x is None: cols.append("-"); continue
            fmt = (lambda y: f"{y:.0%}") if m == "correct" else (lambda y: f"{y:.2f}×")
            cols.append(f"{fmt(x)} [{fmt(ci[0])}–{fmt(ci[1])}]" if ci else fmt(x))
        lines.append(f"| {a} | " + " | ".join(cols) + " |")
    total = sum(c.get("cost") or 0 for c in results)
    lines += ["", f"cells: {len(results)} · spend: ${total:.2f} · errors: {sum(1 for c in results if c.get('error'))}"]
    return "\n".join(lines)

def _count(xs):
    d = defaultdict(int)
    for x in xs: d[x] += 1
    return d

# ---------------------------------------------------------------- selftest
def _unittest_passes(ws):
    return subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=str(ws), capture_output=True).returncode == 0

def selftest():
    fails = 0
    def ok(cond, what):
        nonlocal fails
        print(f"{'ok ' if cond else 'XX '} {what}")
        fails += 0 if cond else 1
    for tid, t in TASKS.items():
        for kind in ("good", "bad"):
            with tempfile.TemporaryDirectory() as d:
                seed(Path(d), t, kind)
                ok(t["check"](d) is (kind == "good"), f"{tid:12} {kind:4} hidden check {'passes' if kind == 'good' else 'catches the gap'}")
                ok(_unittest_passes(d), f"{tid:12} {kind:4} unittest passes (the gap is invisible to tests)")
                plan_text = (Path(d) / t["plan"]).read_text(encoding="utf-8")
                ok("- [ ]" not in plan_text and "Status: implementing" in plan_text, f"{tid:12} {kind:4} plan claims all done")
                ok(len(_git(d, "log", "--oneline").stdout.splitlines()) == 2, f"{tid:12} {kind:4} two commits: base, impl")
        ok(t["live"] == ("good" if t["expect"] == "PASS" else "bad"), f"{tid:12} live overlay matches expect")
    bad_tests = TASKS["missing-task"]["bad"]["tests/test_textutil.py"]
    ok("truncate" not in bad_tests, "missing-task bad  has no truncate tests")
    with tempfile.TemporaryDirectory() as d:
        seed(Path(d), TASKS["clean"], "good")
        ok(_load(d, "src/textutil.py", "bench_selftest_text").truncate("abcdef", 0) == "",
           "clean        good truncate(s, 0) is empty (no defect left in the clean seed)")
    with tempfile.TemporaryDirectory() as d:
        seed(Path(d), TASKS["weak-test"], "good")
        tp = Path(d) / "tests" / "test_money.py"
        tp.write_text(tp.read_text(encoding="utf-8").replace("self.assertEqual(total([0.1, 0.2]), 0.3)",
                                                             "self.assertTrue(total([0.1, 0.2]))"), encoding="utf-8")
        ok(TASKS["weak-test"]["check"](d) is False, "weak-test    fixed code with a weak test is still caught")
    gap, clean = TASKS["missing-task"], TASKS["clean"]
    weak = TASKS["weak-test"]
    ok(judge(weak, "Code looks fine all around.\nVERDICT: FAIL", "") == ("FAIL", False),
       "judge  weak-test: 'around' does not name the gap")
    ok(judge(weak, "test_total_rounds only asserts not None.\nVERDICT: FAIL", "") == ("FAIL", True),
       "judge  weak-test: the weakened test named -> right")
    ok(judge(gap, "truncate() is missing.\nVERDICT: FAIL", "") == ("FAIL", True), "judge  FAIL + named gap -> right")
    ok(judge(gap, "Tests are thin.\nVERDICT: FAIL", "") == ("FAIL", False), "judge  FAIL without the gap -> wrong reason")
    ok(judge(gap, "VERDICT: PASS-UNPROVEN", "") == ("PASS-UNPROVEN", False), "judge  PASS-UNPROVEN on a gap -> missed")
    ok(judge(gap, "all good", "") == ("none", False), "judge  no verdict line -> wrong")
    ok(judge(gap, "see verify.md", "Verdict: FAIL\n- task 2 missing: truncate") == ("FAIL", True), "judge  verify.md fallback")
    ok(judge(gap, "VERDICT: PASS\n...\nVERDICT: FAIL truncate", "") == ("FAIL", True), "judge  last VERDICT line wins")
    ok(judge(clean, "VERDICT: PASS", "") == ("PASS", True), "judge  clean PASS -> right")
    ok(judge(clean, "VERDICT: PASS-UNPROVEN", "") == ("PASS-UNPROVEN", True), "judge  clean PASS-UNPROVEN -> right")
    ok(judge(clean, "VERDICT: FAIL", "") == ("FAIL", False), "judge  clean FAIL -> false alarm")
    with tempfile.TemporaryDirectory() as d:
        ok(score("clean", "baseline", "m", d)["correct"] == 0, "score  crashed cell (no JSON) counts as wrong")
    by = defaultdict(list, {("t1", "baseline"): [{"cost": 2, "correct": 1}], ("t1", "keystone"): [{"cost": 4, "correct": 0}],
                            ("t2", "baseline"): [{"cost": 4, "correct": 1}], ("t2", "keystone"): [{"cost": 2, "correct": 1}]})
    ok(abs(arm_summary(by, ["baseline", "keystone"], ["t1", "t2"], "cost")["keystone"] - 1.0) < 1e-9,
       "stats  geomean of ratios 2.0 and 0.5 is 1.0")
    ok(arm_summary(by, ["baseline", "keystone"], ["t1", "t2"], "correct") == {"baseline": 1.0, "keystone": 0.5},
       "stats  right share over all cells")
    lo, hi = bootstrap(by, ["baseline", "keystone"], ["t1", "t2"], "cost", n=200)["keystone"]
    ok(abs(lo - 1.0) < 1e-9 and abs(hi - 1.0) < 1e-9, "stats  bootstrap of one cell per group is a point")
    noisy = defaultdict(list, {("t", "baseline"): [{"correct": 1}, {"correct": 0}] * 5})
    lo, hi = bootstrap(noisy, ["baseline"], ["t"], "correct", n=2000)["baseline"]
    ok(lo < 0.5 < hi, "stats  bootstrap interval brackets 50% for 5/10")
    p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=(os.name != "nt"))
    _tree_kill(p)
    try: ok(p.wait(timeout=10) is not None, "kill   tree-kill ends a timed-out cell")
    except subprocess.TimeoutExpired: p.kill(); ok(False, "kill   tree-kill ends a timed-out cell")
    ok((ROOT / ".claude-plugin" / "plugin.json").exists(), "arms   --plugin-dir points at a Keystone checkout")
    with tempfile.TemporaryDirectory() as d:
        meta = {"date": "x", "model": "m", "claude": "c", "keystone": "k"}
        (Path(d) / "results.json").write_text(json.dumps({**meta, "results": []}), encoding="utf-8")
        (Path(d) / "clean__baseline__m__0").mkdir()                      # one crashed cell is enough
        with contextlib.redirect_stdout(io.StringIO()): rescore(d)
        kept = json.loads((Path(d) / "results.json").read_text(encoding="utf-8"))
        ok(all(kept.get(k) == v for k, v in meta.items()) and kept.get("rescored") and (Path(d) / "table.md").exists(),
           "rescore keeps the run's model/claude/keystone record and rewrites table.md")
    with tempfile.TemporaryDirectory() as d:
        seed(Path(d) / "a", TASKS["clean"], "good")
        move(Path(d) / "a", Path(d) / "b")
        ok((Path(d) / "b" / ".git").is_dir() and not (Path(d) / "a").exists(), "move   a cell with a read-only .git moves out")
    ok(not plugin_dir_ok(None) and not plugin_dir_ok(str(ROOT / "nowhere")) and plugin_dir_ok(str(ROOT)),
       "arms   keystone-base needs a real Keystone checkout")
    ok(arm_summary(by, ["baseline", "keystone"], ["t1", "t2"], "cost", ref="keystone")["baseline"] == 1.0,
       "stats  --ref keystone: baseline/keystone ratios 0.5 and 2.0 give 1.0")
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "_claude.json").write_text(json.dumps({"result": "VERDICT: PASS", "total_cost_usd": 1,
            "modelUsage": {"claude-opus-5-5": {"outputTokens": 300}, "claude-sonnet-5-5": {"outputTokens": 200}}}), encoding="utf-8")
        ok(score("clean", "keystone", "m", d)["out"] == 500, "score  out sums output tokens over every model")
    print(f"\nselftest: {'all instruments valid' if not fails else f'{fails} BROKEN'}")
    return fails

# ---------------------------------------------------------------- main
def _claude_version():
    try: return subprocess.run([shutil.which("claude") or "claude", "--version"], capture_output=True, text=True).stdout.strip()
    except Exception: return "unknown"

def warm_up(model):
    """One throwaway call before the pool: returns the error text, or None when the CLI answers."""
    with tempfile.TemporaryDirectory() as d:
        r = subprocess.run([shutil.which("claude") or "claude", "-p", "Reply with: ok", "--model", MODELS.get(model, model),
                            "--output-format", "json", "--setting-sources", "project,local", "--strict-mcp-config"],
                           cwd=d, capture_output=True, text=True, encoding="utf-8", env={**os.environ, **ENV}, timeout=300)
    try: j = json.loads(r.stdout)
    except Exception: return (r.stderr or r.stdout or "no output")[:300]
    return (j.get("result") or "error")[:300] if j.get("is_error") else None

def rescore(d, ref="baseline"):
    d = Path(d) if Path(d).exists() else RUNS_DIR / Path(d).name
    results = [score(*ws.name.split("__")[:3], ws) for ws in sorted(d.iterdir())
               if ws.is_dir() and len(ws.name.split("__")) == 4 and ws.name.split("__")[0] in TASKS]
    try: old = json.loads((d / "results.json").read_text(encoding="utf-8"))
    except Exception: old = {}
    meta = {k: v for k, v in old.items() if k not in ("results", "rescored")}   # keep the run's model/claude/keystone
    (d / "results.json").write_text(json.dumps({**meta, "rescored": True, "results": results}, indent=2), encoding="utf-8")
    table = report(results, ref)
    (d / "table.md").write_text(f"{json.dumps(meta)}\n\n{table}\n", encoding="utf-8")
    print(table)

def main():
    sys.stdout.reconfigure(encoding="utf-8")         # the table has × and –; a cp1251 console would crash on them
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rescore")
    ap.add_argument("--task", help="comma list or 'all'")
    ap.add_argument("--arms", default=DEFAULT_ARMS)
    ap.add_argument("--base-plugin-dir", help="Keystone checkout for the keystone-base arm")
    ap.add_argument("--ref", default="baseline", help="arm the ratios are taken against")
    ap.add_argument("--model", default="opus")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    global BASE_PLUGIN_DIR
    BASE_PLUGIN_DIR = a.base_plugin_dir
    if a.selftest: sys.exit(1 if selftest() else 0)
    if a.rescore: return rescore(a.rescore, a.ref)
    tids = list(TASKS) if a.task == "all" else [t.strip() for t in (a.task or "").split(",") if t.strip()]
    arms = [x.strip() for x in a.arms.split(",")]
    if not tids or any(t not in TASKS for t in tids) or any(x not in ARMS for x in arms):
        sys.exit(f"--task from {list(TASKS)} or all; --arms from {list(ARMS)}")
    if "keystone-base" in arms and not plugin_dir_ok(BASE_PLUGIN_DIR):
        sys.exit(f"keystone-base needs --base-plugin-dir <a Keystone checkout>, got {BASE_PLUGIN_DIR!r}")
    if a.dry_run:
        for t in tids:
            for arm in arms: print(t, arm, TASKS[t]["plan"], "\n  ", " ".join(build_cmd(TASKS[t], arm, a.model)))
        return
    if selftest(): sys.exit("instruments broken; refusing to spend on the API")
    if not shutil.which("claude"): sys.exit("claude CLI not found on PATH")
    warm = warm_up(a.model)                          # also warms the prompt cache, as in Ponytail
    if warm: sys.exit(f"claude -p does not work here, nothing spent on cells: {warm}")

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = RUNS_DIR / stamp
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix=f"keystone-bench-{stamp}-"))   # outside any git checkout
    cells = [(t, arm, a.model, r) for t in tids for arm in arms for r in range(a.runs)]
    meta = {"date": stamp, "model": MODELS.get(a.model, a.model), "claude": _claude_version(),
            "keystone": json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"],
            "keystone-base": json.loads((Path(BASE_PLUGIN_DIR) / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"]
                             if plugin_dir_ok(BASE_PLUGIN_DIR) else None}
    results = []

    def one(spec):
        t, arm, m, r = spec
        ws = scratch / f"{t}__{arm}__{m}__{r}"
        ws.mkdir()
        try: return run_cell(t, arm, m, ws)
        finally: move(ws, out / ws.name)

    print(f"running {len(cells)} cells, {a.workers} at a time -> {out}", flush=True)
    # To stop a run, kill the tree (taskkill /PID <pid> /T /F): killing only python orphans the claude children.
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(one, s): s for s in cells}
        for i, fut in enumerate(concurrent.futures.as_completed(futs), 1):
            t, arm, m, r = futs[fut]
            try: res = fut.result()
            except Exception as e: res = {"task": t, "arm": arm, "model": m, "error": str(e)[:200], "verdict": "none", "correct": 0}
            results.append(res)
            print(f"  [{i}/{len(cells)}] {t} / {arm} / {m} #{r} verdict={res.get('verdict')} correct={res.get('correct')} "
                  f"cost=${res.get('cost')} time={res.get('time_s')}s turns={res.get('turns')} out={res.get('out')}", flush=True)
            (out / "results.json").write_text(json.dumps({**meta, "results": results}, indent=2), encoding="utf-8")
    shutil.rmtree(scratch, ignore_errors=True)
    table = report(results)
    (out / "table.md").write_text(f"{json.dumps(meta)}\n\n{table}\n", encoding="utf-8")
    print("\n" + table + f"\n\nwrote {out}")

if __name__ == "__main__":
    main()

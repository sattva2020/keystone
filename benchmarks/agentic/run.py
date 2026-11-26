#!/usr/bin/env python3
"""Agentic A/B benchmark for /keystone:verify, after Ponytail's benchmarks/agentic.

Each cell is a real headless `claude -p` session in a fresh temp repo outside any git checkout. The repo carries a
Keystone plan whose boxes are all checked; three tasks hide a gap the tests do not catch, `clean` hides none. A cell
is right when it says FAIL and names the gap (or PASS / PASS-UNPROVEN on `clean`).

  python run.py --selftest                       prove the instruments, no API -- run first
  python run.py --dry-run --task missing-task    print the seeded path and the command, no API
  python run.py --task all --arms baseline,control,keystone --runs 5 --model opus
  python run.py --rescore runs/<stamp>           recompute the table from kept workspaces, no API
  python run.py --chain --task all --arms chain,rush --runs 2   the whole chain after Approve: chain vs rush (README)

ponytail: the claude CLI is the harness, stdlib only; stats live here, not in a compare.py, until a second plugin
candidate needs a paired comparison.
"""
import argparse, concurrent.futures, contextlib, datetime, io, json, math, os, random, re, shutil, signal, stat, statistics, subprocess, sys, tempfile, time
from collections import defaultdict
from pathlib import Path

from tasks import CHAIN_TASKS, TASKS, _load, chain_seed, with_pace

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]                      # the Keystone plugin under test: this checkout, not the installed cache
RUNS_DIR = HERE / "runs"
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5"}
CELL_TIMEOUT = 900                          # seconds; keystone runs a verifier subagent
BUDGET_USD = "5"                            # per-cell ceiling, passed to --max-budget-usd
ENV = {"CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1", "KEYSTONE_FEEDBACK": "off"}

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
    chain_selftest(ok)
    print(f"\nselftest: {'all instruments valid' if not fails else f'{fails} BROKEN'}")
    return fails

# ---------------------------------------------------------------- chain mode (--chain): Approve → verdict, chain vs rush
# chain: separate `claude -p` processes — implement, verify, then up to two (fix verify, verify) pairs until PASS /
# PASS-UNPROVEN. rush: one `claude -p "/keystone:implement <plan>"` on a plan with `Pace: rush`. No --max-budget-usd
# (rush has no spending ceiling, I-18) and no VERDICT_ASK (the chain changes code).
CHAIN_ARMS = ("chain", "rush")
CHAIN_TIMEOUT = 3600                        # seconds per process of the chain arm; one rush process gets the whole arm's
CHAIN_FIX_PAIRS = 2
PASSED = ("PASS", "PASS-UNPROVEN")
EXCLUDE = "_claude*\n_feedback/\n"           # bench files never show up as untracked files in collect.mjs

def chain_tids(arg):
    return list(CHAIN_TASKS) if arg == "all" else [t.strip() for t in (arg or "").split(",") if t.strip()]

def chain_timeout(arm):
    return CHAIN_TIMEOUT * (2 + 2 * CHAIN_FIX_PAIRS if arm == "rush" else 1)   # rush: 6 x, as long as the chain arm

def chain_env(ws, feedback="off"):
    # `claude -p` stops background subagents 10 min after the last turn: a stage or a verifier longer than that is killed
    e = {**ENV, "KEYSTONE_FEEDBACK": feedback, "CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS": "0"}
    if feedback == "on": e["KEYSTONE_FEEDBACK_DIR"] = str(Path(ws) / "_feedback")
    return e

def chain_cmd(prompt, model, fast=False):
    cmd = [shutil.which("claude") or "claude", "-p", prompt, "--model", MODELS.get(model, model),
           "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose",
           "--setting-sources", "project,local", "--strict-mcp-config", "--plugin-dir", str(ROOT)]
    return cmd + (["--settings", json.dumps({"fastMode": True})] if fast else [])

def build_chain_cmds(plan, arm, model, fast=False):
    """The first commands of a cell; the chain arm adds fix_pair() rounds in run_chain while there is no pass."""
    prompts = [f"/keystone:implement {plan}"] + ([f"/keystone:verify {plan}"] if arm == "chain" else [])
    return [chain_cmd(p, model, fast) for p in prompts]

def fix_pair(plan, model, fast=False):
    return [chain_cmd("/keystone:fix verify", model, fast), chain_cmd(f"/keystone:verify {plan}", model, fast)]

def _exclude(ws):
    p = Path(ws) / ".git" / "info" / "exclude"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8", newline="\n") as f: f.write("\n" + EXCLUDE)

def _commit(ws, msg):
    _git(ws, "add", "-A"); _git(ws, "commit", "-q", "--no-verify", "-m", msg)

def seed_chain(ws, task, rush):
    _write(ws, chain_seed(task, rush))
    _git(ws, "init", "-q", "-b", "main")
    _exclude(ws)
    _commit(ws, "base: plan approved")

def _ceiling_verify(base, plan, i):
    return (f"# Verify: x\nDate: 2026-11-0{i} · Base: {base} · Verdict: FAIL\n\n## Checks\n- base: {base}\n\n## Carried\n\n"
            f"## Report\nKeystone verify: {plan} · base {base}\n- Task 2 — missing — truncate not written ({i}). Repro: "
            f"`grep truncate src/textutil.py` → nothing\n\n## Verdict\nFAIL\n")

def seed_ceiling(ws):
    """missing-task with its gap, `Pace: rush` in the approval commit and in the overlay, three judged FAIL runs."""
    t = TASKS["missing-task"]
    seed_chain(ws, t, True)
    base = _git(ws, "rev-parse", "--short=7", "HEAD").stdout.strip()
    _write(ws, {**t["bad"], t["plan"]: with_pace(t["bad"][t["plan"]])})
    _commit(ws, "impl: all plan tasks done")
    vpath = f"{Path(t['plan']).parent.as_posix()}/verify.md"
    for i in (1, 2, 3):
        _write(ws, {vpath: _ceiling_verify(base, t["plan"], i)})
        _commit(ws, f"docs(verify): text-helpers — FAIL {i}")
    return t["plan"]

def strip_release(text):
    return re.sub(r"(?ms)^## Release\n.*?(?=^## |\Z)", "", text)

def seed_replay(ws, spec, rush):
    """`<repo>@<sha>:<plan>`: a clone at <sha>^ with the plan folder of <sha>, no `## Release`, no origin."""
    repo, rest = spec.rsplit("@", 1)
    sha, plan = rest.split(":", 1)
    r = subprocess.run(["git", "clone", "-q", "--no-hardlinks", repo, str(ws)], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(f"clone {repo}: {r.stderr.strip()[:200]}")
    _git(ws, "checkout", "-q", f"{sha}^")
    _git(ws, "checkout", sha, "--", Path(plan).parent.as_posix())
    p = Path(ws) / plan
    text = strip_release(p.read_text(encoding="utf-8"))
    p.write_text(with_pace(text) if rush else text, encoding="utf-8", newline="\n")
    _git(ws, "remote", "remove", "origin")
    _exclude(ws)
    _commit(ws, "docs(plan): approved")
    return plan

def last_result(path):
    """The last `result` event of a stream-json file, or None."""
    res = None
    try: text = Path(path).read_text(encoding="utf-8", errors="ignore")
    except OSError: return None
    for line in text.splitlines():
        try: ev = json.loads(line)
        except ValueError: continue
        if isinstance(ev, dict) and ev.get("type") == "result": res = ev
    return res

def transcript_tokens(ws, config=None):
    """(all tokens, output tokens) of the cell's sessions and their subagents, from <config>/projects/<cwd as dashes>/.
    A cross-check of `total_cost_usd`: on a rush cell their output tokens sum to the result's `modelUsage` (subagents in)."""
    config = Path(config or os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    d = config / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(Path(ws).resolve()))
    seen, total, out = set(), 0, 0
    for p in [*d.glob("*.jsonl"), *d.glob("*/subagents/*.jsonl")]:
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            try: row = json.loads(line)
            except ValueError: continue
            m = row.get("message") if isinstance(row, dict) and row.get("type") == "assistant" else None
            u = (m or {}).get("usage")
            if not u or (p, m.get("id")) in seen: continue
            seen.add((p, m.get("id")))
            out += u.get("output_tokens") or 0
            total += sum(u.get(k) or 0 for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return total or None, out or None

def verdict_at(ws, plan):
    p = Path(ws) / Path(plan).parent / "verify.md"
    m = VERIFY_MD_RE.findall(p.read_text(encoding="utf-8", errors="ignore")) if p.exists() else []
    return m[-1] if m else "none"

def run_chain(cell, ws, opts):
    tid, arm, model, _ = cell
    if tid == "ceiling": plan = seed_ceiling(ws)
    elif tid == "replay": plan = seed_replay(ws, opts.replay, arm == "rush")
    else: seed_chain(ws, TASKS[tid], arm == "rush"); plan = TASKS[tid]["plan"]
    head0 = _git(ws, "rev-parse", "HEAD").stdout.strip()
    env, limit, steps, killed = chain_env(ws, opts.feedback), chain_timeout(arm), 0, False
    def go(cmd):
        nonlocal steps, killed
        with open(ws / f"_claude_{steps}.jsonl", "wb") as so, open(ws / f"_claude_{steps}.stderr.txt", "wb") as se:
            proc = subprocess.Popen(cmd, cwd=str(ws), stdout=so, stderr=se, env={**os.environ, **env},
                                    start_new_session=(os.name != "nt"))
            try: proc.wait(timeout=limit)
            except subprocess.TimeoutExpired:
                _tree_kill(proc); killed = True
                se.write(f"\n[KILLED after {limit}s]".encode())
        steps += 1
    t0 = time.monotonic()
    for c in build_chain_cmds(plan, arm, model, opts.fast): go(c)
    if arm == "chain":
        for _ in range(CHAIN_FIX_PAIRS):
            if verdict_at(ws, plan) in PASSED: break
            for c in fix_pair(plan, model, opts.fast): go(c)
    return score_chain(cell, ws, plan, head0, time.monotonic() - t0, steps, killed, opts)

def score_chain(cell, ws, plan, head0, time_s, steps, killed, opts):
    tid, arm, model, _ = cell
    results = [last_result(ws / f"_claude_{i}.jsonl") for i in range(steps)]
    vpath = f"{Path(plan).parent.as_posix()}/verify.md"
    v = verdict_at(ws, plan)
    if tid == "ceiling": ok = _git(ws, "rev-parse", "HEAD").stdout.strip() == head0      # stopped: nothing committed
    elif tid == "replay": ok = v in PASSED and subprocess.run(opts.replay_check, shell=True, cwd=str(ws), capture_output=True).returncode == 0
    else: ok = v in PASSED and TASKS[tid]["check"](ws)
    tokens, out = transcript_tokens(ws)
    return {"task": tid, "arm": arm, "model": model, "cell": ws.name, "verdict": v, "correct": int(bool(ok)),
            "time_s": round(time_s, 1), "cost": sum((r or {}).get("total_cost_usd") or 0 for r in results) or None,
            "tokens": tokens, "out": out,
            "verify_runs": len(_git(ws, "log", "--format=%H", "--", vpath).stdout.split()), "steps": steps,
            "killed": killed, "is_error": any((r or {}).get("is_error") for r in results), "error": None}

def report_chain(results):
    by = defaultdict(list)
    for c in results: by[(c["task"], c["arm"])].append(c)
    f = lambda x, d: "-" if x is None else f"{x:.{d}f}"
    lines = ["| task | arm | n | correct | verdicts | time s (median) | cost $ (median) "
             "| tokens (median) | out tokens (median) | verify runs | killed | rush/chain time |",
             "|---|---|--:|--:|---|--:|--:|--:|--:|---|--:|--:|"]
    for t in sorted({t for t, _ in by}):
        for a in CHAIN_ARMS:
            cs = by[(t, a)]
            if not cs: continue
            vs = ", ".join(f"{k} {n}" for k, n in sorted(_count(c["verdict"] for c in cs).items()))
            rt, ct = _median(cs, "time_s"), _median(by[(t, "chain")], "time_s")
            ratio = f(rt / ct, 2) + "×" if a == "rush" and rt and ct else "-"
            lines.append(f"| {t} | {a} | {len(cs)} | {sum(c['correct'] for c in cs)}/{len(cs)} | {vs} | {f(rt, 0)} "
                         f"| {f(_median(cs, 'cost'), 2)} | {f(_median(cs, 'tokens'), 0)} | {f(_median(cs, 'out'), 0)} "
                         f"| {', '.join(str(c['verify_runs']) for c in cs)} "
                         f"| {sum(1 for c in cs if c.get('killed'))} | {ratio} |")
    miss = [f"I-22 не выполнено: {c['verify_runs']} прогонов ({c['task']} · {c['cell']})" for c in results
            if c["arm"] == "rush" and c["task"] != "ceiling" and c["verdict"] in PASSED and c["verify_runs"] > 2]
    total = sum(c.get("cost") or 0 for c in results)
    return "\n".join(lines + [""] + miss + [f"cells: {len(results)} · spend: ${total:.2f} · killed: "
                                            f"{sum(1 for c in results if c.get('killed'))} · errors: {sum(1 for c in results if c.get('is_error'))}"])

def chain_selftest(ok):
    for tid in CHAIN_TASKS:
        t = TASKS[tid]
        for rush in (False, True):
            p = chain_seed(t, rush)[t["plan"]]
            ok("Status: approved" in p and "- [x]" not in p and ("Pace: rush" in p) is rush,
               f"chain  {tid:12} {'rush' if rush else 'chain'}: approved, empty boxes, Pace only in rush")
    ok(chain_tids("all") == ["missing-task", "weak-test", "rule-break"], "chain  --task all = the three chain tasks")
    cmds = build_chain_cmds("p/plan.md", "chain", "opus")
    flat = [x for c in cmds + fix_pair("p/plan.md", "opus") for x in c]
    ok([c[2] for c in cmds] == ["/keystone:implement p/plan.md", "/keystone:verify p/plan.md"]
       and [c[2] for c in build_chain_cmds("p/plan.md", "rush", "opus")] == ["/keystone:implement p/plan.md"]
       and [c[2] for c in fix_pair("p/plan.md", "opus")] == ["/keystone:fix verify", "/keystone:verify p/plan.md"],
       "chain  commands: chain = implement, verify (+ fix pairs); rush = implement")
    ok(VERDICT_ASK not in flat and "--max-budget-usd" not in flat and "stream-json" in flat and "--settings" not in flat,
       "chain  no VERDICT_ASK, no --max-budget-usd, stream-json")
    fc = build_chain_cmds("p/plan.md", "rush", "opus", fast=True)[0]
    ok(fc[fc.index("--settings") + 1] == '{"fastMode": true}', "chain  --fast adds --settings {\"fastMode\": true}")
    with tempfile.TemporaryDirectory() as d:
        e = chain_env(d, "on")
        ok(e["KEYSTONE_FEEDBACK"] == "on" and Path(e["KEYSTONE_FEEDBACK_DIR"]).parent == Path(d)
           and chain_env(d)["KEYSTONE_FEEDBACK"] == "off" and "KEYSTONE_FEEDBACK_DIR" not in chain_env(d)
           and chain_env(d)["CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS"] == "0",
           "chain  --feedback on: KEYSTONE_FEEDBACK=on, KEYSTONE_FEEDBACK_DIR inside the cell; off by default")
    ok(chain_timeout("rush") == 6 * CHAIN_TIMEOUT and chain_timeout("chain") == CHAIN_TIMEOUT, "chain  rush timeout = 6 x CHAIN_TIMEOUT")
    with tempfile.TemporaryDirectory() as d:
        seed_chain(Path(d), TASKS["missing-task"], True)
        for f in ("_claude.json", "_claude.stderr.txt", "_claude_0.jsonl", "_feedback/x"):
            (Path(d) / f).parent.mkdir(parents=True, exist_ok=True); (Path(d) / f).write_text("x", encoding="utf-8")
        ok(_git(d, "status", "--porcelain").stdout.strip() == "", "chain  bench files are excluded: git status is empty")
    node = shutil.which("node")
    with tempfile.TemporaryDirectory() as d:
        plan = seed_ceiling(Path(d))
        pace = subprocess.run([node, str(ROOT / "skills/implement/scripts/rush.mjs"), "pace", plan], cwd=d, capture_output=True, text=True).stdout
        hist = subprocess.run([node, str(ROOT / "skills/verify/scripts/collect.mjs"), plan, "--history"], cwd=d, capture_output=True, text=True).stdout
        ok(pace.strip() == "pace: rush" and "ceiling: reached" in hist, "chain  fixture ceiling: pace: rush, ceiling: reached")
    with tempfile.TemporaryDirectory() as d:
        src, ws = Path(d) / "src", Path(d) / "ws"
        rel = "docs/keystone/2026-01-01-r/plan.md"
        _write(src, {"a.txt": "a"}); _git(src, "init", "-q", "-b", "main"); _commit(src, "start")
        _write(src, {rel: "# Plan: r\n\nLevel: M · Mode: feature · Status: approved\nDone means: x\n\n## Tasks\n- [ ] 1. a\n\n"
                          "## Release\n- [ ] R1. echo release — check: true\n\n## Implementation notes\n"})
        _commit(src, "docs(plan): approved")
        sha = _git(src, "rev-parse", "HEAD").stdout.strip()
        ws.mkdir(); plan = seed_replay(ws, f"{src.as_posix()}@{sha}:{rel}", True)
        text = (ws / plan).read_text(encoding="utf-8")
        ok(not re.search(r"(?m)^- \[ \] R\d", text) and "## Release" not in text and "## Implementation notes" in text
           and "Pace: rush" in text and not _git(ws, "remote").stdout.strip(),
           "chain  --replay: plan without R<n> lines, Pace: rush, no origin")
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "s.jsonl"
        p.write_text("\n".join(json.dumps(x) for x in [{"type": "result", "total_cost_usd": 1}, {"type": "assistant"},
                                                        {"type": "result", "total_cost_usd": 2.5}]) + "\nnot json\n", encoding="utf-8")
        ok(last_result(p)["total_cost_usd"] == 2.5, "chain  stream-json: the last result event wins")
    with tempfile.TemporaryDirectory() as cfg, tempfile.TemporaryDirectory() as ws:
        d = Path(cfg) / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(Path(ws).resolve()))
        (d / "s1" / "subagents").mkdir(parents=True)
        a = lambda i, o: json.dumps({"type": "assistant", "message": {"id": i, "usage": {"input_tokens": 1, "output_tokens": o, "cache_read_input_tokens": 10}}})
        (d / "s1.jsonl").write_text("\n".join([a("m1", 5), a("m1", 5), a("m2", 7)]), encoding="utf-8")   # one message, two rows
        (d / "s1" / "subagents" / "agent-x.jsonl").write_text(a("m9", 100), encoding="utf-8")
        ok(transcript_tokens(ws, cfg) == (16 + 18 + 111, 112), "chain  tokens: main session + subagents, a message counted once")
    rows = [{"task": "missing-task", "arm": "rush", "cell": "c", "verdict": "PASS", "verify_runs": 3, "correct": 1, "time_s": 10},
            {"task": "missing-task", "arm": "chain", "cell": "d", "verdict": "PASS", "verify_runs": 2, "correct": 1, "time_s": 20}]
    tbl = report_chain(rows)
    ok("I-22 не выполнено: 3 прогонов" in tbl and "0.50×" in tbl and "cells: 2" in tbl, "chain  report: ratio and the I-22 line")

def chain_main(a):
    arms = ["chain", "rush"] if a.arms == DEFAULT_ARMS else [x.strip() for x in a.arms.split(",")]
    if any(x not in CHAIN_ARMS for x in arms): sys.exit(f"--chain --arms from {list(CHAIN_ARMS)}")
    if a.fixture:
        if a.fixture != "ceiling" or arms != ["rush"]: sys.exit("--fixture ceiling goes with --chain --arms rush")
        tids = ["ceiling"]
    elif a.replay:
        if not a.replay_check: sys.exit("--replay needs --replay-check \"<command>\"")
        tids = ["replay"]
    else:
        tids = chain_tids(a.task)
        if not tids or any(t not in CHAIN_TASKS for t in tids): sys.exit(f"--chain --task from {list(CHAIN_TASKS)} or all")
    plan_of = lambda t: a.replay.rsplit("@", 1)[1].split(":", 1)[1] if t == "replay" else TASKS["missing-task" if t == "ceiling" else t]["plan"]
    if a.dry_run:
        for t in tids:
            for arm in arms:
                print(t, arm, plan_of(t))
                for c in build_chain_cmds(plan_of(t), arm, a.model, a.fast): print("  ", " ".join(c))
                if arm == "chain": print(f"   then up to {CHAIN_FIX_PAIRS} x:", " | ".join(" ".join(c) for c in fix_pair(plan_of(t), a.model, a.fast)))
        return
    if selftest(): sys.exit("instruments broken; refusing to spend on the API")
    if not shutil.which("claude"): sys.exit("claude CLI not found on PATH")
    warm = warm_up(a.model)
    if warm: sys.exit(f"claude -p does not work here, nothing spent on cells: {warm}")
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = RUNS_DIR / f"{stamp}-chain"
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix=f"keystone-chain-{stamp}-"))
    cells = [(t, arm, a.model, r) for t in tids for arm in arms for r in range(a.runs)]
    meta = {"date": stamp, "mode": "chain", "model": MODELS.get(a.model, a.model), "claude": _claude_version(), "fast": a.fast,
            "feedback": a.feedback, "replay": a.replay,
            "keystone": json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"]}
    results = []
    def one(spec):
        ws = scratch / "__".join(map(str, spec))
        ws.mkdir()
        try: return run_chain(spec, ws, a)
        finally: move(ws, out / ws.name)
    print(f"running {len(cells)} chain cells, {a.workers} at a time -> {out}", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(one, s): s for s in cells}
        for i, fut in enumerate(concurrent.futures.as_completed(futs), 1):
            t, arm, m, r = futs[fut]
            try: res = fut.result()
            except Exception as e: res = {"task": t, "arm": arm, "model": m, "cell": f"{t}__{arm}__{m}__{r}", "error": str(e)[:200],
                                          "verdict": "none", "correct": 0, "verify_runs": 0, "killed": False, "is_error": True}
            results.append(res)
            print(f"  [{i}/{len(cells)}] {t} / {arm} #{r} verdict={res.get('verdict')} correct={res.get('correct')} "
                  f"time={res.get('time_s')}s cost=${res.get('cost')} verify_runs={res.get('verify_runs')} killed={res.get('killed')}", flush=True)
            (out / "results.json").write_text(json.dumps({**meta, "results": results}, indent=2), encoding="utf-8")
    shutil.rmtree(scratch, ignore_errors=True)
    table = report_chain(results)
    (out / "table.md").write_text(f"{json.dumps(meta)}\n\n{table}\n", encoding="utf-8")
    print("\n" + table + f"\n\nwrote {out}")

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
    ap.add_argument("--chain", action="store_true", help="the whole chain after Approve: arms chain and rush")
    ap.add_argument("--fixture", help="--chain only: 'ceiling' (three judged FAIL runs already committed)")
    ap.add_argument("--replay", help="--chain only: <repo path>@<sha>:<plan> — a real plan from that repo's history")
    ap.add_argument("--replay-check", help="--replay only: a shell command that must exit 0 in the cell")
    ap.add_argument("--fast", action="store_true", help="--chain only: --settings {\"fastMode\": true}")
    ap.add_argument("--feedback", choices=("on", "off"), default="off", help="--chain only: KEYSTONE_FEEDBACK of the cells")
    a = ap.parse_args()
    global BASE_PLUGIN_DIR
    BASE_PLUGIN_DIR = a.base_plugin_dir
    if a.selftest: sys.exit(1 if selftest() else 0)
    if a.rescore: return rescore(a.rescore, a.ref)
    if a.chain: return chain_main(a)
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

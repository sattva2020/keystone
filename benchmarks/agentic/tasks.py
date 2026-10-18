"""Seeded repositories for the Keystone agentic benchmark.

Every task is a tiny stdlib-Python repo whose plan says "all done" (every box checked). Three hide a gap the test
suite does not catch; `clean` hides none, so an arm that always answers FAIL is caught as a false alarm.

Per task:
  seed   files of the `base` commit (before the work)
  good   files the honest `impl` commit adds on top
  bad    files the `impl` commit adds when the gap is seeded
  live   which overlay the live run seeds ("good" or "bad")
  expect the right verdict for the live repo: FAIL or PASS
  key    regex; on a FAIL the reply (or verify.md) must name this evidence, or the catch is for a wrong reason
  check  ws -> bool, the hidden check: True when the repo really does what the plan says
"""
import importlib.util, re, sys
from pathlib import Path

PLAN_DIR = "docs/keystone/2026-10-15-{slug}"

CLAUDE_MD = """# shop-utils

Stack: Python 3, stdlib only. Tests: `python -m unittest` from the repo root.

## Rules
- MUST: every public function in `src/` has a unittest in `tests/`.
- MUST NOT: call `print()` in `src/`; log through `logging.getLogger(__name__)`.
"""

def plan(title, request, tasks, done):
    """A plan.md in Keystone's format. done=False: approved, empty boxes (base); True: implementing, all checked."""
    status, box = ("implementing", "x") if done else ("approved", " ")
    rows = "\n".join(f"| {t} | request | task {i} |" for i, (t, _) in enumerate(tasks, 1))
    items = "\n".join(f"- [{box}] {i}. {t} — files: {f} — check: `python -m unittest`\n  - Depends on: none"
                      for i, (t, f) in enumerate(tasks, 1))
    return f"""# Plan: {title}

Level: M · Mode: feature · Status: {status}
Settings: tests — yes (`python -m unittest`) · logging — minimal (`logging`, no print) · docs — no
Done means: every task below works as written and `python -m unittest` passes.

## Original Request
{request}

## Requirements Reconciliation
| Decision | Source | Verification evidence |
|---|---|---|
{rows}

Project rules check: read CLAUDE.md — MUST violations: none

## Risks
- Could break: nothing outside `src/`.
- Riskiest step: none.
- Rejected alternatives: none.

## Tasks
{items}
"""

def _load(ws, rel, name):
    spec = importlib.util.spec_from_file_location(name, Path(ws) / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.pop(name, None)
    spec.loader.exec_module(mod)
    return mod

def _safe(fn):
    def wrap(ws):
        try: return bool(fn(ws))
        except Exception: return False
    return wrap

# ---------------------------------------------------------------- text utils: missing-task, clean
TEXT_TASKS = [("Add `slugify(s)`: lowercase; ASCII letters and digits are kept, every run of other characters "
                "(spaces, punctuation, non-ASCII letters) becomes one `-`; no leading/trailing `-`",
               "`src/textutil.py`"),
              ("Add `truncate(s, n)`: `\"\"` when `n <= 0`; `s` when `len(s) <= n`; else the first `n - 1` characters "
               "plus `…`", "`src/textutil.py`"),
              ("Unit tests for `slugify` and `truncate`", "`tests/test_textutil.py`")]
TEXT_REQ = "Add `slugify` and `truncate` helpers to `src/textutil.py`, with tests."

def text_seed(slug):
    return {"CLAUDE.md": CLAUDE_MD, "src/__init__.py": "", "tests/__init__.py": "",
            "src/textutil.py": '"""Text helpers."""\n',
            f"{PLAN_DIR.format(slug=slug)}/plan.md": plan("text helpers", TEXT_REQ, TEXT_TASKS, False)}

SLUGIFY = '''import re


def slugify(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
'''
TRUNCATE = '''

def truncate(s, n):
    if n <= 0:
        return ""
    return s if len(s) <= n else s[: n - 1] + "…"
'''
TEST_SLUG = '''import unittest

from src.textutil import slugify{extra_import}


class TextUtilTest(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(slugify("  Hello, World! "), "hello-world")
        self.assertEqual(slugify("\u212a-caf\u00e9 2"), "caf-2")  # non-ASCII letters become -
'''
TEST_TRUNC = '''
    def test_truncate(self):
        self.assertEqual(truncate("abcdef", 3), "ab…")
        self.assertEqual(truncate("ab", 3), "ab")
        self.assertEqual(truncate("abcdef", 0), "")
'''

def text_impl(slug, honest):
    p = f"{PLAN_DIR.format(slug=slug)}/plan.md"
    if honest:
        return {"src/textutil.py": '"""Text helpers."""\n' + SLUGIFY + TRUNCATE,
                "tests/test_textutil.py": TEST_SLUG.format(extra_import=", truncate") + TEST_TRUNC,
                p: plan("text helpers", TEXT_REQ, TEXT_TASKS, True)}
    return {"src/textutil.py": '"""Text helpers."""\n' + SLUGIFY,             # truncate never written
            "tests/test_textutil.py": TEST_SLUG.format(extra_import=""),
            p: plan("text helpers", TEXT_REQ, TEXT_TASKS, True)}             # ...but its box is checked

@_safe
def check_text(ws):
    m = _load(ws, "src/textutil.py", "bench_textutil")
    return (m.truncate("abcdef", 3) == "ab…" and m.truncate("ab", 3) == "ab" and m.truncate("abcdef", 0) == ""
            and m.slugify(" A b!") == "a-b" and m.slugify("K-café 2") == "caf-2")

# ---------------------------------------------------------------- money: weak-test
MONEY_TASKS = [("Fix `total(xs)`: round the sum to cents, so `total([0.1, 0.2]) == 0.3`", "`src/money.py`"),
               ("Regression test `test_total_rounds`: `total([0.1, 0.2])` equals `0.3`", "`tests/test_money.py`")]
MONEY_REQ = "`total([0.1, 0.2])` returns 0.30000000000000004 on invoices. Round to cents and add a regression test."
MONEY_BUGGY = '"""Money helpers."""\n\n\ndef total(xs):\n    return sum(xs)\n'
TEST_MONEY = '''import unittest

from src.money import total


class MoneyTest(unittest.TestCase):
    def test_total_sums(self):
        self.assertEqual(total([1, 2]), 3)
'''

def money_seed(slug):
    return {"CLAUDE.md": CLAUDE_MD, "src/__init__.py": "", "tests/__init__.py": "",
            "src/money.py": MONEY_BUGGY, "tests/test_money.py": TEST_MONEY,
            f"{PLAN_DIR.format(slug=slug)}/plan.md": plan("round invoice totals", MONEY_REQ, MONEY_TASKS, False)}

def money_impl(slug, honest):
    p = f"{PLAN_DIR.format(slug=slug)}/plan.md"
    if honest:
        return {"src/money.py": '"""Money helpers."""\n\n\ndef total(xs):\n    return round(sum(xs), 2)\n',
                "tests/test_money.py": TEST_MONEY + "\n    def test_total_rounds(self):\n"
                                       "        self.assertEqual(total([0.1, 0.2]), 0.3)\n",
                p: plan("round invoice totals", MONEY_REQ, MONEY_TASKS, True)}
    return {"src/money.py": MONEY_BUGGY.replace("return sum(xs)", "return sum(xs)  # cents"),  # no fix
            "tests/test_money.py": TEST_MONEY + "\n    def test_total_rounds(self):\n"
                                   "        self.assertIsNotNone(total([0.1, 0.2]))\n",          # weakened
            p: plan("round invoice totals", MONEY_REQ, MONEY_TASKS, True)}

@_safe
def check_money(ws):
    test = (Path(ws) / "tests" / "test_money.py").read_text(encoding="utf-8")
    rounds = re.search(r"def test_total_rounds\(self\):\n(?:[ \t]+\S.*\n?)*", test)   # the regression test's body
    return (_load(ws, "src/money.py", "bench_money").total([0.1, 0.2]) == 0.3
            and bool(rounds) and "assertEqual" in rounds.group(0))

# ---------------------------------------------------------------- report: rule-break
REPORT_TASKS = [("Add `summarize(orders)`: returns `{\"count\": n, \"total\": sum of order[\"amount\"]}`; "
                 "on an empty list it logs a warning `no orders`", "`src/report.py`"),
                ("Unit tests for `summarize`, including the empty list", "`tests/test_report.py`")]
REPORT_REQ = "Add an order summary helper for the daily report, with tests."
REPORT_HEAD = '"""Order reports."""\nimport logging\n\nlog = logging.getLogger(__name__)\n'
REPORT_BODY = '''

def summarize(orders):
    if not orders:
        {warn}
    return {{"count": len(orders), "total": sum(o["amount"] for o in orders)}}
'''
TEST_REPORT = '''import unittest

from src.report import summarize


class ReportTest(unittest.TestCase):
    def test_summarize(self):
        self.assertEqual(summarize([{"amount": 2}, {"amount": 3}]), {"count": 2, "total": 5})

    def test_empty(self):
        self.assertEqual(summarize([]), {"count": 0, "total": 0})
'''

def report_seed(slug):
    return {"CLAUDE.md": CLAUDE_MD, "src/__init__.py": "", "tests/__init__.py": "", "src/report.py": REPORT_HEAD,
            f"{PLAN_DIR.format(slug=slug)}/plan.md": plan("order summary", REPORT_REQ, REPORT_TASKS, False)}

def report_impl(slug, honest):
    warn = 'log.warning("no orders")' if honest else 'print("warning: no orders")'   # print() breaks a MUST NOT
    return {"src/report.py": REPORT_HEAD + REPORT_BODY.format(warn=warn), "tests/test_report.py": TEST_REPORT,
            f"{PLAN_DIR.format(slug=slug)}/plan.md": plan("order summary", REPORT_REQ, REPORT_TASKS, True)}

@_safe
def check_report(ws):
    return not any(re.search(r"\bprint\(", p.read_text(encoding="utf-8")) for p in (Path(ws) / "src").rglob("*.py"))

# ----------------------------------------------------------------
def _task(slug, seed, impl, check, live, expect, key):
    return {"plan": f"{PLAN_DIR.format(slug=slug)}/plan.md", "seed": seed(slug), "good": impl(slug, True),
            "bad": impl(slug, False), "live": live, "expect": expect, "key": key, "check": check}

TASKS = {
    "missing-task": _task("text-helpers", text_seed, text_impl, check_text, "bad", "FAIL", r"truncate"),
    "weak-test":    _task("round-totals", money_seed, money_impl, check_money, "bad", "FAIL",
                          r"assertIsNotNone|\btest_total_rounds\b"),
    "rule-break":   _task("order-summary", report_seed, report_impl, check_report, "bad", "FAIL", r"print"),
    "clean":        _task("text-helpers", text_seed, text_impl, check_text, "good", "PASS", None),
}

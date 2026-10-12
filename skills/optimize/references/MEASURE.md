<!-- original Keystone file (MIT) -->

# How to measure

Tool names and flags below are pointers, not facts to copy: check each against the tool's docs (Context7 first) for the
project's version. Installing any of them needs a yes.

## Rules for any stack

- **One command**, saved and reused unchanged before and after. Same machine, same data, same load, nothing else heavy running.
- **Warm-up**: discard the first run(s) (JIT, caches, connection pools, disk cache) — or state that cold start is the metric.
- **Runs**: 3 minimum, 5–10 for fast or jittery targets. Report the **median** and the **spread** (min–max), not the best run.
- **Noise**: the spread of the baseline. A gain smaller than that spread, or with overlapping before/after ranges, is noise
  → revert. For micro-benchmarks prefer a tool that reports its own variance.
- **Same work**: identical input size and shape before and after; fixed seeds; no random data.
- **Correctness first**: tests green before and after; compare the outputs, not only the time.
- Local or staging only. Never production.

## Per stack

- **Node**: `performance.now()` loop around the function (many iterations, after warm-up); `node --cpu-prof` and inspect the
  profile for the hot function; `autocannon` for a local HTTP endpoint (fixed duration and connections).
- **Python**: `timeit` (it repeats and picks), `cProfile` / `pstats` to find the hot call; `tracemalloc` for memory.
- **Go**: `go test -bench` with `-count` for several runs; `pprof` for CPU and allocations; `benchstat` to compare runs.
- **SQL**: `EXPLAIN ANALYZE` on a **copy** or test database with realistic volume — it executes the query, so never against
  production or with a writing statement on real data; compare the plan (scan type, rows, time) and the execution time over
  several runs; check the index is used after a change.
- **Frontend**: bundle analyzer for size (report bytes, raw and gzip); Lighthouse on localhost for load metrics — several
  runs, median, since scores vary run to run.
- **Other**: `hyperfine`-style repeated wall-clock timing of a CLI command; peak memory via the OS or runtime tool.

## What to record

Metric · exact command · environment (machine, runtime version, data size) · n runs · median · min–max · date. Put it in the
report so the next person can repeat it.

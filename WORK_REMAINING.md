# Work Remaining — seo-audit-suite

Session snapshot taken at the 50-minute time-box stop. This documents what was
completed and what is still open, so the next session can resume cleanly.

## ✅ Completed this session (redesign continuation)

- **Fixed a real bug found while resuming**: the 5 ported test files were
  named `tests/seo_suite_test_*.py`, which doesn't match pytest's default
  collection glob (`test_*.py` / `*_test.py`) — `python -m pytest -q` (the
  exact command in `ci.yml` and this doc's own resume checklist) was silently
  collecting **0** of the 61 ported tests despite the prior session's "231
  tests total / 61 ported" claim. Renamed all 5 to `test_seo_suite_*.py`;
  `pytest -q` now collects and passes all 231 as documented.
- **Design tokens audit (item A.1)**: `app/tools/page.tsx` had two undocumented
  ad-hoc tokens with inline fallbacks (`var(--seo-input-bg,transparent)`,
  `var(--seo-code-bg,var(--seo-card-hover))`). Promoted both to real entries in
  `app/globals.css` (`--seo-input-bg`, `--seo-code-bg`) so every token is
  declared in one place; call sites no longer need inline fallbacks.
- **`/tools` result rendering polish (item A.6)**: results are no longer only
  raw JSON in a `<pre>`. Added a `CopyButton` (copies the JSON) shown on every
  panel's result, and a dedicated `KeywordResultTable` that renders
  `keyword-research` output (`ok:true` + `rows[]`) as a real table — Keyword /
  Volume / Difficulty / CPC / Competition / Intent columns — falling back to
  the JSON view for every other tool or an error result. New `CopyIcon` /
  `CheckIcon` added to `components/icons.tsx` for this.
  Verified in-browser: since this sandbox's `vercel dev` falls back to plain
  `next dev` (documented caveat below — `/api/tools.py` 404s), the
  keyword-research fetch was mocked in the browser console to confirm the
  table renders correctly with real column formatting (`$3.50`, capitalized
  intent, tabular-nums). All other panels' JSON+Copy path was exercised live
  against the (stubbed/404) API to confirm the copy button appears.

## ✅ Completed previous session

| # | Work | Verification |
|---|------|--------------|
| 1 | **Renamed** Technical Audit → SEO Audit: route `/technical-audit` → `/seo-audit`, all labels, tab title ("SEO Audit Suite"), manifest, opengraph | Clean `next build`; "Technical Audit" ×0 in served HTML |
| 2 | **Ported 5 test suites** from SEO-Suite (`common`, `generators`, `schema_validator`, `page_type`, `keyword_research`) → `tests/seo_suite_test_*.py`, imports + patch targets rewritten | 61 tests pass |
| 3 | **Rewrote the results page**: KPI band, score/severity distributions, issues-by-category, richer per-URL table (issues, crit/high, broken links, more sorts). Old layout preserved at `/results-legacy` | Builds, typechecks, lints clean |
| 4 | **Surfaced all 8 tools** in `/tools` (was 3): generators (schema/meta/robots/sitemap/hreflang), validators, keyword research | Each action verified over the real Python handler |
| 5 | **Full multi-agent review** (frontend / Python / config) + **applied all fixes** | See below |
| 6 | **Design**: getting-started hero on the empty dashboard | Renders (HTTP 200) |

### Review fixes applied (commit `ef18ab5`)
- Generators no longer 500 on malformed input → clean 400 (`_run_generator`).
- `keyword-research` coerces `location`/`limit` → 400 on bad numbers.
- Malformed JSON body → 400; `require_str` now returns `ok:false`.
- Frontend: `--seo-danger` (undefined) → `--seo-error`; results table rows keyboard-operable.
- `deploy.yml`: token guard now sets a step output; all deploy steps gate on it → skips green without secrets (was hard-failing). Removed redundant job `if`.
- README project structure rewritten to real `api/`+`modules/` layout; `ci.yml`/`docs` comments corrected; `vercel.json` `audit-pipeline` 90→60s (Hobby-safe).

## 🔲 Remaining — prioritised

### A. Full project redesign (largest open item)
The empty-dashboard hero (prior session) and the `/tools` result-rendering +
token cleanup (this session) are done. A cohesive whole-project visual pass
still remains. Recommended, in order:
1. ~~**Design tokens audit**~~ — done for the two ad-hoc tokens found in
   `/tools`. Still open: a fuller pass over `app/globals.css` into a
   documented scale (spacing, radius, shadow, type ramp) — check other pages
   for the same `var(--x, fallback)` ad-hoc pattern.
2. **Page-level polish**, one route at a time (all currently functional, so this
   is low-risk iteration): `/seo-audit` (audit runner form), `/detail` (712-line
   per-URL drill-down — densest page, most to gain), `/settings`. `/tools` got
   a first pass this session (copy button + keyword table) but the generator
   panels themselves are still plain stacked inputs.
3. **Component consistency** — buttons, inputs, and cards have slight variations
   across pages; extract shared primitives (a `Button`, `Input`, `Select`).
   `/tools` still hand-rolls `INPUT_CLS`/`BTN_CLS` string constants rather than
   using shared components — a good first candidate once primitives exist.
4. **Empty/loading/error states** for every page (hero pattern from
   `components/GetStarted.tsx` can be generalised).
5. **Results detail (`/detail`) tables** — the Links/Headings/Performance tabs
   are information-dense; apply the same KPI-band + distribution treatment used
   in the new results page.
6. ~~Light polish of `/tools` result rendering~~ — done this session: copy
   button on every result, keyword-research renders as a table. Still open:
   syntax highlighting for the generator JSON/XML/text output (schema, meta,
   robots, sitemap, hreflang all still show plain `<pre>` text).

### B. Copy more from the source projects
Stateless SEO-Suite tools still portable to `api/tools.py` (see `docs/FUTURE.md`):
- `duplicate_detector` (needs `_phase_runner` too), `crux` (needs Google key),
  `a11y_audit`, `indexnow` (a write/submit action — confirm intent first).
Everything else in SEO-Suite is either already covered by the base or blocked
(Playwright / auth / DB / GSC-Bing OAuth) — those are the FUTURE.md phase-2 items.

### C. Informational review notes (no code change, decide later)
- **Double-deploy risk — resolved**: the repo now lives at
  `Layruss98266/Seo-audit-suite` (moved off the original `surya8991s-projects`
  Vercel link) and deploys via Vercel's own Git integration, connected
  directly in the Vercel dashboard. `.github/workflows/deploy.yml` was
  **removed** to avoid a second deploy path firing on every push;
  `.github/workflows/ci.yml` is CI-only now (typecheck/lint/tests/build) and
  does not gate or trigger Vercel deploys. No GitHub Actions deploy secrets
  are needed.
- **`vercel.json` maxDuration**: `audit-pipeline` is set to 60s (Hobby-safe).
  If the new Vercel project is on **Pro**, raise it back to 90 for large bulk
  crawls.
- First real deploy (commit `1c5e206`) succeeded — Vercel logged
  `Previous build caches not available` (expected, first deploy) and built
  each of the 4 Python functions (`api/ai.py`, `api/audit-pipeline.py`,
  `api/export.py`, `api/tools.py`) in its own isolated environment — that's
  normal per-function isolation, not a bug. A build cache (178.91 MB) was
  created at the end, so subsequent deploys should reuse it and skip most of
  the repeated dependency installs.

## ⚠️ Known caveats (not bugs)
- **`vercel dev` limitation**: plain `next dev` (the `next-dev` launch config)
  404s all `/api/*.py` — that's the Next.js dev server claiming `/api`, and it
  affects the base functions too. The `vercel-dev` launch config is meant to be
  the workaround, but **in this sandbox it doesn't actually help**: this
  session's run logged `Running Dev Command "next dev --port $PORT"` — i.e.
  the CLI fell back to the framework dev command instead of wiring up the
  Python function (likely needs `vercel link`/auth this sandbox doesn't have)
  — so `/api/tools` still 404s under `vercel-dev` here too. A real Vercel
  deployment or a properly-linked/authenticated local `vercel dev` is required
  to exercise the Python API end-to-end. The functions themselves are still
  verified via pytest + direct-handler HTTP tests.
- **Local pytest**: 3 `test_report_generator` tests fail locally because
  `xlsxwriter` isn't installed in this machine's Python 3.14; they pass in CI
  (it's in `requirements.txt`). All other tests pass (231 total: 170 base + 61
  ported) — **now confirmed under a plain `python -m pytest -q`** after this
  session's file-rename fix (see above); previously the 61 ported tests were
  silently uncollected by that exact command.
- **Lint is report-only** in CI: the base repo shipped ~24 pre-existing lint
  errors in inherited files (`lib/types.ts` etc.). All NEW/changed files this
  session are lint-clean. Cleaning up the inherited errors and flipping lint back
  to blocking is a good follow-up.

## Resume checklist
```
cd D:\Coding\seo-audit-suite
git log --oneline -8          # this session's commits (nothing pushed)
npm run build                 # confirm green
python -m pytest -q           # 231 tests (3 xlsxwriter fails are local-only)
```
Nothing has been pushed to any remote.

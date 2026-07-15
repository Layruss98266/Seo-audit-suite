# Work Remaining — seo-audit-suite

Session snapshot taken at the 50-minute time-box stop. This documents what was
completed and what is still open, so the next session can resume cleanly.

## ✅ Completed this session

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
Only the **empty-dashboard hero** was redesigned this session. A cohesive
whole-project visual pass still remains. Recommended, in order:
1. **Design tokens audit** — consolidate the CSS variables in `app/globals.css`
   into a documented scale (spacing, radius, shadow, type ramp). Some components
   reference tokens with inline fallbacks (`var(--x, ...)`) — unify them.
2. **Page-level polish**, one route at a time (all currently functional, so this
   is low-risk iteration): `/seo-audit` (audit runner form), `/detail` (712-line
   per-URL drill-down — densest page, most to gain), `/settings`, `/tools`
   (panels are functional but plain — add result formatting beyond raw JSON).
3. **Component consistency** — buttons, inputs, and cards have slight variations
   across pages; extract shared primitives (a `Button`, `Input`, `Select`).
4. **Empty/loading/error states** for every page (hero pattern from
   `components/GetStarted.tsx` can be generalised).
5. **Results detail (`/detail`) tables** — the Links/Headings/Performance tabs
   are information-dense; apply the same KPI-band + distribution treatment used
   in the new results page.
6. Consider a **light polish of `/tools` result rendering** — currently raw JSON
   in a `<pre>`; format generator output (copy button, syntax highlight) and
   keyword-research results (a table instead of JSON).

### B. Copy more from the source projects
Stateless SEO-Suite tools still portable to `api/tools.py` (see `docs/FUTURE.md`):
- `duplicate_detector` (needs `_phase_runner` too), `crux` (needs Google key),
  `a11y_audit`, `indexnow` (a write/submit action — confirm intent first).
Everything else in SEO-Suite is either already covered by the base or blocked
(Playwright / auth / DB / GSC-Bing OAuth) — those are the FUTURE.md phase-2 items.

### C. Informational review notes (no code change, decide later)
- **Double-deploy risk**: if Vercel's Git auto-deploy is ALSO enabled in the
  dashboard, every push to `main` deploys twice (Git integration + `deploy.yml`).
  Pick one. `ci.yml`'s header comment now flags this.
- **`vercel.json` maxDuration**: lowered `audit-pipeline` to 60s for Hobby. If the
  linked project (`surya8991s-projects/seo-audit-suite`) is on **Pro**, raise it
  back to 90 for large bulk crawls.
- **Deploy secrets** still to add in GitHub repo settings before CI can deploy:
  `VERCEL_TOKEN` (secret), `VERCEL_ORG_ID` = `team_kpODFmG8pLaRIYxFV5CSwcbj`,
  `VERCEL_PROJECT_ID` = `prj_LukWrVb9SzS7twPsLtPmHyjJjhvK`.

## ⚠️ Known caveats (not bugs)
- **`vercel dev` limitation**: plain `next dev` (the `next-dev` launch config)
  404s all `/api/*.py` — that's the Next.js dev server claiming `/api`, and it
  affects the base functions too. Use the `vercel-dev` launch config or a real
  deploy to exercise the Python API. The functions themselves are verified via
  pytest + direct-handler HTTP tests.
- **Local pytest**: 3 `test_report_generator` tests fail locally because
  `xlsxwriter` isn't installed in this machine's Python 3.14; they pass in CI
  (it's in `requirements.txt`). All other tests pass (231 total: 170 base + 61 ported).
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

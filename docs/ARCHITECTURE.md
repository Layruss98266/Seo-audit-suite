# Architecture

`seo-audit-suite` is a Next.js app with Python serverless functions, deployed
on Vercel. It combines two projects (see the README): a Vercel-native audit
dashboard (the base) plus stateless tools ported from the SEO-Suite project.

## Layout

```
seo-audit-suite/
├─ app/                 # Next.js App Router pages (UI)
│  ├─ seo-audit/  #   single + bulk technical audit
│  ├─ results/ detail/  #   audit results & per-URL drill-down
│  ├─ tools/            #   ported SEO-Suite tools (schema/validator/page-type)
│  └─ settings/
├─ components/          # React UI (Navbar, AppShell, ui primitives, charts)
├─ lib/                 # Client-side TypeScript (state, crawl orchestration, KB)
├─ api/                 # Python serverless functions (one file = one function)
│  ├─ audit-pipeline.py #   runs the audit engine
│  ├─ ai.py             #   Groq summaries + fix suggestions (action-dispatch)
│  ├─ export.py         #   CSV / Excel / PDF export
│  └─ tools.py          #   ported SEO-Suite tools (action-dispatch)
├─ modules/             # Python audit engine (shared by the api/ functions)
│  └─ seo_suite/        #   ← code ported from the SEO-Suite project
├─ docs/                # This file, FUTURE.md
└─ .github/workflows/   # ci.yml (gate) + deploy.yml (Vercel)
```

## Key conventions

- **One serverless function per `api/*.py` file.** Related tools are grouped
  behind a single function using an `action` field in the POST body
  (`api/ai.py`, `api/tools.py`) to minimize Vercel's per-function `pip install`
  overhead.
- **`modules/` is the shared Python package.** Every `api/*.py` adds the repo
  root to `sys.path` and imports from `modules.*`. Ported SEO-Suite code lives
  in the `modules/seo_suite/` sub-package with its imports rewritten
  (`core.` / `tools.` → `modules.seo_suite.`).
- **`@/` path alias** (see `tsconfig.json`) maps to the repo root for TS imports.
- **Stateless only.** No database, auth, background jobs, or browser automation
  runs on Vercel — see [FUTURE.md](FUTURE.md) for the plan to host those.

## Build & deploy

- CI (`.github/workflows/ci.yml`): typecheck → lint (report-only) → vitest →
  `next build`, plus `pytest` for the Python side.
- Deploy (`.github/workflows/deploy.yml`): Vercel CLI, preview on PRs, prod on
  `main`, gated on CI. `.vercelignore` keeps tests/docs/caches out of the bundle.

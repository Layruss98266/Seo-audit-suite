# Future work — bringing the rest of SEO-Suite onto this platform

This project combines two sources:

- **seo-audit-dashboard** (the base): a Vercel-native Next.js UI + Python
  serverless functions. It provides the app shell and the single-URL /
  bulk technical-audit engine.
- **SEO-Suite**: a full Flask application with a much larger tool surface.

Per the agreed scope, **phase 1 shipped only the stateless SEO-Suite tools**
that run cleanly on Vercel's serverless Python runtime (see
`modules/seo_suite/` and `api/tools.py`): the JSON-LD / robots / sitemap /
hreflang / meta **generators**, the **structured-data validator**, the
**page-type detector**, and **keyword research** (DataForSEO).

Everything below was intentionally deferred because it does **not** fit
Vercel's stateless, short-lived, read-only-filesystem model.

## Deferred — needs an always-on host (not Vercel serverless)

| SEO-Suite feature | Why it can't go on Vercel as-is | Suggested home |
|---|---|---|
| **Playwright indexing checker** (`core/checker.py`) | Needs a real headless browser + long-running process | Fly.io / Render worker, or a browserless API |
| **Multi-user auth, 2FA, sessions** (`core/auth.py`, `totp.py`) | Needs a persistent user store + server-side sessions | Postgres (Neon/Supabase) + a stateful backend, or Clerk/Auth.js |
| **SQLite database & audit history** (`core/db.py`) | Vercel's filesystem is ephemeral/read-only | Managed Postgres (Neon/Supabase) or Turso/libSQL |
| **Background jobs & scheduling** (`schedule`, phase runners) | No long-lived processes on serverless | A worker service + queue, or Vercel Cron for light jobs |
| **SSE streaming audit progress** (`/api/audit/stream`) | Long-lived connections don't fit function timeouts | The always-on backend, or poll-based progress |
| **Google Search Console / Bing tooling** (phase 2–4) | Needs OAuth token storage + refresh | Store tokens in Postgres behind the stateful backend |

## Recommended target architecture (phase 2)

```
                 ┌──────────────────────────┐
  Browser  ────▶ │  Next.js UI (Vercel)      │  ← this repo's app/ + components/
                 │  + stateless api/*.py      │  ← audit-pipeline, ai, export, tools
                 └──────────┬────────────────┘
                            │ HTTPS (authenticated)
                 ┌──────────▼────────────────┐
                 │  Stateful backend          │  ← ported from SEO-Suite's Flask app
                 │  (Fly.io / Render)         │     Playwright, auth, jobs, GSC/Bing
                 │  + Postgres (Neon/Supabase)│     audit history, users, tokens
                 └────────────────────────────┘
```

The Next.js frontend already centralizes API calls, so wiring a second
(stateful) backend is mostly: add its base URL as an env var, add the new
fetch calls, and gate the heavy features behind auth.

## Additional stateless tools still portable to `api/tools.py`

These SEO-Suite tools are also stateless and could be ported the same way the
current set was (copy into `modules/seo_suite/`, rewrite `core.`/`tools.`
imports, add an action to `api/tools.py`):

- `tools/duplicate_detector.py` — cross-URL duplicate content (also needs `_phase_runner`)
- `tools/crux.py` — Chrome UX Report data (needs a Google API key)
- `tools/a11y_audit.py` — accessibility checks
- `tools/indexnow.py` — IndexNow submission (a write/submit action — confirm intent)

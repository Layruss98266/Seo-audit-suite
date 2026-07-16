# SEO Audit vertical profiles + cleanup: design

Date: 2026-07-16
Status: approved (pending spec review)

## Context

The user asked to "double down on SEO Audit & Results, deeply fix all issues,
improve SEO Audit, then split audit like SEO Suite usecases," using
`edstellar.com/sitemap.xml` as the live reference site to validate against.

Research turned up three separate threads. This spec covers all three as one
bounded piece of work (confirmed in scope-narrowing questions):

1. A small cleanup item on the Results page (`/results-legacy` removal).
2. Extending the audit-type ("Course"/"Blog"/"General") concept with a real
   `product` profile, using the existing, already-correct detection strategy.
3. Surfacing vertical-specific findings (course/blog/product) in the Detail
   page, where they're currently computed but never shown.

### Key finding that reshaped the design

The original assumption (from initial exploration) was that
`modules/auditor.py`'s `detect_page_type()` is a "crude URL-substring guess"
that should be replaced by the more sophisticated signal-weighted detector in
`modules/seo_suite/page_type.py`. Reading the function in full disproved
this. `detect_page_type()` carries a detailed code comment explaining it was
deliberately hand-tuned against real edstellar.com data: the signal-weighted
approach was tried and found to classify **backwards** on this exact site (a
genuine course page had fewer "course signals" than a non-course service
page). **This design keeps that detector's approach (URL-pattern matching)
unchanged and only extends it** with a `product` branch, using the same
pattern-matching style, not the signal-weighted module.

Pulling the live sitemap (2,461 URLs) confirmed why: Edstellar is a B2B
corporate training company with **zero** product/e-commerce pages (no
`/product/`, `/shop/`, `/item/` paths). `product_auditor.py` is still being
built (per user decision: this is a general-purpose tool, not Edstellar-only)
but it will be validated with fixture HTML in unit tests, not live Edstellar
URLs, since none exist there to test against.

A substring false-positive check against the real sitemap also surfaced a
concrete hazard: 32 real Edstellar URLs contain the word "product" as part of
a course/category slug (e.g. `/course/product-launch-training`,
`/category/product-management-training`). A naive `"product" in url_lower`
pattern would misclassify all 32 as `product` pages. The new patterns must be
slash-delimited path segments (`/product/`, `/products/`, `/shop/`,
`/item/`), verified to have **zero** false-positive matches against the live
sitemap. (`/p/` from the SEO-Suite reference module is deliberately dropped:
it added no value on the reference site and is a needless single-letter
false-positive risk elsewhere.)

## Scope

### A. Results page cleanup
- Delete `app/results-legacy/` entirely.
- Remove the "View legacy results layout →" link from `app/results/page.tsx`.

### B. Extend page-type detection (`modules/auditor.py`)
- Add a `product` branch to `detect_page_type()`, alongside the existing
  `course`/`blog`/`general` branches, using slash-delimited URL patterns:
  `/product/`, `/products/`, `/shop/`, `/item/`.
- No changes to the existing course/blog logic or the root-page special case.

### C. New `modules/product_auditor.py`
Mirrors the structure of `course_auditor.py`/`blog_auditor.py` (a single
`audit_product_page(soup, url) -> dict` function returning
`{schema_found, has_product_schema, price_found, issues: [...]}`).

Checks (all emit `category: "Product Content"`, matching the course/blog
pattern of one category per vertical):
- **Product schema**: JSON-LD `@type` includes `Product` (High severity if
  missing; this is the strongest ranking signal for product pages).
- **Price/availability**: JSON-LD `offers.price` present, OR a visible price
  pattern (`[$€£¥]\s?\d`) in page text (Medium if neither found).
- **Add-to-cart / purchase CTA**: text match for
  `add to cart|buy now|add to bag|add to basket` (Medium).
- **Review/rating markup**: JSON-LD `AggregateRating` or `Review` node
  (Low: nice-to-have, not universally applicable).
- **Product image alt text**: look for an `<img>` inside a container whose
  class/id matches `product|gallery|main-image` (common product-page
  markup); if none matches, fall back to the page's first content `<img>`.
  Flag (Medium) if that image has no non-empty `alt` attribute. This
  deliberately reuses the existing alt-text bar from `image_auditor.py`
  rather than re-implementing image analysis. Full image auditing is
  already covered elsewhere in the pipeline; this check only asks "does the
  product's main image have alt text."

### D. Wire `product_audit` into `modules/auditor.py`
- Add `"product_audit": {}` to the initial `result` dict.
- Add an `elif result["audit_type"] == "product":` branch calling
  `audit_product_page`, alongside the existing course/blog branches.
- Add `"product_audit"` to the `all_issues` aggregation key list.

### E. Scoring/category wiring (`modules/scoring.py` + `lib/aggregate.ts`)
- Add `"Product Content"` to the `"Page-Specific"` THEMES entry in **both**
  files (they're documented as kept in sync). No new `WEIGHTS` bucket needed:
  product findings share the existing `page_specific` (5%) bucket with
  course/blog, exactly as blog/course already do.

### F. Surface vertical findings in the Detail page
- In `app/detail/page.tsx`'s existing "Content" tab (not a new top-level tab:
  7 tabs already, and an 8th would sit empty for "general" pages), add a
  conditional card: "Vertical Content Checks", rendered only when
  `r.audit_type` is `course`/`blog`/`product` and the matching `*_audit`
  object has data.
- Shows the type-specific completeness score (`sections_score` /
  `elements_score` / equivalent for product) and a found/missing checklist
  for that vertical's structural elements (`sections_found` /
  `elements_found` / product's own found-map). This structural data is
  unique and currently invisible; the individual *issues* already flow into
  the Issues tab via `all_issues`, so this card must not re-list full issue
  detail, only the structural summary.

### G. Tests (expanded)

None of `detect_page_type()`, `course_auditor.py`, or `blog_auditor.py` has
dedicated test coverage today, so this is new ground, not a small addition.
Every test below asserts on **concrete expected values**, not just "no
exception raised" or "issues list is non-empty."

**`tests/test_auditor_page_type.py`** (new), parametrized by `(url, expected_type)`:
- `https://example.com/` → `general` (root special case)
- `https://example.com/course/python-basics-training` → `course`
- `https://example.com/courses/data-science` → `course`
- `https://example.com/training/leadership` → `course`
- `https://example.com/blog/how-to-write-a-blog` → `blog`
- `https://example.com/news/company-update` → `blog`
- `https://example.com/product/wireless-mouse` → `product`
- `https://example.com/products/laptop-stand` → `product`
- `https://example.com/shop/gift-cards` → `product`
- `https://example.com/about-us` → `general` (no pattern matches)
- Regression cases (the false positive found during design), each asserting
  `course`, **not** `product`:
  - `https://www.edstellar.com/course/product-launch-training`
  - `https://www.edstellar.com/category/product-management-training`
  - `https://www.edstellar.com/corporate/soft-skills-training-for-product-management-teams`
- Case-insensitivity: `https://example.com/COURSE/Foo-Training` → `course`.
- Query string / trailing content don't break matching:
  `https://example.com/blog/post?utm_source=x` → `blog`.

**`tests/test_product_auditor.py`** (new), each case asserts the full
returned dict shape, not just `issues`:
- **Complete product page** fixture (Product JSON-LD with `offers.price` and
  `aggregateRating`, an `<img class="product-gallery-image" alt="Wireless
  mouse, top view">`, page text containing "Add to Cart"): assert
  `schema_found is True`, `has_product_schema is True`, `price_found is
  True`, and `issues == []`.
- **Bare product page** fixture (no JSON-LD, no price text, no CTA text, no
  images): assert every check fires with the exact expected
  `(issue, category, severity)` tuple, e.g.
  `("Missing Product Schema Markup", "Product Content", "High")`,
  `("Missing Price Information", "Product Content", "Medium")`,
  `("Missing Add-to-Cart / Purchase CTA", "Product Content", "Medium")`,
  `("Missing Review/Rating Markup", "Product Content", "Low")`,
  `("Missing Product Image Alt Text", "Product Content", "Medium")`.
- **Partial cases** (one signal present, rest absent), to prove checks are
  independent and don't mask each other:
  - Schema present but no `offers.price` -> price issue still fires, schema
    issue does not.
  - Visible price text present but no JSON-LD price -> `price_found is True`
    via the text-pattern path (not just the schema path).
  - CTA text present in a different casing/wording variant ("Buy Now",
    "ADD TO BAG") -> still detected (case-insensitive, matches the
    alternation in the design, not just the first listed phrase).
  - Product image present via the class-match path vs. via the
    first-content-image fallback path -> both produce the same "no alt"
    finding when `alt` is empty, proving the fallback actually gets used
    when no product-gallery container exists.

**`modules/auditor.py` wiring test** (extend an existing auditor test file
rather than adding a new one, since this exercises `audit_url()` end to end):
- Given a fetch mocked to return a bare product-page fixture at a
  `/product/...` URL with `audit_type="auto"`: assert
  `result["audit_type"] == "product"`, `result["product_audit"]["issues"]`
  is non-empty, and every one of those issues also appears in
  `result["all_issues"]` (proves the aggregation wiring, not just that the
  module runs standalone).
- Same shape of test already implicitly expected for course/blog; if it
  does not exist yet, add the equivalent minimal end-to-end case for at
  least one of them alongside the new product case, so all three verticals
  have at least one wiring-level regression test, not just unit-level.

**Scoring sync test** (extend `tests/test_scoring.py` or add a small new
test): assert `"Product Content"` appears in `modules/scoring.py`'s
`THEMES["Page-Specific"]`, and separately assert (via a lightweight
text/regex check against `lib/aggregate.ts`, since these are cross-language
files with no shared import) that the TypeScript file's `Page-Specific` entry
lists the identical three categories in the identical order:
`["Course Content", "Blog Content", "Product Content", "Conversion"]` (order
matters only in that both files must match each other exactly; the actual
order chosen should keep `Conversion` last since it's not vertical-specific,
matching its current position).

### H. Pre-push verification (explicit user requirement)
Before pushing, in addition to the standard build/lint/typecheck/pytest gate:
- Run the local audit pipeline against a small real sample pulled from the
  live sitemap: the root URL, one real `/course/...` URL, one real
  `/blog/...` URL, and confirm classification, score, and issue output all
  look sane and course/blog behavior is unchanged (regression check on the
  existing, already-tuned detector).
- Exercise `/seo-audit` and `/results` in the browser preview end to end with
  at least one real submission (network permitting in this sandbox) or a
  mocked-fetch pass if live network egress isn't available, to confirm no
  regressions from the Content-tab addition or the results-legacy removal.

## Out of scope (explicitly deferred)
- Any change to course/blog detection logic itself (already correct).
- Per-vertical scoring *weight* changes (all verticals share the existing
  fixed `page_specific` bucket; no redesign of `WEIGHTS`).
- A `topic`/`category` profile for Edstellar's own secondary content types,
  raised during design but the user chose to proceed with the general-purpose
  `product` profile instead.
- Any change to `modules/seo_suite/page_type.py` (the signal-weighted
  detector); it remains as-is, reachable only from the `/tools` panel.

# SEO Audit Vertical Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `product` audit-type profile alongside the existing `course`/`blog`/`general` ones, surface all three verticals' findings in the Detail page (currently computed and silently discarded), and remove the obsolete `/results-legacy` page.

**Architecture:** `modules/auditor.py`'s `detect_page_type()` gets one new URL-pattern branch (no change to its existing, already-tuned course/blog logic). A new `modules/product_auditor.py`, modeled on the existing `course_auditor.py`/`blog_auditor.py`, runs when `audit_type == "product"` and its output is wired into the same `all_issues` aggregation and `page_specific` scoring bucket course/blog already use. A new "Vertical Content Checks" card in the Detail page's Content tab renders whichever of `course_audit`/`blog_audit`/`product_audit` is present.

**Tech Stack:** Python 3.12 (pytest, BeautifulSoup/lxml) for the audit pipeline; TypeScript/Next.js (React) for the frontend; no new dependencies.

## Global Constraints

- New URL patterns for `product` must be slash-delimited path segments (`/product/`, `/products/`, `/shop/`, `/item/`), verified against the live edstellar.com sitemap to produce zero false positives (32 real URLs contain "product" as a mid-slug substring, e.g. `/course/product-launch-training`).
- Do not modify the existing course/blog branches in `detect_page_type()` — they are deliberately hand-tuned against real edstellar.com data (see the comment at `modules/auditor.py:576-607`).
- Do not modify `modules/seo_suite/page_type.py` (the signal-weighted detector) — out of scope, stays reachable only from `/tools`.
- `modules/scoring.py`'s `THEMES` dict and `lib/aggregate.ts`'s `THEMES` const must stay in sync (documented convention in both files' comments) — any category added to one must be added to the other, in the same list position.
- Every new Python issue dict must include `impact_score` and `effort` inline (matching `course_auditor.py`'s complete style — do not rely on `_normalize_issues()` backfill, which exists only for older incomplete modules like `blog_auditor.py`).
- No network calls in unit tests — use `prefetched=...` / `prefetched_domain_health={}` / `check_links=False` to keep `audit_url()` calls deterministic and fast, per the existing pattern proven in `tests/test_sitewide_pipeline_live.py`.

---

### Task 1: Remove `/results-legacy`

**Files:**
- Delete: `app/results-legacy/page.tsx` (and the `app/results-legacy/` directory once empty)
- Modify: `app/results/page.tsx:585-589`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure removal).

- [ ] **Step 1: Delete the legacy results page**

Run:
```bash
git rm -r app/results-legacy
```

- [ ] **Step 2: Remove the link to it from the new results page**

In `app/results/page.tsx`, find:
```tsx
      {/* ── destructive: clear all ── */}
      <div className="mt-6 flex items-center justify-between border-t border-[var(--seo-border)] pt-4">
        <a href="/results-legacy" className="text-xs text-[var(--seo-muted)] hover:text-[var(--seo-text-light)] hover:underline">
          View legacy results layout →
        </a>
        <button
```

Replace with (drop the `<a>`, change the wrapper to right-align the single remaining button):
```tsx
      {/* ── destructive: clear all ── */}
      <div className="mt-6 flex items-center justify-end border-t border-[var(--seo-border)] pt-4">
        <button
```

The closing `</div>` after the button and everything else in the file is unchanged.

- [ ] **Step 3: Verify the build has no dangling references**

Run: `npm run build`
Expected: build succeeds; no "Module not found" errors for `/results-legacy`.

- [ ] **Step 4: Commit**

```bash
git add app/results/page.tsx
git commit -m "Remove /results-legacy page and its link from the new results page"
```

---

### Task 2: Extend `detect_page_type()` with a `product` branch (TDD)

**Files:**
- Modify: `modules/auditor.py:576-607`
- Test: `tests/test_auditor_page_type.py` (new)

**Interfaces:**
- Consumes: nothing new (pure function `detect_page_type(url, soup) -> str`, already exists).
- Produces: `detect_page_type()` now returns `"product"` for matching URLs (in addition to existing `"course"` / `"blog"` / `"general"`). Later tasks (3, 4) depend on this exact return value.

- [ ] **Step 1: Write the failing test file**

Create `tests/test_auditor_page_type.py`:
```python
"""Tests for modules.auditor.detect_page_type — URL-pattern based page-type
classification. Course/blog patterns are deliberately hand-tuned against real
edstellar.com data (see the comment above detect_page_type); the regression
cases here lock in a false positive found while adding the product pattern:
32 real edstellar URLs contain "product" as part of a course/category slug
(e.g. /course/product-launch-training), so product patterns must be
slash-delimited path segments, not bare substring matches.
"""

import pytest

from modules.auditor import detect_page_type


@pytest.mark.parametrize(
    "url,expected_type",
    [
        # Root / no-pattern pages
        ("https://example.com/", "general"),
        ("https://example.com/about-us", "general"),
        # Course
        ("https://example.com/course/python-basics-training", "course"),
        ("https://example.com/courses/data-science", "course"),
        ("https://example.com/training/leadership", "course"),
        ("https://example.com/program/mba-prep", "course"),
        ("https://example.com/workshop/agile-basics", "course"),
        ("https://example.com/bootcamp/full-stack", "course"),
        # Blog
        ("https://example.com/blog/how-to-write-a-blog", "blog"),
        ("https://example.com/blogs/second-post", "blog"),
        ("https://example.com/article/deep-dive", "blog"),
        ("https://example.com/post/short-update", "blog"),
        ("https://example.com/news/company-update", "blog"),
        ("https://example.com/insight/market-trends", "blog"),
        # Product
        ("https://example.com/product/wireless-mouse", "product"),
        ("https://example.com/products/laptop-stand", "product"),
        ("https://example.com/shop/gift-cards", "product"),
        ("https://example.com/item/notebook-set", "product"),
        # Case-insensitivity
        ("https://example.com/COURSE/Foo-Training", "course"),
        # Query strings don't break matching
        ("https://example.com/blog/post?utm_source=x", "blog"),
        # Regression: "product" as a substring of a course/category slug must
        # NOT classify as product (real URLs pulled from edstellar.com).
        ("https://www.edstellar.com/course/product-launch-training", "course"),
        ("https://www.edstellar.com/category/product-management-training", "general"),
        (
            "https://www.edstellar.com/corporate/soft-skills-training-for-product-management-teams",
            "general",
        ),
    ],
)
def test_detect_page_type(url, expected_type):
    assert detect_page_type(url, soup=None) == expected_type
```

- [ ] **Step 2: Run the tests to verify the product cases fail**

Run: `python -m pytest tests/test_auditor_page_type.py -v`
Expected: the `course`/`blog`/`general`/regression cases PASS (existing logic already handles them); the four `product` cases FAIL, each asserting `'general' == 'product'` (falls through to the `general` default since no product branch exists yet).

- [ ] **Step 3: Add the `product` branch**

In `modules/auditor.py`, find:
```python
    if any(x in url_lower for x in ["/course/", "/courses/", "/training/", "/program/", "/workshop/", "/bootcamp/"]):
        return "course"
    if any(x in url_lower for x in ["/blog/", "/blogs/", "/article/", "/post/", "/news/", "/insight/"]):
        return "blog"
    return "general"
```

Replace with:
```python
    if any(x in url_lower for x in ["/course/", "/courses/", "/training/", "/program/", "/workshop/", "/bootcamp/"]):
        return "course"
    if any(x in url_lower for x in ["/blog/", "/blogs/", "/article/", "/post/", "/news/", "/insight/"]):
        return "blog"
    # Slash-delimited path segments only (not bare "product" substring): a
    # naive `"product" in url_lower` check misclassifies real URLs like
    # edstellar.com's /course/product-launch-training and
    # /category/product-management-training, where "product" is part of a
    # course/category slug, not a real product page. Verified zero false
    # positives against the live edstellar.com sitemap (2,461 URLs).
    if any(x in url_lower for x in ["/product/", "/products/", "/shop/", "/item/"]):
        return "product"
    return "general"
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `python -m pytest tests/test_auditor_page_type.py -v`
Expected: all cases PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/auditor.py tests/test_auditor_page_type.py
git commit -m "Add product branch to detect_page_type, with false-positive regression tests"
```

---

### Task 3: `modules/product_auditor.py` (TDD)

**Files:**
- Create: `modules/product_auditor.py`
- Test: `tests/test_product_auditor.py` (new)

**Interfaces:**
- Consumes: `bs4.BeautifulSoup` object and a `url` string (same signature shape as `course_auditor.audit_course_page(soup, url)` / `blog_auditor.audit_blog_page(soup, url)`).
- Produces: `audit_product_page(soup, url) -> dict` with keys:
  - `schema_found: bool` — any JSON-LD `@type` found at all (diagnostic)
  - `has_product_schema: bool` — JSON-LD `@type` includes `"Product"`
  - `price_found: bool` — price present via schema `offers.price` OR visible text pattern
  - `cta_found: bool`
  - `review_schema_found: bool`
  - `image_alt_ok: bool`
  - `checks_found: dict[str, bool]` — keys `"Product Schema"`, `"Price / Availability"`, `"Purchase CTA"`, `"Review / Rating Markup"`, `"Product Image Alt Text"` (used by Task 6's Detail-page card)
  - `checks_score: float` — percentage of `checks_found` that are `True`
  - `issues: list[dict]`
  Later tasks (4, 6) depend on these exact key names.

- [ ] **Step 1: Write the failing test file**

Create `tests/test_product_auditor.py`:
```python
"""Tests for modules.product_auditor.audit_product_page — product-page
vertical checks (schema, price, CTA, reviews, image alt text). Every case
asserts on the full returned dict shape, not just issue count."""

from bs4 import BeautifulSoup

from modules.product_auditor import audit_product_page

COMPLETE_HTML = """
<html><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Wireless Mouse",
  "offers": {"@type": "Offer", "price": "29.99", "priceCurrency": "USD"},
  "aggregateRating": {"@type": "AggregateRating", "ratingValue": "4.5", "reviewCount": "120"}
}
</script>
<img class="product-gallery-image" alt="Wireless mouse, top view">
<p>Add to Cart</p>
</body></html>
"""

BARE_HTML = """
<html><body>
<h1>Some Page</h1>
<p>No structured data, no price, no call to action here.</p>
</body></html>
"""


def test_complete_product_page_has_no_issues():
    soup = BeautifulSoup(COMPLETE_HTML, "lxml")
    result = audit_product_page(soup, "https://example.com/product/wireless-mouse")

    assert result["schema_found"] is True
    assert result["has_product_schema"] is True
    assert result["price_found"] is True
    assert result["cta_found"] is True
    assert result["review_schema_found"] is True
    assert result["image_alt_ok"] is True
    assert result["issues"] == []


def test_bare_product_page_fires_every_check():
    soup = BeautifulSoup(BARE_HTML, "lxml")
    result = audit_product_page(soup, "https://example.com/product/bare-item")

    assert result["schema_found"] is False
    assert result["has_product_schema"] is False
    assert result["price_found"] is False
    assert result["cta_found"] is False
    assert result["review_schema_found"] is False
    assert result["image_alt_ok"] is False

    got = {(i["issue"], i["category"], i["severity"]) for i in result["issues"]}
    assert got == {
        ("Missing Product Schema Markup", "Product Content", "High"),
        ("Missing Price / Availability Information", "Product Content", "Medium"),
        ("Missing Add-to-Cart / Purchase CTA", "Product Content", "Medium"),
        ("Missing Review/Rating Markup", "Product Content", "Low"),
        ("Missing Product Image Alt Text", "Product Content", "Medium"),
    }
    for issue in result["issues"]:
        assert isinstance(issue["impact_score"], (int, float))
        assert issue["effort"]


def test_schema_present_but_no_price_only_fires_price_issue():
    html = """
    <html><body>
    <script type="application/ld+json">
    {"@context": "https://schema.org", "@type": "Product", "name": "Widget"}
    </script>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    result = audit_product_page(soup, "https://example.com/product/widget")

    assert result["has_product_schema"] is True
    assert result["price_found"] is False
    issue_titles = {i["issue"] for i in result["issues"]}
    assert "Missing Price / Availability Information" in issue_titles
    assert "Missing Product Schema Markup" not in issue_titles


def test_visible_price_text_without_schema_price_still_detected():
    html = """
    <html><body>
    <p>Only $49.99 today!</p>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    result = audit_product_page(soup, "https://example.com/product/deal")

    assert result["price_found"] is True
    issue_titles = {i["issue"] for i in result["issues"]}
    assert "Missing Price / Availability Information" not in issue_titles


def test_cta_case_and_wording_variants_detected():
    for phrase in ["Buy Now", "ADD TO BAG", "add to basket"]:
        html = f"<html><body><p>{phrase}</p></body></html>"
        soup = BeautifulSoup(html, "lxml")
        result = audit_product_page(soup, "https://example.com/product/x")
        assert result["cta_found"] is True, f"expected CTA detected for {phrase!r}"


def test_product_image_fallback_to_first_content_image():
    # No product-gallery-class container present: falls back to the first
    # <img> on the page. That image has no alt -> issue fires.
    html = """
    <html><body>
    <img src="hero.jpg">
    <p>Some product description.</p>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    result = audit_product_page(soup, "https://example.com/product/y")

    assert result["image_alt_ok"] is False
    issue_titles = {i["issue"] for i in result["issues"]}
    assert "Missing Product Image Alt Text" in issue_titles


def test_checks_found_and_score_reflect_bare_vs_complete():
    bare = audit_product_page(BeautifulSoup(BARE_HTML, "lxml"), "https://example.com/product/bare")
    complete = audit_product_page(BeautifulSoup(COMPLETE_HTML, "lxml"), "https://example.com/product/complete")

    assert bare["checks_score"] == 0.0
    assert complete["checks_score"] == 100.0
    assert set(bare["checks_found"]) == {
        "Product Schema",
        "Price / Availability",
        "Purchase CTA",
        "Review / Rating Markup",
        "Product Image Alt Text",
    }
    assert all(v is False for v in bare["checks_found"].values())
    assert all(v is True for v in complete["checks_found"].values())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_product_auditor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.product_auditor'`.

- [ ] **Step 3: Write the implementation**

Create `modules/product_auditor.py`:
```python
"""Product-page-specific SEO checks: schema, price, purchase CTA, review
markup, and product-image alt text. Mirrors the structure of
course_auditor.py / blog_auditor.py (a single audit_*_page(soup, url) -> dict
function), so it plugs into modules/auditor.py's audit_url() the same way.
"""

import json
import re

CTA_PATTERN = re.compile(r"add\s+to\s+(cart|bag|basket)|buy\s+now", re.IGNORECASE)
PRICE_PATTERN = re.compile(r"[$€£¥]\s?\d")


def _iter_jsonld(soup):
    """Yield every parsed JSON-LD blob (dict) on the page. Skips malformed
    <script> tags rather than raising, since a broken schema block elsewhere
    on the page shouldn't crash the whole audit."""
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = (script.string or script.get_text() or "").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            continue
        yield data


def _has_type(data, type_name):
    """Check whether a (possibly nested) JSON-LD blob declares @type == type_name."""
    if isinstance(data, dict):
        t = data.get("@type")
        if t == type_name or (isinstance(t, list) and type_name in t):
            return True
        return any(_has_type(v, type_name) for v in data.values())
    if isinstance(data, list):
        return any(_has_type(item, type_name) for item in data)
    return False


def _schema_price(data):
    """Pull offers.price out of a JSON-LD blob, if present."""
    if isinstance(data, dict):
        offers = data.get("offers")
        if isinstance(offers, dict) and offers.get("price"):
            return True
        if isinstance(offers, list) and any(
            isinstance(o, dict) and o.get("price") for o in offers
        ):
            return True
        return any(_schema_price(v) for v in data.values() if isinstance(v, (dict, list)))
    if isinstance(data, list):
        return any(_schema_price(item) for item in data)
    return False


def _find_product_image(soup):
    """The main product image: prefer one inside a product/gallery/main-image
    container (common product-page markup); fall back to the page's first
    content <img> if no such container exists."""
    tagged = soup.find("img", class_=re.compile(r"product|gallery|main-image", re.IGNORECASE))
    if tagged:
        return tagged
    return soup.find("img")


def audit_product_page(soup, url):
    issues = []
    page_text = soup.get_text(" ", strip=True)

    jsonld_blobs = list(_iter_jsonld(soup))
    schema_found = bool(jsonld_blobs)
    has_product_schema = any(_has_type(b, "Product") for b in jsonld_blobs)
    if not has_product_schema:
        issues.append({
            "issue": "Missing Product Schema Markup",
            "category": "Product Content",
            "severity": "High",
            "recommendation": "Add Product schema (JSON-LD) with name, image, and offers so search engines can show rich product results.",
            "impact_score": 8,
            "effort": "Medium",
        })

    schema_price_found = any(_schema_price(b) for b in jsonld_blobs)
    text_price_found = bool(PRICE_PATTERN.search(page_text))
    price_found = schema_price_found or text_price_found
    if not price_found:
        issues.append({
            "issue": "Missing Price / Availability Information",
            "category": "Product Content",
            "severity": "Medium",
            "recommendation": "Add visible pricing (and, ideally, an offers.price value in Product schema) so shoppers and search engines can see the price.",
            "impact_score": 6,
            "effort": "Low",
        })

    cta_found = bool(CTA_PATTERN.search(page_text))
    if not cta_found:
        issues.append({
            "issue": "Missing Add-to-Cart / Purchase CTA",
            "category": "Product Content",
            "severity": "Medium",
            "recommendation": "Add a clear purchase call-to-action (e.g. 'Add to Cart' or 'Buy Now') to improve conversion.",
            "impact_score": 6,
            "effort": "Low",
        })

    review_schema_found = any(
        _has_type(b, "AggregateRating") or _has_type(b, "Review") for b in jsonld_blobs
    )
    if not review_schema_found:
        issues.append({
            "issue": "Missing Review/Rating Markup",
            "category": "Product Content",
            "severity": "Low",
            "recommendation": "Add AggregateRating or Review schema (JSON-LD) to surface star ratings in search results.",
            "impact_score": 3,
            "effort": "Medium",
        })

    product_image = _find_product_image(soup)
    image_alt_ok = bool(product_image and (product_image.get("alt") or "").strip())
    if not image_alt_ok:
        issues.append({
            "issue": "Missing Product Image Alt Text",
            "category": "Product Content",
            "severity": "Medium",
            "recommendation": "Add descriptive alt text to the main product image for accessibility and image search.",
            "impact_score": 5,
            "effort": "Low",
        })

    checks_found = {
        "Product Schema": has_product_schema,
        "Price / Availability": price_found,
        "Purchase CTA": cta_found,
        "Review / Rating Markup": review_schema_found,
        "Product Image Alt Text": image_alt_ok,
    }
    checks_score = round(sum(1 for v in checks_found.values() if v) / len(checks_found) * 100, 1)

    return {
        "schema_found": schema_found,
        "has_product_schema": has_product_schema,
        "price_found": price_found,
        "cta_found": cta_found,
        "review_schema_found": review_schema_found,
        "image_alt_ok": image_alt_ok,
        "checks_found": checks_found,
        "checks_score": checks_score,
        "issues": issues,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_product_auditor.py -v`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/product_auditor.py tests/test_product_auditor.py
git commit -m "Add product_auditor.py: schema/price/CTA/review/image-alt checks for product pages"
```

---

### Task 4: Wire `product_audit` into `audit_url()` (TDD)

**Files:**
- Modify: `modules/auditor.py:610-787`
- Test: `tests/test_auditor_wiring.py` (new)

**Interfaces:**
- Consumes: `product_auditor.audit_product_page(soup, url)` (Task 3), `detect_page_type()` returning `"product"` (Task 2).
- Produces: `audit_url(...)` results now include a populated `result["product_audit"]` dict when `audit_type` resolves to `"product"`, and those issues appear in `result["all_issues"]`. Task 6 (Detail page) depends on `result["product_audit"]["checks_found"]` / `["checks_score"]` existing on real results.

- [ ] **Step 1: Write the failing wiring test**

Create `tests/test_auditor_wiring.py`:
```python
"""End-to-end wiring tests for modules.auditor.audit_url: proves each
page-type-specific auditor (course/blog/product) actually runs and its
issues land in all_issues, not just that the standalone module works.
Uses `prefetched=` to skip the real HTTP fetch (deterministic, no network),
and `prefetched_domain_health={}` / `check_links=False` to skip the other
network-touching sub-checks — same pattern already proven in
tests/test_sitewide_pipeline_live.py's opt-in live test.
"""

from bs4 import BeautifulSoup

from modules.auditor import audit_url

BARE_HTML = "<html><head><title>Test</title></head><body><h1>Test</h1><p>Content.</p></body></html>"


def _prefetched(html):
    soup = BeautifulSoup(html, "lxml")
    return {
        "success": True,
        "status_code": 200,
        "final_url": "unused",  # overwritten by the real url per call site below
        "redirect_count": 0,
        "redirect_history": [],
        "content_type": "text/html",
        "soup": soup,
        "html": html,
        "response_time": 0.05,
        "http_headers": {},
        "page_size_bytes": len(html),
    }


def test_product_url_runs_product_auditor_and_feeds_all_issues():
    url = "https://example.com/product/bare-item"
    prefetched = _prefetched(BARE_HTML)
    prefetched["final_url"] = url

    result = audit_url(
        url,
        audit_type="auto",
        check_links=False,
        prefetched=prefetched,
        prefetched_domain_health={},
    )

    assert result["audit_type"] == "product"
    product_issues = result["product_audit"]["issues"]
    assert len(product_issues) > 0
    all_issue_titles = {i["issue"] for i in result["all_issues"]}
    for issue in product_issues:
        assert issue["issue"] in all_issue_titles


def test_course_url_runs_course_auditor_and_feeds_all_issues():
    url = "https://example.com/course/bare-course"
    prefetched = _prefetched(BARE_HTML)
    prefetched["final_url"] = url

    result = audit_url(
        url,
        audit_type="auto",
        check_links=False,
        prefetched=prefetched,
        prefetched_domain_health={},
    )

    assert result["audit_type"] == "course"
    course_issues = result["course_audit"]["issues"]
    assert len(course_issues) > 0
    all_issue_titles = {i["issue"] for i in result["all_issues"]}
    for issue in course_issues:
        assert issue["issue"] in all_issue_titles


def test_general_url_leaves_vertical_audits_empty():
    url = "https://example.com/about-us"
    prefetched = _prefetched(BARE_HTML)
    prefetched["final_url"] = url

    result = audit_url(
        url,
        audit_type="auto",
        check_links=False,
        prefetched=prefetched,
        prefetched_domain_health={},
    )

    assert result["audit_type"] == "general"
    assert result["course_audit"] == {}
    assert result["blog_audit"] == {}
    assert result["product_audit"] == {}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_auditor_wiring.py -v`
Expected: `test_product_url_runs_product_auditor_and_feeds_all_issues` FAILS with a `KeyError: 'product_audit'` (key doesn't exist yet on `result`); the course and general tests currently PASS (that wiring already exists) but keep them in the same file as regression coverage for the change about to be made.

- [ ] **Step 3: Add `product_audit` to the result dict, the dispatch branch, and the aggregation list**

In `modules/auditor.py`, find the initial `result` dict (around line 623):
```python
        "course_audit": {},
        "blog_audit": {},
```

Replace with:
```python
        "course_audit": {},
        "blog_audit": {},
        "product_audit": {},
```

Then find the dispatch block (around line 760):
```python
    if result["audit_type"] == "course":
        from modules.course_auditor import audit_course_page
        result["course_audit"] = audit_course_page(soup, url)
    elif result["audit_type"] == "blog":
        from modules.blog_auditor import audit_blog_page
        result["blog_audit"] = audit_blog_page(soup, url)
```

Replace with:
```python
    if result["audit_type"] == "course":
        from modules.course_auditor import audit_course_page
        result["course_audit"] = audit_course_page(soup, url)
    elif result["audit_type"] == "blog":
        from modules.blog_auditor import audit_blog_page
        result["blog_audit"] = audit_blog_page(soup, url)
    elif result["audit_type"] == "product":
        from modules.product_auditor import audit_product_page
        result["product_audit"] = audit_product_page(soup, url)
```

Then find the `all_issues` aggregation key list (around line 772):
```python
    for key in ["metadata", "canonical", "indexability", "url_structure",
                "content", "heading_detail", "image_detail",
                "advanced", "redirect_analysis", "mobile_audit", "site_health",
                "internal_links", "external_links", "course_audit", "blog_audit"]:
```

Replace with:
```python
    for key in ["metadata", "canonical", "indexability", "url_structure",
                "content", "heading_detail", "image_detail",
                "advanced", "redirect_analysis", "mobile_audit", "site_health",
                "internal_links", "external_links", "course_audit", "blog_audit",
                "product_audit"]:
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `python -m pytest tests/test_auditor_wiring.py -v`
Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full Python test suite to check for regressions**

Run: `python -m pytest -q`
Expected: same pass count as before plus the new tests (231 + 4 new page-type + 7 new product_auditor + 3 new wiring = 245 passed, plus the 3 pre-existing local-only `xlsxwriter` failures unaffected).

- [ ] **Step 6: Commit**

```bash
git add modules/auditor.py tests/test_auditor_wiring.py
git commit -m "Wire product_audit into audit_url: dispatch, result dict, all_issues aggregation"
```

---

### Task 5: Scoring/category sync (`modules/scoring.py` + `lib/aggregate.ts`)

**Files:**
- Modify: `modules/scoring.py` (THEMES dict, "Page-Specific" entry)
- Modify: `lib/aggregate.ts` (THEMES const, "Page-Specific" entry)
- Test: extend `tests/test_scoring.py` (new test function)

**Interfaces:**
- Consumes: `"Product Content"` category string emitted by `product_auditor.py` (Task 3).
- Produces: issues categorized `"Product Content"` are grouped into the `"Page-Specific"` theme and scored under the existing `page_specific` (5%) `WEIGHTS` bucket, exactly like `"Course Content"` / `"Blog Content"` already are. No new task depends on this beyond correctness.

- [ ] **Step 1: Write the failing test**

In `tests/test_scoring.py`, add:
```python
def test_product_content_is_a_page_specific_theme():
    from modules.scoring import THEMES

    assert "Product Content" in THEMES["Page-Specific"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_scoring.py::test_product_content_is_a_page_specific_theme -v`
Expected: FAIL, `"Product Content" not in ['Course Content', 'Blog Content', 'Conversion']`.

- [ ] **Step 3: Update `modules/scoring.py`**

Find:
```python
    "Page-Specific": ["Course Content", "Blog Content", "Conversion"],
```

Replace with:
```python
    "Page-Specific": ["Course Content", "Blog Content", "Product Content", "Conversion"],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_scoring.py::test_product_content_is_a_page_specific_theme -v`
Expected: PASS.

- [ ] **Step 5: Update `lib/aggregate.ts` to match**

In `lib/aggregate.ts`, find:
```ts
  "Page-Specific": ["Course Content", "Blog Content", "Conversion"],
```

Replace with:
```ts
  "Page-Specific": ["Course Content", "Blog Content", "Product Content", "Conversion"],
```

- [ ] **Step 6: Verify the frontend typechecks and existing vitest suite still passes**

Run: `npx tsc --noEmit && npm test`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add modules/scoring.py lib/aggregate.ts tests/test_scoring.py
git commit -m "Add Product Content to the Page-Specific scoring theme (Python + TS, kept in sync)"
```

---

### Task 6: Surface `audit_type` in the frontend options + `product` in the manual dropdown

**Files:**
- Modify: `lib/types.ts:60-61,74`
- Modify: `app/seo-audit/page.tsx:67,573-583`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AuditOptions.auditType` now includes `"product"`; `AuditResult.product_audit` is typed. Task 7 (Detail page) reads `r.product_audit` off this type.

- [ ] **Step 1: Add `product_audit` to `AuditResult` and `"product"` to `AuditOptions`**

In `lib/types.ts`, find:
```ts
  course_audit?: Record<string, any> | null;
  blog_audit?: Record<string, any> | null;
```

Replace with:
```ts
  course_audit?: Record<string, any> | null;
  blog_audit?: Record<string, any> | null;
  product_audit?: Record<string, any> | null;
```

Then find:
```ts
export interface AuditOptions {
  auditType: "auto" | "course" | "blog" | "general";
```

Replace with:
```ts
export interface AuditOptions {
  auditType: "auto" | "course" | "blog" | "product" | "general";
```

- [ ] **Step 2: Add the "Product" option to the audit-type selector**

In `app/seo-audit/page.tsx`, find:
```tsx
  const [auditType, setAuditType] = useState<"auto" | "course" | "blog" | "general">("auto");
```

Replace with:
```tsx
  const [auditType, setAuditType] = useState<"auto" | "course" | "blog" | "product" | "general">("auto");
```

Then find:
```tsx
              <option value="auto">Auto-Detect</option>
              <option value="course">Course</option>
              <option value="blog">Blog</option>
              <option value="general">General</option>
```

Replace with:
```tsx
              <option value="auto">Auto-Detect</option>
              <option value="course">Course</option>
              <option value="blog">Blog</option>
              <option value="product">Product</option>
              <option value="general">General</option>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts app/seo-audit/page.tsx
git commit -m "Add product to AuditOptions/AuditResult types and the manual audit-type selector"
```

---

### Task 7: "Vertical Content Checks" card in the Detail page

**Files:**
- Modify: `app/detail/page.tsx` (Content tab, around line 663-707)

**Interfaces:**
- Consumes: `r.audit_type`, `r.course_audit`, `r.blog_audit`, `r.product_audit` (all already on `AuditResult` per Task 6); `Card`, `HelpSection` from `@/components/ui` (already imported in this file).
- Produces: nothing consumed by later tasks (this is the last frontend task in this plan).

- [ ] **Step 1: Add a small helper that maps each vertical to its found-map/score keys**

In `app/detail/page.tsx`, add this function near `KeyValueGrid` (after its closing brace, around line 143):
```tsx
type VerticalAudit = { found: Record<string, boolean>; score: number } | null;

/** course_audit/blog_audit/product_audit each use their own found-map/score
 * key names (sections_found/sections_score, elements_found/elements_score,
 * checks_found/checks_score) — this normalizes whichever one is present for
 * the current page's audit_type into one shape the card below can render
 * uniformly, without renaming the underlying Python fields. */
function verticalAuditFor(r: {
  audit_type: string;
  course_audit?: Record<string, any> | null;
  blog_audit?: Record<string, any> | null;
  product_audit?: Record<string, any> | null;
}): { label: string; audit: VerticalAudit } {
  if (r.audit_type === "course" && r.course_audit && Object.keys(r.course_audit).length) {
    return {
      label: "Course",
      audit: { found: r.course_audit.sections_found || {}, score: r.course_audit.sections_score ?? 0 },
    };
  }
  if (r.audit_type === "blog" && r.blog_audit && Object.keys(r.blog_audit).length) {
    return {
      label: "Blog",
      audit: { found: r.blog_audit.elements_found || {}, score: r.blog_audit.elements_score ?? 0 },
    };
  }
  if (r.audit_type === "product" && r.product_audit && Object.keys(r.product_audit).length) {
    return {
      label: "Product",
      audit: { found: r.product_audit.checks_found || {}, score: r.product_audit.checks_score ?? 0 },
    };
  }
  return { label: "", audit: null };
}
```

- [ ] **Step 2: Add the card to the Content tab**

In `app/detail/page.tsx`, find the Content tab's grid (around line 663):
```tsx
      {tab === "Content" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Content</h3>
```

Add this right before the `<Card>` opening (so the new card is the first thing in the Content tab when a vertical audit exists), keeping everything else in the block unchanged:
```tsx
      {tab === "Content" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(() => {
            const { label, audit } = verticalAuditFor(r);
            if (!audit) return null;
            return (
              <Card className="lg:col-span-2">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--seo-subheading)]">
                    Vertical Content Checks ({label})
                  </h3>
                  <span className="text-sm font-semibold text-[var(--seo-heading)]">
                    {audit.score}% complete
                  </span>
                </div>
                <HelpSection>
                  Structural checks specific to {label.toLowerCase()} pages, on top of the
                  standard 35-check audit. These findings also appear in the Issues tab.
                </HelpSection>
                <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  {Object.entries(audit.found).map(([name, found]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between border-b border-[var(--seo-border)] py-1.5 text-sm"
                    >
                      <span className="text-[var(--seo-text-light)]">{name}</span>
                      <BoolBadge ok={found} />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Content</h3>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add app/detail/page.tsx
git commit -m "Add Vertical Content Checks card to Detail page's Content tab (course/blog/product)"
```

---

### Task 8: Pre-push verification against the live edstellar.com sitemap

**Files:** none (verification only, no code changes)

**Interfaces:** none.

- [ ] **Step 1: Run the full local suite**

Run:
```bash
python -m pytest -q
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: pytest shows only the 3 pre-existing local-only `xlsxwriter` failures (documented in `WORK_REMAINING.md`); everything else passes/builds clean.

- [ ] **Step 2: Run the live edstellar.com integration test**

Run: `RUN_LIVE_TESTS=1 python -m pytest tests/test_sitewide_pipeline_live.py -v`
Expected: PASS. This audits 3 real edstellar.com URLs end-to-end (sitemap resolution → real fetch → full 35-check audit), proving the existing course/blog detection is unaffected by this change.

- [ ] **Step 3: Manually verify no real edstellar URL misclassifies as `product`**

Run this ad-hoc script (not committed; a one-off sanity check) to confirm the new `product` pattern has zero false positives against the full 2,461-URL live sitemap, not just the 32 spot-checked during design:
```bash
python -c "
from modules.sitemap_extractor import extract_sitemap_urls
from modules.auditor import detect_page_type

resolved = extract_sitemap_urls('https://www.edstellar.com/sitemap.xml', limit=5000)
urls = resolved['urls']
misclassified = [u for u in urls if detect_page_type(u, soup=None) == 'product']
print(f'{len(urls)} URLs checked, {len(misclassified)} misclassified as product')
for u in misclassified[:20]:
    print(' ', u)
"
```
Expected: `0 misclassified as product`. If any appear, add them as regression cases to `tests/test_auditor_page_type.py` and tighten the patterns in Task 2 before proceeding.

- [ ] **Step 4: Exercise `/seo-audit` and `/results` in the browser**

Using the `vercel-dev` preview (per this project's documented dev-server caveat: plain `next dev` 404s `/api/*.py`):
- Submit a real course URL from the sitemap (e.g. one from Step 3's `urls` list containing `/course/`) via the Single URL mode with Audit type "Auto-Detect".
- Confirm the Detail page's Content tab shows the new "Vertical Content Checks (Course)" card with sensible found/missing values.
- Go to `/results`, confirm the KPI band and per-URL table render with no console errors, and confirm the removed `/results-legacy` link is gone.

Expected: no console errors (check with the browser tools' `read_console_messages`), card renders with real data, no dead link.

- [ ] **Step 5: Final full-suite re-run and push**

```bash
python -m pytest -q
npm run build
git push
```
Expected: CI (`ci.yml`) passes on GitHub Actions; Vercel's Git integration deploys automatically (per the current deploy setup).

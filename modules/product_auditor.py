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

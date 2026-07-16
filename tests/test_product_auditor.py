"""Tests for modules.product_auditor.audit_product_page — product-page
vertical checks (schema, price, CTA, reviews, image alt text). Every case
asserts on the full returned dict shape, not just issue count."""

import json

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
        ("Missing Product Schema Markup", "Structured Data", "High"),
        ("Missing Price / Availability Information", "Product Content", "Medium"),
        ("Missing Add-to-Cart / Purchase CTA", "Product Content", "Medium"),
        ("Missing Review/Rating Markup", "Structured Data", "Low"),
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


def test_jsonld_blob_without_type_key_does_not_trigger_schema_found():
    # JSON-LD block parses fine but contains no @type key anywhere.
    # schema_found should be False, not True (old buggy behavior).
    html = """
    <html><body>
    <script type="application/ld+json">
    {"@context": "https://schema.org", "name": "Some Config", "somethingElse": "value"}
    </script>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    result = audit_product_page(soup, "https://example.com/product/no-type")

    assert result["schema_found"] is False
    assert result["has_product_schema"] is False


def test_deeply_nested_jsonld_does_not_raise_recursion_error():
    # A maliciously (or accidentally) deep/self-referential JSON-LD blob
    # should not crash the audit with RecursionError. No "@type" anywhere in
    # the blob (2000 levels, well past Python's default recursion limit and
    # the ~500-level threshold where the unguarded walkers actually crash),
    # so _has_type/_has_any_type/_schema_price all have to walk the FULL
    # depth without an early match to short-circuit on -- the worst case the
    # depth guard exists to prevent. A shallower blob with "@type" on the
    # outer dict would let has_type's Product check return immediately
    # without recursing at all, silently passing even without the guard.
    nested = {"leaf": True}
    for _ in range(2000):
        nested = {"child": nested}

    html = f"""
    <html><body>
    <script type="application/ld+json">
    {json.dumps(nested)}
    </script>
    </body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    result = audit_product_page(soup, "https://example.com/product/deep")

    assert isinstance(result, dict)
    assert "issues" in result
    assert result["has_product_schema"] is False
    assert result["price_found"] is False

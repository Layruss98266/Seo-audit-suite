"""Tests for the stateless tools ported from SEO-Suite into modules/seo_suite.

Everything here is offline: the schema/robots generators are pure, and the
keyword-research credential guard returns before any network call. No test
hits a live site or the DataForSEO API.
"""

from modules.seo_suite import generators, keyword_research


def test_generate_faq_schema_produces_jsonld():
    result = generators.generate_schema(
        "faq",
        {"faq_items": [{"question": "What is SEO?", "answer": "Search engine optimization."}]},
    )
    assert result["ok"] is True
    assert "application/ld+json" in result["markup"]
    assert result["json"]["@type"] == "FAQPage"


def test_generate_schema_rejects_unknown_type():
    result = generators.generate_schema("not-a-real-type", {})
    assert result["ok"] is False
    assert "error" in result


def test_get_schema_fields_returns_field_list():
    result = generators.get_schema_fields("article")
    assert result["ok"] is True
    assert len(result["fields"]) > 0


def test_generate_robots_txt_ok():
    result = generators.generate_robots_txt({"allowAll": True})
    assert result["ok"] is True


def test_keyword_research_requires_credentials():
    # With empty creds it must fail fast (before any network call) and say so.
    result = keyword_research.research_keywords(["seo"], "", "")
    assert result["ok"] is False
    assert "credentials" in result["error"].lower()

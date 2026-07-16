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

    # app/detail/page.tsx's Detail-page card consumes checks_found/checks_score
    # from this same dict; guard against a future rename silently breaking it.
    assert isinstance(result["product_audit"]["checks_found"], dict)
    assert isinstance(result["product_audit"]["checks_score"], (int, float))


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

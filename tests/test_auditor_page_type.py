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

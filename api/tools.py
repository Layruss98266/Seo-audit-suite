"""Consolidated Vercel serverless endpoint for the ported SEO-Suite tools.

Mirrors the single-function-with-action-dispatch pattern used by api/ai.py:
one deployed function keeps Vercel's per-function `pip install` count low
while still exposing several distinct tools. Callers POST to /api/tools with
a JSON body containing an "action" field plus that action's parameters.

Actions:
  generate-schema   {schemaType, data}          -> JSON-LD markup
  schema-fields     {schemaType}                 -> field definitions for a form
  generate-robots   {data}                       -> robots.txt text
  generate-sitemap  {data}                       -> sitemap.xml text
  generate-hreflang {data}                       -> hreflang <link> tags
  generate-meta     {data}                       -> meta/OG/Twitter tags
  validate-schema   {url}                        -> structured-data validation
  page-type         {url}                        -> page-type classification
  keyword-research  {keywords, mode?, limit?, location?, language?}
                                                 -> DataForSEO keyword metrics

All handlers are stateless (no DB, no auth, no background jobs) so they run
cleanly on Vercel's Python runtime.
"""

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules._http import read_json_body, require_str, send_json  # noqa: E402
from modules.seo_suite import generators, keyword_research, page_type, schema_validator  # noqa: E402

logger = logging.getLogger(__name__)


def _handle_generate_schema(handler, payload):
    schema_type = require_str(handler, payload, "schemaType", "schema_type", field_name="schemaType")
    if schema_type is None:
        return
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    result = generators.generate_schema(schema_type, data)
    send_json(handler, 200 if result.get("ok") else 400, result)


def _handle_schema_fields(handler, payload):
    schema_type = require_str(handler, payload, "schemaType", "schema_type", field_name="schemaType")
    if schema_type is None:
        return
    result = generators.get_schema_fields(schema_type)
    send_json(handler, 200 if result.get("ok") else 400, result)


def _run_generator(handler, fn, data, label):
    """Run a generator on `data`, mapping any malformed-input crash to a clean
    400 instead of a 500. The generators only catch (ValueError, TypeError), so
    e.g. a list of scalars where dicts are expected raises AttributeError — a
    client error, not a server fault."""
    try:
        result = fn(data)
        send_json(handler, 200 if result.get("ok") else 400, result)
    except Exception:  # noqa: BLE001
        logger.exception("%s failed", label)
        send_json(handler, 400, {"ok": False, "error": f"Invalid input for {label}."})


def _handle_generate_robots(handler, payload):
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    _run_generator(handler, generators.generate_robots_txt, data, "generate-robots")


def _handle_generate_sitemap(handler, payload):
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    _run_generator(handler, generators.generate_sitemap, data, "generate-sitemap")


def _handle_generate_hreflang(handler, payload):
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    _run_generator(handler, generators.generate_hreflang, data, "generate-hreflang")


def _handle_generate_meta(handler, payload):
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    _run_generator(handler, generators.generate_meta_tags, data, "generate-meta")


def _handle_validate_schema(handler, payload):
    url = require_str(handler, payload, "url", field_name="url")
    if url is None:
        return
    try:
        result = schema_validator.validate_url(url)
        send_json(handler, 200, result)
    except Exception:  # noqa: BLE001
        logger.exception("validate-schema failed")
        send_json(handler, 500, {"ok": False, "error": "Internal error while validating structured data."})


def _handle_page_type(handler, payload):
    url = require_str(handler, payload, "url", field_name="url")
    if url is None:
        return
    try:
        result = page_type.detect_page_type(url)
        send_json(handler, 200, result)
    except Exception:  # noqa: BLE001
        logger.exception("page-type failed")
        send_json(handler, 500, {"ok": False, "error": "Internal error while classifying the page."})


def _handle_keyword_research(handler, payload):
    raw = payload.get("keywords")
    if isinstance(raw, str):
        keywords = [raw]
    elif isinstance(raw, list):
        keywords = [str(k) for k in raw]
    else:
        keywords = []
    if not any(k.strip() for k in keywords):
        send_json(handler, 400, {"ok": False, "error": "Enter at least one keyword."})
        return

    # Credentials come from the request body first (Settings UI), then env.
    login = (payload.get("dataforseoLogin") or os.environ.get("DATAFORSEO_LOGIN") or "").strip()
    password = (payload.get("dataforseoPassword") or os.environ.get("DATAFORSEO_PASSWORD") or "").strip()

    # Coerce numeric params up-front so bad input is a clean 400, not a 500.
    try:
        location_code = int(payload.get("location") or 2840)
        limit = int(payload.get("limit") or 150)
    except (TypeError, ValueError):
        send_json(handler, 400, {"ok": False, "error": "location and limit must be numbers."})
        return

    try:
        result = keyword_research.research_keywords(
            keywords,
            login,
            password,
            location_code=location_code,
            language_code=(payload.get("language") or "en"),
            limit=limit,
            mode=(payload.get("mode") or "auto"),
        )
        send_json(handler, 200 if result.get("ok") else 400, result)
    except Exception:  # noqa: BLE001
        logger.exception("keyword-research failed")
        send_json(handler, 500, {"ok": False, "error": "Internal error while researching keywords."})


_ACTIONS = {
    "generate-schema": _handle_generate_schema,
    "schema-fields": _handle_schema_fields,
    "generate-robots": _handle_generate_robots,
    "generate-sitemap": _handle_generate_sitemap,
    "generate-hreflang": _handle_generate_hreflang,
    "generate-meta": _handle_generate_meta,
    "validate-schema": _handle_validate_schema,
    "page-type": _handle_page_type,
    "keyword-research": _handle_keyword_research,
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Lightweight discovery endpoint: lists the available actions and
        # whether the optional DataForSEO keyword-research keys are configured.
        send_json(self, 200, {
            "ok": True,
            "actions": sorted(_ACTIONS),
            "dataforseoConfigured": bool(
                os.environ.get("DATAFORSEO_LOGIN") and os.environ.get("DATAFORSEO_PASSWORD")
            ),
        })

    def do_POST(self):
        try:
            payload = read_json_body(self)
        except (json.JSONDecodeError, ValueError):
            # Malformed request body is a client error, not a server fault.
            send_json(self, 400, {"ok": False, "error": "Malformed JSON request body."})
            return
        except Exception:  # noqa: BLE001
            logger.exception("tools.py request body could not be parsed")
            send_json(self, 500, {"ok": False, "error": "Internal error while processing the request."})
            return

        action = payload.get("action")
        fn = _ACTIONS.get(action)
        if fn is None:
            send_json(self, 400, {"ok": False, "error": f"Unknown or missing action (expected one of {sorted(_ACTIONS)})"})
            return
        fn(self, payload)

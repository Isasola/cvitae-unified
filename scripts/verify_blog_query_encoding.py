"""Offline regression for PostgREST query encoding in the blog draft generator."""
from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def main() -> int:
    with patch.dict(os.environ, {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-key",
        "GEMINI_API_KEY": "test-key",
    }):
        sys.modules.pop("generate_blog_posts", None)
        blog = importlib.import_module("generate_blog_posts")
        response = Mock(ok=True)
        response.json.return_value = []
        with patch.object(blog.requests, "get", return_value=response) as get:
            assert blog.draft_exists("a" * 64) is False
        kwargs = get.call_args.kwargs
        assert "?" not in get.call_args.args[0]
        assert kwargs["params"]["metadata->>topic_fingerprint"] == "eq." + ("a" * 64)
        assert kwargs["params"]["tipo"] == "eq.blog"

        rows = [
            {"id": "py", "title": "Convocatoria PY", "source": "trusted", "country_code": "PY", "eligible_countries": [], "application_url": "https://jobs.example/py", "deadline": "2026-12-31", "opportunity_type": "job"},
            {"id": "remote-ambiguous", "title": "Remote global", "source": "trusted", "country_code": None, "eligible_countries": [], "application_url": "https://jobs.example/remote", "deadline": "2026-12-31", "opportunity_type": "job"},
            {"id": "remote-py", "title": "Remote Paraguay", "source": "trusted", "country_code": None, "eligible_countries": ["PY"], "application_url": "https://jobs.example/remote-py", "deadline": "2026-12-31", "opportunity_type": "job"},
            {"id": "expired", "title": "Expired", "source": "trusted", "country_code": "PY", "eligible_countries": [], "application_url": "https://jobs.example/expired", "deadline": "2020-01-01", "opportunity_type": "job"},
            {"id": "bad-url", "title": "No original", "source": "trusted", "country_code": "PY", "eligible_countries": [], "application_url": "javascript:alert(1)", "deadline": "2026-12-31", "opportunity_type": "job"},
        ]
        calls = []
        def canonical_view(table, params=None, range_start=None, range_end=None):
            calls.append((table, range_start, range_end, params))
            return rows if table == "opportunity_catalog_universe" else rows[:3]
        with patch.object(blog, "sb_get", side_effect=canonical_view):
            filtered = blog.get_ss_opportunities()
        assert [row["id"] for row in filtered] == ["py", "remote-py"], "canonical Catalog ∩ SEO views, explicit PY eligibility, original link, and expiry gates all apply"
        assert {call[0] for call in calls} == {"opportunity_catalog_universe", "opportunity_seo_universe"}
        assert all(call[1:] == (0, 999, call[3]) for call in calls), "first page uses a bounded explicit Range"

        article = {"titulo": "Convocatorias", "slug": "convocatorias", "cuerpo": "Verificá cada ficha."}
        with patch.object(blog, "sb_post") as post:
            fingerprint, ids = blog.topic_fingerprint("oportunidades", rows[:1])
            blog.save_draft(article, "trusted", "oportunidades", rows[:1], fingerprint, ids)
        draft = post.call_args.args[1]
        assert draft["is_active"] is False
        assert draft["metadata"]["approval"]["status"] == "PENDING_REVIEW"
        assert "https://jobs.example/py" in draft["cuerpo"]
        assert draft["metadata"]["source_opportunity_ids"] == ["py"]

        unavailable = Mock(status_code=404, ok=False, text='{"error":"model not found"}')
        fallback = Mock(status_code=200, ok=True)
        fallback.json.return_value = {"candidates": [{"content": {"parts": [{"text": json.dumps(article)}]}}]}
        with patch.object(blog.requests, "post", side_effect=[unavailable, fallback]) as generate:
            text = blog.call_gemini("fixture only")
        assert "titulo" in text and generate.call_count == 2
    print("verify_blog_query_encoding: PASS canonical-view-intersection, PY eligibility, expiry, original URL, fingerprint dedupe")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

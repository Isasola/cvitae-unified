"""Offline regression for PostgREST query encoding in the blog draft generator."""
from __future__ import annotations

import importlib
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
            assert blog.already_ran_this_week() is False
        kwargs = get.call_args.kwargs
        assert "?" not in get.call_args.args[0]
        assert "+00:00" in kwargs["params"]["created_at"]
        assert kwargs["params"]["created_at"].startswith("gte.")
    print("verify_blog_query_encoding: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

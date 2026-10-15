"""Offline guard checks for review-only blog draft automation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    workflow = (ROOT / ".github/workflows/blog_generator.yml").read_text(encoding="utf-8")
    generator = (ROOT / "scripts/generate_blog_posts.py").read_text(encoding="utf-8")
    assert "schedule:" in workflow and "cron: '0 11 * * 0'" in workflow
    assert "CVITAE_BLOG_DRAFTS_ENABLED == 'true'" in workflow
    assert "CVITAE_BLOG_DRAFTS_CERTIFIED == 'true'" in workflow
    assert "vars.CVITAE_BLOG_MODEL" in workflow and "vars.CVITAE_BLOG_FALLBACK_MODEL" in workflow
    assert "CVITAE_PROD_RELEASE_VALIDATED" not in workflow, "blog drafts must not depend on the global legacy-flock gate"
    assert "github.event_name == 'workflow_dispatch' ||" not in workflow, "manual dispatch cannot bypass the feature gate"
    assert "concurrency:" in workflow and "cancel-in-progress: false" in workflow
    assert '"is_active": False' in generator
    assert '"status": "PENDING_REVIEW"' in generator
    assert 'opportunity_catalog_universe' in generator and 'opportunity_seo_universe' in generator
    assert 'web_catalog_allowed' not in generator and 'search_engine_indexing_allowed' not in generator
    assert "topic_fingerprint" in generator and "source_opportunity_ids" in generator
    assert "gemini-2.0-flash" not in generator
    assert "GEMINI_MODEL" in generator and "GEMINI_FALLBACK_MODEL" in generator
    print("verify_blog_workflow_contract: PASS independent schedule behind dedicated enable+certification gates; no dispatch bypass; drafts remain editorially pending")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

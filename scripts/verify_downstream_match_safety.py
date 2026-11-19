"""Ensure low-confidence/unknown-eligibility matches cannot create skill gaps."""
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    batch = (root / 'supabase/functions/match-batch/index.ts').read_text(encoding='utf-8')
    dashboard = (root / 'src/hub/Dashboard.tsx').read_text(encoding='utf-8')
    assert "downstreamTrusted: breakdown.confidence === 'HIGH'" in batch
    assert "breakdown.evidence.eligibilitySignal === 'ELIGIBLE'" in batch
    assert 'ranked.filter((match)=>match.downstreamTrusted)' in batch
    assert 'matches.filter(m => m.downstreamTrusted === true)' in dashboard
    print('verify_downstream_match_safety: PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

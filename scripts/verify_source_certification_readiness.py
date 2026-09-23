"""Offline certification/provenance contract; no source access or policy mutation."""
import sys
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT / 'scrapers'))
from source_registry_v2 import resolve_emitted_source, certification, registry_snapshot

snapshot = registry_snapshot()
by_source = {row['canonical_source']: row for row in snapshot['sources']}
assert resolve_emitted_source('oyaop').source == 'oya'
assert by_source['unjobs']['certified'] is True
assert by_source['weworkremotely']['certified'] is False
for source in ('opportunitydesk', 'oya', 'eu_delegation_paraguay', 'computrabajo'):
    assert by_source[source]['adapter_version'] == 'unvalidated'
    assert by_source[source]['distribution_policy']['web_catalog_allowed'] is False
h = by_source['himalayas']
assert h['distribution_policy']['google_jobs_distribution_allowed'] is False
assert h['distribution_policy']['third_party_job_distribution_allowed'] is False
assert h['distribution_policy']['source_attribution_required'] is True

# PRE-51 candidate migration contract: only the currently certified, AUTO
# UNJobs profile is enabled. Historical FALSE flags are not source-term proof;
# unvalidated/uncertified candidates remain review-only. This is a static,
# deterministic check and never mutates policy or production.
migration = (ROOT / 'supabase/migrations/202609200003_approved_source_distribution_candidates.sql').read_text(encoding='utf-8')
updates = re.findall(r"(?im)^\s*update\s+public\.opportunity_sources[\s\S]*?\bwhere\s+source\s*=\s*'([^']+)'\s*;", migration)
assert updates == ['unjobs'], updates
for token in ('web_catalog_allowed = true', 'search_engine_indexing_allowed = true', 'is_enabled = true', 'catalog_enabled = true', 'matching_enabled = true', 'alerts_enabled = true', 'seo_enabled = true'):
    assert token in migration, token
for source in ('computrabajo', 'weworkremotely', 'eu_delegation_paraguay', 'opportunitydesk', 'oya', 'himalayas'):
    assert not re.search(rf"(?im)^\s*update\s+public\.opportunity_sources[\s\S]*?\bwhere\s+source\s*=\s*'{re.escape(source)}'", migration), source
assert 'google_jobs_distribution_allowed' not in migration and 'third_party_job_distribution_allowed' not in migration
assert by_source['unjobs']['certified'] is True and by_source['unjobs']['auto_enabled'] is True
for source in ('computrabajo', 'weworkremotely', 'eu_delegation_paraguay', 'opportunitydesk', 'oya'):
    assert by_source[source]['certified'] is False, source
print('verify_source_certification_readiness: PASS')

# Known source coverage gaps

This is a narrow static diagnostic list for the next collection tranche, not a source inventory.

| source | issue | status | next_fix |
| --- | --- | --- | --- |
| jooble | API was invoked only for page 1 | CONFIRMED_LIMIT | paginate until empty/repeated identities |
| workday_multinacionales | Workday request used `offset=0`, `limit=20` only | CONFIRMED_LIMIT | advance offset until short page |
| opportunitydesk | category walk is capped at 3 pages | CONFIRMED_LIMIT | make continuation explicit |
| computrabajo | category walk is capped at 5 pages | CONFIRMED_LIMIT | make continuation explicit |
| buscojobs | loop is fixed to pages 1-5 | CONFIRMED_LIMIT | continue to natural exhaustion |
| arbeitnow | loop is fixed to pages 1-10 | CONFIRMED_LIMIT | use provider continuation |
| becal | listing walk is capped at 3 pages | CONFIRMED_LIMIT | continue until empty |
| zonajobs / trabajos.com.py | listing walk is capped at 5 pages | CONFIRMED_LIMIT | continue until empty |
| jobicy | requests 50 per industry without continuation | CONFIRMED_LIMIT | inspect provider continuation |
| oya | homepage-only extraction | UNKNOWN | establish whether an inventory exists |
| snj / mitic / innovando / ucom / empleapy | configured WordPress `per_page` limits | UNKNOWN | inspect `X-WP-TotalPages` before changing |
| scrapers workflow | 81 sequential steps under a 60-minute job timeout | CONFIRMED_LIMIT | shard/matrix only in a dedicated workflow-scale change |
| write collectors | production Supabase URL fallback literals | CONFIRMED_LIMIT | require explicit URL or audit/local default in a dedicated security pass |

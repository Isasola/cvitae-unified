# CVitae Working Principles

This is the system-reasoning constitution for work on CVitae. It is not a
style guide.

## 1. Think in systems, not components

For substantial work reason through:

UPSTREAM
→ INPUT
→ TRANSFORMATION
→ PERSISTENCE
→ POLICY
→ DOWNSTREAM CONSUMERS
→ USER/OPERATOR RESULT
→ OBSERVABILITY
→ FAILURE
→ RECOVERY

A component passing tests does not imply the system works.

PART WORKING != SYSTEM WORKING.

## 2. Intent is larger than the literal example

Examples, fixtures and current counts do not define the universe. Always
separate:

- EXAMPLE
- TEST FIXTURE
- CURRENT OBSERVATION
- SYSTEM UNIVERSE
- ACCEPTANCE CRITERION

## 3. Test fixture != product universe

A fixture proves a property. It never defines production scope.

## 4. Define the invariant before implementation

Before substantial work define what must be true when finished.

## 5. Determine the complete universe

For bulk, pipeline and data work determine the entire applicable universe.
Never silently equate first page, first 500, first 1,000, current inventory
count or top N with the complete universe.

Separate DISCOVERY COVERAGE from PROCESSING BUDGET.

## 6. Always think historical + future

Every pipeline repair must consider:

A. historical persisted state;
B. future automatic ingestion.

A backfill does not prove future correctness. A future-path fix does not
repair historical data.

## 7. Validation order

CONNECTIVITY
→ COVERAGE
→ CORRECTNESS
→ QUALITY

## 8. Data must survive end to end

When a field exists upstream, trace whether it survives:

extraction → adapter → normalization → persistence → policy → consumer.

Do not silently replace missing data with guesses.

## 9. Preserve critical separations

- Source permission ≠ row readiness ≠ effective consumer permission.
- Source enabled ≠ consumer enabled ≠ row routable.
- Catalog ≠ matching ≠ alerts ≠ SEO ≠ AEO ≠ GEO ≠ JobPosting ≠ Google Jobs.
- SEO readiness ≠ SEO operational state ≠ search-engine permission.
- Job location ≠ candidate eligibility ≠ work arrangement.
- Remote ≠ worldwide.
- UNKNOWN ≠ TRUE ≠ FALSE ≠ SUCCESS.
- Queued ≠ running ≠ success.
- Discovered ≠ attempted ≠ submitted ≠ inserted.
- Tested locally ≠ deployed ≠ verified in production.

## 10. Fail closed when truth is unknown

Never invent Paraguay, eligibility, remote scope, organization, location,
salary or other factual values merely to make a downstream consumer pass.

## 11. Observability is part of the system

Admin and diagnostics should help identify where a cable broke instead of
forcing manual archaeology.

## 12. Operator actions need safe lifecycle

For meaningful operations consider:

preview → apply → progress → result → failure → retry/resume → audit.

## 13. Reuse existing systems

Do not create parallel tools, duplicate truth systems or separate SEO/AEO/GEO
data pipelines when the existing Opportunity Truth, Registry or routing
architecture can own the concern.

## 14. Do not re-audit closed work without evidence

Reuse previous PASS evidence unless the current change affects that contract
or there is concrete regression evidence.

## 15. Evidence levels must remain honest

Keep distinctions such as:

- LOCAL
- FIXTURE
- RC
- READ_ONLY_PROD
- PROD_VALIDATED
- PROD_VALIDATION_PENDING

Never promote local or fixture evidence into production evidence.

## 16. Completion format

For substantial checkpoints report:

CHECKPOINT
STATUS
EVIDENCE
PROD PENDING when applicable
NEXT

Do not renumber the master checklist.

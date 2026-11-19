/**
 * matching-harness.ts — Shadow Matching V2 Evaluation Harness
 *
 * Runs OLD and V2 (6 individual configs + V2-FULL) against the Gold Standard.
 * Reports: precision metrics, MUST_MATCH / MUST_REJECT pass/fail, delta scores.
 *
 * NO prod connection. NO mutations. In-memory only.
 *
 * Run: npx tsx scripts/matching-harness.ts
 */

import {
  buildDefaultDictionary,
  isEligibleForProfile,
  rankOpportunities,
} from '../supabase/functions/_shared/matching.ts'

import {
  V2_PRESET_A, V2_PRESET_B, V2_PRESET_C,
  V2_PRESET_D, V2_PRESET_E, V2_PRESET_F, V2_PRESET_FULL,
  rankOpportunitiesV2,
  type V2Config,
  type V2RankResult,
} from '../supabase/functions/_shared/matching-v2.ts'

import {
  CANDIDATES,
  EXPECTATIONS,
  OPPORTUNITIES,
  goldOppToMatchOpp,
  type GoldCandidate,
  type GoldExpectation,
} from './matching-gold-standard.ts'

// ─── Setup ────────────────────────────────────────────────────────────────────

const dictionary = buildDefaultDictionary()

const allOpps = Object.values(OPPORTUNITIES).map(goldOppToMatchOpp)

function makeProfile(c: GoldCandidate) {
  return {
    professional_title: c.professional_title,
    profile_data: {
      habilidades: c.profile_data.habilidades,
      seniority: c.profile_data.seniority ?? '',
      location: c.profile_data.location,
      career_route: c.profile_data.career_route ?? '',
    },
  }
}

// ─── Precision helpers ────────────────────────────────────────────────────────

function precisionAt(ranked: any[], k: number, relevant: Set<string>): number {
  const top = ranked.slice(0, k)
  const hits = top.filter(m => relevant.has(m.id ?? m.opp?.id)).length
  return top.length ? hits / top.length : 0
}

function pct(n: number) { return `${(n * 100).toFixed(0)}%` }

// ─── Run OLD baseline ─────────────────────────────────────────────────────────

interface CandidateBaselineResult {
  candidateKey: string
  rankedIds: string[]
  scores: Map<string, number>
  expectationResults: Array<{ exp: GoldExpectation; pass: boolean; score: number | null; rank: number | null }>
  mustMatchFails: string[]
  mustRejectFails: string[]
  precision: { p3: number; p5: number; p10: number; p20: number }
}

function runOldBaseline(candidateKey: string): CandidateBaselineResult {
  const candidate = CANDIDATES[candidateKey]
  const profile = makeProfile(candidate)
  const exps = EXPECTATIONS.filter(e => e.candidateKey === candidateKey)

  const { eligible, ranked } = rankOpportunities(profile, allOpps, dictionary)
  const rankedIds = ranked.map((r: any) => r.id)
  const scores = new Map(ranked.map((r: any) => [r.id, r.finalScore]))

  const mustMatchIds = new Set(exps.filter(e => e.expected === 'MUST_MATCH').map(e => e.opportunityId))
  const mustRejectIds = new Set(exps.filter(e => e.expected === 'MUST_REJECT').map(e => e.opportunityId))

  const eligibleIds = new Set(eligible.map((o: any) => o.id))

  const expectationResults = exps.map(exp => {
    const id = exp.opportunityId
    const rank = rankedIds.indexOf(id)
    const score = scores.get(id) ?? null
    const inRanked = rank !== -1

    let pass: boolean
    if (exp.expected === 'MUST_MATCH') {
      pass = inRanked && (score ?? 0) >= 50
    } else if (exp.expected === 'MUST_REJECT') {
      // Hard filters: if not in eligible at all → pass
      // If in eligible but in ranked with high score → fail
      const inEligible = eligibleIds.has(id)
      if (!inEligible) pass = true // hard-filtered
      else pass = !inRanked || (score ?? 0) < 35
    } else { // BORDERLINE
      pass = true // borderline is informational
    }

    return { exp, pass, score, rank: rank === -1 ? null : rank + 1 }
  })

  const mustMatchFails = expectationResults
    .filter(r => r.exp.expected === 'MUST_MATCH' && !r.pass)
    .map(r => r.exp.opportunityId)

  const mustRejectFails = expectationResults
    .filter(r => r.exp.expected === 'MUST_REJECT' && !r.pass)
    .map(r => r.exp.opportunityId)

  const p3 = precisionAt(ranked, 3, mustMatchIds)
  const p5 = precisionAt(ranked, 5, mustMatchIds)
  const p10 = precisionAt(ranked, 10, mustMatchIds)
  const p20 = precisionAt(ranked, 20, mustMatchIds)

  return { candidateKey, rankedIds, scores, expectationResults, mustMatchFails, mustRejectFails, precision: { p3, p5, p10, p20 } }
}

// ─── Run V2 config ────────────────────────────────────────────────────────────

interface V2CandidateResult {
  candidateKey: string
  configLabel: string
  rankedV2Ids: string[]
  v2Scores: Map<string, number>
  oldScores: Map<string, number>
  expectationResults: Array<{ exp: GoldExpectation; pass: boolean; v2Score: number | null; oldScore: number | null; delta: number | null; rank: number | null }>
  mustMatchFails: string[]
  mustRejectFails: string[]
  regressions: string[]
  improvements: string[]
  precision: { p3: number; p5: number; p10: number; p20: number }
}

function runV2Config(candidateKey: string, cfg: V2Config, label: string, baseline: CandidateBaselineResult): V2CandidateResult {
  const candidate = CANDIDATES[candidateKey]
  const profile = makeProfile(candidate)
  const exps = EXPECTATIONS.filter(e => e.candidateKey === candidateKey)

  const { eligible, rankedV2 } = rankOpportunitiesV2(profile, allOpps, dictionary, cfg)
  const rankedV2Ids = rankedV2.map(r => r.opp.id)
  const v2Scores = new Map(rankedV2.map(r => [r.opp.id, r.v2Score]))
  const oldScoresMap = new Map(rankedV2.map(r => [r.opp.id, r.oldScore]))
  // Also include non-ranked old scores from baseline
  for (const [id, score] of baseline.scores) oldScoresMap.set(id, score)

  const mustMatchIds = new Set(exps.filter(e => e.expected === 'MUST_MATCH').map(e => e.opportunityId))
  const mustRejectIds = new Set(exps.filter(e => e.expected === 'MUST_REJECT').map(e => e.opportunityId))
  const eligibleIds = new Set(eligible.map((o: any) => o.id))

  const expectationResults = exps.map(exp => {
    const id = exp.opportunityId
    const rank = rankedV2Ids.indexOf(id)
    const v2Score = v2Scores.get(id) ?? null
    const oldScore = baseline.scores.get(id) ?? null
    const delta = v2Score != null && oldScore != null ? v2Score - oldScore : null

    let pass: boolean
    if (exp.expected === 'MUST_MATCH') {
      pass = rank !== -1 && (v2Score ?? 0) >= 50
    } else if (exp.expected === 'MUST_REJECT') {
      const inEligible = eligibleIds.has(id)
      if (!inEligible) pass = true
      else pass = rank === -1 || (v2Score ?? 0) < 35
    } else {
      pass = true
    }

    return { exp, pass, v2Score, oldScore, delta, rank: rank === -1 ? null : rank + 1 }
  })

  const mustMatchFails = expectationResults
    .filter(r => r.exp.expected === 'MUST_MATCH' && !r.pass)
    .map(r => r.exp.opportunityId)

  const mustRejectFails = expectationResults
    .filter(r => r.exp.expected === 'MUST_REJECT' && !r.pass)
    .map(r => r.exp.opportunityId)

  // Regressions: V2 made a MUST_MATCH that was passing in OLD, now fail in V2
  const oldPassingMatches = baseline.expectationResults
    .filter(r => r.exp.expected === 'MUST_MATCH' && r.pass)
    .map(r => r.exp.opportunityId)
  const regressions = mustMatchFails.filter(id => oldPassingMatches.includes(id))

  // Improvements: MUST_REJECT that was failing OLD, now passing V2
  const oldFailingRejects = baseline.expectationResults
    .filter(r => r.exp.expected === 'MUST_REJECT' && !r.pass)
    .map(r => r.exp.opportunityId)
  const improvements = oldFailingRejects.filter(id => !mustRejectFails.includes(id))

  const p3 = precisionAt(rankedV2.map(r => ({ id: r.opp.id })), 3, mustMatchIds)
  const p5 = precisionAt(rankedV2.map(r => ({ id: r.opp.id })), 5, mustMatchIds)
  const p10 = precisionAt(rankedV2.map(r => ({ id: r.opp.id })), 10, mustMatchIds)
  const p20 = precisionAt(rankedV2.map(r => ({ id: r.opp.id })), 20, mustMatchIds)

  return {
    candidateKey,
    configLabel: label,
    rankedV2Ids,
    v2Scores,
    oldScores: oldScoresMap,
    expectationResults,
    mustMatchFails,
    mustRejectFails,
    regressions,
    improvements,
    precision: { p3, p5, p10, p20 },
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printSeparator() { console.log('─'.repeat(70)) }

function printCandidateBaseline(r: CandidateBaselineResult) {
  const c = CANDIDATES[r.candidateKey]
  console.log(`\n  ${c.professional_title} [${r.candidateKey}]`)
  console.log(`    OLD P@3=${pct(r.precision.p3)} P@5=${pct(r.precision.p5)} P@10=${pct(r.precision.p10)} P@20=${pct(r.precision.p20)}`)
  console.log(`    MUST_MATCH fails: ${r.mustMatchFails.length === 0 ? '✓ none' : r.mustMatchFails.join(', ')}`)
  console.log(`    MUST_REJECT fails: ${r.mustRejectFails.length === 0 ? '✓ none' : r.mustRejectFails.join(', ')}`)

  // Show expectation results for this candidate
  for (const er of r.expectationResults) {
    if (er.exp.expected === 'BORDERLINE') continue
    const mark = er.pass ? '✓' : '✗'
    const score = er.score ?? '—'
    const rank = er.rank != null ? `rank ${er.rank}` : 'not ranked'
    console.log(`    [${mark}] ${er.exp.expected} ${er.exp.opportunityId} score=${score} (${rank})`)
  }
}

function printV2Config(r: V2CandidateResult, baseline: CandidateBaselineResult) {
  const change = (v2: number, old: number) => {
    const d = v2 - old
    if (d === 0) return '→'
    return d > 0 ? `↑${d}` : `↓${Math.abs(d)}`
  }

  console.log(`\n    ${r.configLabel}: P@3=${pct(r.precision.p3)} P@5=${pct(r.precision.p5)} P@10=${pct(r.precision.p10)}`)
  if (r.regressions.length > 0) {
    console.log(`    ⚠  REGRESSIONS: ${r.regressions.join(', ')}`)
  }
  if (r.improvements.length > 0) {
    console.log(`    ✓  IMPROVEMENTS: ${r.improvements.join(', ')}`)
  }

  // Show score deltas for expectation pairs
  for (const er of r.expectationResults) {
    if (er.exp.expected === 'BORDERLINE') continue
    const mark = er.pass ? '✓' : '✗'
    const v2s = er.v2Score ?? '—'
    const olds = er.oldScore ?? '—'
    const d = er.delta != null ? change(er.v2Score!, er.oldScore!) : ''
    console.log(`      [${mark}] ${er.exp.expected} ${er.exp.opportunityId} old=${olds} v2=${v2s} ${d}`)
  }
}

// ─── DISPLAY THRESHOLD CALIBRATION ───────────────────────────────────────────

function calibrateDisplayThreshold(allV2Full: V2CandidateResult[]) {
  console.log('\n\n=== DISPLAY THRESHOLD CALIBRATION (V2-FULL) ===\n')
  console.log('Threshold | MUST_MATCH hidden | MUST_REJECT shown | Recommendation')
  console.log('----------|-------------------|-------------------|---------------')

  for (const threshold of [25, 30, 35, 40, 45, 50]) {
    let mustMatchHidden = 0
    let mustRejectShown = 0

    for (const result of allV2Full) {
      const exps = EXPECTATIONS.filter(e => e.candidateKey === result.candidateKey)
      for (const exp of exps) {
        const v2Score = result.v2Scores.get(exp.opportunityId) ?? 0
        if (exp.expected === 'MUST_MATCH' && v2Score < threshold) mustMatchHidden++
        if (exp.expected === 'MUST_REJECT' && v2Score >= threshold) mustRejectShown++
      }
    }

    const rec = mustMatchHidden === 0 && mustRejectShown <= 2 ? '← recommend'
      : mustMatchHidden > 0 ? 'hides matches'
      : 'too permissive'

    console.log(`    ${threshold}     |         ${String(mustMatchHidden).padEnd(11)}|         ${String(mustRejectShown).padEnd(11)}| ${rec}`)
  }
}

// ─── TOP 3 FREE ANALYSIS ──────────────────────────────────────────────────────

function analyzeTop3Free(allV2Full: V2CandidateResult[]) {
  console.log('\n=== TOP 3 FREE BEHAVIOR ===\n')
  for (const result of allV2Full) {
    const candidate = CANDIDATES[result.candidateKey]
    const top3 = result.rankedV2Ids.slice(0, 3)
    const mustMatchIds = new Set(
      EXPECTATIONS.filter(e => e.candidateKey === result.candidateKey && e.expected === 'MUST_MATCH')
        .map(e => e.opportunityId)
    )
    const genuineInTop3 = top3.filter(id => mustMatchIds.has(id)).length
    const fillerInTop3 = 3 - top3.filter(id => mustMatchIds.has(id)).length

    console.log(`  ${candidate.professional_title}:`)
    console.log(`    Top 3: ${top3.join(', ')}`)
    console.log(`    Genuine matches in top 3: ${genuineInTop3}/3`)
    if (fillerInTop3 > 0 && genuineInTop3 < 3) {
      const fillerScores = top3.filter(id => !mustMatchIds.has(id)).map(id => result.v2Scores.get(id) ?? '?')
      console.log(`    ⚠ Filler positions: ${fillerInTop3} (scores: ${fillerScores.join(', ')})`)
      console.log(`    → Recommendation: show ${genuineInTop3} (not forced 3) if filler score < threshold`)
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║     MATCHING V2 EVALUATION HARNESS — Gold Standard           ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

// ── Phase 1: OLD baseline ──────────────────────────────────────────────────

console.log('=== PHASE 1: OLD MATCHING BASELINE ===\n')

const candidateKeys = Object.keys(CANDIDATES)
const baselines: Map<string, CandidateBaselineResult> = new Map()

for (const key of candidateKeys) {
  const b = runOldBaseline(key)
  baselines.set(key, b)
  printCandidateBaseline(b)
}

printSeparator()

// Summary
const totalMustMatchOld = EXPECTATIONS.filter(e => e.expected === 'MUST_MATCH').length
const totalMustRejectOld = EXPECTATIONS.filter(e => e.expected === 'MUST_REJECT').length
const passMustMatchOld = [...baselines.values()].reduce((acc, b) => acc + (b.mustMatchFails.length === 0 ? 1 : 0), 0)
const allMustMatchFailsOld = [...baselines.values()].flatMap(b => b.mustMatchFails)
const allMustRejectFailsOld = [...baselines.values()].flatMap(b => b.mustRejectFails)

console.log(`\nOLD BASELINE SUMMARY:`)
console.log(`  MUST_MATCH fails: ${allMustMatchFailsOld.length}/${totalMustMatchOld}`)
console.log(`  MUST_REJECT fails: ${allMustRejectFailsOld.length}/${totalMustRejectOld}`)

// ── Phase 2: V2 configs ────────────────────────────────────────────────────

const configs: Array<{ label: string; cfg: V2Config }> = [
  { label: 'V2-A (titleFloor=0)', cfg: V2_PRESET_A },
  { label: 'V2-B (skillsUnknown)', cfg: V2_PRESET_B },
  { label: 'V2-C (seniorityUnknown)', cfg: V2_PRESET_C },
  { label: 'V2-D (removeFloor)', cfg: V2_PRESET_D },
  { label: 'V2-E (professionalCompat)', cfg: V2_PRESET_E },
  { label: 'V2-F (dynamicWeights)', cfg: V2_PRESET_F },
  { label: 'V2-FULL (all enabled)', cfg: V2_PRESET_FULL },
]

console.log('\n\n=== PHASE 2: V2 CONFIGS (PER CHANGE MEASUREMENT) ===')

const allV2FullResults: V2CandidateResult[] = []

for (const { label, cfg } of configs) {
  console.log(`\n── ${label} ──`)

  let totalRegressions = 0
  let totalImprovements = 0
  let totalMustMatchFails = 0
  let totalMustRejectFails = 0

  for (const key of candidateKeys) {
    const baseline = baselines.get(key)!
    const result = runV2Config(key, cfg, label, baseline)
    if (label.includes('FULL')) allV2FullResults.push(result)

    printV2Config(result, baseline)
    totalRegressions += result.regressions.length
    totalImprovements += result.improvements.length
    totalMustMatchFails += result.mustMatchFails.length
    totalMustRejectFails += result.mustRejectFails.length
  }

  console.log(`\n  ${label} TOTALS: regressions=${totalRegressions} improvements=${totalImprovements} mm_fails=${totalMustMatchFails} mr_fails=${totalMustRejectFails}`)
  if (totalRegressions > 0) {
    console.log(`  ⚠ REGRESSION GATE: FAILED — ${totalRegressions} critical match(es) regressed`)
  } else {
    console.log(`  ✓ REGRESSION GATE: PASSED`)
  }
}

// ── Phase 3: Display threshold + Top 3 ────────────────────────────────────

calibrateDisplayThreshold(allV2FullResults)
analyzeTop3Free(allV2FullResults)

// ── Phase 4: Canary (theoretical) ─────────────────────────────────────────

console.log('\n\n=== CANARY NOTE ===')
console.log('Real top-20 requires a read-only SELECT against production Supabase.')
console.log('Credentials not available in this environment — canary is theoretical.')
console.log('To run the real canary:')
console.log('  1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment')
console.log('  2. Run: npx tsx scripts/matching-canary.ts <user_id>')
console.log('     (script to be created when prod access is available)')

// ── Final summary ──────────────────────────────────────────────────────────

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║     HARNESS COMPLETE                                          ║')
console.log('╚═══════════════════════════════════════════════════════════════╝')
console.log('\nGold Standard fixtures:')
console.log(`  Candidates: ${candidateKeys.length}`)
console.log(`  Opportunities: ${Object.keys(OPPORTUNITIES).length}`)
console.log(`  Expectations: ${EXPECTATIONS.length} (${EXPECTATIONS.filter(e => e.critical).length} critical)`)
console.log(`  MUST_MATCH: ${EXPECTATIONS.filter(e => e.expected === 'MUST_MATCH').length}`)
console.log(`  MUST_REJECT: ${EXPECTATIONS.filter(e => e.expected === 'MUST_REJECT').length}`)
console.log(`  BORDERLINE: ${EXPECTATIONS.filter(e => e.expected === 'BORDERLINE').length}`)

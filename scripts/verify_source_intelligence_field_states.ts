import assert from 'node:assert/strict'
import { fieldState } from '../src/lib/opportunity-truth.ts'
assert.equal(fieldState('description'), 'EXTRACTED')
assert.equal(fieldState('regional scope', 'INFERRED'), 'INFERRED')
assert.equal(fieldState(null), 'UNKNOWN', 'source omitted data is not a parser failure')
assert.equal(fieldState(null, 'FAILED'), 'FAILED')
console.log('verify_source_intelligence_field_states: PASS')

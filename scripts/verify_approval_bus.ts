import assert from 'node:assert/strict'
import { createReviewableProposal, proposalTransition, transitionProposal } from '../src/lib/approval-bus.ts'
assert.equal(proposalTransition('PENDING_REVIEW','EDIT'), 'PENDING_REVIEW')
assert.equal(proposalTransition('PENDING_REVIEW','APPROVE'), 'APPROVED')
assert.equal(proposalTransition('APPROVED','PUBLISH'), 'PUBLISHED')
assert.throws(() => proposalTransition('PENDING_REVIEW','PUBLISH'))
const created = createReviewableProposal('BLOG', '2026-09-20T00:00:00Z')
assert.equal(created.status, 'PENDING_REVIEW'); assert.throws(() => transitionProposal(created, 'PUBLISH'))
const published = transitionProposal(transitionProposal(created, 'APPROVE', 'admin'), 'PUBLISH', 'admin')
assert.equal(published.status, 'PUBLISHED'); assert.equal(published.audit.length, 3)
assert.throws(() => transitionProposal(transitionProposal(created, 'REJECT'), 'PUBLISH'))
console.log('verify_approval_bus: PASS')

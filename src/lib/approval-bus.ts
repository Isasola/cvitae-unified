export type ProposalKind = 'BLOG' | 'SEO_LANDING' | 'SEO_IMPROVEMENT' | 'FAQ_AEO' | 'DEMAND_OPPORTUNITY'
export type ProposalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'
export interface ReviewableProposal { kind: ProposalKind; status: ProposalStatus; audit: Array<{ action: string; at: string; actor: string }> }
export function createReviewableProposal(kind: ProposalKind, at = new Date().toISOString()): ReviewableProposal { return { kind, status:'PENDING_REVIEW', audit:[{ action:'CREATE', at, actor:'system' }] } }
export function proposalTransition(current: ProposalStatus, action: 'APPROVE' | 'EDIT' | 'REJECT' | 'PUBLISH'): ProposalStatus {
  if (action === 'EDIT' && current === 'PENDING_REVIEW') return 'PENDING_REVIEW'
  if (action === 'APPROVE' && current === 'PENDING_REVIEW') return 'APPROVED'
  if (action === 'REJECT' && current === 'PENDING_REVIEW') return 'REJECTED'
  if (action === 'PUBLISH' && current === 'APPROVED') return 'PUBLISHED'
  throw new Error(`invalid_proposal_transition:${current}:${action}`)
}
export function transitionProposal(proposal: ReviewableProposal, action: 'APPROVE' | 'EDIT' | 'REJECT' | 'PUBLISH', actor = 'admin', at = new Date().toISOString()): ReviewableProposal {
  const status = proposalTransition(proposal.status, action)
  return { ...proposal, status, audit:[...proposal.audit, { action, at, actor }] }
}

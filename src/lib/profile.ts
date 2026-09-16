// Returns true when a profile row has enough data to be treated as onboarding-complete.
// New users: checked via explicit profile_data.onboarding_status === 'completed'.
// Legacy users (pre-B2C-1): no onboarding_status field but real identity data present.
// A row created solely by CV upload (no name / title) is NOT complete.
export function isProfileComplete(profile: any): boolean {
  if (!profile) return false
  const status = profile.profile_data?.onboarding_status
  if (status === 'completed') return true
  if (status === 'needs_review') return false
  // Legacy: onboarding_status absent — treat as complete only if real identity data exists.
  if (status == null) {
    return Boolean((profile.full_name || '').trim()) &&
           Boolean((profile.professional_title || '').trim())
  }
  return false
}

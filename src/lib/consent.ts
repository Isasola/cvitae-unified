export type ConsentPreferences = {
  version: 1
  analytics: boolean
  advertising: boolean
  decidedAt: string
}

export const CONSENT_STORAGE_KEY = 'cvitae_consent_v1'
export const CONSENT_EVENT = 'cvitae:consent-changed'
export const OPEN_CONSENT_EVENT = 'cvitae:open-cookie-settings'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    adsbygoogle?: unknown[]
  }
}

const denied = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
} as const

export function readConsent(): ConsentPreferences | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) || 'null')
    if (!parsed || parsed.version !== 1) return null
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.advertising !== 'boolean') return null
    return parsed as ConsentPreferences
  } catch {
    return null
  }
}

function googleCommand(command: string, action: string | Date, values: Record<string, string | boolean> = {}) {
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag(...args: unknown[]) { window.dataLayer?.push(args) }
  window.gtag(command, action, values)
}

export function initializeConsentMode() {
  googleCommand('consent', 'default', denied)
  const saved = readConsent()
  if (saved) updateGoogleConsent(saved)
}

export function updateGoogleConsent(preferences: ConsentPreferences) {
  googleCommand('consent', 'update', {
    analytics_storage: preferences.analytics ? 'granted' : 'denied',
    ad_storage: preferences.advertising ? 'granted' : 'denied',
    ad_user_data: preferences.advertising ? 'granted' : 'denied',
    ad_personalization: preferences.advertising ? 'granted' : 'denied',
  })
}

export function saveConsent(values: Pick<ConsentPreferences, 'analytics' | 'advertising'>) {
  const preferences: ConsentPreferences = { version: 1, ...values, decidedAt: new Date().toISOString() }
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences))
  updateGoogleConsent(preferences)
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: preferences }))
  void loadAllowedGoogleServices(preferences)
  return preferences
}

function injectScript(id: string, src: string, attributes: Record<string, string> = {}) {
  if (document.getElementById(id)) return
  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value))
  document.head.appendChild(script)
}

export async function loadAllowedGoogleServices(preferences = readConsent()) {
  if (!preferences) return
  if (preferences.analytics) {
    const measurementId = String(import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-BZ16ZLP8ZZ').trim()
    if (measurementId && /^G-[A-Z0-9]+$/i.test(measurementId)) {
      injectScript('cvitae-ga4', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`)
      googleCommand('js', new Date())
      window.gtag?.('config', measurementId, { anonymize_ip: true })
    }
  }

  const adsReady = import.meta.env.VITE_GOOGLE_ADSENSE_READY === 'true'
  const client = String(import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT || '').trim()
  if (preferences.advertising && adsReady && /^ca-pub-\d+$/.test(client)) {
    injectScript(
      'cvitae-adsense',
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`,
      { crossorigin: 'anonymous' },
    )
  }
}

export function adPreviewEnabled() {
  return import.meta.env.VITE_ADSENSE_PREVIEW === 'true'
}

export function adsenseReady() {
  return import.meta.env.VITE_GOOGLE_ADSENSE_READY === 'true'
    && /^ca-pub-\d+$/.test(String(import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT || '').trim())
}

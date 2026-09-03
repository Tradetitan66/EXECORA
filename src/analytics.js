/**
 * Execora - Google Analytics 4 (gtag.js) shared module.
 * ------------------------------------------------------------------
 * Single source of truth for GA4 on the vanilla Vite multi-page site
 * (homepage, blog, thank-you). Imported by every entry point so each
 * page reports a single, correct page_view.
 *
 * Privacy & consent
 *  - Analytics only loads if VITE_GA_MEASUREMENT_ID is a valid "G-…" ID.
 *  - No analytics at all in local dev unless VITE_GA_ENABLE_DEV=true.
 *  - All storage is denied BEFORE gtag initialises (UK-friendly consent).
 *  - A cookie-consent banner lets the visitor grant ONLY analytics_storage.
 *    Advertising consent stays denied - Execora does not use ad tracking.
 *  - Events only ever send allow-listed, non-personal params. Names, emails,
 *    phone/WhatsApp numbers and form messages are NEVER sent.
 */

/* ---------- constants ---------- */
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || ''
const ENABLE_DEV = import.meta.env.VITE_GA_ENABLE_DEV === 'true'
const IS_DEV = import.meta.env.DEV
const CONSENT_KEY = 'execora_ga_consent'
const SENTINEL_PREFIX = 'execora_ga_sent_'

const SCRIPT_URL = (id) => `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`

// Events that should only fire once per visitor for this analytics session.
const SINGLE_USE = ['generate_lead', 'prototype_checkout_click']

/* ---------- state ---------- */
let initialised = false      // guards against duplicate init across entry points
let consent = null           // 'granted' | 'denied' | null
let loaderFailed = false     // true if the gtag script never loads (blocked / offline)

/* ---------- safe enable check ---------- */
function isValidId(id) {
  return typeof id === 'string' && id.startsWith('G-') && id.length > 2
}

function shouldEnable() {
  if (!isValidId(MEASUREMENT_ID)) return false
  // In prod always enabled. In dev only when explicitly enabled.
  if (IS_DEV && !ENABLE_DEV) return false
  return true
}

/* ---------- localStorage helpers (safe, never throw) ---------- */
function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore - analytics still works for the session */
  }
}

function alreadySent(name) {
  return readStorage(SENTINEL_PREFIX + name) === '1'
}

function markSent(name) {
  writeStorage(SENTINEL_PREFIX + name, '1')
}

/* ---------- consent ---------- */
function setConsentState(state) {
  consent = state
  writeStorage(CONSENT_KEY, state)
  const ads = 'denied'
  window.gtag('consent', 'update', {
    analytics_storage: state === 'granted' ? 'granted' : 'denied',
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  })
}

function getStoredConsent() {
  const stored = readStorage(CONSENT_KEY)
  return stored === 'granted' ? 'granted' : stored === 'denied' ? 'denied' : null
}

/* ---------- core init ---------- */
/**
 * Initialise GA4 exactly once and report a single page_view for `path`.
 * Safe to call from every entry point; subsequent calls are no-ops.
 */
export function initAnalytics({ path = '/', title, location } = {}) {
  if (initialised) return
  if (!shouldEnable()) return

  window.dataLayer = window.dataLayer || []
  function gtag() { window.dataLayer.push(arguments) }
  window.gtag = window.gtag || gtag

  // Deny everything before analytics loads (UK-friendly default).
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })

  consent = getStoredConsent()

  // Bootstrap the gtag queue so config works even before the script loads.
  gtag('js', new Date())
  gtag('config', MEASUREMENT_ID, { send_page_view: false })

  // Only ever page_view once per page load (send_page_view is disabled
  // above; we fire it exactly once here after config).
  gtag('event', 'page_view', {
    page_title: title || document.title,
    page_location: location || window.location.href,
    page_path: path,
  })

  initialised = true

  // If the visitor already granted analytics, apply it now.
  if (consent === 'granted') {
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  }

  loadScript()
  initConsentBanner()
}

/* ---------- dynamic script load ---------- */
function loadScript() {
  const script = document.createElement('script')
  script.async = true
  script.src = SCRIPT_URL(MEASUREMENT_ID)
  script.onerror = () => {
    // Analytics blocked/failed - site must keep working (events no-op).
    loaderFailed = true
  }
  document.head.appendChild(script)
}

/* ---------- safe event tracking ---------- */
const ALLOWED_PARAMS = new Set(['location', 'page_location'])

/**
 * Fire a GA4 event. No-ops safely when analytics is off/blocked/not
 * consented. Only sends params whose values are plain allow-listed
 * scalar strings - no names, emails, phones or free-form messages.
 */
export function trackEvent(name, params = {}) {
  if (!initialised || loaderFailed) return
  // Only send events after the visitor grants analytics_storage.
  if (consent !== 'granted') return
  if (SINGLE_USE.includes(name) && alreadySent(name)) return
  if (SINGLE_USE.includes(name)) markSent(name)

  const safe = {}
  for (const key of Object.keys(params)) {
    if (!ALLOWED_PARAMS.has(key)) continue
    if (typeof params[key] === 'string' && params[key]) safe[key] = params[key]
  }

  window.gtag('event', name, safe)
}

/* ---------- consent banner ---------- */
/**
 * Show an accessible cookie-consent banner unless the visitor already
 * made a choice. Never re-shows after a choice has been stored.
 */
function initConsentBanner() {
  if (document.getElementById('execora-consent-banner')) return
  if (consent !== null) return // already chose (granted or denied)

  const banner = document.createElement('div')
  banner.id = 'execora-consent-banner'
  banner.className = 'consent-banner'
  banner.setAttribute('role', 'dialog')
  banner.setAttribute('aria-modal', 'false')
  banner.setAttribute('aria-labelledby', 'execora-consent-title')

  banner.innerHTML = `
    <div class="consent-banner-inner">
      <p class="consent-banner-title" id="execora-consent-title">Your privacy</p>
      <p class="consent-banner-text">
        Execora uses lightweight analytics to understand how the website is used, so we can
        improve it for local businesses like yours. We do not collect personal or contact
        details and we do not use advertising tracking.
      </p>
      <div class="consent-banner-actions">
        <button type="button" class="consent-btn consent-accept" data-consent-accept>Accept analytics</button>
        <button type="button" class="consent-btn consent-reject" data-consent-reject>Reject</button>
      </div>
    </div>
  `

  document.body.appendChild(banner)

  banner.querySelector('[data-consent-accept]').addEventListener('click', () => {
    setConsentState('granted') // grants analytics_storage only; ads stay denied
    banner.remove()
  })

  banner.querySelector('[data-consent-reject]').addEventListener('click', () => {
    setConsentState('denied')
    banner.remove()
  })
}

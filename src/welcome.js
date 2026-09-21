/**
 * Execora - Welcome page (post-subscription confirmation) behaviour.
 * Minimal entry point (like terms.js): header glass scroll state, mobile
 * menu toggle, one GA4 page_view, plan-aware copy, optional Stripe
 * verification, and the onboarding form (Google Sheet + WhatsApp handoff).
 */

import { initAnalytics, trackEvent } from './analytics.js'
import { openWhatsApp } from './whatsapp.js'
import { resolvePlan, planSummary, buildWelcomeWhatsAppMessage } from './welcome-plan.js'

initAnalytics({ path: '/welcome' })

const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

const params = new URLSearchParams(window.location.search)
const queryPlan = params.get('plan')
const sessionId = params.get('session_id')

// The ?plan= query is only a fallback; the Stripe-verified amount wins.
let planKey = resolvePlan({ query: queryPlan })

function renderPlan(key) {
  const summary = planSummary(key)
  if (!summary) return
  const sub = document.getElementById('welcome-sub')
  const name = document.getElementById('welcome-plan-name')
  const price = document.getElementById('welcome-plan-price')
  const total = document.getElementById('welcome-plan-total')
  if (sub) {
    sub.textContent = `${summary.sub} Tell us about your business below and we will get your build underway.`
  }
  if (name) name.textContent = `${summary.name} plan`
  if (price) price.textContent = summary.monthlyLabel
  if (total) total.textContent = `£${summary.total}`
}

renderPlan(planKey)

/** Verify the real subscription via Stripe when a session id is present. */
async function verifySubscription() {
  if (!sessionId) return
  try {
    const res = await fetch('/api/session-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return

    const verified = resolvePlan({ amount: json.amount, query: queryPlan })
    if (verified) {
      planKey = verified
      renderPlan(planKey)
    }

    const reference = json.subscription || json.payment_intent || ''
    const refWrap = document.getElementById('welcome-ref')
    const refValue = document.getElementById('welcome-ref-value')
    if (reference && refWrap && refValue) {
      refValue.textContent = reference
      refWrap.hidden = false
    }
  } catch (err) {
    console.warn('[Execora] Could not verify subscription:', err)
  }
}

verifySubscription()

/* ---------- Onboarding form ---------- */
const form = document.getElementById('welcome-form')
const success = document.getElementById('welcome-success')
const successTitle = document.getElementById('welcome-success-title')
const onboardTitle = document.getElementById('welcome-onboard-title')
const onboardLead = document.querySelector('.welcome-onboard-lead')
const waBtn = document.getElementById('welcome-wa-btn')

let savedData = null

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())
    savedData = data

    const payload = { ...data, plan: planKey || '', source: 'subscription_onboarding' }

    // Show the confirmation straight away - never make the user wait on the
    // Google Sheet round-trip (which can be slow and is non-critical).
    if (onboardTitle) onboardTitle.hidden = true
    if (onboardLead) onboardLead.hidden = true
    form.hidden = true
    if (successTitle && data.name) successTitle.textContent = `Got it, ${data.name} - thank you.`
    if (success) {
      success.hidden = false
      success.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    trackEvent('subscription_onboarding_submit')

    // Write to the Google Sheet (same Apps Script endpoint as the other forms).
    if (CONTACT_SCRIPT_URL) {
      try {
        const res = await fetch(CONTACT_SCRIPT_URL, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(payload).toString(),
        })
        if (!res.ok) {
          console.error(`[Execora] Sheet save rejected by server (HTTP ${res.status}).`)
        }
      } catch (err) {
        // Non-blocking: the confirmation is already on screen and the
        // WhatsApp handoff below still carries the same details.
        console.error('[Execora] Sheet save failed:', err)
      }
    }
  })
}

if (waBtn) {
  waBtn.addEventListener('click', () => {
    trackEvent('whatsapp_click', { location: 'welcome' })
    openWhatsApp(buildWelcomeWhatsAppMessage(savedData || {}, planKey))
  })
}

trackEvent('subscription_confirmed')

/* ---------- Header + mobile menu (mirrors terms.js) ---------- */
const header = document.querySelector('.nav-bar')
if (header) {
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8)
  window.addEventListener('scroll', update, { passive: true })
  update()
}

const menuToggle = document.getElementById('menu-toggle')
const siteNav = document.getElementById('site-nav')

if (menuToggle && siteNav) {
  const closeMenu = () => {
    siteNav.classList.remove('is-open')
    menuToggle.setAttribute('aria-expanded', 'false')
    menuToggle.setAttribute('aria-label', 'Open menu')
  }
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open')
    menuToggle.setAttribute('aria-expanded', String(isOpen))
    menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu')
  })
  siteNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu() })
}

/**
 * Execora - subscription plan helpers for the /welcome page.
 * Pure functions (no DOM, no analytics) so they can be unit tested.
 * The Stripe-verified line-item amount is the source of truth; the
 * ?plan= query param is only a fallback for when verification is not
 * available (e.g. a Payment Link redirect without session_id).
 */

import { normaliseWebsite } from './whatsapp.js'

export const PLANS = {
  essential: { key: 'essential', name: 'Essential', monthly: 39, total: 468 },
  growth: { key: 'growth', name: 'Growth', monthly: 59, total: 708 },
}

/** Map a Stripe unit amount (in pence) to a plan key. */
export function planFromAmount(amount) {
  const pence = Number(amount)
  if (pence === 3900) return 'essential'
  if (pence === 5900) return 'growth'
  return null
}

/** Map a ?plan= query value to a plan key. */
export function planFromQuery(value) {
  const key = String(value || '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(PLANS, key) ? key : null
}

/** Prefer the Stripe-verified amount, then the ?plan= query, then null. */
export function resolvePlan({ amount, query } = {}) {
  return planFromAmount(amount) || planFromQuery(query) || null
}

export function planSummary(key) {
  const plan = PLANS[key]
  if (!plan) return null
  return {
    ...plan,
    monthlyLabel: `£${plan.monthly}/month`,
    sub: `Your £${plan.monthly}/month ${plan.name} plan is active.`,
  }
}

/** Build the pre-filled WhatsApp message for the onboarding form. */
export function buildWelcomeWhatsAppMessage(data = {}, key = null) {
  const plan = PLANS[key]
  const val = (v) => (String(v || '').trim() ? String(v).trim() : 'Not provided')
  return [
    'Hi Execora,',
    '',
    'I have just subscribed and here are my business details:',
    '',
    `Plan: ${plan ? `£${plan.monthly}/month ${plan.name}` : 'Not provided'}`,
    `Name: ${val(data.name)}`,
    `Business: ${val(data.business)}`,
    `Email: ${val(data.email)}`,
    `WhatsApp: ${val(data.phone)}`,
    `Business type: ${val(data.type)}`,
    `Location: ${val(data.location)}`,
    `Services: ${val(data.services)}`,
    `Website style: ${val(data.style)}`,
    `Social / website: ${val(normaliseWebsite(data.social))}`,
    `Notes: ${val(data.notes)}`,
    '',
    'Thanks!',
  ].join('\n')
}

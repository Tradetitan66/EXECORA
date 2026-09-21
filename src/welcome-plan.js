/**
 * Execora - subscription plan helpers for the /welcome page.
 * Pure functions (no DOM, no analytics) so they can be unit tested.
 * The Stripe-verified line-item amount is the source of truth; the
 * ?plan= query param is only a fallback for when verification is not
 * available (e.g. a Payment Link redirect without session_id).
 *
 * The resolved plan is used only for internal onboarding records (the
 * Google Sheet payload). Nothing plan- or price-related is shown on the
 * confirmation page, since the customer already saw it at Stripe.
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

/** The monthly price label for a resolved plan, or null. */
export function planPriceLabel(key) {
  const plan = PLANS[key]
  return plan ? `£${plan.monthly}/month` : null
}

/**
 * The confirmation line under the hero. Mentions only the price the
 * customer actually paid (no plan names, no totals) so the page matches
 * whichever subscription they bought.
 */
export function subscriptionSubText(key) {
  const price = planPriceLabel(key)
  const lead = price ? `Your ${price} subscription is active.` : 'Your subscription is active.'
  return `${lead} Tell us about your business below and we will get your build underway.`
}

/** Build the pre-filled WhatsApp message for the onboarding form. */
export function buildWelcomeWhatsAppMessage(data = {}) {
  const val = (v) => (String(v || '').trim() ? String(v).trim() : 'Not provided')
  return [
    'Hi Execora,',
    '',
    'I have just subscribed and here are my business details:',
    '',
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

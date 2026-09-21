/**
 * Execora - shared WhatsApp helpers.
 * Pure message builders (no DOM) so they can be unit tested, plus a small
 * opener used by the terms page contact form. Kept separate from main.js and
 * thank-you.js so the number lives in one place.
 */

export const WHATSAPP_NUMBER = '4407345384868'

/** Prefix a bare domain with https:// so it is clickable in WhatsApp. */
export function normaliseWebsite(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** Build the pre-filled message for the /terms contact form. */
export function buildTermsWhatsAppMessage({ business, contact, website } = {}) {
  const val = (v) => (String(v || '').trim() ? String(v).trim() : 'Not provided')
  return [
    'Hi Execora,',
    '',
    "I'd like to get in touch about your website plans.",
    '',
    `Business name: ${val(business)}`,
    `Contact number: ${val(contact)}`,
    `Website link: ${val(normaliseWebsite(website))}`,
    '',
    'Thanks.'
  ].join('\n')
}

/** Open WhatsApp with a pre-filled message in a new tab. */
export function openWhatsApp(message) {
  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener'
  )
}

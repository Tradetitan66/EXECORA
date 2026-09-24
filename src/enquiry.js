/**
 * Execora - generic enquiry (contact) form.
 * ------------------------------------------------------------------
 * Shared by main.js (homepage, guarded) and contact.js (/contact page).
 * Collects a few business details, posts them to the Google Apps Script
 * endpoint, swaps the form for a success panel, and offers a WhatsApp
 * handoff. Never sends personal data to analytics.
 */

import { trackEvent } from './analytics.js'
import { openWhatsApp } from './whatsapp.js'

const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

/** Build the pre-filled WhatsApp message for an enquiry. */
export function buildEnquiryWhatsAppMessage(data = {}) {
  return [
    'New enquiry from the Execora website -',
    `Name: ${data.name || 'Not provided'}`,
    `Business: ${data.business || 'Not provided'}`,
    `Email: ${data.email || 'Not provided'}`,
    data.phone ? `Phone: ${data.phone}` : '',
    data.message ? `About: ${data.message}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

/** Validate a UK WhatsApp number (+44 7xxxxxxxxx or 07xxxxxxxxx). */
export function isValidWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('447')) return true // +44 7xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('07')) return true  // 07xxxxxxxxx
  return false
}

/**
 * Wire up the enquiry form and WhatsApp buttons. Safe no-op when the
 * markup is not present on the page (e.g. the homepage after moving the
 * form to /contact).
 */
export function initEnquiryForm() {
  const form = document.getElementById('enquiry-form')
  if (!form) return

  const note = document.getElementById('form-note')
  const formWrap = document.getElementById('enquiry-form-wrap')
  const successPanel = document.getElementById('enquiry-success')
  const successTitle = document.getElementById('success-title')
  const successWaBtn = document.getElementById('success-wa-btn')
  const quickWaBtn = document.getElementById('quick-wa-btn')

  let savedData = null

  const phoneInput = document.getElementById('f-phone')
  if (phoneInput) {
    const validatePhone = () => {
      const msg = isValidWhatsApp(phoneInput.value)
        ? ''
        : 'Please enter a valid UK WhatsApp number starting with +44 (e.g. +44 7912 345678).'
      phoneInput.setCustomValidity(msg)
      return phoneInput.validity.valid
    }
    phoneInput.addEventListener('input', validatePhone)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      validatePhone()
      if (!form.checkValidity()) {
        form.reportValidity()
        return
      }
      const data = Object.fromEntries(new FormData(form).entries())

      if (note) {
        note.textContent = 'Saving your details…'
        note.style.color = '#78716c'
      }

      // If an Apps Script endpoint is configured, write to the sheet first.
      if (CONTACT_SCRIPT_URL) {
        const body = new URLSearchParams(data)
        try {
          // `cors` mode (not `no-cors`) lets us read the real HTTP status so a
          // 403 (deployment not published to "Anyone") isn't silently confused
          // with a successful write.
          const res = await fetch(CONTACT_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          })
          if (!res.ok) {
            console.error(
              `[Execora] Sheet save rejected by server (HTTP ${res.status}).`,
              `This usually means the Apps Script deployment is not published to "Anyone" access.`
            )
          } else {
            console.info(`[Execora] Sheet save succeeded (HTTP ${res.status}).`)
          }
        } catch (err) {
          // Never block the user - WhatsApp can still be opened even if saving fails.
          console.error('[Execora] Sheet save failed:', err)
        }
      }

      // Replace the form with a success panel so the user can opt in to WhatsApp.
      savedData = data
      if (formWrap) formWrap.hidden = true
      if (successTitle) successTitle.textContent = `Got it, ${data.name || 'friend'}. Your details are saved.`
      if (successPanel) successPanel.hidden = false

      // Fire as a confirmation/conversion once - no personal data is sent.
      trackEvent('generate_lead')
    })
  }

  if (successWaBtn) {
    successWaBtn.addEventListener('click', () => {
      trackEvent('whatsapp_click', { location: 'enquiry_success' })
      if (savedData) openWhatsApp(buildEnquiryWhatsAppMessage(savedData))
    })
  }

  if (quickWaBtn) {
    quickWaBtn.addEventListener('click', () => {
      trackEvent('whatsapp_click', { location: 'contact_quick_contact' })
      openWhatsApp(
        [
          'Hi Execora,',
          '',
          "I'd like to get a website built for my business.",
          '',
          'Could you share more about how we can get started, and what the next steps would be?',
          '',
          'Thank you.',
        ].join('\n')
      )
    })
  }
}
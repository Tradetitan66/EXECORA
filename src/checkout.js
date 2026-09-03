/**
 * Execora — £5 prototype checkout flow
 * ------------------------------------------------------------------
 * Opens a modal to collect business details, holds the data locally
 * (sessionStorage), calls the create-checkout serverless function, and
 * redirects the user to Stripe Checkout. The data is re-read after
 * payment on the /thank-you page (Stripe redirects back with
 * ?session_id=...) and written to the sheet server-side via webhook.
 */

import { trackEvent } from './analytics.js'

const STORAGE_KEY = 'execora_proto_data'

/* ---------- helpers ---------- */
function ukPhoneValid(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('447')) return true // +44 7xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('07')) return true  // 07xxxxxxxxx
  return false
}

/* ---------- open / close modal ---------- */
export function closeModal(target) {
  const modal =
    typeof target === 'string'
      ? document.querySelector(target)
      : target && target.closest?.('.checkout-modal')
  if (!modal) return
  modal.hidden = true
  modal.classList.remove('is-open')
  document.body.classList.remove('modal-open')
  const closeBtn = modal.querySelector('[data-checkout-close]')
  if (closeBtn) closeBtn.focus()
}

export function openModal() {
  const modal = document.getElementById('checkout-modal')
  if (!modal) return
  modal.hidden = false
  modal.classList.add('is-open')
  document.body.classList.add('modal-open')
  const first = modal.querySelector('input, select, textarea')
  window.setTimeout(() => first && first.focus(), 120)
}

/* ---------- wire the payment CTAs to open the modal ---------- */
export function initCheckout() {
  const modal = document.getElementById('checkout-modal')
  if (!modal) return

  const ctas = document.querySelectorAll('[data-payment-cta]')
  ctas.forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal()
    })
  })

  // Close via X, backdrop click, or Escape.
  const closeBtn = modal.querySelector('[data-checkout-close]')
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal))
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(modal)
  })

  const form = modal.querySelector('form')
  if (form) form.addEventListener('submit', onSubmit)
}

/* ---------- submit: hold data, then send to checkout ---------- */
async function onSubmit(e) {
  e.preventDefault()
  const form = e.currentTarget
  const note = form.querySelector('[data-checkout-note]')
  const submitBtn = form.querySelector('button[type="submit"]')

  // UK phone validation
  const phoneInput = form.querySelector('[name="phone"]')
  if (phoneInput && !ukPhoneValid(phoneInput.value)) {
    phoneInput.setCustomValidity(
      'Please enter a valid UK WhatsApp number starting with +44 (e.g. +44 7912 345678).'
    )
    phoneInput.reportValidity()
    return
  }
  phoneInput && phoneInput.setCustomValidity('')

  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  // User started the £5 prototype checkout (not a completed purchase).
  // No personal data is sent.
  trackEvent('prototype_checkout_click')

  const data = Object.fromEntries(new FormData(form).entries())

  // Hold the data so it can be re-read after payment succeeds.
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('[Execora] Could not persist checkout data locally:', err)
  }

  if (note) {
    note.textContent = 'Preparing your checkout…'
    note.style.display = 'block'
  }
  if (submitBtn) {
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending you to payment…'
  }

  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.url) {
      throw new Error(json.error || 'Could not create checkout session')
    }

    // Redirect to Stripe Checkout.
    window.location.href = json.url
  } catch (err) {
    console.error('[Execora] checkout error:', err)
    if (note) {
      note.textContent =
        'Something went wrong preparing your payment. Please try again, or contact us via WhatsApp.'
      note.style.color = '#b4523f'
    }
    if (submitBtn) {
      submitBtn.disabled = false
      submitBtn.textContent = 'Try again'
    }
  }
}

/* ---------- retrieval for the thank-you page ---------- */
export function getHeldData() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearHeldData() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEY }

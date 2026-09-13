/**
 * Execora - £5 prototype checkout flow
 * ------------------------------------------------------------------
 * Opens a 3-step modal to collect business details (your details →
 * your business → review & pay), holds the data locally
 * (sessionStorage), calls the create-checkout serverless function, and
 * redirects the user to Stripe Checkout. The data is re-read after
 * payment on the /thank-you page (Stripe redirects back with
 * ?session_id=...) and written to the sheet server-side via webhook.
 */

import { trackEvent } from './analytics.js'

const STORAGE_KEY = 'execora_proto_data'
const PHONE_MSG =
  'Please enter a valid UK WhatsApp number starting with +44 (e.g. +44 7912 345678).'

/* ---------- state ---------- */
let modal = null
let wizard = null // { panels, indicators, backBtn, nextBtn, submitBtn, reviewEl }
let activeStep = 1

/* ---------- helpers ---------- */
function ukPhoneValid(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('447')) return true // +44 7xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('07')) return true  // 07xxxxxxxxx
  return false
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

/* ---------- open / close modal ---------- */
export function closeModal(target) {
  const modalEl =
    typeof target === 'string'
      ? document.querySelector(target)
      : target && target.closest?.('.checkout-modal')
  if (!modalEl) return
  modalEl.hidden = true
  modalEl.classList.remove('is-open')
  document.body.classList.remove('modal-open')
  const closeBtn = modalEl.querySelector('[data-checkout-close]')
  if (closeBtn) closeBtn.focus()
}

export function openModal() {
  if (!modal) return
  showStep(1)
  modal.hidden = false
  modal.classList.add('is-open')
  document.body.classList.add('modal-open')
  const first = modal.querySelector('input, select, textarea')
  window.setTimeout(() => first && first.focus(), 120)
}

/* ---------- wire the payment CTAs to open the modal ---------- */
export function initCheckout() {
  modal = document.getElementById('checkout-modal')
  if (!modal) return

  const ctas = document.querySelectorAll('[data-payment-cta]')
  ctas.forEach((btn) => {
    btn.addEventListener('click', () => {
      const planInput = modal.querySelector('input[name="plan"]')
      if (planInput) planInput.value = btn.getAttribute('data-plan') || ''
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

  initWizard()

  const form = modal.querySelector('form')
  if (form) form.addEventListener('submit', onSubmit)
}

/* ---------- 3-step wizard ---------- */
function initWizard() {
  if (!modal) return
  const panels = Array.from(modal.querySelectorAll('[data-step-panel]'))
  const indicators = Array.from(modal.querySelectorAll('[data-step-indicator]'))
  const backBtn = modal.querySelector('[data-checkout-back]')
  const nextBtn = modal.querySelector('[data-checkout-next]')
  const submitBtn = modal.querySelector('[data-checkout-submit]')
  const reviewEl = modal.querySelector('[data-checkout-review]')
  if (!panels.length || !nextBtn) return

  wizard = { panels, indicators, backBtn, nextBtn, submitBtn, reviewEl }

  // Real-time UK WhatsApp validation so step 1 can never silently pass.
  const phone = modal.querySelector('[name="phone"]')
  if (phone) {
    phone.addEventListener('input', () => {
      phone.setCustomValidity(ukPhoneValid(phone.value) ? '' : PHONE_MSG)
    })
  }

  nextBtn.addEventListener('click', () => {
    if (stepValid(activeStep)) showStep(activeStep + 1)
  })
  backBtn.addEventListener('click', () => showStep(activeStep - 1))

  showStep(1)
}

function showStep(n) {
  if (!wizard) return
  activeStep = Math.min(Math.max(n, 1), wizard.panels.length)

  wizard.panels.forEach((panel, i) => {
    const active = i + 1 === activeStep
    panel.hidden = !active
    panel.classList.toggle('is-active', active)
    panel.setAttribute('aria-hidden', active ? 'false' : 'true')
  })

  wizard.indicators.forEach((el, i) => {
    const idx = i + 1
    el.classList.toggle('is-active', idx === activeStep)
    el.classList.toggle('is-done', idx < activeStep)
  })

  wizard.backBtn.hidden = activeStep === 1
  wizard.nextBtn.hidden = activeStep === wizard.panels.length
  wizard.submitBtn.hidden = activeStep !== wizard.panels.length

  if (activeStep === wizard.panels.length) buildReview()

  const first = wizard.panels[activeStep - 1].querySelector('input, select, textarea')
  window.setTimeout(() => first && first.focus(), 80)
}

function stepValid(n) {
  if (!wizard) return true
  const controls = [...wizard.panels[n - 1].querySelectorAll('input, select, textarea')]
  const invalid = controls.find((el) => !el.checkValidity())
  if (invalid) invalid.reportValidity()
  return !invalid
}

function buildReview() {
  if (!wizard || !wizard.reviewEl) return
  const form = modal.querySelector('form')
  if (!form) return
  const data = Object.fromEntries(new FormData(form).entries())

  const typeSel = form.querySelector('[name="type"]')
  const typeLabel =
    typeSel && typeSel.options && typeSel.selectedIndex !== -1
      ? typeSel.options[typeSel.selectedIndex].text
      : ''

  const rows = [
    ['Your name', data.name],
    ['Business', data.business],
    ['Email', data.email],
    ['WhatsApp', data.phone],
    ['Business type', data.type ? (typeLabel && typeLabel !== 'Please choose…' ? typeLabel : data.type) : ''],
    ['Location', data.location],
    ['Services', data.services],
  ]

  wizard.reviewEl.innerHTML = rows
    .filter(([, value]) => value && String(value).trim() !== '')
    .map(
      ([label, value]) =>
        `<div class="checkout-review-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('')
}

/* ---------- submit: hold data, then send to checkout ---------- */
async function onSubmit(e) {
  e.preventDefault()

  // Pressing Enter on an early step should advance, not try to pay.
  if (wizard && activeStep < wizard.panels.length) {
    showStep(activeStep + 1)
    return
  }

  const form = e.currentTarget
  const note = form.querySelector('[data-checkout-note]')
  const submitBtn = form.querySelector('button[type="submit"]')

  // UK phone validation
  const phoneInput = form.querySelector('[name="phone"]')
  if (phoneInput && !ukPhoneValid(phoneInput.value)) {
    phoneInput.setCustomValidity(PHONE_MSG)
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
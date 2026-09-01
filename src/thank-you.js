/**
 * Execora — thank-you (post-payment confirmation) page.
 *
 * The business details are collected BEFORE payment (homepage modal) and
 * written to the Google Sheet server-side by the Stripe webhook, so nothing
 * is sent to the sheet here. This page just confirms the payment, personalises
 * the message from the held data, and clears the locally-held data.
 */

import { getHeldData, clearHeldData } from './checkout.js'

function initHeaderGlass() {
  const header = document.querySelector('.nav-bar')
  if (!header) return
  let ticking = false
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8)
    ticking = false
  }
  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }, { passive: true })
  update()
}
initHeaderGlass()

function personalise() {
  const sub = document.getElementById('thanks-sub')
  const data = getHeldData()
  if (sub && data && data.name) {
    sub.textContent = `Thank you, ${data.name}. Your £5 prototype payment went through and we’ve got your business details — we’re ready to begin crafting your website prototype.`
  }
  return data
}

const WHATSAPP_NUMBER = '4407345384868'
const WHATSAPP_SCOPE_MESSAGE = 'I just paid for my £5 prototype on your website. My details:'

const FIELD_LABELS = {
  name: 'Name',
  business: 'Business',
  email: 'Email',
  phone: 'WhatsApp',
  type: 'Business type',
  location: 'Location',
  services: 'Services',
  style: 'Website style',
  social: 'Social',
  notes: 'Notes',
}

/** Build a WhatsApp message from the held form data + optional payment ID. */
function buildWhatsAppMessage(data, paymentIntent) {
  const lines = ['Hi Execora,', '', WHATSAPP_SCOPE_MESSAGE, '']
  for (const key of Object.keys(FIELD_LABELS)) {
    if (data[key] !== undefined && String(data[key]).trim() !== '') {
      lines.push(`${FIELD_LABELS[key]}: ${data[key]}`)
    }
  }
  if (paymentIntent) lines.push(`Payment ID: ${paymentIntent}`)
  lines.push('', "I'd like to get in touch.")
  return lines.join('\n')
}

let paymentIntent = ''

function initWhatsApp(data) {
  const btn = document.getElementById('thanks-wa-btn')
  if (!btn) return

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const message = buildWhatsAppMessage(data, paymentIntent)
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener'
    )
  })
}

/** Eagerly fetch the PaymentIntent ID from the success URL's session_id. */
async function loadPaymentIntent() {
  const sessionId = new URLSearchParams(window.location.search).get('session_id')
  if (!sessionId) return
  try {
    const res = await fetch('/api/session-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.payment_intent) paymentIntent = json.payment_intent
  } catch (err) {
    console.warn('[Execora] Could not load payment ID:', err)
  }
}

const data = personalise()
clearHeldData()
initWhatsApp(data)
loadPaymentIntent()
const WHATSAPP_NUMBER = '4407345384868'
const WA_BASE = 'https://wa.me/'
const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

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

const form = document.getElementById('detail-form')
const note = document.getElementById('detail-note')

// Validate a UK WhatsApp number. Accepts either the international form
// (+44 7xxxxxxxxx) or the national form (07xxxxxxxxx), ignoring spaces/dashes.
function isValidWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('447')) return true // +44 7xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('07')) return true  // 07xxxxxxxxx
  return false
}

const phoneInput = document.getElementById('d-phone')
function validatePhone() {
  const msg = isValidWhatsApp(phoneInput.value)
    ? ''
    : 'Please enter a valid UK WhatsApp number starting with +44 (e.g. +44 7912 345678).'
  phoneInput.setCustomValidity(msg)
  return phoneInput.validity.valid
}
phoneInput.addEventListener('input', validatePhone)

function formatValue(label, value) {
  if (!value) return ''
  return `\n• ${label}: ${value}`
}

function buildWhatsAppMessage(data) {
  const lines = [
    'New website enquiry from Execora -',
    `Name: ${data.name || 'Not provided'}`,
    `Business: ${data.business || 'Not provided'}`,
    `Email: ${data.email || 'Not provided'}`,
  ]

  const optional = [
    ['Phone', data.phone],
    ['Business type', data.type],
    ['Location', data.location],
    ['Services', data.services],
    ['Social links', data.social],
    ['Preferred style', data.style],
    ['Additional notes', data.notes],
  ]

  for (const [label, value] of optional) {
    lines.push(formatValue(label, value))
  }

  return lines.join('\n').trim()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  validatePhone()
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = Object.fromEntries(new FormData(form).entries())
  const message = buildWhatsAppMessage(data)

  note.textContent = 'Saving your details…'
  note.style.color = '#78716c'

  // If an Apps Script endpoint is configured, write the paid-customer details
  // to the "Paid prototype customers" sheet first.
  if (CONTACT_SCRIPT_URL) {
    const body = new URLSearchParams(data)
    try {
      const res = await fetch(CONTACT_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })
      if (!res.ok) {
        console.error(
          `[Execora] Paid customer save rejected by server (HTTP ${res.status}).`,
          `This usually means the Apps Script deployment is not published to "Anyone" access.`
        )
      } else {
        console.info(`[Execora] Paid customer saved (HTTP ${res.status}).`)
      }
    } catch (err) {
      // Never block the user - WhatsApp can still be opened even if saving fails.
      console.error('[Execora] Paid customer save failed:', err)
    }
  }

  note.textContent = `Thanks ${data.name || ''} - opening WhatsApp so we can receive your details.`
  note.style.color = '#5d8268'

  window.open(`${WA_BASE}${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
})

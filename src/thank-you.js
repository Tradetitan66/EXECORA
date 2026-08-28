const WHATSAPP_NUMBER = '4407345384868'
const WA_BASE = 'https://wa.me/'
const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

const form = document.getElementById('detail-form')
const note = document.getElementById('detail-note')

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

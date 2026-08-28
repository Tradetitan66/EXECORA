import './style.css'

const PAYMENT_LINK = import.meta.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK

function initPaymentCta() {
  const buttons = document.querySelectorAll('[data-payment-cta]')
  if (buttons.length === 0) return

  if (!PAYMENT_LINK) {
    buttons.forEach((btn) => {
      btn.classList.add('is-disabled')
      btn.setAttribute('disabled', '')
      btn.setAttribute('aria-disabled', 'true')
      btn.setAttribute('title', 'Online checkout coming soon')
      btn.textContent = 'Coming soon'
    })
    return
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = PAYMENT_LINK
    })
  })
}

initPaymentCta()

const menuToggle = document.getElementById('menu-toggle')
const siteNav = document.getElementById('site-nav')

function closeMenu() {
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

const revealEls = document.querySelectorAll('.reveal')
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        io.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)
revealEls.forEach((el) => io.observe(el))

const WHATSAPP_NUMBER = '4407345384868'
const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

const form = document.getElementById('enquiry-form')
const note = document.getElementById('form-note')
const formWrap = document.getElementById('enquiry-form-wrap')
const successPanel = document.getElementById('enquiry-success')
const successTitle = document.getElementById('success-title')
const successWaBtn = document.getElementById('success-wa-btn')

function buildWhatsAppMessage(data) {
  return [
    'New enquiry from the Execora website -',
    `Name: ${data.name || 'Not provided'}`,
    `Business: ${data.business || 'Not provided'}`,
    `Email: ${data.email || 'Not provided'}`,
    data.phone ? `Phone: ${data.phone}` : '',
    data.message ? `About: ${data.message}` : ''
  ].filter(Boolean).join('\n').trim()
}

function openWhatsApp(data) {
  const message = buildWhatsAppMessage(data)
  window.open(`${'https://wa.me/'}${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
}

// Store the details so the WhatsApp button can open with them on click.
let savedData = null

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }
  const data = Object.fromEntries(new FormData(form).entries())

  note.textContent = 'Saving your details…'
  note.style.color = '#78716c'

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
        body: body.toString()
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
  formWrap.hidden = true
  successTitle.textContent = `Got it, ${data.name || 'friend'}. Your details are saved.`
  successPanel.hidden = false
})

successWaBtn.addEventListener('click', () => {
  if (savedData) openWhatsApp(savedData)
})


document.querySelectorAll('[data-focus-form]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const nameField = document.getElementById('f-name')
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => nameField.focus(), 500)
  })
})

const QUICK_WA_MESSAGE = [
  'Hi Execora,',
  '',
  'I\'d like to get a website built for my business.',
  '',
  '',
  'Could you share more about how we can get started, and what the next steps would be?',
  '',
  '',
  'Thank you.'
].join('\n')

const quickWaBtn = document.getElementById('quick-wa-btn')
if (quickWaBtn) {
  quickWaBtn.addEventListener('click', () => {
    window.open(
      `${'https://wa.me/'}${WHATSAPP_NUMBER}?text=${encodeURIComponent(QUICK_WA_MESSAGE)}`,
      '_blank',
      'noopener'
    )
  })
}

const privacyLink = document.getElementById('privacy-link')
privacyLink.addEventListener('click', (e) => {
  e.preventDefault()
  window.alert(
    'Execora respects your privacy. We only use the details you share with us to respond to your enquiry - we never sell or share your information.'
  )
})

/* ============================================================
   Showcase — auto-scrolling local-website slider
   ============================================================ */
function initShowcase() {
  const track = document.querySelector('[data-showcase-track]')
  if (!track) return

  const prev = document.querySelector('[data-showcase-prev]')
  const next = document.querySelector('[data-showcase-next]')
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const AUTO_MS = 4000
  let timer = null
  let restartTimer = null

  const card = () => {
    const el = track.querySelector('.showcase-card')
    return el ? el.getBoundingClientRect().width + 20 : 300
  }

  function step(dir) {
    const w = card()
    track.scrollBy({ left: dir * w, behavior: 'smooth' })
    requestAnimationFrame(updateArrows)
  }

  function updateArrows() {
    if (!prev || !next) return
    const max = track.scrollWidth - track.clientWidth
    const x = track.scrollLeft
    prev.classList.toggle('is-disabled', x <= 1)
    next.classList.toggle('is-disabled', max - x <= 1)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
  }

  function start() {
    if (prefersReduced || !track) return
    stop()
    timer = setInterval(() => {
      const max = track.scrollWidth - track.clientWidth
      if (max <= 1) return
      if (track.scrollLeft >= max - 2) {
        track.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        step(1)
      }
      updateArrows()
    }, AUTO_MS)
  }

  function restartSoon() {
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(start, 6000)
  }

  if (prev) prev.addEventListener('click', () => { stop(); step(-1); restartSoon() })
  if (next) next.addEventListener('click', () => { stop(); step(1); restartSoon() })

  track.addEventListener('scroll', updateArrows)
  track.addEventListener('mouseenter', stop)
  track.addEventListener('mouseleave', start)
  track.addEventListener('focusin', stop)
  track.addEventListener('focusout', start)

  updateArrows()
  start()
}
initShowcase()

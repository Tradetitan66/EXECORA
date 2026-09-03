import './style.css'
import { hydrateHomepage } from './sanity/site.js'
import { initCheckout } from './checkout.js'
import { initAnalytics, trackEvent } from './analytics.js'

// Initialise GA4 (single page_view for the homepage).
initAnalytics({ path: '/' })

// Fetch editable homepage copy from Sanity (falls back to hard-coded copy).
hydrateHomepage()

// Wire all £5 prototype CTAs to open the checkout modal (Stripe Checkout flow).
initCheckout()

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

const STAGGER_GRIDS = ['.step-grid', '.offer-grid', '.card-grid', '.pricing-grid']
const revealEls = new Set(document.querySelectorAll('.reveal'))

document.querySelectorAll('main > section > *').forEach((block) => {
  if (block.hasAttribute('hidden') || block.getAttribute('aria-hidden') === 'true') return
  revealEls.add(block)
})

STAGGER_GRIDS.forEach((sel) => {
  document.querySelectorAll(sel).forEach((grid) => {
    grid.querySelectorAll(':scope > *').forEach((child, idx) => {
      if (child.hasAttribute('hidden')) return
      revealEls.add(child)
      if (idx < 5) child.style.transitionDelay = `${idx * 90}ms`
    })
  })
})

revealEls.forEach((el) => {
  el.classList.add('reveal')
  io.observe(el)
})

/* ============================================================
   Hero — rotating word (found · trusted · chosen · contacted)
   ============================================================ */
function initHeroRotator() {
  const word = document.querySelector('.hero-word')
  if (!word) return

  const words = ['found', 'trusted', 'chosen', 'contacted']
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const TYPE_MS = 70        // per character typed
  const DELETE_MS = 40      // per character deleted
  const HOLD_MS = 1800      // pause on full word
  const END_MS = 500        // brief pause after deleting before typing next
  let index = 0
  let timer = null

  // Reserve width for the widest word so the headline never reflows.
  const probe = word.cloneNode(true)
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0'
  probe.textContent = words[0]
  const container = word.parentElement
  container.appendChild(probe)
  let maxWidth = 0
  words.forEach((w) => {
    probe.textContent = w
    maxWidth = Math.max(maxWidth, probe.offsetWidth)
  })
  probe.remove()
  word.style.minWidth = maxWidth + 'px'

  if (reduced) {
    word.textContent = 'found'
    return
  }

  function type(i, charIndex) {
    if (charIndex <= words[i].length) {
      word.textContent = words[i].slice(0, charIndex)
      timer = setTimeout(() => type(i, charIndex + 1), TYPE_MS)
    } else {
      // word complete — hold, then delete
      timer = setTimeout(() => erase(i, words[i].length), HOLD_MS)
    }
  }

  function erase(i, charIndex) {
    if (charIndex >= 0) {
      word.textContent = words[i].slice(0, charIndex)
      timer = setTimeout(() => erase(i, charIndex - 1), DELETE_MS)
    } else {
      const next = (i + 1) % words.length
      timer = setTimeout(() => type(next, 0), END_MS)
    }
  }

  // start typing the first word after the hero reveal settles
  timer = setTimeout(() => type(0, 0), 1400)
}
initHeroRotator()

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

// Validate a UK WhatsApp number. Accepts either the international form
// (+44 7xxxxxxxxx) or the national form (07xxxxxxxxx), ignoring spaces/dashes.
function isValidWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('447')) return true // +44 7xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('07')) return true  // 07xxxxxxxxx
  return false
}

const phoneInput = document.getElementById('f-phone')
function validatePhone() {
  const msg = isValidWhatsApp(phoneInput.value)
    ? ''
    : 'Please enter a valid UK WhatsApp number starting with +44 (e.g. +44 7912 345678).'
  phoneInput.setCustomValidity(msg)
  return phoneInput.validity.valid
}
phoneInput.addEventListener('input', validatePhone)

// Store the details so the WhatsApp button can open with them on click.
let savedData = null

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  validatePhone()
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

  // Fire as a confirmation/conversion once — no personal data is sent.
  trackEvent('generate_lead')
})

successWaBtn.addEventListener('click', () => {
  trackEvent('whatsapp_click', { location: 'enquiry_success' })
  if (savedData) openWhatsApp(savedData)
})


document.querySelectorAll('[data-focus-form]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const plan = btn.getAttribute('data-plan')
    if (plan) {
      const planField = document.getElementById('f-plan')
      if (planField) planField.value = plan
    } else {
      const planField = document.getElementById('f-plan')
      if (planField && planField.value === '') planField.value = 'General enquiry'
    }
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
    trackEvent('whatsapp_click', { location: 'homepage_quick_contact' })
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
   Showcase + Reviews — auto-scrolling horizontal sliders
   ============================================================ */
function initAutoScrollTrack({ trackSel, prevSel, nextSel, autoMs = 4000 }) {
  const track = document.querySelector(trackSel)
  if (!track) return

  const prev = document.querySelector(prevSel)
  const next = document.querySelector(nextSel)
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let timer = null
  let restartTimer = null

  const card = () => {
    const el = track.querySelector('.showcase-card, .review-card')
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
    }, autoMs)
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
initAutoScrollTrack({ trackSel: '[data-showcase-track]', prevSel: '[data-showcase-prev]', nextSel: '[data-showcase-next]' })
initAutoScrollTrack({ trackSel: '[data-reviews-track]', prevSel: '[data-reviews-prev]', nextSel: '[data-reviews-next]' })

/* ============================================================
   Reviews — subtle 3D tilt on each card as the pointer moves
   ============================================================ */
function initCardTilt() {
  const cards = document.querySelectorAll('.review-card')
  if (cards.length === 0) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const MAX_X = 8   // degrees of rotateX (vertical tilt)
  const MAX_Y = 10  // degrees of rotateY (horizontal tilt)

  cards.forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const rotY = (px - 0.5) * 2 * MAX_Y
      const rotX = (0.5 - py) * 2 * MAX_X
      card.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`
    })

    card.addEventListener('pointerleave', () => {
      card.style.transform = 'rotateX(0deg) rotateY(0deg)'
    })
  })
}
initCardTilt()

/* ============================================================
   Pricing — keep matching <details> sections in sync across all
   plan cards so the same section opens side-by-side for comparison
   ============================================================ */
const planSectionDetails = Array.from(
  document.querySelectorAll('.pricing-grid details[data-plan-section]')
)
if (planSectionDetails.length) {
  let syncing = false
  const sync = (details) => {
    if (syncing) return
    const group = details.dataset.planSection
    syncing = true
    planSectionDetails
      .filter((d) => d.dataset.planSection === group && d !== details)
      .forEach((d) => { d.open = details.open })
    syncing = false
  }
  planSectionDetails.forEach((d) => d.addEventListener('toggle', () => sync(d)))
}

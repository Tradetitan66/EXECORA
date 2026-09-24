import './style.css'
import { hydrateHomepage } from './sanity/site.js'
import { initCheckout } from './checkout.js'
import { initAnalytics, trackEvent } from './analytics.js'
import { initEnquiryForm } from './enquiry.js'

// Initialise GA4 (single page_view for the homepage).
initAnalytics({ path: '/' })

// Fetch editable homepage copy from Sanity (falls back to hard-coded copy).
hydrateHomepage()

// Wire all £5 homepage preview CTAs to open the checkout modal (Stripe flow).
initCheckout()

// The /contact form now lives on the /contact page. If a form is ever present
// here too (e.g. reused markup), wire it up - otherwise this is a safe no-op.
initEnquiryForm()

// Track clicks on the £39/£59 monthly plan subscribe links (external Stripe
// Payment Links). Only a non-personal location label is sent.
document.querySelectorAll('[data-subscribe-cta]').forEach((link) => {
  link.addEventListener('click', () => {
    trackEvent('subscribe_click', { location: link.dataset.location || 'pricing' })
  })
})

// Track the hero "£5 homepage preview" CTA.
document.querySelector('.hero [data-payment-cta]')?.addEventListener('click', () => {
  trackEvent('hero_preview_click', { location: 'hero' })
})

// Track the pricing-section continuation CTAs ("Or start with a £5 homepage preview").
document.querySelectorAll('.plan-cta[data-payment-cta]').forEach((btn) => {
  btn.addEventListener('click', () => {
    trackEvent('pricing_continue_click', { location: btn.dataset.plan || 'pricing' })
  })
})

// Fire a section-view event the first time Examples / Pricing scroll into view.
const sectionEvents = [
  ['#showcase', 'example_view'],
  ['#pricing', 'pricing_view'],
]
const sectionViewObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      sectionViewObserver.unobserve(entry.target)
      trackEvent(entry.target.dataset.track, { location: entry.target.id })
    })
  },
  { threshold: 0.25 }
)
sectionEvents.forEach(([sel, ev]) => {
  const el = document.querySelector(sel)
  if (el) {
    el.dataset.track = ev
    sectionViewObserver.observe(el)
  }
})

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

const STAGGER_GRIDS = ['.step-grid', '.which-list']
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

const privacyLink = document.getElementById('privacy-link')
privacyLink.addEventListener('click', (e) => {
  e.preventDefault()
  window.alert(
    'Execora respects your privacy. We only use the details you share with us to respond to your enquiry - we never sell or share your information.'
  )
})

/* ============================================================
   Showcase + Reviews - auto-scrolling horizontal sliders
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

/* Live demo iframe overlay - opens the demo site in-page so visitors
   can come back to the Execora homepage without leaving it. */
const demoFrame = document.getElementById('demo-frame')
const demoIframe = demoFrame ? demoFrame.querySelector('[data-demo-iframe]') : null
const DEMO_URL = 'https://livedemosite.vercel.app/'

const openLiveDemo = () => {
  if (!demoFrame) return
  demoFrame.hidden = false
  document.body.classList.add('modal-open')
  if (demoIframe && !demoIframe.getAttribute('src')) {
    demoIframe.setAttribute('src', DEMO_URL)
  }
  const back = demoFrame.querySelector('.demo-frame-back')
  window.setTimeout(() => back && back.focus(), 120)
}

const closeLiveDemo = () => {
  if (!demoFrame) return
  demoFrame.hidden = true
  document.body.classList.remove('modal-open')
  if (demoIframe) demoIframe.removeAttribute('src')
  const trigger = document.querySelector('[data-showcase-live]')
  if (trigger) trigger.focus()
}

const showcaseLive = document.querySelector('[data-showcase-live]')
if (showcaseLive) {
  showcaseLive.addEventListener('click', () => {
    trackEvent('outbound_click', { location: 'showcase_live' })
    openLiveDemo()
  })
}
if (demoFrame) {
  demoFrame.querySelectorAll('[data-demo-close]').forEach((el) => {
    el.addEventListener('click', closeLiveDemo)
  })
  document.addEventListener('keydown', (e) => {
    if (!demoFrame.hidden && e.key === 'Escape') closeLiveDemo()
  })
}

/* ============================================================
   Reviews - subtle 3D tilt on each card as the pointer moves
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
   FAQ - accordion behaviour: opening one item closes the others
   ============================================================ */
const faqItems = Array.from(document.querySelectorAll('.faq-item'))
if (faqItems.length) {
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return
      faqItems
        .filter((other) => other !== item)
        .forEach((other) => { other.open = false })
    })
  })
}

/* ============================================================
   Newsletter - footer email subscription (writes to BLOG subscribers)
   ============================================================ */
const newsletterForm = document.getElementById('newsletter-form')
const newsletterNote = document.getElementById('newsletter-note')
const newsletterSuccess = document.getElementById('newsletter-success')

if (newsletterForm) {
  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const emailField = newsletterForm.querySelector('#nl-email')
    if (!emailField.value || !emailField.checkValidity()) {
      emailField.reportValidity()
      return
    }

    const data = Object.fromEntries(new FormData(newsletterForm).entries())
    newsletterNote.textContent = 'Saving your details…'

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
          console.error(`[Execora] Newsletter save rejected (HTTP ${res.status}).`)
          newsletterNote.textContent = 'Something went wrong - please try again.'
          return
        }
      } catch (err) {
        console.error('[Execora] Newsletter save failed:', err)
        newsletterNote.textContent = 'Something went wrong - please try again.'
        return
      }
    }

    newsletterForm.hidden = true
    if (newsletterSuccess) newsletterSuccess.hidden = false
    trackEvent('newsletter_subscribe')
  })
}

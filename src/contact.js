/**
 * Execora - /contact page entry point.
 * ------------------------------------------------------------------
 * Single page_view, sticky glass header, mobile menu, scroll reveals
 * and the shared enquiry form (src/enquiry.js).
 */

import './style.css'
import { initAnalytics } from './analytics.js'
import { initEnquiryForm } from './enquiry.js'

// Initialise GA4 (single page_view for the contact page).
initAnalytics({ path: '/contact' })

function initHeaderGlass() {
  const header = document.querySelector('.nav-bar')
  if (!header) return
  let ticking = false
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8)
    ticking = false
  }
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    },
    { passive: true }
  )
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

menuToggle?.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('is-open')
  menuToggle.setAttribute('aria-expanded', String(isOpen))
  menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu')
})

siteNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu()
})

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

const revealEls = new Set(document.querySelectorAll('.reveal'))
document.querySelectorAll('main > section > *').forEach((block) => {
  if (block.hasAttribute('hidden') || block.getAttribute('aria-hidden') === 'true') return
  revealEls.add(block)
})
revealEls.forEach((el) => {
  el.classList.add('reveal')
  io.observe(el)
})

// Wire the shared enquiry form (safe no-op if markup is missing).
initEnquiryForm()

const privacyLink = document.getElementById('privacy-link')
privacyLink?.addEventListener('click', (e) => {
  e.preventDefault()
  window.alert(
    'Execora respects your privacy. We only use the details you share with us to respond to your enquiry - we never sell or share your information.'
  )
})
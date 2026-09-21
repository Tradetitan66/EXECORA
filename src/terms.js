/**
 * Execora - Terms of Service page behaviour.
 * Minimal entry point separate from main.js (which assumes homepage-only
 * elements like the checkout modal, enquiry form and newsletter): header
 * glass scroll state, mobile menu toggle, and a single GA4 page_view.
 */

import { initAnalytics, trackEvent } from './analytics.js'
import { buildTermsWhatsAppMessage, openWhatsApp } from './whatsapp.js'

initAnalytics({ path: '/terms' })

const waForm = document.getElementById('terms-wa-form')
if (waForm) {
  waForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(waForm).entries())
    trackEvent('whatsapp_click', { location: 'terms_whatsapp' })
    openWhatsApp(buildTermsWhatsAppMessage(data))
  })
}

const header = document.querySelector('.nav-bar')
if (header) {
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8)
  window.addEventListener('scroll', update, { passive: true })
  update()
}

const menuToggle = document.getElementById('menu-toggle')
const siteNav = document.getElementById('site-nav')

if (menuToggle && siteNav) {
  const closeMenu = () => {
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
}
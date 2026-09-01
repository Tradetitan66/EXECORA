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
  // The data is no longer needed on this page; the webhook already wrote it.
  clearHeldData()
}

personalise()

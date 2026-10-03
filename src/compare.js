import { initAnalytics, trackEvent } from './analytics.js'
initAnalytics({ path: '/compare' })
document.querySelectorAll('[data-subscribe-cta]').forEach(link => {
  link.addEventListener('click', () => trackEvent('subscribe_click', { location: link.dataset.location }))
})

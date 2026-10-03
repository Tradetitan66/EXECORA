import { initAnalytics, trackEvent } from './analytics.js'
const plan = window.location.pathname.includes('growth') ? 'growth' : 'essential'
initAnalytics({ path: `/${plan}` })
document.querySelector(`a[href="/pay/${plan}"]`)?.addEventListener('click', () => {
  trackEvent('subscribe_click', { location: `${plan}_details` })
})

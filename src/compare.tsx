import { createRoot, hydrateRoot } from 'react-dom/client'
import Comparison02 from '@/components/ui/comparison-02'
import './comparison.css'
import { initAnalytics, trackEvent } from './analytics.js'
const root = document.getElementById('comparison-root')!
if (root.dataset.prerendered) hydrateRoot(root, <Comparison02 />)
else createRoot(root).render(<Comparison02 />)
initAnalytics({ path: '/compare' })
root.addEventListener('click', event => {
 const link = (event.target as Element).closest<HTMLAnchorElement>('[data-subscribe-cta]')
 if (link) trackEvent('subscribe_click', { location: link.dataset.location })
})

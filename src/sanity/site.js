import { client } from './client'
import { siteSettingsQuery } from './queries'

/**
 * Execora - homepage content hydration.
 *
 * Fetches the `siteSettings` singleton from Sanity on load and updates
 * highlighted text slots in place. Design, layout, animations and child
 * elements (e.g. the ".cursive" hero accent, the rotating word) are left
 * untouched - only text nodes are replaced, so the site keeps its exact
 * look and behaviour even when Sanity content changes.
 *
 * If Sanity is unreachable, misconfigured, or returns no value for a field,
 * the existing hard-coded copy remains - the site never shows empty content.
 */

// Replace textContent of an element WITHOUT removing internal styled spans
// like ".cursive"/".accent". Only the leading text node(s) are overwritten.
function setPrefixText(el, value) {
  if (!el) return
  const accent = el.querySelector('.cursive, .accent')
  if (accent) {
    // Walk text nodes before the accent span and set the first one.
    let node = el.firstChild
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        node.textContent = value + ' '
        return
      }
      node = node.nextSibling
    }
    // No leading text node found - insert one before the accent.
    accent.before(document.createTextNode(value + ' '))
  } else {
    el.textContent = value
  }
}

function applyIf(el, value) {
  if (el && value) el.textContent = value
}

// Update the plan pricing cells in the comparison table.
// Only applied when BOTH the setup and monthly fee are present from Sanity;
// otherwise the hard-coded copy in the HTML is kept.
function applyPlanPrice(planKey, setupFee, monthlyFee) {
  if (typeof setupFee !== 'number' || typeof monthlyFee !== 'number') return
  const priceEl = document.querySelector(`[data-plan-price="${planKey}"]`)
  const monthlyEl = document.querySelector(`[data-plan-monthly="${planKey}"]`)
  if (priceEl) priceEl.textContent = `+£${setupFee}`
  if (monthlyEl) monthlyEl.textContent = `£${monthlyFee}/month`
}

export async function hydrateHomepage() {
  let settings
  try {
    settings = await client.fetch(siteSettingsQuery)
  } catch (err) {
    console.warn('[Execora] Sanity unavailable - keeping hard-coded copy.', err)
    return
  }
  if (!settings) return

  // Hero
  const heroEyebrow = document.querySelector('.hero .eyebrow')
  const heroTitle = document.querySelector('.hero .hero-title')
  const heroSub = document.querySelector('.hero .hero-sub')
  const heroCta = document.querySelector('.hero .hero-actions .btn-coral')

  if (settings.heroEyebrow) applyIf(heroEyebrow, settings.heroEyebrow)
  if (settings.heroTitle) setPrefixText(heroTitle, settings.heroTitle)
  if (settings.heroSub) applyIf(heroSub, settings.heroSub)

  // The primary CTA label is standardised site-wide and must not be overridden
  // by CMS content, so all home-page CTAs read "Get my £5 prototype".
  if (heroCta) heroCta.textContent = 'Get my £5 prototype'

  // Contact
  const contactTitle = document.querySelector('.contact .contact-title')
  const contactSub = document.querySelector('.contact .contact-sub')
  if (settings.contactHeading) setPrefixText(contactTitle, settings.contactHeading)
  if (settings.contactSub) applyIf(contactSub, settings.contactSub)

  // Footer
  const footerTagline = document.querySelector('.footer-tagline')
  if (settings.footerTagline) applyIf(footerTagline, settings.footerTagline)

  // Pricing
  applyPlanPrice('essential', settings.essentialSetupFee, settings.essentialMonthlyFee)
  applyPlanPrice('growth', settings.growthSetupFee, settings.growthMonthlyFee)
}

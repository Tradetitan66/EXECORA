import { defineField, defineType } from 'sanity'

/**
 * Site-wide editable content for the Execora homepage and footer.
 * Kept deliberately minimal — the template defines the full scope,
 * but for this site only the highest-value strings are exposed.
 */
export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  groups: [
    { name: 'brand', title: 'Brand & hero' },
    { name: 'contact', title: 'Contact' },
    { name: 'footer', title: 'Footer' },
    { name: 'pricing', title: 'Pricing' },
  ],
  fields: [
    // ---- Brand & hero ----
    defineField({
      name: 'businessName',
      title: 'Business name',
      type: 'string',
      group: 'brand',
    }),
    defineField({
      name: 'heroEyebrow',
      title: 'Hero eyebrow',
      type: 'string',
      group: 'brand',
    }),
    defineField({
      name: 'heroTitle',
      title: 'Hero title (before rotating word)',
      type: 'string',
      group: 'brand',
      description: 'e.g. "Your local business deserves to be "',
    }),
    defineField({
      name: 'heroWords',
      title: 'Hero rotating words',
      type: 'array',
      group: 'brand',
      of: [{ type: 'string' }],
      description: 'Words to rotate in the hero (e.g. found, trusted, chosen, contacted).',
    }),
    defineField({
      name: 'heroSub',
      title: 'Hero subtitle',
      type: 'text',
      group: 'brand',
      rows: 3,
    }),
    defineField({
      name: 'primaryCta',
      title: 'Primary call-to-action text',
      type: 'string',
      group: 'brand',
    }),
    // ---- Contact ----
    defineField({
      name: 'whatsappNumber',
      title: 'WhatsApp number (international, no +)',
      type: 'string',
      group: 'contact',
    }),
    defineField({
      name: 'contactHeading',
      title: 'Contact heading',
      type: 'string',
      group: 'contact',
    }),
    defineField({
      name: 'contactSub',
      title: 'Contact subtitle',
      type: 'text',
      group: 'contact',
      rows: 2,
    }),
    // ---- Footer ----
    defineField({
      name: 'footerTagline',
      title: 'Footer tagline',
      type: 'string',
      group: 'footer',
    }),
    // ---- Pricing ----
    defineField({
      name: 'essentialSetupFee',
      title: 'Essential — one-time setup fee (£)',
      type: 'number',
      group: 'pricing',
      description: 'Setup fee shown on the Essential plan. Leave empty to use the hard-coded £299.',
    }),
    defineField({
      name: 'essentialMonthlyFee',
      title: 'Essential — monthly fee (£)',
      type: 'number',
      group: 'pricing',
      description: 'Monthly fee shown on the Essential plan. Leave empty to use the hard-coded £49.',
    }),
    defineField({
      name: 'growthSetupFee',
      title: 'Growth — one-time setup fee (£)',
      type: 'number',
      group: 'pricing',
      description: 'Setup fee shown on the Growth plan. Leave empty to use the hard-coded £499.',
    }),
    defineField({
      name: 'growthMonthlyFee',
      title: 'Growth — monthly fee (£)',
      type: 'number',
      group: 'pricing',
      description: 'Monthly fee shown on the Growth plan. Leave empty to use the hard-coded £79.',
    }),
  ],
})

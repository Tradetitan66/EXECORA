import Stripe from 'stripe'

/**
 * Execora — Create Stripe Checkout Session
 * ------------------------------------------------------------------
 * Vercel serverless function. Receives the business details collected
 * on the homepage modal, creates a Stripe Checkout Session for the
 * £5 prototype, and returns the checkout URL to redirect the user to.
 *
 * The collected details are stored in `metadata` so the webhook can
 * write them to the Google Sheet after payment succeeds.
 *
 * Requires server-only env vars (NOT NEXT_PUBLIC_):
 *   STRIPE_SECRET_KEY
 *   FRONTEND_URL            e.g. https://www.execora.work
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  if (!stripeSecret) {
    return res.status(500).json({ error: 'Stripe is not configured' })
  }

  const stripe = new Stripe(stripeSecret)
  const frontendUrl = process.env.FRONTEND_URL || 'https://www.execora.work'

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const {
    name = '',
    business = '',
    email = '',
    phone = '',
    type = '',
    location = '',
    services = '',
    social = '',
    style = '',
    notes = '',
  } = body

  const fullname = [name, business].filter(Boolean).join(' ').trim()

  // Only pass truthy values into metadata (Stripe disallows empty-string values
  // whose keys resolve to null). Keep the payload compact.
  const metadata = {}
  if (name) metadata.name = name
  if (business) metadata.business = business
  if (phone) metadata.phone = phone
  if (type) metadata.type = type
  if (location) metadata.location = location
  if (services) metadata.services = services
  if (social) metadata.social = social
  if (style) metadata.style = style
  if (notes) metadata.notes = notes

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: 500, // £5.00
            product_data: {
              name: 'Website Prototype',
              description: 'A tailored homepage concept for your business',
            },
          },
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      metadata,
      success_url: `${frontendUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/#pricing`,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[Execora] create-checkout failed:', err)
    return res.status(500).json({ error: 'Could not create checkout session' })
  }
}

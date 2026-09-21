import Stripe from 'stripe'

/**
 * Execora — Look up a Checkout Session's key details.
 * ------------------------------------------------------------------
 * Vercel serverless function. Called from:
 *   - the thank-you page (after a £5 prototype payment) to read the
 *     canonical `pi_...` PaymentIntent ID for the receipt / WhatsApp
 *     handoff;
 *   - the welcome page (after a £39/£59 subscription) to verify the
 *     real plan (from the line-item amount) and show a reference.
 *
 * Only non-sensitive fields are returned — never the customer's email.
 * Requires the server-only STRIPE_SECRET_KEY.
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

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const sessionId = body.session_id
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' })
  }

  const stripe = new Stripe(stripeSecret)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    })

    const lineItem = session.line_items?.data?.[0]
    const price = lineItem?.price
    const amount = price?.unit_amount ?? session.amount_subtotal ?? session.amount_total ?? null

    return res.status(200).json({
      payment_intent: session.payment_intent || '',
      mode: session.mode || '',
      status: session.status || '',
      amount: typeof amount === 'number' ? amount : null,
      currency: price?.currency || session.currency || 'gbp',
      subscription: session.subscription || '',
      customer: session.customer || '',
    })
  } catch (err) {
    console.error('[Execora] session-info lookup failed:', err.message)
    return res.status(500).json({ error: 'Could not retrieve session' })
  }
}

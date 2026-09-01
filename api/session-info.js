import Stripe from 'stripe'

/**
 * Execora — Look up a Checkout Session to read its PaymentIntent ID.
 * ------------------------------------------------------------------
 * Vercel serverless function. Called from the thank-you page after a
 * successful payment so the receipt / WhatsApp handoff can include the
 * canonical `pi_...` payment ID. Requires the server-only STRIPE_SECRET_KEY.
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
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    return res.status(200).json({ payment_intent: session.payment_intent || '' })
  } catch (err) {
    console.error('[Execora] session-info lookup failed:', err.message)
    return res.status(500).json({ error: 'Could not retrieve session' })
  }
}
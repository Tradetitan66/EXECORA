import Stripe from 'stripe'

/**
 * Execora — Stripe webhook handler
 * ------------------------------------------------------------------
 * Vercel serverless function. Receives Stripe webhook events. On
 * `checkout.session.completed`, reads the business details stored in
 * session metadata and writes them to the Google Sheet via the Apps
 * Script endpoint (server-to-server, so only genuinely paid customers
 * reach the sheet).
 *
 * Requires server-only env vars (NOT NEXT_PUBLIC_):
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   NEXT_PUBLIC_CONTACT_SCRIPT_URL   (the public Apps Script web app URL)
 */

export const config = {
  api: {
    bodyParser: false, // We must read the raw body to verify the Stripe signature
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const sheetUrl = process.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

  if (!stripeSecret || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook is not configured' })
  }

  const stripe = new Stripe(stripeSecret)

  // Read the raw body (bodyParser is disabled above).
  const rawBody = await readRawBody(req)

  const signature = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[Execora] Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  // Only act on completed checkouts.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const metadata = session.metadata || {}

    if (sheetUrl) {
      try {
        const body = {
          ...metadata,
          // Force the "paid" routing markers so Apps Script writes to the
          // "Paid prototype customers" sheet (matching the current form keys).
          type: metadata.type || '',
          location: metadata.location || '',
          style: metadata.style || '',
        }
        const form = new URLSearchParams(body).toString()
        const res2 = await fetch(sheetUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
        })

        if (!res2.ok) {
          console.error(`[Execora] Sheet save rejected (HTTP ${res2.status})`)
          // Return 500 so Stripe retries the webhook.
          return res.status(500).json({ error: 'Sheet save failed' })
        }
        console.info('[Execora] Paid customer written to sheet.')
      } catch (err) {
        console.error('[Execora] Sheet save failed:', err)
        return res.status(500).json({ error: 'Sheet save failed' })
      }
    }
  }

  return res.json({ received: true })
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

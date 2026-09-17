import { createClient } from '@sanity/client'
import { sitemapXml } from '../src/seo/render.js'

/**
 * Execora — Dynamic XML sitemap
 * ------------------------------------------------------------------
 * Vercel serverless function served at `/sitemap.xml` via a rewrite in
 * `vercel.json`. Queries Sanity at request time so the sitemap is never
 * stale: old posts published after the last deploy appear immediately,
 * and future-dated posts (`publishedDate <= now()`) surface as soon as
 * their date arrives — no redeploy needed.
 *
 * The response is cached on the Vercel CDN for a short window (60s, via
 * `s-maxage`) so a newly published or now-due post shows up within a
 * minute while still avoiding a Sanity query on every hit.
 * `stale-while-revalidate` keeps responses flowing if a revalidation is
 * slow. If Sanity is unreachable we still return a valid sitemap (home +
 * blog index) with a much shorter TTL, so crawlers never see a 500 and a
 * transient failure self-heals.
 *
 * No env vars required — the project/dataset fall back to production
 * defaults (same as the client bundle).
 */

const SITEMAP_QUERY = `
  *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()]
  | order(publishedDate desc){
    _id,
    _updatedAt,
    slug
  }
`

/**
 * Allow the Sanity client to be injected (used by tests). Exported symbol
 * avoids creating a real client in unit tests.
 */
export function setClientFactory(fn) {
  _clientFactory = fn || defaultClientFactory
}

let _clientFactory = defaultClientFactory

function defaultClientFactory({ projectId, dataset }) {
  return createClient({
    projectId,
    dataset,
    apiVersion: '2026-08-31',
    useCdn: false,
    maxRetries: 1,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'p0mpfgmr'
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'
  const client = _clientFactory({ projectId, dataset })

  let posts
  try {
    posts = await client.fetch(SITEMAP_QUERY)
  } catch (err) {
    console.error('[Execora] sitemap Sanity fetch failed:', err.message)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300')
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).send(sitemapXml([]))
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=3600')
  if (req.method === 'HEAD') return res.status(200).end()
  return res.status(200).send(sitemapXml(posts))
}
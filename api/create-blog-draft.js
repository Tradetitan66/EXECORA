import { createClient } from '@sanity/client'

/**
 * Execora — Create a Sanity blog post DRAFT for manual review
 * ------------------------------------------------------------------
 * Vercel serverless function. Accepts a blog post payload over
 * `Authorization: Bearer <BLOG_DRAFT_API_SECRET>` and creates a Sanity
 * `blogPost` document as a *draft* only. It never publishes.
 *
 * Review and publish the draft in Sanity Studio (see SANITY_SETUP.md).
 *
 * Requires server-only env vars (NOT NEXT_PUBLIC_):
 *   SANITY_WRITE_TOKEN
 *   BLOG_DRAFT_API_SECRET
 *   NEXT_PUBLIC_SANITY_PROJECT_ID   (falls back to 'p0mpfgmr')
 *   NEXT_PUBLIC_SANITY_DATASET      (falls back to 'production')
 *
 * Method:        POST
 * Content-Type:  application/json
 */

export const ALLOWED_CATEGORIES = [
  'Website Tips',
  'Local Business',
  'Google & SEO',
  'Customer Experience',
  'Business Growth',
]

// Portable Text block styles we accept in the simplified payload.
const BLOCK_STYLES = new Set(['normal', 'h2', 'h3', 'blockquote'])
const LIST_TYPES = new Set(['bullet', 'number'])

const MAX_LENGTHS = {
  title: 200,
  excerpt: 500,
  seoTitle: 70,
  seoDescription: 160,
  imageAlt: 200,
}

const WORDS_PER_MINUTE = 220

let _keyCounter = 0
function nextKey() {
  _keyCounter += 1
  return `k${_keyCounter.toString(36)}${Date.now().toString(36)}`
}

/**
 * Convert an arbitrary string into a URL-friendly slug.
 * Lowercases, trims, collapses whitespace and strips non-alphanumerics.
 */
export function generateSlug(title) {
  if (typeof title !== 'string') return ''
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

/**
 * Estimate reading time in minutes from the body text (~220 wpm).
 * Always returns at least 1 minute for non-empty content.
 */
export function calculateReadingTime(body) {
  if (!Array.isArray(body)) return 1
  const text = body
    .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
    .join(' ')
    .trim()
  if (!text) return 1
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/**
 * Whether a category is one of the schema's allowed values.
 */
export function isValidCategory(category) {
  return ALLOWED_CATEGORIES.includes(category)
}

/**
 * Convert the simplified payload blocks into Sanity Portable Text.
 *
 * Input:
 *   [{ style, text, listItem? }]
 *
 * Output:
 *   Portable Text blocks with _type, _key, style, level, children and markDefs.
 */
export function convertToPortableText(blocks) {
  if (!Array.isArray(blocks)) return []
  return blocks
    .filter((b) => b && typeof b.text === 'string')
    .map((b) => {
      const style = BLOCK_STYLES.has(b.style) ? b.style : 'normal'
      const block = {
        _type: 'block',
        _key: nextKey(),
        style,
        children: [{ _type: 'span', _key: nextKey(), text: b.text }],
        markDefs: [],
      }
      if (b.listItem && LIST_TYPES.has(b.listItem)) {
        block.listItem = b.listItem
        block.level = typeof b.level === 'number' ? b.level : 0
      }
      return block
    })
}

/**
 * Validate a payload and return either `{ ok: true, value }` or
 * `{ ok: false, error }`. Enforces presence of required fields and the
 * max-length limits above.
 */
export function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const required = ['title', 'category', 'excerpt', 'seoTitle', 'seoDescription', 'body']
  for (const field of required) {
    const value = body[field]
    if (value === undefined || value === null || value === '') {
      return { ok: false, error: `Missing required field: ${field}` }
    }
  }

  for (const field of ['title', 'excerpt', 'seoTitle', 'seoDescription']) {
    const value = body[field]
    if (typeof value !== 'string') {
      return { ok: false, error: `${field} must be a string` }
    }
    if (value.length > MAX_LENGTHS[field]) {
      return {
        ok: false,
        error: `${field} exceeds the maximum of ${MAX_LENGTHS[field]} characters`,
      }
    }
  }

  if (body.slug !== undefined && typeof body.slug !== 'string') {
    return { ok: false, error: 'slug must be a string' }
  }

  if (typeof body.category !== 'string') {
    return { ok: false, error: 'category must be a string' }
  }
  if (!isValidCategory(body.category)) {
    return {
      ok: false,
      error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`,
    }
  }

  if (body.imageAlt !== undefined && typeof body.imageAlt !== 'string') {
    return { ok: false, error: 'imageAlt must be a string' }
  }
  if (body.imageAlt && body.imageAlt.length > MAX_LENGTHS.imageAlt) {
    return {
      ok: false,
      error: `imageAlt exceeds the maximum of ${MAX_LENGTHS.imageAlt} characters`,
    }
  }

  if (!Array.isArray(body.body) || body.body.length === 0) {
    return { ok: false, error: 'body must be a non-empty array of blocks' }
  }
  for (const block of body.body) {
    if (!block || typeof block !== 'object' || typeof block.text !== 'string') {
      return { ok: false, error: 'Each body block must be an object with a text string' }
    }
    if (block.listItem && !LIST_TYPES.has(block.listItem)) {
      return { ok: false, error: `Unsupported listItem type: ${block.listItem}` }
    }
  }

  if (body.imageAssetId !== undefined && typeof body.imageAssetId !== 'string') {
    return { ok: false, error: 'imageAssetId must be a string' }
  }

  return { ok: true, value: body }
}

/**
 * Allow the Sanity client to be injected (used by tests). Exported symbol
 * avoids creating a real client in unit tests.
 */
export function setClientFactory(fn) {
  _clientFactory = fn || defaultClientFactory
}

let _clientFactory = defaultClientFactory

function defaultClientFactory({ projectId, dataset, token }) {
  return createClient({
    projectId,
    dataset,
    apiVersion: '2026-08-31',
    token,
    useCdn: false,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const writeToken = process.env.SANITY_WRITE_TOKEN
  const apiSecret = process.env.BLOG_DRAFT_API_SECRET
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'p0mpfgmr'
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'

  if (!writeToken || !apiSecret) {
    return res.status(500).json({ error: 'Blog draft endpoint is not configured' })
  }

  // Protect with bearer token. Compare supplied token safely.
  const authHeader = req.headers.authorization || ''
  const supplied = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : ''
  if (supplied.length === 0 || supplied !== apiSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const validated = validatePayload(body)
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error })
  }
  const payload = validated.value

  const slug = (payload.slug && generateSlug(payload.slug)) || generateSlug(payload.title)
  if (!slug) {
    return res.status(400).json({ error: 'Could not generate a slug from title' })
  }

  const readingTime = payload.readingTime !== undefined && payload.readingTime !== null
    ? payload.readingTime
    : calculateReadingTime(payload.body)

  const publishedDate = payload.publishedDate || new Date().toISOString()

  const bodyBlocks = convertToPortableText(payload.body)

  const doc = {
    _id: `drafts.blogPost-${slug}`,
    _type: 'blogPost',
    title: payload.title,
    slug: { _type: 'slug', current: slug },
    category: payload.category,
    excerpt: payload.excerpt,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    publishedDate,
    readingTime,
    body: bodyBlocks,
  }

  if (payload.imageAssetId) {
    doc.image = {
      _type: 'image',
      asset: { _type: 'reference', _ref: payload.imageAssetId },
      alt: payload.imageAlt || '',
    }
  }

  const client = _clientFactory({ projectId, dataset, token: writeToken })

  // Check for an existing document (published OR draft) with the same slug.
  // We query the whole dataset so we never overwrite an existing article.
  const query = `*[_type == "blogPost" && slug.current == $slug][0]{_id}`
  let existing
  try {
    existing = await client.fetch(query, { slug })
  } catch (err) {
    console.error('[Execora] create-blog-draft slug check failed:', err.message)
    return res.status(500).json({ error: 'Could not check for existing draft' })
  }

  if (existing) {
    return res.status(409).json({ error: 'A post with that slug already exists' })
  }

  try {
    await client.create(doc)
  } catch (err) {
    console.error('[Execora] create-blog-draft create failed:', err.message)
    return res.status(500).json({ error: 'Could not create blog draft' })
  }

  return res.status(200).json({
    ok: true,
    draftId: doc._id,
    slug,
    readingTime,
    note: 'Draft created. It is not published and requires review in Sanity Studio.',
  })
}

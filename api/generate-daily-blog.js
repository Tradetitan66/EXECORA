import { createClient } from '@sanity/client'
import { timingSafeEqual } from 'node:crypto'
import { convertToPortableText, ALLOWED_CATEGORIES } from './create-blog-draft.js'

export { ALLOWED_CATEGORIES }

export const config = { maxDuration: 120 }

/**
 * Execora — Automatic daily blog post generator
 * ---------------------------------------------------------------
 * Vercel serverless function triggered by Vercel Cron (two UTC
 * schedules) at 8:00 AM Europe/London daily. Generates a blog article
 * and featured image via OpenAI, uploads the image to Sanity, and
 * creates an unpublished draft document for human review.
 *
 * Vercel Cron calls it via GET (with Europe/London 8 AM + idempotency
 * guards). A manual POST also works for authenticated testing and
 * bypasses the time-window check.
 *
 * Requires server-only env vars:
 *   OPENAI_API_KEY
 *   OPENAI_TEXT_MODEL          (fallback: gpt-5.4-mini)
 *   OPENAI_IMAGE_MODEL         (fallback: gpt-image-1-mini)
 *   SANITY_WRITE_TOKEN
 *   NEXT_PUBLIC_SANITY_PROJECT_ID  (fallback: p0mpfgmr)
 *   NEXT_PUBLIC_SANITY_DATASET     (fallback: production)
 *   CRON_SECRET
 *
 * Methods: GET (Vercel Cron) and POST (manual test)
 * Auth:    Authorization: Bearer <CRON_SECRET>
 */

const OPENAI_BASE = 'https://api.openai.com/v1'
const WORDS_PER_MINUTE = 220

// ---------------------------------------------------------------------------
// Sanity client
// ---------------------------------------------------------------------------

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

export function setClientFactory(fn) {
  _clientFactory = fn || defaultClientFactory
}

// ---------------------------------------------------------------------------
// OpenAI fetch wrappers (injectable for testing)
// ---------------------------------------------------------------------------

let _openaiFetch = defaultOpenaiFetch
let _imageFetch = defaultImageFetch

function defaultOpenaiFetch({ apiKey, model, body }) {
  return fetchWithRetry(`${OPENAI_BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, ...body }),
  })
}

function defaultImageFetch({ apiKey, model, body }) {
  return fetchWithRetry(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, n: 1, ...body }),
  })
}

export function setOpenaiFetch(fn) {
  _openaiFetch = fn || defaultOpenaiFetch
}

export function setImageFetch(fn) {
  _imageFetch = fn || defaultImageFetch
}

async function fetchWithRetry(url, opts, retries = 1) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(90_000) })
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await new Promise((r) => setTimeout(r, 2_000))
    return fetchWithRetry(url, opts, retries - 1)
  }
  return res
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function getLondonDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}

/**
 * Test-run mode only activates for an authenticated POST request whose URL
 * contains ?test=true. GET requests (including Vercel Cron) and any non-POST
 * method never enable test mode, even if ?test=true is supplied.
 */
export function getTestMode(req) {
  if (req.method !== 'POST') return false
  const url = typeof req.url === 'string' ? req.url : ''
  const query = url.split('?')[1] || ''
  const params = new URLSearchParams(query)
  return params.get('test') === 'true'
}

let _londonHourOverride = null

/**
 * Override the London hour value used by the handler. Pass null to restore
 * real-time behaviour. Exported for testing only.
 */
export function setLondonHourOverride(hour) {
  _londonHourOverride = hour
}

export function getLondonHour(now = new Date()) {
  if (_londonHourOverride !== null) return _londonHourOverride
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now).find((p) => p.type === 'hour').value
  )
}

// ---------------------------------------------------------------------------
// Word counting
// ---------------------------------------------------------------------------

export function countWords(text) {
  if (typeof text !== 'string') return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ---------------------------------------------------------------------------
// Sanity helpers
// ---------------------------------------------------------------------------

export async function getRecentTopics(client) {
  const posts = await client.fetch(
    `*[_type == "blogPost"] | order(publishedDate desc)[0...60]{title, category}`
  )
  return {
    titles: posts.map((p) => p.title).filter(Boolean),
    categories: posts.map((p) => p.category).filter(Boolean),
  }
}

export async function checkDuplicate(client, date) {
  const draftId = `drafts.blogPost-auto-${date}`
  const pubId = `blogPost-auto-${date}`
  const [draft, pub] = await Promise.all([
    client.fetch(`*[_id == $id][0]._id`, { id: draftId }),
    client.fetch(`*[_id == $id][0]._id`, { id: pubId }),
  ])
  return !!(draft || pub)
}

export async function uploadImage(client, slug, b64Data) {
  const buffer = Buffer.from(b64Data, 'base64')
  const asset = await client.assets.upload('image', buffer, {
    filename: `${slug}.png`,
    contentType: 'image/png',
  })
  return asset._id
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildArticlePrompt(recentTopics, settings = null) {
  const topicsList = recentTopics.titles.length
    ? `\n\nRecent blog posts (DO NOT repeat, rewrite or closely overlap these topics):\n${recentTopics.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : ''

  const categoryHint = recentTopics.categories.length
    ? `\n\nRecent category distribution (rotate naturally, do not over-use any single category):\n${recentTopics.categories.join(', ')}`
    : ''

  // Owner-supplied guidance supplements (never replaces) the hard-coded rules.
  const guidance = []
  if (settings && settings.articleContentPrompt) {
    guidance.push(`EDITORIAL FOCUS:\n${settings.articleContentPrompt}`)
  }
  if (settings && settings.articleTonePrompt) {
    guidance.push(`WRITING STYLE:\n${settings.articleTonePrompt}`)
  }
  if (settings && settings.articleAvoidPrompt) {
    guidance.push(`AVOID:\n${settings.articleAvoidPrompt}`)
  }
  if (settings && settings.articleCtaPrompt) {
    guidance.push(`CALL TO ACTION:\n${settings.articleCtaPrompt}`)
  }
  if (settings && settings.nextArticleTopic) {
    guidance.push(`NEXT ARTICLE TOPIC:\n${settings.nextArticleTopic}`)
  }
  const guidanceBlock = guidance.length ? `\n\nOwner guidance (supplement the rules above):\n${guidance.join('\n\n')}` : ''

  return {
    system: [
      'You are an expert content writer for a UK local business technology company called Execora.',
      'Write genuinely useful, practical articles that help UK local business owners improve their websites, attract more customers, and grow their businesses.',
      'Use British English throughout (e.g. optimise, colour, organisation, enquiry).',
      'Focus on practical actions the reader can take today.',
      'Never use em dashes. Use commas, colons, or full stops instead.',
      'Avoid generic AI phrases such as "in today\'s digital landscape", "harness the power of", "in this article we will explore", or "it goes without saying".',
      'Never invent statistics, studies, quotes, or case studies.',
      'Never stuff keywords or write excessive promotional content about Execora.',
      'End with a practical checklist the reader can use immediately.',
      'Include a natural, restrained mention of Execora near the end (one or two sentences maximum).',
      'The article should be genuinely helpful even if the reader never buys from Execora.',
      'Rotate naturally between these categories: Website Tips, Local Business, Google & SEO, Customer Experience, Business Growth.',
    ].join(' '),
    user: [
      'Write a practical, SEO-optimised blog article for UK local business owners.',
      'The article must be 1,200 to 1,400 words, with a hard target not to exceed 1,500 words.',
      'It must have a clear, useful title, a strong practical introduction, H2 and H3 headings, short paragraphs, actionable bullet points, concrete examples, and end with a practical checklist.',
      'Do not use em dashes anywhere in the article.',
      topicsList,
      categoryHint,
      'Useful topics include: website conversion, local SEO, Google Business Profile, customer reviews, lead generation, booking and enquiry processes, trust signals, mobile experience, customer retention, email or WhatsApp follow-up, pricing communication, simple business systems, useful no-code automation.',
      'For the imagePrompt field, describe one clear visual concept representing the article\'s main problem or solution within a specific local-business setting relevant to the topic (for example a UK high-street shop, café, salon, trades business, clinic, restaurant or professional service). Include relevant objects such as a smartphone, website screen, booking calendar, review card, map pin, storefront, tools or a customer enquiry. Add a subtle British local touch through architecture, pavement, shopfront design, weather, streetscape or the business environment, and specify the exact composition, main subject and supporting objects. The generated image must contain no written words. Avoid generic instructions such as "an AI business image" or "a business owner using technology".',
      'Avoid: generic motivational advice, unsupported statistics, invented studies, fake quotes or case studies, keyword stuffing, excessive promotion of Execora, repetitive listicles, US-specific legal, tax or business advice, claims that require a professional adviser.',
      guidanceBlock,
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// JSON schema for Structured Outputs
// ---------------------------------------------------------------------------

export function getArticleJSONSchema() {
  return {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      slug: { type: 'string', maxLength: 96 },
      category: {
        type: 'string',
        enum: ['Website Tips', 'Local Business', 'Google & SEO', 'Customer Experience', 'Business Growth'],
      },
      excerpt: { type: 'string', maxLength: 320 },
      seoTitle: { type: 'string', maxLength: 60 },
      seoDescription: { type: 'string', minLength: 140, maxLength: 160 },
      imagePrompt: { type: 'string' },
      imageAlt: { type: 'string' },
      body: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            style: { type: 'string', enum: ['normal', 'h2', 'h3', 'blockquote'] },
            listItem: { type: ['string', 'null'], enum: ['bullet', 'number', null] },
            text: { type: 'string' },
          },
          required: ['style', 'listItem', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'slug', 'category', 'excerpt', 'seoTitle', 'seoDescription', 'imagePrompt', 'imageAlt', 'body'],
    additionalProperties: false,
  }
}

// ---------------------------------------------------------------------------
// Article validation
// ---------------------------------------------------------------------------

export function validateArticle(article) {
  if (!article || typeof article !== 'object') return { ok: false, error: 'Article is not an object' }

  const required = ['title', 'slug', 'category', 'excerpt', 'seoTitle', 'seoDescription', 'imagePrompt', 'imageAlt', 'body']
  for (const field of required) {
    if (article[field] === undefined || article[field] === null || article[field] === '') {
      return { ok: false, error: `Missing required field: ${field}` }
    }
  }

  if (!ALLOWED_CATEGORIES.includes(article.category)) {
    return { ok: false, error: `Invalid category: ${article.category}` }
  }

  if (typeof article.slug !== 'string' || article.slug.length > 96) {
    return { ok: false, error: 'Slug must be a string of 96 characters or fewer' }
  }

  if (typeof article.title !== 'string' || article.title.length > 120) {
    return { ok: false, error: 'Title must be a string of 120 characters or fewer' }
  }

  if (typeof article.excerpt !== 'string' || article.excerpt.length > 320) {
    return { ok: false, error: 'Excerpt must be a string of 320 characters or fewer' }
  }

  if (typeof article.seoTitle !== 'string' || article.seoTitle.length > 60) {
    return { ok: false, error: 'seoTitle must be a string of 60 characters or fewer' }
  }

  if (typeof article.seoDescription !== 'string' || article.seoDescription.length < 140 || article.seoDescription.length > 160) {
    return { ok: false, error: 'seoDescription must be 140-160 characters' }
  }

  if (!Array.isArray(article.body) || article.body.length === 0) {
    return { ok: false, error: 'body must be a non-empty array' }
  }

  if (article.body.length < 8) {
    return { ok: false, error: 'body must contain at least 8 blocks' }
  }

  for (const block of article.body) {
    if (!block || typeof block !== 'object' || typeof block.text !== 'string') {
      return { ok: false, error: 'Each body block must have a text string' }
    }
  }

  const totalWords = article.body.reduce((sum, b) => sum + countWords(b.text), 0)
  if (totalWords < 1100 || totalWords > 1650) {
    return { ok: false, error: `Article body word count (${totalWords}) is outside the acceptable range of 1,100-1,650` }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Image prompt with Execora visual identity
// ---------------------------------------------------------------------------

const IMAGE_PREFIX =
  'Premium hand-drawn crayon editorial illustration with subtle embossed 3D depth for an Execora business article. Use rounded dimensional forms, visible wax-pencil grain, soft paper texture, imperfect handcrafted edges and gentle grounded shadows. Colour palette: dominant warm off-white or ivory background, near-black and deep charcoal for main objects, muted antique gold for highlights, important symbols and small accents, and optional soft warm-grey or muted beige for secondary details. Aim for roughly 75% ivory, 20% near-black or charcoal and 5% muted gold. No bright green, red, orange, yellow, blue or rainbow colours. Show one simple visual metaphor that communicates the article topic, such as a damaged website screen losing a customer, a smartphone connecting a customer to a shop, an enquiry moving through a simple follow-up journey, a local shop becoming easier to find, a booking calendar filling with appointments, or reviews helping customers trust a business. Set it within a subtle UK local-business environment with independent shopfronts, cafés, salons, tradespeople, clinics, brick buildings, pavements or neighbourhood high streets, without tourist clichés. Sophisticated and editorial, not like a children\'s book. Avoid exaggerated cartoon faces unless the expression is necessary to communicate the article problem. No text, letters, numbers, logos, brand names or watermarks inside the image. No generic robots, futuristic dashboards, purple gradients, neon colours, glossy plastic materials or visual clutter. '

const MAX_STYLE_PROMPT_LENGTH = 4000
const MAX_NEGATIVE_PROMPT_LENGTH = 2000
const MAX_ARTICLE_GUIDANCE_LENGTH = 3000
const MAX_ARTICLE_TOPIC_LENGTH = 500

/**
 * Builds the fallback image prompt from the hard-coded style prefix and the
 * article-specific visual concept. Used when no published settings exist.
 */
export function buildImagePrompt(articleImagePrompt) {
  return IMAGE_PREFIX + articleImagePrompt
}

function clamp(text, max) {
  if (typeof text !== 'string') return ''
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max).trim()
}

/**
 * Fetches the published automation settings singleton. Returns an object with
 * the image and article guidance fields, or null if the document is missing,
 * unpublished, empty or cannot be fetched. Never throws.
 */
export async function getAutomationSettings(client) {
  try {
    const doc = await client.fetch(
      `*[_type == "blogAutomationSettings" && _id == "blogAutomationSettings"][0]{
        imageStylePrompt,
        imageNegativePrompt,
        articleContentPrompt,
        articleTonePrompt,
        articleAvoidPrompt,
        articleCtaPrompt,
        nextArticleTopic
      }`
    )
    if (!doc) return null
    return {
      imageStylePrompt: clamp(doc.imageStylePrompt, MAX_STYLE_PROMPT_LENGTH),
      imageNegativePrompt: clamp(doc.imageNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH),
      articleContentPrompt: clamp(doc.articleContentPrompt, MAX_ARTICLE_GUIDANCE_LENGTH),
      articleTonePrompt: clamp(doc.articleTonePrompt, MAX_ARTICLE_GUIDANCE_LENGTH),
      articleAvoidPrompt: clamp(doc.articleAvoidPrompt, MAX_ARTICLE_GUIDANCE_LENGTH),
      articleCtaPrompt: clamp(doc.articleCtaPrompt, MAX_ARTICLE_GUIDANCE_LENGTH),
      nextArticleTopic: clamp(doc.nextArticleTopic, MAX_ARTICLE_TOPIC_LENGTH),
    }
  } catch (err) {
    console.error('[generate-daily-blog] stage=automation_settings error:', err.message)
    return null
  }
}

/**
 * Composes the final image prompt in the order:
 *   settings imageStylePrompt (or IMAGE_PREFIX fallback)
 *   -> article-specific imagePrompt
 *   -> settings imageNegativePrompt
 */
export function composeImagePrompt({ articlePrompt = '', settings = null } = {}) {
  const stylePrompt =
    settings && settings.imageStylePrompt ? settings.imageStylePrompt : IMAGE_PREFIX.trim()
  const parts = [stylePrompt, articlePrompt.trim()]
  if (settings && settings.imageNegativePrompt) {
    parts.push(settings.imageNegativePrompt)
  }
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Article generation
// ---------------------------------------------------------------------------

export async function generateArticle({ apiKey, model, recentTopics, extraGuidance = '', settings = null }) {
  const { system, user } = buildArticlePrompt(recentTopics, settings)

  const input = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  if (extraGuidance) {
    input.push({
      role: 'user',
      content: `Please correct this previous attempt. Validation errors to fix: ${extraGuidance}`,
    })
  }

  const res = await _openaiFetch({
    apiKey,
    model,
    body: {
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'blog_article',
          strict: true,
          schema: getArticleJSONSchema(),
        },
      },
      reasoning: { effort: 'low' },
      max_output_tokens: 4096,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI text generation failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = await res.json()

  const outputItem = data.output && data.output.find((o) => o.type === 'message')
  if (!outputItem || !outputItem.content || !outputItem.content[0]) {
    throw new Error('OpenAI response contained no output text')
  }

  const text = outputItem.content[0].text
  if (!text) {
    throw new Error('OpenAI output text was empty')
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('OpenAI returned invalid JSON')
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export async function generateImage({ apiKey, model, prompt }) {
  const res = await _imageFetch({
    apiKey,
    model,
    body: {
      model,
      prompt,
      size: '1536x1024',
      quality: 'medium',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI image generation failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = await res.json()

  if (!data.data || !data.data[0] || !data.data[0].b64_json) {
    throw new Error('OpenAI image response contained no image data')
  }

  return data.data[0].b64_json
}

// ---------------------------------------------------------------------------
// Draft document builder
// ---------------------------------------------------------------------------

export function buildDraftDocument({ article, imageAssetId, date }) {
  const slug = article.slug
  const docId = `drafts.blogPost-auto-${date}`
  const wordCount = article.body.reduce((sum, b) => sum + countWords(b.text), 0)
  const readingTime = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE))

  const doc = {
    _id: docId,
    _type: 'blogPost',
    title: article.title,
    slug: { _type: 'slug', current: slug },
    category: article.category,
    excerpt: article.excerpt,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    publishedDate: `${date}T00:00:00.000Z`,
    readingTime,
    body: convertToPortableText(article.body),
  }

  if (imageAssetId) {
    doc.image = {
      _type: 'image',
      asset: { _type: 'reference', _ref: imageAssetId },
      alt: article.imageAlt || '',
    }
  }

  return doc
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const supplied = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : ''

  if (supplied.length === 0) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'Blog automation endpoint is not configured' })
  }

  let isValid = false
  try {
    const a = Buffer.from(supplied)
    const b = Buffer.from(secret)
    if (a.length === b.length) {
      isValid = timingSafeEqual(a, b)
    }
  } catch {
    isValid = false
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // For Vercel Cron (GET), only generate during the Europe/London 8 AM window.
  // This check runs before any OpenAI call or charge. Manual POST tests bypass
  // the time-window check entirely.
  if (req.method === 'GET' && getLondonHour() !== 8) {
    return res.status(200).json({
      skipped: true,
      reason: 'Outside the Europe/London 8 AM generation window',
    })
  }

  // Test mode: POST ?test=true only. Never activated by GET/Cron.
  const testMode = getTestMode(req)

  const openaiKey = process.env.OPENAI_API_KEY
  const writeToken = process.env.SANITY_WRITE_TOKEN
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'p0mpfgmr'
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'

  if (!openaiKey || !writeToken) {
    return res.status(500).json({ error: 'Blog automation endpoint is not configured' })
  }

  const textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini'
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini'

  const date = getLondonDate()
  const client = _clientFactory({ projectId, dataset, token: writeToken })

  // Fetch the published automation settings once and reuse them for both
  // article and image generation. Failures fall back to the hard-coded prompts.
  let settings = null
  try {
    settings = await getAutomationSettings(client)
  } catch (err) {
    console.error('[generate-daily-blog] stage=automation_settings error:', err.message)
  }

  // --- Idempotency (skipped in test mode) ---
  if (!testMode) {
    try {
      const exists = await checkDuplicate(client, date)
      if (exists) {
        return res.status(200).json({
          skipped: true,
          reason: 'A daily blog post already exists for this date',
        })
      }
    } catch (err) {
      console.error('[generate-daily-blog] stage=idempotency_check error:', err.message)
      return res.status(500).json({ error: 'Could not check for existing posts' })
    }
  }

  // --- Recent topics ---
  let recentTopics = { titles: [], categories: [] }
  try {
    recentTopics = await getRecentTopics(client)
  } catch (err) {
    console.error('[generate-daily-blog] stage=recent_topics error:', err.message)
    return res.status(500).json({ error: 'Could not fetch recent posts' })
  }

  // --- Generate article ---
  let article
  try {
    article = await generateArticle({ apiKey: openaiKey, model: textModel, recentTopics, settings })
  } catch (err) {
    console.error('[generate-daily-blog] stage=text_generation error:', err.message)
    return res.status(502).json({ error: 'Article generation failed' })
  }

  // --- Validate ---
  let validation = validateArticle(article)
  if (!validation.ok) {
    try {
      article = await generateArticle({
        apiKey: openaiKey,
        model: textModel,
        recentTopics,
        extraGuidance: validation.error,
        settings,
      })
      validation = validateArticle(article)
    } catch (err) {
      console.error('[generate-daily-blog] stage=text_retry error:', err.message)
      return res.status(502).json({ error: 'Article generation failed on retry' })
    }
  }

  if (!validation.ok) {
    console.error('[generate-daily-blog] stage=validation error:', validation.error)
    return res.status(502).json({ error: 'Generated article failed validation' })
  }

  // --- Generate image ---
  let imageB64
  try {
    // Published automation settings override the style; failures fall back to IMAGE_PREFIX.
    const imagePrompt = composeImagePrompt({ articlePrompt: article.imagePrompt, settings })
    imageB64 = await generateImage({
      apiKey: openaiKey,
      model: imageModel,
      prompt: imagePrompt,
    })
  } catch (err) {
    console.error('[generate-daily-blog] stage=image_generation error:', err.message)
    return res.status(502).json({ error: 'Image generation failed' })
  }

  // --- Upload image ---
  let imageAssetId
  try {
    imageAssetId = await uploadImage(client, article.slug, imageB64)
  } catch (err) {
    console.error('[generate-daily-blog] stage=image_upload error:', err.message)
    return res.status(500).json({ error: 'Image upload failed' })
  }

  // --- Create draft ---
  let doc
  if (testMode) {
    const timestamp = Date.now()
    const testId = `drafts.blogPost-test-${date}-${timestamp}`
    const base = buildDraftDocument({ article, imageAssetId, date })
    doc = {
      ...base,
      _id: testId,
      title: `[TEST] ${article.title}`,
    }
  } else {
    doc = buildDraftDocument({ article, imageAssetId, date })
  }

  try {
    await client.create(doc)
  } catch (err) {
    console.error('[generate-daily-blog] stage=create_draft error:', err.message)
    return res.status(500).json({ error: 'Could not create blog draft' })
  }

  // Clear the one-time nextArticleTopic only after a successful *normal* (non-test)
  // daily draft is created. Do not clear on failure or during a test run.
  if (!testMode && settings && settings.nextArticleTopic) {
    try {
      await client
        .patch('blogAutomationSettings')
        .set({ nextArticleTopic: '' })
        .commit()
    } catch (err) {
      console.error('[generate-daily-blog] stage=clear_next_topic error:', err.message)
    }
  }

  const response = {
    ok: true,
    draftId: doc._id,
    slug: article.slug,
    date,
    note: 'Draft created. It is not published and requires review in Sanity Studio.',
  }
  if (testMode) {
    response.testRun = true
    response.docType = 'draft'
  }
  return res.status(200).json(response)
}

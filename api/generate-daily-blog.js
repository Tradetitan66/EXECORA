import { createClient } from '@sanity/client'
import { timingSafeEqual } from 'node:crypto'
import { convertToPortableText, ALLOWED_CATEGORIES } from './create-blog-draft.js'

export { ALLOWED_CATEGORIES }

export const config = { maxDuration: 120 }

/**
 * Execora — Automatic daily blog post generator
 * ---------------------------------------------------------------
 * Vercel serverless function triggered by Vercel Cron (two UTC
 * schedules) at 8:00 AM Europe/London on Mondays, Wednesdays and
 * Fridays. Generates a blog article and featured image via OpenAI,
 * uploads the image to Sanity, and creates an unpublished draft
 * document for human review.
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

// SEO keyword architecture: the specific, commercially relevant search topics
// Execora articles should own. The owner can replace this list entirely from the
// Sanity dashboard by publishing a keywordGuidance value.
export const KEYWORD_ARCHITECTURE = [
  // Primary commercial
  'website design for local businesses',
  'small business website design',
  'small business website UK',
  'affordable website design UK',
  'website design for trades',
  'web design for tradesmen',
  'website design Edinburgh',
  'web design Edinburgh',
  // Trades
  'plumber website design',
  'electrician website design',
  'builder website design',
  'handyman website design',
  'painter decorator website',
  'roofing website design',
  'heating engineer website',
  // Local SEO
  'local SEO for small business',
  'local SEO UK',
  'Google Business Profile optimisation',
  'Google Maps ranking',
  'how to rank local business on Google',
  'Google reviews local SEO',
  // Lead generation / conversion
  'get more website enquiries',
  'website not generating leads',
  'convert website visitors into customers',
  'small business lead generation',
  'online booking for local business',
  'WhatsApp enquiries website',
  'website conversion for small business',
  // Informational decision-making
  'does a small business need a website',
  'how much does a small business website cost UK',
  'what should a small business website include',
  'how many pages should a small business website have',
  'Google Business Profile vs website',
  'Facebook page vs website for small business',
  'how to improve local business website',
]

// Execora geography: Edinburgh is the primary market, with secondary local
// areas for natural rotation when a location genuinely adds relevance.
const GEOGRAPHY_PRIMARY = 'Edinburgh'
const GEOGRAPHY_SECONDARY = 'Penicuik, Musselburgh, Dalkeith, Loanhead, Livingston, Midlothian, East Lothian and West Lothian'

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
  // A published keywordGuidance overrides the built-in keyword architecture.
  // Failures fall back to the hard-coded list below via the dataTemplate.
  if (settings && settings.keywordGuidance) {
    guidance.push(`SEO SEARCH TARGETS (owner override - work within these):\n${settings.keywordGuidance}`)
  }
  const guidanceBlock = guidance.length ? `\n\nOwner guidance (supplement the rules above):\n${guidance.join('\n\n')}` : ''

  const keywordList = settings && settings.keywordGuidance
    ? null
    : `\n\nPriority search topics (choose ONE primary keyword and 3-6 secondary terms from this list):\n${KEYWORD_ARCHITECTURE.map((k, i) => `${i + 1}. ${k}`).join('\n')}`

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
      'Build credible topical authority for UK local businesses: favour specific, search-focussed topics that could only have been written for this audience over generic commodity advice.',
    ].join(' '),
    user: [
      'Write a practical, SEO-optimised blog article for UK local business owners.',
      'Aim for approximately 900 to 1,500 words depending on the search intent. Do not add sections merely to reach a word count; a simple question may be answered in 800-1,000 words, while a complex guide may use up to 1,500. Every section must contribute something useful.',
      'It must have a clear, useful title, a strong practical introduction, H2 and H3 headings, short paragraphs, actionable bullet points, concrete examples, and end with a practical checklist.',
      'Do not use em dashes anywhere in the article.',
      topicsList,
      categoryHint,
      'SEO SEARCH INTENT:\nChoose ONE primary keyword and 3 to 6 closely related secondary terms, and record them in primaryKeyword and secondaryKeywords. Prefer specific, problem-based queries UK local business owners realistically search for. Record the dominant search intent in the searchIntent field using one of: informational, commercial investigation, local or transactional. Record the relevant topic cluster in contentCluster. Use keywords naturally and never force exact-match keywords.',
      'TOPIC CLUSTERS:\nBuild topical authority rather than producing unrelated daily articles. Rotate naturally between these clusters: Website Design for Local Businesses, Local SEO, Google Business Profile, Website Conversion, Lead Generation, Trades Websites, Customer Experience, Business Systems. Support and reinforce existing clusters where possible.',
      'GEOGRAPHY:\nExecora\'s primary local market is ' + GEOGRAPHY_PRIMARY + ', with secondary areas ' + GEOGRAPHY_SECONDARY + ', plus wider Scotland for informational topics. Use a location naturally only when it genuinely adds relevance; never stuff location keywords. Record any location in the targetLocation field.',
      'ANSWER-FIRST WRITING:\nWhenever an H2 or H3 asks a question, answer it directly within the first 1 to 3 sentences before expanding. Write definitions, explanations and recommendations so they make sense when read independently and are quotable by search engines and AI systems. Do not deliberately break content into unnatural chunks for AI systems.',
      'INTERNAL LINKS:\nSuggest 2 to 4 relevant internal links using the internalLinks array. Each entry needs anchor text, a target (Execora service page or related blog article, for example /website-design, /local-seo or /blog/slug) and type "internal". Use concise descriptive natural anchor text. Never use generic anchors such as "click here", "learn more" or "read more".',
      'SOURCE QUALITY:\nWhen making a factual claim that benefits from authoritative evidence, use the externalSources array with a source label and URL, preferring trustworthy UK or first-party sources such as Google Search Central, Google Business Profile documentation, GOV.UK, the Scottish Government, ONS or ICO. Never invent citations or add links for their own sake.',
      keywordList,
      'EXECORA COMMERCIAL RELEVANCE:\nEducate first. Where genuinely relevant near the end, briefly explain how professional website design, local SEO or enquiry optimisation can help solve the problem. Mention Execora no more than twice, and never force Execora into a topic where it adds no value.',
      'CONTENT MIX:\nRotate article types to cover education, problem/solution, and commercial investigation. Include decision-oriented topics where genuinely useful, such as how much a small business website costs in the UK, Wix vs a professional website, whether tradespeople still need a website if they have a Facebook page, Google Business Profile vs a website, or whether a small business should pay monthly for a website.',
      'NICHE ROTATION:\nRotate across UK local-business niches, especially trades and service businesses such as plumbers, heating engineers, electricians, builders, painters and decorators, handymen, roofers, landscapers, cleaners, salons, barbers, cafés, restaurants, clinics and professional services. Prefer specific, commercially relevant niche topics (for example "Why plumbers get Google views but no website enquiries") over generic advice.',
      'SEO META:\nKeep the seoTitle around 50-60 characters and the seoDescription 140-160 characters, describing genuine value without hype. Keep the slug short and keyword-focussed. Set author to "Execora Editorial Team".',
      'For the imagePrompt field, describe one clear visual concept representing the article\'s main problem or solution within a specific local-business setting relevant to the topic (for example a UK high-street shop, café, salon, trades business, clinic, restaurant or professional service). Include relevant objects such as a smartphone, website screen, booking calendar, review card, map pin, storefront, tools or a customer enquiry. Add a subtle British local touch through architecture, pavement, shopfront design, weather, streetscape or the business environment, and specify the exact composition, main subject and supporting objects. The generated image must contain no written words. Avoid generic instructions such as "an AI business image" or "a business owner using technology".',
      'Avoid: generic commodity topics that could have been written for any business anywhere, generic motivational advice, unsupported statistics, invented studies, fake quotes or case studies, keyword stuffing, excessive promotion of Execora, repetitive listicles, US-specific legal, tax or business advice, claims that require a professional adviser.',
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
      primaryKeyword: { type: 'string', maxLength: 100 },
      secondaryKeywords: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 100 },
      },
      searchIntent: {
        type: 'string',
        enum: ['informational', 'commercial investigation', 'local', 'transactional'],
      },
      contentCluster: { type: 'string', maxLength: 60 },
      targetLocation: { type: 'string', maxLength: 80 },
      author: { type: 'string', maxLength: 120 },
      internalLinks: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            anchor: { type: 'string', maxLength: 120 },
            target: { type: 'string', maxLength: 160 },
            type: { type: 'string', enum: ['internal', 'external'] },
          },
          required: ['anchor', 'target', 'type'],
          additionalProperties: false,
        },
      },
      externalSources: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 120 },
            url: { type: 'string', maxLength: 300 },
          },
          required: ['label', 'url'],
          additionalProperties: false,
        },
      },
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
    required: [
      'title', 'slug', 'category', 'excerpt', 'seoTitle', 'seoDescription',
      'primaryKeyword', 'secondaryKeywords', 'searchIntent', 'contentCluster',
      'targetLocation', 'author', 'internalLinks', 'externalSources',
      'imagePrompt', 'imageAlt', 'body',
    ],
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

  // SEO metadata fields are informational. When present they must have the
  // correct shape (so drafts render cleanly), but a missing value never blocks
  // generation - buildDraftDocument supplies sensible defaults.
  if (article.primaryKeyword !== undefined && article.primaryKeyword !== null && typeof article.primaryKeyword !== 'string') {
    return { ok: false, error: 'primaryKeyword must be a string' }
  }
  if (article.primaryKeyword !== undefined && typeof article.primaryKeyword === 'string' && article.primaryKeyword.length > 100) {
    return { ok: false, error: 'primaryKeyword must be 100 characters or fewer' }
  }

  if (article.secondaryKeywords !== undefined && article.secondaryKeywords !== null) {
    if (!Array.isArray(article.secondaryKeywords) || article.secondaryKeywords.some((k) => typeof k !== 'string')) {
      return { ok: false, error: 'secondaryKeywords must be an array of strings' }
    }
    if (article.secondaryKeywords.length > 6) {
      return { ok: false, error: 'secondaryKeywords must contain at most 6 terms' }
    }
  }

  if (article.searchIntent !== undefined && article.searchIntent !== null && !ALLOWED_SEARCH_INTENTS.includes(article.searchIntent)) {
    return { ok: false, error: `searchIntent must be one of: ${ALLOWED_SEARCH_INTENTS.join(', ')}` }
  }

  if (article.contentCluster !== undefined && article.contentCluster !== null && typeof article.contentCluster !== 'string') {
    return { ok: false, error: 'contentCluster must be a string' }
  }
  if (article.contentCluster !== undefined && typeof article.contentCluster === 'string' && article.contentCluster.length > 60) {
    return { ok: false, error: 'contentCluster must be 60 characters or fewer' }
  }

  if (article.targetLocation !== undefined && article.targetLocation !== null && typeof article.targetLocation !== 'string') {
    return { ok: false, error: 'targetLocation must be a string' }
  }

  if (article.author !== undefined && article.author !== null && typeof article.author !== 'string') {
    return { ok: false, error: 'author must be a string' }
  }

  if (article.internalLinks !== undefined && article.internalLinks !== null && !Array.isArray(article.internalLinks)) {
    return { ok: false, error: 'internalLinks must be an array' }
  }
  if (article.internalLinks !== undefined && Array.isArray(article.internalLinks)) {
    for (const link of article.internalLinks) {
      if (!link || typeof link !== 'object' || typeof link.anchor !== 'string' || typeof link.target !== 'string' || !['internal', 'external'].includes(link.type)) {
        return { ok: false, error: 'Each internalLinks entry needs a string anchor, target and type (internal|external)' }
      }
    }
  }

  if (article.externalSources !== undefined && article.externalSources !== null && !Array.isArray(article.externalSources)) {
    return { ok: false, error: 'externalSources must be an array' }
  }
  if (article.externalSources !== undefined && Array.isArray(article.externalSources)) {
    for (const source of article.externalSources) {
      if (!source || typeof source !== 'object' || typeof source.label !== 'string' || typeof source.url !== 'string') {
        return { ok: false, error: 'Each externalSources entry needs a string label and url' }
      }
    }
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
  if (totalWords < MIN_ARTICLE_WORDS || totalWords > MAX_ARTICLE_WORDS) {
    return { ok: false, error: `Article body word count (${totalWords}) is outside the acceptable range of ${MIN_ARTICLE_WORDS}-${MAX_ARTICLE_WORDS}` }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Image prompt with Execora visual identity
// ---------------------------------------------------------------------------

const IMAGE_PREFIX =
  'Premium 3D clay illustration in a soft, rounded, matte-plastic style for an Execora business article. Use smooth pillowy 3D forms with subtle soft shadows and gentle ambient occlusion. Subject rendered as tactile clay shapes that look hand-modelled, with soft rounded edges and a smooth matte surface. Colour palette: dominant warm ivory (#F3EBD8) background, near-black (#292524) for main subjects, muted antique gold (#C9A45C) for accents, highlights and important details, soft coral (#FFB7B2) for secondary accents and small interactive elements, and warm grey (#78716C) for supporting details. Show one clear visual metaphor representing the article topic, set within a subtle UK local-business environment such as shopfronts, salons, cafés, trades businesses, clinics, brick buildings or neighbourhood high streets. Sophisticated and editorial, not cartoonish. Avoid glossy or metallic surfaces, realistic textures, or complex patterns. No text, letters, numbers, logos, brand names or watermarks inside the image. '

const MAX_STYLE_PROMPT_LENGTH = 4000
const MAX_NEGATIVE_PROMPT_LENGTH = 2000
const MAX_ARTICLE_GUIDANCE_LENGTH = 3000
const MAX_ARTICLE_TOPIC_LENGTH = 500
const MAX_MODEL_LENGTH = 100
const MAX_KEYWORD_GUIDANCE_LENGTH = 3000

// Search-intent options for the article's primary keyword, stored per post.
const ALLOWED_SEARCH_INTENTS = ['informational', 'commercial investigation', 'local', 'transactional']

// Acceptable article length. The prompt asks for ~900-1,500 words by intent;
// validation tolerates a small buffer on either side so a borderline draft
// still gets created for human review instead of failing the run.
const MIN_ARTICLE_WORDS = 800
const MAX_ARTICLE_WORDS = 1600

// Allowlisted OpenAI models the owner may select from the Sanity dashboard.
// Only these values are accepted from the singleton; anything else falls back
// to the env-var default so an invalid model can never break generation.
const ALLOWED_TEXT_MODELS = ['gpt-5-mini', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini']
const ALLOWED_IMAGE_MODELS = ['gpt-image-1-mini', 'gpt-image-1']

/**
 * Resolves the article model: prefer an allowlisted Sanity value, else the
 * env-var/default fallback.
 */
export function resolveTextModel(settingsModel, fallback) {
  if (typeof settingsModel === 'string' && ALLOWED_TEXT_MODELS.includes(settingsModel.trim())) {
    return settingsModel.trim()
  }
  return fallback
}

/**
 * Resolves the image model: prefer an allowlisted Sanity value, else the
 * env-var/default fallback.
 */
export function resolveImageModel(settingsModel, fallback) {
  if (typeof settingsModel === 'string' && ALLOWED_IMAGE_MODELS.includes(settingsModel.trim())) {
    return settingsModel.trim()
  }
  return fallback
}

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
        nextArticleTopic,
        keywordGuidance,
        textModel,
        imageModel
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
      keywordGuidance: clamp(doc.keywordGuidance, MAX_KEYWORD_GUIDANCE_LENGTH),
      textModel: clamp(doc.textModel, MAX_MODEL_LENGTH),
      imageModel: clamp(doc.imageModel, MAX_MODEL_LENGTH),
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
    // Structured SEO metadata. Defaults keep old drafts and partial model
    // output renderable; fields are informational, never required to publish.
    primaryKeyword: article.primaryKeyword || '',
    secondaryKeywords: Array.isArray(article.secondaryKeywords)
      ? article.secondaryKeywords.filter((k) => typeof k === 'string').slice(0, 6)
      : [],
    searchIntent: article.searchIntent || '',
    contentCluster: article.contentCluster || '',
    targetLocation: article.targetLocation || '',
    author: article.author || 'Execora Editorial Team',
    relatedLinks: Array.isArray(article.internalLinks)
      ? article.internalLinks
          .filter((l) => l && typeof l.anchor === 'string' && typeof l.target === 'string')
          .slice(0, 6)
          .map((l) => ({
            anchor: l.anchor,
            target: l.target,
            type: l.type === 'external' ? 'external' : 'internal',
          }))
      : [],
    externalSources: Array.isArray(article.externalSources)
      ? article.externalSources
          .filter((s) => s && typeof s.label === 'string' && typeof s.url === 'string')
          .slice(0, 6)
      : [],
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

  // Resolve models from the published singleton when allowlisted, otherwise
  // fall back to the env-var defaults. Never throws on invalid/empty values.
  const usedTextModel = resolveTextModel(settings && settings.textModel, textModel)
  const usedImageModel = resolveImageModel(settings && settings.imageModel, imageModel)

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
    article = await generateArticle({ apiKey: openaiKey, model: usedTextModel, recentTopics, settings })
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
        model: usedTextModel,
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
      model: usedImageModel,
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

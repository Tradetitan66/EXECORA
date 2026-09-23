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
    `*[_type == "blogPost"] | order(publishedDate desc)[0...60]{title, category, slug, externalSources, funnelStage, industry}`
  )
  const recentUrls = []
  for (const p of posts) {
    for (const s of p.externalSources || []) {
      const url = s && typeof s.url === 'string' ? s.url.trim() : ''
      if (url && !recentUrls.includes(url)) recentUrls.push(url)
    }
  }
  return {
    titles: posts.map((p) => p.title).filter(Boolean),
    categories: posts.map((p) => p.category).filter(Boolean),
    slugs: posts.map((p) => p.slug?.current).filter(Boolean),
    sourceUrls: recentUrls,
    funnelStages: posts.map((p) => p.funnelStage).filter(Boolean),
    industries: posts.map((p) => p.industry).filter(Boolean),
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

// Industry-keyed keyword architecture: the specific, commercially relevant
// search topics Execora articles should own, grouped by the rotation cycle.
// The owner can replace this entirely from the Sanity dashboard by publishing
// a keywordGuidance value.
export const INDUSTRY_ORDER = [
  'Electricians',
  'Plumbers',
  'Builders',
  'General Trades',
  'Roofers',
  'Kitchen & Bathroom Installers',
  'Landscapers',
  'Garage & Automotive',
  'Comparison',
  'Pricing & Costs',
]

export const INDUSTRY_KEYWORDS = {
  Electricians: [
    'website for electricians UK',
    'electrician website design UK',
    'electrician website examples UK',
    'electrician website cost UK',
    'does an electrician need a website',
    'best website layout for electricians',
    'what should an electrician website include',
    'how to get more electrician enquiries',
  ],
  Plumbers: [
    'plumber website design UK',
    'website for plumbers UK',
    'plumber website examples',
    'plumber website cost UK',
    'does a plumber need a website',
    'best website layout for plumbers',
    'what should a plumber website include',
    'how plumbers can get more local customers',
  ],
  Builders: [
    'website for builders UK',
    'builder website design UK',
    'builder website examples',
    'builder website cost UK',
    'what should a builder website include',
    'best website layout for builders',
  ],
  'General Trades': [
    'tradesman website design UK',
    'trades website cost UK',
    'website for tradespeople',
    'best website builder for tradespeople',
    'do tradespeople need a website',
    'what should a trades website include',
    'handyman website design',
    'painter decorator website',
    'heating engineer website',
  ],
  Roofers: [
    'roofing website design UK',
    'website for roofers UK',
    'roofer website cost UK',
    'what should a roofer website include',
  ],
  'Kitchen & Bathroom Installers': [
    'website for kitchen fitters',
    'website for bathroom installers',
    'kitchen installer website design',
    'bathroom fitter website examples',
  ],
  Landscapers: [
    'website for landscapers',
    'landscaper website design UK',
    'landscaping website examples',
  ],
  'Garage & Automotive': [
    'website for garages UK',
    'automotive garage website design',
    'car garage website examples',
  ],
  Comparison: [
    'Google Business Profile vs website',
    'Facebook page vs website for small business',
    'website vs Checkatrade',
    'website vs MyBuilder',
    'website vs Rated People',
    'is Google Business Profile enough without a website',
  ],
  'Pricing & Costs': [
    'how much does a trades website cost UK',
    'how much does a small business website cost UK',
    'how much should a website cost UK',
    'monthly website vs one-off website',
    'cheap website vs professional website',
  ],
}

// Deterministic industry rotation: the industry in INDUSTRY_ORDER with the
// fewest recent posts wins, so a single trade never dominates the blog.
export function pickIndustry(recentIndustries = []) {
  const industries = recentIndustries || []
  const counts = {}
  for (const ind of industries) {
    if (INDUSTRY_ORDER.includes(ind)) counts[ind] = (counts[ind] || 0) + 1
  }
  let chosen = INDUSTRY_ORDER[0]
  let chosenCount = Infinity
  for (const ind of INDUSTRY_ORDER) {
    const n = counts[ind] || 0
    if (n < chosenCount) {
      chosen = ind
      chosenCount = n
    }
  }
  return chosen
}

// Funnel-stage allocation: BOFU 50%, MOFU 35%, TOFU 15% of the recent window,
// picking whichever stage is most below its target share (tie-break BOFU then
// MOFU then TOFU) so commercial articles stay dominant.
export const FUNNEL_STAGES = ['BOFU', 'MOFU', 'TOFU']
const FUNNEL_TARGETS = { BOFU: 0.5, MOFU: 0.35, TOFU: 0.15 }

export function pickFunnelStage(recentFunnelStages = []) {
  const stages = recentFunnelStages || []
  const counts = {}
  for (const s of stages) {
    if (FUNNEL_STAGES.includes(s)) counts[s] = (counts[s] || 0) + 1
  }
  const total = Math.max(stages.length, 1)
  let chosen = FUNNEL_STAGES[0]
  let chosenGap = -Infinity
  for (const stage of FUNNEL_STAGES) {
    const share = (counts[stage] || 0) / total
    const gap = FUNNEL_TARGETS[stage] - share
    if (gap > chosenGap) {
      chosen = stage
      chosenGap = gap
    }
  }
  return chosen
}

// Execora geography: Edinburgh is the primary market, with secondary local
// areas for natural rotation when a location genuinely adds relevance.
const GEOGRAPHY_PRIMARY = 'Edinburgh'
const GEOGRAPHY_SECONDARY = 'Penicuik, Musselburgh, Dalkeith, Loanhead, Livingston, Midlothian, East Lothian and West Lothian'

// Pick the least-used article category from the recent flattened list so the
// automation rotates evenly across all categories instead of stacking one.
// Ties break in the order categories are listed (deterministic for tests).
export function pickCategory(recentCategories = []) {
  const categories = recentCategories || []
  const counts = {}
  for (const cat of categories) {
    if (ALLOWED_CATEGORIES.includes(cat)) counts[cat] = (counts[cat] || 0) + 1
  }
  let chosen = ALLOWED_CATEGORIES[0]
  let chosenCount = Infinity
  for (const cat of ALLOWED_CATEGORIES) {
    const n = counts[cat] || 0
    if (n < chosenCount) {
      chosen = cat
      chosenCount = n
    }
  }
  return chosen
}

export function buildArticlePrompt(recentTopics, settings = null) {
  const topicsList = recentTopics.titles.length
    ? `\n\nRecent blog posts (DO NOT repeat, rewrite or closely overlap these topics):\n${recentTopics.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : ''

  const categoryHint = recentTopics.categories.length
    ? `\n\nRecent category distribution (rotate naturally, do not over-use any single category):\n${recentTopics.categories.join(', ')}`
    : ''

  // Real internal link targets the model is allowed to reference. These are the
  // slugs of currently published blog posts, so internal links never 404.
  const recentSlugs = recentTopics.slugs || []
  const realTargets = recentSlugs.length
    ? `\n\nREAL INTERNAL LINK TARGETS (only ever use targets from this list):\n${recentSlugs.map((s, i) => `${i + 1}. /blog/${s}`).join('\n')}`
    : ''

  // Strong category rotation: assign the least-used category so a single
  // category never dominates the blog.
  const preferredCategory = pickCategory(recentTopics.categories || [])
  const preferredCategoryBlock = `\n\nPREFERRED CATEGORY:\n${preferredCategory}\nWrite THIS article so it genuinely belongs to the preferred category above. Choose the topic, primary keyword, content cluster and examples to fit it, and set the category field to exactly this value. Only deviate if no angle fits the preferred category - then still pick one of the five allowed categories, but avoid repeating the same category in consecutive posts.`

  // Industry + funnel rotation: keep the trade mix varied and commercial intent
  // dominant (BOFU 50%, MOFU 35%, TOFU 15%).
  const preferredIndustry = pickIndustry(recentTopics.industries || [])
  const preferredIndustryBlock = `\n\nPREFERRED INDUSTRY:\n${preferredIndustry}\nWrite THIS article for a UK local ${preferredIndustry.toLowerCase()} business deciding about its website. Use realistic ${preferredIndustry.toLowerCase()} examples, pages and questions the trade actually asks. Pick ONE primary keyword from the priority search topics for this industry listed below (unless owner override guidance says otherwise), avoid closely overlapping recent topics, and set the industry field to exactly "${preferredIndustry}".`

  const preferredFunnelStage = pickFunnelStage(recentTopics.funnelStages || [])
  const funnelGuidance = {
    BOFU: 'strongest commercial or purchase intent: the reader is choosing or buying a website now. Nail the decision: what they need, what it costs, and why a professional site beats the alternative. Use a stronger Execora call to action.',
    MOFU: 'comparison and research intent: the reader is weighing options (own website vs Google Business Profile, Facebook, Checkatrade, MyBuilder, one-off vs monthly). Educate, compare fairly, then guide toward a considered decision.',
    TOFU: 'top-of-funnel discovery: general usefulness first, light promotional touch. Answer the question thoroughly even if the reader never buys.',
  }
  const preferredFunnelBlock = `\n\nPREFERRED FUNNEL STAGE:\n${preferredFunnelStage}\nTarget this funnel stage: ${funnelGuidance[preferredFunnelStage]}`

  // Curated, link-checked sources the article may cite; never invent or edit URLs.
  const sourceBankBlock = `\n\nSOURCE BANK (only ever cite sources from this list):\n${SOURCE_BANK.map((s, i) => `${i + 1}. ${s.label} — ${s.url}`).join('\n')}`

  const recentSourceUrls = recentTopics.sourceUrls || []
  const recentlyUsedBlock = recentSourceUrls.length
    ? `\n\nRECENTLY USED SOURCES (do not cite any of these again in this article):\n${recentSourceUrls.join('\n')}`
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

  // Priority keywords filtered to the preferred industry. Owner keywordGuidance
  // still overrides this list entirely.
  const industryKeywords = INDUSTRY_KEYWORDS[preferredIndustry] || INDUSTRY_KEYWORDS['General Trades']
  const keywordList = settings && settings.keywordGuidance
    ? null
    : `\n\nPriority search topics for ${preferredIndustry} (choose ONE primary keyword and 3-6 secondary terms from this list; keep the topic purchase-focussed):\n${industryKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}`

  return {
    system: [
      'You are the SEO Content Strategist and Senior UK Copywriter for Execora, a website service for UK local service businesses (electricians, plumbers, heating engineers, builders, kitchen and bathroom installers, roofers, landscapers, joiners, painters and decorators, garages).',
      'Execora\'s differentiator: the owner sees a personalised homepage preview before committing, so buying feels low-risk.',
      'Write genuinely useful, practical articles that help UK local business owners improve their websites, attract more customers, and grow their businesses. Educate first, then naturally move the reader towards considering Execora; never make every article feel like an advertisement.',
      'Prioritise commercial and purchase-intent search terms over generic informational content. At least 70% of articles should have strong commercial or purchase intent. The reader usually owns a UK service business, has no website or an outdated one, or depends on Google Business Profile, Facebook or word of mouth.',
      'Use British English throughout (e.g. optimise, colour, organisation, enquiry). Use £, write "enquiries" not "inquiries", and "tradesperson"/"tradespeople" naturally. Avoid US terms: ZIP code, Yelp, dollars, US licence terminology.',
      'Focus on practical actions the reader can take today.',
      'Never use em dashes. Use commas, colons, or full stops instead.',
      'Avoid generic AI phrases and filler words such as: delve, unlock, game-changer, revolutionise, elevate your business, digital landscape, in today\'s fast-paced world, ever-evolving, seamless solution, robust solution, leverage, harness the power, take your business to the next level, online journey, digital transformation.',
      'Never invent statistics, studies, quotes, case studies, client numbers, leads, revenue, conversion improvements, testimonials, awards, years in business or exact pricing averages. Explain concepts without fabricated numbers; say what a strong trades website "typically" includes rather than inventing percentages.',
      'Never stuff keywords or write excessive promotional content about Execora.',
      'Remember the brand belief: "Your business has already earned its reputation. Your online presence should reflect it." Use supporting lines selectively (Good business. Better presence. / See it before you commit. / Get found. Build trust. Win enquiries.) - never all three in one article.',
      'Sell the outcome, not a "beautiful website": credibility, trust, and easier customer contact. Connect features to outcomes.',
      'End with a practical checklist the reader can use immediately.',
      'Include a natural, restrained mention of Execora near the end (one or two sentences maximum) plus ONE primary CTA.',
      'The article should be genuinely helpful even if the reader never buys from Execora.',
      'Rotate naturally between these categories: Website Tips, Local Business, Google & SEO, Customer Experience, Business Growth.',
      'Build credible topical authority for UK local businesses: favour specific, search-focussed topics that could only have been written for this audience over generic commodity advice.',
    ].join(' '),
    user: [
      'Write a practical, SEO-optimised blog article for UK local business owners.',
      'Aim for 1,200 to 1,800 words. Do not pad to hit a number: a genuinely useful 1,250-word article beats a repetitive 1,800-word one. Every section must contribute something useful. Answer the main query within the first 150 words.',
      'It must have a clear, useful title, a strong problem-led introduction, ONE H1 (usually similar to the SEO title), logical H2/H3 headings that answer real search questions, short paragraphs, actionable bullet points, concrete UK trades examples, and end with a practical checklist.',
      'Do not use em dashes anywhere in the article.',
      topicsList,
      categoryHint,
      realTargets,
      preferredCategoryBlock,
      preferredFunnelBlock,
      preferredIndustryBlock,
      sourceBankBlock,
      recentlyUsedBlock,
      'SEARCH INTENT PRIORITY:\nThe article must answer a real buying question. Choose ONE primary keyword recorded in primaryKeyword, plus 3-6 closely related secondary terms in secondaryKeywords, selecting from the search topics provided earlier (use the owner override targets when given, otherwise the industry priority list). Prefer commercial or purchase intent (a reader who could become an Execora client: choosing a website, comparing options, or researching cost). Record searchIntent using one of: informational, commercial investigation, local or transactional (purchase intent = transactional; comparison and cost/pricing = commercial investigation). Record the relevant topic cluster in contentCluster. Use keywords naturally and never force exact-match keywords.',
      'SEO META:\nKeep the seoTitle around 50-60 characters and the seoDescription 140-160 characters. Include the primary keyword in the seoTitle where natural. Keep the slug short and keyword-focussed. Set author to "Execora Editorial Team" in the author field.',
      'CONTENT STRATEGY:\nAnswer a concrete buying question for the preferred industry and funnel stage. Examples: "website for electricians UK" (what type of site they need, which pages and features matter, what to expect when commissioning it); "how much does a trades website cost UK" (realistic pricing models, what affects price, what is included, what to check before paying); "Google Business Profile vs website" (what each does, where each shines, why they work best together). Decide quickly, explain the decision, show realistic worked examples, give actionable recommendations.',
      'FAQ SECTION:\nInclude exactly 4 to 6 FAQs in the faq array, each {question, answer}, directly matching real search intent (for example: does an electrician need a website? how much does it cost? what pages should it have? is Google Business Profile enough? can customers contact me through my website? should I show prices online?). Answers 40-100 words each, clear and standalone, and do NOT just repeat sections of the article.',
      'CTA:\nUse ONE primary call to action. Preferred copy: "See what your business could look like online. Get your personalised Execora homepage preview." Use it naturally near the end (or a suitably softer version for TOFU articles). Never use pressure language such as BUY NOW, ACT FAST, LIMITED TIME, GUARANTEED LEADS.',
      'TOPIC CLUSTERS:\nBuild topical authority rather than producing unrelated daily articles. Rotate naturally between these clusters: Website Design for Local Businesses, Local SEO, Google Business Profile, Website Conversion, Lead Generation, Trades Websites, Customer Experience, Business Systems. Support and reinforce existing clusters where possible.',
      'GEOGRAPHY:\nExecora\'s primary local market is ' + GEOGRAPHY_PRIMARY + ', with secondary areas ' + GEOGRAPHY_SECONDARY + ', plus wider Scotland for informational topics. Use a location naturally only when it genuinely adds relevance; never stuff location keywords. Record any location in the targetLocation field.',
      'ANSWER-FIRST WRITING:\nWhenever an H2 or H3 asks a question, answer it directly within the first 1 to 3 sentences before expanding. Write definitions, explanations and recommendations so they make sense when read independently and are quotable by search engines and AI systems. Do not deliberately break content into unnatural chunks for AI systems.',
      'INTERNAL LINKS:\nSuggest 2 to 4 relevant internal links using the internalLinks array. Each entry needs anchor text, a target, and type "internal". The target MUST be one of the /blog/<slug> values listed under REAL INTERNAL LINK TARGETS (without inventing, modifying or adding prefixes to them). If none of the listed articles is genuinely relevant, return an empty internalLinks array rather than inventing a target. Use concise descriptive natural anchor text. Never use generic anchors such as "click here", "learn more" or "read more".',
      'SOURCE QUALITY:\nWhen making a factual claim that benefits from authoritative evidence, use the externalSources array with a source label and URL. Cite ONLY sources from the SOURCE BANK list above, using the exact URL shown. Do not invent, shorten, or edit those URLs, and do not add any other website. Never cite a URL from RECENTLY USED SOURCES. If no bank source genuinely supports a claim, omit the source. Prefer 1 to 3 genuinely relevant sources over padding.',
      keywordList,
      'EXECORA BRIDGE:\nNear the end, naturally connect the topic to Execora without turning the article into aggressive sales copy. Mention the low-risk homepage preview (see a personalised homepage concept before committing to the complete website) where it genuinely helps the reader\'s decision. Mention Execora no more than twice, and never force Execora into a topic where it adds no value. Set the cta field to a single {heading, body, buttonText, url} with url "https://www.execora.work/" unless owner guidance changes it.',
      'FEATURED IMAGE:\nFor the imagePrompt field, describe one realistic, editorial photograph-worthy scene in the preferred industry\'s actual business context (a UK electrician\'s van, plumber\'s van and parts, a builder on site, a roofer on scaffolding, a landscaper\'s job). Show the human, the work and the tools - not laptops with generic graphs. Warm off-white/cream background, near-black subject tones, muted gold accents, natural light, sophisticated UK small-business aesthetic. Specify composition, main subject and supporting objects. Must contain no written words, no logos, no text overlays. Avoid generic instructions such as "an AI business image" or "a business owner using technology".',
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
      funnelStage: {
        type: 'string',
        enum: ['BOFU', 'MOFU', 'TOFU'],
      },
      industry: {
        type: 'string',
        enum: INDUSTRY_ORDER,
      },
      faq: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', maxLength: 200 },
            answer: { type: 'string', maxLength: 600 },
          },
          required: ['question', 'answer'],
          additionalProperties: false,
        },
      },
      cta: {
        type: 'object',
        properties: {
          heading: { type: 'string', maxLength: 200 },
          body: { type: 'string', maxLength: 1000 },
          buttonText: { type: 'string', maxLength: 80 },
          url: { type: 'string', maxLength: 300 },
        },
        required: ['heading', 'body', 'buttonText', 'url'],
        additionalProperties: false,
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
      'funnelStage', 'industry', 'faq', 'cta',
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

  if (article.funnelStage !== undefined && article.funnelStage !== null && !FUNNEL_STAGES.includes(article.funnelStage)) {
    return { ok: false, error: `funnelStage must be one of: ${FUNNEL_STAGES.join(', ')}` }
  }

  if (article.industry !== undefined && article.industry !== null && !INDUSTRY_ORDER.includes(article.industry)) {
    return { ok: false, error: `industry must be one of: ${INDUSTRY_ORDER.join(', ')}` }
  }

  if (article.faq !== undefined && article.faq !== null) {
    if (!Array.isArray(article.faq) || article.faq.length > 6) {
      return { ok: false, error: 'faq must be an array of at most 6 items' }
    }
    for (const item of article.faq) {
      if (!item || typeof item !== 'object' || typeof item.question !== 'string' || typeof item.answer !== 'string') {
        return { ok: false, error: 'Each faq entry needs a question and answer' }
      }
    }
  }

  if (article.cta !== undefined && article.cta !== null) {
    if (typeof article.cta !== 'object' || Array.isArray(article.cta)) {
      return { ok: false, error: 'cta must be an object' }
    }
    const ctaKeys = ['heading', 'body', 'buttonText', 'url']
    for (const key of ctaKeys) {
      if (article.cta[key] !== undefined && typeof article.cta[key] !== 'string') {
        return { ok: false, error: `cta.${key} must be a string` }
      }
    }
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
// Link sanitation
// ---------------------------------------------------------------------------

// Keep only internal links that point at a real published blog post, and only
// external links that are genuine http(s) URLs (not the site itself). Anything
// else is a hallucinated target and is silently dropped so drafts never ship
// broken links. Run after validation, before drafting.
export function sanitizeInternalLinks(internalLinks, slugs) {
  if (!Array.isArray(internalLinks)) return []
  const valid = new Set((slugs || []).map((s) => `/blog/${s}`))
  return internalLinks.filter((link) => {
    if (!link || typeof link !== 'object') return false
    if (typeof link.anchor !== 'string' || typeof link.target !== 'string') return false
    if (link.type !== 'external') {
      return valid.has(link.target)
    }
    return SOURCE_BANK_NORMALISED.has(normaliseSourceUrl(link.target))
  })
}

// ---------------------------------------------------------------------------
// Image prompt with Execora visual identity
// ---------------------------------------------------------------------------

const IMAGE_PREFIX =
  'Premium editorial photograph for an Execora business article, realistic and natural-light, sophisticated UK small-business aesthetic. Warm off-white cream background, near-black (#292524) subject tones, muted antique gold (#C9A45C) accents, soft coral (#FFB7B2) sparingly for small details, warm grey (#78716C) secondary supports. Show one believable scene in an actual UK trade or local-business setting (trades van, workshop, job site, high street, shopfront, salon or café) with real people, real work and real tools, editorial and understated rather than glossy or studio-perfect. No text, letters, numbers, logos, brand names, watermarks or screenshots inside the image. '

const MAX_STYLE_PROMPT_LENGTH = 4000
const MAX_NEGATIVE_PROMPT_LENGTH = 2000
const MAX_ARTICLE_GUIDANCE_LENGTH = 3000
const MAX_ARTICLE_TOPIC_LENGTH = 500
const MAX_MODEL_LENGTH = 100
const MAX_KEYWORD_GUIDANCE_LENGTH = 3000

// Search-intent options for the article's primary keyword, stored per post.
const ALLOWED_SEARCH_INTENTS = ['informational', 'commercial investigation', 'local', 'transactional']

// Acceptable article length. The prompt asks for 1,200-1,800 words by intent;
// validation tolerates a larger buffer so a borderline draft still gets
// created for human review instead of failing the run.
const MIN_ARTICLE_WORDS = 900
const MAX_ARTICLE_WORDS = 2000

// Allowlisted OpenAI models the owner may select from the Sanity dashboard.
// Only these values are accepted from the singleton; anything else falls back
// to the env-var default so an invalid model can never break generation.
const ALLOWED_TEXT_MODELS = ['gpt-5-mini', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini']
const ALLOWED_IMAGE_MODELS = ['gpt-image-1-mini', 'gpt-image-1']

// Curated, link-checked sources the article may cite in externalSources and as
// external-type relatedLinks. Restricting to this bank guarantees cited sources
// never 404 and stops the model from inventing (or endlessly repeating) URLs.
// Only add URLs that load successfully; keep labels short and descriptive.
export const SOURCE_BANK = [
  { label: 'Google Business Profile help', url: 'https://support.google.com/business/' },
  { label: 'Google Search Central: SEO starter guide', url: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide' },
  { label: 'Google Search Central: creating helpful content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
  { label: 'Google Search Central: title links', url: 'https://developers.google.com/search/docs/appearance/title-link' },
  { label: 'ICO: advice for small organisations', url: 'https://ico.org.uk/for-organisations/advice-for-small-organisations/' },
  { label: 'ICO: UK GDPR guidance and resources', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/' },
  { label: 'ICO: data protection principles', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/' },
  { label: 'GOV.UK: set up a business', url: 'https://www.gov.uk/set-up-business' },
  { label: 'GOV.UK: business finance support finder', url: 'https://www.gov.uk/business-finance-support-finder' },
  { label: 'GOV.UK: employing staff', url: 'https://www.gov.uk/employing-staff' },
  { label: 'GOV.UK: accessibility requirements for public sector websites', url: 'https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps' },
  { label: 'GOV.UK Service Manual: making your service accessible', url: 'https://www.gov.uk/service-manual/helping-people-to-use-your-service/making-your-service-accessible-an-introduction' },
  { label: 'Scottish Government: publications', url: 'https://www.gov.scot/publications/' },
  { label: 'ONS: business activity, size and location', url: 'https://www.ons.gov.uk/businessindustryandtrade/business/activitysizeandlocation' },
  { label: 'ONS: employment and labour market', url: 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork' },
]

// Normalised form (lowercase, trailing slash stripped) used for bank matching.
function normaliseSourceUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase()
}

// Set of normalised bank URLs for O(1) membership checks.
const SOURCE_BANK_NORMALISED = new Set(SOURCE_BANK.map((s) => normaliseSourceUrl(s.url)))

// Keep only external sources that exist in the verified bank, have a label and
// url, are not duplicated, and have not already been cited in recent posts.
export function sanitizeExternalSources(sources, usedUrls = []) {
  if (!Array.isArray(sources)) return []
  const recentlyUsed = new Set(Array.isArray(usedUrls) ? usedUrls.map(normaliseSourceUrl) : [])
  const seen = new Set()
  const kept = []
  for (const s of sources) {
    if (!s || typeof s !== 'object' || typeof s.label !== 'string' || !s.label || typeof s.url !== 'string') continue
    const norm = normaliseSourceUrl(s.url)
    if (!SOURCE_BANK_NORMALISED.has(norm)) continue
    if (recentlyUsed.has(norm)) continue
    if (seen.has(norm)) continue
    seen.add(norm)
    kept.push({ label: s.label, url: s.url })
  }
  return kept
}

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
    funnelStage: article.funnelStage || '',
    industry: article.industry || '',
    faq: Array.isArray(article.faq)
      ? article.faq
          .filter((f) => f && typeof f.question === 'string' && typeof f.answer === 'string')
          .slice(0, 6)
          .map((f) => ({ question: f.question, answer: f.answer }))
      : [],
    cta: article.cta && typeof article.cta === 'object' && article.cta.heading
      ? {
          heading: String(article.cta.heading).slice(0, 200),
          body: article.cta.body ? String(article.cta.body).slice(0, 1000) : '',
          buttonText: article.cta.buttonText ? String(article.cta.buttonText).slice(0, 80) : 'View our plans',
          url: article.cta.url ? String(article.cta.url).slice(0, 300) : 'https://www.execora.work/',
        }
      : undefined,
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

  // Only keep internal links that point at real published posts and external
  // links (or external sources) that exist in the verified SOURCE_BANK, so
  // drafts never ship dead or repeating links.
  if (Array.isArray(article.internalLinks)) {
    article.internalLinks = sanitizeInternalLinks(article.internalLinks, recentTopics.slugs)
  }
  if (Array.isArray(article.externalSources)) {
    article.externalSources = sanitizeExternalSources(article.externalSources, recentTopics.sourceUrls)
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

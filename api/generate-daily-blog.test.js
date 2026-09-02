import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getLondonDate,
  getLondonHour,
  getRecentTopics,
  generateImage,
  countWords,
  validateArticle,
  buildImagePrompt,
  buildArticlePrompt,
  buildDraftDocument,
  getArticleJSONSchema,
  ALLOWED_CATEGORIES,
} from './generate-daily-blog.js'

import { default as handler, setClientFactory, setOpenaiFetch, setImageFetch, setLondonHourOverride } from './generate-daily-blog.js'

// ---------------------------------------------------------------------------
// getLondonDate
// ---------------------------------------------------------------------------

describe('getLondonHour', () => {
  afterEach(() => setLondonHourOverride(null))

  test('returns a number between 0 and 23', () => {
    const h = getLondonHour()
    assert.ok(typeof h === 'number')
    assert.ok(h >= 0 && h <= 23)
  })

  test('returns the override when set', () => {
    setLondonHourOverride(8)
    assert.equal(getLondonHour(), 8)
    setLondonHourOverride(14)
    assert.equal(getLondonHour(), 14)
  })

  test('restores real behaviour when override is cleared', () => {
    setLondonHourOverride(8)
    assert.equal(getLondonHour(), 8)
    setLondonHourOverride(null)
    const h = getLondonHour()
    assert.ok(h >= 0 && h <= 23)
  })
})

describe('getLondonDate', () => {
  test('returns a YYYY-MM-DD formatted string', () => {
    const d = getLondonDate()
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('returns a date within one day of now in Europe/London', () => {
    const d = getLondonDate()
    const now = new Date()
    const londonNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Europe/London' })
    )
    const londonDate = new Date(
      `${d}T12:00:00`,
    )
    const diffDays = Math.abs(londonNow - londonDate) / (1000 * 60 * 60 * 24)
    assert.ok(diffDays < 1.5, `Date ${d} should be within 1.5 days of London now`)
  })

  test('uses en-GB formatting (day-month-year order in parts)', () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const y = parts.find((p) => p.type === 'year').value
    const d = getLondonDate()
    assert.ok(d.startsWith(y), `Date ${d} should start with year ${y}`)
  })
})

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------

describe('countWords', () => {
  test('counts words in a normal sentence', () => {
    assert.equal(countWords('hello world foo bar'), 4)
  })

  test('returns 0 for empty or non-string input', () => {
    assert.equal(countWords(''), 0)
    assert.equal(countWords('   '), 0)
    assert.equal(countWords(null), 0)
    assert.equal(countWords(undefined), 0)
    assert.equal(countWords(42), 0)
  })

  test('handles multiple whitespace between words', () => {
    assert.equal(countWords('  hello   world  '), 2)
  })
})

// ---------------------------------------------------------------------------
// validateArticle
// ---------------------------------------------------------------------------

const SEO_DESC = 'Learn practical steps to improve your local business website, attract more customers in your area, and turn more of them into paying enquiries today.'
const SEO_DESC_LEN = SEO_DESC.length

function validArticle(overrides = {}) {
  const bodyBlocks = []
  for (let i = 0; i < 10; i++) {
    bodyBlocks.push({ style: 'normal', listItem: null, text: 'word '.repeat(140) })
  }
  return {
    title: 'How to Improve Your Local Business Website Today',
    slug: 'how-to-improve-local-business-website',
    category: 'Website Tips',
    excerpt: 'A practical guide to improving your local business website for more enquiries.',
    seoTitle: 'Improve Your Local Business Website',
    seoDescription: SEO_DESC,
    imagePrompt: 'A clean modern office workspace',
    imageAlt: 'Modern office workspace',
    body: bodyBlocks,
    ...overrides,
  }
}

describe('validateArticle', () => {
  test('accepts a valid article', () => {
    assert.equal(validateArticle(validArticle()).ok, true)
  })

  test('rejects non-object input', () => {
    assert.equal(validateArticle(null).ok, false)
    assert.equal(validateArticle('string').ok, false)
    assert.equal(validateArticle([]).ok, false)
  })

  test('rejects missing required fields', () => {
    for (const field of ['title', 'slug', 'category', 'excerpt', 'seoTitle', 'seoDescription', 'imagePrompt', 'imageAlt', 'body']) {
      const a = validArticle()
      delete a[field]
      const r = validateArticle(a)
      assert.equal(r.ok, false, `should reject missing ${field}`)
      assert.match(r.error, new RegExp(field))
    }
  })

  test('rejects invalid category', () => {
    const r = validateArticle(validArticle({ category: 'Bogus' }))
    assert.equal(r.ok, false)
    assert.match(r.error, /Invalid category/)
  })

  test('rejects slug over 96 characters', () => {
    const r = validateArticle(validArticle({ slug: 'a'.repeat(97) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /Slug/)
  })

  test('rejects title over 120 characters', () => {
    const r = validateArticle(validArticle({ title: 'a'.repeat(121) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /Title/)
  })

  test('rejects excerpt over 320 characters', () => {
    const r = validateArticle(validArticle({ excerpt: 'a'.repeat(321) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /Excerpt/)
  })

  test('rejects seoTitle over 60 characters', () => {
    const r = validateArticle(validArticle({ seoTitle: 'a'.repeat(61) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /seoTitle/)
  })

  test('rejects seoDescription under 140 characters', () => {
    const r = validateArticle(validArticle({ seoDescription: 'a'.repeat(139) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /seoDescription/)
  })

  test('rejects seoDescription over 160 characters', () => {
    const r = validateArticle(validArticle({ seoDescription: 'a'.repeat(161) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /seoDescription/)
  })

  test('rejects body with fewer than 8 blocks', () => {
    const body = [
      { style: 'normal', listItem: null, text: 'word '.repeat(140) },
    ]
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, false)
    assert.match(r.error, /at least 8/)
  })

  test('rejects body with word count below 1100', () => {
    const body = Array.from({ length: 10 }, () => ({
      style: 'normal',
      listItem: null,
      text: 'short',
    }))
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, false)
    assert.match(r.error, /outside the acceptable range/)
  })

  test('rejects body with word count above 1650', () => {
    const body = Array.from({ length: 10 }, () => ({
      style: 'normal',
      listItem: null,
      text: 'word '.repeat(200),
    }))
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, false)
    assert.match(r.error, /outside the acceptable range/)
  })

  test('accepts body at exactly 1100 words', () => {
    const body = [
      { style: 'normal', listItem: null, text: 'word '.repeat(138) },
      { style: 'normal', listItem: null, text: 'word '.repeat(137) },
      { style: 'normal', listItem: null, text: 'word '.repeat(138) },
      { style: 'normal', listItem: null, text: 'word '.repeat(137) },
      { style: 'normal', listItem: null, text: 'word '.repeat(138) },
      { style: 'normal', listItem: null, text: 'word '.repeat(137) },
      { style: 'normal', listItem: null, text: 'word '.repeat(138) },
      { style: 'normal', listItem: null, text: 'word '.repeat(137) },
    ]
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, true)
  })

  test('accepts body at exactly 1650 words', () => {
    const body = Array.from({ length: 10 }, () => ({
      style: 'normal',
      listItem: null,
      text: 'word '.repeat(165),
    }))
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, true)
  })

  test('rejects body at 1651 words', () => {
    const body = [
      ...Array.from({ length: 10 }, () => ({
        style: 'normal',
        listItem: null,
        text: 'word '.repeat(165),
      })),
      { style: 'normal', listItem: null, text: 'word' },
    ]
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, false)
    assert.match(r.error, /outside the acceptable range/)
  })

  test('rejects blocks with missing text', () => {
    const body = Array.from({ length: 10 }, (_, i) => ({
      style: 'normal',
      listItem: null,
      text: i === 3 ? undefined : 'word '.repeat(140),
    }))
    const r = validateArticle(validArticle({ body }))
    assert.equal(r.ok, false)
    assert.match(r.error, /text string/)
  })
})

// ---------------------------------------------------------------------------
// buildImagePrompt
// ---------------------------------------------------------------------------

describe('buildImagePrompt', () => {
  test('prepends Execora visual identity prefix', () => {
    const result = buildImagePrompt('A modern shop front')
    assert.ok(result.startsWith('Premium hand-drawn crayon editorial illustration with subtle embossed 3D depth'))
    assert.ok(result.endsWith('A modern shop front'))
  })

  test('includes all identity keywords', () => {
    const result = buildImagePrompt('test')
    assert.ok(result.includes('crayon editorial illustration'))
    assert.ok(result.includes('wax-pencil grain'))
    assert.ok(result.includes('embossed 3D depth'))
    assert.ok(result.includes('ivory'))
    assert.ok(result.toLowerCase().includes('near-black'))
    assert.ok(result.includes('charcoal'))
    assert.ok(result.includes('muted antique gold'))
    assert.ok(result.includes('UK local-business environment'))
    assert.ok(result.includes('neighbourhood high streets'))
    assert.ok(result.includes('not like a children\'s book'))
    assert.ok(result.includes('No text'))
    assert.ok(result.includes('logos'))
    assert.ok(result.toLowerCase().includes('no bright'))
    assert.ok(result.toLowerCase().includes('rainbow'))
  })

  test('does not contain text or logo artifacts', () => {
    const result = buildImagePrompt('test')
    assert.ok(result.includes('No text, letters, numbers, logos, brand names or watermarks inside the image'))
  })

  test('includes the Execora palette and acceptable colours', () => {
    const result = buildImagePrompt('test')
    assert.ok(result.includes('warm off-white or ivory background'))
    assert.ok(result.includes('near-black and deep charcoal'))
    assert.ok(result.includes('muted antique gold'))
    assert.ok(result.includes('75% ivory'))
    assert.ok(result.includes('No bright green, red, orange, yellow, blue or rainbow colours'))
  })

  test('preserves the article-specific image prompt', () => {
    const specific = 'A friendly café with a review card and booking calendar'
    const result = buildImagePrompt(specific)
    assert.ok(result.includes(specific))
  })
})

// ---------------------------------------------------------------------------
// buildArticlePrompt
// ---------------------------------------------------------------------------

describe('buildArticlePrompt', () => {
  test('includes recent topics in user prompt when present', () => {
    const topics = {
      titles: ['10 Website Tips', 'How to Get Google Reviews'],
      categories: ['Website Tips', 'Google & SEO'],
    }
    const prompt = buildArticlePrompt(topics)
    assert.ok(prompt.user.includes('10 Website Tips'))
    assert.ok(prompt.user.includes('How to Get Google Reviews'))
  })

  test('instructs a topic-specific imagePrompt for the featured image', () => {
    const prompt = buildArticlePrompt({ titles: [], categories: [] })
    const user = prompt.user
    assert.ok(user.includes('imagePrompt'))
    assert.ok(user.includes('one clear visual concept'))
    assert.ok(user.includes('local-business setting'))
    assert.ok(user.includes('no written words'))
  })

  test('handles empty recent topics gracefully', () => {
    const topics = { titles: [], categories: [] }
    const prompt = buildArticlePrompt(topics)
    assert.ok(prompt.system.length > 100)
    assert.ok(prompt.user.length > 100)
  })

  test('system prompt mentions Execora and British English', () => {
    const prompt = buildArticlePrompt({ titles: [], categories: [] })
    assert.ok(prompt.system.includes('Execora'))
    assert.ok(prompt.system.includes('British English'))
    assert.ok(prompt.system.includes('em dash'))
  })
})

// ---------------------------------------------------------------------------
// getArticleJSONSchema
// ---------------------------------------------------------------------------

describe('getArticleJSONSchema', () => {
  test('returns a valid JSON schema object', () => {
    const schema = getArticleJSONSchema()
    assert.equal(schema.type, 'object')
    assert.ok(schema.properties.title)
    assert.ok(schema.properties.slug)
    assert.ok(schema.properties.category)
    assert.ok(schema.properties.body)
    assert.ok(Array.isArray(schema.required))
    assert.ok(schema.required.includes('title'))
    assert.ok(schema.required.includes('body'))
  })

  test('category enum matches ALLOWED_CATEGORIES', () => {
    const schema = getArticleJSONSchema()
    assert.deepEqual(schema.properties.category.enum, ALLOWED_CATEGORIES)
  })
})

// ---------------------------------------------------------------------------
// buildDraftDocument
// ---------------------------------------------------------------------------

describe('buildDraftDocument', () => {
  test('creates a draft document with correct ID format', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: 'image-123', date: '2026-09-02' })
    assert.equal(doc._id, 'drafts.blogPost-auto-2026-09-02')
    assert.equal(doc._type, 'blogPost')
  })

  test('calculates reading time from body word count', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: null, date: '2026-09-02' })
    assert.ok(doc.readingTime >= 1)
    assert.equal(typeof doc.readingTime, 'number')
  })

  test('converts body to Portable Text', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: null, date: '2026-09-02' })
    assert.ok(Array.isArray(doc.body))
    assert.ok(doc.body.length > 0)
    for (const block of doc.body) {
      assert.equal(block._type, 'block')
      assert.ok(block._key)
      assert.ok(block.children[0].text)
    }
  })

  test('attaches image reference when imageAssetId is provided', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: 'image-abc', date: '2026-09-02' })
    assert.deepEqual(doc.image, {
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-abc' },
      alt: 'Modern office workspace',
    })
  })

  test('omits image when imageAssetId is null', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: null, date: '2026-09-02' })
    assert.equal(doc.image, undefined)
  })

  test('sets publishedDate to midnight UTC on the given date', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: null, date: '2026-09-02' })
    assert.equal(doc.publishedDate, '2026-09-02T00:00:00.000Z')
  })

  test('includes all SEO fields', () => {
    const article = validArticle()
    const doc = buildDraftDocument({ article, imageAssetId: null, date: '2026-09-02' })
    assert.equal(doc.seoTitle, article.seoTitle)
    assert.equal(doc.seoDescription, article.seoDescription)
    assert.equal(doc.excerpt, article.excerpt)
    assert.equal(doc.category, article.category)
  })
})

describe('getRecentTopics', () => {
  test('sends the exact GROQ query to client.fetch', async () => {
    let capturedQuery = null
    const capturedParams = {}
    const client = {
      fetch: async (query, params) => {
        capturedQuery = query
        capturedParams.params = params
        return [
          { title: 'Post A', category: 'Website Tips' },
          { title: 'Post B', category: 'Google & SEO' },
        ]
      },
    }

    const result = await getRecentTopics(client)

    assert.equal(
      capturedQuery,
      `*[_type == "blogPost"] | order(publishedDate desc)[0...60]{title, category}`
    )
    assert.equal(
      result.titles.join(','),
      'Post A,Post B'
    )
    assert.equal(result.categories.join(','), 'Website Tips,Google & SEO')
  })
})

describe('generateImage', () => {
  test('image request does not send response_format and still parses b64_json', async () => {
    const origFetch = globalThis.fetch
    let capturedBody = null
    globalThis.fetch = async (url, opts) => {
      if (url.includes('/images/generations')) {
        capturedBody = JSON.parse(opts.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ b64_json: Buffer.from('fake-image-data').toString('base64') }],
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    }

    try {
      const result = await generateImage({
        apiKey: 'test-image-key',
        model: 'gpt-image-1',
        prompt: 'A friendly local shop',
      })

      assert.ok(capturedBody, 'image fetch should have been called')
      assert.equal(capturedBody.model, 'gpt-image-1')
      assert.equal(capturedBody.n, 1)
      assert.equal('response_format' in capturedBody, false)
      assert.equal(
        result,
        Buffer.from('fake-image-data').toString('base64'),
        'b64_json should be returned unchanged'
      )
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ---------------------------------------------------------------------------
// Handler tests — auth, env, idempotency, happy path
// ---------------------------------------------------------------------------

function makeReq({ method = 'POST', token } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }
}

function makeRes() {
  const res = { _status: 200, _json: null, headers: {} }
  res.status = (code) => { res._status = code; return res }
  res.setHeader = (k, v) => { res.headers[k] = v; return res }
  res.json = (obj) => { res._json = obj; return res }
  return res
}

function setEnv(overrides = {}) {
  const base = {
    SANITY_WRITE_TOKEN: 'test-write-token',
    CRON_SECRET: 'test-blog-secret',
    NEXT_PUBLIC_SANITY_PROJECT_ID: 'p0mpfgmr',
    NEXT_PUBLIC_SANITY_DATASET: 'production',
    OPENAI_API_KEY: 'test-openai-key',
    OPENAI_TEXT_MODEL: 'gpt-5.4-mini',
    OPENAI_IMAGE_MODEL: 'gpt-image-1-mini',
  }
  Object.entries(base).forEach(([k, v]) => {
    if (!(k in overrides)) process.env[k] = v
  })
  Object.entries(overrides).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  })
}

function clearEnv() {
  for (const k of [
    'SANITY_WRITE_TOKEN',
    'CRON_SECRET',
    'NEXT_PUBLIC_SANITY_PROJECT_ID',
    'NEXT_PUBLIC_SANITY_DATASET',
    'OPENAI_API_KEY',
    'OPENAI_TEXT_MODEL',
    'OPENAI_IMAGE_MODEL',
  ]) {
    delete process.env[k]
  }
}

describe('POST/GET /api/generate-daily-blog auth guards', () => {
  beforeEach(() => setEnv())
  afterEach(() => {
    clearEnv()
    setClientFactory(null)
    setOpenaiFetch(null)
    setImageFetch(null)
    setLondonHourOverride(null)
  })

  test('returns 405 for PUT requests', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'PUT' }), res)
    assert.equal(res._status, 405)
    assert.equal(res.headers.Allow, 'GET, POST')
  })

  test('returns 401 when no bearer token supplied (POST)', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST' }), res)
    assert.equal(res._status, 401)
  })

  test('returns 401 when no bearer token supplied (GET)', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    assert.equal(res._status, 401)
  })

  test('returns 401 when wrong bearer token supplied', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: 'wrong-secret' }), res)
    assert.equal(res._status, 401)
  })

  test('returns 401 for empty bearer token', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: '' }), res)
    assert.equal(res._status, 401)
  })

  test('returns 500 when CRON_SECRET is missing', async () => {
    clearEnv()
    process.env.SANITY_WRITE_TOKEN = 'x'
    process.env.OPENAI_API_KEY = 'x'
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: 'any' }), res)
    assert.equal(res._status, 500)
    assert.match(res._json.error, /not configured/)
  })

  test('returns 500 when OPENAI_API_KEY is missing', async () => {
    clearEnv()
    process.env.SANITY_WRITE_TOKEN = 'x'
    process.env.CRON_SECRET = 'x'
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: 'x' }), res)
    assert.equal(res._status, 500)
    assert.match(res._json.error, /not configured/)
  })

  test('returns 500 when SANITY_WRITE_TOKEN is missing', async () => {
    clearEnv()
    process.env.OPENAI_API_KEY = 'x'
    process.env.CRON_SECRET = 'x'
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: 'x' }), res)
    assert.equal(res._status, 500)
    assert.match(res._json.error, /not configured/)
  })

  test('does not leak secret values in error responses', async () => {
    clearEnv()
    const res = makeRes()
    await handler(makeReq({}), res)
    const json = JSON.stringify(res._json)
    assert.ok(!json.includes('test-blog-secret'))
    assert.ok(!json.includes('test-openai-key'))
    assert.ok(!json.includes('test-write-token'))
  })
})

describe('POST /api/generate-daily-blog idempotency', () => {
  let duplicateResult
  let openaiCalled

  beforeEach(() => {
    setEnv()
    duplicateResult = null
    openaiCalled = false
    setClientFactory(({ projectId, dataset, token }) => ({
      fetch: async (query, params) => {
        if (params && params.id && params.id.startsWith('drafts.blogPost-auto-')) {
          return duplicateResult === 'draft' ? { _id: params.id } : null
        }
        if (params && params.id && params.id.startsWith('blogPost-auto-')) {
          return duplicateResult === 'published' ? { _id: params.id } : null
        }
        return []
      },
      create: async () => { throw new Error('should not be called') },
      assets: { upload: async () => { throw new Error('should not be called') } },
    }))
    setOpenaiFetch(async () => {
      openaiCalled = true
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ text: '{}' }] }] }) }
    })
    setImageFetch(async () => ({ ok: true, json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }) }))
  })

  afterEach(() => {
    clearEnv()
    setClientFactory(null)
    setOpenaiFetch(null)
    setImageFetch(null)
  })

  test('returns 200 skipped when a draft already exists for today', async () => {
    duplicateResult = 'draft'
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.equal(res._status, 200)
    assert.equal(res._json.skipped, true)
    assert.match(res._json.reason, /already exists/)
  })

  test('returns 200 skipped when a published post already exists for today', async () => {
    duplicateResult = 'published'
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.equal(res._status, 200)
    assert.equal(res._json.skipped, true)
  })

  test('does not call OpenAI when today\'s post already exists', async () => {
    duplicateResult = 'draft'
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.equal(res._status, 200)
    assert.equal(res._json.skipped, true)
    assert.equal(openaiCalled, false)
  })
})

describe('GET time-window checks', () => {
  let openaiCalled

  beforeEach(() => {
    setEnv()
    openaiCalled = false
    setClientFactory(({ projectId, dataset, token }) => ({
      fetch: async (query, params) => {
        if (query.includes('_type == "blogPost"')) return []
        return null
      },
      create: async () => ({ _id: 'drafts.blogPost-auto-x' }),
      assets: { upload: async () => ({ _id: 'image-1' }) },
    }))
    setOpenaiFetch(async () => {
      openaiCalled = true
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ text: '{}' }] }] }) }
    })
    setImageFetch(async () => ({ ok: true, json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }) }))
  })

  afterEach(() => {
    clearEnv()
    setClientFactory(null)
    setOpenaiFetch(null)
    setImageFetch(null)
    setLondonHourOverride(null)
  })

  test('skips with 200 when GET fires outside the Europe/London 8 AM window', async () => {
    setLondonHourOverride(14)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', token: 'test-blog-secret' }), res)
    assert.equal(res._status, 200)
    assert.equal(res._json.skipped, true)
    assert.match(res._json.reason, /Outside the Europe\/London 8 AM generation window/)
  })

  test('does not call OpenAI when GET fires outside the 8 AM window', async () => {
    setLondonHourOverride(14)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', token: 'test-blog-secret' }), res)
    assert.equal(openaiCalled, false)
  })

  test('POST manual test bypasses the time-window check', async () => {
    setLondonHourOverride(14)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', token: 'test-blog-secret' }), res)
    // POST bypasses the window guard and proceeds into generation (mocked).
    assert.notEqual(res._status, 200)
    assert.notEqual(res._json && res._json.skipped, true)
    assert.equal(openaiCalled, true)
  })
})

describe('POST /api/generate-daily-blog happy path', () => {
  const sampleArticle = {
    title: 'How to Get More Google Reviews for Your Local Business',
    slug: 'get-more-google-reviews-local-business',
    category: 'Google & SEO',
    excerpt: 'Practical steps to earn more Google reviews for your UK local business.',
    seoTitle: 'Get More Google Reviews',
    seoDescription: SEO_DESC,
    imagePrompt: 'A friendly local shop with customers',
    imageAlt: 'Friendly local shop with customers',
    body: Array.from({ length: 12 }, () => ({
      style: 'normal',
      listItem: null,
      text: 'word '.repeat(120),
    })),
  }

  let createdDoc

  beforeEach(() => {
    setEnv()
    createdDoc = null

    setClientFactory(({ projectId, dataset, token }) => ({
      fetch: async (query, params) => {
        if (params && params.id) return null
        if (query.includes('_type == "blogPost"')) return []
        return null
      },
      create: async (doc) => { createdDoc = doc; return doc },
      assets: {
        upload: async () => ({ _id: 'image-uploaded-123' }),
      },
    }))

    setOpenaiFetch(async () => ({
      ok: true,
      json: async () => ({
        output: [{ type: 'message', content: [{ text: JSON.stringify(sampleArticle) }] }],
      }),
    }))

    setImageFetch(async () => ({
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from('fake-image-data').toString('base64') }],
      }),
    }))
  })

  afterEach(() => {
    clearEnv()
    setClientFactory(null)
    setOpenaiFetch(null)
    setImageFetch(null)
  })

  test('creates a draft and returns 200 with correct shape', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)

    assert.equal(res._status, 200)
    assert.equal(res._json.ok, true)
    assert.ok(res._json.draftId.startsWith('drafts.blogPost-auto-'))
    assert.equal(res._json.slug, 'get-more-google-reviews-local-business')
    assert.ok(res._json.date)
    assert.match(res._json.note, /not published/)
  })

  test('document has correct _type and draft ID format', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.equal(createdDoc._type, 'blogPost')
    assert.ok(createdDoc._id.startsWith('drafts.blogPost-auto-'))
  })

  test('document includes all expected fields', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.equal(createdDoc.title, sampleArticle.title)
    assert.equal(createdDoc.category, sampleArticle.category)
    assert.equal(createdDoc.excerpt, sampleArticle.excerpt)
    assert.equal(createdDoc.seoTitle, sampleArticle.seoTitle)
    assert.equal(createdDoc.seoDescription, sampleArticle.seoDescription)
    assert.equal(createdDoc.slug.current, sampleArticle.slug)
    assert.ok(createdDoc.readingTime >= 1)
    assert.ok(createdDoc.publishedDate.endsWith('T00:00:00.000Z'))
  })

  test('image is attached with the uploaded asset reference', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.ok(createdDoc.image)
    assert.equal(createdDoc.image._type, 'image')
    assert.equal(createdDoc.image.asset._ref, 'image-uploaded-123')
    assert.equal(createdDoc.image.alt, sampleArticle.imageAlt)
  })

  test('body is converted to Portable Text blocks', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.ok(Array.isArray(createdDoc.body))
    assert.ok(createdDoc.body.length >= 8)
    for (const block of createdDoc.body) {
      assert.equal(block._type, 'block')
      assert.ok(block._key)
      assert.ok(block.children[0].text)
    }
  })

  test('does not call any publish operation', async () => {
    const res = makeRes()
    await handler(makeReq({ token: 'test-blog-secret' }), res)
    assert.ok(createdDoc)
    assert.ok(!createdDoc.hasOwnProperty('publishedAt'))
  })
})

describe('POST /api/generate-daily-blog OpenAI retry', () => {
  beforeEach(() => {
    setEnv()
    setClientFactory(() => ({
      fetch: async (query) => {
        if (query.includes('_type == "blogPost"')) return []
        return null
      },
      create: async () => ({}),
      assets: { upload: async () => ({ _id: 'img-1' }) },
    }))
  })

  afterEach(() => {
    clearEnv()
    setClientFactory(null)
    setOpenaiFetch(null)
    setImageFetch(null)
  })

  test('retries once on 429 then succeeds', async () => {
    let textCalls = 0
    let imageCalls = 0
    const sampleArticle = {
      title: 'Test Article Title Here',
      slug: 'test-article-title',
      category: 'Website Tips',
      excerpt: 'A test excerpt for validation that is long enough to pass the checks.',
      seoTitle: 'Test Article',
      seoDescription: SEO_DESC,
      imagePrompt: 'A test prompt',
      imageAlt: 'Test alt',
      body: Array.from({ length: 10 }, () => ({
        style: 'normal',
        listItem: null,
        text: 'word '.repeat(140),
      })),
    }

    const origFetch = globalThis.fetch
    const okJson = (data) => ({ ok: true, status: 200, json: async () => data })
    globalThis.fetch = async (url, opts) => {
      const parsed = JSON.parse(opts.body)
      if (url.includes('/responses')) {
        textCalls++
        if (textCalls === 1) {
          return { ok: false, status: 429, text: async () => 'rate limited' }
        }
        return okJson({
          output: [{ type: 'message', content: [{ text: JSON.stringify(sampleArticle) }] }],
        })
      }
      imageCalls++
      return okJson({
        data: [{ b64_json: Buffer.from('img').toString('base64') }],
      })
    }

    try {
      const res = makeRes()
      await handler(makeReq({ token: 'test-blog-secret' }), res)
      assert.equal(res._status, 200)
      assert.equal(res._json.ok, true)
      assert.equal(textCalls, 2)
      assert.equal(imageCalls, 1)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test('does not retry on 400 client error', async () => {
    let textCalls = 0
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, opts) => {
      const parsed = JSON.parse(opts.body)
      if (url.includes('/responses')) {
        textCalls++
        return { ok: false, status: 400, text: async () => 'bad request' }
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }) }
    }

    try {
      const res = makeRes()
      await handler(makeReq({ token: 'test-blog-secret' }), res)
      assert.equal(res._status, 502)
      assert.equal(textCalls, 1)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

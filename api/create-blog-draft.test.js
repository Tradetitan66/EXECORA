import { test, describe, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALLOWED_CATEGORIES,
  generateSlug,
  calculateReadingTime,
  isValidCategory,
  convertToPortableText,
  validatePayload,
} from './create-blog-draft.js'

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe('generateSlug', () => {
  test('lowercases and transforms a title', () => {
    assert.equal(generateSlug('My First Blog Post'), 'my-first-blog-post')
  })

  test('strips symbols and trims whitespace', () => {
    assert.equal(generateSlug('  10 Great (SEO) Tips!   '), '10-great-seo-tips')
  })

  test('returns empty string for non-string input', () => {
    assert.equal(generateSlug(null), '')
    assert.equal(generateSlug(undefined), '')
    assert.equal(generateSlug(42), '')
  })

  test('caps at 96 characters to match schema maxLength', () => {
    const long = 'a'.repeat(200)
    assert.ok(generateSlug(`${long} b`).length <= 96)
  })
})

describe('calculateReadingTime', () => {
  test('rounds words / 220 to minutes', () => {
    const body = [
      { style: 'normal', text: `${'word '.repeat(440)}` },
    ]
    assert.equal(calculateReadingTime(body), 2)
  })

  test('returns at least 1 minute for short content', () => {
    const body = [{ style: 'normal', text: 'just a few words' }]
    assert.equal(calculateReadingTime(body), 1)
  })

  test('returns 1 for empty body', () => {
    assert.equal(calculateReadingTime([]), 1)
    assert.equal(calculateReadingTime(null), 1)
  })
})

describe('isValidCategory', () => {
  test('accepts all allowed categories', () => {
    for (const cat of ALLOWED_CATEGORIES) {
      assert.equal(isValidCategory(cat), true)
    }
  })

  test('rejects unknown categories', () => {
    assert.equal(isValidCategory('Bogus Category'), false)
    assert.equal(isValidCategory(''), false)
    assert.equal(isValidCategory(null), false)
  })
})

describe('convertToPortableText', () => {
  test('converts normal, h2, h3, blockquote styles', () => {
    const blocks = [
      { style: 'normal', text: 'a' },
      { style: 'h2', text: 'b' },
      { style: 'h3', text: 'c' },
      { style: 'blockquote', text: 'd' },
    ]
    const out = convertToPortableText(blocks)
    assert.equal(out.length, 4)
    assert.deepEqual(out.map((b) => b.style), ['normal', 'h2', 'h3', 'blockquote'])
    for (const b of out) {
      assert.equal(b._type, 'block')
      assert.ok(b._key)
      assert.deepEqual(b.markDefs, [])
      assert.equal(b.children[0]._type, 'span')
      assert.equal(b.children[0].text, b.text || b.children[0].text)
    }
  })

  test('rounds unknown styles to normal', () => {
    const out = convertToPortableText([{ style: 'h1', text: 'x' }])
    assert.equal(out[0].style, 'normal')
  })

  test('assigns unique keys per block and child', () => {
    const out = convertToPortableText([{ style: 'normal', text: 'x' }])
    assert.ok(out[0]._key)
    assert.ok(out[0].children[0]._key)
    assert.notEqual(out[0]._key, out[0].children[0]._key)
  })
})

describe('list conversion', () => {
  test('converts bullet list items', () => {
    const out = convertToPortableText([
      { style: 'normal', listItem: 'bullet', text: 'item one' },
      { style: 'normal', listItem: 'bullet', text: 'item two' },
    ])
    assert.deepEqual(out.map((b) => b.listItem), ['bullet', 'bullet'])
    assert.deepEqual(out.map((b) => b.level), [0, 0])
  })

  test('converts numbered list items', () => {
    const out = convertToPortableText([
      { style: 'normal', listItem: 'number', text: 'one' },
      { style: 'normal', listItem: 'number', text: 'two' },
    ])
    assert.deepEqual(out.map((b) => b.listItem), ['number', 'number'])
  })
})

// ---------------------------------------------------------------------------
// validatePayload tests
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
  test('accepts a valid payload', () => {
    const r = validatePayload(validBody())
    assert.equal(r.ok, true)
  })

  test('rejects missing required fields', () => {
    for (const field of ['title', 'category', 'excerpt', 'seoTitle', 'seoDescription', 'body']) {
      const body = validBody()
      delete body[field]
      const r = validatePayload(body)
      assert.equal(r.ok, false, `expected rejection for missing ${field}`)
      assert.match(r.error, /Missing required field/)
    }
  })

  test('rejects invalid category', () => {
    const r = validatePayload(validBody({ category: 'Not A Real Category' }))
    assert.equal(r.ok, false)
    assert.match(r.error, /category must be one of/)
  })

  test('rejects over-length fields', () => {
    const r = validatePayload(validBody({ title: 'x'.repeat(201) }))
    assert.equal(r.ok, false)
    assert.match(r.error, /exceeds the maximum/)
  })

  test('rejects non-object body', () => {
    assert.equal(validatePayload(null).ok, false)
    assert.equal(validatePayload([]).ok, false)
    assert.equal(validatePayload('string').ok, false)
  })

  test('rejects empty body array', () => {
    const r = validatePayload(validBody({ body: [] }))
    assert.equal(r.ok, false)
  })

  test('rejects blocks missing text string', () => {
    const r = validatePayload(validBody({ body: [{ style: 'normal' }] }))
    assert.equal(r.ok, false)
  })

  test('rejects unsupported listItem type', () => {
    const r = validatePayload(validBody({ body: [{ style: 'normal', listItem: 'checklist', text: 'x' }] }))
    assert.equal(r.ok, false)
  })
})

// ---------------------------------------------------------------------------
// HANDLER integration tests. A fake Sanity client is injected via
// setClientFactory so the auth, validation and slug-collision behaviour can
// be exercised without a live dataset or real network calls.
// ---------------------------------------------------------------------------

import { default as handler, setClientFactory } from './create-blog-draft.js'

function makeReq({ method = 'POST', body, token }) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  }
}

function makeRes() {
  const res = { _status: 200, _json: null, headers: {} }
  res.status = (code) => {
    res._status = code
    return res
  }
  res.setHeader = (k, v) => {
    res.headers[k] = v
  }
  res.json = (obj) => {
    res._json = obj
    return res
  }
  return res
}

function setEnv(overrides = {}) {
  const base = {
    SANITY_WRITE_TOKEN: 'test-write-token',
    BLOG_DRAFT_API_SECRET: 'test-secret',
    NEXT_PUBLIC_SANITY_PROJECT_ID: 'p0mpfgmr',
    NEXT_PUBLIC_SANITY_DATASET: 'production',
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
  delete process.env.SANITY_WRITE_TOKEN
  delete process.env.BLOG_DRAFT_API_SECRET
  delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  delete process.env.NEXT_PUBLIC_SANITY_DATASET
}

function validBody(overrides = {}) {
  return {
    title: 'My First Blog Post',
    slug: 'my-first-blog-post',
    category: 'Website Tips',
    excerpt: 'A short excerpt about the post.',
    seoTitle: 'My First Blog Post',
    seoDescription: 'A meta description for the post.',
    publishedDate: '2026-01-01T00:00:00.000Z',
    readingTime: 3,
    body: [
      { style: 'normal', text: 'Introductory paragraph.' },
      { style: 'h2', text: 'Main section heading' },
      { style: 'normal', text: 'Section content.' },
      { style: 'normal', listItem: 'bullet', text: 'Practical action.' },
    ],
    ...overrides,
  }
}

describe('POST /api/create-blog-draft auth & validation guards', () => {
  beforeEach(() => setEnv())
  afterEach(() => clearEnv())

  test('returns 405 for non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    assert.equal(res._status, 405)
    assert.equal(res.headers.Allow, 'POST')
  })

  test('returns 401 when no bearer token supplied', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody() }), res)
    assert.equal(res._status, 401)
  })

  test('returns 401 when wrong bearer token supplied', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody(), token: 'wrong-secret' }), res)
    assert.equal(res._status, 401)
  })

  test('returns 500 when not configured (no env vars)', async () => {
    clearEnv()
    const res = makeRes()
    await handler(makeReq({ body: validBody(), token: 'any' }), res)
    assert.equal(res._status, 500)
  })

  test('returns 400 for malformed JSON', async () => {
    const res = makeRes()
    const req = makeReq({ body: validBody(), token: 'test-secret' })
    req.body = '{ not valid json'
    await handler(req, res)
    assert.equal(res._status, 400)
  })

  test('returns 400 for invalid payload before any network call', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody({ category: 'Bogus' }), token: 'test-secret' }), res)
    assert.equal(res._status, 400)
    assert.match(res._json.error, /category must be one of/)
  })

  test('returns 400 when slug cannot be generated from title', async () => {
    const res = makeRes()
    await handler(
      makeReq({ body: validBody({ title: '!!!', slug: '!!!' }), token: 'test-secret' }),
      res
    )
    assert.equal(res._status, 400)
    assert.match(res._json.error, /Could not generate a slug/)
  })

  test('does not leak configuration or token details in error responses', async () => {
    clearEnv()
    const res = makeRes()
    await handler(makeReq({ body: validBody() }), res)
    assert.equal(res._status, 500)
    assert.equal(typeof res._json.error, 'string')
    assert.ok(!JSON.stringify(res._json).includes('test-write-token'))
    assert.ok(!JSON.stringify(res._json).includes('test-secret'))
  })
})

describe('POST /api/create-blog-draft happy path & slug collision', () => {
  let fetchResult
  let createdDoc
  let factoryCalls

  beforeEach(() => {
    setEnv()
    fetchResult = null
    createdDoc = null
    factoryCalls = []
    setClientFactory(({ projectId, dataset, token }) => {
      factoryCalls.push({ projectId, dataset, token })
      return {
        fetch: async (query, params) => {
          assert.equal(params.slug, 'my-first-blog-post')
          return fetchResult
        },
        create: async (doc) => {
          createdDoc = doc
          return doc
        },
      }
    })
  })

  afterEach(() => {
    clearEnv()
    setClientFactory(null) // restore default
  })

  test('creates a draft document and returns its id/slug (valid payload)', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody(), token: 'test-secret' }), res)

    assert.equal(res._status, 200)
    assert.equal(res._json.ok, true)
    assert.equal(res._json.slug, 'my-first-blog-post')
    assert.equal(res._json.draftId, 'drafts.blogPost-my-first-blog-post')
    assert.match(res._json.note, /Draft created/)

    // The client was constructed with server-only credentials — never a
    // NEXT_PUBLIC_ token.
    assert.equal(factoryCalls.length, 1)
    assert.equal(factoryCalls[0].token, 'test-write-token')
    assert.equal(factoryCalls[0].projectId, 'p0mpfgmr')
    assert.equal(factoryCalls[0].dataset, 'production')

    // Document is a draft in the Sanity drafts folder and never published.
    assert.ok(createdDoc)
    assert.ok(createdDoc._id.startsWith('drafts.'))
    assert.equal(createdDoc._type, 'blogPost')
    assert.equal(createdDoc.slug.current, 'my-first-blog-post')
  })

  test('uses title-derived slug, computed reading time and current date when missing', async () => {
    const body = validBody()
    delete body.slug
    delete body.readingTime
    delete body.publishedDate

    const res = makeRes()
    await handler(makeReq({ body, token: 'test-secret' }), res)

    assert.equal(res._status, 200)
    assert.equal(createdDoc.slug.current, 'my-first-blog-post')
    assert.equal(typeof createdDoc.readingTime, 'number')
    assert.ok(createdDoc.readingTime >= 1)
    const nowMs = Date.now()
    const createdMs = Date.parse(createdDoc.publishedDate)
    assert.ok(Math.abs(nowMs - createdMs) < 60_000, 'publishedDate should be ~now')
    assert.equal(res._json.draftId, 'drafts.blogPost-my-first-blog-post')
  })

  test('attaches image reference when imageAssetId is supplied', async () => {
    const body = validBody({ imageAssetId: 'image-abc123', imageAlt: 'Alt text here' })
    const res = makeRes()
    await handler(makeReq({ body, token: 'test-secret' }), res)

    assert.equal(res._status, 200)
    assert.deepEqual(createdDoc.image, {
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-abc123' },
      alt: 'Alt text here',
    })
  })

  test('omits image when imageAssetId is absent', async () => {
    const body = validBody({ imageAssetId: undefined, imageAlt: undefined })
    const res = makeRes()
    await handler(makeReq({ body, token: 'test-secret' }), res)
    assert.equal(res._status, 200)
    assert.equal(createdDoc.image, undefined)
  })

  test('converts payload blocks into Portable Text in the created document', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody(), token: 'test-secret' }), res)

    assert.equal(createdDoc.body.length, 4)
    assert.deepEqual(createdDoc.body.map((b) => b.style), ['normal', 'h2', 'normal', 'normal'])
    assert.equal(createdDoc.body[3].listItem, 'bullet')
    for (const b of createdDoc.body) {
      assert.equal(b._type, 'block')
      assert.ok(b._key)
      assert.ok(b.children[0].text)
    }
  })

  test('returns 409 when a post with the same slug already exists', async () => {
    fetchResult = { _id: 'blogPost.my-first-blog-post' }
    const res = makeRes()
    await handler(makeReq({ body: validBody(), token: 'test-secret' }), res)

    assert.equal(res._status, 409)
    assert.match(res._json.error, /already exists/)
    assert.equal(createdDoc, null, 'must not create when a duplicate exists')
  })
})


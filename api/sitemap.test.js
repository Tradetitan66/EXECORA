import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { default as handler, setClientFactory } from './sitemap.js'

// ---------------------------------------------------------------------------
// Handler tests. A fake Sanity client is injected via setClientFactory so the
// success, fallback and method-guard behaviour is exercised without a live
// dataset or real network calls.
// ---------------------------------------------------------------------------

function makeReq({ method = 'GET' } = {}) {
  return { method }
}

function makeRes() {
  const res = { _status: 200, _body: null, headers: {} }
  res.status = (code) => {
    res._status = code
    return res
  }
  res.setHeader = (k, v) => {
    res.headers[k] = v
    return res
  }
  res.send = (body) => {
    res._body = body
    return res
  }
  res.json = (obj) => {
    res._body = obj
    return res
  }
  return res
}

function fakeClient(posts, { fail = false } = {}) {
  return {
    fetch: async () => {
      if (fail) throw new Error('Sanity unreachable')
      return posts
    },
  }
}

const baseEnv = {
  NEXT_PUBLIC_SANITY_PROJECT_ID: 'p0mpfgmr',
  NEXT_PUBLIC_SANITY_DATASET: 'production',
}

beforeEach(() => {
  setClientFactory(() => fakeClient([]))
  Object.entries(baseEnv).forEach(([k, v]) => {
    process.env[k] = v
  })
})

afterEach(() => {
  setClientFactory(null)
  Object.keys(baseEnv).forEach((k) => delete process.env[k])
})

test('only allows GET', async () => {
  const res = makeRes()
  await handler(makeReq({ method: 'POST' }), res)
  assert.equal(res._status, 405)
  assert.equal(res.headers.Allow, 'GET')
})

test('returns a sitemap with home, blog and every returned post', async () => {
  setClientFactory(() =>
    fakeClient([
      {
        _id: 'post-1',
        _updatedAt: '2026-03-04T12:00:00Z',
        slug: { current: 'how-to-show-your-prices-clearly' },
      },
      {
        _id: 'post-2',
        _updatedAt: '2026-08-01T09:00:00Z',
        slug: { current: 'another-tip' },
      },
    ])
  )

  const res = makeRes()
  await handler(makeReq(), res)

  assert.equal(res._status, 200)
  assert.match(res.headers['Content-Type'], /application\/xml/)
  assert.match(res.headers['Cache-Control'], /s-maxage=600/)
  assert.match(res._body, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
  assert.match(res._body, /<loc>https:\/\/www\.execora\.work\/<\/loc>/)
  assert.match(res._body, /<loc>https:\/\/www\.execora\.work\/blog<\/loc>/)
  assert.match(res._body, /https:\/\/www\.execora\.work\/blog\/how-to-show-your-prices-clearly/)
  assert.match(res._body, /https:\/\/www\.execora\.work\/blog\/another-tip/)
  assert.match(res._body, /<lastmod>2026-03-04<\/lastmod>/)
  assert.equal((res._body.match(/<url>/g) || []).length, 4)
})

test('falls back to a minimal valid sitemap when Sanity is unreachable', async () => {
  setClientFactory(() => fakeClient([], { fail: true }))

  const res = makeRes()
  await handler(makeReq(), res)

  assert.equal(res._status, 200)
  assert.match(res.headers['Content-Type'], /application\/xml/)
  assert.match(res.headers['Cache-Control'], /s-maxage=60/)
  assert.match(res._body, /<loc>https:\/\/www\.execora\.work\/<\/loc>/)
  assert.match(res._body, /<loc>https:\/\/www\.execora\.work\/blog<\/loc>/)
  assert.equal((res._body.match(/<url>/g) || []).length, 2)
})

test('passes the project/dataset from env to the client factory', async () => {
  let received
  setClientFactory((opts) => {
    received = opts
    return fakeClient([])
  })
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'custom-proj'
  process.env.NEXT_PUBLIC_SANITY_DATASET = 'dev'

  const res = makeRes()
  await handler(makeReq(), res)

  assert.equal(res._status, 200)
  assert.equal(received.projectId, 'custom-proj')
  assert.equal(received.dataset, 'dev')
})
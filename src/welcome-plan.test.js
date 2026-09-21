import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLANS,
  planFromAmount,
  planFromQuery,
  resolvePlan,
  planSummary,
  buildWelcomeWhatsAppMessage,
} from './welcome-plan.js'

test('planFromAmount maps the £39 and £59 Stripe amounts to plan keys', () => {
  assert.equal(planFromAmount(3900), 'essential')
  assert.equal(planFromAmount(5900), 'growth')
})

test('planFromAmount accepts numeric strings and rejects unknown amounts', () => {
  assert.equal(planFromAmount('3900'), 'essential')
  assert.equal(planFromAmount(0), null)
  assert.equal(planFromAmount(null), null)
  assert.equal(planFromAmount(undefined), null)
  assert.equal(planFromAmount(1234), null)
})

test('planFromQuery only accepts known plan keys', () => {
  assert.equal(planFromQuery('essential'), 'essential')
  assert.equal(planFromQuery(' GROWTH '), 'growth')
  assert.equal(planFromQuery('premium'), null)
  assert.equal(planFromQuery(''), null)
  assert.equal(planFromQuery(undefined), null)
})

test('resolvePlan prefers the verified amount over the query param', () => {
  assert.equal(resolvePlan({ amount: 5900, query: 'essential' }), 'growth')
  assert.equal(resolvePlan({ amount: null, query: 'essential' }), 'essential')
  assert.equal(resolvePlan({}), null)
  assert.equal(resolvePlan(), null)
})

test('planSummary exposes the plan, monthly label and total', () => {
  assert.deepEqual(planSummary('essential'), {
    ...PLANS.essential,
    monthlyLabel: '£39/month',
    sub: 'Your £39/month Essential plan is active.',
  })
  assert.equal(planSummary('growth').total, 708)
  assert.equal(planSummary('nope'), null)
})

test('buildWelcomeWhatsAppMessage includes plan, fields and normalised website', () => {
  const msg = buildWelcomeWhatsAppMessage(
    {
      name: 'Sam',
      business: 'Brightside Plumbing',
      email: 'sam@brightside.co.uk',
      phone: '+44 7912 345678',
      type: 'Plumber',
      location: 'Edinburgh',
      services: 'Boilers, bathrooms',
      style: 'Clean and friendly',
      social: 'brightsideplumbing.co.uk',
      notes: 'Wants more quote requests',
    },
    'growth'
  )
  assert.match(msg, /Plan: £59\/month Growth/)
  assert.match(msg, /Name: Sam/)
  assert.match(msg, /Business: Brightside Plumbing/)
  assert.match(msg, /WhatsApp: \+44 7912 345678/)
  assert.match(msg, /Social \/ website: https:\/\/brightsideplumbing\.co\.uk/)
})

test('buildWelcomeWhatsAppMessage fills blanks with "Not provided"', () => {
  const msg = buildWelcomeWhatsAppMessage({ business: 'Brightside Plumbing' })
  assert.match(msg, /Plan: Not provided/)
  assert.match(msg, /Name: Not provided/)
  assert.match(msg, /Business: Brightside Plumbing/)
  assert.match(msg, /Notes: Not provided/)
})

test('buildWelcomeWhatsAppMessage handles no argument at all', () => {
  const msg = buildWelcomeWhatsAppMessage()
  assert.equal((msg.match(/Not provided/g) || []).length, 11)
})

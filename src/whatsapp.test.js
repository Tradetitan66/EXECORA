import test from 'node:test'
import assert from 'node:assert/strict'
import { WHATSAPP_NUMBER, normaliseWebsite, buildTermsWhatsAppMessage } from './whatsapp.js'

test('WhatsApp number is the shared Execora international number', () => {
  assert.equal(WHATSAPP_NUMBER, '4407345384868')
})

test('normaliseWebsite prefixes a bare domain with https://', () => {
  assert.equal(normaliseWebsite('brightsideplumbing.co.uk'), 'https://brightsideplumbing.co.uk')
  assert.equal(normaliseWebsite('www.brightside.co.uk'), 'https://www.brightside.co.uk')
})

test('normaliseWebsite keeps an existing scheme and trims whitespace', () => {
  assert.equal(normaliseWebsite('  https://brightside.co.uk  '), 'https://brightside.co.uk')
  assert.equal(normaliseWebsite('http://brightside.co.uk'), 'http://brightside.co.uk')
})

test('normaliseWebsite returns empty string for blank input', () => {
  assert.equal(normaliseWebsite(''), '')
  assert.equal(normaliseWebsite('   '), '')
  assert.equal(normaliseWebsite(undefined), '')
})

test('buildTermsWhatsAppMessage includes the three labelled fields', () => {
  const msg = buildTermsWhatsAppMessage({
    business: 'Brightside Plumbing',
    contact: '+44 7912 345678',
    website: 'brightsideplumbing.co.uk',
  })
  assert.match(msg, /Business name: Brightside Plumbing/)
  assert.match(msg, /Contact number: \+44 7912 345678/)
  assert.match(msg, /Website link: https:\/\/brightsideplumbing\.co\.uk/)
  assert.match(msg, /I'd like to get in touch about your website plans\./)
})

test('buildTermsWhatsAppMessage fills blanks with "Not provided"', () => {
  const msg = buildTermsWhatsAppMessage({ business: 'Brightside Plumbing' })
  assert.match(msg, /Business name: Brightside Plumbing/)
  assert.match(msg, /Contact number: Not provided/)
  assert.match(msg, /Website link: Not provided/)
})

test('buildTermsWhatsAppMessage handles no argument at all', () => {
  const msg = buildTermsWhatsAppMessage()
  assert.equal((msg.match(/Not provided/g) || []).length, 3)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  articleTitleString,
  isTruncatedSeoTitle,
  articleDescriptionString,
  cardHtml,
  renderIndexMarkup,
  renderArticleMarkup,
  autoRelatedMarkup,
  portableTextToHtml,
  articlePageMeta,
  indexPageMeta,
  organizationJsonLd,
  articleJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  collectionJsonLd,
  sitemapXml,
  robotsTxt,
} from './render.js'

/* ============================================================
   Focused tests for the shared blog renderer / SEO builders.
   Pure text in, text out - no network, no DOM.
   ============================================================ */

const basePost = {
  _id: 'post-1',
  _updatedAt: '2026-03-04T12:00:00Z',
  title: 'How to Show Your Prices Clearly Without Losing Enquiries',
  slug: { current: 'how-to-show-your-prices-clearly-without-losing-enquiries' },
  category: 'Website Tips',
  contentCluster: 'pricing',
  excerpt: 'A practical excerpt.',
  publishedDate: '2026-02-01T10:00:00Z',
  readingTime: 5,
  author: 'Execora Editorial Team',
  seoDescription: 'Practical tips for showing your prices to UK local businesses.',
  image: {
    asset: { _id: 'image-abc-1200x800-jpg', metadata: { dimensions: { width: 1200, height: 800 } } },
    alt: 'Website showing clear prices for a local business',
  },
  body: [
    { _type: 'block', style: 'h2', markDefs: [], listItem: undefined, children: [{ _type: 'span', text: 'Be clear about price' }] },
    { _type: 'block', style: 'normal', markDefs: [], listItem: undefined, children: [{ _type: 'span', text: 'Prospects value transparency.' }] },
    {
      _type: 'image',
      asset: { _ref: 'image-abc-1200x800-jpg' },
      imageDims: { width: 1200, height: 800 },
      alt: 'Price table',
    },
    { _type: 'block', style: 'normal', listItem: 'bullet', children: [{ _type: 'span', text: 'List item one' }] },
    { _type: 'block', style: 'normal', listItem: 'bullet', children: [{ _type: 'span', text: 'List item two' }] },
  ],
  relatedLinks: [
    { _type: 'relatedLinks', anchor: 'A linked tip', target: '/blog/some-other-tip', type: 'internal' },
  ],
  externalSources: [
    { _type: 'externalSources', label: 'A source', url: 'https://example.com/stats' },
  ],
}

const other = (slug, { category, title } = {}) => ({
  _id: slug,
  slug: { current: slug },
  title: title || slug.split('-').join(' '),
  category: category || 'Website Tips',
  contentCluster: 'pricing',
})

test('truncated 60-char SeoTitle values are rejected', () => {
  assert.equal(isTruncatedSeoTitle('How to Improve Your Google Business Profile for More Local T'), true)
  assert.equal(isTruncatedSeoTitle('How to Show Your Prices Clearly Without Losing Enquiries | E'), true)
  assert.equal(isTruncatedSeoTitle('Turn More Enquiries into Customers with a Simple Follow-Up |'), true)
  assert.equal(isTruncatedSeoTitle('9 Trust Signals Local Customers Look For Before They Enquire'), false)
  assert.equal(isTruncatedSeoTitle(''), false)
})

test('articleTitleString picks a complete seoTitle and brands it once', () => {
  assert.equal(
    articleTitleString({ title: 'X', seoTitle: 'Short SEO Title' }),
    'Short SEO Title - Execora'
  )
  // Falling back to the full post title for truncated seoTitle
  assert.equal(
    articleTitleString(basePost),
    'How to Show Your Prices Clearly Without Losing Enquiries - Execora'
  )
  // Already branded
  assert.equal(
    articleTitleString({ title: 'X', seoTitle: '7 Reasons Local Customers Leave Your Website | Execora' }),
    '7 Reasons Local Customers Leave Your Website | Execora'
  )
})

test('articleDescriptionString prefers the seoDescription', () => {
  assert.equal(articleDescriptionString(basePost), 'Practical tips for showing your prices to UK local businesses.')
  assert.equal(articleDescriptionString({ excerpt: 'Fallback' }), 'Fallback')
})

test('cardHtml emits canonical links and explicit image dimensions', () => {
  const html = cardHtml(basePost)
  assert.match(html, /href="\/blog\/how-to-show-your-prices-clearly-without-losing-enquiries"/)
  assert.match(html, /class="blog-card-title"/)
  assert.match(html, /width="1200" height="800"/)
})

test('renderIndexMarkup has a single H1 and no heading-level skip', () => {
  const markup = renderIndexMarkup({
    posts: [basePost],
    categories: ['Website Tips'],
  })
  assert.equal((markup.match(/<h1\b/g) || []).length, 1)
  assert.match(markup, /<h2 class="sr-only">Latest tips<\/h2>/)
  assert.match(markup, /<h3 class="blog-card-title">/)
  assert.match(markup, /<button class="blog-filter is-active" data-cat="all">All<\/button>/)
})

test('portableTextToHtml renders headings, paragraphs, lists and images', () => {
  const html = portableTextToHtml(basePost.body)
  assert.match(html, /<h2>Be clear about price<\/h2>/)
  assert.match(html, /<p>Prospects value transparency\.<\/p>/)
  assert.match(html, /<ul>\s*<li>List item one<\/li>\s*<li>List item two<\/li>\s*<\/ul>/)
  assert.match(html, /<figure class="article-figure"><img[^>]*width="1200" height="800"/)
  assert.match(html, /<figcaption>Price table<\/figcaption>/)
})

test('renderArticleMarkup has a single H1, related asides and CTA', () => {
  const html = renderArticleMarkup(basePost, { includeAutoRelated: true, allPosts: [] })
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.equal((html.match(/<h1 class="article-title">/g) || []).length, 1)
  assert.match(html, /<h2>Related reading<\/h2>/)
  assert.match(html, /<h2>Sources<\/h2>/)
  assert.match(html, /class="article-cta/)
  assert.doesNotMatch(html, /article-faq/)
})

test('renderArticleMarkup renders FAQ section from structured faq data', () => {
  const withFaq = {
    ...basePost,
    faq: [
      { question: 'Do plumbers need a website?', answer: 'Yes, to build trust.' },
      { question: 'What does it cost?', answer: 'It depends on scope.' },
      { question: '', answer: 'ignored' },
    ],
  }
  const html = renderArticleMarkup(withFaq, { includeAutoRelated: true, allPosts: [] })
  assert.match(html, /class="article-faq"/)
  assert.match(html, /Frequently asked questions/)
  assert.match(html, /Do plumbers need a website\?/)
  assert.match(html, /Yes, to build trust\./)
  assert.doesNotMatch(html, /ignored/)
})

test('renderArticleMarkup uses per-post CTA when present, static fallback otherwise', () => {
  const withCta = {
    ...basePost,
    cta: { heading: 'See your homepage preview', body: 'Low-risk to start.', buttonText: 'View plans', url: 'https://www.execora.work/' },
  }
  const html = renderArticleMarkup(withCta, { includeAutoRelated: true, allPosts: [] })
  assert.match(html, /See your homepage preview/)
  assert.match(html, /Low-risk to start\./)
  assert.match(html, /href="https:\/\/www\.execora\.work\/"/)

  const fallback = renderArticleMarkup(basePost, { includeAutoRelated: true, allPosts: [] })
  assert.match(fallback, /Need a better website for your business\?/)
  assert.match(fallback, /href="\/#pricing"/)
})

test('auto-related block is deterministic, capped at 3 and excludes self/manual', () => {
  const post = { ...basePost, slug: { current: 'self-tip' }, relatedLinks: [] }
  const manualTarget = 'manual-tip'
  const alreadyLinked = [
    ...basePost.relatedLinks,
    { anchor: 'Manual', target: `/blog/${manualTarget}`, type: 'internal' },
  ]
  const pool = [
    other('self-tip'),
    other(manualTarget, { category: 'Website Tips' }),
    other('a', { category: 'Website Tips' }),
    other('b', { category: 'Website Tips' }),
    other('c', { category: 'Website Tips' }),
    other('d', { category: 'Business Growth' }),
  ]
  const html = autoRelatedMarkup({ ...post, relatedLinks: alreadyLinked }, pool)
  const hrefs = [...html.matchAll(/href="\/blog\/([a-z-]+)"/g)].map((m) => m[1])
  assert.equal(hrefs.length, 3)
  assert.ok(!hrefs.includes('self-tip'))
  assert.ok(!hrefs.includes(manualTarget))
  assert.ok(html.includes('<h2>You might also like</h2>'))
})

test('page meta is unique and complete for index and article', () => {
  const article = articlePageMeta(basePost)
  assert.equal(article.url, 'https://www.execora.work/blog/how-to-show-your-prices-clearly-without-losing-enquiries')
  assert.equal(article.type, 'article')
  assert.ok(article.title.startsWith('How to Show Your Prices'))
  assert.ok(/cdn\.sanity\.io/.test(article.image))

  const index = indexPageMeta()
  assert.equal(index.url, 'https://www.execora.work/blog')
  assert.equal(index.title, 'Local Business Tips - Execora')
  assert.ok(index.image.endsWith('/og-card.png'))
})

test('JSON-LD builders emit valid, self-consistent objects', () => {
  const meta = articlePageMeta(basePost)
  const article = articleJsonLd(basePost, meta)
  assert.equal(article['@type'], 'Article')
  assert.equal(article.dateModified, '2026-03-04T12:00:00Z')
  assert.equal(article.datePublished, '2026-02-01T10:00:00Z')
  assert.equal(article.inLanguage, 'en-GB')
  assert.equal(article.publisher.name, 'Execora')

  const crumbs = breadcrumbJsonLd(basePost)
  assert.equal(crumbs.itemListElement.length, 3)
  assert.equal(crumbs.itemListElement[2].item, meta.url)

  const org = organizationJsonLd()
  assert.equal(org['@type'], 'Organization')
  assert.equal(org.name, 'Execora')

  const col = collectionJsonLd([basePost, other('x')])
  assert.equal(col['@type'], 'CollectionPage')
  assert.equal(col.mainEntity['@type'], 'ItemList')
  assert.equal(col.mainEntity.itemListElement.length, 2)
  assert.equal(col.mainEntity.itemListElement[0].position, 1)
})

test('faqJsonLd emits FAQPage only when the post has an faq array', () => {
  assert.equal(faqJsonLd(basePost), null)

  const withFaq = {
    ...basePost,
    faq: [
      { question: 'Do plumbers need a website?', answer: 'Yes, to build trust.' },
      { question: 'What does it cost?', answer: 'It depends.' },
    ],
  }
  const ld = faqJsonLd(withFaq)
  assert.equal(ld['@type'], 'FAQPage')
  assert.equal(ld.mainEntity.length, 2)
  assert.equal(ld.mainEntity[0]['@type'], 'Question')
  assert.equal(ld.mainEntity[0].name, 'Do plumbers need a website?')
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'Yes, to build trust.')
})

test('sitemap lists home, terms, blog and every post with real lastmod', () => {
  const xml = sitemapXml([basePost])
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<loc>https:\/\/www\.execora\.work\/<\/loc>/)
  assert.match(xml, /<loc>https:\/\/www\.execora\.work\/terms<\/loc>/)
  assert.match(xml, /<loc>https:\/\/www\.execora\.work\/blog<\/loc>/)
  assert.ok(
    xml.includes('<loc>https://www.execora.work/blog/how-to-show-your-prices-clearly-without-losing-enquiries</loc>')
  )
  assert.match(xml, /<lastmod>2026-03-04<\/lastmod>/)
  assert.equal((xml.match(/<url>/g) || []).length, 4)
})

test('robots.txt allows crawlers, disallows post-payment pages and declares the sitemap', () => {
  const robots = robotsTxt()
  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Allow: \/$/m)
  assert.match(robots, /^Disallow: \/welcome$/m)
  assert.match(robots, /^Disallow: \/thank-you$/m)
  assert.match(robots, /Sitemap: https:\/\/www\.execora\.work\/sitemap\.xml/)
})

test('auto-related does not render when there are no other posts', () => {
  assert.equal(autoRelatedMarkup({ ...basePost, slug: { current: 'only' }, relatedLinks: [] }, []), '')
})
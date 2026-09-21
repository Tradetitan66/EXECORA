import { createImageUrlBuilder } from '@sanity/image-url'

/* ============================================================
   Execora - shared blog rendering & SEO helpers.

   Pure module: runs in the browser (Vite client bundle), in Node
   (build-time prerender + unit tests) and from the Vite config.
   It never touches the DOM, never renders to any document and only
   reads env vars in a way that is safe in both runtimes.

   Both the client renderer (src/blog.js) and the static prerender
   plugin (src/seo/prerender.mjs) consume the exact same builders so
   the served HTML and the client-rendered DOM can never drift apart.
   ============================================================ */

export const SITE_URL = 'https://www.execora.work'
export const BLOG_URL = `${SITE_URL}/blog`
export const HOME_OG_IMAGE = `${SITE_URL}/showcase/shot-02.jpg`
export const BRAND_NAME = 'Execora'
export const EDITORIAL_TEAM = 'Execora Editorial Team'
export const DEFAULT_BLOG_DESCRIPTION =
  'Practical ideas to help local businesses improve their website, build trust online and turn more visitors into enquiries.'
export const INDEX_TITLE = 'Local Business Tips - Execora'

const isNode = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node)

function envVal(name, fallback) {
  if (isNode && process.env[name]) return process.env[name]
  if (typeof import.meta !== 'undefined' && typeof import.meta.env === 'object' && import.meta.env[name]) {
    return import.meta.env[name]
  }
  return fallback
}

export const SANITY_PROJECT_ID = envVal('NEXT_PUBLIC_SANITY_PROJECT_ID', 'p0mpfgmr')
export const SANITY_DATASET = envVal('NEXT_PUBLIC_SANITY_DATASET', 'production')

let imageBuilder = null

export function imageUrlFor(source) {
  if (!source || !source.asset) return null
  if (!imageBuilder) {
    imageBuilder = createImageUrlBuilder({ projectId: SANITY_PROJECT_ID, dataset: SANITY_DATASET })
  }
  return imageBuilder.image(source)
}

/** Absolute CDN URL for a Sanity image at a given width ('' when absent). */
export function imageSrc(source, width) {
  const url = imageUrlFor(source)
  return url ? url.width(width).auto('format').url() : ''
}

/**
 * Explicit width/height attributes (real asset dimensions) so images have
 * reserved layout space. Reads dimensions from either an `asset->` projection
 * (image.asset.metadata.dimensions) or a block-level `imageDimensions` field.
 */
export function dimensionAttrs(image) {
  const dims = image?.asset?.metadata?.dimensions || image?.imageDimensions
  return dims && dims.width && dims.height
    ? ` width="${Number(dims.width)}" height="${Number(dims.height)}"`
    : ''
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/* ============================================================
   Titles & descriptions
   ============================================================ */

/**
 * Some SeoTitle values are hard-truncated at 60 chars by the content model
 * (usually ending mid-word or as a dangling "| Execora"). Those are rejected
 * in favour of the full post title. Genuinely complete titles are kept.
 */
export function isTruncatedSeoTitle(value) {
  const s = String(value || '').trim()
  if (s.length < 58) return false
  const lastWord = s.split(/\s+/).pop() || ''
  return lastWord.length <= 1
}

export function articleTitleString(post) {
  const seo = (post.seoTitle || '').trim()
  const base = (seo && !isTruncatedSeoTitle(seo) ? seo : (post.title || '').trim()) || seo
  if (base.length >= 58 || /execora/i.test(base)) return base
  return `${base} - ${BRAND_NAME}`
}

export function articleDescriptionString(post) {
  return (post.seoDescription || '').trim() || (post.excerpt || '').trim() || ''
}

export function keywordsString(post) {
  const keys = [post.primaryKeyword, ...(post.secondaryKeywords || [])].filter(Boolean)
  return keys.length ? keys.join(', ') : ''
}

/* ============================================================
   Index markup (shared by client + prerender)
   ============================================================ */

export function categoryFilters(categories) {
  const buttons = ['<button class="blog-filter is-active" data-cat="all">All</button>']
  for (const c of categories) {
    buttons.push(`<button class="blog-filter" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
  }
  return `<div class="blog-filterbar"><span class="blog-filter-label">Browse:</span><div class="blog-filters-inner">${buttons.join('')}</div></div>`
}

export function emptyState() {
  return `
    <div class="blog-empty">
      <p class="blog-empty-title">No tips yet</p>
      <p class="blog-empty-body">
        Check back soon - we're writing practical guides for local businesses.
      </p>
    </div>
  `
}

export function cardHtml(post) {
  const url = post.slug?.current ? `/blog/${post.slug.current}` : '#'
  const imgUrl = imageSrc(post.image, 800)
  const dims = dimensionAttrs(post.image)
  const date = formatDate(post.publishedDate)
  const cat = post.category || 'Article'

  const media = imgUrl
    ? `<div class="blog-card-media"><img src="${imgUrl}" alt="" loading="lazy"${dims} /></div>`
    : `<div class="blog-card-media blog-card-media--empty"><span>${cat}</span></div>`

  return `
    <a class="blog-card" href="${url}">
      ${media}
      <div class="blog-card-body">
        <div class="blog-card-meta">
          <span class="blog-card-cat">${cat}</span>
          ${date ? `<span class="blog-card-date">${date}</span>` : ''}
        </div>
        <h3 class="blog-card-title">${escapeHtml(post.title || '')}</h3>
        ${post.excerpt ? `<p class="blog-card-excerpt">${escapeHtml(post.excerpt)}</p>` : ''}
        <div class="blog-card-foot">
          ${post.readingTime ? `<span class="blog-card-read">${post.readingTime} min read</span>` : ''}
          <span class="blog-card-link">Read tips <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </a>
  `
}

export function renderIndexMarkup({ posts, categories }) {
  const filters = categories && categories.length ? categoryFilters(categories) : ''
  return `
    <section class="blog-index">
      <header class="blog-head reveal is-visible">
        <span class="eyebrow">Execora blog</span>
        <h1 class="blog-title">Local business tips</h1>
        <p class="blog-lead">
          Practical ideas to help local businesses improve their website, build trust online
          and turn more visitors into enquiries.
        </p>
      </header>

      <div class="blog-subscribe-wrap reveal" id="blog-subscribe-wrap">
        <div class="blog-subscribe-card">
          <div class="blog-subscribe-text">
            <h2 class="blog-subscribe-title">Get tips straight to your inbox</h2>
            <p class="blog-subscribe-desc">Practical advice for local businesses - no spam, just useful ideas you can act on.</p>
          </div>
          <form class="blog-subscribe-form" id="blog-subscribe-form">
            <input type="hidden" name="type" value="blog-subscriber" />
            <div class="blog-subscribe-fields">
              <div class="blog-subscribe-field">
                <label for="bs-business" class="sr-only">Business name</label>
                <input type="text" id="bs-business" name="business name" placeholder="Business name" required autocomplete="organization" />
              </div>
              <div class="blog-subscribe-field">
                <label for="bs-email" class="sr-only">Email address</label>
                <input type="email" id="bs-email" name="email" placeholder="Email address" required autocomplete="email" />
              </div>
              <div class="blog-subscribe-field">
                <label for="bs-phone" class="sr-only">Phone (optional)</label>
                <input type="tel" id="bs-phone" name="phone number optional" placeholder="Phone (optional)" autocomplete="tel" />
              </div>
              <button type="submit" class="btn btn-coral blog-subscribe-btn">Subscribe</button>
            </div>
            <p class="blog-subscribe-note" id="blog-subscribe-note"></p>
          </form>
          <div class="blog-subscribe-success" id="blog-subscribe-success" hidden>
            <p class="blog-subscribe-success-text">You're subscribed! We'll send you useful tips for your business.</p>
          </div>
        </div>
      </div>

      <div class="blog-filters">${filters}</div>

      <h2 class="sr-only">Latest tips</h2>
      <div class="blog-grid" id="blog-grid">
        ${posts.length ? posts.map(cardHtml).join('') : emptyState()}
      </div>
    </section>
  `
}

/* ============================================================
   Article markup (shared by client + prerender)
   ============================================================ */

export function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return ''

  const out = []
  let listBuffer = null // { type: 'bullet'|'number', items: [] }

  function flushList() {
    if (!listBuffer) return
    const tag = listBuffer.type === 'number' ? 'ol' : 'ul'
    out.push(`<${tag}>`)
    for (const item of listBuffer.items) {
      out.push(`<li>${item}</li>`)
    }
    out.push(`</${tag}>`)
    listBuffer = null
  }

  for (const block of blocks) {
    const { _type } = block

    if (_type === 'image') {
      flushList()
      const src = imageSrc(block, 1200)
      if (src) {
        const alt = block.alt || ''
        const dims = block.imageDims
        const dimAttr =
          dims && dims.width && dims.height
            ? ` width="${Number(dims.width)}" height="${Number(dims.height)}"`
            : ''
        out.push(
          `<figure class="article-figure"><img src="${src}" alt="${escapeHtml(
            alt
          )}" loading="lazy"${dimAttr} /><figcaption>${escapeHtml(alt)}</figcaption></figure>`
        )
      }
      continue
    }

    if (_type !== 'block') continue

    // Inline link wrapping
    const markDefs = block.markDefs || []
    const linkDef = markDefs.find((m) => m._type === 'link')

    let text = escapeHtml(block.children?.map((c) => c.text || '').join('') || '')

    if (linkDef && linkDef.href) {
      const ext = /^https?:\/\//.test(linkDef.href) && !linkDef.href.includes('execora')
      const target = ext ? ' target="_blank" rel="noopener"' : ''
      text = `<a href="${escapeHtml(linkDef.href)}"${target}>${text}</a>`
    }

    if (block.style === 'h2') {
      flushList()
      out.push(`<h2>${text}</h2>`)
    } else if (block.style === 'h3') {
      flushList()
      out.push(`<h3>${text}</h3>`)
    } else if (block.listItem === 'bullet') {
      if (!listBuffer || listBuffer.type !== 'bullet') {
        flushList()
        listBuffer = { type: 'bullet', items: [] }
      }
      listBuffer.items.push(text)
    } else if (block.listItem === 'number') {
      if (!listBuffer || listBuffer.type !== 'number') {
        flushList()
        listBuffer = { type: 'number', items: [] }
      }
      listBuffer.items.push(text)
    } else {
      flushList()
      out.push(`<p>${text}</p>`)
    }
  }

  flushList()
  return out.join('\n')
}

/** Curated + external "related" blocks already provided by the CMS. */
export function relatedMarkup(relatedLinks, externalSources) {
  const parts = []
  const isLocalPath = (target) => /^\/blog\/[\w-]+$/i.test(target)
  const isExternalUrl = (target) => /^https?:\/\//i.test(target)
  const isSelfDomain = (target) => /^https?:\/\/(www\.)?execora\.work/i.test(target)

  const internal = (relatedLinks || []).filter((l) => l && l.type !== 'external')
  const external = (relatedLinks || []).filter((l) => l && l.type === 'external')

  if (internal.length) {
    const items = internal
      .filter((l) => l.anchor && isLocalPath(l.target))
      .map((l) => `<li><a href="${escapeHtml(l.target)}">${escapeHtml(l.anchor)}</a></li>`)
      .join('')
    if (items) parts.push(`<aside class="article-related"><h2>Related reading</h2><ul>${items}</ul></aside>`)
  }

  if (external.length) {
    const items = external
      .filter((l) => l.anchor && isExternalUrl(l.target) && !isSelfDomain(l.target))
      .map(
        (l) =>
          `<li><a href="${escapeHtml(l.target)}" target="_blank" rel="noopener">${escapeHtml(l.anchor)}</a></li>`
      )
      .join('')
    if (items) parts.push(`<aside class="article-related"><h2>Related resources</h2><ul>${items}</ul></aside>`)
  }

  const sources = (externalSources || []).filter(
    (s) => s && s.label && s.url && isExternalUrl(s.url) && !isSelfDomain(s.url)
  )
  if (sources.length) {
    const items = sources
      .map(
        (s) =>
          `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a></li>`
      )
      .join('')
    parts.push(`<aside class="article-related article-sources"><h2>Sources</h2><ul>${items}</ul></aside>`)
  }

  return parts.join('')
}

/**
 * Auto-generated contextual cross-links (internal-link audit). Deterministic:
 * same category first, then same content cluster, then most recent; capped at
 * 3, never linking to the current article or to posts already curated manually.
 */
export function autoRelatedMarkup(post, allPosts) {
  const currentSlug = post.slug?.current
  const manual = new Set(
    (post.relatedLinks || [])
      .filter((l) => l && l.target)
      .map((l) => l.target.replace(/^https?:\/\/(www\.)?execora\.work/, '').replace(/\/+$/, ''))
  )

  const pool = (allPosts || []).filter(
    (p) => p.slug?.current && p.slug.current !== currentSlug && !manual.has(`/blog/${p.slug.current}`)
  )
  const byCategory = pool.filter((p) => p.category === post.category)
  const byCluster = pool.filter((p) => p.contentCluster === post.contentCluster)

  const picks = []
  const seen = new Set()
  for (const source of [byCategory, byCluster, pool]) {
    for (const p of source) {
      if (picks.length >= 3) break
      if (seen.has(p.slug.current)) continue
      seen.add(p.slug.current)
      picks.push(p)
    }
    if (picks.length >= 3) break
  }

  if (!picks.length) return ''
  const items = picks
    .map(
      (p) => `<li><a href="/blog/${escapeHtml(p.slug.current)}">${escapeHtml(p.title)}</a></li>`
    )
    .join('')
  return `<aside class="article-related article-auto-related"><h2>You might also like</h2><ul>${items}</ul></aside>`
}

export function renderArticleMarkup(post, opts = {}) {
  const img = imageUrlFor(post.image)
  const imgUrl = img ? img.width(1400).auto('format').url() : ''
  const dims = dimensionAttrs(post.image)
  const alt = post.image?.alt || post.title || ''
  const date = formatDate(post.publishedDate)
  const body = Array.isArray(post.body) ? portableTextToHtml(post.body) : ''

  let related = relatedMarkup(post.relatedLinks, post.externalSources)
  if (opts.includeAutoRelated && opts.allPosts) {
    related += autoRelatedMarkup(post, opts.allPosts)
  }

  return `
    <article class="blog-article-inner">
      <header class="article-head reveal is-visible">
        <a class="article-back" href="/blog">← All tips</a>
        <span class="blog-card-cat">${post.category || 'Tip'}</span>
        <h1 class="article-title">${escapeHtml(post.title || '')}</h1>
        <div class="article-meta">
          ${date ? `<span>${date}</span>` : ''}
          ${post.readingTime ? `<span>${post.readingTime} min read</span>` : ''}
          ${post.author ? `<span>${escapeHtml(post.author)}</span>` : ''}
        </div>
      </header>

      ${imgUrl ? `<figure class="article-hero"><img src="${imgUrl}" alt="${escapeHtml(alt)}" /></figure>` : ''}

      <div class="article-body ${imgUrl ? '' : 'no-media'}">${body}</div>

      ${related}

      <footer class="article-cta reveal">
        <span class="eyebrow">Let's work together</span>
        <h2 class="article-cta-title">Need a better website for your business?</h2>
        <p class="article-cta-body">
          Execora builds simple, professional websites designed to help local businesses get found,
          build trust and generate enquiries.
        </p>
        <a class="btn btn-coral" href="/#pricing">View our plans</a>
      </footer>
    </article>
  `
}

/* ============================================================
   Head / meta
   ============================================================ */

export function indexPageMeta() {
  return {
    title: INDEX_TITLE,
    description: DEFAULT_BLOG_DESCRIPTION,
    url: BLOG_URL,
    image: HOME_OG_IMAGE,
    type: 'website',
    keywords: '',
  }
}

export function articlePageMeta(post) {
  const slug = post.slug?.current
  return {
    title: articleTitleString(post),
    description: articleDescriptionString(post),
    url: slug ? `${BLOG_URL}/${slug}` : BLOG_URL,
    image: imageSrc(post.image, 1200),
    type: 'article',
    keywords: keywordsString(post),
    author: post.author || EDITORIAL_TEAM,
  }
}

export function headTags(meta, jsonLdScripts = []) {
  const lines = []
  lines.push(`<title>${escapeHtml(meta.title)}</title>`)
  lines.push(`<meta name="description" content="${escapeHtml(meta.description || '')}" />`)
  lines.push(`<link rel="canonical" href="${escapeHtml(meta.url)}" />`)
  lines.push(`<meta property="og:type" content="${escapeHtml(meta.type || 'website')}" />`)
  lines.push(`<meta property="og:site_name" content="${BRAND_NAME}" />`)
  lines.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`)
  lines.push(`<meta property="og:description" content="${escapeHtml(meta.description || '')}" />`)
  lines.push(`<meta property="og:url" content="${escapeHtml(meta.url)}" />`)
  if (meta.image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    lines.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
  }
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`)
  lines.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`)
  lines.push(`<meta name="twitter:description" content="${escapeHtml(meta.description || '')}" />`)
  if (meta.keywords) lines.push(`<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`)
  if (meta.author) lines.push(`<meta name="author" content="${escapeHtml(meta.author)}" />`)
  for (const item of jsonLdScripts) {
    const attr = item.attrs ? ` ${item.attrs}` : ''
    lines.push(`<script type="application/ld+json"${attr}>${JSON.stringify(item.json)}</script>`)
  }
  return lines.join('\n    ')
}

/* ============================================================
   Structured data
   ============================================================ */

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.png` },
    email: 'hello@execora.work',
    description:
      'Execora helps local businesses get online with professional websites and local visibility support.',
  }
}

export function collectionJsonLd(posts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: INDEX_TITLE,
    url: BLOG_URL,
    isPartOf: { '@type': 'WebSite', name: BRAND_NAME, url: `${SITE_URL}/` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: (posts || []).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: `${BLOG_URL}/${p.slug.current}`,
      })),
    },
  }
}

export function articleJsonLd(post, meta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
    headline: post.title,
    description: meta.description || undefined,
    image: meta.image || undefined,
    author: { '@type': 'Organization', name: post.author || EDITORIAL_TEAM, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.png` },
    },
    datePublished: post.publishedDate || undefined,
    dateModified: post._updatedAt || post.publishedDate || undefined,
    inLanguage: 'en-GB',
  }
}

export function breadcrumbJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Local Business Tips', item: BLOG_URL },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${BLOG_URL}/${post.slug.current}` },
    ],
  }
}

/* ============================================================
   Sitemap & robots
   ============================================================ */

export function sitemapXml(posts) {
  const urls = [{ loc: `${SITE_URL}/` }, { loc: `${SITE_URL}/terms` }, { loc: BLOG_URL }]
  for (const p of posts || []) {
    urls.push({
      loc: `${BLOG_URL}/${p.slug.current}`,
      lastmod: (p._updatedAt || '').slice(0, 10),
    })
  }
  const rows = urls
    .map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''
      return `  <url>\n    <loc>${u.loc}</loc>${lastmod}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`
}

export function robotsTxt() {
  return [
    `# ${BRAND_NAME} robots.txt`,
    '# Crawlers are welcome. The XML sitemap is declared below.',
    'User-agent: *',
    'Allow: /',
    '# Private post-payment pages (no SEO value).',
    'Disallow: /welcome',
    'Disallow: /thank-you',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
}
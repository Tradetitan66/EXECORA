import './style.css'
import './blog.css'
import { client, imageUrlFor, formatDate, sanityProjectId, sanityDataset } from './sanity/client.js'
import { blogPostsQuery, blogPostBySlugQuery, blogCategoriesQuery } from './sanity/queries.js'
import { portableTextToHtml } from './sanity/portable.js'
import { initAnalytics, trackEvent } from './analytics.js'

/* ============================================================
   Blog - index + article views, rendered from Sanity (real-time)
   Routes:
     /blog            → index
     /blog/<slug>     → single article
   ============================================================ */

const CONTACT_SCRIPT_URL = import.meta.env.NEXT_PUBLIC_CONTACT_SCRIPT_URL

const PAGE_SIZE = 6

function currentSlug() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  // e.g. "/blog" -> null (index), "/blog/hello-world" -> "hello-world"
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return null
  return decodeURIComponent(parts[parts.length - 1])
}

/* ---------- mobile nav ---------- */
function initMenu() {
  const toggle = document.getElementById('menu-toggle')
  const nav = document.getElementById('site-nav')
  if (!toggle || !nav) return
  const close = () => {
    nav.classList.remove('is-open')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', 'Open menu')
  }
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  })
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })
}

/* ---------- glass header ---------- */
function initHeaderGlass() {
  const header = document.querySelector('.nav-bar')
  if (!header) return
  let ticking = false
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8)
    ticking = false
  }
  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }, { passive: true })
  update()
}

/* ---------- SEO helpers (article) ---------- */
function setMetaName(name, value) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setMetaProperty(property, value) {
  let el = document.querySelector(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

/* ---------- renderers ---------- */
function cardHtml(post) {
  const url = post.slug?.current ? `/blog/${post.slug.current}` : '#'
  const img = post.image ? imageUrlFor(post.image) : null
  const imgUrl = img ? img.width(800).auto('format').url() : ''
  const date = formatDate(post.publishedDate)
  const cat = post.category || 'Article'

  const media = imgUrl
    ? `<div class="blog-card-media"><img src="${imgUrl}" alt="" loading="lazy" /></div>`
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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* ---------- render: index ---------- */
async function renderIndex() {
  const indexEl = document.getElementById('blog-index')
  const loadingEl = document.getElementById('blog-loading')

  let posts = []
  let categories = []
  try {
    posts = await client.fetch(blogPostsQuery)
    categories = await client.fetch(blogCategoriesQuery)
  } catch (err) {
    console.warn('[Execora] Sanity unavailable while loading the blog.', err)
  }

  indexEl.innerHTML = `
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
            <p class="blog-subscribe-desc">Practical advice for local businesses — no spam, just useful ideas you can act on.</p>
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

      <div class="blog-filters">${categories.length ? categoryFilters(categories) : ''}</div>

      <div class="blog-grid" id="blog-grid">
        ${posts.length ? posts.map(cardHtml).join('') : emptyState()}
      </div>
    </section>
  `

  indexEl.hidden = false
  if (loadingEl) loadingEl.hidden = true

  initFilters(posts)
  initBlogSubscribe()
  initReveal()
}

function categoryFilters(categories) {
  const buttons = ['<button class="blog-filter is-active" data-cat="all">All</button>']
  for (const c of categories) {
    buttons.push(`<button class="blog-filter" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
  }
  return `<div class="blog-filterbar"><span class="blog-filter-label">Browse:</span><div class="blog-filters-inner">${buttons.join('')}</div></div>`
}

function emptyState() {
  return `
    <div class="blog-empty">
      <p class="blog-empty-title">No tips yet</p>
      <p class="blog-empty-body">
        Check back soon - we’re writing practical guides for local businesses.
      </p>
    </div>
  `
}

function initFilters(posts) {
  const grid = document.getElementById('blog-grid')
  const filterEls = document.querySelectorAll('.blog-filter')
  if (!grid || filterEls.length === 0) return

  filterEls.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterEls.forEach((b) => b.classList.toggle('is-active', b === btn))
      const cat = btn.getAttribute('data-cat')
      const filtered = cat === 'all' ? posts : posts.filter((p) => p.category === cat)
      grid.innerHTML = filtered.length ? filtered.map(cardHtml).join('') : emptyState()
    })
  })
}

/* ---------- blog subscribe form ---------- */
function initBlogSubscribe() {
  const form = document.getElementById('blog-subscribe-form')
  const note = document.getElementById('blog-subscribe-note')
  const wrap = document.getElementById('blog-subscribe-wrap')
  const success = document.getElementById('blog-subscribe-success')
  if (!form || !wrap) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    const data = Object.fromEntries(new FormData(form).entries())
    note.textContent = 'Saving your details…'
    note.style.color = '#78716c'

    if (CONTACT_SCRIPT_URL) {
      const body = new URLSearchParams(data)
      try {
        const res = await fetch(CONTACT_SCRIPT_URL, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })
        if (!res.ok) {
          console.error(`[Execora] Blog subscribe save rejected (HTTP ${res.status}).`)
          note.textContent = 'Something went wrong — please try again.'
          note.style.color = '#b91c1c'
          return
        }
      } catch (err) {
        console.error('[Execora] Blog subscribe save failed:', err)
        note.textContent = 'Something went wrong — please try again.'
        note.style.color = '#b91c1c'
        return
      }
    }

    form.hidden = true
    success.hidden = false
    trackEvent('blog_subscribe')
  })
}

/* ---------- footer newsletter ---------- */
function initFooterNewsletter() {
  const form = document.getElementById('newsletter-form')
  const note = document.getElementById('newsletter-note')
  const success = document.getElementById('newsletter-success')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const emailField = form.querySelector('#nl-email')
    if (!emailField.value || !emailField.checkValidity()) {
      emailField.reportValidity()
      return
    }

    const data = Object.fromEntries(new FormData(form).entries())
    if (note) note.textContent = 'Saving your details…'

    if (CONTACT_SCRIPT_URL) {
      const body = new URLSearchParams(data)
      try {
        const res = await fetch(CONTACT_SCRIPT_URL, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })
        if (!res.ok) {
          console.error(`[Execora] Newsletter save rejected (HTTP ${res.status}).`)
          if (note) note.textContent = 'Something went wrong — please try again.'
          return
        }
      } catch (err) {
        console.error('[Execora] Newsletter save failed:', err)
        if (note) note.textContent = 'Something went wrong — please try again.'
        return
      }
    }

    form.hidden = true
    if (success) success.hidden = false
    trackEvent('newsletter_subscribe')
  })
}

/* ---------- render: article ---------- */
async function renderArticle(slug) {
  const articleEl = document.getElementById('blog-article')
  const loadingEl = document.getElementById('blog-loading')

  let post = null
  try {
    post = await client.fetch(blogPostBySlugQuery, { slug })
  } catch (err) {
    console.warn('[Execora] Sanity unavailable while loading the article.', err)
  }

  if (!post) {
    renderNotFound()
    if (loadingEl) loadingEl.hidden = true
    return
  }

  const img = post.image ? imageUrlFor(post.image) : null
  const imgUrl = img ? img.width(1400).auto('format').url() : ''
  const alt = post.image?.alt || post.title || ''
  const date = formatDate(post.publishedDate)
  const body = Array.isArray(post.body) ? portableTextToHtml(post.body) : ''
  const pageUrl = `https://www.execora.work/blog/${post.slug?.current || ''}`

  // SEO
  document.title = post.seoTitle || `${post.title} - Execora`
  setMetaProperty('og:title', post.title)
  setMetaName('description', post.seoDescription || post.excerpt || '')
  setMetaProperty('og:description', post.seoDescription || post.excerpt || '')
  setMetaName('twitter:description', post.seoDescription || post.excerpt || '')
  setMetaName('twitter:title', post.title)
  setMetaProperty('og:url', pageUrl)
  setCanonical(pageUrl)
  if (imgUrl) setMetaProperty('og:image', imgUrl)

  articleEl.innerHTML = `
    <article class="blog-article-inner">
      <header class="article-head reveal is-visible">
        <a class="article-back" href="/blog">← All tips</a>
        <span class="blog-card-cat">${post.category || 'Tip'}</span>
        <h1 class="article-title">${escapeHtml(post.title || '')}</h1>
        <div class="article-meta">
          ${date ? `<span>${date}</span>` : ''}
          ${post.readingTime ? `<span>${post.readingTime} min read</span>` : ''}
        </div>
      </header>

      ${imgUrl ? `<figure class="article-hero"><img src="${imgUrl}" alt="${escapeHtml(alt)}" /></figure>` : ''}

      <div class="article-body ${imgUrl ? '' : 'no-media'}">${body}</div>

      <footer class="article-cta reveal">
        <span class="eyebrow">Let’s work together</span>
        <h2 class="article-cta-title">Need a better website for your business?</h2>
        <p class="article-cta-body">
          Execora builds simple, professional websites designed to help local businesses get found,
          build trust and generate enquiries.
        </p>
        <a class="btn btn-coral" href="/#pricing">View our plans</a>
      </footer>
    </article>
  `

  articleEl.hidden = false
  if (loadingEl) loadingEl.hidden = true
  initReveal()
}

function renderNotFound() {
  const indexEl = document.getElementById('blog-index')
  const loadingEl = document.getElementById('blog-loading')
  indexEl.innerHTML = `
    <section class="blog-index">
      <header class="blog-head reveal is-visible">
        <span class="eyebrow">Local business tips</span>
        <h1 class="blog-title">Tip not found</h1>
        <p class="blog-lead">The tip you’re looking for doesn’t exist or isn’t published yet.</p>
        <a class="btn btn-coral" href="/blog">Back to tips</a>
      </header>
    </section>
  `
  indexEl.hidden = false
  if (loadingEl) loadingEl.hidden = true
}

/* ---------- reveal on scroll ---------- */
function initReveal() {
  const els = document.querySelectorAll('.blog-index .reveal, .blog-article .reveal')
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          io.unobserve(e.target)
        }
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  )
  els.forEach((el) => io.observe(el))
}

/* ---------- privacy link ---------- */
function initPrivacy() {
  const link = document.getElementById('privacy-link')
  if (!link) return
  link.addEventListener('click', (e) => {
    e.preventDefault()
    window.alert(
      'Execora respects your privacy. We only use the details you share with us to respond to your enquiry - we never sell or share your information.'
    )
  })
}

/* ---------- boot ---------- */
function boot() {
  // Initialise GA4 with a single page_view for the current blog route
  // (/blog for the index, /blog/<slug> for an article).
  initAnalytics({ path: window.location.pathname.replace(/\/+$/, '') || '/' })

  initMenu()
  initHeaderGlass()
  initPrivacy()
  initFooterNewsletter()

  const slug = currentSlug()
  if (slug) {
    renderArticle(slug)
  } else {
    renderIndex()
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

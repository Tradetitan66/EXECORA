import './style.css'
import './blog.css'
import { client } from './sanity/client.js'
import { blogPostsQuery, blogPostBySlugQuery, blogCategoriesQuery } from './sanity/queries.js'
import {
  renderIndexMarkup,
  renderArticleMarkup,
  cardHtml,
  emptyState,
  articlePageMeta,
  articleJsonLd,
} from './seo/render.js'
import { initAnalytics, trackEvent } from './analytics.js'
import { initCheckout } from './checkout.js'

/* ============================================================
   Blog - index + article views, rendered from Sanity (real-time)
   Routes:
     /blog            → index
     /blog/<slug>     → single article

   Markup is shared with the static prerender (src/seo/render.js) so
   the initial HTML served for a page and the client-rendered DOM are
   identical. SEO metadata (title, description, canonical, Open Graph,
   JSON-LD) is computed there too and applied here for navigation after
   the page has already been served with it in place.
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

/* ---------- SEO helpers ---------- */
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

/**
 * Update the prerendered Article JSON-LD (matched via data-article-jsonld)
 * or create it if the page was served without one (SPA fallback route).
 */
function setArticleJsonLd(post, meta) {
  const payload = articleJsonLd(post, meta)
  const script = document.querySelector('script[data-article-jsonld]')
  if (script) {
    script.textContent = JSON.stringify(payload)
    return
  }
  const el = document.createElement('script')
  el.type = 'application/ld+json'
  el.setAttribute('data-article-jsonld', '')
  el.textContent = JSON.stringify(payload)
  document.head.appendChild(el)
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

  indexEl.innerHTML = renderIndexMarkup({ posts, categories })

  indexEl.hidden = false
  if (loadingEl) loadingEl.hidden = true

  initFilters(posts)
  initBlogSubscribe()
  initReveal()
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
          note.textContent = 'Something went wrong - please try again.'
          note.style.color = '#b91c1c'
          return
        }
      } catch (err) {
        console.error('[Execora] Blog subscribe save failed:', err)
        note.textContent = 'Something went wrong - please try again.'
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
          if (note) note.textContent = 'Something went wrong - please try again.'
          return
        }
      } catch (err) {
        console.error('[Execora] Newsletter save failed:', err)
        if (note) note.textContent = 'Something went wrong - please try again.'
        return
      }
    }

    form.hidden = true
    if (success) success.hidden = false
    trackEvent('newsletter_subscribe')
  })
}

/* ---------- render: article ---------- */
async function fetchLatestPosts() {
  try {
    return await client.fetch(blogPostsQuery)
  } catch (err) {
    console.warn('[Execora] Sanity unavailable while loading related posts.', err)
    return []
  }
}

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

  const meta = articlePageMeta(post)
  const allPosts = await fetchLatestPosts()
  const markup = renderArticleMarkup(post, { includeAutoRelated: true, allPosts })

  // SEO
  document.title = meta.title
  setMetaProperty('og:title', meta.title)
  setMetaName('description', meta.description)
  setMetaProperty('og:description', meta.description)
  setMetaName('twitter:description', meta.description)
  setMetaName('twitter:title', meta.title)
  setMetaProperty('og:url', meta.url)
  setCanonical(meta.url)
  if (meta.image) {
    setMetaProperty('og:image', meta.image)
    setMetaName('twitter:image', meta.image)
  }
  setMetaName('author', post.author || 'Execora Editorial Team')
  if (meta.keywords) setMetaName('keywords', meta.keywords)
  setArticleJsonLd(post, meta)

  articleEl.innerHTML = markup

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
        <p class="blog-lead">The tip you're looking for doesn't exist or isn't published yet.</p>
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
  initCheckout()

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
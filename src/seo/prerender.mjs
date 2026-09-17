import { mkdir, readFile, writeFile, copyFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@sanity/client'
import {
  SANITY_PROJECT_ID,
  SANITY_DATASET,
  renderIndexMarkup,
  renderArticleMarkup,
  indexPageMeta,
  articlePageMeta,
  articleJsonLd,
  breadcrumbJsonLd,
  collectionJsonLd,
  headTags,
  robotsTxt,
} from './render.js'

/* ============================================================
   execora-prerender - static prerender for the blog.

   Runs at the end of `vite build`. Works on the already-built SPA
   shell (dist/blog.html):
    - dist/blog-shell.html  ← SPA fallback for unknown/new slugs
    - dist/blog/index.html  ← prerendered blog index (/blog)
    - dist/blog/<slug>.html ← prerendered article (/blog/<slug>)
    - dist/robots.txt

   The XML sitemap is served dynamically at /sitemap.xml by
   /api/sitemap.js (rewrite in vercel.json) so newly published and
   now-due future-dated posts appear without a redeploy. It is NOT
   written here, because Vercel serves static files before rewrites
   and a static sitemap.xml would shadow the dynamic route.

   Vercel serves the filesystem before any rewrite, so each URL with a
   generated file is served directly; any other /blog/<slug> falls back
   to the client-rendered shell (matching production vercel.json).

   If Sanity is unreachable at build time the build degrades gracefully:
   it keeps the SPA shell behaviour and still writes robots.txt.
   ============================================================ */

// Every field needed to render a page at build time (mirrors what the
// client queries, plus _updatedAt for lastmod and asset dimensions).
const prerenderQuery = `
  *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()]
  | order(publishedDate desc){
    _id,
    _updatedAt,
    title,
    slug,
    category,
    excerpt,
    publishedDate,
    readingTime,
    author,
    seoTitle,
    seoDescription,
    primaryKeyword,
    secondaryKeywords,
    contentCluster,
    image {
      ...,
      asset-> {
        _id,
        metadata { dimensions { width, height } }
      }
    },
    body[]{
      ...,
      "imageDims": image.asset->.metadata.dimensions,
      markDefs[]{
        ...,
        _type == "link" => { "href": @.href }
      }
    },
    relatedLinks,
    externalSources
  }
`

const STRIP_TAGS = [
  /<meta[^>]*\bname="description"[^>]*\/?>/,
  /<meta[^>]*\bproperty="og:description"[^>]*\/?>/,
  /<meta[^>]*\bproperty="og:url"[^>]*\/?>/,
  /<meta[^>]*\bproperty="og:title"[^>]*\/?>/,
  /<meta[^>]*\bname="twitter:card"[^>]*\/?>/,
]

/**
 * Inject a full, unique <head> and prerendered content into the built SPA
 * shell. All other markup (nav, footer, checkout modal, built asset tags)
 * is kept verbatim so the client bundle still boots and hydrates.
 */
function transformShell(shell, { meta, markup, container, jsonLdScripts }) {
  const headEnd = shell.indexOf('</head>')
  let head = shell.slice(0, headEnd)

  // Remove the default shell tags we replace per-page.
  head = head.replace(/<title>[^<]*<\/title>/, '')
  for (const re of STRIP_TAGS) head = head.replace(re, '')
  head += `\n    ${headTags(meta, jsonLdScripts)}\n  </head>`

  let body = shell.slice(headEnd)

  // Strip the loading placeholder and the <noscript> fallback (which today
  // contributes an extra H1 on every blog page).
  body = body.replace(/\s*<!-- Loading state -->\s*<div id="blog-loading"[^>]*>[\s\S]*?<\/div>\s*/, '')
  body = body.replace(/\s*<noscript>[\s\S]*?<\/noscript>\s*/, '')

  if (container === 'index') {
    body = body.replace(
      /<div id="blog-index" class="blog-page" hidden><\/div>/,
      `<div id="blog-index" class="blog-page">${markup}</div>`
    )
  } else {
    body = body.replace(
      /<article id="blog-article" class="blog-article" hidden><\/article>/,
      `<article id="blog-article" class="blog-article">${markup}</article>`
    )
  }

  return head + body
}

export function prerenderPlugin() {
  return {
    name: 'execora-prerender',
    apply: 'build',
    async writeBundle(outputOptions) {
      const outDir = path.resolve(outputOptions.dir || 'dist')
      const blogDir = path.join(outDir, 'blog')
      const shellPath = path.join(outDir, 'blog.html')
      const shell = await readFile(shellPath, 'utf8').catch(() => null)

      if (!shell) {
        this.warn('[execora-prerender] Built blog.html not found - skipping prerender.')
        return
      }

      await mkdir(blogDir, { recursive: true })

      // SPA fallback shell for slugs that are not prerendered.
      await copyFile(shellPath, path.join(outDir, 'blog-shell.html'))

      // Remove the original blog.html entry: leaving both `blog.html` and
      // `blog/index.html` makes Vercel's `/blog` resolution ambiguous
      // (cleanUrl expansion vs directory index). With the shell saved above,
      // the prerendered `blog/index.html` is the only `/blog` target and any
      // `/blog.html` request redirects via cleanUrls.
      await unlink(shellPath).catch(() => {})

      let posts = []
      try {
        const client = createClient({
          projectId: SANITY_PROJECT_ID,
          dataset: SANITY_DATASET,
          apiVersion: '2026-08-31',
          useCdn: false,
          maxRetries: 1,
        })
        posts = await client.fetch(prerenderQuery)
      } catch (err) {
        this.warn(
          `[execora-prerender] Sanity unavailable (${err.message}) - keeping SPA fallback for blog pages.`
        )
      }

      if (posts.length) {
        const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))]

        const indexMeta = indexPageMeta()
        const indexHtml = transformShell(shell, {
          meta: indexMeta,
          markup: renderIndexMarkup({ posts, categories }),
          container: 'index',
          jsonLdScripts: [{ json: collectionJsonLd(posts) }],
        })
        await writeFile(path.join(blogDir, 'index.html'), indexHtml)

        for (const post of posts) {
          const meta = articlePageMeta(post)
          const articleHtml = transformShell(shell, {
            meta,
            markup: renderArticleMarkup(post, { includeAutoRelated: true, allPosts: posts }),
            container: 'article',
            jsonLdScripts: [
              { json: articleJsonLd(post, meta), attrs: 'data-article-jsonld' },
              { json: breadcrumbJsonLd(post) },
            ],
          })
          await writeFile(path.join(blogDir, `${post.slug.current}.html`), articleHtml)
        }

        await writeFile(path.join(outDir, 'robots.txt'), robotsTxt())
        this.info(`[execora-prerender] Wrote robots.txt (sitemap served dynamically by /api/sitemap).`)
      } else {
        this.warn('[execora-prerender] No published posts returned - sitemap omitted.')
      }

      await writeFile(path.join(outDir, 'robots.txt'), robotsTxt())
    },
  }
}
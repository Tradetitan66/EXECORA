import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { prerenderPlugin } from './src/seo/prerender.mjs'

export default defineConfig({
  // Expose env vars prefixed NEXT_PUBLIC_ (and standard VITE_) to client code,
  // so import.meta.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK is available at build time.
  envPrefix: ['NEXT_PUBLIC_', 'VITE_'],
  plugins: [
    // In dev, rewrite /blog and /blog/<slug> to blog.html (matches the Vercel
    // rewrites used in production for the Sanity-driven blog routes).
    {
      name: 'rewrite-blog-routes',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0]
          if (url === '/term' || url === '/terms' || url === '/terms/') {
            req.url = '/terms.html'
          } else if (url === '/contact' || url === '/contact/') {
            req.url = '/contact.html'
          } else if (url === '/welcome' || url === '/welcome/') {
            req.url = '/welcome.html'
          } else if (url === '/blog' || url === '/blog/' || url.startsWith('/blog/')) {
            req.url = '/blog.html'
          } else if (url === '/admin' || url === '/admin/' || url.startsWith('/admin/')) {
            // /admin redirects to the standalone Sanity Studio in production
            // (vercel.json). In dev we serve a short notice instead of letting
            // Vite fall through to the homepage.
            res.statusCode = 302
            res.setHeader('Location', 'https://execora.sanity.studio')
            res.end()
            return
          }
          next()
        })
      },
    },
    // In dev only, mock the Vercel serverless functions the £5 checkout flow
    // depends on (/api/create-checkout, /api/session-info). This lets the full
    // modal -> redirect -> thank-you journey be demoed with a plain `npm run dev`
    // without Stripe. The production build never includes this plugin.
    {
      name: 'mock-api-middleware',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0]

          // Mirror the production /pay/{plan} redirects to the Stripe Payment
          // Links so the Subscribe buttons work in local dev too.
          const payRedirects = {
            '/pay/essential': 'https://buy.stripe.com/eVq9AS0Tm17T93NcaO6Vq05',
            '/pay/growth': 'https://buy.stripe.com/14AfZgeKc4k56VF1wa6Vq06',
          }
          if (Object.prototype.hasOwnProperty.call(payRedirects, url)) {
            res.statusCode = 308
            res.setHeader('Location', payRedirects[url])
            res.end()
            return
          }

          if (url !== '/api/create-checkout' && url !== '/api/session-info') {
            if (url.startsWith('/api/')) {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Not found in dev - run `vercel dev` for real serverless functions' }))
              return
            }
            next()
            return
          }
          // Collect the request body so the session-info mock can vary its
          // response by session id (for local /welcome demos).
          const chunks = []
          req.on('data', (chunk) => chunks.push(chunk))
          req.on('end', () => {
            console.info(
              `[Execora] Mocked ${req.method} ${url} in local dev - no real payment was taken.`
            )
            res.setHeader('Content-Type', 'application/json')
            let payload
            if (url === '/api/create-checkout') {
              payload = { url: '/thank-you?session_id=demo_local_mock' }
            } else {
              let sessionId = ''
              try {
                sessionId = JSON.parse(Buffer.concat(chunks).toString() || '{}').session_id || ''
              } catch {
                sessionId = ''
              }
              // A session id containing "growth"/"59" demos the £59 plan.
              const isGrowth = /growth|5900|59/.test(sessionId)
              payload = {
                payment_intent: isGrowth ? 'pi_demo_growth' : 'pi_demo_essential',
                mode: 'subscription',
                status: 'complete',
                amount: isGrowth ? 5900 : 3900,
                currency: 'gbp',
                subscription: isGrowth ? 'sub_demo_growth' : 'sub_demo_essential',
                customer: isGrowth ? 'cus_demo_growth' : 'cus_demo_essential',
              }
            }
            res.end(JSON.stringify(payload))
          })
        })
      },
    },
    // Static prerender the blog (index + every published article) into
    // dist/blog/*.html during `vite build`, plus sitemap.xml/robots.txt.
    // Falls back to the SPA shell behaviour when Sanity is unreachable.
    prerenderPlugin(),
  ],
  server: {
    open: false,
    port: 5173,
    // In dev we route Sanity API calls through the Vite dev server so they are
    // same-origin, avoiding CORS blocks on whichever localhost port is in use.
    // src/sanity/client.js rewrites the API host to /sanity-api in DEV.
    proxy: {
      '/sanity-api': {
        target: 'https://p0mpfgmr.api.sanity.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sanity-api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'thank-you': fileURLToPath(new URL('./thank-you.html', import.meta.url)),
        blog: fileURLToPath(new URL('./blog.html', import.meta.url)),
        contact: fileURLToPath(new URL('./contact.html', import.meta.url)),
        terms: fileURLToPath(new URL('./terms.html', import.meta.url)),
        welcome: fileURLToPath(new URL('./welcome.html', import.meta.url))
      }
    }
  }
})

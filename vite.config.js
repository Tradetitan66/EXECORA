import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

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
          if (url === '/blog' || url === '/blog/' || url.startsWith('/blog/')) {
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
          // Drain the request body (unused by the mock) so the stream closes cleanly.
          req.on('data', () => {})
          req.on('end', () => {
            console.info(
              `[Execora] Mocked ${req.method} ${url} in local dev - no real payment was taken.`
            )
            res.setHeader('Content-Type', 'application/json')
            const payload =
              url === '/api/create-checkout'
                ? { url: '/thank-you?session_id=demo_local_mock' }
                : { payment_intent: 'demo_local_mock' }
            res.end(JSON.stringify(payload))
          })
        })
      },
    },
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
        blog: fileURLToPath(new URL('./blog.html', import.meta.url))
      }
    }
  }
})

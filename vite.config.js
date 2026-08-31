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
  ],
  server: {
    open: false,
    port: 5173
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

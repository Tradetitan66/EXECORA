import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  // Expose env vars prefixed NEXT_PUBLIC_ (and standard VITE_) to client code,
  // so import.meta.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK is available at build time.
  envPrefix: ['NEXT_PUBLIC_', 'VITE_'],
  server: {
    open: false,
    port: 5173
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'thank-you': fileURLToPath(new URL('./thank-you.html', import.meta.url))
      }
    }
  }
})

import { createClient } from '@sanity/client'
import { createImageUrlBuilder } from '@sanity/image-url'

/**
 * Execora - Sanity client (client-side, real-time).
 *
 * Reads published (and draft) content from the Sanity Content Lake.
 * Uses the CDN for fast cached reads and falls back gracefully when
 * Sanity is unreachable (pages keep their hard-coded copy).
 */

export const sanityProjectId =
  import.meta.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'p0mpfgmr'

export const sanityDataset =
  import.meta.env.NEXT_PUBLIC_SANITY_DATASET || 'production'

export const client = createClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  apiVersion: '2026-08-31',
  useCdn: false,
  maxRetries: 1,
})

/**
 * Dev-only CORS workaround.
 * @sanity/client requests the absolute API host (https://<projectId>.api.sanity.io),
 * which the browser blocks via CORS unless that localhost port is whitelisted.
 * In dev we rewrite the host to the same-origin Vite proxy path (/sanity-api),
 * so any localhost port works without touching the Sanity CORS settings.
 */
if (import.meta.env.DEV) {
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init) => {
    const apiHost = `https://${sanityProjectId}.api.sanity.io`
    let url = input
    if (typeof input === 'string' && input.startsWith(apiHost)) {
      url = `/sanity-api${input.slice(apiHost.length)}`
    } else if (input instanceof URL && input.href.startsWith(apiHost)) {
      url = input.href.replace(apiHost, '/sanity-api')
    }
    return realFetch(url, init)
  }
}

/**
 * Build an image URL for a Sanity image asset.
 * Returns null when no image is present.
 */
const builder = createImageUrlBuilder(client)

export function imageUrlFor(source) {
  if (!source || !source.asset) return null
  return builder.image(source)
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

export function isSanityConfigured() {
  return Boolean(
    import.meta.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
      import.meta.env.NEXT_PUBLIC_SANITY_DATASET
  )
}

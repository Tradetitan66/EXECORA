// Portable Text → HTML renderer for article bodies.
// Shared implementation lives in src/seo/render.js so the client renderer
// and the static prerender produce identical markup.
export { portableTextToHtml } from '../seo/render.js'
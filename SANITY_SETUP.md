# Sanity CMS — Execora Setup Guide

This integrates **Sanity CMS** into the Execora website. Content is authored in a
standalone Sanity Studio and shown live on the site (client-side, real-time).

> ⚠️ **Web framework note:** This is a **vanilla Vite** static multi-page site, not
> Next.js. It has no `web/` app and no `studio/` + `web/` monorepo. The Studio
> lives in `studio/` and the public site stays at the repo root. The frontend
> integration uses the official `@sanity/client` (the same Sanity backend and API
> used by Next.js projects — just without the React/Next wrappers).

---

## 1. What was added / changed

| File | Purpose |
|------|---------|
| `studio/` | Standalone Sanity Studio (config, schema, structure) |
| `studio/package.json` | Studio dependencies + scripts (`sanity dev`, `sanity deploy`) |
| `studio/sanity.config.ts` | Studio config (project `p0mpfgmr`, dataset `production`) |
| `studio/sanity.cli.ts` | CLI config |
| `studio/structure.ts` | Simple client-friendly sidebar (Blog posts + Site settings) |
| `studio/schemaTypes/blogPost.ts` | Blog schema (**one featured image per post**) |
| `studio/schemaTypes/siteSettings.ts` | Editable homepage/footer strings (singleton) |
| `src/sanity/client.js` | Sanity client + image URL builder (client-side) |
| `src/sanity/queries.js` | GROQ queries for settings + blog |
| `src/sanity/site.js` | Homepage text hydration (falls back to hard-coded copy) |
| `src/sanity/portable.js` | Portable Text → HTML renderer for article bodies |
| `src/main.js` | Calls `hydrateHomepage()` |
| `blog.html` | Blog page (index + article, rendered client-side) |
| `src/blog.js` | Blog controller (routes, index grid, article view, SEO) |
| `src/blog.css` | Editorial blog styles (matches brand) |
| `index.html` | Added **Blog** link to footer |
| `vite.config.js` | Added `blog` build input + dev-server `/blog` rewrite |
| `vercel.json` | `/blog` + `/blog/:slug*` rewrites + `/admin` redirect to Sanity Studio |
| `.env.example` / `.env` | Added Sanity env vars |
| `.gitignore` | Ignores `.sanity/` and `studio/dist` |

**Unchanged:** existing site design, styling, animations, URLs, SEO, enquiry
form / Google Sheets / Stripe flows, and `thank-you.html`.

---

## 2. Environment variables

All Sanity values are **public-safe** (no secrets). No API token is required for
public, client-side reads.

```
NEXT_PUBLIC_SANITY_PROJECT_ID=p0mpfgmr
NEXT_PUBLIC_SANITY_DATASET=production
```

There is **no** `SANITY_API_READ_TOKEN`; it is only needed if the dataset is made
private (not the case here).

The Studio reads the same project via fallback defaults in
`studio/sanity.config.ts` / `studio/sanity.cli.ts` (`p0mpfgmr` / `production`).
To override, export `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET`.

---

## 3. One-time Sanity setup (needs the project owner's login)

These steps require your authenticated Sanity account. Run from the repo root.

**a. Log in**

```bash
npx sanity@latest login
```

**b. Allow the site to read content (CORS).** Without this, the browser blocks
the requests. Add your dev + production origins:

```bash
npx sanity cors add http://localhost:5173 --project p0mpfgmr
npx sanity cors add https://www.execora.work --project p0mpfgmr
npx sanity cors add https://execora.work --project p0mpfgmr
```

**c. Deploy the Studio** so you and the client can edit content:

```bash
cd studio
npx sanity deploy   # publishes to e.g. https://<your-studio>.sanity.studio
```

**d. (Optional) Seed a Starter/site first.** Either add a "Site settings"
document in the Studio, or run the CLI after login.

---

## 4. Vercel deployment

The existing Vercel project (`execora.work`) is unchanged. Set the two public env
vars in **Vercel → Project → Settings → Environment Variables**:

- `NEXT_PUBLIC_SANITY_PROJECT_ID=p0mpfgmr`
- `NEXT_PUBLIC_SANITY_DATASET=production`

Also add the production URL to the Sanity **CORS** list (step 3b) so published
requests aren't blocked.

Deploy as normal (`git push`). The blog routes (`/blog`, `/blog/<slug>`) are
handled by the rewrites in `vercel.json`.

---

## 5. How to invite the client as an authorized Sanity user

1. Open **sanity.io/manage → p0mpfgmr → Project → Members**.
2. **Invite member**, enter the client's email.
3. Choose role **Editor** (can create/edit/publish content, cannot change
   project settings). Keep **Administrator** for your own account only.

Only invited, signed-in users can open the Studio and edit content
(Sanity handles authentication — no custom login needed).

---

## 6. How the client accesses /admin

The Studio is kept **standalone** (not mounted into the site bundle) and is
deployed to Sanity's hosting. Visiting `/admin` on `execora.work` **redirects**
to the Studio's own URL (via `vercel.json`), which requires the invited Sanity
login:

```
/admin  →  https://execora.sanity.studio   (302 redirect)
```

In local dev (`npm run dev`), `/admin` also redirects to the Studio URL. For a
full editing environment, run the Studio directly: `cd studio && npx sanity dev`.

**Set the redirect target:** the destination in `vercel.json` uses the hostname
chosen when you run `sanity deploy` inside `studio/` (e.g. `execora.sanity.studio`).
Update the `/admin` redirects there if your deployed hostname differs.

There is no public nav link to the CMS — access is by `/admin` (redirect) or the
Studio URL, plus authentication.

---

## 7. What the client can edit

**Blog posts** (`blogPost`) — create / edit / publish / unpublish:
- Title, slug, category, excerpt
- **Featured image (one per post)** + alt text, inline body images
- Published date, reading time (minutes)
- Rich-text body (headings, paragraphs, bullet/numbered lists, links, images)
- SEO title & SEO description (drives page title/meta for each article)

**Site settings** (`siteSettings`) — homepage/footer strings:
- Business name, hero eyebrow / title / rotating words / subtitle
- Primary call-to-action, contact heading/subtitle, footer tagline

Everything else (layout, design, animations, prices, FAQ text, form logic, SEO
structure) intentionally stays in code so the site's look and behavior are never
broken by content edits.

---

## 8. How to test the integration

1. `cd studio && npx sanity dev` — open the Studio, add a "Blog post" with an
   image and a "Site settings" document, then **Publish**.
2. In another terminal run the site: `npm run dev` → `http://localhost:5173/`.
3. The homepage text you set in "Site settings" appears; `/blog` lists the post;
   `/blog/<slug>` shows the article with its image.
4. Edit/publish in the Studio and refresh — the live (client-side) reads update
   the site.

**Offline / unconfigured fallback:** if Sanity is unreachable, missing, or CORS
isn't configured, the homepage keeps its original hard-coded copy and the blog
shows a graceful empty/"not found" state — nothing breaks.

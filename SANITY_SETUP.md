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

---

## 9. Blog draft endpoint — `POST /api/create-blog-draft`

A protected Vercel serverless function that lets you (or an automated caller)
create a **blog post as a draft** for manual review. It **never publishes** —
a human reviews and publishes it in Sanity Studio.

> ⚠️ The endpoint only creates **drafts**. It does not call any Sanity publish
> operation and it will never overwrite an existing draft or published article.

### Required Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and add to
your local `.env` for local testing). None of them are `NEXT_PUBLIC_`:

| Variable | Purpose |
|----------|---------|
| `SANITY_WRITE_TOKEN` | Sanity API token with **Editor** role — used to create draft documents |
| `BLOG_DRAFT_API_SECRET` | Secret the caller sends as `Authorization: Bearer <...>` to authenticate |

Public vars already required (also set in Vercel):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | `p0mpfgmr` |
| `NEXT_PUBLIC_SANITY_DATASET` | `production` |

### How to generate a secure `BLOG_DRAFT_API_SECRET`

```bash
openssl rand -hex 32
```

Add the output as `BLOG_DRAFT_API_SECRET` in Vercel. Store a copy somewhere
safe (e.g. your password manager) — the caller needs the same value.

### How to create the `SANITY_WRITE_TOKEN`

1. Open **sanity.io/manage → p0mpfgmr → API → Tokens**.
2. **Add API token**, give it a name (e.g. `Blog draft endpoint`).
3. Set the role to **Editor** (needed to `create` documents; less than
   Administrator).
4. Copy the token (shown only once) and set it as `SANITY_WRITE_TOKEN` in Vercel.

> Never put this token in a `NEXT_PUBLIC_` variable and never commit it.

### Sample request (placeholder credentials)

Replace `<BLOG_DRAFT_API_SECRET>` with your real secret before running:

```bash
curl -X POST https://www.execora.work/api/create-blog-draft \
  -H "Authorization: Bearer <BLOG_DRAFT_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "10 Website Tips for Local Businesses",
    "category": "Website Tips",
    "excerpt": "A short summary of the post.",
    "seoTitle": "10 Website Tips for Local Businesses",
    "seoDescription": "Practical website tips for local businesses.",
    "body": [
      { "style": "normal", "text": "Introductory paragraph." },
      { "style": "h2", "text": "Main section heading" },
      { "style": "normal", "text": "Section content." },
      { "style": "normal", "listItem": "bullet", "text": "Practical action." }
    ]
  }'
```

Supported payload fields:

- `title` (required), `slug` (optional, generated from title), `category`
  (required — one of `Website Tips`, `Local Business`, `Google & SEO`,
  `Customer Experience`, `Business Growth`), `excerpt` (required)
- `seoTitle` (required), `seoDescription` (required)
- `publishedDate` (optional, defaults to now), `readingTime` (optional,
  auto-calculated at ~220 wpm)
- `body` (required — array of Portable-Text-style blocks supporting `normal`,
  `h2`, `h3`, `blockquote`, bullet and numbered lists)
- `imageAssetId` (optional — reference to an existing Sanity image asset),
  `imageAlt` (optional alt text)

### Reviewing & publishing the draft

1. The endpoint creates a document with id `drafts.blogPost-<slug>`.
2. Open Sanity Studio (the `/admin` redirect or your `*.sanity.studio` URL).
3. Under **Blog posts** you'll see the draft (badged "Draft").
4. Edit / add images as needed, then click **Publish** to make it live on the
   site.
